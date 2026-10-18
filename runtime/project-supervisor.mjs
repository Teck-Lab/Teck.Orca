// Per-user login companion. It observes the public Orca status command, restores
// listeners for ready projects, and never starts a VM without connection traffic.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { appendFileSync, existsSync, mkdirSync, readFileSync, rmdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { uptime } from 'node:os';
import { listProjects, projectStateRoot } from './project-state.mjs';
import { launchProjectTransport, redact } from './project-transport.mjs';

export function orcaExecutable(env = process.env, platform = process.platform) {
  return env.ORCA_CLI_COMMAND || (platform === 'win32' ? join(env.LOCALAPPDATA, 'Programs/orca/resources/bin/orca.exe') : 'orca-ide');
}
export async function supervisorTick({ stateRoot = projectStateRoot(), running = new Map(), status,
  launch = launchProjectTransport, transportAlive = state => {
    try {
      const owner = JSON.parse(readFileSync(join(stateRoot, state.sandboxName, 'transport.json'), 'utf8'));
      if (owner.ownerPid !== running.get('desktopPid') || owner.port !== state.port || owner.sandboxId !== state.sandboxId) return false;
      process.kill(owner.pid, 0); return true;
    } catch { return false; }
  }, log = () => {} } = {}) {
  let response;
  try { response = await status(); } catch { running.clear(); return; }
  const pid = response?.result?.app?.pid;
  if (!response?.ok || !response.result.app.running || !Number.isSafeInteger(pid)) { running.clear(); return; }
  running.set('desktopPid', pid);
  const projects = listProjects(stateRoot);
  for (const state of projects) {
    const key = `${pid}:${state.sandboxId}:${state.port}`;
    if (running.get(state.projectId) === key && transportAlive(state)) continue;
    try { await launch(state.projectId, pid, { stateRoot }); running.set(state.projectId, key); }
    catch (error) { log(`${state.displayName}: ${redact(error)}`); }
  }
}

export async function supervise({ stateRoot = projectStateRoot(), cli = orcaExecutable(), log = message => {
  const path = join(stateRoot, 'supervisor.log');
  if (!existsSync(path) || statSync(path).size < 64 * 1024) appendFileSync(path, `${new Date().toISOString()} ${redact(message)}\n`, { mode: 0o600 });
} } = {}) {
  mkdirSync(stateRoot, { recursive: true, mode: 0o700 });
  const lock = join(stateRoot, 'supervisor.lock');
  try { mkdirSync(lock); }
  catch (error) {
    if (error.code !== 'EEXIST') throw error;
    let owner;
    try { owner = JSON.parse(readFileSync(join(lock, 'owner.json'), 'utf8')); } catch {}
    if (!owner && Date.now() - statSync(lock).mtimeMs < 30_000) return;
    const pid = owner?.pid;
    if (owner?.createdAt > Date.now() - uptime() * 1000 - 5000 && Number.isSafeInteger(pid) && pid > 0) {
      try { process.kill(pid, 0); return; } catch (error) { if (error.code === 'EPERM') return; }
    }
    // The path is fixed inside the dedicated project state root.
    rmSync(join(lock, 'owner.json'), { force: true });
    try { rmdirSync(lock); } catch { return; }
    return supervise({ stateRoot, cli, log });
  }
  writeFileSync(join(lock, 'owner.json'), JSON.stringify({ pid: process.pid, createdAt: Date.now() }), { mode: 0o600 });
  const running = new Map();
  const status = async () => JSON.parse((await promisify(execFile)(cli, ['status', '--json'], {
    windowsHide: true, encoding: 'utf8', timeout: 15_000, maxBuffer: 1024 * 1024,
    // The supervisor always observes the local desktop, independent of agent routing.
    env: { ...process.env, ORCA_RUNTIME_ENVIRONMENT_ID: '', ORCA_PAIRING_CODE: '' },
  })).stdout);
  let stopped = false;
  process.once('SIGTERM', () => { stopped = true; });
  try {
    while (!stopped) {
      try { await supervisorTick({ stateRoot, running, status, log }); } catch (error) { log(redact(error)); }
      await new Promise(resolveDelay => setTimeout(resolveDelay, 5000));
    }
  } finally {
    rmSync(join(lock, 'owner.json'), { force: true });
    rmdirSync(lock);
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  supervise({ log: message => process.stderr.write(`${message}\n`) }).catch(error => { process.stderr.write(`${redact(error)}\n`); process.exitCode = 1; });
}
