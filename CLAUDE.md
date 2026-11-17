# Coffee Scale Controller — working notes for Claude

Open-hardware coffee-scale controller board, currently **Revision E**: a routed,
electrically checked prototype. It is not bench-validated, production-qualified
or supplier-approved. Keep that distinction in everything you write.

## Repository layout

- `src/` — authoritative KiCad 10 design (`pico_scale_controller.*`), project
  libraries (`Scale.kicad_sym`, `Scale.pretty/`, `models/`), revision snapshots
  (`concept-revC/`, `concept-revD/`, `revision-revE/`) and historical
  fabrication records (`fabrication/`).
- `release.json` — release configuration, revision history, manufacturing and
  mechanical parameters. `release.mjs` reads it.
- `assembly/profile.csv` — assembly stages/sourcing overrides read by the
  release. It is intentionally incomplete; do not delete it.
- `docs/board/` — maintained documentation (rendered into the portal).
  Keep `README.md` short; put detail here.
- `tools/` — Node.js release and portal tooling; `tools/lib/` holds shared
  helpers. `web/` — portal templates, viewer code, checksum-locked vendor assets.
- `tests/` — `node:test` suites. `scripts/legacy/` — archived Python utilities.
- `build/`, `work/`, `tmp/`, `outputs/` — generated or scratch; ignored, never commit.

## Commands

Requirements: KiCad 10 (`kicad-cli`) and Node.js 22+. No `npm install` — the
tooling has no dependencies.

```sh
npm test                          # all tooling tests (no KiCad needed)
node release.mjs --validate-only  # ERC, DRC, schematic parity, dimensions
node release.mjs                  # full prototype release under build/releases/
node release.mjs --require-assembly-ready   # also fails on assembly blockers
node preview.mjs                  # serve the newest build on 127.0.0.1:8787
```

`kicad-cli` is found via `--kicad-cli`, then `KICAD_CLI`, then `PATH`, then the
standard install location (on macOS
`/Applications/KiCad/KiCad.app/Contents/MacOS/kicad-cli`).

CI (`.github/workflows/release.yml`) runs `npm test` on Linux, macOS and
Windows, then validation and a full build in `kicad/kicad:10.0.7-full`. Keep
local and CI commands identical; pin tool versions.

## Rules

- KiCad source files are authoritative. Never treat generated release output
  as a source of truth or edit it to fix a result.
- Preserve historical revision data referenced by `release.json`; their files
  are verified against recorded SHA-256 hashes.
- Files must stay byte-exact: `.gitattributes` sets `* -text`, and many tracked
  files are deliberately stored with CRLF. Do not normalise line endings or
  reformat KiCad, Gerber, vendor or historical files.
- Check every path reference before moving or renaming source files.
- Do not invent manufacturer part numbers, battery specifications, supplier
  approvals or test results. Unknowns stay marked as unknown.
- Distinguish CAD validation (ERC/DRC) from physical testing and supplier
  qualification.
- Never force-push or rewrite public history. Work on a branch and open a PR.
- Run the smallest relevant checks and report which tools were unavailable
  rather than claiming full validation.

## Hardware safety notes to keep intact

Firmware is not included. Battery chemistry, ratings, polarity and thermal
limits are unverified. Do not connect the Pico's USB port while using the
external-power arrangement. Enclosure, display and load-cell fit is
provisional. No license has been chosen yet; do not add one without the owner.
