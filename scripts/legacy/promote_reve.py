"""Emit the checked Rev E PCB change without overwriting newer owner edits."""
from pathlib import Path
import difflib,sys
sys.stdout.reconfigure(encoding='utf-8',newline='\n');root=Path.cwd()/'src';rev=root/'revision-revE'
p=root/'pico_scale_controller.kicad_pcb';assert p.read_bytes()==(root/'backup-user-layout-before-revE'/p.name).read_bytes(),'Owner PCB changed during work'
changes={p:(rev/p.name).read_text(encoding='utf-8')}
changes[root.parent/'scripts'/'legacy'/'verify_design.py']='"""Verify the current Rev E PCB against the owner layout and schematic."""\nimport pathlib,runpy,sys\nsys.argv=["reve_verify.py","pico_scale_controller"]\nrunpy.run_path(str(pathlib.Path(__file__).with_name("reve_verify.py")),run_name="__main__")\n'
lines=['*** Begin Patch']
for p,after in changes.items():
    before=p.read_text(encoding='utf-8')
    if before==after:continue
    lines.append('*** Update File: '+str(p));lines.extend('@@' if s.startswith('@@') else s for s in list(difflib.unified_diff(before.splitlines(),after.splitlines(),n=3))[2:])
lines.append('*** End Patch');patch='\n'.join(lines)+'\n'
if sys.argv[1]=='length':print(len(patch))
else:offset=int(sys.argv[1]);sys.stdout.write(patch[offset:offset+50000])
