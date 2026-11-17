"""Emit bounded chunks of the three reviewed source-file changes for apply_patch."""
from pathlib import Path
import difflib,sys
sys.stdout.reconfigure(encoding='utf-8',newline='\n')
root=Path.cwd()/'src';rev=root/'concept-revC';lines=['*** Begin Patch']
for name in ['pico_scale_controller.kicad_pcb','pico_scale_controller.kicad_sch','Scale.kicad_sym']:
    before=(root/name).read_text(encoding='utf-8');after=(rev/name).read_text(encoding='utf-8')
    assert (root/name).read_bytes()==(root/'backup-before-revC'/name).read_bytes() if name!='Scale.kicad_sym' else True
    if before==after:continue
    lines.append('*** Update File: '+str(root/name))
    lines.extend('@@' if s.startswith('@@') else s for s in list(difflib.unified_diff(before.splitlines(),after.splitlines(),n=3))[2:])
verify=root.parent/'scripts'/'legacy'/'verify_design.py'
after='"""Verify the current Rev C schematic, PCB and hardware interfaces."""\nimport runpy,sys\nsys.argv=["revc_verify.py","pico_scale_controller"]\nrunpy.run_path("scripts/legacy/revc_verify.py",run_name="__main__")\n'
lines.append('*** Update File: '+str(verify))
lines.extend('@@' if s.startswith('@@') else s for s in list(difflib.unified_diff(verify.read_text(encoding='utf-8').splitlines(),after.splitlines(),n=3))[2:])
lines.append('*** End Patch');patch='\n'.join(lines)+'\n'
if sys.argv[1]=='length':print(len(patch))
else:offset=int(sys.argv[1]);sys.stdout.write(patch[offset:offset+50000])
