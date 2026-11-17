#Requires -Version 7.0
[CmdletBinding()]
param(
    [string]$Config = (Join-Path $PSScriptRoot 'release.json'),
    [string]$KiCadCli,
    [switch]$ValidateOnly,
    [switch]$RequireAssemblyReady
)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
if ($ValidateOnly -and $RequireAssemblyReady) { throw 'ValidateOnly and RequireAssemblyReady cannot be combined.' }
Import-Module (Join-Path $PSScriptRoot 'tools/Release.Common.psm1') -Force -DisableNameChecking
$settings = Read-JsonFile $Config
if ($settings.schemaVersion -ne 1) { throw 'Unsupported release configuration schema.' }
$root = $PSScriptRoot
$source = Resolve-ChildPath $root $settings.project.sourceDirectory
if (-not $KiCadCli) {
    $found = Get-Command kicad-cli -ErrorAction SilentlyContinue
    $KiCadCli = if ($found) { $found.Source } else { "C:/Program Files/KiCad/$($settings.project.kicadMajor).0/bin/kicad-cli.exe" }
}
$KiCadCli = (Get-Item -LiteralPath $KiCadCli).FullName
$before = @(Get-DesignInventory $source $settings)
$buildInputs = @(Get-BuildInventory $root $Config $settings)
$pcbName = "$($settings.project.basename).kicad_pcb"
$pcbHash = ($before | Where-Object path -eq $pcbName).sha256
$buildId = "$($settings.project.revision)-$([DateTime]::UtcNow.ToString('yyyyMMddTHHmmssfffZ'))-$($pcbHash.Substring(0,8))"
$output = Resolve-ChildPath $root "$($settings.outputDirectory)/$buildId"
if (Test-Path -LiteralPath $output) { throw 'Refusing to overwrite an existing build.' }
$snapshot = Join-Path $output 'source'
foreach ($directory in @('source', 'reports', '.runtime', 'fabrication/gerbers', 'assembly', 'mechanical', 'site')) {
    New-Item -ItemType Directory -Force -Path (Join-Path $output $directory) | Out-Null
}
foreach ($item in $before) {
    $destination = Resolve-ChildPath $snapshot $item.path
    New-Item -ItemType Directory -Force -Path (Split-Path $destination) | Out-Null
    Copy-Item -LiteralPath (Resolve-ChildPath $source $item.path) -Destination $destination
}
Copy-Item -LiteralPath $Config -Destination (Join-Path $output 'release-config.json')
$log = Join-Path $output 'reports/build.log'
$manifest = [ordered]@{
    schemaVersion = 1; buildId = $buildId; project = $settings.project.name
    hardwareRevision = $settings.project.revision; generatedUtc = [DateTime]::UtcNow.ToString('o')
    kicadVersion = $null; status = 'building'; prototypeHardware = $true
    inputDesignFiles = $before; originalDesignUnchanged = $false
    buildInputs = $buildInputs
}
$oldConfig = $env:KICAD_CONFIG_HOME; $oldDocuments = $env:KICAD_DOCUMENTS_HOME
try {
    Write-Host "Building $buildId from an isolated design snapshot."
    Initialize-KiCadRuntime (Join-Path $output '.runtime/config') $KiCadCli $settings.project.kicadMajor
    $env:KICAD_CONFIG_HOME = Join-Path $output '.runtime/config'
    $env:KICAD_DOCUMENTS_HOME = Join-Path $output '.runtime/documents'
    New-Item -ItemType Directory -Force -Path $env:KICAD_DOCUMENTS_HOME | Out-Null
    $version = (& $KiCadCli version 2>> $log | Out-String).Trim()
    if ($LASTEXITCODE -ne 0 -or $version -notmatch "^$($settings.project.kicadMajor)\.") { throw "Unsupported KiCad version: $version" }
    $manifest.kicadVersion = $version
    $pcb = Join-Path $snapshot $pcbName
    $sch = Join-Path $snapshot "$($settings.project.basename).kicad_sch"
    Assert-HardwareRevision $pcb $settings.project.revision
    Invoke-KiCad $KiCadCli @('sch','erc','--format','json','--exit-code-violations','--output',"$output/reports/erc.json",$sch) $log
    Invoke-KiCad $KiCadCli @('pcb','drc','--all-track-errors','--schematic-parity','--exit-code-violations','--format','json','--output',"$output/reports/drc.json",$pcb) $log
    Assert-CleanReports (Read-JsonFile "$output/reports/erc.json") (Read-JsonFile "$output/reports/drc.json")
    Invoke-KiCad $KiCadCli @('pcb','export','stats','--format','json','--units','mm','--output',"$output/reports/board-statistics.json",$pcb) $log
    Assert-BoardDimensions (Read-JsonFile "$output/reports/board-statistics.json") $settings
    $manifest.validation = @{ erc = 0; drc = 0; unconnected = 0; schematicParity = 0 }
    if (-not $ValidateOnly) {
        & "$root/tools/Export-Release.ps1" -Context @{ Root=$root; Output=$output; Config=$settings; Cli=$KiCadCli; Pcb=$pcb; Sch=$sch; Log=$log }
        $assembly = & "$root/tools/Build-Assembly.ps1" -Root $root -Output $output -Settings $settings -BoardHash $pcbHash
        $manifest.assembly = $assembly
        if ($RequireAssemblyReady) { Assert-AssemblyReady $assembly }
        & "$root/tools/Build-Review.ps1" -Root $root -Output $output -Settings $settings -BuildId $buildId -Cli $KiCadCli
        & "$root/tools/Build-Site.ps1" -Root $root -Output $output -Settings $settings -BuildId $buildId -Assembly $assembly
    }
    $manifest.status = if ($ValidateOnly) { 'validation-passed' } else { 'prototype-build-complete' }
    if (-not $ValidateOnly) {
        & "$root/tools/Complete-Release.ps1" -Output $output -Settings $settings
    }
    Assert-DesignUnchanged $source $settings $before
    if ((ConvertTo-Json -InputObject $buildInputs -Compress) -cne (ConvertTo-Json -InputObject @(Get-BuildInventory $root $Config $settings) -Compress)) {
        throw 'Build scripts, documentation, configuration or viewer assets changed during the build. Rebuild before release.'
    }
    $manifest.originalDesignUnchanged = $true
    $manifest.files = @(Get-ChildItem -LiteralPath $output -Recurse -File | Where-Object {
        $_.FullName -notmatch '[\\/]\.runtime[\\/]' -and $_.Name -ne 'manifest.json'
    } | Sort-Object FullName | ForEach-Object {
        @{ path=[IO.Path]::GetRelativePath($output,$_.FullName).Replace('\','/'); sha256=Get-FileDigest $_.FullName; bytes=$_.Length }
    })
    Write-JsonFile "$output/manifest.json" $manifest
    Write-Host "PASS: $($manifest.status)"
    Write-Host "OUTPUT: $output"
} catch {
    $manifest.status = 'failed'; $manifest.error = $_.Exception.Message
    Write-JsonFile "$output/manifest.json" $manifest
    throw
} finally {
    $env:KICAD_CONFIG_HOME = $oldConfig; $env:KICAD_DOCUMENTS_HOME = $oldDocuments
}
