# Coffee Scale Controller

Open-hardware electronics for a coffee scale controller. The project contains
the KiCad design, revision history, manufacturing records, release tooling, and
a browser-based review portal.

## Current status

- **Hardware:** Revision E routed prototype.
- **Not complete:** Firmware, physical validation, supplier approval, and final
  assembly decisions.
- **Authoritative design:** `src/`.
- **Historical records:** `src/fabrication/` and revision snapshots under `src/`.

This repository is public and intended for open-hardware development. A
maintainer still needs to choose and add the project's hardware, software, and
documentation licenses; no legal license was guessed.

## Repository map

| Path | Purpose |
| --- | --- |
| `src/` | KiCad sources, local libraries, models, revision snapshots, and historical fabrication data |
| `assembly/` | Assembly profile used by the release workflow |
| `scripts/legacy/` | Historical placement, routing, revision, and packaging utilities |
| `tools/` | Maintained release and portal build tooling |
| `docs/` | Detailed board, manufacturing, and compatibility documentation |
| `tests/` | Release and viewer regression checks |
| `web/` | Browser review portal source and pinned vendor assets |
| `build/`, `tmp/`, `work/`, `outputs/` | Generated or intermediate files; not committed |

## Quick start

Requirements:

- PowerShell 7
- KiCad 10 and `kicad-cli`
- Node.js

From the repository root:

```powershell
./release.ps1 -ValidateOnly
./release.ps1
./preview.ps1
```

The release command creates a new timestamped build under
`build/releases/`. Use `-KiCadCli` when KiCad is installed in a non-standard
location. The preview serves the latest successful site on
`http://127.0.0.1:8787`.

## Release contents

Each successful build contains:

- `source/` — isolated KiCad design snapshot
- `reports/` — ERC, DRC, netlist, statistics, and build log
- `fabrication/` — Gerbers, drills, and manufacturing notes
- `assembly/` — BOM, placement data, IPC-2581, stencil layers, and readiness
- `mechanical/` — STEP/DXF exports and interface data
- `site/` — review portal and downloadable packages
- `manifest.json` — hashes, tool versions, status, and readiness

The assembly profile in `assembly/profile.csv` is intentionally retained: the
release workflow reads it to apply population stages, sourcing metadata,
rotation corrections, and verification state. It is not proof of supplier
approval.

## Checks

```powershell
./tests/Test-Release.ps1
node --test tests/portal.test.mjs tests/viewer.test.mjs
node --test tests/viewer-controls.test.mjs tests/revision.test.mjs
```

See `docs/board/` for the detailed circuit, assembly, mechanical, viewer, and
manufacturing notes. Legacy utilities should be run from the repository root;
they write candidates and intermediate files to their existing revision and
`tmp/` locations.
