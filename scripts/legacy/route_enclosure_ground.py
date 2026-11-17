"""Route a nearby protected-ground return across a split copper region."""
from route_board import *
import route_board as r
r.TMP=pathlib.Path('tmp/enclosure-routing')
(r.TMP/'ground-anchors.json').write_text(json.dumps([(108.8625,82,-1),(110.95,85,0),(108,116,-1)]))
r.prepare(True,['/GND'])
