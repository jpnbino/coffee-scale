# Portal browser smoke test

Maintainer notes: what `tools/smoke-portal.mjs` checks and how to run it. It
tests the generated web portal in a browser. It does not test the hardware
and says nothing about it.

## Running it locally

Build a release first (needs KiCad 10), then point the script at its site:

```sh
node release.mjs
npm run smoke -- build/releases/<build-id>/site
# or: node tools/smoke-portal.mjs build/releases/<build-id>/site --chrome /path/to/chrome
```

Requirements: Node.js 22+ (built-in `WebSocket`) and Google Chrome or
Chromium. No packages are installed. Chrome is found via `--chrome`, then
`CHROME_PATH`, then `google-chrome`, `google-chrome-stable`, `chromium` or
`chromium-browser` on `PATH`, then the standard macOS or Windows install
location.

The script serves the site on `127.0.0.1` on a free port. It starts headless
Chrome with a temporary profile and drives it over the DevTools protocol.
Chrome runs with `--no-sandbox` only when the script runs as root (CI
containers), or when `PORTAL_SMOKE_NO_SANDBOX=1` is set. It prints one
PASS/FAIL line per check and exits non-zero if any check fails. Chrome and the
server are always shut down, even after errors. A 10-minute watchdog makes
sure a hung browser cannot hang CI.

## What it checks

- **Every page loads cleanly.** This covers the nine core pages (`index`,
  `explore`, `statistics`, `stackup`, `gerbers`, `manufacture`, `mechanical`,
  `versions`, `documentation`) and every `doc-*.html`. A page fails on an
  uncaught exception or unhandled rejection. It also fails on a same-origin
  request that returns HTTP 400 or more or fails to load. A missing core page
  is a failure.
- **Gerber view** (`gerbers.html`): within 20 s the board drawing in
  `#gerber-canvas` has at least three layer groups, and `#fab-summary` has
  text. Clicking `[data-preset="bottom"]` checks `#gerber-mirror`.
  `gerbers.html?part=J4` puts J4 in `#fab-selection`.
  `gerbers.html?layer=gbl,gbs,gm1&side=bottom&view=150,100,20,12` checks
  `#gerber-mirror` and keeps a four-number `view=` in the address. Pressing
  `#review-start` then `#review-ok` makes `#review-progress` read "1 of …".
- **Stackup** (`stackup.html`): `.order-ok` is shown, so the KiCad stackup
  and the release's manufacturing settings agree.
- **Statistics** (`statistics.html`): the manufacturability table has at least
  ten checked cells and the summary names JLCPCB.
- **Versions** (`versions.html`): the five summary tiles and the change list are
  filled.
- **Gerber difference** (`versions.html`): clicking `[data-mode="gerber"]`
  compares a layer within 30 s (`#gdiff-results[data-ready]`), puts an
  added/removed summary in `#change-list .gdiff-message`, and every row of
  `#gdiff-body` leaves the `pending` state within 60 s.
- **Mechanics** (`mechanical.html`): the drawing has the four mounting holes and
  the feature table has at least five rows.
- **Interactive viewer** (`explore.html?net=HX_DOUT`): the viewer opens (`#design-viewer[open]`, or `#design-viewer-app` shown now that it is the default tab).
  Within 30 s, HX_DOUT (`/HX_DOUT` in the schematic) becomes the selected net:
  its `#dv-net-list` button gets `aria-current="true"` and `#dv-status`
  reports it.

The checks use only these viewer ids and attributes, plus page URLs. They do
not depend on the header, navigation, breadcrumbs or resource tabs, so those
can change freely.

Two failed requests are expected and ignored:

- `/favicon.ico`: the portal has no favicon.
- `$$:N:$$` placeholders: the pinned KiCanvas bundle fetches one when it
  builds its controls from HTML templates.

## In CI

The `smoke` job in `.github/workflows/release.yml` runs after `kicad`. It
runs on `ubuntu-latest`, which ships Google Chrome. The job downloads the
`release-build` artifact and smoke-tests the newest `*/site`. The `pages` job
needs `smoke`, so a portal that fails is not published.
