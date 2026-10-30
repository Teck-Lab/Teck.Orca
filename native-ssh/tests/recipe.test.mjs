import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createLifecycle } from '../src/recipe.mjs';

const project = { id: 'github:example/project', name: 'Project', cloneUrl: 'https://github.com/example/project.git', cpus: 8, memory: '16g' };
const env = { ORCA_PROJECT_ID: project.id, ORCA_VM_INSTANCE_ID: 'workspace-1' };
const state = { projectId: project.id, displayName: 'Project', projectRoot: '/home/agent/project',
  sandboxName: 'teck-orca-ssh-2697957ebd69', sandboxId: 'vm-1', phase: 'ready' };
function fixture() {
  const calls = [];
  const lifecycle = createLifecycle({ env, projects: [project], stateRoot: 'unused', assetRoot: 'unused',
    provision: async options => { calls.push(options); return { ...state, sandboxName: (await import('../src/provider.mjs')).sandboxName(project.id) }; } });
  return { calls, lifecycle };
}
test('Run on create emits native SSH directly and permits later workspaces on the same VM', async () => {
  const f = fixture(), first = await f.lifecycle('create'), second = await f.lifecycle('create');
  assert.equal(first.connection.type, 'ssh');
  assert.equal(first.connection.target.username, '_default_user_');
  assert.equal(first.connection.target.configHost, first.connection.target.host);
  assert.equal(first.connection.target.port, 22);
  assert.equal(first.pairingCode, undefined);
  assert.deepEqual(second.connection, first.connection);
  assert.equal(f.calls.length, 2);
  assert.equal(f.calls[0].recreateMissing, true);
});
test('resume is pinned to the original VM and suspend/destroy do not touch the provider', async () => {
  const f = fixture(), created = await f.lifecycle('create');
  const payload = { recipeResult: created };
  f.calls.length = 0;
  assert.equal(await f.lifecycle('suspend', payload), undefined);
  assert.equal(await f.lifecycle('destroy', payload), undefined);
  assert.equal(f.calls.length, 0);
  const resumed = await f.lifecycle('resume', payload);
  assert.deepEqual(resumed.connection, created.connection);
  assert.equal(f.calls[0].recreateMissing, false);
  assert.equal(f.calls[0].expectedSandboxId, 'vm-1');
});
test('manual invocation and a foreign lifecycle payload fail before provisioning', async () => {
  let calls = 0;
  const provision = async () => { calls++; throw Error('Must not provision'); };
  await assert.rejects(createLifecycle({ env: {}, projects: [], provision })('create'), /project ID/);
  await assert.rejects(createLifecycle({ env: { ORCA_PROJECT_ID: project.id }, projects: [], provision })('create'), /Run on/);
  const f = fixture(), created = await f.lifecycle('create');
  await assert.rejects(createLifecycle({ env, projects: [project], provision })('resume', {
    recipeResult: { ...created, userData: { ...created.userData, instanceId: 'foreign' } },
  }), /another project or workspace/);
  assert.equal(calls, 0);
});

test('resume preserves the original project name even when its working directory changes', async () => {
  let options;
  const make = env => createLifecycle({ env, projects: [], provision: async o => {
    options = o;
    return { ...state, displayName: o.project.name, sandboxName: (await import('../src/provider.mjs')).sandboxName(o.project.id) };
  } });
  const initial = { ...env, ORCA_REPO_URL: project.cloneUrl, ORCA_REPO_PATH: '/repos/Teck.Monorepo', ORCA_PROJECT_NAME: 'Teck.Monorepo' };
  const created = await make(initial)('create');
  assert.equal(created.userData.projectName, 'Teck.Monorepo');
  await make({ ...env, ORCA_REPO_PATH: '/home/agent/project' })('resume', { recipeResult: created });
  assert.equal(options.project.name, 'Teck.Monorepo');
});
