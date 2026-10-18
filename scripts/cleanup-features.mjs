import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { connectionResult, createLifecycle, sandboxName } from './lifecycle.mjs';

const stateRoot = process.env.TECK_ORCA_STATE_DIR || join(homedir(), '.teck-orca', 'features');
const apply = process.argv.includes('--apply');
// Do not inherit a terminal's current workspace identity when inspecting others.
const env = { ...process.env };
for (const key of ['ORCA_PROJECT_ID', 'ORCA_VM_INSTANCE_ID', 'ORCA_WORKSPACE_ID']) delete env[key];
const lifecycle = createLifecycle({ env, stateRoot });
const report = { apply, features: [] };
for (const entry of existsSync(stateRoot) ? readdirSync(stateRoot, { withFileTypes: true }) : []) {
  if (!entry.isDirectory() || !/^teck-orca-f-[a-f0-9]{12}$/.test(entry.name)) continue;
  try {
    const path = join(stateRoot, entry.name, 'state.json');
    const state = JSON.parse(readFileSync(path, 'utf8'));
    if (state.sandboxName !== entry.name || sandboxName(state.projectId, state.featureId) !== entry.name) throw new Error('Feature ownership mismatch');
    if (state.phase !== 'retained' || state.instances?.length) continue;
    if (apply) await lifecycle('cleanup', { recipeResult: connectionResult(entry.name, state.projectId, state.featureId) });
    report.features.push({ sandbox: entry.name, status: apply ? existsSync(path) ? 'retained' : 'removed' : 'candidate; Git inventory will be checked with --apply' });
  } catch (error) {
    report.features.push({ sandbox: entry.name, status: 'error', error: error.message });
    process.exitCode = 1;
  }
}
console.log(JSON.stringify(report, null, 2));
