#!/usr/bin/env node
// Serve the newest complete local build (or --site <dir>) on http://127.0.0.1:<port>.
//   node preview.mjs [--site <build>/site] [--port 8787]
import { existsSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { spawnSync } from 'node:child_process';
import { readJson } from './tools/lib/common.mjs';

const root = dirname(fileURLToPath(import.meta.url));
try {
  const { values } = parseArgs({ options: { site: { type: 'string' }, port: { type: 'string', default: '8787' } } });
  const port = Number(values.port);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('--port must be an integer from 1024 to 65535.');
  let site = values.site;
  if (!site) {
    const releases = join(root, 'build/releases');
    const latest = existsSync(releases) && readdirSync(releases, { withFileTypes: true })
      .filter(entry => entry.isDirectory()).map(entry => entry.name).sort().reverse()
      .find(name => {
        const manifest = join(releases, name, 'manifest.json');
        try { return existsSync(manifest) && readJson(manifest).status === 'prototype-build-complete'; } catch { return false; }
      });
    if (!latest) throw new Error('No complete local build found. Run "node release.mjs" first.');
    site = join(releases, latest, 'site');
  }
  const result = spawnSync(process.execPath, [join(root, 'tools/preview.mjs'), resolve(site), String(port)], { stdio: 'inherit' });
  if (result.error || (result.status !== 0 && result.signal !== 'SIGINT')) throw new Error(`Preview server exited with code ${result.status}`);
} catch (error) {
  console.error(`FAIL: ${error.message}`);
  process.exitCode = 1;
}
