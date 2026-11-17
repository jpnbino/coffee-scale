#Requires -Version 7.0
param([string]$Site,[ValidateRange(1024,65535)][int]$Port=8787)
$ErrorActionPreference='Stop'
if(-not $Site){
    $latest=Get-ChildItem -LiteralPath "$PSScriptRoot/build/releases" -Directory | Sort-Object Name -Descending | Where-Object {
        $manifest=Join-Path $_.FullName 'manifest.json'
        (Test-Path -LiteralPath $manifest) -and (Get-Content -LiteralPath $manifest -Raw | ConvertFrom-Json).status -eq 'prototype-build-complete'
    } | Select-Object -First 1
    if(-not $latest){throw 'No complete local build found. Run ./release.ps1 first.'}
    $Site=Join-Path $latest.FullName 'site'
}
$node=(Get-Command node -ErrorAction Stop).Source
& $node "$PSScriptRoot/tools/preview.mjs" ([IO.Path]::GetFullPath($Site)) $Port
if($LASTEXITCODE -ne 0){throw "Preview server exited with code $LASTEXITCODE"}
