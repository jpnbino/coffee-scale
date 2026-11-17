"""Verify the current Rev E PCB against the owner layout and schematic."""
import pathlib,runpy,sys
sys.argv=["reve_verify.py","pico_scale_controller"]
runpy.run_path(str(pathlib.Path(__file__).with_name("reve_verify.py")),run_name="__main__")
