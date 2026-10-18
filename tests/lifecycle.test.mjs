import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, rmSync, existsSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { createLifecycle, connectionResult, sandboxName, REMOTE_PROJECT, withFeatureLock, validateCloneUrl, shellQuote, runtimeEnvironment, syncConfiguration, publishedEndpoint, choosePublishedPort } from '../scripts/lifecycle.mjs';
import { EventEmitter } from 'node:events';

function fixture(t, overrides = {}) {
  const stateRoot = mkdtempSync(join(tmpdir(), 'teck-orca-test-'));
  t.after(() => rmSync(stateRoot, { recursive: true, force: true }));
  const env = { ORCA_PROJECT_ID: 'project with spaces', ORCA_VM_INSTANCE_ID: 'workspace-1', ORCA_REPO_URL: 'https://github.com/example/repo.git', ...overrides };
  const name = sandboxName(env.ORCA_PROJECT_ID, env.ORCA_VM_INSTANCE_ID || env.ORCA_WORKSPACE_ID);
  const calls = [];
  const sandboxes = new Set(), clones = new Set();
  const state = { get exists() { return sandboxes.has(name); }, set exists(value) { value ? sandboxes.add(name) : sandboxes.delete(name); },
    worktrees: `worktree ${REMOTE_PROJECT}\nHEAD aabb\nbranch refs/heads/main\n`, inventoryError: false };
  const run = (program, args) => {
    calls.push({ program, args });
    if (program === 'ssh') return 'user _default_user_\nproxycommand "sbx" ssh proxy %n\n';
    if (program === 'git') throw new Error('No local Git identity');
    if (args[0] === 'ls') return JSON.stringify([...sandboxes].map((name) => ({ name })));
    if (args[0] === 'create') { sandboxes.add(args[args.indexOf('--name') + 1]); return ''; }
    if (args[0] === 'rm') { sandboxes.delete(args.at(-1)); return ''; }
    if (args.includes('rev-parse')) { if (!clones.has(args[1])) throw new Error('Not a checkout'); return REMOTE_PROJECT; }
    if (args.includes('clone')) { clones.add(args[1]); return ''; }
    if (args.includes('worktree')) { if (state.inventoryError) throw new Error('Unavailable'); return state.worktrees; }
    return '';
  };
  const start = (sandbox) => ({ schemaVersion: 1, projectRoot: REMOTE_PROJECT, pairingCode: `orca://pair?code=test-${sandbox}` });
  const lifecycle = createLifecycle({ env, stateRoot, run, sync: () => {}, start });
  const payload = { recipeResult: connectionResult(name, env.ORCA_PROJECT_ID, env.ORCA_VM_INSTANCE_ID || env.ORCA_WORKSPACE_ID) };
  return { lifecycle, payload, calls, state, stateRoot, env, name, run, start };
}

test('repeated feature creation shares one mountless daemon sandbox and one clone', async (t) => {
  const f = fixture(t);
  const [first, second] = await Promise.all([f.lifecycle('create'), f.lifecycle('create')]);
  assert.deepEqual(first, second);
  assert.ok(first.pairingCode.startsWith('orca://pair?'));
  assert.equal(first.connection, undefined);
  assert.equal(first.projectRoot, REMOTE_PROJECT);
  assert.equal(first.checkoutMode, undefined);
  const creates = f.calls.filter((c) => c.args[0] === 'create');
  assert.equal(creates.length, 1);
  assert.equal(f.calls.filter((c) => c.args.includes('clone')).length, 1);
  assert.ok(creates[0].args.some((a) => a.endsWith(join('kits', 'workload'))));
  assert.ok(creates[0].args.includes('OMNIROUTE_API_KEY=proxy-managed'));
  assert.ok(creates[0].args.includes('MCPHUB_API_KEY=proxy-managed'));
  const publish = creates[0].args[creates[0].args.indexOf('--publish') + 1];
  const saved = JSON.parse(readFileSync(join(f.stateRoot, f.name, 'state.json')));
  assert.equal(publish, `127.0.0.1:${saved.publishedHostPort}:6768/tcp4`);
  assert.ok(saved.publishedHostPort >= 20000 && saved.publishedHostPort < 40000);
  assert.ok(creates[0].args.some((a) => a.endsWith(join('kits', 'orcad'))));
  assert.ok(!JSON.stringify(f.calls).includes('sshd'));
});

test('published port selection skips OS-denied and occupied addresses without taking them over', async () => {
  const attempts = [], errors = ['EACCES', 'EADDRINUSE', null];
  let candidate = 20000;
  const port = await choosePublishedPort({ randomPort: () => candidate++, serverFactory: () => {
    const server = new EventEmitter(), code = errors.shift();
    server.listen = (value, host, callback) => { attempts.push([value, host]); queueMicrotask(() => code ? server.emit('error', Object.assign(Error(code), { code })) : callback()); };
    server.close = callback => callback();
    return server;
  } });
  assert.equal(port, 20002);
  assert.deepEqual(attempts, [[20000, '127.0.0.1'], [20001, '127.0.0.1'], [20002, '127.0.0.1']]);
});

test('suspend does not stop feature children and resume reuses its connection', async (t) => {
  const f = fixture(t);
  const created = await f.lifecycle('create');
  f.calls.length = 0;
  await f.lifecycle('suspend', f.payload);
  assert.equal(f.calls.length, 0);
  assert.deepEqual(await f.lifecycle('resume', f.payload), created);
  assert.equal(f.calls.filter((c) => c.args[0] === 'create').length, 0);
  assert.ok(f.calls.some((c) => c.args[0] === 'exec' && c.args.at(-1) === 'true'));
});

test('destroy retains child worktrees and deletes the final owned feature', async (t) => {
  const f = fixture(t);
  await f.lifecycle('create');
  f.state.worktrees += `\nworktree /home/agent/worktrees/child\nHEAD aabb\n`;
  await f.lifecycle('destroy', f.payload);
  assert.equal(f.state.exists, true);
  f.state.worktrees = `worktree ${REMOTE_PROJECT}\n`;
  await f.lifecycle('destroy', f.payload);
  assert.equal(f.state.exists, false);
  assert.equal(existsSync(join(f.stateRoot, f.name)), false);
  await f.lifecycle('destroy', f.payload); // Idempotent when already gone.
});

test('destroy fails safely on empty or failed worktree inventory', async (t) => {
  const f = fixture(t);
  await f.lifecycle('create');
  f.state.worktrees = '';
  await assert.rejects(f.lifecycle('destroy', f.payload), /retained/);
  f.state.inventoryError = true;
  await assert.rejects(f.lifecycle('destroy', f.payload), /Unavailable/);
  assert.equal(f.state.exists, true);
  assert.equal(f.calls.filter((c) => c.args[0] === 'rm').length, 0);
});

test('foreign lifecycle payloads and unowned sandboxes cannot be adopted or destroyed', async (t) => {
  const f = fixture(t);
  const payload = { recipeResult: connectionResult(sandboxName('other', 'workspace-1'), 'other', 'workspace-1') };
  await assert.rejects(f.lifecycle('destroy', payload), /another project/);
  assert.equal(f.calls.length, 0);
  f.state.exists = true;
  await assert.rejects(f.lifecycle('create'), /ENOENT/);
  assert.equal(f.calls.filter((c) => c.args[0] === 'rm').length, 0);
});

test('invalid clone URLs fail before provisioning', async (t) => {
  const f = fixture(t, { ORCA_REPO_URL: 'C:\\local repo' });
  await assert.rejects(f.lifecycle('create'), /host-local/);
  assert.equal(f.calls.filter((c) => c.args[0] === 'create').length, 0);
  assert.throws(() => validateCloneUrl('https://user:secret@example.com/repo'), /credential-free/);
  assert.throws(() => validateCloneUrl('ssh://git:secret@example.com/repo'), /credential-free/);
  assert.equal(validateCloneUrl('ssh://git@example.com/repo'), 'ssh://git@example.com/repo');
  assert.equal(shellQuote("a'b"), "'a'\"'\"'b'");
  assert.throws(() => shellQuote('a\0b'), /NUL/);
  assert.ok(runtimeEnvironment().PATH.startsWith('/usr/local/bin:'));
});

test('a living lock holder is not stolen and a dead holder is recovered', async (t) => {
  const f = fixture(t);
  let release;
  const barrier = new Promise((resolve) => { release = resolve; });
  const owner = withFeatureLock(f.stateRoot, f.name, () => barrier);
  await delay(10);
  await assert.rejects(withFeatureLock(f.stateRoot, f.name, () => {}, 0), /Timed out/);
  release();
  await owner;
  const lock = join(f.stateRoot, `${f.name}.lock`);
  mkdirSync(lock);
  writeFileSync(join(lock, 'owner.json'), JSON.stringify({ pid: 2147483647, token: 'dead' }));
  assert.equal(await withFeatureLock(f.stateRoot, f.name, () => 'recovered'), 'recovered');
  assert.equal(existsSync(lock), false);
});

test('two features in the same project allocate independent sandboxes and cleanup is isolated', async (t) => {
  const f = fixture(t);
  await f.lifecycle('create');
  const sibling = createLifecycle({ env: { ...f.env, ORCA_VM_INSTANCE_ID: 'workspace-2' }, stateRoot: f.stateRoot, run: f.run, sync: () => {}, start: f.start });
  const result = await sibling('create');
  assert.notEqual(result.pairingCode, f.start(f.name).pairingCode);
  assert.equal(f.calls.filter((c) => c.args[0] === 'create').length, 2);
  assert.equal(f.calls.filter((c) => c.args.includes('clone')).length, 2);
  await f.lifecycle('destroy', f.payload);
  assert.equal(f.state.exists, false);
  assert.ok(JSON.parse(f.run('sbx', ['ls', '--json'])).some((row) => row.name === result.userData.sandboxName));
  await sibling('destroy', { recipeResult: result });
  assert.equal(f.state.exists, false);
});

test('cleanup rejects another workspace instance within the same project', async (t) => {
  const f = fixture(t);
  await f.lifecycle('create');
  await assert.rejects(f.lifecycle('destroy', { recipeResult: connectionResult(sandboxName(f.env.ORCA_PROJECT_ID, 'wrong-instance'), f.env.ORCA_PROJECT_ID, 'wrong-instance') }), /another workspace/);
  assert.equal(f.state.exists, true);
});

test('feature identity never falls back to the project and workspace fallback is stable', async (t) => {
  assert.throws(() => sandboxName('project'), /ORCA_VM_INSTANCE_ID/);
  const f = fixture(t, { ORCA_VM_INSTANCE_ID: '', ORCA_WORKSPACE_ID: 'feature-workspace' });
  const result = await f.lifecycle('create');
  assert.equal(result.userData.featureId, 'feature-workspace');
  assert.notEqual(sandboxName('other-project', 'feature-workspace'), f.name);
});

test('retained-feature cleanup refuses a live owner and waits for all linked children', async (t) => {
  const f = fixture(t);
  await f.lifecycle('create');
  await f.lifecycle('cleanup', f.payload);
  assert.equal(f.state.exists, true);
  f.state.worktrees += '\nworktree /home/agent/worktrees/child\n';
  await f.lifecycle('destroy', f.payload);
  await f.lifecycle('cleanup', f.payload);
  assert.equal(f.state.exists, true);
  f.state.worktrees = `worktree ${REMOTE_PROJECT}\n`;
  await f.lifecycle('cleanup', f.payload);
  assert.equal(f.state.exists, false);
});

test('OMP configuration preserves the Orca relay CLI path and supplies feature identity', () => {
  const calls = [];
  syncConfiguration('teck-orca-f-0123456789ab', undefined, (program, args) => { calls.push({ program, args }); return ''; },
    { projectId: 'project', featureId: 'feature', sandboxName: 'teck-orca-f-0123456789ab' });
  const script = calls.find((c) => c.args[0] === 'exec').args.at(-1);
  assert.ok(script.includes(':"${PATH:-}"'));
  assert.ok(script.includes('TECK_ORCA_FEATURE_ID'));
  assert.ok(!script.includes('unset ORCA_'));
});

test('OMP write-access failure fails provisioning instead of returning a broken SSH workspace', async (t) => {
  const f = fixture(t);
  const lifecycle = createLifecycle({ env: f.env, stateRoot: f.stateRoot, sync: () => {}, start: f.start, run: (program, args) => {
    if (program === 'sbx' && args[0] === 'exec' && args.at(-1).includes('mktemp -d /home/agent/.omp/run/')) {
      assert.deepEqual(args.slice(0, 4), ['exec', '-u', 'agent', f.name]);
      throw new Error('OMP runtime directory is not writable by agent');
    }
    return f.run(program, args);
  } });
  await assert.rejects(lifecycle('create'), /OMP runtime directory is not writable/);
  assert.equal(f.state.exists, false);
  assert.equal(f.calls.filter((c) => c.args[0] === 'rm').length, 1);
});

test('Bun cache write failure rolls back a fresh sandbox and preserves a reused feature', async (t) => {
  const f = fixture(t);
  const failing = createLifecycle({ env: f.env, stateRoot: f.stateRoot, sync: () => {}, start: f.start, run: (program, args) => {
    if (program === 'sbx' && args[0] === 'exec' && args.at(-1).includes('bun_cache_check=')) {
      assert.deepEqual(args.slice(0, 4), ['exec', '-u', 'agent', f.name]);
      throw new Error('Bun cache is not writable by agent');
    }
    return f.run(program, args);
  } });
  await assert.rejects(failing('create'), /Bun cache is not writable/);
  assert.equal(f.state.exists, false);
  await f.lifecycle('create');
  f.calls.length = 0;
  await assert.rejects(failing('resume', f.payload), /Bun cache is not writable/);
  assert.equal(f.state.exists, true);
  assert.ok(!f.calls.some((call) => call.args[0] === 'rm'));
});

test('daemon startup failure rolls back only a fresh feature and pairing secrets stay out of state', async (t) => {
  const f = fixture(t);
  const failing = createLifecycle({ env: f.env, stateRoot: f.stateRoot, run: f.run, sync: () => {}, start: () => { throw new Error('daemon failed'); } });
  await assert.rejects(failing('create'), /daemon failed/);
  assert.equal(f.state.exists, false);
  await f.lifecycle('create');
  assert.ok(!readFileSync(join(f.stateRoot, f.name, 'state.json'), 'utf8').includes('pairingCode'));
  await assert.rejects(failing('create'), /daemon failed/);
  assert.equal(f.state.exists, true);
});

test('the daemon recipe refuses to repair or adopt an existing SSH feature', async (t) => {
  const f = fixture(t);
  await f.lifecycle('create');
  const path = join(f.stateRoot, f.name, 'state.json');
  const state = JSON.parse(readFileSync(path, 'utf8'));
  delete state.connectionMode;
  writeFileSync(path, JSON.stringify(state));
  f.calls.length = 0;
  await assert.rejects(f.lifecycle('create'), /Existing SSH sandbox is unchanged/);
  await assert.rejects(f.lifecycle('resume', f.payload), /Existing SSH sandbox is unchanged/);
  assert.ok(!f.calls.some((call) => call.args[0] === 'exec' || call.args[0] === 'rm'));
  assert.equal(f.state.exists, true);
});

test('loopback mapping is required and malformed daemon readiness is rejected', () => {
  assert.equal(publishedEndpoint(JSON.stringify([{ host_ip: '127.0.0.1', host_port: 49123, container_port: 6768 }])), 'ws://127.0.0.1:49123');
  assert.throws(() => publishedEndpoint(JSON.stringify([{ host_ip: '0.0.0.0', host_port: 49123, container_port: 6768 }])), /loopback-only/);
  assert.throws(() => connectionResult(sandboxName('p', 'f'), 'p', 'f', { schemaVersion: 1, projectRoot: '/wrong', pairingCode: 'orca://pair?code=test' }), /readiness/);
});
