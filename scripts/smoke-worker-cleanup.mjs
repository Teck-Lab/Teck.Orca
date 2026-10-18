// Explicit live regression: the original user prompt, a real OMP coordinator,
// and two read-only OMP workers in a newly provisioned disposable feature.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { command, REMOTE_PROJECT, sandboxName } from './lifecycle.mjs';
import { installRelease, recipeCommand, repositoryRoot, sha256 } from './release.mjs';

const prompt = `Run a controlled test of our Orca feature workflow. Read the bundled
orca-feature-workflow, orca-workers, orca-cli and orchestration skills first.

1. Verify the current workspace, branch, execution host and available Orca CLI.
   Check the configured model roles without printing credentials.

2. Create an Orca orchestration run with two independent test tasks.
   Give each task a separate Orca child worktree explicitly linked to this
   feature workspace, on this feature's existing sandbox Orca runtime.

3. Launch an OMP worker for each task using the configured task model.
   Worker A: report its branch, checkout path and Git status.
   Worker B: report Node, Bun and OMP versions and available workflow skills.

Keep both tasks read-only. Do not create GitHub issues, edit project files,
commit, push, provision another sandbox or delete the test workspaces.
Avoid repository setup hooks for this test.

Wait for both workers' reports. Then report their task IDs, worktree IDs,
parent relationship and execution host. Stop if the Orca CLI cannot
perform the required operations; do not substitute raw Git worktrees.`;

const projectId = `teck-orca-cleanup-${randomUUID()}`;
const featureId = `${projectId}-feature`;
const name = sandboxName(projectId, featureId);
const artifactRoot = join(repositoryRoot, '.artifacts', 'smoke', projectId);
mkdirSync(artifactRoot, { recursive: true });
const release = installRelease();
const env = { ...process.env, ORCA_PROJECT_ID: projectId, ORCA_VM_INSTANCE_ID: featureId,
  ORCA_REPO_URL: 'https://github.com/mattjohnson/orca-sbx-recipes.git', ORCA_REPO_PATH: repositoryRoot,
  TECK_ORCA_STATE_DIR: join(artifactRoot, 'features'), TECK_ORCA_CPUS: '2', TECK_ORCA_MEMORY: '4g' };
const report = { sandbox: name, release: release.digest, ok: false, cleanedUp: false, checks: [] };
function cli(args) {
  const response = JSON.parse(command('sbx', ['exec', '-u', 'agent', name, 'orca-ide', ...args, '--json'], { timeout: 90_000 }));
  assert.equal(response.ok, true, JSON.stringify(response.error));
  return response.result;
}
function progress(message) { process.stderr.write(`${message}\n`); }
try {
  const guides = JSON.parse(readFileSync(join(repositoryRoot, 'runtime/omp/orca-guides.json')));
  for (const file of guides.files) {
    assert.equal(sha256(readFileSync(join(repositoryRoot, 'runtime/omp/skills', file.skill, file.path))), file.sha256,
      `Official guide changed: ${file.skill}/${file.path}`);
  }
  report.checks.push('all official Orca guide files match their original snapshot hashes');
  progress(`Provisioning disposable cleanup test: ${name}`);
  const created = spawnSync(recipeCommand(release.digest, 'create'), { shell: true, env, encoding: 'utf8',
    windowsHide: true, timeout: 1_800_000, maxBuffer: 16 * 1024 * 1024 });
  if (created.stderr) process.stderr.write(created.stderr);
  if (created.error) throw created.error;
  assert.equal(created.status, 0, 'Disposable feature creation failed');
  assert.equal(JSON.parse(created.stdout).projectRoot, REMOTE_PROJECT);
  const added = cli(['repo', 'add', '--path', REMOTE_PROJECT]);
  const repoId = added.repo?.id ?? added.id ?? added.repoId;
  assert.ok(repoId);
  const parent = cli(['worktree', 'create', '--repo', `id:${repoId}`, '--name', 'cleanup-test-feature', '--no-parent', '--setup', 'skip', '--agent', 'omp']);
  report.parent = parent.worktree.id;
  const terminals = cli(['terminal', 'list', '--worktree', `id:${report.parent}`]);
  const coordinator = terminals.terminals.find(item => item.agentIdentity === 'omp');
  assert.ok(coordinator?.handle, 'Coordinator OMP terminal is missing');
  report.coordinator = coordinator.handle;
  const ready = cli(['terminal', 'wait', '--terminal', coordinator.handle, '--for', 'tui-idle', '--timeout-ms', '60000']);
  assert.equal(ready.wait?.satisfied ?? ready.satisfied, true, 'Coordinator did not become ready');
  const sent = cli(['terminal', 'send', '--terminal', coordinator.handle, '--text', prompt, '--enter']);
  report.promptReceipt = sent.send;
  assert.equal(sent.send.accepted, true, 'Original test prompt was not accepted');
  report.checks.push('original test prompt accepted by real OMP coordinator, with no extra cleanup instruction');
  progress('Original test prompt sent; waiting for two workers and terminal cleanup.');
  const deadline = Date.now() + 15 * 60_000;
  let lastProgress = 0;
  while (Date.now() < deadline) {
    const runs = cli(['orchestration', 'run-list']);
    const run = runs.runs.find(item => !item.legacy);
    if (run) {
      report.runId = run.id ?? run.runId;
      const workers = cli(['orchestration', 'worker-list', '--run', report.runId]);
      report.workers = workers;
      const children = cli(['worktree', 'list']).worktrees.filter(item => item.parentWorktreeId === report.parent);
      report.children = children.map(item => ({ id: item.id, parentWorktreeId: item.parentWorktreeId, branch: item.branch }));
      const childTerminals = children.map(child => ({ worktreeId: child.id,
        terminals: cli(['terminal', 'list', '--worktree', `id:${child.id}`]).terminals }));
      report.childTerminals = childTerminals;
      // A real terminal release is observable independently of the model's report:
      // both linked checkouts still exist but neither owns a live OMP terminal.
      if (workers.workers.length === 2 && workers.workers.every(worker => worker.workerState === 'succeeded' && worker.terminalState === 'released')
          && children.length === 2 && childTerminals.every(item => !item.terminals.some(terminal => terminal.agentIdentity === 'omp'))) {
        const reclaimable = cli(['orchestration', 'worker-list', '--run', report.runId, '--terminal-state', 'reclaimable']);
        report.reclaimable = reclaimable;
        assert.equal(reclaimable.workers.length, 0);
        report.workerDetails = [];
        for (const worker of workers.workers) {
          const dispatch = worker.dispatchId ?? worker.dispatch?.id;
          if (dispatch) report.workerDetails.push(cli(['orchestration', 'worker-show', '--dispatch', dispatch]));
        }
        report.checks.push('both completed worker terminals closed while both linked child worktrees remain');
        report.checks.push('no reclaimable worker terminals remain');
        assert.ok(cli(['terminal', 'list', '--worktree', `id:${report.parent}`]).terminals.some(item => item.handle === coordinator.handle));
        report.checks.push('coordinator terminal remains alive');
        report.ok = true;
        break;
      }
      if (Date.now() - lastProgress >= 30_000) {
        progress(`Waiting: ${children.length} children; ${childTerminals.reduce((count, item) => count + item.terminals.filter(t => t.agentIdentity === 'omp').length, 0)} live OMP worker terminals.`);
        lastProgress = Date.now();
      }
    }
    await delay(5000);
  }
  if (!report.ok) {
    report.coordinatorOutput = cli(['terminal', 'read', '--terminal', coordinator.handle, '--limit', '100']);
    throw new Error('Coordinator did not release both worker terminals before the test deadline');
  }
} catch (error) {
  report.error = error.message;
  process.exitCode = 1;
} finally {
  // Only the sandbox generated by this test invocation is eligible for removal.
  try {
    if (JSON.parse(command('sbx', ['ls', '--json'])).some(item => item.name === name)) {
      command('sbx', ['rm', '--force', name], { progress: true });
    }
    report.cleanedUp = true;
  } catch (error) { report.cleanupError = error.message; process.exitCode = 1; }
  writeFileSync(join(artifactRoot, 'result.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ ok: report.ok, cleanedUp: report.cleanedUp, release: report.release,
    checks: report.checks, error: report.error, result: join(artifactRoot, 'result.json') }, null, 2));
}
