import assert from 'node:assert/strict';
import { test } from 'node:test';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { prepareProject, sandboxName, sshInstructions } from '../src/provider.mjs';
import { nativeEnvironment, installationScript } from '../src/configuration.mjs';

function fixture(t) {
  const stateRoot = mkdtempSync(join(tmpdir(), 'teck-native-ssh-test-'));
  t.after(() => rmSync(stateRoot, { recursive: true, force: true }));
  const project = { id: 'github:example/project', name: 'Project', cloneUrl: 'https://github.com/example/project.git', cpus: 8, memory: '16g' };
  const name = sandboxName(project.id), rows = new Map(), calls = [];
  let generation = 0;
  const run = async (program, args,options) => {
    calls.push({ program, args,options });
    if (program === 'ssh' && args[0] === '-G') return 'user _default_user_\nproxycommand sbx ssh proxy %n\n';
    if (program === 'sbx' && args[0] === 'ls') return JSON.stringify([...rows.values()]);
    if (program === 'sbx' && args[0] === 'create') {
      rows.set(name, { name, id: `vm-${++generation}` });
    }
    return '';
  };
  const options = { project, stateRoot, assetRoot: stateRoot, run, resolveKits: () => ({kind:'source-development',args:['fixture-workload','--kit','fixture-credentials']}), configure: async () => calls.push({ program: 'configure', args: [] }), ensureBuilder: async () => {}, syncName: async () => {}, syncPolicy: async () => {}, prepareOffice: async () => calls.push({ program: 'prepare-office', args: [] }), prepareKubernetesHost: async () => calls.push({ program: 'prepare-kubernetes-host', args: [] }) };
  return { project, name, rows, calls, options, stateRoot, run };
}

test('concurrent preparation creates one separate project sandbox without custom Orca pairing', async t => {
  const f = fixture(t);
  const [first, second] = await Promise.all([prepareProject(f.options), prepareProject(f.options)]);
  assert.equal(first.sandboxId, second.sandboxId);
  assert.match(first.sandboxName, /^teck-orca-ssh-[a-f0-9]{12}$/);
  const creations = f.calls.filter(c => c.program === 'sbx' && c.args[0] === 'create');
  assert.equal(creations.length, 1);
  assert.ok(creations[0].args.includes('16g'));
  assert.ok(creations[0].args.includes('8'));
  assert.ok(!creations[0].args.some(a => /orcad|ORCA_USER_DATA|--publish/.test(a)));
  assert.equal(f.calls.filter(c => c.args.includes('clone')).length, 1);
  assert.equal(f.calls.filter(c => c.program === 'configure').length, 1);
  assert.ok(!f.calls.some(c => c.program === 'orca' || c.args.some(a => /pairing|manage-daemon/.test(a))));
  assert.equal(first.phase, 'ready');
  assert.match(sshInstructions(first), /_default_user_/);
  assert.match(sshInstructions(first), /\/home\/agent\/project/);
});

test('a ready sandbox is reused without overwriting OMP settings or cloning again', async t => {
  const f = fixture(t);
  await prepareProject(f.options);
  f.calls.length = 0;
  await prepareProject(f.options);
  assert.ok(f.calls.some(c => c.program === 'ssh' && c.args.includes(`${f.name}.sbx`)));
  assert.ok(!f.calls.some(c => c.program === 'configure' || c.args.includes('clone') || c.args[0] === 'create'));
});

test('shared Kubernetes prerequisites run on creation and reuse even when managed KIND is disabled', async t => {
  const f = fixture(t);
  await prepareProject(f.options);
  assert.ok(f.calls.findIndex(c => c.program === 'prepare-kubernetes-host') > f.calls.findIndex(c => c.args[0] === 'run'));
  assert.ok(f.calls.findIndex(c => c.program === 'prepare-kubernetes-host') < f.calls.findIndex(c => c.program === 'ssh' && c.args[0] === '-T'));
  f.calls.length = 0;
  await prepareProject(f.options);
  assert.equal(f.calls.filter(c => c.program === 'prepare-kubernetes-host').length, 1);
  assert.ok(!f.calls.some(c => c.args[0] === 'create' || c.program === 'configure'));
});

test('failed shared device preparation cannot report a new sandbox ready', async t => {
  const f = fixture(t);
  await assert.rejects(prepareProject({ ...f.options, prepareKubernetesHost: async () => { throw Error('Invalid kmsg device'); } }), /Invalid kmsg device/);
  const state = JSON.parse(readFileSync(join(f.stateRoot, f.name, 'state.json')));
  assert.notEqual(state.phase, 'ready');
  assert.ok(!f.calls.some(c => c.program === 'ssh' && c.args[0] === '-T'));
});

test('enabled project starts guest Kubernetes without blocking SSH on bootstrap failure',async t=>{
  const f=fixture(t);let starts=0;
  const options={...f.options,project:{...f.project,kubernetes:'workspace'},startCluster:async()=>{starts++;throw Error('Bootstrap fixture failure');}};
  const result=await prepareProject(options);
  assert.equal(result.phase,'ready');assert.equal(starts,1);
  const creation=f.calls.find(c=>c.program==='sbx'&&c.args[0]==='create');
  assert.equal(creation.options?.env?.DOCKER_SANDBOXES_DOCKER_SIZE,'60g');
  assert.equal(creation.options?.env?.DOCKER_SANDBOXES_ROOT_SIZE,'30g');
  await prepareProject(options);assert.equal(starts,2);
  await assert.rejects(prepareProject({...options,project:{...f.project,kubernetes:'full'}}),/Kubernetes/);
});

test('unowned, replaced, renamed, and unreadable inventories never cause adoption or deletion', async t => {
  const f = fixture(t);
  f.rows.set(f.name, { name: f.name, id: 'foreign' });
  await assert.rejects(prepareProject(f.options), /unowned/i);
  f.rows.clear();
  const original = await prepareProject(f.options);
  f.rows.set(f.name, { name: f.name, id: 'foreign' });
  await assert.rejects(prepareProject(f.options), /identity/i);
  f.rows.clear();
  f.rows.set('renamed', { name: 'renamed', id: original.sandboxId });
  await assert.rejects(prepareProject(f.options), /another name/i);
  for (const inventory of ['{}', 'not-json', '[{"name":"bad"}]']) {
    await assert.rejects(prepareProject({ ...f.options, run: (program, args) => args[0] === 'ls' ? inventory : f.run(program, args) }));
  }
  assert.ok(!f.calls.some(c => ['rm', 'stop'].includes(c.args[0])));
});

test('explicit preparation after manual deletion archives ownership and creates one replacement', async t => {
  const f = fixture(t), first = await prepareProject(f.options);
  f.rows.clear();
  const [a, b] = await Promise.all([prepareProject(f.options), prepareProject(f.options)]);
  assert.notEqual(a.sandboxId, first.sandboxId);
  assert.equal(a.sandboxId, b.sandboxId);
  assert.ok(existsSync(join(f.stateRoot, f.name, 'retired')));
  assert.match(sshInstructions(a), /Run on/);
});

test('interrupted initial setup can retry safely without deleting or duplicating the VM', async t => {
  const f = fixture(t);
  await assert.rejects(prepareProject({ ...f.options, configure: async () => { throw Error('Configuration failed'); } }), /Configuration failed/);
  const state = JSON.parse(readFileSync(join(f.stateRoot, f.name, 'state.json')));
  assert.equal(state.sandboxId, 'vm-1');
  assert.notEqual(state.phase, 'ready');
  const result = await prepareProject(f.options);
  assert.equal(result.sandboxId, 'vm-1');
  assert.equal(f.calls.filter(c => c.args[0] === 'create').length, 1);
  assert.ok(!f.calls.some(c => c.args[0] === 'rm'));
});

test('an old workspace cannot resume into a deleted or different project sandbox', async t => {
  const f = fixture(t), original = await prepareProject(f.options);
  f.rows.clear();
  await assert.rejects(prepareProject({ ...f.options, recreateMissing: false, expectedSandboxId: original.sandboxId }), /deleted/);
  assert.equal(existsSync(join(f.stateRoot, f.name, 'retired')), false);
  assert.equal(f.calls.filter(c => c.args[0] === 'create').length, 1);
  await prepareProject(f.options);
  await assert.rejects(prepareProject({ ...f.options, recreateMissing: false, expectedSandboxId: original.sandboxId }), /identity changed/);
});

test('invalid project/credentials/resources fail before any provider changes', async t => {
  const f = fixture(t);
  for (const patch of [{ id: '' }, { cloneUrl: 'https://token@github.com/example/project.git' }, { cpus: 0 }, { memory: 'unlimited' }]) {
    await assert.rejects(prepareProject({ ...f.options, project: { ...f.project, ...patch } }));
  }
  assert.equal(f.calls.length, 0);
});

test('OMP setup preserves Orca routing and exposes only proxy-managed credential placeholders', () => {
  const env = nativeEnvironment({ id: 'github:example/project' });
  assert.ok(!Object.keys(env).some(key => key.startsWith('ORCA_')));
  assert.equal(env.OMNIROUTE_API_KEY, 'proxy-managed');
  assert.equal(env.TECK_ORCA_PROJECT_ID, 'github:example/project');
  assert.equal(env.PATH, undefined);
  const install = installationScript('/tmp/teck-native-ssh-test');
  assert.ok(!/ORCA_USER_DATA|\/opt\/teck-orcad|manage-daemon|ln .*\/orca\b/.test(install));
  assert.match(install, /omp-recovery\.sh/);
  assert.match(install, /\.omp\/agent/);
});

test('published creation verifies its immutable set and does not start a source builder', async t => {
  const f = fixture(t), reference = 'ghcr.io/teck-lab/teck-orca:0.8.0@sha256:' + 'a'.repeat(64);
  const kit = {kind:'published',reference,version:'0.8.0',digest:'sha256:'+'a'.repeat(64),verifyArgs:['kit','verify',reference,'--certificate-identity','fixture-ci']};
  const state = await prepareProject({...f.options,resolveKits:()=>kit,ensureBuilder:()=>{throw Error('No local builder allowed')}});
  const verify = f.calls.findIndex(c=>c.args[0]==='kit'&&c.args[1]==='verify');
  const create = f.calls.findIndex(c=>c.args[0]==='create');
  assert.ok(verify>=0&&verify<create);
  assert.equal(f.calls[create].args.at(-1),reference);
  assert.equal(f.calls[create].args.includes('--kit'),false);
  assert.equal(state.kitRelease.digest,kit.digest);
  f.calls.length=0;
  await prepareProject({...f.options,resolveKits:()=>{throw Error('Reuse must not resolve replacement kits')}});
  assert.ok(!f.calls.some(c=>c.args[0]==='kit'||c.args[0]==='create'));
  assert.equal(JSON.parse(readFileSync(join(f.stateRoot,f.name,'state.json'))).kitRelease.digest,kit.digest);
});

test('unverified or missing published kits cannot create a sandbox or ownership record', async t => {
  const f = fixture(t);
  await assert.rejects(prepareProject({...f.options,resolveKits:()=>{throw Error('No published release')}}),/No published release/);
  const kit={kind:'published',reference:'fixture@sha256:'+'a'.repeat(64),version:'0.8.0',digest:'sha256:'+'a'.repeat(64),verifyArgs:['kit','verify','fixture']};
  await assert.rejects(prepareProject({...f.options,resolveKits:()=>kit,run:(p,a,o)=>a[0]==='kit'?Promise.reject(Error('Signature rejected')):f.run(p,a,o)}),/Signature rejected/);
  assert.ok(!f.calls.some(c=>c.args[0]==='create'));
  assert.equal(existsSync(join(f.stateRoot,f.name,'state.json')),false);
});
