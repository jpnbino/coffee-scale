#!/usr/bin/env node
// Release and validation entry point. Runs the same way on Windows, macOS and Linux.
//
//   node release.mjs --validate-only            ERC, DRC, parity and dimension checks
//   node release.mjs                            full prototype release build
//   node release.mjs --require-assembly-ready   full build that fails on assembly blockers
//
// Options: --config <release.json>  --kicad-cli <path to kicad-cli>  (or set KICAD_CLI)
import { copyFileSync, existsSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { spawnSync } from 'node:child_process';
import {
  assertAssemblyReady, assertBoardDimensions, assertCleanReports, assertDesignUnchanged, assertHardwareRevision,
  buildInventory, designInventory, ensureDir, fileDigest, findKiCadCli, initializeKiCadRuntime, listFiles,
  readJson, resolveChildPath, runKiCad, toPosix, writeJson,
} from './tools/lib/common.mjs';
import { exportRelease } from './tools/export-release.mjs';
import { buildAssembly } from './tools/build-assembly.mjs';
import { buildReview } from './tools/build-review.mjs';
import { buildSite } from './tools/build-site.mjs';
import { completeRelease } from './tools/complete-release.mjs';

const root = dirname(fileURLToPath(import.meta.url));

export function parseOptions(argv) {
  const { values } = parseArgs({
    args: argv, strict: true, allowPositionals: false,
    options: {
      config: { type: 'string', default: join(root, 'release.json') },
      'kicad-cli': { type: 'string' },
      'validate-only': { type: 'boolean', default: false },
      'require-assembly-ready': { type: 'boolean', default: false },
      help: { type: 'boolean', short: 'h', default: false },
    },
  });
  if (values['validate-only'] && values['require-assembly-ready']) throw new Error('--validate-only and --require-assembly-ready cannot be combined.');
  return { config: resolve(values.config), kicadCli: values['kicad-cli'], validateOnly: values['validate-only'], requireAssemblyReady: values['require-assembly-ready'], help: values.help };
}

const timestamp = date => date.toISOString().replace(/[-:]/g, '').replace(/\.(\d{3})Z$/, '$1Z');

export function release(options) {
  const settings = readJson(options.config);
  if (settings.schemaVersion !== 1) throw new Error('Unsupported release configuration schema.');
  const major = settings.project.kicadMajor;
  const source = resolveChildPath(root, settings.project.sourceDirectory);
  const cli = findKiCadCli(options.kicadCli, major);
  const before = designInventory(source, settings);
  const inputs = buildInventory(root, options.config, settings);
  const pcbName = `${settings.project.basename}.kicad_pcb`;
  const pcbHash = before.find(item => item.path === pcbName)?.sha256;
  if (!pcbHash) throw new Error(`Design inventory does not include ${pcbName}.`);
  const started = new Date();
  const buildId = `${settings.project.revision}-${timestamp(started)}-${pcbHash.slice(0, 8)}`;
  const output = resolveChildPath(root, `${settings.outputDirectory}/${buildId}`);
  if (existsSync(output)) throw new Error('Refusing to overwrite an existing build.');
  const snapshot = join(output, 'source');
  for (const directory of ['source', 'reports', '.runtime', 'fabrication/gerbers', 'assembly', 'mechanical', 'site']) ensureDir(join(output, directory));
  for (const item of before) {
    const destination = resolveChildPath(snapshot, item.path);
    ensureDir(dirname(destination));
    copyFileSync(resolveChildPath(source, item.path), destination);
  }
  copyFileSync(options.config, join(output, 'release-config.json'));
  const log = join(output, 'reports/build.log');
  const manifest = {
    schemaVersion: 1, buildId, project: settings.project.name, hardwareRevision: settings.project.revision,
    generatedUtc: started.toISOString(), kicadVersion: null, status: 'building', prototypeHardware: true,
    platform: `${process.platform}-${process.arch}`, nodeVersion: process.version, kicadCli: cli,
    inputDesignFiles: before, originalDesignUnchanged: false, buildInputs: inputs,
  };
  try {
    console.log(`Building ${buildId} from an isolated design snapshot.`);
    const runtime = join(output, '.runtime');
    initializeKiCadRuntime(join(runtime, 'config'), cli, major);
    const kicad = { cli, env: { ...process.env, KICAD_CONFIG_HOME: join(runtime, 'config'), KICAD_DOCUMENTS_HOME: ensureDir(join(runtime, 'documents')) } };
    const versionRun = spawnSync(cli, ['version'], { env: kicad.env, encoding: 'utf8' });
    const version = (versionRun.stdout ?? '').trim();
    if (versionRun.error || versionRun.status !== 0 || !version.startsWith(`${major}.`)) throw new Error(`Unsupported KiCad version: ${version || versionRun.error?.message || versionRun.stderr}`);
    manifest.kicadVersion = version;
    const pcb = join(snapshot, pcbName);
    const sch = join(snapshot, `${settings.project.basename}.kicad_sch`);
    assertHardwareRevision(pcb, settings.project.revision);
    runKiCad(kicad, ['sch', 'erc', '--format', 'json', '--exit-code-violations', '--output', `${output}/reports/erc.json`, sch], log);
    runKiCad(kicad, ['pcb', 'drc', '--all-track-errors', '--schematic-parity', '--exit-code-violations', '--format', 'json', '--output', `${output}/reports/drc.json`, pcb], log);
    assertCleanReports(readJson(`${output}/reports/erc.json`), readJson(`${output}/reports/drc.json`));
    runKiCad(kicad, ['pcb', 'export', 'stats', '--format', 'json', '--units', 'mm', '--output', `${output}/reports/board-statistics.json`, pcb], log);
    assertBoardDimensions(readJson(`${output}/reports/board-statistics.json`), settings);
    manifest.validation = { erc: 0, drc: 0, unconnected: 0, schematicParity: 0 };
    if (!options.validateOnly) {
      exportRelease({ root, output, config: settings, kicad, pcb, sch, log });
      const assembly = buildAssembly({ root, output, config: settings, boardHash: pcbHash });
      manifest.assembly = assembly;
      if (options.requireAssemblyReady) assertAssemblyReady(assembly);
      buildReview({ root, output, config: settings, buildId, kicad });
      buildSite({ root, output, config: settings, buildId, assembly });
      completeRelease({ output, config: settings });
    }
    manifest.status = options.validateOnly ? 'validation-passed' : 'prototype-build-complete';
    assertDesignUnchanged(source, settings, before);
    if (JSON.stringify(inputs) !== JSON.stringify(buildInventory(root, options.config, settings))) {
      throw new Error('Build scripts, documentation, configuration or viewer assets changed during the build. Rebuild before release.');
    }
    manifest.originalDesignUnchanged = true;
    manifest.files = listFiles(output, { includeHidden: true })
      .map(path => toPosix(relative(output, path)))
      .filter(path => !path.startsWith('.runtime/') && path !== 'manifest.json')
      .sort()
      .map(path => ({ path, sha256: fileDigest(join(output, path)), bytes: statSync(join(output, path)).size }));
    writeJson(join(output, 'manifest.json'), manifest);
    console.log(`PASS: ${manifest.status}`);
    console.log(`OUTPUT: ${output}`);
    return { output, manifest };
  } catch (error) {
    manifest.status = 'failed'; manifest.error = error.message;
    writeJson(join(output, 'manifest.json'), manifest);
    throw error;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const options = parseOptions(process.argv.slice(2));
    if (options.help) {
      console.log('Usage: node release.mjs [--validate-only | --require-assembly-ready] [--kicad-cli <path>] [--config <release.json>]');
    } else {
      release(options);
    }
  } catch (error) {
    console.error(`FAIL: ${error.message}`);
    process.exitCode = 1;
  }
}
