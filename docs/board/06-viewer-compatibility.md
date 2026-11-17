# Browser viewer compatibility

Local proof of concept, tested on hardware Rev E with KiCad 10.0.8.

| Feature | Result |
|---|---|
| Exported PCB SVG | Loaded; top and bottom views available |
| Exported schematic SVG/PDF | Generated from KiCad; independent of a native browser parser |
| Part search | Passed: filtering U5 isolates the HX711 |
| 3D GLB with model-viewer 4.4.0 | Loaded in the browser |
| Pinned KiCanvas native schematic, original source | Rejects leading-decimal numeric token at index 67130 |
| Pinned KiCanvas with viewer-only numeric normalization | Renders schematic and symbol list; U5/HX711 selection exercised |
| Pinned KiCanvas native PCB | Not qualified |
| Coordinated schematic/PCB selection and visual diffs | Not implemented |

The default viewer uses native KiCad exports as its reference. KiCanvas loads
on request using a derived schematic that changes numeric spelling such as
`.254` to `0.254`. Quoted text and comments remain unchanged. Tests compare
the parsed schematic before/after numeric normalization. No original design
file is rewritten or downgraded. The derived file and its provenance are under
`native/`; both source and viewer-copy checksums are recorded.

Native rendering and symbol navigation work for this project; this is not a
claim of complete KiCad 10 format support or electrical connectivity validation.
The original schematic and KiCad-generated SVG/PDF remain authoritative.

Fullscreen retains viewer controls and falls back to an in-page overlay in
embedded browsers that deny the Fullscreen API. Gerber opacity affects complete
layers, not individual nets. Its ruler shows endpoints, a live preview and a
distance overlay; click placement is manual, without snapping or metrology-grade
precision. Pan is paused while measuring; zoom remains available.

3D starts at an isometric camera angle. Colour presets target the named carrier
board mask/silkscreen meshes only and do not change manufacturing specifications.

KiCanvas bundle SHA-256:
`ca910f25276c3efb9aacb3a5d6341d4d9af4736d4c875fb0440d2cc856865ab7`.
Tested schematic SHA-256:
`8b55abfdcc27fce096b86284b1b6ce6135dd1a6d12d26ea8f92673d0ae6ccf1f`.

Assets are local and pinned in vendor/lock.json, with original license notices.
A future native viewer integration must pass against the actual project before
it can replace the exported drawing reference.
