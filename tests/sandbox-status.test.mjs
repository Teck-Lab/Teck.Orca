import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { connectionIndicator, ownedProjects, readSandboxStatus } from '../runtime/sandbox-status.mjs';
import { activateStatus } from '../runtime/plugin-status-worker.mjs';

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'teck-status-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const projectId = 'github:teck-lab/example', name = 'teck-orca-ssh-' + createHash('sha256').update(projectId).digest('hex').slice(0, 12);
  mkdirSync(join(root, name));
  const state = { version: 1, projectId, sandboxName: name, sandboxId: 'owned-id', projectRoot: '/home/agent/project',
    phase: 'ready', displayName: 'Example', cloneUrl: 'https://github.com/teck-lab/example.git', secret: 'never-relay-this' };
  writeFileSync(join(root, name, 'state.json'), JSON.stringify(state));
  return { root, state, row: { name, id: state.sandboxId, status: 'running', cpus: 8, memory: '16g' } };
}
test('ownership and provider identity fence every probe; stopped/missing/replaced VMs never execute', async t => {
  const f = fixture(t);
  assert.ok(!JSON.stringify(ownedProjects(f.root)).includes('never-relay-this'));
  for (const rows of [[], [{ ...f.row, status: 'stopped' }], [{ ...f.row, id: 'replacement' }]]) {
    const calls = [];
    const result = await readSandboxStatus({ root: f.root, run: async (_p, args) => { calls.push(args); return JSON.stringify(rows); } });
    assert.equal(calls.length, 1);
    assert.equal(result.projects[0].runtime, null);
    assert.ok(!JSON.stringify(result).includes('cloneUrl'));
  }
  let calls = 0;
  const changed = await readSandboxStatus({ root: f.root, run: async () => JSON.stringify([{ ...f.row, status: ++calls === 1 ? 'running' : 'stopped' }]) });
  assert.equal(calls, 2);
  assert.equal(changed.projects[0].state, 'stopped');
});
test('running probes return only verified public fields; a failed inventory never wakes anything', async t => {
  const f = fixture(t), calls = [];
  const result = await readSandboxStatus({ root: f.root, run: async (p, args) => {
    calls.push([p, args]);
    return args[0] === 'ls' ? JSON.stringify([f.row]) : JSON.stringify({ connection: 'ready', daemon: '1.4.248', omp: '18.16.0',
      credentials: 'never-relay-this', disk: { total: 100, available: 40 }, kubernetes: { name: 'local', phase: 'ready', readiness: 'unverified' } });
  } });
  assert.equal(calls.length, 3);
  assert.equal(result.projects[0].runtime.connection, 'ready');
  assert.equal(result.projects[0].runtime.kubernetes.readiness, 'unverified');
  assert.ok(!JSON.stringify(result).includes('never-relay-this'));
  assert.match(connectionIndicator(result).text, /connected/);
  let failed = 0;
  assert.ok((await readSandboxStatus({ root: f.root, run: async () => { failed++; throw Error('provider failure with secrets'); } })).error);
  assert.equal(failed, 1);
  const unprobed = await readSandboxStatus({ root: f.root, runtimeDetails: false, run: async () => JSON.stringify([f.row]) });
  assert.match(connectionIndicator(unprobed).text, /running/);
  assert.doesNotMatch(connectionIndicator(unprobed).text, /connected/);
});
test('unreadable or forged records cannot grant access to another VM', t => {
  const f = fixture(t);
  writeFileSync(join(f.root, f.row.name, 'state.json'), JSON.stringify({ ...f.state, projectId: 'foreign' }));
  assert.throws(() => ownedProjects(f.root), /ownership/);
});
test('resident worker coalesces refresh, opens its own panel and observes launches without retaining prompt content', async () => {
  const requests = new Map(), hooks = new Map(), commands = new Map(), events = new Map(), posts = [], hostCalls = [], calls = [];
  let collectCount = 0, release;
  const orca = { panels: { handle: (name, fn) => requests.set(name, fn), post: (_name, data) => posts.push(data) },
    hooks: { on: (name, fn) => hooks.set(name, fn) }, events: { on: (name, fn) => events.set(name, fn) },
    commands: { register: (name, fn) => commands.set(name, fn) },
    settings: { get: async () => ({}), onDidChange() {} }, log() {},
    host: { call: async (name, args) => { hostCalls.push([name, args]); return name === 'agents.list' ? { agents: [] } : { ok: true }; } } };
  let cleared = false;
  const worker = activateStatus(orca, { collect: async () => { collectCount++; await new Promise(resolve => { release = resolve; }); return { projects: [], checkedAt: 1, error: null }; },
    interval: () => ({ unref() {} }), clear: () => { cleared = true; }, run: async (...args) => { calls.push(args); return ''; } });
  await Promise.resolve(); await Promise.resolve();
  const one = worker.refresh(), two = worker.refresh();
  release(); await Promise.all([one, two]);
  assert.equal(collectCount, 1);
  assert.equal(hooks.get('agent.prompt.before')({ agent: 'omp', terminalId: 'term_1', inputKind: 'orchestration', prompt: 'SECRET BRIEF' }), undefined);
  assert.ok(!JSON.stringify(posts).includes('SECRET BRIEF'));
  assert.equal(posts.at(-1).launch.kind, 'dispatch-input-requested');
  await commands.get('teck.sandboxStatus')({}, {});
  assert.deepEqual(calls[0][1], ['plugin', 'open', 'teck-lab.teck-sbx-recipes', '--panel', 'sandbox', '--json']);
  worker.dispose(); assert.equal(cleared, true);
  assert.ok(hostCalls.some(([name]) => name === 'statusBar.update'));
});

test('maintenance requests are asynchronous, deduplicated and cannot override the ownership root', async () => {
  const requests=new Map(), posts=[];let started=0, finish;
  const orca={panels:{handle:(name,fn)=>requests.set(name,fn),post:(_name,data)=>posts.push(data)},
    events:{on(){}},hooks:{on(){}},commands:{register(){}},settings:{get:async()=>({}),onDidChange(){}},
    host:{call:async()=>({})},log(){}};
  const worker=activateStatus(orca,{collect:async()=>({projects:[],error:null}),targetDigest:()=> 'test',
    interval:()=>({}),clear(){}, update:async args=>{started++;assert.equal(args.root,undefined);return new Promise(resolve=>{finish=resolve;});}});
  try{
    await assert.rejects(requests.get('sandbox.update')({}),/Choose/);
    const input={projectId:'project',sandboxId:'vm',root:'/forged'};
    assert.deepEqual(await requests.get('sandbox.update')(input),{accepted:true});
    assert.deepEqual(await requests.get('sandbox.update')(input),{accepted:true});assert.equal(started,1);
    assert.equal(posts.at(-1).updates.vm.state,'running');
    finish({message:'Updated'});for(let i=0;i<8;i++)await Promise.resolve();
    assert.equal(posts.at(-1).updates.vm.state,'succeeded');
  }finally{worker.dispose();}
});
