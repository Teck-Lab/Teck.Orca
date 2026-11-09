// Orca's authenticated local runtime protocol. Keep this bridge limited to SSH
// registration; no renderer automation, profile edits or remote execution.
import { readFileSync } from 'node:fs';
import { connect } from 'node:net';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { homedir } from 'node:os';

const methods = new Set(['status.get', 'ssh.listEditableTargets', 'ssh.addTarget', 'ssh.connect', 'ssh.getState']);
export function desktopProfile(env = process.env, platform = process.platform) {
  return env.ORCA_USER_DATA_PATH || (platform === 'win32' ? join(env.APPDATA || join(homedir(), 'AppData', 'Roaming'), 'orca') :
    platform === 'darwin' ? join(homedir(), 'Library/Application Support/orca') : join(env.XDG_CONFIG_HOME || join(homedir(), '.config'), 'orca'));
}
export function createDesktopRpc({ readMetadata = () => JSON.parse(readFileSync(join(desktopProfile(), 'orca-runtime.json'), 'utf8')),
  open = connect, timeout = 15_000 } = {}) {
  return async (method, params = {}, { timeoutMs = timeout } = {}) => {
    if (!methods.has(method)) throw Error('Unsupported sandbox SSH management operation');
    const metadata = readMetadata(), transport = (metadata.transports ?? [metadata.transport]).find(t => t && ['named-pipe', 'unix'].includes(t.kind));
    if (!transport?.endpoint || !metadata.authToken || !metadata.runtimeId) throw Error('Orca desktop SSH management is unavailable');
    return new Promise((resolve, reject) => {
      const id = randomUUID(), socket = open(transport.endpoint); let pending = '', finished = false;
      const finish = (error, value) => { if (finished) return; finished = true; clearTimeout(timer); socket.destroy(); error ? reject(error) : resolve(value); };
      const timer = setTimeout(() => finish(Error('Orca desktop SSH management timed out')), timeoutMs);
      socket.setEncoding('utf8');
      socket.on('error', () => finish(Error('Orca desktop SSH management is unreachable')));
      socket.on('close', () => finish(Error('Orca closed the SSH management request')));
      socket.on('connect', () => socket.write(JSON.stringify({ id, authToken: metadata.authToken, method, params }) + '\n'));
      socket.on('data', chunk => {
        pending += chunk;
        if (pending.length > 4 * 1024 * 1024) return finish(Error('Orca SSH management response is too large'));
        let newline;
        while (!finished && (newline = pending.indexOf('\n')) >= 0) {
          let frame; try { frame = JSON.parse(pending.slice(0, newline)); } catch { return finish(Error('Invalid Orca SSH management response')); }
          pending = pending.slice(newline + 1);
          if (frame._keepalive) continue;
          if (frame.id !== id || frame._meta?.runtimeId !== metadata.runtimeId) return finish(Error('Orca desktop identity changed during SSH management'));
          if (frame.ok !== true) return finish(Error('Orca refused SSH management: ' + String(frame.error?.code || 'unknown')));
          finish(null, frame.result);
        }
      });
    });
  };
}
export const desktopRpc = createDesktopRpc();
