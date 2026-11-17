// Every portal script must parse: one syntax error silently disables the
// whole page (layers, 3D model, revision selector) in the browser.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const scripts = [
  ...readdirSync(join(root, 'web')).filter(name => /\.m?js$/.test(name)).map(name => join(root, 'web', name)),
  ...readdirSync(join(root, 'tools')).filter(name => name.endsWith('.mjs')).map(name => join(root, 'tools', name)),
  ...readdirSync(join(root, 'tools/lib')).map(name => join(root, 'tools/lib', name)),
  join(root, 'release.mjs'), join(root, 'preview.mjs'),
];

// The portal loads every script as an ES module. `node --check` on an
// ambiguous .js file can exit 0 despite a syntax error, so .js files are
// checked through a temporary .mjs copy that forces module parsing.
for (const script of scripts) {
  test(`parses as a module: ${script.slice(root.length + 1)}`, () => {
    let target = script; let scratch = null;
    if (script.endsWith('.js')) {
      scratch = mkdtempSync(join(tmpdir(), 'syntax-'));
      target = join(scratch, basename(script).replace(/\.js$/, '.mjs'));
      copyFileSync(script, target);
    }
    try {
      const check = spawnSync(process.execPath, ['--check', target], { encoding: 'utf8' });
      assert.equal(check.status, 0, check.stderr);
    } finally { if (scratch) rmSync(scratch, { recursive: true, force: true }); }
  });
}
