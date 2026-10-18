// Explicit integration test: only the uniquely named disposable project is stopped/removed.
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { command, shellQuote } from './lifecycle.mjs';
import { repositoryRoot } from './release.mjs';
import { provisionProject } from '../runtime/project-sandbox.mjs';
import { projectSandboxName, readProject } from '../runtime/project-state.mjs';
import { listenProject, sshArgs, redact } from '../runtime/project-transport.mjs';

const projectId = `teck-project-ssh-${randomUUID()}`, name = projectSandboxName(projectId);
const artifacts = join(repositoryRoot, '.artifacts/smoke', projectId), stateRoot = join(artifacts, 'projects');
mkdirSync(artifacts, { recursive: true });
const report = { projectId, sandbox: name, checks: [], ok: false, cleanedUp: false };
let transport;
const options = { projectId, displayName: 'Disposable project SSH test', cloneUrl: 'https://github.com/mattjohnson/orca-sbx-recipes.git',
  repoPath: repositoryRoot, assetRoot: repositoryRoot, stateRoot, env: { ...process.env, TECK_ORCA_CPUS: '2', TECK_ORCA_MEMORY: '4g' } };
let state;
const remote = async args => (await promisify(execFile)('ssh', [...sshArgs(state), `${name}.sbx`, args.map(shellQuote).join(' ')], {
  encoding: 'utf8', windowsHide: true, timeout: 180_000, maxBuffer: 4 * 1024 * 1024,
})).stdout;
const guest = async args => {
  const response = JSON.parse(await remote(['orca-ide', ...args, '--json']));
  assert.equal(response.ok, true, JSON.stringify(response.error)); return response.result;
};
const status = async pairingCode => {
  const result = await promisify(execFile)(process.execPath, [join(repositoryRoot, 'runtime/kits/orcad/bundle/common/out/cli/index.js'),
    'status', '--pairing-code', pairingCode, '--json'], { windowsHide: true, encoding: 'utf8', timeout: 120_000,
    env: { ...process.env, ORCA_USER_DATA_PATH: join(artifacts, 'isolated-client') } });
  const response = JSON.parse(result.stdout); assert.equal(response.ok, true, JSON.stringify(response.error));
  return response.result.runtime.runtimeId;
};
try {
  const first = await provisionProject(options); state = first.state;
  transport = await listenProject(state, { stateRoot, log: message => process.stderr.write(`${message}\n`) });
  const initial = await status(first.pairingCode);
  assert.deepEqual(JSON.parse(command('sbx', ['ports', name, '--json'])), []);
  report.checks.push('paired client reaches the local daemon solely through native Docker SSH; no published Docker ports');
  const second = await provisionProject(options);
  assert.equal(second.state.sandboxId, state.sandboxId);
  assert.equal(second.pairingCode, first.pairingCode);
  report.checks.push('repeated project setup keeps the sandbox, clone, daemon and pairing');
  const repo = await guest(['repo', 'add', '--path', '/home/agent/project']);
  const repoId = repo.repo?.id ?? repo.id ?? repo.repoId; assert.ok(repoId);
  const parent = (await guest(['worktree', 'create', '--repo', `id:${repoId}`, '--name', 'project-ssh-parent', '--no-parent', '--setup', 'skip'])).worktree;
  const child = (await guest(['worktree', 'create', '--repo', `id:${repoId}`, '--name', 'project-ssh-child', '--parent-worktree', `id:${parent.id}`,
    '--base-branch', parent.branch, '--setup', 'skip'])).worktree;
  // Match the existing validated OMP terminal launch; a headless test does not
  // inherit the desktop user's configured OMP CLI arguments.
  const launch = await guest(['terminal', 'create', '--worktree', `id:${child.id}`, '--title', 'Project OMP test', '--command', 'omp --no-title']);
  report.ompLaunch = launch;
  const childPath = child.path ?? child.id.split('::')[1];
  await remote(['sh', '-c', `printf 'project SSH uncommitted work\n' > ${shellQuote(childPath + '/restart-marker.txt')}`]);
  await delay(5000);
  const terminals = await guest(['terminal', 'list', '--worktree', `id:${child.id}`]);
  const handle = launch.terminal?.handle ?? launch.handle ?? launch.terminalHandle ?? terminals.terminals.find(item => item.title === 'Project OMP test')?.handle;
  assert.ok(handle, 'Terminal creation returned no handle');
  const output = await guest(['terminal', 'read', '--terminal', handle, '--limit', '100']);
  report.ompTerminal = await guest(['terminal', 'show', '--terminal', handle]);
  const lines = output.terminal?.tail ?? [];
  // An echoed shell guard contains its own error-message literal even on success.
  assert.ok(!lines.some(line => /^Orca: fresh OMP settings are unavailable|^.*(?:bash:.*command not found|syntax error near|EACCES:)/.test(line)));
  let processes = [];
  for (let attempt = 0; attempt < 30 && !processes.length; attempt++) {
    processes = (await remote(['ps', '-eo', 'pid,ppid,comm,args'])).split('\n')
      .filter(line => /^\s*\d+\s+\d+\s+omp\s+.*\/opt\/paseo-omp\/bin\/omp(?:\s|$)/.test(line));
    if (!processes.length) await delay(1000);
  }
  if (!processes.length) {
    report.processes = await remote(['ps', '-eo', 'pid,ppid,comm,args']);
    report.ompOutput = await guest(['terminal', 'read', '--terminal', handle, '--limit', '100']);
  }
  assert.ok(processes.length > 0, 'No running OMP process was found in the disposable terminal');
  report.ompProcessCount = processes.length;
  assert.match(await remote(['omp', '--version']), /18\./);
  report.checks.push('guest local CLI creates parent/child worktrees and an interactive OMP terminal without desktop SSH CLI permissions');
  for (let cycle = 0; cycle < 2; cycle++) {
    command('sbx', ['stop', name], { progress: true });
    assert.equal(JSON.parse(command('sbx', ['ls', '--json'])).find(row => row.name === name).status, 'stopped');
    if (cycle === 1) { await transport.close(); transport = await listenProject(state, { stateRoot, log: message => process.stderr.write(`${message}\n`) }); }
    const started = Date.now(), restored = await status(first.pairingCode);
    assert.notEqual(restored, initial);
    report[`coldWake${cycle + 1}Ms`] = Date.now() - started;
    const shown = (await guest(['worktree', 'show', '--worktree', `id:${child.id}`])).worktree;
    assert.equal(shown.id, child.id); assert.equal(shown.branch, child.branch); assert.equal(shown.parentWorktreeId, parent.id);
    assert.equal(await remote(['cat', `${childPath}/restart-marker.txt`]), 'project SSH uncommitted work\n');
    assert.equal(readProject(projectId, stateRoot).sandboxId, state.sandboxId);
    assert.deepEqual(JSON.parse(command('sbx', ['ports', name, '--json'])), []);
    report.checks.push(cycle ? 'after replacing the desktop transport, the original saved pairing wakes the stopped VM and preserves worktree identity and uncommitted data'
      : 'ordinary paired-client traffic alone wakes the stopped VM over SSH and restarts the same project daemon');
  }
  report.worktrees = { parent: parent.id, child: child.id };
  report.ok = true;
} catch (error) { report.error = redact(error); process.exitCode = 1; }
finally {
  if (transport) await transport.close();
  try {
    if (JSON.parse(command('sbx', ['ls', '--json'])).some(row => row.name === name)) command('sbx', ['rm', '--force', name], { progress: true });
    report.cleanedUp = true;
  } catch (error) { report.cleanupError = redact(error); process.exitCode = 1; }
  writeFileSync(join(artifacts, 'result.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
}
