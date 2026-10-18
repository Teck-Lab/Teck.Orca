// Desktop-side, explicitly invoked recovery. Never edits Orca's stores or
// copies configuration into existing VMs. Forwarding preserves end-to-end auth.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFileSync, appendFileSync, statSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer, connect } from 'node:net';
import { pathToFileURL } from 'node:url';
import { sandboxName, publishedEndpoint, withFeatureLock } from '../scripts/lifecycle.mjs';

export const desktopDataRoot = () => process.platform === 'win32'
  ? join(homedir(), 'AppData', 'Roaming', 'orca')
  : process.platform === 'darwin' ? join(homedir(), 'Library', 'Application Support', 'orca')
    : join(process.env.XDG_CONFIG_HOME || join(homedir(), '.config'), 'orca');
export const defaultFeatureRoot = () => join(homedir(), '.teck-orca', 'features');
const cleanError = error => String(error?.message ?? error)
  .replace(/orca:\/\/pair\?[^\s"']+/g, '[pairing redacted]').slice(0, 1200);
export function loopbackPort(endpoint) {
  const url = new URL(endpoint);
  if (url.protocol !== 'ws:' || url.hostname !== '127.0.0.1' || url.username || url.password ||
      url.search || url.hash || url.pathname !== '/' || !/^\d+$/.test(url.port)) throw Error('Expected a plain IPv4 loopback websocket endpoint');
  const port = Number(url.port);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw Error('Invalid connection port');
  return port;
}
export function discoverFeatures({ userDataRoot = desktopDataRoot(), stateRoot = defaultFeatureRoot() } = {}) {
  const runtimes = JSON.parse(readFileSync(join(userDataRoot, 'orca-ephemeral-vm-runtimes.json'), 'utf8')).runtimes;
  const environments = JSON.parse(readFileSync(join(userDataRoot, 'orca-environments.json'), 'utf8')).environments;
  if (!Array.isArray(runtimes) || !Array.isArray(environments)) throw Error('Unexpected Orca inventory');
  const features = [], seen = new Set();
  for (const runtime of runtimes) {
    if (runtime.recipeId !== 'teck-sbx-feature' || !['running', 'resume_failed'].includes(runtime.status)) continue;
    const data = runtime.recipeResult?.userData;
    if (!data || data.connectionMode !== 'orcad' || data.instanceId !== runtime.id || data.featureId !== runtime.id ||
        typeof data.projectId !== 'string' || data.sandboxName !== sandboxName(data.projectId, data.featureId)) continue;
    let state;
    try { state = JSON.parse(readFileSync(join(stateRoot, data.sandboxName, 'state.json'), 'utf8')); } catch { continue; }
    if (state.projectId !== data.projectId || state.featureId !== data.featureId || state.sandboxName !== data.sandboxName ||
        state.connectionMode !== 'orcad' || state.projectRoot !== '/home/agent/project' ||
        !['ready', 'retained'].includes(state.phase) || !state.instances?.includes(runtime.id)) continue;
    const environment = environments.find(item => item.id === runtime.runtimeEnvironmentId && item.source === 'ephemeral-vm');
    const endpoint = environment?.endpoints?.find(item => item.id === environment.preferredEndpointId);
    if (!endpoint || endpoint.kind !== 'websocket') continue;
    const port = loopbackPort(endpoint.endpoint);
    if (seen.has(port)) throw Error('Two feature connections claim the same saved port; recovery refused');
    seen.add(port);
    // Credentials stay in Orca's store; the bridge needs only identity and port.
    features.push({ sandboxName: data.sandboxName, projectId: data.projectId, featureId: data.featureId, port });
  }
  return features;
}
export async function run(program, args, options = {}) {
  const result = await promisify(execFile)(program, args, { windowsHide: true, encoding: 'utf8',
    timeout: options.timeout ?? 150_000, maxBuffer: 4 * 1024 * 1024 });
  return result.stdout;
}
function assertOwnership(feature, stateRoot) {
  const state = JSON.parse(readFileSync(join(stateRoot, feature.sandboxName, 'state.json'), 'utf8'));
  if (state.sandboxName !== sandboxName(feature.projectId, feature.featureId) || state.projectId !== feature.projectId ||
      state.featureId !== feature.featureId || state.connectionMode !== 'orcad' ||
      state.projectRoot !== '/home/agent/project' || !['ready', 'retained'].includes(state.phase) ||
      !state.instances?.includes(feature.featureId)) throw Error('Feature ownership changed; recovery refused');
  return state;
}

function hasFixedPublishedPort(feature, stateRoot) {
  try {
    const state = JSON.parse(readFileSync(join(stateRoot, feature.sandboxName, 'state.json'), 'utf8'));
    return Number.isInteger(state.publishedHostPort) && state.publishedHostPort === feature.port;
  } catch { return false; }
}
export function createResolver(feature, { execute = run, stateRoot = defaultFeatureRoot() } = {}) {
  let inFlight;
  return () => inFlight ??= withFeatureLock(stateRoot, feature.sandboxName, async () => {
    // Recheck ownership at every wake; deleting a feature must not resurrect it.
    assertOwnership(feature, stateRoot);
    const rows = JSON.parse(await execute('sbx', ['ls', '--json']));
    if (!Array.isArray(rows) || !rows.some(item => item.name === feature.sandboxName)) throw Error('Feature sandbox no longer exists');
    await execute('sbx', ['exec', '-u', 'agent', feature.sandboxName, 'true']);
    const endpoint = publishedEndpoint(await execute('sbx', ['ports', feature.sandboxName, '--json']));
    const ready = JSON.parse(await execute('sbx', ['exec', '-u', 'agent', feature.sandboxName,
      'node', '/usr/local/lib/teck-orca/manage-daemon.mjs', endpoint]));
    if (ready.schemaVersion !== 1 || ready.projectRoot !== '/home/agent/project' || typeof ready.pairingCode !== 'string') throw Error('Daemon did not report ready');
    const port = loopbackPort(endpoint);
    if (port === feature.port) throw Error('Docker reused the bridge port; refusing a forwarding loop');
    return port;
  }).finally(() => { inFlight = undefined; });
}
export async function listenBridge(feature, resolvePort, { log = () => {} } = {}) {
  const sockets = new Set();
  const server = createServer(client => {
    sockets.add(client);
    client.pause();
    let upstream;
    client.on('error', () => upstream?.destroy());
    client.on('close', () => { sockets.delete(client); upstream?.destroy(); });
    // Bound resources while a VM boots, without decoding or logging frames.
    client.setTimeout(180_000, () => client.destroy());
    resolvePort().then(port => {
      if (client.destroyed) return;
      if (port === feature.port) throw Error('Refusing a forwarding loop');
      upstream = connect({ host: '127.0.0.1', port });
      sockets.add(upstream);
      upstream.on('error', () => client.destroy());
      upstream.on('close', () => { sockets.delete(upstream); client.destroy(); });
      upstream.once('connect', () => { client.setTimeout(0); client.pipe(upstream); upstream.pipe(client); client.resume(); });
    }).catch(error => { log(cleanError(error)); client.destroy(); });
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(feature.port, '127.0.0.1', resolve); });
  server.on('error', error => log(cleanError(error)));
  return { close: () => new Promise(resolve => { for (const socket of sockets) socket.destroy(); server.close(resolve); }) };
}

// A companion survives Orca's five-minute idle reaping of plugin workers, but
// exits with the desktop app. No login task/service is installed.
export async function serve({ features, ownerPid, stateRoot = defaultFeatureRoot(), execute = run, log = () => {}, listen = listenBridge }) {
  if (!Number.isSafeInteger(ownerPid) || ownerPid <= 0 || ownerPid === process.pid) throw Error('Missing desktop process owner');
  const bridges = [], results = [];
  for (const feature of features) {
    let attemptedBridge = false;
    try {
      if (hasFixedPublishedPort(feature, stateRoot)) {
        // Do not bridge a fixed Docker port: a listener here would prevent
        // Docker publishing that same port when the stopped VM wakes.
        await withFeatureLock(stateRoot, feature.sandboxName, async () => {
          assertOwnership(feature, stateRoot);
          const rows = JSON.parse(await execute('sbx', ['ls', '--json']));
          if (!Array.isArray(rows) || !rows.some(row => row.name === feature.sandboxName)) throw Error('Feature sandbox no longer exists');
          await execute('sbx', ['exec', '-u', 'agent', feature.sandboxName, 'true']);
          const endpoint = publishedEndpoint(await execute('sbx', ['ports', feature.sandboxName, '--json']));
          if (loopbackPort(endpoint) !== feature.port) throw Error('Fixed published port changed; Orca must refresh the saved connection');
          const ready = JSON.parse(await execute('sbx', ['exec', '-u', 'agent', feature.sandboxName,
            'node', '/usr/local/lib/teck-orca/manage-daemon.mjs', endpoint]));
          if (ready.projectRoot !== '/home/agent/project' || ready.schemaVersion !== 1) throw Error('Daemon readiness failed');
        });
        results.push({ sandbox: feature.sandboxName, state: 'direct' });
        continue;
      }
      attemptedBridge = true;
      const bridge = await listen(feature, createResolver(feature, { execute, stateRoot }), { log });
      bridges.push(bridge); results.push({ sandbox: feature.sandboxName, state: 'listening' });
    } catch (error) {
      // Never replace an occupied listener, including one from an earlier call.
      // If Docker itself owns this exact feature port, ensure its daemon is up.
      try {
        if (!attemptedBridge || !['EADDRINUSE', 'EACCES'].includes(error.code)) throw error;
        await withFeatureLock(stateRoot, feature.sandboxName, async () => {
          assertOwnership(feature, stateRoot);
          const endpoint = publishedEndpoint(await execute('sbx', ['ports', feature.sandboxName, '--json']));
          if (loopbackPort(endpoint) !== feature.port) throw error;
          const ready = JSON.parse(await execute('sbx', ['exec', '-u', 'agent', feature.sandboxName,
            'node', '/usr/local/lib/teck-orca/manage-daemon.mjs', endpoint]));
          if (ready.projectRoot !== '/home/agent/project' || ready.schemaVersion !== 1) throw Error('Daemon readiness failed');
        });
        results.push({ sandbox: feature.sandboxName, state: 'direct' });
      } catch (recoveryError) {
        const unavailable = attemptedBridge && error.code === 'EACCES';
        const message = unavailable
          ? `Saved loopback port ${feature.port} is reserved or denied by the OS. Retry cannot repair this address. Suspend then resume this feature workspace in Orca to refresh its saved connection; the sandbox/worktrees are retained. ${cleanError(recoveryError)}`
          : cleanError(recoveryError);
        results.push({ sandbox: feature.sandboxName, state: 'blocked', ...(unavailable ? { reason: 'saved-port-unavailable', port: feature.port } : {}), error: message });
        log(message);
      }
    }
  }
  let closing;
  const close = () => closing ??= Promise.all(bridges.map(bridge => bridge.close())).then(() => clearInterval(timer));
  const timer = setInterval(() => { try { process.kill(ownerPid, 0); } catch (error) { if (error.code !== 'EPERM') void close(); } }, 2000);
  if (!bridges.length) clearInterval(timer);
  return { results, close };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const ownerPid = Number(process.argv[2]);
  const logPath = join(tmpdir(), `teck-orca-reconnect-${process.pid}.log`);
  let initialized = false;
  process.on('message', async message => {
    if (initialized || message?.type !== 'start') return;
    initialized = true;
    try {
      writeFileSync(logPath, '', { mode: 0o600, flag: 'wx' });
      const log = message => { if (statSync(logPath).size < 64 * 1024) appendFileSync(logPath, `${new Date().toISOString()} ${cleanError(message)}\n`); };
      const features = discoverFeatures();
      const service = await serve({ features, ownerPid, log });
      process.send?.({ type: 'ready', results: service.results, logPath });
      process.disconnect?.();
      if (!service.results.some(result => result.state === 'listening')) process.exit(0);
    } catch (error) { process.send?.({ type: 'failed', error: cleanError(error) }); process.disconnect?.(); process.exitCode = 1; }
  });
}
