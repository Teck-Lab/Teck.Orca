import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ensureProjectName, preserveProjectName, projectNameFromRemote } from '../runtime/project-name.mjs';

const projectId = 'github:teck-lab/teck.monorepo';
const setup = { id: 'existing-repo', repoId: 'existing-repo', projectId, hostId: 'local', path: '/home/agent/project', displayName: 'project' };
function fixture(rows = [setup]) {
  const calls = [], records = structuredClone(rows);
  const run = async (args) => {
    calls.push(args);
    if (args[0] === 'project' && args[1] === 'setups') return { setups: records };
    if (args[0] === 'repo') { records.push(structuredClone(setup)); return { repo: { id: setup.repoId, path: setup.path } }; }
    const match = records.find(s => s.id === args[args.indexOf('--setup') + 1]);
    match.displayName = args[args.indexOf('--display-name') + 1];
    return { setup: match };
  };
  return { calls, records, run };
}
const options = { projectId, displayName: 'Teck.Monorepo', projectRoot: '/home/agent/project' };

test('registration and reconnect repair the generic guest label with public setup-update', async () => {
  const f = fixture();
  const result = await ensureProjectName({ ...options, run: f.run });
  assert.equal(result.status, 'updated');
  assert.equal(f.records[0].displayName, 'Teck.Monorepo');
  assert.equal(f.records[0].id, 'existing-repo');
  assert.equal(f.records[0].path, options.projectRoot);
  assert.deepEqual(f.calls[1], ['project', 'setup-update', '--setup', 'existing-repo', '--host', 'local', '--display-name', 'Teck.Monorepo', '--json']);
  f.calls.length = 0;
  assert.equal((await ensureProjectName({ ...options, run: f.run })).status, 'unchanged');
  assert.equal(f.calls.length, 1);
});

test('first daemon startup registers its exact checkout once before applying the name', async () => {
  const f = fixture([]);
  assert.equal((await ensureProjectName({ ...options, run: f.run, register: true })).status, 'updated');
  assert.equal(f.calls.filter(args => args[0] === 'repo').length, 1);
  assert.deepEqual(f.calls.find(args => args[0] === 'repo'), ['repo', 'add', '--path', '/home/agent/project', '--json']);
});

test('native pane repair never creates a repository and cannot rename another project/host/path', async () => {
  for (const rows of [[], [{ ...setup, projectId: 'github:other/project' }], [{ ...setup, path: '/home/agent/other' }], [{ ...setup, hostId: 'ssh:other' }]]) {
    const f = fixture(rows);
    assert.equal((await ensureProjectName({ ...options, run: f.run })).status, 'not-registered');
    assert.equal(f.calls.length, 1);
  }
});

test('intentional custom names and already correct names survive reconnect without writes', async () => {
  for (const name of ['Teck.Monorepo', 'My custom project']) {
    const f = fixture([{ ...setup, displayName: name }]);
    const result = await ensureProjectName({ ...options, run: f.run });
    assert.ok(['unchanged', 'custom'].includes(result.status));
    assert.equal(f.calls.length, 1);
    assert.equal(f.records[0].displayName, name);
  }
});

test('ambiguous metadata and failed updates surface the error without broader writes', async () => {
  const f = fixture([setup, { ...setup, id: 'duplicate' }]);
  await assert.rejects(ensureProjectName({ ...options, run: f.run }), /ambiguous/i);
  assert.equal(f.calls.length, 1);
  await assert.rejects(ensureProjectName({ ...options, run: async args => {
    if (args[1] === 'setups') return { setups: [setup] };
    throw Error('metadata update refused');
  } }), /metadata update refused/);
});

test('fallback names come from the credential-free repository URL and retain case', () => {
  assert.equal(projectNameFromRemote('https://github.com/Teck-Lab/Teck.Monorepo.git'), 'Teck.Monorepo');
  assert.equal(projectNameFromRemote('git@github.com:Teck-Lab/Teck.Monorepo.git'), 'Teck.Monorepo');
  assert.throws(() => projectNameFromRemote('https://secret@github.com/org/repo.git'), /credential/i);
});

test('native startup uses the pane-provided CLI/profile and skips shells outside Orca', async () => {
  const calls = [];
  const exec = async (program, args, options) => {
    calls.push({ program, args, env: options.env });
    return { stdout: JSON.stringify({ ok: true, result: args[1] === 'setups' ? { setups: [setup] } : {} }) };
  };
  assert.equal((await preserveProjectName({ env: { TECK_ORCA_PROJECT_ID: projectId }, exec })).status, 'no-pane');
  assert.equal(calls.length, 0);
  const env = { TECK_ORCA_PROJECT_ID: projectId, TECK_ORCA_PROJECT_NAME: 'Teck.Monorepo',
    ORCA_PANE_KEY: 'tab:11111111-1111-1111-1111-111111111111', ORCA_WORKTREE_ID: 'repo::/worktree',
    ORCA_CLI_COMMAND: '/managed/bin/orca', ORCA_USER_DATA_PATH: '/managed/profile' };
  assert.equal((await preserveProjectName({ env, exec })).status, 'updated');
  assert.equal(calls[0].program, '/managed/bin/orca');
  assert.equal(calls[0].env.ORCA_USER_DATA_PATH, '/managed/profile');
  assert.equal(calls.length, 2);
});

test('older sandbox startup derives the name from origin and uses its explicitly pinned CLI', async () => {
  const calls = [];
  const exec = async (program, args) => {
    calls.push([program, args]);
    if (program === 'git') return { stdout: 'https://github.com/Teck-Lab/Teck.Monorepo.git\n' };
    return { stdout: JSON.stringify({ ok: true, result: args[2] === 'setups' ? { setups: [setup] } : {} }) };
  };
  const result = await preserveProjectName({ env: { TECK_ORCA_PROJECT_ID: projectId },
    cli: ['/pinned/node', '/pinned/cli.mjs'], register: true, exec });
  assert.equal(result.status, 'updated');
  assert.equal(calls[0][0], 'git');
  assert.equal(calls[1][0], '/pinned/node');
  assert.ok(calls.at(-1)[1].includes('Teck.Monorepo'));
});
