// Shared release helpers. Platform-neutral: no shell, no PowerShell, no
// Windows-only paths. Every function fails closed by throwing.
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import {
  appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, statSync, writeFileSync,
} from 'node:fs';
import { delimiter, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';

export const toPosix = path => path.split(sep).join('/');

/** Resolve a configured relative path and refuse anything that escapes `root`. */
export function resolveChildPath(root, relativePath) {
  if (isAbsolute(relativePath) || /^[a-zA-Z]:[\\/]/.test(relativePath)) throw new Error(`Expected relative path: ${relativePath}`);
  const base = resolve(root);
  const full = resolve(base, relativePath);
  const rel = relative(base, full);
  if (!rel || rel === '..' || rel.startsWith('..' + sep) || isAbsolute(rel)) throw new Error(`Path escapes its root: ${relativePath}`);
  return full;
}

export const readJson = path => JSON.parse(readFileSync(path, 'utf8').replace(/^\uFEFF/, ''));

/** JSON safe to embed in HTML/script: <, >, &, ' are escaped (only ever inside strings). */
export function htmlSafeJson(value, indent) {
  return JSON.stringify(value, null, indent).replace(/[<>&']/g, c => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);
}

export const writeJson = (path, value) => writeFileSync(path, htmlSafeJson(value, 2) + '\n', 'utf8');

export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
export const fileDigest = path => sha256(readFileSync(path));

/** Regular files below `directory`, recursively, skipping dot-files (e.g. .DS_Store). */
export function listFiles(directory, { includeHidden = false } = {}) {
  const found = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (!includeHidden && entry.name.startsWith('.')) continue;
    const full = join(directory, entry.name);
    if (entry.isDirectory()) found.push(...listFiles(full, { includeHidden }));
    else if (entry.isFile()) found.push(full);
  }
  return found;
}

const byPath = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

function inventory(root, paths) {
  return [...new Set(paths)].sort(byPath).map(path => ({ path: toPosix(relative(root, path)), sha256: fileDigest(path) }));
}

export function designInventory(root, config) {
  const paths = config.inputFiles.map(name => {
    const path = resolveChildPath(root, name);
    if (!statSync(path).isFile()) throw new Error(`Design input is not a file: ${name}`);
    return path;
  });
  for (const directory of config.inputDirectories) paths.push(...listFiles(resolveChildPath(root, directory)));
  return inventory(root, paths);
}

export function assertDesignUnchanged(root, config, before) {
  if (JSON.stringify(before) !== JSON.stringify(designInventory(root, config))) {
    throw new Error('Design changed during the build. These outputs must not be released; save and rebuild.');
  }
}

/** Everything that defines how a build is produced, so mid-build edits are detected. */
export function buildInventory(root, configPath, config) {
  const paths = [resolve(configPath), join(root, 'release.mjs'), join(root, 'package.json'), resolveChildPath(root, config.assembly.profile)];
  for (const directory of ['tools', config.documentationDirectory, config.siteDirectory]) paths.push(...listFiles(resolveChildPath(root, directory)));
  for (const version of config.history) {
    const project = resolveChildPath(root, version.projectDirectory);
    const release = resolveChildPath(root, version.releaseDirectory);
    for (const name of config.inputFiles) if (existsSync(join(project, name))) paths.push(join(project, name));
    for (const directory of config.inputDirectories) paths.push(...listFiles(join(project, directory)));
    paths.push(join(release, 'manifest.json'));
    paths.push(...readdirSync(join(release, 'gerbers'), { withFileTypes: true }).filter(e => e.isFile()).map(e => join(release, 'gerbers', e.name)));
  }
  return inventory(root, paths);
}

/** Run kicad-cli, append its output to the build log and throw with the log tail on failure. */
export function runKiCad(kicad, args, log) {
  console.log('  KiCad: ' + args.slice(0, 3).join(' '));
  appendFileSync(log, '> kicad-cli ' + args.join(' ') + '\n');
  const result = spawnSync(kicad.cli, args, { env: kicad.env, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  appendFileSync(log, (result.stdout ?? '') + (result.stderr ?? ''));
  if (result.error || result.status !== 0) {
    const tail = readFileSync(log, 'utf8').trimEnd().split(/\r?\n/).slice(-6).join('\n');
    throw new Error(`KiCad command failed (${result.error?.message ?? result.status}): ${args.join(' ')}\n${tail}`);
  }
  return result.stdout;
}

/** Run a Node helper script with the same Node binary. */
export function runNode(script, args, failure) {
  const result = spawnSync(process.execPath, [script, ...args], { stdio: 'inherit' });
  if (result.error || result.status !== 0) throw new Error(failure);
}

export function toMillimetres(value) {
  const number = String(value).replace(/\s*mm.*$/s, '').trim().replace(',', '.');
  if (!/^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i.test(number)) throw new Error(`Not a millimetre value: ${value}`);
  return Number(number);
}

export function assertCleanReports(erc, drc) {
  const has = (object, key) => object && Object.hasOwn(object, key);
  if (!has(erc, 'sheets') || !has(drc, 'violations') || !has(drc, 'unconnected_items') || !has(drc, 'schematic_parity')) {
    throw new Error('Validation report schema is missing required fields.');
  }
  const ercIssues = erc.sheets.flatMap(sheet => sheet.violations ?? []);
  const drcIssues = [...drc.violations, ...drc.unconnected_items, ...drc.schematic_parity];
  if (ercIssues.length || drcIssues.length) throw new Error(`Validation failed: ${ercIssues.length} ERC and ${drcIssues.length} PCB/parity issues.`);
}

export function assertAssemblyReady(readiness) {
  if (readiness.ready !== true || (readiness.blockers ?? []).length) throw new Error('Assembly release blocked. See assembly/readiness.json.');
}

export function assertBoardDimensions(statistics, config) {
  if (!statistics.board?.has_outline) throw new Error('The board outline is missing.');
  for (const [actualKey, expectedKey] of [['width', 'widthMm'], ['height', 'heightMm'], ['board_thickness', 'thicknessMm']]) {
    if (Math.abs(toMillimetres(statistics.board[actualKey]) - config.manufacturing[expectedKey]) > 0.01) {
      throw new Error(`Board ${actualKey} differs from release.json. Review the mechanical/manufacturing configuration.`);
    }
  }
}

export function assertHardwareRevision(boardPath, expected) {
  const content = readFileSync(boardPath, 'utf8');
  const block = content.match(/\(title_block\b(.*?)^\s*\)/ms);
  const revision = block?.[1].match(/\(rev\s+"((?:\\.|[^"\\])*)"\)/);
  const escaped = expected.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (!revision || !new RegExp(`^${escaped}(?:\\s|$)`).test(revision[1])) {
    throw new Error('Hardware revision in release.json does not match the PCB title block.');
  }
}

// ---------------------------------------------------------------- KiCad discovery

/** Default install locations, by platform, for a KiCad major version. */
export function defaultKiCadCliPaths(major, platform = process.platform) {
  if (platform === 'win32') {
    const programFiles = [process.env.ProgramFiles, 'C:/Program Files'].filter(Boolean);
    return [...new Set(programFiles)].map(base => join(base, 'KiCad', `${major}.0`, 'bin', 'kicad-cli.exe'));
  }
  if (platform === 'darwin') {
    return [`/Applications/KiCad/KiCad.app/Contents/MacOS/kicad-cli`, `/Applications/KiCad ${major}/KiCad.app/Contents/MacOS/kicad-cli`];
  }
  return ['/usr/bin/kicad-cli', '/usr/local/bin/kicad-cli'];
}

function onPath(name) {
  const names = process.platform === 'win32' ? [`${name}.exe`, name] : [name];
  for (const directory of (process.env.PATH ?? '').split(delimiter).filter(Boolean)) {
    for (const candidate of names) {
      const path = join(directory, candidate);
      try { if (statSync(path).isFile()) return path; } catch { /* keep looking */ }
    }
  }
  return null;
}

/** Explicit option, then $KICAD_CLI, then PATH, then the platform's standard install location. */
export function findKiCadCli(explicit, major) {
  const candidates = [explicit, process.env.KICAD_CLI, onPath('kicad-cli'), ...defaultKiCadCliPaths(major)].filter(Boolean);
  const chosen = explicit || process.env.KICAD_CLI ? candidates[0] : candidates.find(path => existsSync(path));
  if (!chosen || !existsSync(chosen)) {
    throw new Error(`kicad-cli for KiCad ${major} was not found${chosen ? ` at ${chosen}` : ''}. Install KiCad ${major}, put kicad-cli on PATH, set KICAD_CLI, or pass --kicad-cli <path>.`);
  }
  return resolve(chosen);
}

/** KiCad's installed library-table templates, relative to the real kicad-cli location. */
export function kicadTemplateCandidates(cli, major) {
  const bin = dirname(realpathSync(cli));
  return [
    process.env[`KICAD${major}_TEMPLATE_DIR`],
    join(bin, '..', 'share', 'kicad', 'template'),          // Windows and Linux packages
    join(bin, '..', 'SharedSupport', 'template'),           // macOS app bundle
    '/usr/share/kicad/template', '/usr/local/share/kicad/template',
  ].filter(Boolean).map(path => resolve(path));
}

/** Write an isolated KiCad config whose global library tables point at the installed ones. */
export function initializeKiCadRuntime(runtime, cli, major) {
  const template = kicadTemplateCandidates(cli, major).find(path => existsSync(join(path, 'fp-lib-table')) && existsSync(join(path, 'sym-lib-table')));
  if (!template) throw new Error(`Missing installed KiCad library tables. Looked in: ${kicadTemplateCandidates(cli, major).join(', ')}`);
  const versionDirectory = join(runtime, `${major}.0`);
  ensureDir(versionDirectory);
  for (const kind of ['fp', 'sym']) {
    const uri = toPosix(join(template, `${kind}-lib-table`));
    writeFileSync(join(versionDirectory, `${kind}-lib-table`), `(${kind}_lib_table (version 7) (lib (name "KiCad") (type "Table") (uri "${uri}") (options "")))\n`, 'utf8');
  }
  return template;
}

export function ensureDir(path) {
  mkdirSync(path, { recursive: true });
  return path;
}

export const htmlEncode = text => String(text).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
