param([string]$Root,[string]$Output,[hashtable]$Settings,[string]$BuildId,$Assembly)
$site="$Output/site"; $web=Resolve-ChildPath $Root $Settings.siteDirectory
$lock=Read-JsonFile "$web/vendor/lock.json"
foreach($asset in $lock.assets){
    if((Get-FileDigest (Resolve-ChildPath "$web/vendor" $asset.file)) -cne $asset.sha256){throw "Viewer asset checksum mismatch: $($asset.file)"}
}
Copy-Item -LiteralPath "$web/style.css","$web/app.js" -Destination $site
Copy-Item -LiteralPath "$web/review.css","$web/portal.css" -Destination $site
Copy-Item -Path "$web/*.mjs" -Destination $site
Copy-Item -LiteralPath "$web/vendor" -Destination "$site/vendor" -Recurse
New-Item -ItemType Directory -Force -Path "$site/source","$site/files" | Out-Null
foreach($extension in @('kicad_sch','kicad_pcb')){Copy-Item -LiteralPath "$Output/source/$($Settings.project.basename).$extension" -Destination "$site/source"}
$documentHtml=[Collections.Generic.List[string]]::new()
foreach($file in (Get-ChildItem -LiteralPath (Resolve-ChildPath $Root $Settings.documentationDirectory) -Filter '*.md' | Sort-Object Name)){
    $html=(ConvertFrom-Markdown -LiteralPath $file.FullName).Html
    $id=[Net.WebUtility]::HtmlEncode($file.BaseName)
    $documentHtml.Add("<article class=`"doc-article`" id=`"doc-$id`">$html</article>")
}
$svg=@(Get-ChildItem -LiteralPath "$site/schematic" -Filter '*.svg' | Sort-Object Name)
if(-not $svg.Count){throw 'Schematic SVG export is missing.'}
$template=Get-Content -LiteralPath "$web/index.html" -Raw
$statistics=Read-JsonFile "$Output/reports/board-statistics.json"
$replacements=@{TITLE=[Net.WebUtility]::HtmlEncode($Settings.project.name);REVISION=[Net.WebUtility]::HtmlEncode($Settings.project.revision);BUILD_ID=[Net.WebUtility]::HtmlEncode($BuildId);SCHEMATIC_SVG=('schematic/'+$svg[0].Name);DOCUMENTATION=($documentHtml -join "`n");WIDTH=$Settings.manufacturing.widthMm;HEIGHT=$Settings.manufacturing.heightMm;FOOTPRINTS=$statistics.components.total.total}
foreach($key in $replacements.Keys){$template=$template.Replace("{{$key}}",$replacements[$key])}
$template | Set-Content -LiteralPath "$site/index.html" -Encoding utf8
& node "$Root/tools/build-viewer-data.mjs" $site "$Output/source/$($Settings.project.basename).kicad_pcb" "$Output/source/$($Settings.project.basename).kicad_sch"
if($LASTEXITCODE -ne 0){throw 'Viewer traceability export failed.'}
& node "$Root/tools/build-portal.mjs" $site
if($LASTEXITCODE -ne 0){throw 'Documentation portal generation failed.'}
$data=@{basename=$Settings.project.basename;parts=@(Import-Csv -LiteralPath "$Output/assembly/bom-with-stages.csv");assembly=$Assembly;mechanical=Read-JsonFile "$Output/mechanical/interface.json";statistics=$statistics}
# CSV represents booleans as strings; expose actual booleans to the browser.
foreach($part in $data.parts){$part.Verified=($part.Verified -eq 'True')}
'window.releaseData = '+(ConvertTo-Json -InputObject $data -Depth 25 -Compress -EscapeHandling EscapeHtml)+';' | Set-Content -LiteralPath "$site/data.js" -Encoding utf8
$validation=@{buildId=$BuildId;hardwareRevision=$Settings.project.revision;boardSha256=Get-FileDigest "$Output/source/$($Settings.project.basename).kicad_pcb";erc=Read-JsonFile "$Output/reports/erc.json";drc=Read-JsonFile "$Output/reports/drc.json";assemblyReady=$Assembly.ready;prototypeHardware=$true}
Write-JsonFile "$site/files/validation.json" $validation
Copy-Item -LiteralPath "$Output/mechanical" -Destination "$site/files/mechanical" -Recurse
Write-Host 'Documentation site generated with local viewer assets and SVG/PDF fallback.'
