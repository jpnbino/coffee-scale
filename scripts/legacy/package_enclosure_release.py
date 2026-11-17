"""Validate and package fabrication files for the saved Rev B PCB."""
from pathlib import Path
import json,zipfile,hashlib
root=Path('pico_scale_controller');release=root/'fabrication/revB';g=release/'gerbers'
d=json.loads((root/'final-drc.json').read_text(encoding='utf-8'))
assert not d['violations'] and not d['unconnected_items'] and not d['schematic_parity']
assert '** ERC messages: 0  Errors 0  Warnings 0' in (release/'final-erc.rpt').read_text()
assert 'PASS:' in (release/'verification.txt').read_text()
files=sorted(g.iterdir());assert len(files)==10
for ext in ['gtl','gbl','gts','gbs','gto','gbo','gm1']:
    f=list(g.glob('*.'+ext));assert len(f)==1
    text=f[0].read_text();assert '%MOMM*%' in text and text.rstrip().endswith('M02*')
job=json.loads(next(g.glob('*.gbrjob')).read_text());assert job['GeneralSpecs']['LayerNumber']==2 and job['GeneralSpecs']['BoardThickness']==1.6
assert 'T5C3.200' in next(g.glob('*-NPTH.drl')).read_text()
assert 'T1C0.300' in next(g.glob('*-PTH.drl')).read_text()
assert (root/'enclosure-revB/coffee-scale-enclosure-reference.step').stat().st_size>100000
assert (root/'pico_scale_controller.kicad_pcb').read_bytes()==(root/'enclosure-revB/pico_scale_controller.kicad_pcb').read_bytes()
archive=release/'pico_scale_controller-revB-gerbers.zip'
with zipfile.ZipFile(archive,'w',zipfile.ZIP_DEFLATED,compresslevel=9) as z:
    for f in files:z.write(f,f.name)
with zipfile.ZipFile(archive) as z:assert z.testzip() is None
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
manifest={'revision':'B enclosure prototype','board_sha256':sha(root/'pico_scale_controller.kicad_pcb'),'archive_sha256':sha(archive),'files':{f.name:sha(f) for f in files},'STEP_sha256':sha(root/'enclosure-revB/coffee-scale-enclosure-reference.step'),'checks':{'ERC':0,'DRC':0,'unconnected':0,'parity':0}}
(release/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n',encoding='utf-8')
print('PASS: current Rev B board, clean reports, ten manufacturing files, metric Gerbers/drills, STEP and ZIP CRC checked.')
print(archive.resolve(),archive.stat().st_size,'bytes')
