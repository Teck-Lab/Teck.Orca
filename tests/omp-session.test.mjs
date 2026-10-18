import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, readFileSync, rmSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { identity, recordPath, writeRecord, readRecord, recoverable, reusableArgs,
  explicitSession, interactiveLaunch, resumeArgs, rememberSession, claimPane,
  freshSession, recoveryMode } from '../runtime/omp-session.mjs';

const env = { TECK_ORCA_FEATURE_ID: 'feature', ORCA_WORKTREE_ID: 'repo::/project',
  ORCA_PANE_KEY: 'tab:01234567-1234-4234-8234-0123456789ab' };
test('session recovery is exact to the feature, workspace, pane and cwd and requires a cold boot', () => {
  const owner = identity(env, '/project');
  const record = { version: 1, owner, active: true, bootId: 'old', sessionFile: '/sessions/root.jsonl' };
  assert.equal(recoverable(record, owner, 'new', () => true), true);
  assert.equal(recoverable(record, owner, 'old', () => true), false);
  assert.equal(recoverable({ ...record, active: false }, owner, 'new', () => true), false);
  assert.equal(recoverable(record, owner, 'new', () => false), false);
  for (const key of Object.keys(owner)) assert.equal(recoverable(record, { ...owner, [key]: 'other' }, 'new', () => true), false);
  assert.equal(identity({}, '/project'), null);
  assert.notEqual(recordPath(owner), recordPath({ ...owner, paneKey: 'other' }));
});
test('resume keeps session/model configuration without replaying prompts or persisting keys', () => {
  const args = reusableArgs(['--config', '/cfg.yml', '--api-key', 'secret', '--model', 'old', '--no-title', '--no-tools', 'Fix this issue']);
  assert.deepEqual(args, ['--config', '/cfg.yml', '--no-title', '--no-tools']);
  assert.deepEqual(resumeArgs({ args, sessionFile: '/sessions/exact.jsonl', model: 'omniroute/teck-executor', thinking: 'high' }),
    [...args, '--resume', '/sessions/exact.jsonl', '--model', 'omniroute/teck-executor', '--thinking', 'high']);
  for (const args of [['--resume', 'x'], ['--session', 'x'], ['-r'], ['--fork', 'x'], ['--continue']]) assert.equal(explicitSession(args), true);
  assert.equal(interactiveLaunch(['--no-title']), true);
  assert.equal(interactiveLaunch(['launch', 'Fix this']), true);
  assert.equal(interactiveLaunch(['Fix this']), true);
  for (const args of [['--version'], ['--print', 'hello'], ['--mode', 'rpc'], ['ps'], ['--config', 'x.yml', 'models'], ['--no-session']]) assert.equal(interactiveLaunch(args), false);
});

test('cold recovery reopens an unused OMP pane only with its exact fresh breadcrumb', t => {
  const root = mkdtempSync(join(tmpdir(), 'teck-omp-fresh-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const owner = identity(env, '/project');
  const file = join(root, 'unsaved.jsonl');
  const record = { version: 1, owner, active: true, bootId: 'old', sessionFile: file,
    args: ['--no-title'], model: 'omniroute/teck-orchestrator', thinking: 'high' };
  const fresh = row => freshSession(row, root);
  const mode = (row = record, who = owner, boot = 'new') => recoveryMode(row, who, boot, existsSync, fresh);
  const crumb = join(root, 'pts-0');
  const write = (cwd, session, marker = 'fresh') => writeFileSync(crumb, `${cwd}\n${session}\n${marker}\n`);
  assert.equal(mode(), null);
  write(owner.cwd, file);
  assert.equal(mode(), 'fresh');
  assert.deepEqual(resumeArgs(record, mode()), ['--no-title', '--model', record.model, '--thinking', 'high']);
  assert.equal(mode(record, owner, 'old'), null);
  assert.equal(mode({ ...record, active: false }), null);
  for (const key of Object.keys(owner)) assert.equal(mode(record, { ...owner, [key]: 'other' }), null);
  write('/another-project', file); assert.equal(mode(), null);
  write(owner.cwd, `${file}.other`); assert.equal(mode(), null);
  write(owner.cwd, file, ''); assert.equal(mode(), null, 'A missing persisted conversation must not become an empty session');
  write(owner.cwd, file); writeFileSync(join(root, 'pts-1'), `${owner.cwd}\n${file}\n`);
  assert.equal(mode(), null, 'A non-fresh breadcrumb overrides stale fresh evidence');
  writeFileSync(file, '{"type":"session"}\n');
  assert.equal(mode(), 'resume');
  assert.ok(resumeArgs(record, mode()).includes('--resume'));
});
test('pane locks prevent concurrent launches, retain incomplete claims and reclaim only stale owners', t => {
  const root = mkdtempSync(join(tmpdir(), 'teck-omp-lock-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const path = join(root, 'pane.json');
  const first = claimPane(path, 'boot');
  assert.throws(() => claimPane(path, 'boot'), /already has/);
  assert.equal(readRecord(`${first.lock}/owner.json`).token, first.token);
  const recovered = claimPane(path, 'new-boot');
  assert.notEqual(recovered.token, first.token);
  rmSync(recovered.lock, { recursive: true }); mkdirSync(recovered.lock);
  assert.throws(() => claimPane(path, 'new-boot'), /already has/);
});
test('recorder follows root session switches while ignoring task/advisor sessions and stale launch tokens', t => {
  const root = mkdtempSync(join(tmpdir(), 'teck-omp-session-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const path = join(root, 'record.json');
  writeRecord(path, { version: 1, owner: identity(env, '/project'), active: true, token: 'launch', bootId: 'boot' });
  const ctx = { agent: { kind: 'main' }, sessionManager: { getSessionFile: () => '/sessions/root.jsonl', getSessionId: () => 'root' } };
  rememberSession(path, 'launch', ctx, { provider: 'omniroute', id: 'teck-executor' }, 'high');
  assert.equal(readRecord(path).sessionId, 'root');
  const before = readFileSync(path);
  rememberSession(path, 'launch', { ...ctx, agent: { kind: 'sub' } }, { provider: 'other', id: 'advisor' }, 'low');
  rememberSession(path, 'stale', ctx, undefined, undefined);
  assert.deepEqual(readFileSync(path), before);
  ctx.sessionManager.getSessionFile = () => '/sessions/switched.jsonl';
  ctx.sessionManager.getSessionId = () => 'switched';
  rememberSession(path, 'launch', ctx, undefined, undefined);
  assert.equal(readRecord(path).sessionId, 'switched');
  assert.equal(readRecord(path).model, 'omniroute/teck-executor');
});
