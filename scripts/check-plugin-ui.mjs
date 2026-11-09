// Real Orca SDK checks, fenced away from the user's runtime and ownership state.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { buildPlugin, pluginRoot } from './plugin-package.mjs';
import { installRelease, repositoryRoot } from './release.mjs';

buildPlugin({ check: true });
const artifacts = join(repositoryRoot, '.artifacts'); mkdirSync(artifacts, { recursive: true });
const root = mkdtempSync(join(artifacts, 'plugin-ui-'));
const cli = process.env.ORCA_CLI_COMMAND || 'orca';
const env = { ...process.env, TECK_ORCA_RELEASES_DIR: join(root, 'releases'), TECK_ORCA_STATUS_STATE_DIR: join(root, 'ownership') };
function call(args) {
  const result = spawnSync(cli, args, { env, encoding: 'utf8', windowsHide: true, timeout: 120_000, maxBuffer: 8 * 1024 * 1024 });
  if (result.error) throw result.error;
  if (result.status !== 0) throw Error(result.stderr || result.stdout || `Orca exited ${result.status}`);
  const response = JSON.parse(result.stdout);
  if (response.ok === false) throw Error(response.error?.message || 'Orca check failed');
  return response.result;
}
try {
  installRelease(repositoryRoot, env.TECK_ORCA_RELEASES_DIR);
  call(['plugin', 'validate', pluginRoot, '--json']);
  const tests = call(['plugin', 'test', pluginRoot, '--json']);
  const checked = call(['plugin', 'check', pluginRoot, '--json']);
  for (const panel of checked.panels ?? []) {
    assert.deepEqual(panel.issues, [], `${panel.scenario}: panel issues`);
    assert.deepEqual(panel.warnings, [], `${panel.scenario}: panel warnings`);
  }
  const report = { tests, scenarios: checked.panels?.map(({ scenario, elements, summary }) => ({ scenario, elements, summary })),
    isolatedOwnership: true, pluginEnabled: false, checkOk: true };
  writeFileSync(join(artifacts, 'plugin-ui-check.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report));
} finally {
  if (!resolve(root).startsWith(resolve(artifacts) + sep)) throw Error('Refuse cleanup outside check artifacts');
  rmSync(root, { recursive: true, force: true });
}
