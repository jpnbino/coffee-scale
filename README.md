# Coffee Scale Controller

Open-hardware electronics for a coffee scale controller. The project contains
the KiCad design, revision history, manufacturing records, release tooling, and
a browser-based review portal.

**Review portal:** <https://jpnbino.github.io/coffee-scale/> — schematic, PCB,
3D model, Gerbers and build files from the latest `main` build. It shows a
prototype design for review, not a production or supplier approval.

![Coffee Scale Controller Revision E prototype board, rendered isometrically from the authoritative KiCad design](docs/assets/coffee-scale-controller-revE-isometric.png)

*Revision E routed prototype, shown as a faithful KiCad-derived isometric render.
The image is for design review; the hardware is not yet production-approved.*

## Current status

- **Hardware:** Revision E routed prototype.
- **Firmware:** prototype MicroPython firmware, tested on a breadboard build, is in
  [coffee-scale-firmware](https://github.com/jpnbino/coffee-scale-firmware);
  it is not yet ported to this PCB.
- **Not complete:** Firmware for Rev E, physical validation, supplier approval, and final
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

Requirements (Windows, macOS or Linux):

- KiCad 10, which provides `kicad-cli`
- Node.js 22 or newer — no `npm install` needed; the tooling has no dependencies

From the repository root:

```sh
node release.mjs --validate-only   # ERC, DRC, schematic parity and dimensions
node release.mjs                   # full prototype release build
node preview.mjs                   # view it at http://127.0.0.1:8787 (see Review portal)
```

The same commands are available as `npm run validate`, `npm run release` and
`npm run preview`. `node release.mjs --require-assembly-ready` additionally
fails the build while assembly blockers remain.

`kicad-cli` is found from `--kicad-cli <path>`, then the `KICAD_CLI`
environment variable, then `PATH`, then the standard install location
(`C:/Program Files/KiCad/10.0/bin` on Windows,
`/Applications/KiCad/KiCad.app/Contents/MacOS` on macOS, `/usr/bin` on Linux).
Each build creates a new timestamped folder under `build/releases/`.

## Review portal

Every release build includes a browser-based review portal (`site/`):

| Page | What it shows |
| --- | --- |
| Overview | Board summary, status and key facts |
| Explore board | Top/bottom copper, schematic and 3D model with part search |
| Board statistics, Layer stackup | Counts, drill table and the PCB stackup |
| Gerber inspection | The exact manufacturing files, with layer toggles and measurement |
| Build & manufacture, Enclosure & mechanics | Fabrication, assembly-draft and mechanical downloads |
| Versions & changes | Rev D, archived Rev E and the current build compared |
| Documentation | The notes in `docs/board/` |

### Online

<https://jpnbino.github.io/coffee-scale/> is republished automatically after
every push to `main`, once the tests and the full KiCad build have passed.
Pull requests are built and checked but never published.

### Locally

After a build, serve it with:

```sh
node release.mjs     # build first (a few minutes); needs KiCad
node preview.mjs     # then open http://127.0.0.1:8787
```

- `preview.mjs` serves the newest *complete* build in `build/releases/`.
  Stop it with Ctrl+C.
- Use `--port 8080` if 8787 is taken, or `--site <build>/site` to serve a
  specific build.
- The server only listens on your own machine (`127.0.0.1`); nothing is
  published.
- Don't open `index.html` by double-clicking it: browsers block the 3D model and
  interactive drawings on `file://` pages.
- After pulling changes to `web/` or `tools/`, run `node release.mjs` again.
  Existing builds keep the portal code they were built with.

### From a CI build

Each GitHub Actions run keeps its full build for 14 days. Open the run under
**Actions**, download **release-build** from *Artifacts*, unzip it, then:

```sh
node preview.mjs --site ~/Downloads/release-build/<build-id>/site
```

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

```sh
npm test        # or: node --test tests/*.test.mjs
```

GitHub Actions runs these tests on Windows, macOS and Linux, then runs the
validation and a full release build inside the official, version-pinned
`kicad/kicad` container. The build is attached to each run as an artifact.

See `docs/board/` for the detailed circuit, assembly, mechanical, viewer, and
manufacturing notes. Legacy utilities should be run from the repository root;
they write candidates and intermediate files to their existing revision and
`tmp/` locations.
