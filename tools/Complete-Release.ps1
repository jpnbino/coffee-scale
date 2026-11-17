param([string]$Output,[hashtable]$Settings)
Add-Type -AssemblyName System.IO.Compression.FileSystem
$gerbers=@(Get-ChildItem -LiteralPath "$Output/fabrication/gerbers" -File)
foreach($extension in @('.gtl','.gbl','.gts','.gbs','.gto','.gbo','.gm1','.gbrjob')){
    if(@($gerbers | Where-Object Extension -eq $extension).Count -ne 1){throw "Missing or duplicate fabrication layer $extension"}
}
if(@($gerbers | Where-Object Extension -eq '.drl').Count -ne 2 -or $gerbers.Count -ne 10){throw 'Expected seven Gerber layers, job file and separate plated/non-plated drill files.'}
foreach($file in ($gerbers | Where-Object Extension -in @('.gtl','.gbl','.gts','.gbs','.gto','.gbo','.gm1'))){
    $content=Get-Content -LiteralPath $file.FullName -Raw
    if(-not $content.Contains('%MOMM*%') -or -not $content.TrimEnd().EndsWith('M02*')){throw "Invalid or incomplete Gerber: $($file.Name)"}
}
$job=Read-JsonFile ($gerbers | Where-Object Extension -eq '.gbrjob').FullName
if($job.GeneralSpecs.LayerNumber -ne $Settings.manufacturing.copperLayers -or [Math]::Abs($job.GeneralSpecs.BoardThickness-$Settings.manufacturing.thicknessMm) -gt .001){throw 'Gerber job stackup differs from manufacturing configuration.'}
@"
PCB fabrication: $($Settings.project.name), hardware revision $($Settings.project.revision).
$($Settings.manufacturing.material), $($Settings.manufacturing.copperLayers) layers,
$($Settings.manufacturing.widthMm) x $($Settings.manufacturing.heightMm) mm,
$($Settings.manufacturing.thicknessMm) mm thick, $($Settings.manufacturing.copperWeight) copper.
Mask: $($Settings.manufacturing.mask); silk: $($Settings.manufacturing.silkscreen); finish: $($Settings.manufacturing.finish).
Preserve separate PTH/NPTH drills and plated routed USB slots.
The fabrication ZIP contains manufacturing data only; no assembly is ordered.
Prototype hardware: electrical checks are not physical functional validation.
"@ | Set-Content -LiteralPath "$Output/fabrication/README.txt" -Encoding utf8
@"
ASSEMBLY DRAFT — NOT APPROVED FOR ORDERING
Consult readiness.json for missing part selections, sourcing and placement review.
Native coordinates are millimetres, absolute KiCad XY with Y up.
The JLCPCB CPL is a CANDIDATE: footprint origins/rotations require supplier review.
Positions-native.csv is not filtered to SMT only; assembly stages control selection.
Integral PCB pads and mounting-hole features are not purchased factory parts.
stencil/ contains top/bottom paste and outline Gerbers for stencil review.
The carrier does not include a separate BOM item for the off-board OLED module,
battery, load cell, socket strips, wiring, case or fasteners; procure these in
the final-instrument BOM. No firmware/calibration or functional acceptance is implied.
"@ | Set-Content -LiteralPath "$Output/assembly/README.txt" -Encoding utf8
$archives=@{'fabrication'='fabrication';'assembly-DRAFT'='assembly';'mechanical'='mechanical';'source'='source'}
foreach($name in $archives.Keys){
    $archive="$Output/site/files/$name.zip"
    [IO.Compression.ZipFile]::CreateFromDirectory("$Output/$($archives[$name])" + $(if($name -eq 'fabrication'){'/gerbers'}else{''}),$archive)
    $zip=[IO.Compression.ZipFile]::OpenRead($archive)
    try{
        if(-not $zip.Entries.Count){throw "Empty archive: $name"}
        foreach($entry in $zip.Entries){if($entry.Name){$stream=$entry.Open();try{$stream.CopyTo([IO.Stream]::Null)}finally{$stream.Dispose()}}}
    }finally{$zip.Dispose()}
}
# Fail on broken internal links, including files generated after the HTML page.
foreach($page in (Get-ChildItem -LiteralPath "$Output/site" -Filter '*.html')){
$html=Get-Content -LiteralPath $page.FullName -Raw
foreach($match in [regex]::Matches($html,'(?:href|src|data)="([^"#]+)"')){
    $link=$match.Groups[1].Value
    if($link -match '^[a-zA-Z]+:' -or $link.StartsWith('//')){continue}
    $local=$link.Split('#')[0].Split('?')[0]
    if(-not (Test-Path -LiteralPath (Resolve-ChildPath "$Output/site" $local))){throw "Broken site link: $link"}
}
}
Write-Host 'Archives and internal site links verified.'
$catalog=Read-JsonFile "$Output/site/review/catalog.json"
foreach($version in $catalog.versions){foreach($asset in $version.artifacts.Values){
    if($asset -and -not (Test-Path -LiteralPath (Resolve-ChildPath "$Output/site" $asset))){throw "Missing selected-revision artifact: $($version.id) / $asset"}
}
    $stackup=Read-JsonFile (Resolve-ChildPath "$Output/site" $version.artifacts.stackup)
    $native=Read-JsonFile (Resolve-ChildPath "$Output/site" $version.artifacts.nativeProvenance)
    $materials=Read-JsonFile (Resolve-ChildPath "$Output/site" $version.artifacts.modelMaterials)
    if($stackup.sourceSha256 -cne $version.boardSha256 -or $native.sourceSha256 -cne $version.schematicSha256){throw "Selected-revision provenance mismatch: $($version.id)"}
    if((Get-FileDigest (Resolve-ChildPath "$Output/site" $version.artifacts.model)) -cne $materials.sourceSha256){throw "Selected-revision 3D material map mismatch: $($version.id)"}
    if((Get-FileDigest (Resolve-ChildPath "$Output/site" $version.artifacts.native)) -cne $native.viewerSha256){throw "Selected-revision native schematic mismatch: $($version.id)"}
}
Write-Host 'Selected-revision artifact existence and provenance verified.'
