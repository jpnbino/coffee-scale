"""Validate manufacturing export contents and build a reproducible ZIP/manifest."""
import pathlib,json,re,zipfile,hashlib,datetime
root=pathlib.Path('pico_scale_controller');release=root/'fabrication/revA';g=release/'gerbers'
d=json.loads((root/'final-drc.json').read_text(encoding='utf-8'))
assert not d['violations'] and not d['unconnected_items'] and not d['schematic_parity'],'Final DRC is not clean'
assert '** ERC messages: 0  Errors 0  Warnings 0' in (root/'final-erc.rpt').read_text(encoding='utf-8')
expected={'gtl','gbl','gts','gbs','gto','gbo','gm1'}
for ext in expected:
    files=list(g.glob('*.'+ext));assert len(files)==1,(ext,files)
    text=files[0].read_text();assert '%MOMM*%' in text and text.rstrip().endswith('M02*'),files[0]
edge=next(g.glob('*.gm1')).read_text();assert edge.count('G02*')==4
assert 'X185000000Y-79000000' in edge and 'X85000000Y-119000000' in edge
job=json.loads(next(g.glob('*.gbrjob')).read_text());assert job['GeneralSpecs']['LayerNumber']==2 and job['GeneralSpecs']['BoardThickness']==1.6
npth=next(g.glob('*-NPTH.drl')).read_text();assert 'T5C3.200' in npth
mount=npth.split('\nT5\n')[-1].split('M30')[0];assert len(re.findall(r'^X',mount,re.M))==4
pth=next(g.glob('*-PTH.drl')).read_text();assert 'T1C0.300' in pth
vias=re.split(r'^T\d+$',pth.split('\nT1\n')[-1],maxsplit=1,flags=re.M)[0];assert len(re.findall(r'^X',vias,re.M))==180
assert (release/'pico_scale_controller.d356').stat().st_size>1000
files=sorted(g.iterdir());assert len(files)==10,[f.name for f in files]
archive=release/'pico_scale_controller-revA-gerbers.zip'
with zipfile.ZipFile(archive,'w',zipfile.ZIP_DEFLATED,compresslevel=9) as z:
    for f in files:z.write(f,f.name)
with zipfile.ZipFile(archive) as z:assert z.testzip() is None and len(z.namelist())==10
manifest={'board_sha256':hashlib.sha256((root/'pico_scale_controller.kicad_pcb').read_bytes()).hexdigest(),'archive_sha256':hashlib.sha256(archive.read_bytes()).hexdigest(),'files':{f.name:hashlib.sha256(f.read_bytes()).hexdigest() for f in files},'checks':{'ERC':0,'DRC':0,'unconnected':0,'schematic_parity':0,'mounting_holes_3.2mm':4,'via_drills_0.3mm':180}}
(release/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n',encoding='utf-8')
print('PASS: 10 manufacturing files; profile, layer stack, drill counts, IPC netlist and clean reports checked. ZIP CRC verified.')
print(str(archive.resolve()),archive.stat().st_size,'bytes')
