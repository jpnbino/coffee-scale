param([hashtable]$Context)
$c=$Context; $o=$c.Output; $p=$c.Pcb; $s=$c.Sch
function Export-KiCad([string[]]$Arguments) { Invoke-KiCad $c.Cli $Arguments $c.Log }
Export-KiCad @('pcb','export','gerbers','--output',"$o/fabrication/gerbers",'--layers','F.Cu,B.Cu,F.Mask,B.Mask,F.SilkS,B.SilkS,Edge.Cuts','--subtract-soldermask','--check-zones',$p)
Export-KiCad @('pcb','export','drill','--output',"$o/fabrication/gerbers",'--format','excellon','--excellon-units','mm','--excellon-separate-th','--excellon-oval-format','route','--generate-report','--report-path',"$o/fabrication/drill-report.txt",$p)
Export-KiCad @('pcb','export','ipcd356','--output',"$o/fabrication/test-netlist.d356",$p)
Export-KiCad @('pcb','export','ipc2581','--units','mm','--output',"$o/assembly/board.ipc2581.xml",$p)
New-Item -ItemType Directory -Force -Path "$o/assembly/stencil" | Out-Null
Export-KiCad @('pcb','export','gerbers','--output',"$o/assembly/stencil",'--layers','F.Paste,B.Paste,Edge.Cuts',$p)
Export-KiCad @('pcb','export','pos','--format','csv','--units','mm','--output',"$o/assembly/positions-native.csv",$p)
Export-KiCad @('sch','export','netlist','--format','kicadxml','--output',"$o/reports/netlist.xml",$s)
Export-KiCad @('sch','export','bom','--fields','Reference,Value,Footprint,Manufacturer,MPN,Datasheet,DNP,EXCLUDE_FROM_BOM','--labels','Reference,Value,Footprint,Manufacturer,MPN,Datasheet,DNP,EXCLUDE_FROM_BOM','--output',"$o/assembly/bom-native.csv",$s)
Export-KiCad @('sch','export','pdf','--output',"$o/site/schematic.pdf",$s)
New-Item -ItemType Directory -Force -Path "$o/site/schematic" | Out-Null
Export-KiCad @('sch','export','svg','--output',"$o/site/schematic",$s)
foreach ($side in @('top','bottom')) {
    $face=if($side -eq 'top'){'F'}else{'B'}
    $svgArgs=@('pcb','export','svg','--layers',"$face.Cu,$face.SilkS,Edge.Cuts",'--mode-single','--fit-page-to-board','--exclude-drawing-sheet','--output',"$o/site/pcb-$side.svg",$p)
    Export-KiCad $svgArgs
    $pdfArgs=@('pcb','export','pdf','--layers',"$face.Fab,$face.SilkS,Edge.Cuts",'--mode-single','--sketch-pads-on-fab-layers','--output',"$o/assembly/assembly-$side.pdf",$p)
    Export-KiCad $pdfArgs
    Export-KiCad @('pcb','render','--side',$side,'--width','1600','--height','1000','--quality','basic','--background','opaque','--use-board-stackup-colors','--output',"$o/site/$side.png",$p)
}
Export-KiCad @('pcb','export','dxf','--layers','Edge.Cuts','--mode-single','--output-units','mm','--output',"$o/mechanical/outline-absolute.dxf",$p)
$origin=($c.Config.mechanical.originAbsoluteMm | ForEach-Object { [string]$_ }) -join 'x'
Export-KiCad @('pcb','export','step','--force','--subst-models','--user-origin',"${origin}mm",'--output',"$o/mechanical/populated.step",$p)
Export-KiCad @('pcb','export','step','--force','--board-only','--user-origin',"${origin}mm",'--output',"$o/mechanical/bare-board.step",$p)
Export-KiCad @('pcb','export','glb','--force','--subst-models','--user-origin',"${origin}mm",'--include-silkscreen','--include-soldermask','--output',"$o/site/board.glb",$p)
& "$($c.Root)/tools/Build-Mechanical.ps1" -Output $o -Settings $c.Config -Root $c.Root
