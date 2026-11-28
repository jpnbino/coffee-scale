#!/usr/bin/env node
// Browser smoke test for a generated portal (build/releases/<id>/site).
//   node tools/smoke-portal.mjs <siteDir> [--chrome <path>]
//
// Serves the site on 127.0.0.1, drives headless Chrome over the DevTools
// protocol (Node's built-in WebSocket; no dependencies) and checks that every
// page loads cleanly and that the Gerber, stackup and design viewers work.
// This exercises the generated web portal only: it says nothing about the
// hardware itself.
//
// Selectors are deliberately limited to viewer ids and attributes; the
// header, navigation and breadcrumbs are free to change.
import http from 'node:http';
import { spawn } from 'node:child_process';
import { createReadStream, existsSync, mkdtempSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

export const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.glb': 'model/gltf-binary', '.wasm': 'application/wasm', '.woff2': 'font/woff2', '.ttf': 'font/ttf',
  '.pdf': 'application/pdf', '.zip': 'application/zip', '.md': 'text/plain; charset=utf-8', '.txt': 'text/plain; charset=utf-8',
  '.kicad_sch': 'text/plain; charset=utf-8', '.kicad_pcb': 'text/plain; charset=utf-8',
};

/** Content type for a request path or file name; query strings and fragments are ignored. */
export function mimeType(file) {
  const clean = String(file).replace(/[?#].*$/, '');
  return MIME_TYPES[path.extname(clean).toLowerCase()] ?? 'application/octet-stream';
}

/** Chrome prints "DevTools listening on ws://..." on stderr once it is ready. */
export function parseDevToolsUrl(text) {
  return String(text).match(/DevTools listening on (ws:\/\/\S+)/)?.[1] ?? null;
}

/** The fixed portal pages, in reading order; each must exist in every build. */
export const CORE_PAGES = ['index', 'explore', 'statistics', 'stackup', 'gerbers', 'manufacture', 'mechanical', 'versions', 'documentation'].map(id => `${id}.html`);

/** Pages to load from a site's file names: the core pages plus every doc-*.html. */
export function discoverPages(names) {
  const present = new Set(names);
  const docs = names.filter(name => /^doc-[\w-]+\.html$/.test(name)).sort();
  return { pages: [...CORE_PAGES.filter(name => present.has(name)), ...docs], missing: CORE_PAGES.filter(name => !present.has(name)) };
}

/** Resolve a request URL to a file inside root, or null. */
export function resolveRequest(root, url) {
  let pathname;
  try { pathname = decodeURIComponent(new URL(url, 'http://localhost').pathname); } catch { return null; }
  if (pathname.endsWith('/')) pathname += 'index.html';
  const file = path.resolve(root, `.${pathname}`);
  return file === root || file.startsWith(root + path.sep) ? file : null;
}

export function startServer(root) {
  root = path.resolve(root);
  const server = http.createServer((request, response) => {
    if (!['GET', 'HEAD'].includes(request.method)) { response.writeHead(405); response.end(); return; }
    const file = resolveRequest(root, request.url);
    let size;
    try { if (!file || !statSync(file).isFile()) throw new Error(); size = statSync(file).size; } catch { response.writeHead(404); response.end('Not found'); return; }
    response.writeHead(200, { 'Content-Type': mimeType(file), 'Content-Length': size, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    if (request.method === 'HEAD') { response.end(); return; }
    const stream = createReadStream(file);
    stream.on('error', () => response.destroy());
    stream.pipe(response);
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve({ server, origin: `http://127.0.0.1:${server.address().port}` }));
  });
}

export function findChrome(explicit, env = process.env) {
  if (explicit) return explicit;
  if (env.CHROME_PATH) return env.CHROME_PATH;
  const names = process.platform === 'win32' ? ['chrome.exe'] : ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser'];
  for (const dir of (env.PATH ?? '').split(path.delimiter).filter(Boolean)) for (const name of names) if (existsSync(path.join(dir, name))) return path.join(dir, name);
  const standard = { darwin: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', win32: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' }[process.platform];
  return standard && existsSync(standard) ? standard : null;
}

/** Start headless Chrome and resolve with its browser DevTools WebSocket URL. */
function launchChrome(executable, profile) {
  const args = ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check',
    '--disable-background-networking', '--disable-extensions', '--mute-audio', '--window-size=1400,1000',
    // Software WebGL for KiCanvas and model-viewer on machines without a GPU.
    '--enable-unsafe-swiftshader', 'about:blank'];
  // Chrome's sandbox cannot start as root (CI containers); otherwise keep it.
  if (process.getuid?.() === 0 || process.env.PORTAL_SMOKE_NO_SANDBOX === '1') args.unshift('--no-sandbox');
  const child = spawn(executable, args, { stdio: ['ignore', 'ignore', 'pipe'] });
  const ready = new Promise((resolve, reject) => {
    let output = '';
    const timer = setTimeout(() => reject(new Error(`Chrome did not report a DevTools URL within 30 s:\n${output.slice(-2000)}`)), 30000);
    child.on('error', error => { clearTimeout(timer); reject(new Error(`Chrome could not start (${executable}): ${error.message}`)); });
    child.on('exit', code => { clearTimeout(timer); reject(new Error(`Chrome exited (code ${code}) before it was ready. If it reports no usable sandbox, set PORTAL_SMOKE_NO_SANDBOX=1.\n${output.slice(-2000)}`)); });
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', chunk => { output += chunk; const url = parseDevToolsUrl(output); if (url) { clearTimeout(timer); resolve(url); } });
  });
  return { child, ready };
}

/** Minimal DevTools protocol client over one browser WebSocket (flat sessions). */
async function connect(url) {
  const socket = new WebSocket(url);
  await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', () => reject(new Error('DevTools WebSocket failed')), { once: true }); });
  let next = 0; const pending = new Map(), listeners = new Set();
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (message.id !== undefined && pending.has(message.id)) {
      const { resolve, reject } = pending.get(message.id); pending.delete(message.id);
      message.error ? reject(new Error(`${message.error.message}${message.error.data ? `: ${message.error.data}` : ''}`)) : resolve(message.result);
    } else if (message.method) for (const listener of listeners) listener(message);
  });
  socket.addEventListener('close', () => { for (const { reject } of pending.values()) reject(new Error('DevTools connection closed')); pending.clear(); });
  const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
    const id = ++next; pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
  });
  return { send, on: listener => { listeners.add(listener); return () => listeners.delete(listener); }, close: () => socket.close() };
}

// Same-origin requests whose failure is expected:
// - browsers ask for /favicon.ico; the portal has none;
// - the pinned KiCanvas bundle builds its controls from HTML templates with
//   placeholders such as `$$:0:$$`; importing a template with an <img> fetches
//   the placeholder once before KiCanvas substitutes the real attribute.
export const IGNORED_REQUESTS = [/^\/favicon\.ico(?:[?#]|$)/, /^\/(?:[\w.-]+\/)*\$\$:\d+:\$\$(?:[?#]|$)/];

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

/** Open a fresh tab, record exceptions and failed same-origin requests, navigate. */
async function openPage(cdp, origin, page) {
  const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
  const errors = [], requests = new Map();
  let loaded = false;
  const sameOrigin = url => url.startsWith(`${origin}/`) && !IGNORED_REQUESTS.some(pattern => pattern.test(url.slice(origin.length)));
  const off = cdp.on(({ method, params, sessionId: from }) => {
    if (from !== sessionId) return;
    if (method === 'Runtime.exceptionThrown') {
      const details = params.exceptionDetails;
      errors.push(`uncaught exception: ${details.exception?.description?.split('\n')[0] ?? details.text}${details.url ? ` (${details.url.replace(origin, '')}:${details.lineNumber + 1})` : ''}`);
    } else if (method === 'Network.requestWillBeSent') requests.set(params.requestId, params.request.url);
    else if (method === 'Network.responseReceived' && params.response.status >= 400 && sameOrigin(params.response.url)) errors.push(`HTTP ${params.response.status}: ${params.response.url.replace(origin, '')}`);
    else if (method === 'Network.loadingFailed' && !params.canceled && sameOrigin(requests.get(params.requestId) ?? '')) errors.push(`request failed (${params.errorText}): ${requests.get(params.requestId).replace(origin, '')}`);
    else if (method === 'Page.loadEventFired') loaded = true;
  });
  const send = (method, params) => cdp.send(method, params, sessionId);
  await Promise.all([send('Runtime.enable'), send('Network.enable'), send('Page.enable')]);
  const evaluate = async expression => {
    const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
    return result.result.value;
  };
  const waitFor = async (expression, timeout, what) => {
    const end = Date.now() + timeout; let last;
    while (Date.now() < end) {
      try { last = await evaluate(expression); if (last) return last; } catch (error) { last = error.message; }
      await sleep(250);
    }
    throw new Error(`timed out after ${timeout / 1000} s waiting for ${what}`);
  };
  const navigation = await send('Page.navigate', { url: `${origin}/${page}` });
  if (navigation.errorText) errors.push(`navigation failed: ${navigation.errorText}`);
  const end = Date.now() + 20000;
  while (!loaded && Date.now() < end) await sleep(100);
  if (!loaded) errors.push('load event not fired within 20 s');
  return {
    errors, evaluate, waitFor,
    close: async () => { off(); await cdp.send('Target.closeTarget', { targetId }).catch(() => {}); },
  };
}

// The checks. Each returns a detail string on success or throws.
const SETTLE_MS = 1500;
const text = selector => `document.querySelector(${JSON.stringify(selector)})?.textContent.trim() ?? ""`;

async function gerberRender(page) {
  const layers = await page.waitFor(`document.querySelector("#gerber-canvas > g")?.querySelectorAll(":scope > g").length >= 3 && document.querySelector("#gerber-canvas > g").querySelectorAll(":scope > g").length`, 20000, 'at least 3 Gerber layer groups');
  const summary = await page.waitFor(text('#fab-summary'), 20000, 'a non-empty #fab-summary');
  return `${layers} layer groups; summary "${summary.slice(0, 60)}${summary.length > 60 ? '…' : ''}"`;
}
async function gerberBottomPreset(page) {
  await page.waitFor(`(b => b && !b.disabled)(document.querySelector('[data-preset="bottom"]'))`, 20000, 'the bottom preset to be enabled');
  await page.evaluate(`document.querySelector('[data-preset="bottom"]').click()`);
  await page.waitFor(`document.getElementById("gerber-mirror")?.checked === true`, 3000, '#gerber-mirror to be checked');
  return '#gerber-mirror checked';
}
async function gerberPart(page) {
  const selection = await page.waitFor(`(t => t.includes("J4") && t)(${text('#fab-selection')})`, 20000, '#fab-selection to mention J4');
  return `"${selection.slice(0, 60)}${selection.length > 60 ? '…' : ''}"`;
}
async function stackupOrder(page) {
  await page.waitFor(`Boolean(document.querySelector(".order-ok"))`, 15000, '.order-ok (order parameters agree)');
  return 'order parameters agree';
}
async function statisticsManufacturability(page) {
  await page.waitFor(`document.querySelectorAll("#mfg-body tr td.mfg-ok, #mfg-body tr td.mfg-tight, #mfg-body tr td.mfg-below").length >= 10 && document.getElementById("mfg-summary")?.textContent.includes("JLCPCB")`, 15000, 'the manufacturability table and summary');
  return 'manufacturability table filled';
}
async function versionsSummary(page) {
  await page.waitFor(`document.querySelectorAll("#comparison-summary .change-tile").length >= 5 && document.querySelectorAll("#change-list button").length > 0`, 20000, 'the change summary and change list');
  return 'summary tiles and change list';
}
async function versionsGerberDifference(page) {
  await page.waitFor(`document.querySelectorAll("#comparison-summary .change-tile").length >= 5`, 20000, 'the change summary');
  await page.evaluate(`document.querySelector('#compare [data-mode="gerber"]').click()`);
  const layer = await page.waitFor(`document.getElementById("gdiff-results")?.dataset.ready`, 30000, 'the selected Gerber layer to be compared');
  const summary = await page.waitFor(`(t => /added.*removed/.test(t) && t)(${text('#change-list .gdiff-message')})`, 5000, 'an added/removed summary in #change-list');
  await page.waitFor(`(rows => rows.length > 0 && rows.every(r => r.dataset.state !== "pending"))([...document.querySelectorAll("#gdiff-body tr")])`, 60000, 'every layer row of #gdiff-body to be compared');
  return `${layer}: "${summary}"`;
}
async function mechanicsDrawing(page) {
  await page.waitFor(`document.querySelectorAll("#mech-features tr").length >= 5 && document.querySelectorAll("#mech-drawing circle").length >= 4`, 15000, 'the mechanics drawing and feature table');
  return 'drawing and feature table';
}
async function viewerNet(page) {
  // The viewer was once a folded <details>; it is now the default tab. Accept either.
  await page.waitFor(`document.getElementById("design-viewer")?.hasAttribute("open") || document.getElementById("design-viewer-app")?.hidden === false`, 20000, 'the interactive viewer to open');
  // design-viewer.mjs marks the selected net in the list and reports it in
  // #dv-status. Schematic nets carry a leading "/" (/HX_DOUT); the link may omit it.
  try {
    await page.waitFor(`document.querySelector('#dv-net-list button[data-net="/HX_DOUT"], #dv-net-list button[data-net="HX_DOUT"]')?.getAttribute("aria-current") === "true" && /^Net \\/?HX_DOUT:/.test(${text('#dv-status')})`, 30000, 'HX_DOUT to become the selected net');
  } catch (error) {
    throw new Error(`${error.message}; viewer status: "${await page.evaluate(text('#dv-status')).catch(() => '?')}"`);
  }
  return `viewer open; ${await page.evaluate(text('#dv-status'))}`;
}

export const FUNCTIONAL_CHECKS = [
  ['gerbers: layers and fabrication summary', 'gerbers.html', gerberRender],
  ['gerbers: bottom preset mirrors the view', 'gerbers.html', gerberBottomPreset],
  ['gerbers: ?part=J4 selects J4', 'gerbers.html?part=J4', gerberPart],
  ['stackup: order parameters agree', 'stackup.html', stackupOrder],
  ['statistics: manufacturability against JLCPCB and PCBWay', 'statistics.html', statisticsManufacturability],
  ['versions: change summary and list', 'versions.html', versionsSummary],
  ['versions: Gerber difference summarises a layer', 'versions.html', versionsGerberDifference],
  ['mechanical: drawing and features', 'mechanical.html', mechanicsDrawing],
  ['explore: ?net=HX_DOUT opens the viewer on HX_DOUT', 'explore.html?net=HX_DOUT', viewerNet],
];

async function runCheck(cdp, origin, name, url, check) {
  const started = Date.now();
  let page, detail, failure;
  try {
    page = await openPage(cdp, origin, url);
    if (check) detail = await check(page);
    await sleep(SETTLE_MS); // let late module errors and fetches surface
    if (page.errors.length) failure = page.errors.join('\n      ');
  } catch (error) {
    failure = [error.message, ...(page?.errors ?? [])].join('\n      ');
  } finally { await page?.close(); }
  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  console.log(`${failure ? 'FAIL' : 'PASS'}  ${name} (${seconds} s)${failure ? `\n      ${failure}` : detail ? ` — ${detail}` : ''}`);
  return !failure;
}

export async function smoke(siteDir, { chrome } = {}) {
  const root = path.resolve(siteDir);
  if (!existsSync(path.join(root, 'index.html'))) throw new Error(`${root} has no index.html; pass a build's site directory.`);
  const executable = findChrome(chrome);
  if (!executable) throw new Error('Chrome not found: pass --chrome <path> or set CHROME_PATH.');
  const { pages, missing } = discoverPages(readdirSync(root));
  const profile = mkdtempSync(path.join(tmpdir(), 'portal-smoke-'));
  let server, browser, cdp;
  const results = [];
  // Hard ceiling, so a hung browser can never hang CI.
  const watchdog = setTimeout(() => { console.error('FAIL  smoke test exceeded 10 minutes'); browser?.child.kill('SIGKILL'); server?.closeAllConnections?.(); server?.close(); process.exit(1); }, 10 * 60 * 1000);
  try {
    const started = await startServer(root);
    server = started.server;
    const origin = started.origin;
    browser = launchChrome(executable, profile);
    cdp = await connect(await browser.ready);
    console.log(`Portal smoke test: ${root}\nServed at ${origin}; ${executable}`);
    for (const name of missing) { console.log(`FAIL  ${name}: page missing`); results.push(false); }
    for (const page of pages) results.push(await runCheck(cdp, origin, `load ${page}`, page));
    for (const [name, url, check] of FUNCTIONAL_CHECKS) results.push(await runCheck(cdp, origin, name, url, check));
  } finally {
    clearTimeout(watchdog);
    await cdp?.send('Browser.close').catch(() => {});
    cdp?.close();
    if (browser && browser.child.exitCode === null) {
      const exited = new Promise(resolve => browser.child.once('exit', resolve));
      await Promise.race([exited, sleep(3000)]);
      if (browser.child.exitCode === null) browser.child.kill('SIGKILL');
    }
    server?.closeAllConnections?.();
    await new Promise(resolve => server ? server.close(resolve) : resolve());
    // Chrome may hold profile files briefly after exit (notably on Windows).
    for (let attempt = 0; attempt < 5; attempt++) { try { rmSync(profile, { recursive: true, force: true }); break; } catch { await sleep(300); } }
  }
  const failed = results.filter(ok => !ok).length;
  console.log(failed ? `${failed} of ${results.length} checks failed.` : `All ${results.length} checks passed.`);
  return failed === 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const { values, positionals } = parseArgs({ allowPositionals: true, options: { chrome: { type: 'string' } } });
    if (positionals.length !== 1) { console.error('Usage: node tools/smoke-portal.mjs <siteDir> [--chrome <path>]'); process.exit(2); }
    process.exitCode = (await smoke(positionals[0], { chrome: values.chrome })) ? 0 : 1;
  } catch (error) {
    console.error(`FAIL  ${error.message}`);
    process.exitCode = 1;
  }
}
