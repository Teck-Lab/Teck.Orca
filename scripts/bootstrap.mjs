import { command } from './lifecycle.mjs';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { repositoryRoot } from './release.mjs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { checkKitBuilderStorage } from '../runtime/kit-builder.mjs';

export function checkPrerequisites(run = command) {
  const checks = [];
  const check = (name, callback) => {
    try { callback(); checks.push({ name, ok: true }); }
    catch (error) { checks.push({ name, ok: false, detail: error.message }); }
  };
  check('Node.js >= 22', () => { if (Number(process.versions.node.split('.')[0]) < 22) throw new Error('Install Node.js 22 or newer'); });
  check('Docker Sandboxes >= 0.48', () => {
    const match = run('sbx', ['version']).match(/v?(\d+)\.(\d+)\.(\d+)/);
    if (!match || (Number(match[1]) === 0 && Number(match[2]) < 48)) throw new Error('Install sbx 0.48 or newer (v3 workload kits required)');
  });
  check('Docker Sandboxes ready', () => { JSON.parse(run('sbx', ['ls', '--json'])); });
  check('Existing kit builder capacity (40g builder on first use if absent)', () => {
    const rows = JSON.parse(run('sbx', ['ls', '--json']));
    if (!Array.isArray(rows)) throw Error('Cannot verify kit builder inventory');
    const builder = rows.find(row => row.name === 'sbx-kit-builder');
    if (!builder) return;
    if (builder.agent !== 'sbx-kit-builder') throw Error('Cannot verify the shared Docker kit builder');
    checkKitBuilderStorage(run);
  });
  check('Bundled Orca daemon', () => {
    for (const arch of ['x64', 'arm64']) if (!existsSync(join(repositoryRoot, 'runtime', 'kits', 'orcad', 'bundle', 'node', `node-v24.21.0-linux-${arch}.tar.gz`))) throw new Error('Run npm run bundle:daemon before build/setup');
  });
  check('OmniRoute and MCPHub service credentials', () => {
    // Never print secret ls output: custom-secret metadata can include partially masked values.
    const data = JSON.parse(run('sbx', ['secret', 'ls', '--global', '--json']));
    const names = new Set((data.secrets ?? []).filter((entry) => entry.type === 'service').map((entry) => entry.name));
    const missing = ['omniroute', 'mcphub'].filter((name) => !names.has(name));
    if (missing.length) throw new Error(`Configure with sbx secret set: ${missing.join(', ')}`);
  });
  return { ok: checks.every((check) => check.ok), checks };
}

export function printPrerequisites(result) {
  for (const check of result.checks) console.log(`${check.ok ? 'OK' : 'FAIL'} ${check.name}${check.detail ? `: ${check.detail}` : ''}`);
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const result = checkPrerequisites();
  printPrerequisites(result);
  if (!result.ok) process.exitCode = 1;
}
