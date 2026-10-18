import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createLifecycle, sandboxName } from '../scripts/lifecycle.mjs';

test('failed fresh provisioning is rolled back while reused features are retained', async (t) => {
  const stateRoot = mkdtempSync(join(tmpdir(), 'teck-orca-rollback-'));
  t.after(() => rmSync(stateRoot, { recursive: true, force: true }));
  const env = { ORCA_PROJECT_ID: 'rollback-test', ORCA_VM_INSTANCE_ID: 'feature-1', ORCA_REPO_URL: 'https://example.com/repo.git' };
  const name = sandboxName(env.ORCA_PROJECT_ID, env.ORCA_VM_INSTANCE_ID);
  let exists = false;
  let fail = true;
  let removals = 0;
  const run = (program, args) => {
    if (program === 'ssh') return 'user _default_user_\nproxycommand sbx ssh proxy %n\n';
    if (program === 'git') throw new Error('No local identity');
    if (args[0] === 'ls') return JSON.stringify(exists ? [{ name }] : []);
    if (args[0] === 'create') { exists = true; return ''; }
    if (args[0] === 'rm') { exists = false; removals++; return ''; }
    if (args[0] === 'exec' && args.at(-1) === 'true' && fail) throw new Error('Guest preparation failed');
    return '';
  };
  const lifecycle = createLifecycle({ env, stateRoot, run, sync: () => {}, start: () => ({ schemaVersion: 1, projectRoot: '/home/agent/project', pairingCode: 'orca://pair?code=test' }) });
  await assert.rejects(lifecycle('create'), /Guest preparation failed/);
  assert.equal(removals, 1);
  assert.equal(exists, false);
  assert.equal(existsSync(join(stateRoot, name)), false);
  fail = false;
  await lifecycle('create');
  fail = true;
  await assert.rejects(lifecycle('create'), /Guest preparation failed/);
  assert.equal(removals, 1);
  assert.equal(exists, true);
});
