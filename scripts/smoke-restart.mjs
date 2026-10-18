// Explicit disposable cold-resume validation; never opens or changes the desktop.
import assert from 'node:assert/strict';
import { execFile, fork } from 'node:child_process';
import { promisify } from 'node:util';
import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync, readFileSync, cpSync } from 'node:fs';
import { join } from 'node:path';
import { createResolver, listenBridge, loopbackPort, serve } from '../runtime/reconnect-host.mjs';
import { command, createLifecycle, sandboxName, REMOTE_PROJECT, publishedEndpoint } from './lifecycle.mjs';
import { installRelease, repositoryRoot } from './release.mjs';

const projectId = `teck-orca-restart-${randomUUID()}`;
const featureId = 'cold-resume';
const name = sandboxName(projectId, featureId);
const artifactRoot = join(repositoryRoot, '.artifacts', 'smoke', projectId);
mkdirSync(artifactRoot, { recursive: true });
const release = installRelease();
const lifecycle = createLifecycle({ assetRoot: release.destination, stateRoot: join(artifactRoot, 'features'),
  env: { ...process.env, ORCA_PROJECT_ID: projectId, ORCA_VM_INSTANCE_ID: featureId,
    ORCA_REPO_PATH: repositoryRoot, ORCA_REPO_URL: 'https://github.com/mattjohnson/orca-sbx-recipes.git',
    TECK_ORCA_CPUS: '2', TECK_ORCA_MEMORY: '4g' } });
const report = { sandbox: name, release: release.digest, checks: [], ok: false, cleanedUp: false };
const cli = args => {
  const response = JSON.parse(command('sbx', ['exec', '-u', 'agent', name, 'orca-ide', ...args, '--json'], { timeout: 90_000 }));
  assert.equal(response.ok, true, JSON.stringify(response.error));
  return response.result;
};
const host = async args => {
  const response = await promisify(execFile)(process.execPath, [join(repositoryRoot, 'runtime/kits/orcad/bundle/common/out/cli/index.js'),
    ...args, '--json'], { encoding: 'utf8', windowsHide: true, timeout: 180_000,
    env: { ...process.env, ORCA_USER_DATA_PATH: join(artifactRoot, 'client-profile') } });
  const result = JSON.parse(response.stdout);
  assert.equal(result.ok, true);
  return result.result;
};
const connect = async code => (await host(['status', '--pairing-code', code])).runtime.runtimeId;
let payload;
let bridge;
let pluginWorker;
try {
  const created = await lifecycle('create');
  payload = { recipeResult: created };
  const runtimeId = await connect(created.pairingCode);
  const savedEnvironment = await host(['environment', 'add', '--name', 'Disposable reconnect client', '--pairing-code', created.pairingCode]);
  const environmentId = savedEnvironment.environment?.id ?? savedEnvironment.id;
  assert.ok(environmentId);
  assert.equal((await host(['status', '--environment', environmentId])).runtime.runtimeId, runtimeId);
  report.endpointBefore = publishedEndpoint(command('sbx', ['ports', name, '--json']));
  report.fixedPublishedPort = JSON.parse(readFileSync(join(artifactRoot, 'features', name, 'state.json'), 'utf8')).publishedHostPort === loopbackPort(report.endpointBefore);
  const added = cli(['repo', 'add', '--path', REMOTE_PROJECT]);
  const repoId = added.repo?.id ?? added.id ?? added.repoId;
  assert.ok(repoId);
  const parent = cli(['worktree', 'create', '--repo', `id:${repoId}`, '--name', 'restart-parent', '--no-parent', '--setup', 'skip']).worktree;
  const child = cli(['worktree', 'create', '--repo', `id:${repoId}`, '--name', 'restart-child', '--parent-worktree', `id:${parent.id}`, '--base-branch', parent.branch, '--setup', 'skip']).worktree;
  report.workspaces = { parent: parent.id, child: child.id };
  command('sbx', ['exec', '-u', 'agent', name, 'python3', '-c',
    `from pathlib import Path\nPath(${JSON.stringify(child.path ?? child.id.split('::')[1])},'restart-marker.txt').write_text('uncommitted work survives\\n')`]);
  command('sbx', ['stop', name], { progress: true });
  assert.equal(JSON.parse(command('sbx', ['ls', '--json'])).find(row => row.name === name).status, 'stopped');
  assert.deepEqual(JSON.parse(command('sbx', ['ports', name, '--json'])), []);
  report.checks.push('real VM stop removes live daemon and published port');
  let bridgedRuntimeId;
  if (process.env.TECK_ORCA_SMOKE_RECONNECT_BRIDGE === '1') {
    if (process.env.TECK_ORCA_SMOKE_PLUGIN_COMMAND === '1') {
      assert.equal(process.platform, 'win32', 'Installed worker-loader probe currently supports Windows');
      const isolatedHome = join(artifactRoot, 'isolated-plugin-home');
      const dataRoot = join(isolatedHome, 'AppData', 'Roaming', 'orca');
      const isolatedState = join(isolatedHome, '.teck-orca', 'features');
      mkdirSync(dataRoot, { recursive: true });
      cpSync(join(artifactRoot, 'features', name), join(isolatedState, name), { recursive: true });
      installRelease(repositoryRoot, join(isolatedHome, '.teck-orca', 'releases'));
      const inventory = JSON.parse(readFileSync(join(artifactRoot, 'client-profile', 'orca-environments.json'), 'utf8'));
      inventory.environments.find(item => item.id === environmentId).source = 'ephemeral-vm';
      writeFileSync(join(dataRoot, 'orca-environments.json'), JSON.stringify(inventory));
      writeFileSync(join(dataRoot, 'orca-ephemeral-vm-runtimes.json'), JSON.stringify({ version: 1, runtimes: [{
        id: featureId, recipeId: 'teck-sbx-feature', status: 'running', runtimeEnvironmentId: environmentId, recipeResult: created,
      }] }));
      const inventoryBefore = readFileSync(join(dataRoot, 'orca-environments.json'));
      const activationStarted = performance.now();
      pluginWorker = fork(join(process.env.LOCALAPPDATA, 'Programs/orca/resources/app.asar.unpacked/out/main/plugin-host-entry.js'), [], {
        windowsHide: true, stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
        env: { ...process.env, USERPROFILE: isolatedHome, HOME: isolatedHome },
      });
      const completed = new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(Error('Plugin command probe timed out')), 40_000);
        pluginWorker.on('message', message => {
          if (message.type === 'ready') {
            report.pluginWorkerReadyMs = Math.round(performance.now() - activationStarted);
            pluginWorker.send({ type: 'invokeCommand', callId: 1, commandId: 'teck.reconnectSandboxes' });
          }
          else if (message.type === 'hostCall') {
            assert.equal(message.method, 'notifications.show');
            pluginWorker.send({ type: 'hostResult', callId: message.callId, ok: true, value: { delivered: true } });
          } else if (message.type === 'commandResult') { clearTimeout(timer); message.ok ? resolve(message.value) : reject(Error(message.error)); }
          else if (message.type === 'fatal') { clearTimeout(timer); reject(Error(message.error)); }
        });
        pluginWorker.once('error', error => { clearTimeout(timer); reject(error); });
      });
      pluginWorker.send({ type: 'init', pluginId: 'teck-lab.teck-sbx-recipes', pluginRoot: join(repositoryRoot, 'plugin'), mainEntry: 'reconnect.mjs', grantedCapabilities: ['notifications:show'] });
      report.pluginCommand = await completed;
      assert.ok(report.pluginWorkerReadyMs < 10_000, 'Plugin activation must meet Orca startup deadline');
      assert.equal(report.pluginCommand.recovered, 1);
      assert.equal(report.pluginCommand.blocked, 0);
      assert.deepEqual(readFileSync(join(dataRoot, 'orca-environments.json')), inventoryBefore);
      report.checks.push('actual installed plugin worker executes recovery command against an isolated profile without editing its store');
    } else if (report.fixedPublishedPort) {
      bridge = await serve({ features: [{ sandboxName: name, projectId, featureId, port: loopbackPort(report.endpointBefore) }],
        stateRoot: join(artifactRoot, 'features'), ownerPid: process.ppid });
      assert.equal(bridge.results[0].state, 'direct');
    } else {
      bridge = await listenBridge({ port: loopbackPort(report.endpointBefore) }, createResolver({ sandboxName: name, projectId, featureId, port: loopbackPort(report.endpointBefore) },
        { stateRoot: join(artifactRoot, 'features') }), { log: message => process.stderr.write(message + '\n') });
    }
    // The client uses its original saved environment; no fresh pairing supplied.
    bridgedRuntimeId = (await host(['status', '--environment', environmentId])).runtime.runtimeId;
    assert.ok(bridgedRuntimeId);
    report.checks.push('original saved environment connects after the production reconnect command wakes the stopped VM');
  }
  process.stderr.write('Resuming the stopped disposable feature through its recipe.\n');
  const resumed = await lifecycle('resume', payload);
  assert.deepEqual(resumed.userData, created.userData);
  const resumedRuntimeId = await connect(resumed.pairingCode);
  assert.ok(resumedRuntimeId);
  const shown = cli(['worktree', 'show', '--worktree', `id:${child.id}`]);
  assert.equal(shown.worktree.parentWorktreeId, parent.id);
  assert.equal(shown.worktree.branch, child.branch);
  command('sbx', ['exec', '-u', 'agent', name, 'python3', '-c',
    `from pathlib import Path\nassert Path(${JSON.stringify(child.path ?? child.id.split('::')[1])},'restart-marker.txt').read_text()=='uncommitted work survives\\n'`]);
  report.runtimeId = runtimeId;
  report.resumedRuntimeId = resumedRuntimeId; // Orca generates a new ID per process.
  report.endpointAfter = publishedEndpoint(command('sbx', ['ports', name, '--json']));
  if (process.env.TECK_ORCA_SMOKE_RECONNECT_BRIDGE === '1') {
    if (report.fixedPublishedPort) assert.equal(report.endpointBefore, report.endpointAfter, 'Fixed published port must survive a stop/start');
    else assert.notEqual(report.endpointBefore, report.endpointAfter, 'Bridge probe needs a changed Docker port');
    assert.equal(bridgedRuntimeId, resumedRuntimeId);
    assert.equal(await connect(created.pairingCode), resumedRuntimeId);
    report.checks.push('original saved pairing reconnects without replacing the saved endpoint');
  }
  report.pairingChanged = resumed.pairingCode !== created.pairingCode;
  report.checks.push('recipe wakes the stopped VM and returns a reachable pairing connection');
  report.checks.push('feature identity, parent/child IDs and metadata, branches and uncommitted file survive');
  report.ok = true;
} catch (error) { report.error = error.message.replace(/orca:\/\/pair\?[^\s"']+/g, '[redacted]'); process.exitCode = 1; }
finally {
  if (pluginWorker) pluginWorker.kill(); // Its companion exits with this test process.
  if (bridge) await bridge.close();
  try {
    if (JSON.parse(command('sbx', ['ls', '--json'])).some(row => row.name === name)) command('sbx', ['rm', '--force', name], { progress: true });
    if (payload) await lifecycle('cleanup', payload);
    report.cleanedUp = true;
  } catch (error) { report.cleanupError = error.message; process.exitCode = 1; }
  writeFileSync(join(artifactRoot, 'result.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
}
