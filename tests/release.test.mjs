// Release-tooling checks (port of the former Test-Release.ps1, plus cross-platform cases).
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  assertAssemblyReady, assertCleanReports, assertDesignUnchanged, assertHardwareRevision, defaultKiCadCliPaths,
  designInventory, fileDigest, findKiCadCli, initializeKiCadRuntime, readJson, resolveChildPath, toMillimetres,
} from '../tools/lib/common.mjs';
import { formatCsv, ipcComponents, markdownToHtml, parseCsv, readCsv, verifyZip, zipDirectory } from '../tools/lib/formats.mjs';
import { buildAssembly } from '../tools/build-assembly.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const board = join(root, 'src/pico_scale_controller.kicad_pcb');
const scratch = () => mkdtempSync(join(tmpdir(), 'coffee-scale-test-'));
const erc = { sheets: [{ violations: [] }] };
const drc = { violations: [], unconnected_items: [], schematic_parity: [] };

test('Clean electrical reports pass', () => assertCleanReports(erc, drc));
test('Missing report schema fails closed', () => assert.throws(() => assertCleanReports({}, drc), /schema/));
test('ERC issue blocks validation', () => assert.throws(() => assertCleanReports({ sheets: [{ violations: [{ severity: 'error' }] }] }, drc), /1 ERC/));
test('Unconnected items block validation', () => assert.throws(() => assertCleanReports(erc, { ...drc, unconnected_items: [{ type: 'unconnected_items' }] }), /1 PCB/));
test('Schematic parity issues block validation', () => assert.throws(() => assertCleanReports(erc, { ...drc, schematic_parity: [{ type: 'mismatch' }] }), /1 PCB/));
test('Decimal commas are normalized', () => assert.equal(toMillimetres('100,0000 mm'), 100));
test('Output path traversal is rejected', () => assert.throws(() => resolveChildPath(root, '../outside'), /escapes/));
test('Absolute configured paths are rejected', () => {
  assert.throws(() => resolveChildPath(root, root), /relative/);
  assert.throws(() => resolveChildPath(root, 'C:/Windows'), /relative/);
});
test('Actual hardware revision matches the declared release', () => assertHardwareRevision(board, 'E'));
test('Wrong hardware revision is rejected', () => assert.throws(() => assertHardwareRevision(board, 'INCORRECT'), /title block/));
test('Validation-only cannot bypass strict assembly approval', () => {
  const run = spawnSync(process.execPath, [join(root, 'release.mjs'), '--validate-only', '--require-assembly-ready'], { encoding: 'utf8' });
  assert.notEqual(run.status, 0); assert.match(run.stderr, /cannot be combined/);
});
test('Unknown command-line options are rejected', () => {
  const run = spawnSync(process.execPath, [join(root, 'release.mjs'), '-ValidateOnly'], { encoding: 'utf8' });
  assert.notEqual(run.status, 0);
});
test('Assembly strict gate rejects incomplete profiles', () => assert.throws(() => assertAssemblyReady({ ready: false, blockers: ['MPN missing'] })));
test('Assembly strict gate rejects contradictory readiness', () => assert.throws(() => assertAssemblyReady({ ready: true, blockers: ['Placement not reviewed'] })));

test('Source inventory detects changes and ignores dot-files', () => {
  const dir = scratch();
  try {
    mkdirSync(join(dir, 'lib'));
    writeFileSync(join(dir, 'board.txt'), 'original'); writeFileSync(join(dir, 'lib/part.txt'), 'part');
    const config = { inputFiles: ['board.txt'], inputDirectories: ['lib'] };
    const inventory = designInventory(dir, config);
    assert.deepEqual(inventory.map(item => item.path), ['board.txt', 'lib/part.txt']);
    writeFileSync(join(dir, 'lib/.DS_Store'), 'finder noise');
    assertDesignUnchanged(dir, config, inventory);
    writeFileSync(join(dir, 'board.txt'), 'changed');
    assert.throws(() => assertDesignUnchanged(dir, config, inventory), /Design changed/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('Assembly readiness, rotation correction and normalization', () => {
  const dir = scratch();
  try {
    mkdirSync(join(dir, 'output/assembly'), { recursive: true });
    writeFileSync(join(dir, 'output/assembly/board.ipc2581.xml'), '<IPC-2581><Component refDes="R1" part="Resistor" packageRef="0603" layerRef="F.Cu"><Location x="10" y="-10"/></Component><Component refDes="H1" part="Hole" packageRef="Hole" layerRef="F.Cu"><Location x="5" y="-5"/></Component></IPC-2581>');
    writeFileSync(join(dir, 'output/assembly/bom-native.csv'), 'Reference,Value,Footprint,Manufacturer,MPN,Datasheet,DNP,EXCLUDE_FROM_BOM\nR1,10k,0603,,,,,\n');
    writeFileSync(join(dir, 'output/assembly/positions-native.csv'), 'Ref,Val,Package,PosX,PosY,Rot,Side\nR1,10k,0603,10,-10,0,top\n');
    const header = 'Reference,Stage,Manufacturer,MPN,Supplier,SupplierPart,RotationOffsetDeg,Verified,Notes';
    const profile = rows => writeFileSync(join(dir, 'profile.csv'), [header, 'H1,mechanical,,,,,0,false,Mounting feature', ...rows].join('\n') + '\n');
    const config = { assembly: { profile: 'profile.csv', target: 'test', placementReviewBoardSha256: 'old-board' } };
    const build = () => buildAssembly({ root: dir, output: join(dir, 'output'), config, boardHash: 'new-board' });
    const cpl = () => readCsv(join(dir, 'output/assembly/jlcpcb-cpl-CANDIDATE.csv'));

    profile([]);
    let readiness = build();
    assert.equal(readiness.ready, false); assert.equal(readiness.blockers.length, 3);

    profile(['R1,factory,Test Manufacturer,TEST-10K,Test Supplier,TEST-1,90,true,TEST FIXTURE ONLY']);
    config.assembly.placementReviewBoardSha256 = 'new-board';
    readiness = build();
    assert.equal(readiness.ready, true); assert.equal(cpl()[0].Rotation, '90');
    const bom = readCsv(join(dir, 'output/assembly/bom-with-stages.csv'));
    assert.deepEqual(bom.map(row => [row.Reference, row.Stage, row.Verified]), [['H1', 'mechanical', 'False'], ['R1', 'factory', 'True']]);

    profile(['R1,factory,Test Manufacturer,TEST-10K,Test Supplier,TEST-1,-450,true,TEST FIXTURE ONLY']);
    build(); assert.equal(cpl()[0].Rotation, '270');

    profile(['R1,factory,,,,,0,true,x', 'R1,factory,,,,,0,true,x']);
    assert.throws(build, /Duplicate/);
    profile(['R9,factory,,,,,0,true,absent']);
    assert.throws(build, /absent reference/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('Vendored viewer checksums match their lock', () => {
  for (const asset of readJson(join(root, 'web/vendor/lock.json')).assets) assert.equal(fileDigest(join(root, 'web/vendor', asset.file)), asset.sha256, asset.file);
});

// ------------------------------------------------------------- format helpers

test('CSV round-trips quotes, commas and newlines', () => {
  const rows = [{ A: 'plain', B: 'has, comma', C: 'say "hi"' }, { A: 'multi\nline', B: '', C: 'x' }];
  assert.deepEqual(parseCsv(formatCsv(rows)), rows);
  assert.deepEqual(parseCsv('\uFEFFa,b\r\n1,2\r\n'), [{ a: '1', b: '2' }]);
});

test('IPC-2581 components are read namespace-agnostically', () => {
  const xml = '<x:IPC-2581 xmlns:x="urn:ipc"><x:Component refDes="U1" layerRef="B.Cu" packageRef="SOT&amp;23"><x:Xform rotation="90" mirror="true"/><x:Location x="1.5" y="-2"/></x:Component><Component refDes="H1"/></x:IPC-2581>';
  const [u1, h1] = ipcComponents(xml);
  assert.deepEqual(u1.attributes, { refDes: 'U1', layerRef: 'B.Cu', packageRef: 'SOT&23' });
  assert.deepEqual(u1.xform, { rotation: '90', mirror: 'true' }); assert.deepEqual(u1.location, { x: '1.5', y: '-2' });
  assert.equal(h1.location, null);
});

test('ZIP archives round-trip and are verified', () => {
  const dir = scratch();
  try {
    mkdirSync(join(dir, 'in/nested'), { recursive: true });
    writeFileSync(join(dir, 'in/a.gbr'), 'G04 test*\nM02*\n'); writeFileSync(join(dir, 'in/nested/b.txt'), Buffer.alloc(5000, 7));
    zipDirectory(join(dir, 'in'), join(dir, 'out.zip'));
    assert.deepEqual(verifyZip(join(dir, 'out.zip')), ['a.gbr', 'nested/b.txt']);
    const bytes = readFileSync(join(dir, 'out.zip')); bytes[40] ^= 0xff; writeFileSync(join(dir, 'bad.zip'), bytes);
    assert.throws(() => verifyZip(join(dir, 'bad.zip')));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('Markdown renders the documentation constructs in use', () => {
  const html = markdownToHtml('# Circuit and power\n\nText with **bold**, `GP0_X` and UART_TX.\nSecond line.\n\n- one\n  continued\n- two\n\n1. first\n2. second\n\n| A | B |\n|---|---:|\n| x | <y> |\n');
  assert.match(html, /<h1 id="circuit-and-power">Circuit and power<\/h1>/);
  assert.match(html, /<strong>bold<\/strong>, <code>GP0_X<\/code> and UART_TX\./);
  assert.match(html, /<li>one\ncontinued<\/li>/); assert.match(html, /<ol>\n<li>first<\/li>/);
  assert.match(html, /<td style="text-align: right;">&lt;y&gt;<\/td>/);
});

test('Every maintained document renders with an h1 title', () => {
  for (const name of ['01-overview', '02-circuit', '03-interfaces', '04-assembly-testing', '05-mechanics-notes', '06-revision-review', '07-manufacturing-control']) {
    const html = markdownToHtml(readFileSync(join(root, `docs/board/${name}.md`), 'utf8'));
    assert.match(html, /^<h1[^>]*>.+<\/h1>/, name); assert.doesNotMatch(html, /\*\*|```/, name);
  }
});

// ---------------------------------------------------------- KiCad discovery

test('Platform default kicad-cli locations', () => {
  assert.match(defaultKiCadCliPaths(10, 'win32')[0], /KiCad[\\/]10\.0[\\/]bin[\\/]kicad-cli\.exe$/);
  assert.equal(defaultKiCadCliPaths(10, 'darwin')[0], '/Applications/KiCad/KiCad.app/Contents/MacOS/kicad-cli');
  assert.ok(defaultKiCadCliPaths(10, 'linux').includes('/usr/bin/kicad-cli'));
});

test('Explicit kicad-cli path must exist', () => {
  assert.throws(() => findKiCadCli(join(tmpdir(), 'no-such-kicad-cli'), 10), /not found/);
});

for (const [layout, template] of [['Windows/Linux', 'share/kicad/template'], ['macOS app bundle', 'SharedSupport/template']]) {
  test(`KiCad library tables are found in the ${layout} layout`, () => {
    const dir = scratch();
    try {
      const bin = join(dir, 'install', layout.startsWith('mac') ? 'MacOS' : 'bin');
      mkdirSync(bin, { recursive: true }); writeFileSync(join(bin, 'kicad-cli'), '');
      const templateDir = join(dir, 'install', template);
      mkdirSync(templateDir, { recursive: true });
      for (const kind of ['fp', 'sym']) writeFileSync(join(templateDir, `${kind}-lib-table`), '()');
      initializeKiCadRuntime(join(dir, 'runtime'), join(bin, 'kicad-cli'), 10);
      const table = readFileSync(join(dir, 'runtime/10.0/fp-lib-table'), 'utf8');
      assert.match(table, /^\(fp_lib_table \(version 7\) \(lib \(name "KiCad"\) \(type "Table"\)/);
      assert.ok(table.includes(templateDir.split('\\').join('/')));
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
}

// ------------------------------------------- validation path with a fake KiCad

test('Validation-only release runs end to end against a stand-in kicad-cli', { skip: process.platform === 'win32' && 'stand-in CLI is a POSIX script' }, () => {
  const dir = scratch();
  const outputDirectory = `work/test-releases/${Date.now()}`;
  const config = join(root, 'work', `release-test-${process.pid}.json`);
  try {
    const bin = join(dir, 'bin'); mkdirSync(bin);
    mkdirSync(join(dir, 'share/kicad/template'), { recursive: true });
    for (const kind of ['fp', 'sym']) writeFileSync(join(dir, 'share/kicad/template', `${kind}-lib-table`), '()');
    const cli = join(bin, 'kicad-cli');
    writeFileSync(cli, `#!${process.execPath}
const fs = require('fs'); const args = process.argv.slice(2);
if (!process.env.KICAD_CONFIG_HOME || !fs.existsSync(process.env.KICAD_CONFIG_HOME + '/10.0/fp-lib-table')) { console.error('isolated config missing'); process.exit(3); }
const out = args[args.indexOf('--output') + 1];
if (args[0] === 'version') console.log('10.0.0');
else if (args[1] === 'erc') fs.writeFileSync(out, JSON.stringify({ sheets: [{ violations: [] }] }));
else if (args[1] === 'drc') fs.writeFileSync(out, JSON.stringify({ violations: [], unconnected_items: [], schematic_parity: [] }));
else if (args[2] === 'stats') fs.writeFileSync(out, JSON.stringify({ board: { has_outline: true, width: '100.0000 mm', height: '60.0000 mm', board_thickness: '1.6000 mm' } }));
else { console.error('unexpected ' + args.join(' ')); process.exit(2); }
`);
    chmodSync(cli, 0o755);
    mkdirSync(join(root, 'work'), { recursive: true });
    writeFileSync(config, JSON.stringify({ ...readJson(join(root, 'release.json')), outputDirectory }));
    const run = spawnSync(process.execPath, [join(root, 'release.mjs'), '--validate-only', '--config', config, '--kicad-cli', cli], { encoding: 'utf8' });
    assert.equal(run.status, 0, run.stderr + run.stdout);
    const output = run.stdout.match(/OUTPUT: (.+)/)[1].trim();
    const manifest = readJson(join(output, 'manifest.json'));
    assert.equal(manifest.status, 'validation-passed'); assert.equal(manifest.kicadVersion, '10.0.0');
    assert.equal(manifest.originalDesignUnchanged, true);
    assert.ok(manifest.files.some(file => file.path === 'source/pico_scale_controller.kicad_pcb'));
    assert.ok(!manifest.files.some(file => file.path.startsWith('.runtime/')));
    assert.ok(existsSync(join(output, 'reports/build.log')));
  } finally {
    rmSync(dir, { recursive: true, force: true }); rmSync(config, { force: true });
    rmSync(join(root, outputDirectory), { recursive: true, force: true });
  }
});

test('Doc cross-links become portal page links; other links are untouched', async () => {
  const { portalDocLinks } = await import('../tools/build-site.mjs');
  assert.equal(portalDocLinks('<a href="02-circuit.md">x</a> <a href="03-interfaces.md#pins">y</a>'), '<a href="doc-02-circuit.html">x</a> <a href="doc-03-interfaces.html#pins">y</a>');
  assert.equal(portalDocLinks('<a href="https://example.com/a.md">z</a>'), '<a href="https://example.com/a.md">z</a>');
});

test('Every doc cross-link points to an existing document', () => {
  const names = new Set(readdirSync(join(root, 'docs/board')).filter(f => f.endsWith('.md')));
  for (const file of names) {
    for (const [, target] of readFileSync(join(root, 'docs/board', file), 'utf8').matchAll(/\]\(((?!https?:)[^)#\s]+\.md)(#[^)]*)?\)/g)) {
      assert.ok(names.has(target), `${file} links to missing ${target}`);
    }
  }
});

test('Links to the published portal stay inside the current portal', async () => {
  const { portalDocLinks } = await import('../tools/build-site.mjs');
  assert.equal(portalDocLinks('<a href="https://jpnbino.github.io/coffee-scale/explore.html?net=HX_DOUT">n</a>'), '<a href="explore.html?net=HX_DOUT">n</a>');
  assert.equal(portalDocLinks('<a href="https://jpnbino.github.io/coffee-scale/">home</a>'), '<a href="index.html">home</a>');
});

test('Every diagram a doc embeds exists, and every diagram is used', () => {
  const dir = join(root, 'docs/board');
  const diagrams = new Set(readdirSync(join(dir, 'diagrams')).filter(f => f.endsWith('.svg')));
  const used = new Set();
  for (const file of readdirSync(dir).filter(f => f.endsWith('.md'))) {
    for (const [, alt, target] of readFileSync(join(dir, file), 'utf8').matchAll(/!\[([^\]]*)\]\(diagrams\/([^)\s]+)\)/g)) {
      assert.ok(diagrams.has(target), `${file} embeds missing diagrams/${target}`);
      assert.ok(alt.length > 20, `${file}: diagrams/${target} needs descriptive alt text`);
      used.add(target);
    }
  }
  assert.deepEqual([...diagrams].filter(d => !used.has(d)), []);
});

test('Viewer deep links in docs name nets and parts that exist in the schematic', () => {
  const sch = readFileSync(join(root, 'src/pico_scale_controller.kicad_sch'), 'utf8');
  const refs = new Set([...sch.matchAll(/\(property "Reference" "([A-Z]+\d+)"/g)].map(m => m[1]));
  const labels = new Set([...sch.matchAll(/\((?:label|global_label|hierarchical_label) "([^"]+)"/g)].map(m => m[1]));
  const dir = join(root, 'docs/board');
  for (const file of readdirSync(dir).filter(f => f.endsWith('.md'))) {
    for (const [, kind, name] of readFileSync(join(dir, file), 'utf8').matchAll(/explore\.html\?(part|net)=([^)\s#&]+)/g)) {
      assert.ok((kind === 'part' ? refs : labels).has(name), `${file} links to unknown ${kind} ${name}`);
    }
  }
});
