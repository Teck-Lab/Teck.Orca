// Explicit, disposable local validation. Never runs as part of npm test/setup.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { command, REMOTE_PROJECT, sandboxName, shellQuote } from './lifecycle.mjs';
import { installRelease, recipeCommand, repositoryRoot } from './release.mjs';

const projectId = `teck-orca-smoke-${randomUUID()}`;
const featureId = `${projectId}-feature-a`;
const secondFeatureId = `${projectId}-feature-b`;
const name = sandboxName(projectId, featureId);
const secondName = sandboxName(projectId, secondFeatureId);
const artifactRoot = join(repositoryRoot, '.artifacts', 'smoke', projectId);
mkdirSync(artifactRoot, { recursive: true });
const release = installRelease();
const env = { ...process.env, ORCA_PROJECT_ID: projectId, ORCA_VM_INSTANCE_ID: featureId, ORCA_REPO_URL: 'https://github.com/mattjohnson/orca-sbx-recipes.git',
  ORCA_REPO_PATH: repositoryRoot, TECK_ORCA_STATE_DIR: join(artifactRoot, 'features'), TECK_ORCA_CPUS: '2', TECK_ORCA_MEMORY: '4g' };
const report = { sandboxes: [name, secondName], projectId, release: release.digest, checks: [], ok: false, cleanedUp: false };
function runRecipe(mode, payload, recipeEnv = env) {
  const cmd = recipeCommand(release.digest, mode);
  const result = spawnSync(cmd, { shell: true, env: recipeEnv, input: payload ? JSON.stringify(payload) : undefined,
    encoding: 'utf8', windowsHide: true, timeout: 1_800_000, maxBuffer: 16 * 1024 * 1024 });
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Recipe ${mode} failed (${result.status})`);
  return result.stdout.trim() ? JSON.parse(result.stdout) : undefined;
}
let payload;
try {
  const created = runRecipe('create');
  payload = { recipeResult: created };
  assert.equal(created.projectRoot, REMOTE_PROJECT);
  assert.ok(created.pairingCode.startsWith('orca://pair?'));
  assert.equal(created.connection, undefined);
  report.checks.push('universal Node/host-shell create returns daemon pairing JSON');
  const guest = `set -eu; test "$(git -C /home/agent/project rev-parse --show-toplevel)" = /home/agent/project; node --version; omp --version; test "$OMNIROUTE_API_KEY" = proxy-managed; test "$MCPHUB_API_KEY" = proxy-managed; test "$OMNIROUTE_BASE_URL" = https://omniroute.tecklab.dk/v1; test "$TECK_ORCA_FEATURE_ID" = ${shellQuote(featureId)}; test "$TECK_ORCA_SANDBOX_NAME" = ${shellQuote(name)}; for skill in orca-cli orchestration orca-workers orca-feature-workflow github-execution-planning; do test -r /home/agent/.omp/agent/skills/$skill/SKILL.md; done; test -r /home/agent/.omp/agent/skills/orchestration/references/placement-and-remote.md; test -r /home/agent/.omp/agent/skills/orca-cli/references/automations.md; PATH="/tmp/teck-relay-probe:$PATH"; . /etc/teck-orca/environment.sh; case ":$PATH:" in *:/tmp/teck-relay-probe:*) ;; *) exit 1 ;; esac; test -x /usr/local/bin/chromium`;
  const output = command('sbx', ['exec', '-u', 'agent', name, 'sh', '-c', guest], { timeout: 60_000 });
  process.stderr.write(output);
  report.checks.push('guest Git, Node, OMP, complete Orca skills, feature identity and PATH are present');
  const cli = (args) => {
    const response = JSON.parse(command('sbx', ['exec', '-u', 'agent', name, 'orca-ide', ...args, '--json'], { timeout: 90_000 }));
    assert.equal(response.ok, true, JSON.stringify(response.error));
    return response.result;
  };
  const status = cli(['status']);
  report.runtimeStatus = status;
  assert.equal(status.runtime.reachable, true);
  assert.equal(status.runtime.appVersion, '1.4.244');
  cli(['worktree', 'list']);
  report.checks.push('guest CLI reaches its own daemon without an SSH permission gate');
  const paired = spawnSync(process.execPath, [join(repositoryRoot, 'runtime/kits/orcad/bundle/common/out/cli/index.js'), 'status', '--pairing-code', created.pairingCode, '--json'], {
    encoding: 'utf8', windowsHide: true, timeout: 90_000,
    env: { ...process.env, ORCA_USER_DATA_PATH: join(artifactRoot, 'client-profile') },
  });
  if (paired.error) throw paired.error;
  assert.equal(paired.status, 0, 'Isolated Windows client could not reach the published daemon');
  const pairedResponse = JSON.parse(paired.stdout);
  assert.equal(pairedResponse.ok, true);
  assert.equal(pairedResponse.result.runtime.runtimeId, status.runtime.runtimeId);
  report.checks.push('isolated desktop-side CLI pairs over the published loopback port');
  const added = cli(['repo', 'add', '--path', REMOTE_PROJECT]);
  report.repoAdd = added;
  const repoId = added.repo?.id ?? added.id ?? added.repoId;
  assert.ok(repoId, 'repo add did not return its id');
  const parent = cli(['worktree', 'create', '--repo', `id:${repoId}`, '--name', 'daemon-smoke-feature', '--no-parent', '--setup', 'skip']);
  assert.ok(parent.worktree?.id);
  const childResult = cli(['worktree', 'create', '--repo', `id:${repoId}`, '--name', 'daemon-smoke-child', '--parent-worktree', `id:${parent.worktree.id}`, '--base-branch', parent.worktree.branch, '--setup', 'skip', '--agent', 'omp']);
  assert.ok(childResult.worktree?.id);
  report.workspaces = { parent: parent.worktree.id, child: childResult.worktree.id };
  report.child = cli(['worktree', 'show', '--worktree', `id:${childResult.worktree.id}`]);
  report.terminals = cli(['terminal', 'list', '--worktree', `id:${childResult.worktree.id}`]);
  assert.equal(report.child.worktree.parentWorktreeId, parent.worktree.id);
  const terminal = report.terminals.terminals.find((item) => item.agentIdentity === 'omp');
  assert.ok(terminal?.handle, 'Child has no registered OMP terminal');
  await delay(8000);
  report.ompOutput = cli(['terminal', 'read', '--terminal', terminal.handle, '--limit', '120']);
  assert.doesNotMatch(JSON.stringify(report.ompOutput), /EACCES|syntax error|fresh OMP settings are unavailable|command not found/);
  report.checks.push('daemon creates an Orca parent, linked child and OMP agent terminal');
  let dispatchedChild;
  if (process.env.TECK_ORCA_SMOKE_WORKERS === '1') {
    command('sbx', ['cp', join(repositoryRoot, 'scripts/smoke-coordinator.mjs'), `${name}:/tmp/teck-orca-smoke-coordinator.mjs`]);
    report.coordinator = cli(['terminal', 'create', '--worktree', `id:${parent.worktree.id}`, '--title', 'Disposable smoke coordinator', '--command', 'node /tmp/teck-orca-smoke-coordinator.mjs']);
    const deadline = Date.now() + 180_000;
    while (Date.now() < deadline) {
      const result = JSON.parse(command('sbx', ['exec', '-u', 'agent', name, 'sh', '-c', 'if test -r /tmp/teck-orca-coordinator-result.json; then cat /tmp/teck-orca-coordinator-result.json; else echo "{}"; fi']));
      if ('ok' in result) { report.workerSmoke = result; break; }
      await delay(1000);
    }
    if (!report.workerSmoke?.ok) {
      report.processes = command('sbx', ['exec', '-u', 'agent', name, 'ps', '-eo', 'pid,ppid,pgid,tpgid,stat,comm,args']);
      const failed = report.workerSmoke?.failedReceipt;
      const handle = failed?.effects?.find((item) => item.kind === 'terminal' && item.role === 'agent')?.id;
      if (handle) report.failedTerminal = cli(['terminal', 'read', '--terminal', handle, '--limit', '150']);
      if (failed?.dispatchId) cli(['orchestration', 'worker-release', '--dispatch', failed.dispatchId]);
    }
    assert.equal(report.workerSmoke?.ok, true, report.workerSmoke?.error ?? 'Coordinator timed out');
    assert.equal(report.workerSmoke.worker.state, 'ready');
    assert.equal(report.workerSmoke.worker.launch.effective.model, 'omniroute/teck-executor');
    const listed = cli(['worktree', 'list']);
    dispatchedChild = listed.worktrees.find((item) => item.parentWorktreeId === parent.worktree.id && item.id !== childResult.worktree.id);
    assert.ok(dispatchedChild?.id, 'Dispatched worker has no registered child worktree');
    const workerTerminals = cli(['terminal', 'list', '--worktree', `id:${dispatchedChild.id}`]);
    assert.ok(workerTerminals.terminals.some((item) => item.agentIdentity === 'omp'));
    report.checks.push('real coordinator terminal creates a Run, Task, Dispatch and OMP worker in a linked child');
    report.workerOutput = cli(['orchestration', 'worker-read', '--dispatch', report.workerSmoke.worker.dispatchId, '--limit', '50']);
  }
  assert.deepEqual(runRecipe('create'), created);
  report.checks.push('repeated create reuses sandbox and connection');
  runRecipe('suspend', payload);
  assert.deepEqual(runRecipe('resume', payload), created);
  report.checks.push('suspend/resume forwards payload and reuses connection');
  const secondEnv = { ...env, ORCA_VM_INSTANCE_ID: secondFeatureId };
  const second = runRecipe('create', undefined, secondEnv);
  assert.equal(second.projectRoot, REMOTE_PROJECT);
  assert.notEqual(second.pairingCode, created.pairingCode);
  runRecipe('destroy', { recipeResult: second }, secondEnv);
  assert.ok(JSON.parse(command('sbx', ['ls', '--json'])).some((row) => row.name === name));
  assert.ok(!JSON.parse(command('sbx', ['ls', '--json'])).some((row) => row.name === secondName));
  report.checks.push('two features in the same project use separate sandboxes and independent cleanup');
  runRecipe('destroy', payload);
  assert.ok(JSON.parse(command('sbx', ['ls', '--json'])).some((row) => row.name === name));
  report.checks.push('destroy retains sandbox with linked child worktree');
  if (dispatchedChild) {
    report.workerCleanup = cli(['orchestration', 'worker-stop', '--dispatch', report.workerSmoke.worker.dispatchId]);
    cli(['worktree', 'rm', '--worktree', `id:${dispatchedChild.id}`, '--force']);
  }
  cli(['worktree', 'rm', '--worktree', `id:${childResult.worktree.id}`, '--force']);
  cli(['worktree', 'rm', '--worktree', `id:${parent.worktree.id}`, '--force']);
  runRecipe('destroy', payload);
  payload = undefined;
  assert.ok(!JSON.parse(command('sbx', ['ls', '--json'])).some((row) => row.name === name));
  report.checks.push('destroy removes the final disposable feature sandbox');
  report.cleanedUp = true;
  report.ok = true;
} catch (error) {
  report.error = error.message;
  process.exitCode = 1;
} finally {
  // These names are generated for this invocation and never point at real work.
  if (!report.cleanedUp) {
    try {
      for (const disposableName of [name, secondName]) {
        if (JSON.parse(command('sbx', ['ls', '--json'])).some((row) => row.name === disposableName)) {
          command('sbx', ['rm', '--force', disposableName], { progress: true });
        }
      }
      report.cleanedUp = true;
    } catch (error) { report.cleanupError = error.message; process.exitCode = 1; }
  }
  writeFileSync(join(artifactRoot, 'result.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
}
