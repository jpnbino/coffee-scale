"""Emit reviewable primary-project changes after the Rev D checks pass."""
from pathlib import Path
import difflib,sys
sys.stdout.reconfigure(encoding='utf-8',newline='\n');root=Path.cwd()/'pico_scale_controller';rev=root/'concept-revD';lines=['*** Begin Patch']
changes={root/name:(rev/name).read_text(encoding='utf-8') for name in ['pico_scale_controller.kicad_pcb','pico_scale_controller.kicad_sch','Scale.kicad_sym','Scale.pretty/TS43_135255.kicad_mod']}
changes[root.parent/'scripts'/'legacy'/'verify_design.py']='"""Verify the current Rev D schematic and PCB interfaces."""\nimport pathlib,runpy,sys\nsys.argv=["revd_verify.py","pico_scale_controller"]\nrunpy.run_path(str(pathlib.Path(__file__).with_name("revd_verify.py")),run_name="__main__")\n'
for p,after in changes.items():
    if p.name in ['pico_scale_controller.kicad_pcb','pico_scale_controller.kicad_sch','Scale.kicad_sym']:assert p.read_bytes()==(root/'backup-before-revD'/p.name).read_bytes()
    if not p.exists():lines+=['*** Add File: '+str(p)]+['+'+s for s in after.splitlines()];continue
    before=p.read_text(encoding='utf-8')
    if before==after:continue
    lines.append('*** Update File: '+str(p));lines.extend('@@' if s.startswith('@@') else s for s in list(difflib.unified_diff(before.splitlines(),after.splitlines(),n=3))[2:])
lines.append('*** End Patch');patch='\n'.join(lines)+'\n'
if sys.argv[1]=='length':print(len(patch))
else:offset=int(sys.argv[1]);sys.stdout.write(patch[offset:offset+50000])
