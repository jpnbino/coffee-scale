"""Emit chunks of an apply_patch diff for the validated routing artifact."""
import pathlib,difflib,sys
sys.stdout.reconfigure(encoding='utf-8',newline='\n')
root=pathlib.Path.cwd();target=root/'src/pico_scale_controller.kicad_pcb'
before=target.read_text(encoding='utf-8');after=(root/'tmp/routing-final.kicad_pcb').read_text(encoding='utf-8')
lines=list(difflib.unified_diff(before.splitlines(),after.splitlines(),n=3))[2:]
patch='*** Begin Patch\n*** Update File: '+str(target)+'\n'+'\n'.join('@@' if line.startswith('@@') else line for line in lines)+'\n*** End Patch\n'
if sys.argv[1]=='length':print(len(patch))
else:
    offset=int(sys.argv[1]);sys.stdout.write(patch[offset:offset+50000])
