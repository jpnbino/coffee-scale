"""Verify current Rev D fabrication outputs and write archive/source manifest."""
from pathlib import Path
import json,zipfile,hashlib,re
root=Path('pico_scale_controller');rev=root/'concept-revD';release=root/'fabrication/revD';g=release/'gerbers'
d=json.loads((release/'final-drc.json').read_text(encoding='utf-8'));assert not d['violations'] and not d['unconnected_items'] and not d['schematic_parity']
assert '** ERC messages: 0  Errors 0  Warnings 0' in (release/'final-erc.rpt').read_text()
assert 'PASS: 288 named pads' in (release/'verification.txt').read_text()
files=sorted(g.iterdir());assert len(files)==10
for ext in ['gtl','gbl','gts','gbs','gto','gbo','gm1']:
    f=list(g.glob('*.'+ext));assert len(f)==1;text=f[0].read_text();assert '%MOMM*%' in text and text.rstrip().endswith('M02*')
job=json.loads(next(g.glob('*.gbrjob')).read_text());assert job['GeneralSpecs']['LayerNumber']==2 and job['GeneralSpecs']['BoardThickness']==1.6
edge=next(g.glob('*.gm1')).read_text();assert edge.count('G02*')==4 and 'Y-129000000' in edge
npth=next(g.glob('*-NPTH.drl')).read_text();assert 'T5C3.200' in npth and 'T2C0.900' in npth
assert len(re.findall(r'^X',npth.split('\nT5\n')[-1].split('M30')[0],re.M))==4
assert len(re.findall(r'^X',npth.split('\nT2\n')[-1].split('\nT3\n')[0],re.M))==4
pth=next(g.glob('*-PTH.drl')).read_text();assert 'T1C0.300' in pth
assert len(re.findall(r'^X',re.split(r'^T\d+$',pth.split('\nT1\n')[-1],maxsplit=1,flags=re.M)[0],re.M))==176
assert 'PASS: all 740 STEP shapes valid' in (rev/'step-validation.txt').read_text()
for name in ['pico_scale_controller.kicad_pcb','pico_scale_controller.kicad_sch','Scale.kicad_sym','Scale.pretty/TS43_135255.kicad_mod']:assert (root/name).read_text(encoding='utf-8')==(rev/name).read_text(encoding='utf-8'),name
archive=release/'pico_scale_controller-revD-gerbers.zip'
with zipfile.ZipFile(archive,'w',zipfile.ZIP_DEFLATED,compresslevel=9) as z:
    for f in files:z.write(f,f.name)
with zipfile.ZipFile(archive) as z:assert z.testzip() is None
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
manifest={'revision':'D prototype','board_sha256':sha(root/'pico_scale_controller.kicad_pcb'),'schematic_sha256':sha(root/'pico_scale_controller.kicad_sch'),'archive_sha256':sha(archive),'files':{f.name:sha(f) for f in files},'STEP_sha256':sha(rev/'coffee-scale-revD.step'),'checks':{'ERC':0,'DRC':0,'unconnected':0,'parity':0,'named_pads':288,'valid_STEP_shapes':740}}
(release/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n',encoding='utf-8');print('PASS: clean electrical reports, 288 pads, current source equality, metric fabrication layers, drills, STEP and ZIP CRC.');print(archive.resolve(),archive.stat().st_size,'bytes')
