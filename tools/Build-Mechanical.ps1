param([string]$Output,[hashtable]$Settings,[string]$Root)
[xml]$ipc=Get-Content -LiteralPath "$Output/assembly/board.ipc2581.xml" -Raw
$components=@($ipc.SelectNodes('//*[local-name()="Component"]'))
$origin=$Settings.mechanical.originAbsoluteMm
$rows=@(foreach($component in $components){
    $location=$component.SelectSingleNode('*[local-name()="Location"]')
    $transform=$component.SelectSingleNode('*[local-name()="Xform"]')
    $x=[double]::Parse($location.GetAttribute('x'),[Globalization.CultureInfo]::InvariantCulture)
    $y=[double]::Parse($location.GetAttribute('y'),[Globalization.CultureInfo]::InvariantCulture)
    [pscustomobject][ordered]@{Reference=$component.GetAttribute('refDes');Xmm=[Math]::Round($x-$origin[0],6);Ymm=[Math]::Round(-$y-$origin[1],6);IPC_Rotation=if($transform){$transform.GetAttribute('rotation')}else{'0'};IPC_Mirror=if($transform){$transform.GetAttribute('mirror')}else{'false'};Side=$component.GetAttribute('layerRef');Package=$component.GetAttribute('packageRef')}
})
$rows | Sort-Object Reference | Export-Csv -LiteralPath "$Output/mechanical/component-origins.csv" -NoTypeInformation -Encoding utf8
$sourceHash=Get-FileDigest "$Output/source/$($Settings.project.basename).kicad_pcb"
$reviewed=($sourceHash -ceq $Settings.mechanical.referenceBoardSha256)
$data=[ordered]@{units='mm';coordinateConvention='Top-left PCB outline; X right / Y down, top view';originAbsoluteMm=$origin;rotationConvention='IPC-2581 rotation with separate mirror flag; not a pick-and-place rotation';board=$Settings.manufacturing;componentOrigins=$rows;referenceReviewedForCurrentBoard=$reviewed;assumptions=$Settings.mechanical.assumptions}
Write-JsonFile "$Output/mechanical/interface.json" $data
Copy-Item -LiteralPath (Resolve-ChildPath $Root $Settings.mechanical.reference) -Destination "$Output/mechanical/enclosure-reference-PROVISIONAL.json"
$stats=Read-JsonFile "$Output/reports/board-statistics.json"
if($rows.Count -ne $stats.components.total.total){throw 'IPC-2581 component count differs from the board statistics.'}
$hole=$Settings.manufacturing.mountingHoleMm
$matching=@($stats.drill_holes | Where-Object { -not $_.plated -and [Math]::Abs((ConvertTo-Millimetres $_.x_size)-$hole) -lt .001 })
$holes=@($rows | Where-Object Reference -in @('H1','H2','H3','H4'))
if($holes.Count -ne 4 -or ($matching | Measure-Object count -Sum).Sum -ne 4){throw 'Expected four mounting-hole features were not found.'}
$dxf=[Collections.Generic.List[string]]::new()
@('0','SECTION','2','HEADER','9','$INSUNITS','70','4','0','ENDSEC','0','SECTION','2','ENTITIES') | ForEach-Object{$dxf.Add($_)}
foreach($h in $holes){@('0','CIRCLE','8','MOUNTING_HOLES','10',$h.Xmm.ToString([Globalization.CultureInfo]::InvariantCulture),'20',(-$h.Ymm).ToString([Globalization.CultureInfo]::InvariantCulture),'30','0','40',($hole/2).ToString([Globalization.CultureInfo]::InvariantCulture)) | ForEach-Object{$dxf.Add($_)}}
@('0','ENDSEC','0','EOF') | ForEach-Object{$dxf.Add($_)}
$dxf | Set-Content -LiteralPath "$Output/mechanical/mounting-holes-local.dxf" -Encoding ascii
@"
# Mechanical handoff

Populated and bare-board STEP: local XY origin at the top-left outline corner;
X right, Y up. Mounting-hole DXF uses the same local XY convention.
outline-absolute.dxf uses native absolute KiCad XY coordinates; translate by
(-$($origin[0]), +$($origin[1])) mm to align it with the STEP/hole DXF.
component-origins.csv and interface.json use X right, Y down for top-view drawings.
STEP Z follows KiCad export; inspect top and bottom clearances in your CAD tool.

Reference assumptions reviewed for current PCB hash: $reviewed.
The enclosure reference is PROVISIONAL; do not mistake its assumed display
height or missing socket/battery/load-cell envelopes for measured geometry.
"@ | Set-Content -LiteralPath "$Output/mechanical/README.md" -Encoding utf8
