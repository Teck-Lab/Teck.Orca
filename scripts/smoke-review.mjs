// Explicit live model validation, confined to a generated disposable feature.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { command, createLifecycle, sandboxName } from './lifecycle.mjs';
import { installRelease, repositoryRoot, sha256 } from './release.mjs';
const projectId = `teck-orca-review-${randomUUID()}`;
const featureId = 'review-gates';
const name = sandboxName(projectId, featureId);
const artifactRoot = join(repositoryRoot, '.artifacts', 'smoke', projectId);
mkdirSync(artifactRoot, { recursive: true });
const release = installRelease();
const lifecycle = createLifecycle({ assetRoot: release.destination, stateRoot: join(artifactRoot, 'features'),
  env: { ...process.env, ORCA_PROJECT_ID: projectId, ORCA_VM_INSTANCE_ID: featureId,
    ORCA_REPO_PATH: repositoryRoot, ORCA_REPO_URL: 'https://github.com/mattjohnson/orca-sbx-recipes.git',
    TECK_ORCA_CPUS: '2', TECK_ORCA_MEMORY: '4g' } });
const report = { sandbox: name, release: release.digest, ok: false, cleanedUp: false };
function cli(args) {
  const response = JSON.parse(command('sbx', ['exec', '-u', 'agent', name, 'orca-ide', ...args, '--json']));
  assert.equal(response.ok, true, JSON.stringify(response.error));
  return response.result;
}
try {
  for (const file of JSON.parse(readFileSync(join(repositoryRoot, 'runtime/omp/orca-guides.json'))).files) {
    assert.equal(sha256(readFileSync(join(repositoryRoot, 'runtime/omp/skills', file.skill, file.path))), file.sha256);
  }
  await lifecycle('create');
  const fixture = `import os,subprocess
from pathlib import Path
p=Path('/home/agent/review-fixture'); p.mkdir()
(p/'clamp.mjs').write_text('export function clamp(value,min,max) { return Math.min(max, Math.max(min,value)); }\\n')
(p/'clamp.test.mjs').write_text("import {test} from 'node:test';\\nimport assert from 'node:assert/strict';\\nimport {clamp} from './clamp.mjs';\\ntest('inverted ranges reject',()=>assert.throws(()=>clamp(5,10,0),RangeError));\\n")
def git(*args): subprocess.run(['git',*args],cwd=p,check=True,capture_output=True)
git('init','-b','main'); git('config','user.name','Teck disposable review test'); git('config','user.email','review-test@example.invalid'); git('config','commit.gpgsign','false'); git('add','.'); git('commit','-m','test: baseline clamp fixture')
`;
  command('sbx', ['exec', '-u', 'agent', name, 'python3', '-c', fixture]);
  const added = cli(['repo', 'add', '--path', '/home/agent/review-fixture']);
  const repoId = added.repo?.id ?? added.id ?? added.repoId;
  const parent = cli(['worktree', 'create', '--repo', `id:${repoId}`, '--name', 'review-test-parent', '--no-parent', '--setup', 'skip']).worktree;
  report.parent = parent.id;
  command('sbx', ['cp', join(repositoryRoot, 'scripts/smoke-review-coordinator.mjs'), `${name}:/tmp/teck-orca-review-coordinator.mjs`]);
  report.coordinator = cli(['terminal', 'create', '--worktree', `id:${parent.id}`, '--title', 'Disposable review coordinator',
    '--command', 'node /tmp/teck-orca-review-coordinator.mjs']);
  const deadline = Date.now() + 20 * 60_000;
  let previous;
  while (Date.now() < deadline) {
    const output = command('sbx', ['exec', '-u', 'agent', name, 'sh', '-c', 'if test -r /tmp/teck-orca-review-result.json; then cat /tmp/teck-orca-review-result.json; else echo "{}"; fi']);
    const result = JSON.parse(output);
    if (result.phase !== previous) { process.stderr.write(`Review validation: ${result.phase ?? 'starting'}; ${result.reviews?.length ?? 0} accepted reports.\n`); previous = result.phase; }
    if (['completed', 'failed'].includes(result.phase)) {
      report.review = result;
      assert.equal(result.ok, true, result.error);
      assert.deepEqual(result.reviews.map(review => review.verdict), ['request_changes', 'approve', 'approve']);
      report.ok = true;
      break;
    }
    await delay(5000);
  }
  assert.equal(report.ok, true, 'Review validation exceeded its deadline');
} catch (error) {
  report.error = error.message;
  process.exitCode = 1;
} finally {
  try {
    if (JSON.parse(command('sbx', ['ls', '--json'])).some(row => row.name === name)) {
      command('sbx', ['rm', '--force', name], { progress: true });
    }
    await lifecycle('cleanup', { recipeResult: { userData: { projectId, featureId, instanceId: featureId, sandboxName: name } } });
    report.cleanedUp = true;
  } catch (error) { report.cleanupError = error.message; process.exitCode = 1; }
  writeFileSync(join(artifactRoot, 'result.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ ok: report.ok, cleanedUp: report.cleanedUp, error: report.error, result: join(artifactRoot, 'result.json') }, null, 2));
}
