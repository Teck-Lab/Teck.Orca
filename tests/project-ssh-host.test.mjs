import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ensurePersistentProjectHost, projectSshAlias, findPersistentProjectHost, createProjectHostManager, retireBootstrapConnections, desktopCli } from '../runtime/project-ssh-host.mjs';

test('Windows workers select the bundled CLI launcher instead of the GUI executable on PATH', () => {
  const executable = join('install', 'orca.exe'), launcher = join('install', 'resources', 'bin', 'orca.exe');
  assert.equal(desktopCli({ env: {}, platform: 'win32', executable, exists: p => p === launcher }), launcher);
  assert.equal(desktopCli({ env: { ORCA_CLI_COMMAND: 'configured-cli' }, platform: 'win32', exists: () => false }), 'configured-cli');
  assert.throws(() => desktopCli({ env: {}, platform: 'win32', exists: () => false }), /launcher is unavailable/);
  assert.equal(desktopCli({ env: {}, platform: 'linux' }), 'orca-ide');
});

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'teck-persistent-ssh-')); t.after(() => rmSync(root, { recursive: true, force: true }));
  const projectId = 'github:example/project', alias = projectSshAlias(projectId), name = alias.slice(0, -4);
  mkdirSync(join(root, name));
  const state = { version: 1, projectId, sandboxId: 'vm-1', sandboxName: name, projectRoot: '/home/agent/project', phase: 'ready', displayName: 'Example' };
  writeFileSync(join(root, name, 'state.json'), JSON.stringify(state));
  const targets = [], calls = [];
  const rpc = async (method, params = {}) => { calls.push([method, params]);
    if (method === 'status.get') return { desktopWindowStatus: 'available', capabilities: ['ssh.target-management.v1'] };
    if (method === 'ssh.listEditableTargets') return { targets };
    if (method === 'ssh.addTarget') { const target = { ...params.target, id: 'ssh-project' }; targets.push(target); return { target }; }
    if (method === 'ssh.getState') return { state: { status: 'connected' } };
    throw Error('Unexpected mutation ' + method);
  };
  return { root, state, rpc, targets, calls, project: { projectId, name, id: 'vm-1', title: 'Example', state: 'running' } };
}
test('repeated workspace refreshes register one persistent SSH target without provisioning or stopping a VM', async t => {
  const f = fixture(t);
  const first = await ensurePersistentProjectHost(f.project, { rpc: f.rpc, stateRoot: f.root });
  const second = await ensurePersistentProjectHost(f.project, { rpc: f.rpc, stateRoot: f.root });
  assert.equal(first.targetId, second.targetId);
  assert.equal(f.calls.filter(c => c[0] === 'ssh.addTarget').length, 1);
  assert.equal(first.label, 'Example sandbox');
  assert.equal(f.targets[0].allowRemoteCliControl, true);
  assert.ok(f.calls.every(c => !/remove|stop|forget|terminal|worktree|environment/i.test(c[0])));
  const record = JSON.parse(readFileSync(join(f.root, f.project.name, 'ssh-target.json')));
  assert.deepEqual(record, { version: 1, projectId: f.project.projectId, sandboxId: 'vm-1', targetId: 'ssh-project' });
});
test('foreign VM identity and changed registered target fail before new registrations', async t => {
  const f = fixture(t);
  await assert.rejects(ensurePersistentProjectHost({ ...f.project, id: 'other-vm' }, { rpc: f.rpc, stateRoot: f.root }), /ownership changed/);
  assert.equal(f.calls.length, 0);
  await ensurePersistentProjectHost(f.project, { rpc: f.rpc, stateRoot: f.root });
  f.targets[0].id = 'replacement';
  await assert.rejects(ensurePersistentProjectHost(f.project, { rpc: f.rpc, stateRoot: f.root }), /registration changed/);
  assert.equal(f.calls.filter(c => c[0] === 'ssh.addTarget').length, 1);
});
test('existing exact host is reused while duplicate hosts are refused rather than guessed', async t => {
  const f = fixture(t), alias = projectSshAlias(f.project.projectId);
  f.targets.push({ id: 'existing', label: 'My sandbox', configHost: alias, host: alias, port: 22, username: '_default_user_' });
  assert.equal((await findPersistentProjectHost(f.project.projectId, { rpc: f.rpc })).id, 'existing');
  const result = await ensurePersistentProjectHost(f.project, { rpc: f.rpc, stateRoot: f.root });
  assert.equal(result.targetId, 'existing');
  assert.ok(!f.calls.some(c => c[0] === 'ssh.addTarget'));
  f.targets.push({ ...f.targets[0], id: 'duplicate' });
  await assert.rejects(findPersistentProjectHost(f.project.projectId, { rpc: f.rpc }), /Multiple persistent/);
});
test('status refreshes coalesce registration and never wake stopped or missing sandboxes', async () => {
  const seen = []; let release;
  const manager = createProjectHostManager({ ensure: async p => { seen.push(p.id); await new Promise(r => { release = r; }); } });
  const rows = [{ id: 'running', state: 'running' }, { id: 'stopped', state: 'stopped' }, { id: 'missing', state: 'missing' }];
  const a = manager.sync(rows), b = manager.sync(rows);
  assert.deepEqual(seen, ['running']); release(); await Promise.all([a, b]); await manager.sync(rows);
  assert.deepEqual(seen, ['running']);
});

test('bootstrap retirement only unlinks an exact idle alias after matching both runtime and worktrees', async t => {
  const f = fixture(t), calls = [];
  writeFileSync(join(f.root, 'orca-ephemeral-vm-runtimes.json'), JSON.stringify({ runtimes: [{ id: 'instance-1', recipeId: 'teck-native-ssh-project',
    connectionMode: 'ssh', status: 'running', runtimeEnvironmentId: 'bootstrap', sshTargetId: 'runtime-ssh-instance-1',
    recipeResult: { userData: { instanceId: 'instance-1', projectId: f.project.projectId, sandboxName: f.project.name, sandboxId: f.project.id } } }] }));
  const host = { targetId: 'persistent-target', connection: { managedServer: { environmentId: 'persistent' } } };
  let active = false, foreign = false, mismatched = false;
  const run = async (_cli, args, options) => {
    assert.equal(options.env.ORCA_USER_DATA_PATH, f.root);
    assert.equal(options.env.ORCA_ENVIRONMENT, undefined);
    assert.equal(options.env.ORCA_PAIRING_CODE, undefined);
    calls.push(args); const id = args[args.indexOf('--environment') + 1];
    if (args[1] === 'list' && args[0] === 'environment') return JSON.stringify({ ok: true, result: { environments: [
      { id: 'persistent', runtimeId: 'same-runtime', orcadDeployment: { sshTargetId: 'persistent-target' } },
      { id: 'bootstrap', runtimeId: foreign ? 'other-runtime' : 'same-runtime', orcadDeployment: { sshTargetId: 'runtime-ssh-instance-1' } }] } });
    if (args[0] === 'terminal') return JSON.stringify({ ok: true, _meta: { runtimeId: 'same-runtime' }, result: { totalCount: active ? 1 : 0, terminals: active ? [{}] : [], truncated: false } });
    if (args[0] === 'worktree') return JSON.stringify({ ok: true, _meta: { runtimeId: 'same-runtime' }, result: { truncated: false, worktrees: [{ id: mismatched && id === 'bootstrap' ? 'different' : 'wt-1', path: '/project/feature', branch: 'feature' }] } });
    if (args[1] === 'forget') return JSON.stringify({ ok: true, result: { outcome: 'forgotten', environmentId: id } });
    throw Error('Unexpected command');
  };
  for (const scenario of ['active', 'foreign', 'mismatched']) {
    active = scenario === 'active'; foreign = scenario === 'foreign'; mismatched = scenario === 'mismatched';
    assert.equal(await retireBootstrapConnections(f.project, host, { run, profile: f.root, cli: 'fixture-orca' }), false);
    assert.ok(!calls.some(args => args[1] === 'forget'));
  }
  active = foreign = mismatched = false;
  assert.equal(await retireBootstrapConnections(f.project, host, { run, profile: f.root, cli: 'fixture-orca' }), true);
  assert.deepEqual(calls.filter(args => args[1] === 'forget'), [['environment', 'forget', '--environment', 'bootstrap', '--yes', '--json']]);
  assert.ok(!calls.some(args => args.includes('stop') || args.includes('rm') || args.includes('create')));
});
