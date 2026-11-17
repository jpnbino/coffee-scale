# Implementation roadmap

## Delivered local foundation

- Configurable PowerShell release command using installed KiCad 10.
- Isolated source snapshot, electrical/parity checks and geometry/revision gates.
- Input and artifact checksums, tool version and explicit failure status.
- Fabrication package, assembly candidates, stencil layers and reference drawings.
- Mechanical STEP/DXF handoff, current component origins and provisional assumptions.
- Local documentation website with SVG/PDF, searchable parts and 3D model.
- Pinned viewer assets and focused regression checks.
- Board statistics, drill table and a checksum-verified local version catalogue.
- Rev D/E/current routing/placement comparison with component movement markers,
  normalized straight tracks, via changes and synchronized views.
- Exact-file Gerber/drill inspection, layer toggles, mirroring and measurement.

## Next: qualify assembly

- Select exact manufacturer/supplier part numbers for factory-fitted parts.
- Confirm the Pico/socket/direct-solder and external module assembly choices.
- Review package heights, polarity, centroids and supplier rotation conventions.
- Bind placement approval to the exact reviewed board checksum.
- Finalize programming, calibration and test procedures after firmware exists.

Current assembly outputs remain DRAFT; successful export does not approve an order.

## Next: complete the mechanical interface

- Measure actual OLED stack, Pico sockets, battery and actuator travel.
- Add missing envelopes, detailed clearance drawings and case/load-cell interface.
- Validate populated STEP geometry and physical fit with the case designer.

## Next: repository and publication

- Choose GitHub or GitLab and hardware/documentation license.
- Prepare a clean source tree, keeping historical/generated files out of the main tree.
- Add CI using the same build after reviewing its platform/runtime dependencies.
- Add validation on proposed changes and explicit versioned release publication.
- Publish the documentation only after the destination and content are reviewed.

No repository, CI workflow, external publication or order has been created.

## Later: richer design review

- Evaluate a KiCad 10 compatible native viewer; current KiCanvas schematic test failed.
- Add coordinated schematic/PCB selection and measurement if the chosen API supports it.
- Add Git commit/tag extraction to the existing local-snapshot comparison.
- Extend comparisons to filled zones, design rules, artwork and schematic semantics.
- Evaluate manufacturing-layer Boolean differences, annotations and review workflows.
