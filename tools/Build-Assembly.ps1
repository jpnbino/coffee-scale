param([string]$Root, [string]$Output, [hashtable]$Settings, [string]$BoardHash)
[xml]$ipc=Get-Content -LiteralPath "$Output/assembly/board.ipc2581.xml" -Raw
$components=@($ipc.SelectNodes('//*[local-name()="Component"]'))
if(-not $components.Count){throw 'IPC-2581 contains no components; assembly cannot be generated.'}
$bom=@{}; Import-Csv -LiteralPath "$Output/assembly/bom-native.csv" | ForEach-Object { $bom[$_.Reference]=$_ }
$positions=@{}; Import-Csv -LiteralPath "$Output/assembly/positions-native.csv" | ForEach-Object { $positions[$_.Ref]=$_ }
$profile=@{}; Import-Csv -LiteralPath (Resolve-ChildPath $Root $Settings.assembly.profile) | ForEach-Object {
    if ($profile.ContainsKey($_.Reference)) { throw "Duplicate assembly profile reference: $($_.Reference)" }
    if ($_.Stage -notin @('factory','manual','mechanical','wire-pad','dnp')) { throw "Unknown assembly stage for $($_.Reference)" }
    $profile[$_.Reference]=$_
}
$boardRefs=@($components | ForEach-Object { $_.GetAttribute('refDes') })
foreach($ref in $profile.Keys){ if($ref -notin $boardRefs){ throw "Assembly profile contains absent reference: $ref" } }
$rows=@(); $candidate=@(); $issues=[Collections.Generic.List[string]]::new()
foreach ($component in $components) {
    $ref=$component.GetAttribute('refDes'); $item=$bom[$ref]; $override=$profile[$ref]; $position=$positions[$ref]
    $stage=if($override){$override.Stage}else{'factory'}
    if ($item -and $item.DNP -in @('1','true','yes')) { $stage='dnp' }
    $maker=if($override -and $override.Manufacturer){$override.Manufacturer}elseif($item){$item.Manufacturer}else{''}
    $mpn=if($override -and $override.MPN){$override.MPN}elseif($item){$item.MPN}else{''}
    $verified=($null -ne $override -and $override.Verified -eq 'true')
    $value=if($item){$item.Value}else{$component.GetAttribute('part')}
    $footprint=if($item){$item.Footprint}else{$component.GetAttribute('packageRef')}
    $row=[ordered]@{Reference=$ref;Value=$value;Footprint=$footprint;Quantity=1;Stage=$stage;Manufacturer=$maker;MPN=$mpn;Verified=$verified;Side=if($component.GetAttribute('layerRef') -eq 'B.Cu'){'bottom'}else{'top'};Notes=if($override){$override.Notes}else{'Needs part selection and assembly review'}}
    $rows += [pscustomobject]$row
    $rows[-1] | Add-Member -NotePropertyName Supplier -NotePropertyValue $(if($override){$override.Supplier}else{''})
    $rows[-1] | Add-Member -NotePropertyName SupplierPart -NotePropertyValue $(if($override){$override.SupplierPart}else{''})
    if ($stage -ne 'factory') { continue }
    if (-not $maker -or -not $mpn) { $issues.Add("${ref}: manufacturer/MPN missing") }
    if (-not $verified) { $issues.Add("${ref}: part and placement not reviewed") }
    if (-not $position) { $issues.Add("${ref}: native placement missing; manual review required"); continue }
    $offset=if($override -and $override.RotationOffsetDeg){[double]::Parse($override.RotationOffsetDeg,[Globalization.CultureInfo]::InvariantCulture)}else{0}
    $rotation=(([double]::Parse($position.Rot,[Globalization.CultureInfo]::InvariantCulture)+$offset)%360+360)%360
    $candidate += [pscustomobject][ordered]@{Designator=$ref;'Mid X'=$position.PosX;'Mid Y'=$position.PosY;Layer=if($position.Side -eq 'top'){'Top'}else{'Bottom'};Rotation=$rotation.ToString('0.######',[Globalization.CultureInfo]::InvariantCulture)}
}
if ($Settings.assembly.placementReviewBoardSha256 -cne $BoardHash) { $issues.Add('Placement review is not approved for this exact board checksum.') }
$rows | Sort-Object Reference | Export-Csv -LiteralPath "$Output/assembly/bom-with-stages.csv" -NoTypeInformation -Encoding utf8
$candidate | Sort-Object Designator | Export-Csv -LiteralPath "$Output/assembly/jlcpcb-cpl-CANDIDATE.csv" -NoTypeInformation -Encoding utf8
$readiness=[ordered]@{ready=($issues.Count -eq 0);target=$Settings.assembly.target;factoryParts=$candidate.Count;totalBoardFeatures=$rows.Count;blockers=@($issues);boardSha256=$BoardHash;nativePlacementConvention='KiCad absolute X/Y-up millimetres; origins/rotations require supplier verification'}
Write-JsonFile "$Output/assembly/readiness.json" $readiness
Write-Host "Assembly: $($candidate.Count) candidate placements; $($issues.Count) readiness blockers."
return $readiness
