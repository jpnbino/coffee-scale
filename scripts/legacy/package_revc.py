"""Validate Rev C outputs, package fabrication layers and record source hashes."""
from pathlib import Path
import json,zipfile,hashlib,re
root=Path('pico_scale_controller');rev=root/'concept-revC';release=root/'fabrication/revC';g=release/'gerbers'
d=json.loads((release/'final-drc.json').read_text(encoding='utf-8'))
assert not d['violations'] and not d['unconnected_items'] and not d['schematic_parity']
assert '** ERC messages: 0  Errors 0  Warnings 0' in (release/'final-erc.rpt').read_text()
assert 'PASS: 285 named pads' in (release/'verification.txt').read_text()
files=sorted(g.iterdir());assert len(files)==10
for ext in ['gtl','gbl','gts','gbs','gto','gbo','gm1']:
    f=list(g.glob('*.'+ext));assert len(f)==1
    text=f[0].read_text();assert '%MOMM*%' in text and text.rstrip().endswith('M02*')
job=json.loads(next(g.glob('*.gbrjob')).read_text());assert job['GeneralSpecs']['LayerNumber']==2 and job['GeneralSpecs']['BoardThickness']==1.6
edge=next(g.glob('*.gm1')).read_text();assert edge.count('G02*')==4 and 'X185000000' in edge and 'Y-129000000' in edge
npth=next(g.glob('*-NPTH.drl')).read_text();assert 'T5C3.200' in npth
assert len(re.findall(r'^X',npth.split('\nT5\n')[-1].split('M30')[0],re.M))==4
pth=next(g.glob('*-PTH.drl')).read_text();assert 'T1C0.300' in pth
assert len(re.findall(r'^X',re.split(r'^T\d+$',pth.split('\nT1\n')[-1],maxsplit=1,flags=re.M)[0],re.M))==175
assert '750 of 750' in (rev/'step-validation.txt').read_text()
for name in ['pico_scale_controller.kicad_pcb','pico_scale_controller.kicad_sch','Scale.kicad_sym']:
    assert (root/name).read_text(encoding='utf-8')==(rev/name).read_text(encoding='utf-8'),name
assert (rev/'models/Thumbwheel_D14_prototype.stl').stat().st_size>10000
archive=release/'pico_scale_controller-revC-gerbers.zip'
with zipfile.ZipFile(archive,'w',zipfile.ZIP_DEFLATED,compresslevel=9) as z:
    for f in files:z.write(f,f.name)
with zipfile.ZipFile(archive) as z:assert z.testzip() is None and len(z.namelist())==10
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
manifest={'revision':'C prototype','board_sha256':sha(root/'pico_scale_controller.kicad_pcb'),'schematic_sha256':sha(root/'pico_scale_controller.kicad_sch'),'archive_sha256':sha(archive),'files':{f.name:sha(f) for f in files},'STEP_sha256':sha(rev/'coffee-scale-revC.step'),'checks':{'ERC':0,'DRC':0,'unconnected':0,'parity':0,'pad_mapping':285,'valid_STEP_shapes':750}}
(release/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n',encoding='utf-8')
print('PASS: source/candidate equality, clean electrical reports, ten metric fabrication files, outline/drills, wheel STL, STEP validity and ZIP CRC.')
print(archive.resolve(),archive.stat().st_size,'bytes')
