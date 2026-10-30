import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { setTimeout as delay } from 'node:timers/promises';

export const quote = value => {
  if (String(value).includes('\0')) throw Error('Invalid NUL in shell argument');
  return `'${String(value).replaceAll("'", `'"'"'`)}'`;
};
export const redact = text => String(text)
  .replace(/\b(?:gh[pousr]_[A-Za-z0-9_]+|github_pat_[A-Za-z0-9_]+)\b/g, '[redacted]')
  .replace(/(Bearer\s+)[^\s"']+/gi, '$1[redacted]')
  .replace(/(https?:\/\/)[^/\s@]+@/gi, '$1[redacted]@');

export async function command(program, args, { log = () => {}, input, timeout = 1_200_000, env = {} } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(program, args, { shell: false, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, ...(process.platform === 'win32' && !process.env.TMPDIR ? { TMPDIR: tmpdir() } : {}), ...env } });
    let stdout = '', stderr = '', expired = false;
    const timer = setTimeout(() => { expired = true; child.kill(); }, timeout);
    child.stdout.on('data', chunk => { stdout = (stdout + chunk).slice(-16 * 1024 * 1024); log(redact(chunk)); });
    child.stderr.on('data', chunk => { stderr = (stderr + chunk).slice(-32_000); log(redact(chunk)); });
    child.once('error', error => { clearTimeout(timer); reject(Error(`${program} could not start: ${error.message}`)); });
    child.once('close', code => {
      clearTimeout(timer);
      if (expired || code !== 0) reject(Error(redact(`${program} ${args[0]} ${expired ? 'timed out' : `failed (${code})`}: ${stderr || stdout}`)));
      else resolve(stdout);
    });
    child.stdin.on('error', () => {});
    child.stdin.end(input);
  });
}

export function readJson(path) {
  if (lstatSync(path).isSymbolicLink()) throw Error(`State symlink is forbidden: ${path}`);
  return JSON.parse(readFileSync(path, 'utf8'));
}
export function directory(path) {
  mkdirSync(path, { recursive: true, mode: 0o700 });
  if (lstatSync(path).isSymbolicLink()) throw Error(`State symlink is forbidden: ${path}`);
  return path;
}
export function writeJson(path, data) {
  directory(dirname(path));
  if (existsSync(path) && lstatSync(path).isSymbolicLink()) throw Error(`State symlink is forbidden: ${path}`);
  const temporary = `${path}.${randomUUID()}.tmp`;
  writeFileSync(temporary, JSON.stringify(data) + '\n', { mode: 0o600 });
  renameSync(temporary, path);
}
export function alive(pid) {
  if (!Number.isSafeInteger(pid) || pid < 1) return false;
  try { process.kill(pid, 0); return true; } catch (error) { return error.code === 'EPERM'; }
}

// Provider operations are serialized across command invocations and app restarts.
export async function withLock(root, name, operation, { timeout = 1_800_000 } = {}) {
  if (!/^(?:teck-orca-ssh-[a-f0-9]{12}|sbx-kit-builder)$/.test(name)) throw Error('Invalid lock identity');
  directory(root);
  const path = join(root, `${name}.lock`), token = randomUUID(), deadline = Date.now() + timeout;
  for (;;) {
    try {
      mkdirSync(path);
      writeJson(join(path, 'owner.json'), { pid: process.pid, token });
      break;
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      if (lstatSync(path).isSymbolicLink()) throw Error('Lock symlink is forbidden');
      let owner;
      try { owner = readJson(join(path, 'owner.json')); } catch (e) { if (e.code !== 'ENOENT') throw e; }
      if (owner ? !alive(owner.pid) : Date.now() - statSync(path).mtimeMs > 30_000) {
        const recovery = `${path}.recovery`;
        try {
          mkdirSync(recovery);
          try {
            let current;
            try { current = readJson(join(path, 'owner.json')); } catch (e) { if (e.code !== 'ENOENT') throw e; }
            if (owner ? current?.token === owner.token && !alive(current.pid) :
                !current && existsSync(path) && Date.now() - statSync(path).mtimeMs > 30_000) rmSync(path, { recursive: true, force: true });
          } finally { rmSync(recovery, { recursive: true, force: true }); }
        } catch (e) { if (!['ENOENT', 'EEXIST'].includes(e.code)) throw e; }
        if (Date.now() >= deadline) throw Error('Stale preparation lock could not be reclaimed; check the preview state folder');
        await delay(100);
        continue;
      }
      if (Date.now() >= deadline) throw Error('Another preparation is still running; check its log');
      await delay(100);
    }
  }
  try { return await operation(); }
  finally {
    if (existsSync(join(path, 'owner.json')) && readJson(join(path, 'owner.json')).token === token) rmSync(path, { recursive: true, force: true });
  }
}
