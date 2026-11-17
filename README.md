# Coffee scale hardware and release workflow

The current KiCad sources are in `pico_scale_controller/`. Hardware revision E
is a routed prototype; firmware and physical validation remain outstanding.
The historical `fabrication/rev*` directories remain untouched by the new build.
Legacy exploratory and revision-transition utilities are grouped under
`scripts/legacy/`; the root `release.ps1` and `preview.ps1` entrypoints remain
in place for compatibility.

## Open-hardware licensing

This repository is intended for public open-hardware development. A maintainer
must choose and add the project's hardware, software, and documentation
licenses before relying on this repository for redistribution. No license is
included yet because that legal choice has not been specified.

## Requirements

- PowerShell 7 and a matching KiCad 10 installation with its standard libraries.
- Node.js for version metadata, normalized routing comparisons, Gerber rendering
  and the optional loopback preview server. No npm install is needed.
- No Python, Poetry environment, package installation or runtime network access
  is required for the new local release workflow.

## Commands

```powershell
./release.ps1 -ValidateOnly
./release.ps1
./preview.ps1
```

Open `http://127.0.0.1:8787` after starting the preview. Run the preview in a
separate terminal; Ctrl+C stops it. `-Site` selects an explicit generated site.
The server listens on loopback only and does not publish the project.

Use `-KiCadCli 'path/to/kicad-cli.exe'` for a non-standard installation. The build
creates a fresh timestamped folder in `build/releases/`; it refuses to overwrite
an existing build. Save the KiCad files before running it. Unsaved editor changes
are not part of the release.

## Release contents

| Folder | Contents |
|---|---|
| `source/` | Isolated snapshot of the design, local libraries and models |
| `reports/` | Fresh ERC/DRC, netlist, board statistics and command log |
| `fabrication/` | Gerbers, separate drills, test netlist and manufacturing notes |
| `assembly/` | Native BOM/positions, IPC-2581, staged BOM, candidate CPL and drawings |
| `mechanical/` | STEP, DXF, current component origins and provisional case interface |
| `site/` | Portable documentation, 2D/3D viewing and downloadable packages |
| `manifest.json` | Input/output hashes, tool version, status and readiness |

Failed builds retain reports with `status: failed`. They are not selected by
the default preview. A successful prototype build is not assembly approval.

## Configuration and assembly review

`release.json` controls paths, hardware revision, board parameters and reviewed
mechanical reference hash. `assembly/profile.csv` holds per-reference population
stages, sourcing, rotation corrections and verification. Unlisted components
default to unverified factory candidates. Missing MPNs are never invented.

```powershell
./release.ps1 -RequireAssemblyReady
```

This strict mode intentionally fails until all factory parts are reviewed and
`assembly.placementReviewBoardSha256` matches the exact PCB reviewed. Changing
the board invalidates that approval. Review the candidate with the supplier
before using it for any order. Complete-instrument parts, firmware, wiring and
test procedures are separate from carrier assembly.

## Documentation and viewers

Edit maintained board explanations in `docs/board/`. KiCad generates the drawing
references. The browser uses local model-viewer 4.4.0 and a content-pinned
experimental KiCanvas bundle; assets and notices are in `web/vendor/` with hashes
in `lock.json`. Native KiCad 10 compatibility is an experiment, not a prerequisite
for viewing the exported SVG/PDF. Vendor assets are checked at every site build.

Run `./tests/Test-Release.ps1` for focused checks. No existing hardware source is
edited by these scripts. Repository hosting, CI and publishing are future steps;
no workflow, dependency installation, commit or external publication is performed.

## Version review and manufacturing inspection

`release.json` lists explicit historical snapshots under `history`. The build
verifies their source/manufacturing checksums before generating review artifacts.
The current catalogue includes Rev D, archived Rev E and the current build.
The existing snapshots remain untouched. Historical validation records are
labelled separately from fresh current-build checks.

The statistics page describes the current build. Comparison supports an
overlay, synchronized side-by-side view and explicit blink mode. Components
are matched by UUID, with reference fallback; straight tracks are normalized
as unions of collinear intervals at nanometre precision. Vias include their
drill, diameter, layer span, net and type. Filled zones, artwork, design rules
and schematic-only semantics are outside this first comparison scope.

The Gerber view reads exact exported Gerber/Excellon files with a checksum-pinned
gerber-to-svg 4.2.8 bundle, used at build time. SVG layer offsets are normalized
to absolute coordinates before browser composition. Parser reports and source
hashes remain available. X2 metadata attributes are ignored by this renderer,
so Gerber net selection is unavailable. This is inspection, not fabrication
qualification. Unknown geometry warnings remain visible.

Run `node --test tests/viewer.test.mjs` for routing, identity and Gerber regression
checks. Git commit/tag extraction, Gerber-to-Gerber Boolean differences and
semantic schematic comparison remain future work.

## Documentation portal

The release builds a landing page and dedicated pages for design exploration,
statistics, Gerbers, manufacturing, mechanical collaboration and version review.
Each Markdown guide has its own page, linked from the documentation index.
All pages have shared navigation, breadcrumbs, build/revision identification and
local topic search. Old section links redirect to their new resource pages.
SVG drawings and the 3D viewer load only when their design tab is opened.

The shared hardware revision selector uses `?rev=revD`, `?rev=revE-archive` or
`?rev=current` and persists through navigation/search links, reload and browser
history. PCB, schematic, native schematic, 3D, stackup, statistics and downloads
resolve through the same artifact catalogue. Unknown IDs fail closed. Historical
3D/STEP/SVG views are re-exported from checksum-verified archived source files
with the current toolchain; archived fabrication data is copied unchanged.
Historical assembly profiles and documentation were not archived and are shown
as unavailable, never substituted with current-build records. Historical STEP
packages document their default KiCad origin and lack of enclosure approval.
Comparison explicitly shows two versions, with its target matching the global
selector. Richer onboarding and reference/net search remain future steps.

Run `node --test tests/portal.test.mjs tests/viewer.test.mjs` to validate the portal
structure and review logic, alongside `./tests/Test-Release.ps1`.

The stackup page reads the PCB's explicit layer/material entries and exposes its
source checksum. Supplier approval remains a separate, unfulfilled gate; see
`docs/board/08-manufacturing-control.md` for the manufacturing-control roadmap.
Viewer controls include fullscreen, Gerber opacity and an overlaid ruler, plus
isometric 3D colour previews. Native schematics use a numeric-normalized derived
copy with provenance; the source schematic remains unchanged. Additional checks:
`node --test tests/viewer-controls.test.mjs`.

Revision-selection regression checks: `node --test tests/revision.test.mjs`.

## Repository layout

| Path | Role |
|---|---|
| `pico_scale_controller/` | Authoritative KiCad sources, models, revision snapshots and historical fabrication data |
| `assembly/` | Assembly profile input used by the release workflow |
| `scripts/legacy/` | Historical design-generation, routing and packaging utilities; they emit into `tmp/` or revision workspaces |
| `tools/` | Maintained release/build tooling |
| `docs/`, `web/` | Maintained documentation and browser viewer sources |
| `tests/` | Focused release and viewer regression checks |
| `build/`, `outputs/`, `tmp/`, `work/` | Generated or intermediate material; ignored and never authoritative |
