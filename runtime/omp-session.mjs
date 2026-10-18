// Guest-only session identity. No credentials or original task prompts are persisted here.
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync, statSync, rmSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

export const sessionRoot = () => join(homedir(), '.local/state/teck-orca/omp-terminals');
export const bootId = () => readFileSync('/proc/sys/kernel/random/boot_id', 'utf8').trim();
export function identity(env = process.env, cwd = process.cwd()) {
  const scope = env.TECK_ORCA_FEATURE_ID || env.TECK_ORCA_PROJECT_ID;
  if (!scope || !env.ORCA_WORKTREE_ID ||
      !/^[^:\s]+:[a-f0-9-]{36}$/i.test(env.ORCA_PANE_KEY ?? '')) return null;
  return { featureId: scope, worktreeId: env.ORCA_WORKTREE_ID,
    paneKey: env.ORCA_PANE_KEY, cwd: resolve(cwd) };
}
export function recordPath(owner, root = sessionRoot()) {
  return join(root, createHash('sha256').update(JSON.stringify(owner)).digest('hex') + '.json');
}
export function readRecord(path) { try { return JSON.parse(readFileSync(path, 'utf8')); } catch { return null; } }
export function writeRecord(path, value) {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const temporary = `${path}.${randomUUID()}.tmp`;
  writeFileSync(temporary, JSON.stringify(value) + '\n', { mode: 0o600 });
  renameSync(temporary, path);
}
export function sameOwner(record, owner) {
  return record?.version === 1 && Object.keys(owner).every(key => record.owner?.[key] === owner[key]);
}
export function recoverable(record, owner, currentBoot, exists = existsSync) {
  return sameOwner(record, owner) && record.active === true && record.bootId !== currentBoot &&
    typeof record.sessionFile === 'string' && record.sessionFile.endsWith('.jsonl') && exists(record.sessionFile);
}
// OMP creates a new interactive session lazily. Its own breadcrumb proves that
// a missing journal was never materialized, rather than a lost conversation.
export function freshSession(record, root = join(homedir(), '.omp/agent/terminal-sessions')) {
  let found = false;
  try {
    for (const entry of readdirSync(root, { withFileTypes: true })) {
      if (!entry.isFile()) continue;
      let lines;
      try { lines = readFileSync(join(root, entry.name), 'utf8').split(/\r?\n/); } catch { continue; }
      if (lines[0] !== record.owner.cwd || lines[1] !== record.sessionFile) continue;
      if (!lines.slice(2).includes('fresh')) return false;
      found = true;
    }
  } catch { return false; }
  return found;
}
export function recoveryMode(record, owner, currentBoot, exists = existsSync, fresh = freshSession) {
  if (!sameOwner(record, owner) || record.active !== true || record.bootId === currentBoot ||
      typeof record.sessionFile !== 'string' || !record.sessionFile.endsWith('.jsonl')) return null;
  if (exists(record.sessionFile)) return 'resume';
  return fresh(record) ? 'fresh' : null;
}
// Preserve only launch configuration needed for continuity, never initial prompts,
// bearer keys, arbitrary extension argv, or print/RPC/one-shot commands.
export function reusableArgs(args) {
  const pairs = new Set(['--config', '--profile', '--session-dir', '--add-dir', '--tools', '--skills',
    '--approval-mode', '--system-prompt', '--system-prompt-template', '--append-system-prompt', '--extension', '-e', '--hook']);
  const flags = new Set(['--no-title', '--no-tools', '--no-skills', '--no-rules', '--no-lsp', '--no-pty', '--hide-thinking']);
  const result = [];
  for (let i = 0; i < args.length; i++) {
    if (pairs.has(args[i]) && args[i + 1] !== undefined) result.push(args[i], args[++i]);
    else if (flags.has(args[i])) result.push(args[i]);
  }
  return result;
}
export function interactiveLaunch(args) {
  // Pinned OMP 18.8.7 verbs. Utility commands must remain passthrough even when
  // launch flags precede them; otherwise a cold record could swallow `omp ps`.
  const utilities = new Set(['acp', 'auth-broker', 'auth-gateway', 'agents', 'bench', 'browser-relay',
    'cleanse', 'collab', 'clip', 'commit', 'completions', 'compress', 'config', 'dry-balance', 'find',
    'gc', 'grep', 'gallery', 'git', 'grievances', 'if-bench', 'images', 'img', 'install', 'join',
    'login', 'models', 'plugin', 'plugins', 'play', 'predict', 'ps', 'say', 'share', 'setup', 'shell',
    'read', 'render', 'skill', 'skills', 'ssh', 'stats', 'stream', 'update', 'usage', 'tiny-models',
    'token', 'toks', 'ttsr', 'worktree', 'wt', 'search', 'q', 'web-search', '__complete']);
  return !args.some(arg => ['--version', '-v', '--help', '-h', '--print', '-p', '--no-session',
    '--export', '--list-models', '--alias', '--mode', '--json', '--acp', '--trusted-extension', '--cwd'].includes(arg.split('=')[0])) &&
    // Conservative for ambiguous utility words used as flag values: passing
    // through without recording is preferable to changing the requested verb.
    (args[0] === 'launch' || !args.some(arg => utilities.has(arg)));
}
export function explicitSession(args) {
  return args.some(arg => ['--resume', '-r', '--session', '--continue', '-c', '--fork', '--from-codex', '--from-claude'].includes(arg.split('=')[0]));
}
export function resumeArgs(record, mode = 'resume') {
  return [...(record.args ?? []), ...(mode === 'fresh' ? [] : ['--resume', record.sessionFile]),
    ...(record.model ? ['--model', record.model] : []),
    ...(record.thinking ? ['--thinking', record.thinking] : [])];
}
export function rememberSession(path, token, ctx, model, thinking) {
  // OMP rebinds extensions to its task/advisor sessions. Those are never the pane owner.
  if (ctx.agent?.kind !== 'main') return;
  const record = readRecord(path);
  if (!record || record.token !== token || !record.active) return;
  const file = ctx.sessionManager.getSessionFile();
  writeRecord(path, { ...record, sessionFile: file ?? null,
    sessionId: ctx.sessionManager.getSessionId(),
    model: model ? `${model.provider}/${model.id}` : record.model,
    thinking: thinking ?? record.thinking });
}

export function claimPane(path, currentBoot, pid = process.pid) {
  const lock = `${path}.lock`, token = randomUUID();
  const living = held => {
    if (held?.bootId !== currentBoot) return false;
    try { process.kill(held.pid, 0); return true; } catch (error) { return error.code === 'EPERM'; }
  };
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  try { mkdirSync(lock); }
  catch (error) {
    if (error.code !== 'EEXIST') throw error;
    // Serialize stale lock reclamation. A freshly made lock may not have written
    // its owner yet; never steal that window from another launcher.
    const reclaim = `${lock}.reclaim`;
    try { mkdirSync(reclaim); } catch { throw Error('This pane already has an OMP launch in progress'); }
    try {
      const held = readRecord(`${lock}/owner.json`);
      if (living(held) || !held && Date.now() - statSync(lock).mtimeMs < 30_000) {
        throw Error('This pane already has an OMP process or launch in progress');
      }
      rmSync(lock, { recursive: true, force: true }); mkdirSync(lock);
    } finally { rmSync(reclaim, { recursive: true, force: true }); }
  }
  writeRecord(`${lock}/owner.json`, { bootId: currentBoot, pid, token });
  return { lock, token };
}
