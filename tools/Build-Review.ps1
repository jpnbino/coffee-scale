param([string]$Root,[string]$Output,[hashtable]$Settings,[string]$BuildId,[string]$Cli)
$node=(Get-Command node -ErrorAction Stop).Source
$review="$Output/site/review"
New-Item -ItemType Directory -Force -Path $review | Out-Null
$log="$Output/reports/build.log"
$versions=[Collections.Generic.List[object]]::new()
$definitions=@($Settings.history)+@(@{id='current';label="Rev $($Settings.project.revision) · current build";projectDirectory=$null;releaseDirectory=$null})
foreach($definition in $definitions){
    if($definition.id -notmatch '^[a-zA-Z0-9-]+$'){throw 'Unsafe or invalid version ID.'}
    $id=$definition.id; $folder="$review/$id"
    New-Item -ItemType Directory -Force -Path "$folder/source","$folder/gerbers" | Out-Null
    if($id -eq 'current'){
        $project="$Output/source"; $gerbers="$Output/fabrication/gerbers"
        $statistics="$Output/reports/board-statistics.json"
        $nativePcb="$project/$($Settings.project.basename).kicad_pcb"
        $nativeSch="$project/$($Settings.project.basename).kicad_sch"
        $validation='Fresh current-build ERC/DRC/parity checks passed'
        Copy-Item -LiteralPath "$Output/site/pcb-top.svg","$Output/site/pcb-bottom.svg","$Output/site/schematic.pdf" -Destination $folder
    }else{
        $original=Resolve-ChildPath $Root $definition.projectDirectory
        $release=Resolve-ChildPath $Root $definition.releaseDirectory
        $manifest=Read-JsonFile "$release/manifest.json"
        $originalPcb="$original/$($Settings.project.basename).kicad_pcb"
        $originalSch="$original/$($Settings.project.basename).kicad_sch"
        if((Get-FileDigest $originalPcb) -cne $manifest.board_sha256 -or (Get-FileDigest $originalSch) -cne $manifest.schematic_sha256){throw "Historical source mismatch: $id"}
        $project="$Output/.runtime/history/$id"
        New-Item -ItemType Directory -Force -Path $project | Out-Null
        foreach($name in $Settings.inputFiles){if(Test-Path -LiteralPath "$original/$name"){Copy-Item -LiteralPath "$original/$name" -Destination $project}}
        foreach($directory in $Settings.inputDirectories){Copy-Item -LiteralPath "$original/$directory" -Destination "$project/$directory" -Recurse}
        $nativePcb="$project/$($Settings.project.basename).kicad_pcb"; $nativeSch="$project/$($Settings.project.basename).kicad_sch"
        $gerbers="$release/gerbers"; $statistics="$folder/statistics.json"
        foreach($name in $manifest.files.Keys){if((Get-FileDigest (Resolve-ChildPath $gerbers $name)) -cne $manifest.files[$name]){throw "Historical manufacturing file mismatch: $id / $name"}}
        Invoke-KiCad $Cli @('pcb','export','stats','--format','json','--units','mm','--output',$statistics,$nativePcb) $log
        foreach($side in @('top','bottom')){
            $face=if($side -eq 'top'){'F'}else{'B'}
            Invoke-KiCad $Cli @('pcb','export','svg','--layers',"$face.Cu,$face.SilkS,Edge.Cuts",'--mode-single','--fit-page-to-board','--exclude-drawing-sheet','--output',"$folder/pcb-$side.svg",$nativePcb) $log
        }
        Invoke-KiCad $Cli @('sch','export','pdf','--output',"$folder/schematic.pdf",$nativeSch) $log
        New-Item -ItemType Directory -Force -Path "$folder/schematic","$folder/mechanical" | Out-Null
        Invoke-KiCad $Cli @('sch','export','svg','--output',"$folder/schematic",$nativeSch) $log
        Invoke-KiCad $Cli @('pcb','render','--side','top','--width','1600','--height','1000','--quality','basic','--background','opaque','--use-board-stackup-colors','--output',"$folder/top.png",$nativePcb) $log
        Invoke-KiCad $Cli @('pcb','export','glb','--force','--subst-models','--include-silkscreen','--include-soldermask','--output',"$folder/board.glb",$nativePcb) $log
        foreach($kind in @('populated','bare-board')){
            $arguments=@('pcb','export','step','--force','--subst-models','--output',"$folder/mechanical/$kind.step")
            if($kind -eq 'bare-board'){$arguments+='--board-only'}
            Invoke-KiCad $Cli ($arguments+@($nativePcb)) $log
        }
        "Historical mechanical preview re-exported from verified $id sources with the current KiCad toolchain. STEP uses KiCad default origin (not the current release's custom origin). No historical mounting-hole coordinate report, assembly profile or fit approval is supplied. Inspect coordinate alignment before enclosure work." | Set-Content -LiteralPath "$folder/mechanical/README.md" -Encoding utf8
        & $node "$Root/tools/build-viewer-data.mjs" $folder $nativePcb $nativeSch
        if($LASTEXITCODE -ne 0){throw "Historical viewer data failed: $id"}
        Copy-Item -LiteralPath "$release/manifest.json" -Destination "$folder/historical-validation.json"
        $validation='Historical validation record; source/manufacturing hashes verified. Review drawings re-rendered with current toolchain.'
    }
    Copy-Item -LiteralPath $nativePcb,$nativeSch -Destination "$folder/source"
    if($statistics -ne "$folder/statistics.json"){Copy-Item -LiteralPath $statistics -Destination "$folder/statistics.json"}
    Copy-Item -Path "$gerbers/*" -Destination "$folder/gerbers"
    & $node "$Root/tools/board-data.mjs" $nativePcb "$folder/board.json"
    if($LASTEXITCODE -ne 0){throw "Board metadata failed: $id"}
    & $node "$Root/tools/render-gerbers.mjs" $gerbers "$folder/rendered" $id
    if($LASTEXITCODE -ne 0){throw "Gerber conversion failed: $id"}
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    [IO.Compression.ZipFile]::CreateFromDirectory("$folder/gerbers","$folder/fabrication.zip")
    if($id -ne 'current'){
        [IO.Compression.ZipFile]::CreateFromDirectory($project,"$folder/source.zip")
        [IO.Compression.ZipFile]::CreateFromDirectory("$folder/mechanical","$folder/mechanical.zip")
    }
    $assetBase=if($id -eq 'current'){''}else{"review/$id/"}
    $svgFolder=if($id -eq 'current'){"$Output/site/schematic"}else{"$folder/schematic"}
    $schematicSvg=@(Get-ChildItem -LiteralPath $svgFolder -Filter '*.svg' | Sort-Object Name)[0].Name
    $artifacts=@{pcbTop="${assetBase}pcb-top.svg";pcbBottom="${assetBase}pcb-bottom.svg";schematicSvg="${assetBase}schematic/$schematicSvg";schematicPdf="${assetBase}schematic.pdf";model="${assetBase}board.glb";modelMaterials="${assetBase}model-materials.json";hero="${assetBase}top.png";stackup="${assetBase}stackup.json";native="${assetBase}native/schematic.kicad_sch";nativeProvenance="${assetBase}native/provenance.json";fabrication="review/$id/fabrication.zip"}
    if($id -eq 'current'){
        $artifacts.source='files/source.zip';$artifacts.mechanical='files/mechanical.zip';$artifacts.mechanicalGuide='files/mechanical/README.md';$artifacts.assembly='files/assembly-DRAFT.zip';$artifacts.validation='files/validation.json'
    }else{
        $artifacts.source="review/$id/source.zip";$artifacts.mechanical="review/$id/mechanical.zip";$artifacts.mechanicalGuide="review/$id/mechanical/README.md";$artifacts.assembly=$null;$artifacts.validation="review/$id/historical-validation.json"
    }
    $versions.Add([ordered]@{id=$id;label=$definition.label;artifacts=$artifacts;buildId=if($id -eq 'current'){$BuildId}else{$null};boardSha256=Get-FileDigest $nativePcb;schematicSha256=Get-FileDigest $nativeSch;metadata="$id/board.json";statistics="$id/statistics.json";gerbers="$id/rendered/layers.json";pcbTop="$id/pcb-top.svg";pcbBottom="$id/pcb-bottom.svg";schematicPdf="$id/schematic.pdf";fabricationZip="$id/fabrication.zip";sourcePcb="$id/source/$($Settings.project.basename).kicad_pcb";validation=$validation})
    Write-Host "Review snapshot: $($definition.label)"
}
Write-JsonFile "$review/catalog.json" @{schemaVersion=2;current='current';versions=@($versions);gitIntegration='Not configured; these are explicit local snapshots, not Git commits.'}
