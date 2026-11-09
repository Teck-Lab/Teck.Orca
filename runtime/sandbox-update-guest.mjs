// Root-only, staged maintenance of Teck-managed files; no VM/daemon lifecycle.
import fs from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
export const isOmpProcess = args => args.some(s => /^\/opt\/(?:paseo-omp|teck-omp)\//.test(s) || /\/teck-orca\/omp(?:-launch\.mjs)?$/.test(s));
export function ompProcesses() {
  return fs.readdirSync('/proc').filter(n => /^\d+$/.test(n)).filter(n => {
    try { return isOmpProcess(fs.readFileSync(`/proc/${n}/cmdline`, 'utf8').split('\0')); } catch { return false; }
  }).length;
}
export function validManagedPath(path) {
  return /^(?:RULES\.md|WATCHDOG\.yml|orchestration\.yml|orca-guides\.json|agents\/(?:technical-planner|implementation-worker|correctness-reviewer|security-auditor)\.md|extensions\/(?:agent-office\.(?:mjs|ts)|orca-orchestration\.mjs|omniroute-research\.ts|lib\/(?:(?:orca-policy|github-plan-scope|mcphub-client|mcphub-search|mcphub-firecrawl|office-tools|office-usage|office-plan|office-mcp|office-mcp-server)\.mjs|agent-office\.LICENSE))|skills\/(?:agent-office|orca-feature-workflow|orca-workers|github-execution-planning|github-publication|orca-cli|orchestration|orca-per-workspace-env)\/(?:[a-zA-Z0-9_.-]+\/)*[a-zA-Z0-9_.-]+|runtime\/omp-launch(?:-policy)?\.mjs)$/.test(path) && !path.split('/').some(s => s === '.' || s === '..');
}
export function withMaintenanceFence(script) {
  const header = '#!/bin/sh\n';
  if (!script.startsWith(header) || !script.includes('omp-launch.mjs')) throw Error('Unsupported OMP launcher');
  if (script.includes('/etc/teck-orca/update.lock')) return script;
  // Insert a shell statement after the known shebang. This is structural
  // insertion, not escaping/replacing newline characters in user data.
  return header + 'if test -e /etc/teck-orca/update.lock; then echo "Teck: sandbox maintenance is in progress; reopen OMP afterward." >&2; exit 1; fi\n' + script.slice(header.length);
}
export function validatePayload(data) {
  if (data?.version !== 1 || !/^\d+\.\d+\.\d+$/.test(data.omp) || !/^[a-f0-9]{64}$/.test(data.digest) || !Array.isArray(data.files) || !data.files.length || data.files.length > 1000) throw Error('Invalid update payload');
  const names = new Set();
  let bytes = 0;
  for (const file of data.files) {
    if (!validManagedPath(file.path) || names.has(file.path) || typeof file.data !== 'string') throw Error('Invalid managed update path');
    names.add(file.path); const content = Buffer.from(file.data, 'base64'); bytes += content.length;
    if (bytes > 16 * 1024 ** 2 || createHash('sha256').update(content).digest('hex') !== file.sha256) throw Error('Update checksum mismatch');
  }
  const digest = createHash('sha256').update(Buffer.concat(data.files.flatMap(f => [Buffer.from(f.path), Buffer.from(f.data, 'base64')]))).digest('hex');
  if (digest !== data.digest) throw Error('Workflow digest mismatch');
  return data;
}
function noSymlinks(path) {
  for (let p = path; p !== dirname(p); p = dirname(p)) if (fs.existsSync(p) && fs.lstatSync(p).isSymbolicLink()) throw Error('Managed destination is a symlink');
}
function atomic(path, bytes, { mode = 0o600, uid = 0, gid = 0 } = {}) {
  noSymlinks(path); fs.mkdirSync(dirname(path), { recursive: true });
  const temporary = path + '.update-' + randomUUID();
  try { fs.writeFileSync(temporary, bytes, { flag: 'wx', mode }); fs.chownSync(temporary, uid, gid); fs.renameSync(temporary, path); }
  finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); }
}
const json = path => JSON.parse(fs.readFileSync(path, 'utf8'));
const version = prefix => { try { return json(prefix + '/lib/node_modules/@oh-my-pi/pi-coding-agent/package.json').version; } catch { return null; } };
const command = (program, args, options = {}) => execFileSync(program, args, { encoding: 'utf8', timeout: 600000, maxBuffer: 4 * 1024 ** 2, stdio: ['ignore', 'pipe', 'pipe'], ...options });
export async function applyUpdate(payload, { forceInstall = false } = {}) {
  validatePayload(payload);
  if (process.getuid() !== 0) throw Error('Sandbox maintenance requires root');
  const lock = '/etc/teck-orca/update.lock'; noSymlinks(lock);
  fs.mkdirSync(dirname(lock), { recursive: true });
  if (fs.existsSync(lock)) {
    const pid = Number(fs.readFileSync(lock, 'utf8'));
    try { if (!Number.isSafeInteger(pid) || pid < 1) throw Error('Invalid maintenance lock'); process.kill(pid, 0); throw Error('Another sandbox update is running'); }
    catch (error) { if (error.code !== 'ESRCH') throw error; fs.unlinkSync(lock); }
  }
  fs.writeFileSync(lock, String(process.pid), { flag: 'wx', mode: 0o644 });
  const before = [], selector = '/etc/teck-orca/omp-runtime.json'; let stage;
  const save = (path, bytes, permissions) => {
    noSymlinks(path);
    const stat = fs.existsSync(path) ? fs.statSync(path) : null;
    before.push({ path, content: stat ? fs.readFileSync(path) : null, permissions: stat ? { mode: stat.mode, uid: stat.uid, gid: stat.gid } : null });
    atomic(path, bytes, permissions);
  };
  try {
    if (ompProcesses()) throw Error('Close all OMP sessions before updating. No running agent was interrupted.');
    // Fence normal launches before preparation, including the first maintenance
    // of an older sandbox whose JS launcher does not yet know this lock.
    const wrapper = '/usr/local/lib/teck-orca/omp';
    if (fs.existsSync(wrapper)) {
      const script = fs.readFileSync(wrapper, 'utf8');
      const fenced = withMaintenanceFence(script);
      if (fenced !== script) save(wrapper, fenced, { mode: 0o755 });
    }
    const agent = fs.statSync('/home/agent/.omp/agent');
    const target = '/opt/teck-omp/releases/' + payload.omp;
    let selected = fs.existsSync(selector) ? json(selector).prefix : '/opt/paseo-omp';
    if (!/^\/opt\/(?:paseo-omp|teck-omp\/releases\/\d+\.\d+\.\d+)$/.test(selected)) throw Error('Invalid selected OMP runtime');
    if (version(selected) !== payload.omp || forceInstall) {
      if (version(target) !== payload.omp) {
        fs.mkdirSync('/opt/teck-omp', { recursive: true }); noSymlinks('/opt/teck-omp');
        stage = fs.mkdtempSync('/opt/teck-omp/staging-');
        command('npm', ['install', '--global', '--prefix', stage, '--no-audit', '--no-fund', '--omit=optional', '@oh-my-pi/pi-coding-agent@' + payload.omp],
          { env: { ...process.env, ONNXRUNTIME_NODE_INSTALL_CUDA: 'skip', ONNXRUNTIME_NODE_INSTALL: 'skip' } });
        fs.symlinkSync('/opt/paseo-omp/bin/bun', stage + '/bin/bun');
        if (version(stage) !== payload.omp || command(stage + '/bin/omp', ['--version'], { env: { ...process.env, PATH: stage + '/bin:' + process.env.PATH } }).trim() !== 'omp/' + payload.omp) throw Error('Staged OMP version verification failed');
        // mkdtemp creates a root-only directory; installed code must remain
        // traversable by the agent after it becomes the selected runtime.
        fs.chmodSync(stage, 0o755);
        fs.mkdirSync(dirname(target), { recursive: true }); noSymlinks(target);
        if (fs.existsSync(target)) throw Error('Existing staged OMP runtime requires inspection');
        fs.renameSync(stage, target); stage = null;
      }
      selected = target;
    }
    if (ompProcesses()) throw Error('An OMP session opened during preparation. Close it and retry; nothing was activated.');
    if (selected.startsWith('/opt/teck-omp/releases/')) { noSymlinks(selected); fs.chmodSync(selected, 0o755); }
    if (command(selected + '/bin/omp', ['--version'], { env: { ...process.env, PATH: selected + '/bin:' + process.env.PATH } }).trim() !== 'omp/' + payload.omp) throw Error('Selected OMP version verification failed');
    if (command('runuser', ['-u', 'agent', '--', '/opt/paseo-omp/bin/bun', selected + '/bin/omp', '--version']).trim() !== 'omp/' + payload.omp) throw Error('Agent cannot execute the selected OMP runtime');
    for (const file of payload.files) {
      const runtime = file.path.startsWith('runtime/');
      const path = runtime ? '/usr/local/lib/teck-orca/' + file.path.slice(8) : '/home/agent/.omp/agent/' + file.path;
      save(path, Buffer.from(file.data, 'base64'), { mode: runtime ? 0o644 : 0o600, uid: runtime ? 0 : agent.uid, gid: runtime ? 0 : agent.gid });
    }
    save(selector, JSON.stringify({ version: 1, prefix: selected, omp: payload.omp }) + '\n', { mode: 0o644 });
    save('/home/agent/.omp/agent/teck-workflow.sha256', payload.digest, { uid: agent.uid, gid: agent.gid });
    return { omp: payload.omp, digest: payload.digest, updated: true };
  } catch (error) {
    for (const item of before.reverse()) {
      if (item.content === null) fs.unlinkSync(item.path);
      else atomic(item.path, item.content, item.permissions);
    }
    throw error;
  } finally {
    if (stage) { if (!/^\/opt\/teck-omp\/staging-[A-Za-z0-9]+$/.test(stage)) throw Error('Unsafe staging cleanup'); fs.rmSync(stage, { recursive: true, force: true }); }
    fs.unlinkSync(lock);
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { console.log(JSON.stringify(await applyUpdate(json(process.argv[2]), { forceInstall: process.argv.includes('--force-install') }))); }
  catch (error) { console.error(error.message.startsWith('Close all OMP') || error.message.startsWith('An OMP session') ? error.message : 'Sandbox update failed; previous managed files were restored. Check network access and available disk space, then retry.'); process.exitCode = 1; }
}
