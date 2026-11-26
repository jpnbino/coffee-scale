# Browser viewer compatibility

How the portal's viewers read KiCad 10 files, what was tested, and what they depend on.

Tested on hardware Rev E with KiCad 10.0.8.

| Feature | Result |
|---|---|
| Exported PCB SVG | Loaded; top and bottom views available |
| Exported schematic SVG/PDF | Generated from KiCad; independent of a native browser parser |
| Part search | Passed: filtering U5 isolates the HX711 |
| 3D GLB with model-viewer 4.4.0 | Loaded in the browser |
| Pinned KiCanvas native schematic, original source | Rejects leading-decimal numeric token at index 67130 |
| Pinned KiCanvas with viewer-only numeric normalization | Renders schematic and symbol list; U5/HX711 selection exercised |
| Pinned KiCanvas native PCB, original KiCad 10 source | Renders, but finds no nets (KiCad 10 names nets inline) |
| Pinned KiCanvas PCB with viewer-only net table | Renders with layer panel; all 73 nets found and highlightable |
| Schematic whole-net highlighting | Traced from the original files; all 73 nets match the board in Rev D, archived Rev E and current |
| Schematic ↔ PCB part and net cross-probing | Exercised in headless Chrome: U5 selected in both views; /HOLD_EN and /BTN1 highlighted in both |

The default viewer uses native KiCad exports as its reference. KiCanvas loads
on request using a derived schematic that changes numeric spelling such as
`.254` to `0.254`. Quoted text and comments remain unchanged. Tests compare
the parsed schematic before/after numeric normalization. No original design
file is rewritten or downgraded. The derived file and its provenance are under
`native/`; both source and viewer-copy checksums are recorded.

Native rendering and symbol navigation work for this project; this is not a
claim of complete KiCad 10 format support or electrical connectivity validation.
The original schematic and KiCad-generated SVG/PDF remain authoritative.

## Interactive design viewer

Explore board → Interactive design viewer shows the schematic and PCB side by
side (or one at a time) with a net list.

- Clicking a part selects and zooms to it in both views.
- Clicking a track or pad highlights its net in both views. Clicking a wire or
  label in the schematic does the same, and so does picking a net from the list.
  Where items overlap, KiCanvas asks which net is meant.
- While a net is highlighted, copper pours and other tracks are faded on the PCB.
- The PCB's own layer panel shows and hides layers.
- Viewer theme applies only to the two viewers. "KiCad-style" approximates
  KiCad's light schematic and classic PCB colours; "Witch Hazel" is KiCanvas's
  dark theme. The choice is remembered in the browser.

How it works, and what it relies on:

- KiCad 10 boards write nets by name (`(net "/GND")`) without the numbered net
  table KiCanvas reads. The viewer copy `native/board.kicad_pcb` adds that table
  and numbers each reference; tests check it is otherwise identical to the board.
- KiCanvas has no schematic net highlighting. The build traces schematic
  connectivity from the original `.kicad_sch` (`tools/schematic-nets.mjs`):
  wires, labels, power symbols and symbol pins, joined as KiCad joins them
  (PWR_FLAG markers do not join nets). Each group is named by the board net of
  its pins. Any group that would span several board nets is reported and not
  highlighted. The result is `native/schematic-nets.json`.
- Hierarchical sheets are not traced; this design has a single sheet.
- The viewer drives KiCanvas through internal objects (viewer selection, zoom,
  net highlight, theme colours, camera). These are not a public API, so the
  bundle stays pinned by checksum and the viewer must be re-checked after any
  KiCanvas update.
- The click-to-interact layer is disabled so cross-probing needs one click;
  scrolling over a viewer zooms it.

Fullscreen retains viewer controls and falls back to an in-page overlay in
embedded browsers that deny the Fullscreen API. Gerber opacity affects complete
layers, not individual nets. Its ruler shows endpoints, a live preview and a
distance overlay; click placement is manual, without snapping or metrology-grade
precision. Pan is paused while measuring; zoom remains available.

3D starts at an isometric camera angle. Colour presets target the named carrier
board mask/silkscreen meshes only and do not change manufacturing specifications.

KiCanvas bundle SHA-256: upstream
`ca910f25276c3efb9aacb3a5d6341d4d9af4736d4c875fb0440d2cc856865ab7`, patched
`d2dc47d46b349262cdb19709715ce1f7283e559a5f9975d3392e5169370e5319`. The only
patch replaces its Google Fonts stylesheet with `vendor/kicanvas-fonts.css`,
which serves the Material Symbols icon font (Apache-2.0) from the site, so the
viewer works offline and makes no third-party requests.
Tested schematic SHA-256:
`8b55abfdcc27fce096b86284b1b6ce6135dd1a6d12d26ea8f92673d0ae6ccf1f`.

Assets are local and pinned in vendor/lock.json, with original license notices.
A future native viewer integration must pass against the actual project before
it can replace the exported drawing reference.
