Set-StrictMode -Version Latest

function Resolve-ChildPath {
    param([string]$Root, [string]$Relative)
    if ([IO.Path]::IsPathRooted($Relative)) { throw "Expected relative path: $Relative" }
    $base = [IO.Path]::GetFullPath($Root).TrimEnd([IO.Path]::DirectorySeparatorChar)
    $path = [IO.Path]::GetFullPath((Join-Path $base $Relative))
    if (-not $path.StartsWith($base + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
        throw "Path escapes its root: $Relative"
    }
    return $path
}

function Read-JsonFile {
    param([string]$Path)
    return Get-Content -LiteralPath $Path -Raw | ConvertFrom-Json -AsHashtable
}

function Write-JsonFile {
    param([string]$Path, $Value)
    $Value | ConvertTo-Json -Depth 30 -EscapeHandling EscapeHtml | Set-Content -LiteralPath $Path -Encoding utf8
}

function Get-FileDigest {
    param([string]$Path)
    return (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()
}

function Get-DesignInventory {
    param([string]$Root, $Config)
    $files = @($Config.inputFiles | ForEach-Object { Get-Item -LiteralPath (Resolve-ChildPath $Root $_) })
    foreach ($directory in $Config.inputDirectories) {
        $files += @(Get-ChildItem -LiteralPath (Resolve-ChildPath $Root $directory) -File -Recurse)
    }
    foreach ($file in ($files | Sort-Object FullName)) {
        [ordered]@{ path = [IO.Path]::GetRelativePath($Root, $file.FullName).Replace('\', '/'); sha256 = Get-FileDigest $file.FullName }
    }
}

function Assert-DesignUnchanged {
    param([string]$Root, $Config, $Before)
    $after = @(Get-DesignInventory $Root $Config)
    if ((ConvertTo-Json -InputObject $Before -Compress) -cne (ConvertTo-Json -InputObject $after -Compress)) {
        throw 'Design changed during the build. These outputs must not be released; save and rebuild.'
    }
}

function Invoke-KiCad {
    param([string]$Cli, [string[]]$Arguments, [string]$Log)
    Write-Host ('  KiCad: ' + ($Arguments[0..([Math]::Min(2, $Arguments.Length - 1))] -join ' '))
    ('> kicad-cli ' + ($Arguments -join ' ')) | Add-Content -LiteralPath $Log
    & $Cli @Arguments 2>&1 | Out-File -LiteralPath $Log -Append -Encoding utf8
    if ($LASTEXITCODE -ne 0) {
        $tail = Get-Content -LiteralPath $Log -Tail 6
        throw "KiCad command failed ($LASTEXITCODE): $($Arguments -join ' ')`n$($tail -join "`n")"
    }
}

function ConvertTo-Millimetres {
    param($Value)
    $number = ([string]$Value -replace '\s*mm.*$', '').Trim().Replace(',', '.')
    return [double]::Parse($number, [Globalization.CultureInfo]::InvariantCulture)
}

function Assert-CleanReports {
    param($Erc, $Drc)
    if (-not $Erc.ContainsKey('sheets') -or -not $Drc.ContainsKey('violations') -or -not $Drc.ContainsKey('unconnected_items') -or -not $Drc.ContainsKey('schematic_parity')) {
        throw 'Validation report schema is missing required fields.'
    }
    $ercIssues = @($Erc.sheets | ForEach-Object { $_.violations })
    $drcIssues = @($Drc.violations) + @($Drc.unconnected_items) + @($Drc.schematic_parity)
    if ($ercIssues.Count -or $drcIssues.Count) { throw "Validation failed: $($ercIssues.Count) ERC and $($drcIssues.Count) PCB/parity issues." }
}

function Assert-AssemblyReady {
    param($Readiness)
    if ($Readiness.ready -ne $true -or @($Readiness.blockers).Count) {
        throw 'Assembly release blocked. See assembly/readiness.json.'
    }
}

function Get-BuildInventory {
    param([string]$Root, [string]$ConfigPath, $Config)
    $paths=@((Get-Item -LiteralPath $ConfigPath),(Get-Item -LiteralPath "$Root/release.ps1"),(Get-Item -LiteralPath (Resolve-ChildPath $Root $Config.assembly.profile)))
    foreach($directory in @('tools',$Config.documentationDirectory,$Config.siteDirectory)) {
        $paths += @(Get-ChildItem -LiteralPath (Resolve-ChildPath $Root $directory) -File -Recurse)
    }
    foreach($version in $Config.history){
        $project=Resolve-ChildPath $Root $version.projectDirectory
        $release=Resolve-ChildPath $Root $version.releaseDirectory
        foreach($name in $Config.inputFiles){if(Test-Path -LiteralPath "$project/$name"){$paths+=Get-Item -LiteralPath "$project/$name"}}
        foreach($directory in $Config.inputDirectories){$paths+=@(Get-ChildItem -LiteralPath "$project/$directory" -File -Recurse)}
        $paths+=Get-Item -LiteralPath "$release/manifest.json"
        $paths+=@(Get-ChildItem -LiteralPath "$release/gerbers" -File)
    }
    foreach($file in ($paths | Sort-Object FullName -Unique)) {
        [ordered]@{path=[IO.Path]::GetRelativePath($Root,$file.FullName).Replace('\','/');sha256=Get-FileDigest $file.FullName}
    }
}

function Initialize-KiCadRuntime {
    param([string]$Runtime, [string]$Cli, [int]$Major)
    $versionDirectory = Join-Path $Runtime "$Major.0"
    New-Item -ItemType Directory -Force -Path $versionDirectory | Out-Null
    $template = [IO.Path]::GetFullPath((Join-Path (Split-Path $Cli) '../share/kicad/template'))
    foreach ($kind in @('fp', 'sym')) {
        $table = Join-Path $template "$kind-lib-table"
        if (-not (Test-Path -LiteralPath $table)) { throw "Missing installed KiCad library table: $table" }
        $uri = $table.Replace('\', '/')
        $content = "(${kind}_lib_table (version 7) (lib (name `"KiCad`") (type `"Table`") (uri `"$uri`") (options `"`")))"
        $content | Set-Content -LiteralPath (Join-Path $versionDirectory "$kind-lib-table") -Encoding utf8
    }
}

function Assert-BoardDimensions {
    param($Statistics, $Config)
    if (-not $Statistics.board.has_outline) { throw 'The board outline is missing.' }
    foreach ($pair in @(@('width', 'widthMm'), @('height', 'heightMm'), @('board_thickness', 'thicknessMm'))) {
        $actual = ConvertTo-Millimetres $Statistics.board[$pair[0]]
        if ([Math]::Abs($actual - $Config.manufacturing[$pair[1]]) -gt 0.01) {
            throw "Board $($pair[0]) differs from release.json. Review the mechanical/manufacturing configuration."
        }
    }
}

function Assert-HardwareRevision {
    param([string]$Board,[string]$Expected)
    $content=Get-Content -LiteralPath $Board -Raw
    $block=[regex]::Match($content,'(?ms)\(title_block\b(?<body>.*?)^\s*\)')
    $revision=[regex]::Match($block.Groups['body'].Value,'\(rev\s+"(?<value>(?:\\.|[^"\\])*)"\)')
    if(-not $revision.Success -or $revision.Groups['value'].Value -notmatch ('^'+[regex]::Escape($Expected)+'(?:\s|$)')) {
        throw 'Hardware revision in release.json does not match the PCB title block.'
    }
}

Export-ModuleMember -Function *
