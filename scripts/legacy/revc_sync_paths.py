"""Synchronize regenerated schematic instance IDs without touching copper."""
from audit_symbols import *
import pcbnew as k
REV=pathlib.Path('pico_scale_controller/concept-revC');meta=json.loads((REV/'parts.json').read_text());p=pathlib.Path('tmp/revc-routing/routing-candidate.kicad_pcb');tree=parse(p.read_text(encoding='utf-8'))
for f in cs(tree,'footprint'):
    name=val(next(i for i in cs(f,'property') if val(i[1])=='Reference')[2])
    if name not in meta['parts']:continue
    path=one(f,'path')
    if path:path[1]=q('/'+meta['root_uuid']+'/'+meta['parts'][name]['uuid'])
p.write_text(dump(tree),encoding='utf-8');b=k.LoadBoard(str(p));k.SaveBoard(str(p),b)
