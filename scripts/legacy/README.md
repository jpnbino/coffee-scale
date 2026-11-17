# Legacy design utilities

These scripts preserve the historical placement, routing, enclosure, revision
promotion and packaging workflow used while developing the board. They are not
the maintained release entrypoint: use `release.ps1` and `tools/` for the
current reproducible release workflow.

Run them from the repository root so their existing `pico_scale_controller/`,
`tmp/` and revision-relative paths resolve as before. The scripts now live in
one category, but their generated and authoritative outputs remain in their
original locations.
