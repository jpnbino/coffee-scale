#Requires -Version 7.0
$ErrorActionPreference='Stop'
Set-StrictMode -Version Latest
$root=Split-Path $PSScriptRoot
Import-Module "$root/tools/Release.Common.psm1" -Force -DisableNameChecking
$script:passed=0
function Check([string]$Name,[scriptblock]$Body){ & $Body; $script:passed++; Write-Host "PASS $Name" }
function Expect-Failure([scriptblock]$Body){$failed=$false;try{& $Body}catch{$failed=$true};if(-not $failed){throw 'Expected a rejected operation.'}}
function Assert($Condition,[string]$Message='Assertion failed'){if(-not $Condition){throw $Message}}
$erc=@{sheets=@(@{violations=@()})}
$drc=@{violations=@();unconnected_items=@();schematic_parity=@()}
Check 'Clean electrical reports pass' { Assert-CleanReports $erc $drc }
Check 'Missing report schema fails closed' { Expect-Failure {Assert-CleanReports @{} $drc} }
Check 'ERC issue blocks validation' { Expect-Failure {Assert-CleanReports @{sheets=@(@{violations=@(@{severity='error'})})} $drc} }
Check 'Unconnected items block validation' { Expect-Failure {Assert-CleanReports $erc @{violations=@();unconnected_items=@(@{type='unconnected_items'});schematic_parity=@()}} }
Check 'Schematic parity issues block validation' { Expect-Failure {Assert-CleanReports $erc @{violations=@();unconnected_items=@();schematic_parity=@(@{type='mismatch'})}} }
Check 'Decimal commas are normalized' { Assert ((ConvertTo-Millimetres '100,0000 mm') -eq 100) }
Check 'Output path traversal is rejected' { Expect-Failure {Resolve-ChildPath $root '../outside'} }
Check 'Absolute configured paths are rejected' { Expect-Failure {Resolve-ChildPath $root $root} }
Check 'Actual hardware revision matches the declared release' {Assert-HardwareRevision "$root/pico_scale_controller/pico_scale_controller.kicad_pcb" 'E'}
Check 'Wrong hardware revision is rejected' {Expect-Failure {Assert-HardwareRevision "$root/pico_scale_controller/pico_scale_controller.kicad_pcb" 'INCORRECT'}}
Check 'Validation-only cannot bypass strict assembly approval' {Expect-Failure {& "$root/release.ps1" -ValidateOnly -RequireAssemblyReady}}
Check 'Assembly strict gate rejects incomplete profiles' { Expect-Failure {Assert-AssemblyReady @{ready=$false;blockers=@('MPN missing')}} }
Check 'Assembly strict gate rejects contradictory readiness' { Expect-Failure {Assert-AssemblyReady @{ready=$true;blockers=@('Placement not reviewed')}} }
$fixture=Join-Path $root ('work/release-tests-'+[Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path "$fixture/design","$fixture/output/assembly" -Force | Out-Null
'original' | Set-Content -LiteralPath "$fixture/design/board.txt"
$config=@{inputFiles=@('board.txt');inputDirectories=@()}
$inventory=@(Get-DesignInventory "$fixture/design" $config)
Check 'Unchanged source inventory passes' {Assert-DesignUnchanged "$fixture/design" $config $inventory}
'changed' | Set-Content -LiteralPath "$fixture/design/board.txt"
Check 'Source change invalidates release' {Expect-Failure {Assert-DesignUnchanged "$fixture/design" $config $inventory}}
@'
<IPC-2581><Component refDes="R1" part="Resistor" packageRef="0603" layerRef="F.Cu"><Location x="10" y="-10"/></Component><Component refDes="H1" part="Hole" packageRef="Hole" layerRef="F.Cu"><Location x="5" y="-5"/></Component></IPC-2581>
'@ | Set-Content -LiteralPath "$fixture/output/assembly/board.ipc2581.xml"
@'
Reference,Value,Footprint,Manufacturer,MPN,Datasheet,DNP,EXCLUDE_FROM_BOM
R1,10k,0603,,,,,
'@ | Set-Content -LiteralPath "$fixture/output/assembly/bom-native.csv"
@'
Ref,Val,Package,PosX,PosY,Rot,Side
R1,10k,0603,10,-10,0,top
'@ | Set-Content -LiteralPath "$fixture/output/assembly/positions-native.csv"
$header='Reference,Stage,Manufacturer,MPN,Supplier,SupplierPart,RotationOffsetDeg,Verified,Notes'
@($header,'H1,mechanical,,,,,0,false,Mounting feature') | Set-Content -LiteralPath "$fixture/profile.csv"
$assemblySettings=@{assembly=@{profile='profile.csv';target='test';placementReviewBoardSha256='old-board'}}
$readiness=& "$root/tools/Build-Assembly.ps1" -Root $fixture -Output "$fixture/output" -Settings $assemblySettings -BoardHash 'new-board'
Check 'Missing part selection and stale approval are blockers' { Assert (-not $readiness.ready);Assert ($readiness.blockers.Count -eq 3) }
@($header,'H1,mechanical,,,,,0,false,Mounting feature','R1,factory,Test Manufacturer,TEST-10K,Test Supplier,TEST-1,90,true,TEST FIXTURE ONLY') | Set-Content -LiteralPath "$fixture/profile.csv"
$assemblySettings.assembly.placementReviewBoardSha256='new-board'
$readiness=& "$root/tools/Build-Assembly.ps1" -Root $fixture -Output "$fixture/output" -Settings $assemblySettings -BoardHash 'new-board'
Check 'Reviewed fixture passes and applies rotation correction' {Assert $readiness.ready;Assert ((Import-Csv "$fixture/output/assembly/jlcpcb-cpl-CANDIDATE.csv").Rotation -eq '90')}
@($header,'H1,mechanical,,,,,0,false,Mounting feature','R1,factory,Test Manufacturer,TEST-10K,Test Supplier,TEST-1,-450,true,TEST FIXTURE ONLY') | Set-Content -LiteralPath "$fixture/profile.csv"
$readiness=& "$root/tools/Build-Assembly.ps1" -Root $fixture -Output "$fixture/output" -Settings $assemblySettings -BoardHash 'new-board'
Check 'Large negative rotation corrections normalize correctly' {Assert ((Import-Csv "$fixture/output/assembly/jlcpcb-cpl-CANDIDATE.csv").Rotation -eq '270')}
$lock=Read-JsonFile "$root/web/vendor/lock.json"
Check 'Vendored viewer checksums match their lock' {foreach($asset in $lock.assets){Assert ((Get-FileDigest "$root/web/vendor/$($asset.file)") -ceq $asset.sha256)}}
Get-ChildItem -LiteralPath "$root/tools" -Filter '*.ps1' | ForEach-Object {
    $parseErrors=$null;[Management.Automation.Language.Parser]::ParseFile($_.FullName,[ref]$null,[ref]$parseErrors) | Out-Null
    if($parseErrors.Count){throw ($parseErrors.Message -join '; ')}
}
Write-Host "$script:passed focused release checks passed. Disposable fixtures retained under $fixture."
