// Explicit disposable validation: never touches an existing feature or terminal.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { command, createLifecycle, sandboxName } from './lifecycle.mjs';
import { installRelease, repositoryRoot } from './release.mjs';

const projectId = `teck-orca-devtools-${randomUUID()}`;
const featureId = 'full-toolkit';
const name = sandboxName(projectId, featureId);
const artifactRoot = join(repositoryRoot, '.artifacts', 'smoke', projectId);
mkdirSync(artifactRoot, { recursive: true });
const release = installRelease();
const lifecycle = createLifecycle({ assetRoot: release.destination, stateRoot: join(artifactRoot, 'features'),
  env: { ...process.env, ORCA_PROJECT_ID: projectId, ORCA_VM_INSTANCE_ID: featureId,
    ORCA_REPO_PATH: repositoryRoot, ORCA_REPO_URL: 'https://github.com/mattjohnson/orca-sbx-recipes.git',
    TECK_ORCA_CPUS: '2', TECK_ORCA_MEMORY: '4g' } });
const report = { sandbox: name, release: release.digest, ok: false, cleanedUp: false };
try {
  await lifecycle('create');
  const output = command('sbx', ['exec', '-u', 'agent', name, 'node', '/usr/local/lib/teck-devtools/devtools-smoke.mjs'], { timeout: 600_000 });
  const lines = output.trim().split(/\r?\n/);
  report.toolkit = JSON.parse(lines.at(-1));
  assert.equal(report.toolkit.languageServers.length, 15);
  assert.equal(report.toolkit.dotnet, JSON.parse(readFileSync(join(release.destination, 'runtime/kits/workload/devtools.json'), 'utf8')).dotnet.version);
  assert.ok(report.toolkit.uid > 0);
  report.ok = true;
} catch (error) {
  report.error = error.message;
  process.exitCode = 1;
} finally {
  try {
    if (JSON.parse(command('sbx', ['ls', '--json'])).some((row) => row.name === name)) {
      command('sbx', ['rm', '--force', name], { progress: true });
    }
    // The VM is gone; lifecycle cleanup can now clear this test's ownership record.
    await lifecycle('cleanup', { recipeResult: { userData: { projectId, featureId, instanceId: featureId, sandboxName: name } } });
    report.cleanedUp = true;
  } catch (error) { report.cleanupError = error.message; process.exitCode = 1; }
  writeFileSync(join(artifactRoot, 'result.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
}
