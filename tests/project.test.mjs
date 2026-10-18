import assert from 'node:assert/strict';
import { test } from 'node:test';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { connect } from 'node:net';
import { provisionProject } from '../runtime/project-sandbox.mjs';
import { archiveProject, listProjects, projectSandboxName, readProject } from '../runtime/project-state.mjs';
import { createProjectResolver, launchProjectTransport, listenProject } from '../runtime/project-transport.mjs';
import { choosePublishedPort } from '../scripts/lifecycle.mjs';
import { supervisorTick } from '../runtime/project-supervisor.mjs';
import { installProjectStartup, startupSource } from '../scripts/project-startup.mjs';
import { identity } from '../runtime/omp-session.mjs';
import { installRelease } from '../scripts/release.mjs';
import { createProjectLifecycle } from '../runtime/project-recipe.mjs';

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'teck-project-test-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const calls = [], sandboxes = new Map();
  let generation = 0;
  const run = (program, args) => {
    calls.push([program, args]);
    if (program === 'git') throw Error('No host Git identity');
    if (program === 'ssh') return 'user _default_user_\nproxycommand "sbx" ssh proxy %n\n';
    if (args[0] === 'ls') return JSON.stringify([...sandboxes].map(([name, id]) => ({ name, id })));
    if (args[0] === 'create') { generation++; sandboxes.set(args[args.indexOf('--name') + 1], generation === 1 ? 'provider-id' : `provider-id-${generation}`); return ''; }
    if (args[0] === 'rm') { sandboxes.delete(args.at(-1)); return ''; }
    if (args.includes('/usr/local/lib/teck-orca/manage-daemon.mjs')) return JSON.stringify({ schemaVersion: 1, projectRoot: '/home/agent/project', pairingCode: 'orca://pair?code=private' });
    return '';
  };
  const options = { projectId: 'github:example/project', displayName: 'Project', repoPath: root, assetRoot: root,
    cloneUrl: 'https://github.com/example/project.git', stateRoot: root, run, sync: () => {}, selectPort: async () => 27001,
    ensureBuilder: async () => {} };
  return { root, calls, sandboxes, options, run, name: projectSandboxName(options.projectId) };
}
test('all features of a project reuse one sandbox/clone without Docker ports or feature identity', async t => {
  const f = fixture(t);
  const [first, second] = await Promise.all([provisionProject(f.options), provisionProject(f.options)]);
  assert.equal(first.state.sandboxId, 'provider-id');
  assert.equal(first.state.sandboxName, second.state.sandboxName);
  assert.equal(f.calls.filter(([, args]) => args[0] === 'create').length, 1);
  assert.equal(f.calls.filter(([, args]) => args.includes('clone')).length, 1);
  const creation = f.calls.find(([, args]) => args[0] === 'create')[1];
  assert.ok(!creation.includes('--publish'));
  assert.ok(!creation.some(arg => arg.includes('TECK_ORCA_FEATURE_ID')));
  assert.ok(creation.includes('TECK_ORCA_PROJECT_ID=github:example/project'));
  assert.ok(!readFileSync(join(f.root, f.name, 'state.json'), 'utf8').includes('orca://'));
  const other = await provisionProject({ ...f.options, projectId: 'github:example/other', selectPort: async () => 27002 });
  assert.notEqual(other.state.sandboxName, first.state.sandboxName);
});
test('project provisioning refuses missing, replaced and unowned sandboxes without deleting work', async t => {
  const f = fixture(t);
  f.sandboxes.set(f.name, 'unowned');
  await assert.rejects(provisionProject(f.options), /unowned/);
  f.sandboxes.clear();
  await provisionProject(f.options);
  f.sandboxes.set(f.name, 'replacement');
  await assert.rejects(provisionProject(f.options), /identity changed/);
  f.sandboxes.clear();
  await assert.rejects(provisionProject(f.options), /missing/);
  assert.ok(!f.calls.some(([, args]) => args[0] === 'rm'));
});
test('failure only rolls back a project created by that invocation', async t => {
  const f = fixture(t);
  const failing = (p, args) => { if (args.includes('clone')) throw Error('Clone rejected'); return f.run(p, args); };
  await assert.rejects(provisionProject({ ...f.options, run: failing }), /Clone rejected/);
  assert.equal(f.sandboxes.size, 0);
  await provisionProject(f.options);
  f.calls.length = 0;
  await assert.rejects(provisionProject({ ...f.options, run: (p, args) => { if (args.includes('/usr/local/lib/teck-orca/manage-daemon.mjs')) throw Error('Daemon unavailable'); return f.run(p, args); } }), /Daemon unavailable/);
  assert.equal(f.sandboxes.size, 1);
  assert.ok(!f.calls.some(([, args]) => args[0] === 'rm'));
});

test('builder capacity failure happens before a project sandbox or ownership record is created', async t => {
  const f = fixture(t);
  await assert.rejects(provisionProject({ ...f.options, ensureBuilder: async () => {
    throw Error('Kit builder disk is too small');
  } }), /builder disk/);
  assert.equal(f.sandboxes.size, 0);
  assert.equal(existsSync(join(f.root, f.name, 'state.json')), false);
  assert.equal(f.calls.some(([, args]) => ['create', 'rm'].includes(args[0])), false);
});

test('explicit recreation archives a deleted project once and refuses renamed or foreign sandboxes', async t => {
  const f = fixture(t), first = await provisionProject(f.options);
  const metadata = join(f.root, f.name, 'transport.log');
  writeFileSync(metadata, 'old diagnostic\n');
  f.sandboxes.delete(f.name);
  const options = { ...f.options, recreateMissing: true };
  f.sandboxes.set('renamed-sandbox', first.state.sandboxId);
  await assert.rejects(provisionProject(options), /another name/);
  assert.equal(existsSync(join(f.root, 'retired')), false);
  f.sandboxes.clear();
  const [second, third] = await Promise.all([provisionProject(options), provisionProject(options)]);
  assert.notEqual(second.state.sandboxId, first.state.sandboxId);
  assert.equal(second.state.sandboxId, third.state.sandboxId);
  assert.equal(f.calls.filter(([, args]) => args[0] === 'create').length, 2);
  const retired = readdirSync(join(f.root, 'retired'));
  assert.equal(retired.length, 1);
  assert.equal(JSON.parse(readFileSync(join(f.root, 'retired', retired[0], 'state.json'))).sandboxId, first.state.sandboxId);
  assert.equal(readFileSync(join(f.root, 'retired', retired[0], 'transport.log'), 'utf8'), 'old diagnostic\n');
  assert.equal(listProjects(f.root).length, 1);
  f.sandboxes.set(f.name, 'foreign');
  await assert.rejects(provisionProject(options), /identity changed/);
  assert.ok(!f.calls.some(([, args]) => args[0] === 'rm'));
});

test('failed recreation preserves retired metadata and bad inventories never retire ownership', async t => {
  const f = fixture(t), first = await provisionProject(f.options);
  f.sandboxes.clear();
  const options = { ...f.options, recreateMissing: true };
  for (const output of ['{}', 'not json']) {
    await assert.rejects(provisionProject({ ...options, run: (p, args) => args[0] === 'ls' ? output : f.run(p, args) }));
    assert.equal(readProject(f.options.projectId, f.root).sandboxId, first.state.sandboxId);
    assert.equal(existsSync(join(f.root, 'retired')), false);
  }
  await assert.rejects(provisionProject({ ...options, run: (p, args) => {
    if (args.includes('clone')) throw Error('Clone rejected');
    return f.run(p, args);
  } }), /Clone rejected/);
  assert.equal(f.sandboxes.size, 0);
  assert.equal(listProjects(f.root).length, 0);
  const retired = readdirSync(join(f.root, 'retired'));
  assert.equal(retired.length, 1);
  assert.equal(JSON.parse(readFileSync(join(f.root, 'retired', retired[0], 'state.json'))).sandboxId, first.state.sandboxId);
  await provisionProject(options);
  assert.equal(f.sandboxes.size, 1);
});
test('connection wakes through SSH, waits for its local daemon, and serializes concurrent requests', async t => {
  const f = fixture(t); await provisionProject(f.options);
  const calls = [];
  const resolver = createProjectResolver(f.options.projectId, { stateRoot: f.root, run: async (p, args) => {
    calls.push([p, args]);
    if (p === 'sbx') return f.run(p, args);
    await new Promise(resolve => setTimeout(resolve, 15));
    return JSON.stringify({ schemaVersion: 1, projectRoot: '/home/agent/project', pairingCode: 'orca://pair?code=private' });
  } });
  const [a, b] = await Promise.all([resolver(), resolver()]);
  assert.equal(a.sandboxName, b.sandboxName);
  assert.equal(calls.filter(([p]) => p === 'ssh').length, 1);
  const args = calls.find(([p]) => p === 'ssh')[1];
  assert.ok(args.includes('ControlMaster=no'));
  assert.ok(args.includes(`${f.name}.sbx`));
  assert.match(args.at(-1), /manage-daemon\.mjs.*27001.*ssh$/);
  f.sandboxes.set(f.name, 'replacement');
  await assert.rejects(resolver(), /missing or has been replaced/);
});
test('project byte forwarding preserves traffic and refuses an occupied address', async t => {
  const f = fixture(t); const { state } = await provisionProject(f.options);
  const { createServer } = await import('node:net');
  const probe = createServer(); await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve));
  const port = probe.address().port;
  await assert.rejects(listenProject({ ...state, port }), /EADDRINUSE/);
  await new Promise(resolve => probe.close(resolve));
  const live = await listenProject({ ...state, port }, { resolveProject: async () => ({ ...state, port }),
    forward: () => spawn(process.execPath, ['-e', 'process.stdin.pipe(process.stdout)'], { stdio: ['pipe', 'pipe', 'pipe'] }) });
  try {
    const received = await new Promise((resolve, reject) => {
      const socket = connect(port, '127.0.0.1', () => socket.write('opaque authenticated payload'));
      socket.setTimeout(5000, () => { socket.destroy(); reject(Error('Forwarder timed out')); });
      socket.once('error', reject); socket.once('data', value => { socket.destroy(); resolve(value.toString()); });
    });
    assert.equal(received, 'opaque authenticated payload');
  } finally { await live.close(); }
});
test('supervisor restores listeners on desktop restart and helper failure without waking sandboxes', async t => {
  const f = fixture(t); await provisionProject(f.options);
  const running = new Map(), launches = [];
  let pid = 100, helperAlive = true;
  const options = { stateRoot: f.root, running, status: async () => ({ ok: true, result: { app: { running: !!pid, pid } } }),
    transportAlive: () => helperAlive, launch: async (project, owner) => launches.push([project, owner]) };
  await supervisorTick(options); await supervisorTick(options);
  assert.equal(launches.length, 1);
  helperAlive = false; await supervisorTick(options); assert.equal(launches.length, 2);
  helperAlive = true; pid = 200; await supervisorTick(options); assert.equal(launches.at(-1)[1], 200);
  pid = null; await supervisorTick(options); assert.equal(running.size, 0);
});
test('real transport companion starts once and releases its listener when its desktop owner exits', async t => {
  const f = fixture(t), port = await choosePublishedPort();
  await provisionProject({ ...f.options, selectPort: async () => port });
  const owner = spawn(process.execPath, ['-e', 'setInterval(()=>{},1000)'], { windowsHide: true, stdio: 'ignore' });
  t.after(() => owner.kill());
  await new Promise((resolve, reject) => { owner.once('spawn', resolve); owner.once('error', reject); });
  assert.equal((await launchProjectTransport(f.options.projectId, owner.pid, { stateRoot: f.root })).ok, true);
  const before = JSON.parse(readFileSync(join(f.root, f.name, 'transport.json'), 'utf8'));
  assert.equal((await launchProjectTransport(f.options.projectId, owner.pid, { stateRoot: f.root })).existing, true);
  assert.equal(JSON.parse(readFileSync(join(f.root, f.name, 'transport.json'), 'utf8')).pid, before.pid);
  owner.kill();
  await new Promise(resolve => owner.once('exit', resolve));
  const { createServer } = await import('node:net');
  let freed = false;
  for (let attempt = 0; attempt < 40 && !freed; attempt++) {
    freed = await new Promise(resolve => {
      const server = createServer(); server.once('error', () => resolve(false));
      server.listen(port, '127.0.0.1', () => server.close(() => resolve(true)));
    });
    if (!freed) await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.equal(freed, true, 'The helper retained a listener after its owner exited');
});

test('real transport releases a retired project listener while the desktop stays alive', async t => {
  const f = fixture(t), port = await choosePublishedPort();
  await provisionProject({ ...f.options, selectPort: async () => port });
  const owner = spawn(process.execPath, ['-e', 'setInterval(()=>{},1000)'], { windowsHide: true, stdio: 'ignore' });
  t.after(() => owner.kill());
  await new Promise((resolve, reject) => { owner.once('spawn', resolve); owner.once('error', reject); });
  await launchProjectTransport(f.options.projectId, owner.pid, { stateRoot: f.root });
  const retired = archiveProject(f.options.projectId, f.root);
  assert.equal(listProjects(f.root).length, 0);
  const { createServer } = await import('node:net');
  let freed = false;
  for (let attempt = 0; attempt < 50 && !freed; attempt++) {
    freed = await new Promise(resolve => {
      const server = createServer(); server.once('error', () => resolve(false));
      server.listen(port, '127.0.0.1', () => server.close(() => resolve(true)));
    });
    if (!freed) await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.equal(freed, true);
  assert.equal(owner.exitCode, null);
  assert.equal(existsSync(join(retired, 'state.json')), true);
});
test('Windows login startup is hidden, user-scoped, and checks the pinned transport code', t => {
  const f = fixture(t), digest = 'a'.repeat(64);
  const installed = installProjectStartup({ digest }, { platform: 'win32', env: { APPDATA: f.root }, node: 'C:\\Program Files\\nodejs\\node.exe', start: false });
  const source = readFileSync(installed.path, 'utf8');
  assert.match(source, /shell\.Run .*0, False/);
  assert.ok(installed.path.startsWith(f.root));
  assert.match(startupSource(digest), /project-supervisor\.mjs/);
  assert.match(startupSource(digest), /Startup runtime changed/);
  assert.throws(() => startupSource('../untrusted'), /Invalid/);
});
test('the real login launcher runs approved code and refuses modified transport dependencies', async t => {
  const f = fixture(t), source = join(f.root, 'source');
  mkdirSync(join(source, 'scripts'), { recursive: true }); mkdirSync(join(source, 'runtime'));
  writeFileSync(join(source, 'scripts/lifecycle.mjs'), '// fixture');
  for (const name of ['project-state.mjs', 'project-transport.mjs']) writeFileSync(join(source, 'runtime', name), '// fixture');
  writeFileSync(join(source, 'runtime/project-supervisor.mjs'), "import fs from 'node:fs';export function supervise(){fs.writeFileSync(process.env.TECK_STARTUP_MARKER,'ready');}");
  const release = installRelease(source, join(f.root, 'releases'));
  const marker = join(f.root, 'started'), env = { ...process.env, TECK_ORCA_RELEASES_DIR: join(f.root, 'releases'), TECK_STARTUP_MARKER: marker };
  if (process.platform === 'win32') {
    const installed = installProjectStartup(release, { env: { ...env, APPDATA: f.root }, start: false });
    const result = spawnSync('cscript.exe', ['//nologo', installed.path], { env, windowsHide: true, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    for (let i = 0; i < 30 && !existsSync(marker); i++) await new Promise(resolve => setTimeout(resolve, 100));
    assert.equal(readFileSync(marker, 'utf8'), 'ready');
  } else {
    const result = spawnSync(process.execPath, ['-e', startupSource(release.digest)], { env, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr); assert.equal(readFileSync(marker, 'utf8'), 'ready');
  }
  rmSync(marker, { force: true });
  writeFileSync(join(release.destination, 'runtime/project-transport.mjs'), '// changed');
  const result = spawnSync(process.execPath, ['-e', startupSource(release.digest)], { env, encoding: 'utf8', windowsHide: true });
  assert.notEqual(result.status, 0); assert.match(result.stderr, /Startup runtime changed/); assert.equal(existsSync(marker), false);
});
test('OMP session identity supports project-wide ownership and keeps worktrees and panes distinct', () => {
  const env = { TECK_ORCA_PROJECT_ID: 'github:example/project', ORCA_WORKTREE_ID: 'repo::/project/a', ORCA_PANE_KEY: 'tab:11111111-1111-1111-1111-111111111111' };
  const a = identity(env, '/project/a');
  assert.equal(a.featureId, env.TECK_ORCA_PROJECT_ID);
  assert.notDeepEqual(a, identity({ ...env, ORCA_WORKTREE_ID: 'repo::/project/b' }, '/project/b'));
});

test('Orca first use provisions once per project and returns results for distinct workspace instances', async t => {
  const f = fixture(t), launched = [], invocations = [];
  const env = { ORCA_CLI_COMMAND: 'mock-orca', ORCA_PROJECT_ID: f.options.projectId, ORCA_VM_INSTANCE_ID: 'workspace-a', ORCA_REPO_URL: f.options.cloneUrl, ORCA_REPO_PATH: f.root };
  const dependencies = { stateRoot: f.root, assetRoot: f.root,
    run: () => JSON.stringify({ ok: true, result: { app: { running: true, pid: process.pid } } }),
    launch: async (project, pid) => launched.push([project, pid]),
    provision: async args => { invocations.push(args); return provisionProject({ ...f.options, ...args, run: f.run, sync: () => {}, selectPort: async () => 27001 }); } };
  const firstUse = createProjectLifecycle({ ...dependencies, env });
  assert.equal(f.calls.length, 0, 'Constructing the lifecycle must not provision');
  assert.equal(invocations.length, 0);
  const first = await firstUse('create');
  assert.equal(invocations[0].recreateMissing, true);
  const secondUse = createProjectLifecycle({ ...dependencies, env: { ...env, ORCA_VM_INSTANCE_ID: 'workspace-b' } });
  const second = await secondUse('create');
  assert.equal(first.userData.sandboxName, second.userData.sandboxName);
  assert.equal(first.userData.sandboxId, second.userData.sandboxId);
  assert.equal(first.pairingCode, second.pairingCode);
  assert.notEqual(first.userData.instanceId, second.userData.instanceId);
  assert.equal(first.userData.connectionMode, 'project-ssh');
  assert.equal(f.calls.filter(([, args]) => args[0] === 'create').length, 1);
  assert.equal(f.calls.filter(([, args]) => args.includes('clone')).length, 1);
  assert.equal(launched.length, 2);
  await firstUse('resume', { recipeResult: first });
  assert.equal(invocations.at(-1).recreateMissing, false);
  assert.equal(invocations.at(-1).expectedSandboxId, first.userData.sandboxId);
  f.calls.length = 0;
  await firstUse('suspend', { recipeResult: first }); await firstUse('destroy', { recipeResult: first });
  assert.equal(f.calls.length, 0, 'Worktree sleep/delete must not affect the shared sandbox');
  await assert.rejects(secondUse('resume', { recipeResult: first }), /another project or workspace/);
});

test('new Orca workspace replaces a deleted sandbox but old workspace resume never does', async t => {
  const f = fixture(t);
  const env = { ORCA_CLI_COMMAND: 'mock-orca', ORCA_PROJECT_ID: f.options.projectId,
    ORCA_VM_INSTANCE_ID: 'old-workspace', ORCA_REPO_URL: f.options.cloneUrl };
  const options = { env, stateRoot: f.root, assetRoot: f.root, launch: async () => {},
    run: () => JSON.stringify({ ok: true, result: { app: { running: true, pid: process.pid } } }),
    provision: args => provisionProject({ ...f.options, ...args, run: f.run, sync: () => {}, selectPort: async () => 27001 }) };
  const old = createProjectLifecycle(options);
  const first = await old('create');
  f.sandboxes.clear();
  await assert.rejects(old('resume', { recipeResult: first }), /missing/);
  assert.equal(f.calls.filter(([, args]) => args[0] === 'create').length, 1);
  const fresh = createProjectLifecycle({ ...options, env: { ...env, ORCA_VM_INSTANCE_ID: 'new-workspace' } });
  const second = await fresh('create');
  assert.notEqual(second.userData.sandboxId, first.userData.sandboxId);
  await assert.rejects(old('resume', { recipeResult: first }), /identity changed/);
  assert.equal(f.calls.filter(([, args]) => args[0] === 'create').length, 2);
});

test('resume rechecks the original provider identity inside the provisioning lock', async t => {
  const f = fixture(t);
  const env = { ORCA_CLI_COMMAND: 'mock-orca', ORCA_PROJECT_ID: f.options.projectId,
    ORCA_VM_INSTANCE_ID: 'old-workspace', ORCA_REPO_URL: f.options.cloneUrl };
  let replaceDuringResume = false;
  const lifecycle = createProjectLifecycle({ env, stateRoot: f.root, assetRoot: f.root, launch: async () => {},
    run: () => JSON.stringify({ ok: true, result: { app: { running: true, pid: process.pid } } }),
    provision: async args => {
      if (replaceDuringResume) {
        replaceDuringResume = false;
        f.sandboxes.clear();
        await provisionProject({ ...f.options, recreateMissing: true });
      }
      return provisionProject({ ...f.options, ...args, run: f.run, sync: () => {}, selectPort: async () => 27001 });
    } });
  const first = await lifecycle('create');
  replaceDuringResume = true;
  await assert.rejects(lifecycle('resume', { recipeResult: first }), /identity changed/);
  assert.notEqual(readProject(f.options.projectId, f.root).sandboxId, first.userData.sandboxId);
});

test('project recipe refuses manual provisioning without Orca identity or a running desktop', async t => {
  const f = fixture(t); let provisions = 0;
  const dependencies = { provision: async () => { provisions++; throw Error('Must not provision'); } };
  await assert.rejects(createProjectLifecycle({ ...dependencies, env: { ORCA_PROJECT_ID: f.options.projectId } })('create'), /instance identity/);
  await assert.rejects(createProjectLifecycle({ ...dependencies, env: { ORCA_CLI_COMMAND: 'mock-orca', ORCA_PROJECT_ID: f.options.projectId, ORCA_VM_INSTANCE_ID: 'workspace', ORCA_REPO_URL: f.options.cloneUrl },
    run: () => JSON.stringify({ ok: true, result: { app: { running: false, pid: null } } }) })('create'), /desktop must be running/);
  assert.equal(provisions, 0);
});
