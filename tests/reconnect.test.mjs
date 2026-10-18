import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer, connect } from 'node:net';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { sandboxName, REMOTE_PROJECT } from '../scripts/lifecycle.mjs';
import { discoverFeatures, loopbackPort, createResolver, listenBridge, serve } from '../runtime/reconnect-host.mjs';

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'teck-reconnect-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const userDataRoot = join(root, 'orca'), stateRoot = join(root, 'features');
  mkdirSync(userDataRoot); mkdirSync(stateRoot);
  const projectId = 'project', featureId = 'orca-test-feature', name = sandboxName(projectId, featureId);
  const feature = { sandboxName: name, projectId, featureId, port: 45678 };
  const statePath = join(stateRoot, name, 'state.json'); mkdirSync(join(stateRoot, name));
  const state = { ...feature, connectionMode: 'orcad', projectRoot: '/home/agent/project', phase: 'ready', instances: [featureId] };
  writeFileSync(statePath, JSON.stringify(state));
  const runtime = { id: featureId, recipeId: 'teck-sbx-feature', status: 'running', runtimeEnvironmentId: 'environment', recipeResult: { userData: { ...feature, instanceId: featureId, connectionMode: 'orcad' } } };
  const environment = { id: 'environment', source: 'ephemeral-vm', preferredEndpointId: 'ws', endpoints: [{ id: 'ws', kind: 'websocket', endpoint: 'ws://127.0.0.1:45678', deviceToken: 'must-not-leak' }] };
  const save = () => {
    writeFileSync(join(userDataRoot, 'orca-ephemeral-vm-runtimes.json'), JSON.stringify({ runtimes: [runtime] }));
    writeFileSync(join(userDataRoot, 'orca-environments.json'), JSON.stringify({ environments: [environment] }));
    writeFileSync(statePath, JSON.stringify(state));
  };
  save();
  return { feature, state, runtime, environment, statePath, save, userDataRoot, stateRoot };
}
test('recovery discovers only exact owned active feature connections without copying secrets or editing stores', t => {
  const f = fixture(t);
  const before = readFileSync(join(f.userDataRoot, 'orca-environments.json'));
  assert.deepEqual(discoverFeatures(f), [f.feature]);
  assert.ok(!JSON.stringify(discoverFeatures(f)).includes('must-not-leak'));
  assert.deepEqual(readFileSync(join(f.userDataRoot, 'orca-environments.json')), before);
  f.runtime.status = 'suspended'; f.save(); assert.deepEqual(discoverFeatures(f), []);
  f.runtime.status = 'running'; f.state.instances = []; f.save(); assert.deepEqual(discoverFeatures(f), []);
  f.state.instances = [f.feature.featureId]; f.state.projectId = 'foreign'; f.save(); assert.deepEqual(discoverFeatures(f), []);
  f.state.projectId = 'project'; f.environment.source = 'manual'; f.save(); assert.deepEqual(discoverFeatures(f), []);
  for (const endpoint of ['ws://example.com:45678', 'ws://0.0.0.0:45678', 'ws://127.0.0.1:45678/?token=secret', 'ws://user@127.0.0.1:45678', 'ws://127.0.0.1:45678/path']) assert.throws(() => loopbackPort(endpoint));
});
test('wake coalesces simultaneous connections and never creates, removes or reconfigures a sandbox', async t => {
  const f = fixture(t), calls = [];
  const execute = async (program, args) => {
    calls.push(args);
    if (args[0] === 'ls') return JSON.stringify([{ name: f.feature.sandboxName, status: 'stopped' }]);
    if (args[0] === 'ports') return JSON.stringify([{ host_ip: '127.0.0.1', host_port: 45679, sandbox_port: 6768 }]);
    if (args.includes('/usr/local/lib/teck-orca/manage-daemon.mjs')) return JSON.stringify({ schemaVersion: 1, projectRoot: '/home/agent/project', pairingCode: 'orca://pair?secret' });
    return '';
  };
  const resolve = createResolver(f.feature, { execute, stateRoot: f.stateRoot });
  assert.deepEqual(await Promise.all([resolve(), resolve()]), [45679, 45679]);
  assert.equal(calls.filter(args => args.at(-1) === 'true').length, 1);
  assert.equal(calls.filter(args => args.includes('/usr/local/lib/teck-orca/manage-daemon.mjs')).length, 1);
  assert.ok(!calls.some(args => ['create', 'rm', 'cp', 'stop'].includes(args[0])));
  f.state.instances = []; f.save(); calls.length = 0;
  await assert.rejects(resolve(), /ownership changed/);
  assert.equal(calls.length, 0);
});
test('missing VMs and non-loopback mappings are refused without replacement provisioning', async t => {
  const f = fixture(t), calls = [];
  const resolve = createResolver(f.feature, { stateRoot: f.stateRoot, execute: async (program, args) => { calls.push(args); return '[]'; } });
  await assert.rejects(resolve(), /no longer exists/);
  assert.deepEqual(calls, [['ls', '--json']]);
});

test('direct-port recovery rechecks ownership before starting a daemon on an occupied address', async t => {
  const f = fixture(t), calls = [], reservation = createServer();
  await new Promise(resolve => reservation.listen(0, '127.0.0.1', resolve));
  f.feature.port = reservation.address().port;
  const execute = async (program, args) => {
    calls.push(args);
    if (args[0] === 'ports') return JSON.stringify([{ host_ip: '127.0.0.1', host_port: f.feature.port, sandbox_port: 6768 }]);
    return JSON.stringify({ schemaVersion: 1, projectRoot: '/home/agent/project' });
  };
  try {
    const direct = await serve({ features: [f.feature], stateRoot: f.stateRoot, ownerPid: process.pid + 1, execute });
    assert.equal(direct.results[0].state, 'direct'); await direct.close();
    assert.equal(calls.filter(args => args[0] === 'exec').length, 1);
    f.state.instances = []; f.save(); calls.length = 0;
    const refused = await serve({ features: [f.feature], stateRoot: f.stateRoot, ownerPid: process.pid + 1, execute });
    assert.equal(refused.results[0].state, 'blocked');
    assert.match(refused.results[0].error, /ownership changed/);
    assert.equal(calls.length, 0); await refused.close();
    assert.equal(reservation.listening, true);
  } finally { await new Promise(resolve => reservation.close(resolve)); }
});
test('loopback bridge forwards bytes, closes sockets and leaves occupied ports untouched', async () => {
  const upstream = createServer(socket => socket.pipe(socket));
  await new Promise(resolve => upstream.listen(0, '127.0.0.1', resolve));
  const bridge = await listenBridge({ port: 0 }, async () => upstream.address().port);
  // The production path requires a saved nonzero port; port zero is used only
  // here to allocate a collision-free test listener.
  await bridge.close();
  const reservation = createServer();
  await new Promise(resolve => reservation.listen(0, '127.0.0.1', resolve));
  const port = reservation.address().port;
  await assert.rejects(listenBridge({ port }, async () => upstream.address().port), { code: 'EADDRINUSE' });
  assert.equal(reservation.listening, true);
  await new Promise(resolve => reservation.close(resolve));
  const live = await listenBridge({ port }, async () => upstream.address().port);
  try {
    const output = await new Promise((resolve, reject) => {
      const client = connect({ port, host: '127.0.0.1' });
      client.setTimeout(3000, () => { client.destroy(); reject(Error('Bridge timed out')); });
      client.once('error', reject);
      client.once('connect', () => client.write('opaque websocket bytes'));
      client.once('data', data => { resolve(data.toString()); client.destroy(); });
    });
    assert.equal(output, 'opaque websocket bytes');
  } finally { await live.close(); await new Promise(resolve => upstream.close(resolve)); }
});

test('OS-denied saved ports report endpoint refresh and do not wake or reconfigure a stopped VM', async t => {
  const f = fixture(t), calls = [];
  const service = await serve({ features: [f.feature], stateRoot: f.stateRoot, ownerPid: process.pid + 1,
    listen: async () => { throw Object.assign(Error('listen EACCES'), { code: 'EACCES' }); },
    execute: async (program, args) => { calls.push(args); return '[]'; } });
  try {
    assert.equal(service.results[0].state, 'blocked');
    assert.equal(service.results[0].reason, 'saved-port-unavailable');
    assert.match(service.results[0].error, /Suspend then resume/);
    assert.deepEqual(calls, [['ports', f.feature.sandboxName, '--json']]);
  } finally { await service.close(); }
});

test('fixed-port recovery wakes the owned sandbox directly without occupying its Docker port', async t => {
  const f = fixture(t), calls = [];
  f.state.publishedHostPort = f.feature.port; f.save();
  const service = await serve({ features: [f.feature], stateRoot: f.stateRoot, ownerPid: process.pid + 1,
    listen: async () => { throw Error('A fixed Docker port must not be bridged'); },
    execute: async (program, args) => {
      calls.push(args);
      if (args[0] === 'ls') return JSON.stringify([{ name: f.feature.sandboxName }]);
      if (args[0] === 'ports') return JSON.stringify([{ host_ip: '127.0.0.1', host_port: f.feature.port, sandbox_port: 6768 }]);
      return JSON.stringify({ schemaVersion: 1, projectRoot: REMOTE_PROJECT });
    } });
  try {
    assert.equal(service.results[0].state, 'direct');
    assert.deepEqual(calls.map(args => args[0]), ['ls', 'exec', 'ports', 'exec']);
  } finally { await service.close(); }
  f.state.instances = []; f.save(); calls.length = 0;
  const refused = await serve({ features: [f.feature], stateRoot: f.stateRoot, ownerPid: process.pid + 1,
    execute: async () => { calls.push('unexpected'); }, listen: async () => { throw Error('Unexpected listener'); } });
  try { assert.equal(refused.results[0].state, 'blocked'); assert.equal(calls.length, 0); }
  finally { await refused.close(); }
});

test('recovery listener exits with its desktop owner without waking or stopping a VM', async () => {
  const reservation = createServer();
  await new Promise(resolve => reservation.listen(0, '127.0.0.1', resolve));
  const port = reservation.address().port;
  await new Promise(resolve => reservation.close(resolve));
  const owner = spawn(process.execPath, ['-e', 'setInterval(()=>{},1000)'], { windowsHide: true, stdio: 'ignore' });
  let calls = 0;
  const service = await serve({ features: [{ port, sandboxName: 'teck-orca-f-0123456789ab' }], ownerPid: owner.pid,
    execute: async () => { calls++; throw Error('Should remain idle until Retry'); } });
  try {
    assert.equal(service.results[0].state, 'listening');
    owner.kill();
    await new Promise(resolve => owner.once('exit', resolve));
    await delay(2400);
    const probe = createServer();
    await new Promise((resolve, reject) => { probe.once('error', reject); probe.listen(port, '127.0.0.1', resolve); });
    await new Promise(resolve => probe.close(resolve));
    assert.equal(calls, 0);
  } finally { owner.kill(); await service.close(); }
});
