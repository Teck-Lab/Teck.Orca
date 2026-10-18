// A loopback byte forwarder to Docker's native SSH. Pairing/authentication stays
// end to end between Orca clients and the guest daemon; no frames are decoded.
import { execFile, fork, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { createServer } from 'node:net';
import { appendFileSync, existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { uptime } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { shellQuote, withFeatureLock } from '../scripts/lifecycle.mjs';
import { listProjects, projectStateRoot, readProject } from './project-state.mjs';

export const redact = value => String(value?.message ?? value).replace(/orca:\/\/pair\?[^\s"']+/g, '[pairing redacted]').slice(0, 1600);
export const sshArgs = state => ['-T', '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=30',
  '-o', 'ControlMaster=no', '-o', 'ControlPath=none', '-o', 'ServerAliveInterval=15', '-o', 'ServerAliveCountMax=2'];
const execute = async (program, args) => (await promisify(execFile)(program, args, {
  encoding: 'utf8', windowsHide: true, timeout: 150_000, maxBuffer: 1024 * 1024,
})).stdout;
function alive(pid) {
  if (!Number.isSafeInteger(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); return true; } catch (error) { return error.code === 'EPERM'; }
}
export function createProjectResolver(projectId, { stateRoot = projectStateRoot(), run = execute } = {}) {
  let inFlight;
  return () => inFlight ??= (async () => {
    const before = readProject(projectId, stateRoot);
    return withFeatureLock(stateRoot, before.sandboxName, async () => {
      const state = readProject(projectId, stateRoot);
      if (state.phase !== 'ready') throw Error('Project is not ready');
      const rows = JSON.parse(await run('sbx', ['ls', '--json']));
      if (!Array.isArray(rows) || !rows.some(row => row.name === state.sandboxName && row.id === state.sandboxId)) throw Error('Owned project sandbox is missing or has been replaced');
      // SSH wakes the VM. Starting the daemon explicitly waits for readiness,
      // so forwarding does not race Docker's asynchronous VM startup.
      const script = `. /etc/teck-orca/environment.sh; exec /opt/teck-orcad/node /usr/local/lib/teck-orca/manage-daemon.mjs ${shellQuote(`ws://127.0.0.1:${state.port}`)} ssh`;
      const ready = JSON.parse(await run('ssh', [...sshArgs(state), `${state.sandboxName}.sbx`, script]));
      if (ready.schemaVersion !== 1 || ready.projectRoot !== state.projectRoot || !ready.pairingCode?.startsWith('orca://pair?')) throw Error('Project daemon readiness failed');
      return state;
    });
  })().finally(() => { inFlight = undefined; });
}

export async function listenProject(state, { stateRoot = projectStateRoot(), resolveProject = createProjectResolver(state.projectId, { stateRoot }),
  forward = (current) => spawn('ssh', [...sshArgs(current), '-W', '127.0.0.1:6768', `${current.sandboxName}.sbx`], {
    windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'],
  }), log = () => {} } = {}) {
  const clients = new Set(), children = new Set();
  const server = createServer(client => {
    clients.add(client); client.pause();
    let child;
    client.on('error', () => child?.kill());
    client.on('close', () => { clients.delete(client); child?.kill(); });
    client.setTimeout(180_000, () => client.destroy());
    resolveProject().then(current => {
      if (client.destroyed) return;
      if (current.port !== state.port || current.sandboxId !== state.sandboxId) throw Error('Project connection ownership changed');
      child = forward(current); children.add(child);
      let errorText = '';
      child.stderr.on('data', chunk => { errorText = (errorText + chunk.toString()).slice(-1600); });
      child.once('error', error => { log(redact(error)); children.delete(child); client.destroy(); });
      child.once('close', code => { children.delete(child); if (code && !client.destroyed) log(redact(errorText || `SSH forwarding exited (${code})`)); client.end(); });
      child.stdin.on('error', () => client.destroy());
      child.stdout.on('error', () => client.destroy());
      child.once('spawn', () => { client.setTimeout(0); client.pipe(child.stdin); child.stdout.pipe(client); client.resume(); });
    }).catch(error => { log(redact(error)); client.destroy(); });
  });
  await new Promise((resolveListen, reject) => { server.once('error', reject); server.listen(state.port, '127.0.0.1', resolveListen); });
  server.on('error', error => log(redact(error)));
  return { close: () => new Promise(resolveClose => {
    for (const client of clients) client.destroy();
    for (const child of children) child.kill();
    server.close(resolveClose);
  }) };
}

export function launchProjectTransport(projectId, ownerPid, { stateRoot = projectStateRoot(), timeoutMs = 15_000 } = {}) {
  if (!alive(ownerPid)) return Promise.reject(Error('A running Orca desktop process is required'));
  return new Promise((resolveLaunch, reject) => {
    const child = fork(fileURLToPath(import.meta.url), [], { detached: true, windowsHide: true,
      stdio: ['ignore', 'ignore', 'ignore', 'ipc'], execArgv: [], env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' } });
    const timer = setTimeout(() => { child.kill(); finish(Error('Project SSH transport startup timed out')); }, timeoutMs);
    const finish = (error, result) => { clearTimeout(timer); child.removeAllListeners('exit'); error ? reject(error) : resolveLaunch(result); child.unref(); };
    child.once('error', error => finish(error));
    child.once('exit', () => finish(Error('Project SSH transport exited before readiness')));
    child.once('message', message => finish(message.ok ? null : Error(message.error), message));
    child.send({ projectId, ownerPid, stateRoot });
  });
}
export async function startProjectTransports(ownerPid, { stateRoot = projectStateRoot(), log = () => {} } = {}) {
  const results = [];
  for (const state of listProjects(stateRoot)) {
    try { results.push(await launchProjectTransport(state.projectId, ownerPid, { stateRoot })); }
    catch (error) { log(`${state.displayName}: ${redact(error)}`); results.push({ ok: false, projectId: state.projectId, error: redact(error) }); }
  }
  return results;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href && process.send) {
  process.once('message', async ({ projectId, ownerPid, stateRoot }) => {
    let transport, timer;
    try {
      if (!alive(ownerPid)) throw Error('Orca desktop is not running');
      const state = readProject(projectId, stateRoot);
      const ownerPath = join(stateRoot, state.sandboxName, 'transport.json');
      const logPath = join(stateRoot, state.sandboxName, 'transport.log');
      const log = message => { if (!existsSync(logPath) || statSync(logPath).size < 64 * 1024) appendFileSync(logPath, `${new Date().toISOString()} ${redact(message)}\n`, { mode: 0o600 }); };
      let existing = false;
      await withFeatureLock(stateRoot, state.sandboxName, async () => {
        let owner;
        try { owner = JSON.parse(readFileSync(ownerPath, 'utf8')); } catch {}
        if (owner?.ownerPid === ownerPid && owner.port === state.port && owner.sandboxId === state.sandboxId && owner.createdAt > Date.now() - uptime() * 1000 - 5000 && alive(owner.pid)) { existing = true; return; }
        transport = await listenProject(state, { stateRoot, log });
        writeFileSync(ownerPath, JSON.stringify({ pid: process.pid, ownerPid, port: state.port, sandboxId: state.sandboxId, createdAt: Date.now() }) + '\n', { mode: 0o600 });
      });
      process.send({ ok: true, projectId, port: state.port, existing });
      process.disconnect();
      if (existing) return;
      const close = async () => { clearInterval(timer); await transport.close(); };
      timer = setInterval(() => {
        let current;
        try { current = readProject(projectId, stateRoot); } catch {}
        if (!alive(ownerPid) || current?.phase !== 'ready' || current.sandboxId !== state.sandboxId || current.port !== state.port) void close();
      }, 2000);
      process.once('SIGTERM', () => void close());
    } catch (error) {
      process.send?.({ ok: false, error: redact(error) }); process.disconnect?.();
      if (transport) await transport.close();
      process.exitCode = 1;
    }
  });
}
