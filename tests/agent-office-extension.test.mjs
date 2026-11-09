import test from 'node:test';
import assert from 'node:assert/strict';
import activate, { createOfficeReporter, readOrcaCoordination } from '../runtime/omp/extensions/agent-office.mjs';
const context = (id, agent = { kind: 'main', id: 'Main', name: 'main' }) => ({ sessionManager: { getSessionId: () => id }, agent, model: { id: 'teck-executor' } });
function adapter(ctx, registered = []) {
  const handlers = new Map(), events = [];
  const reporter = { publish: e => events.push(e), close: async () => {} };
  activate({ on: (name, handler) => handlers.set(name, handler),getAllTools:()=>registered.map(name=>({name})) }, { reporter });
  return { events, run: (name, data = {}, c = ctx) => handlers.get(name)?.(data, c), handlers };
}
test('observer sends only lifecycle metadata and links native helper identities', () => {
  const main = adapter(context('main-session'));
  main.run('session_start');
  main.run('before_agent_start', { prompt: 'PRIVATE PROMPT' });
  main.run('tool_execution_start', { toolCallId: 't', toolName: 'bash', args: { command: 'SECRET COMMAND' } });
  main.run('tool_execution_end', { toolCallId: 't', toolName: 'bash', result: { content: 'SECRET OUTPUT' }, isError: false });
  const helper = adapter(context('helper-session', { kind: 'sub', id: '0-researcher', parentId: 'Main', name: 'researcher' }));
  helper.run('session_start');
  assert.equal(helper.events[0].parentId, main.events[0].workerId);
  assert.equal(helper.events[0].kind, 'subagent_start');
  helper.run('agent_end');
  assert.equal(helper.events.at(-1).kind, 'waiting');
  helper.run('session_shutdown');
  assert.equal(helper.events.at(-1).kind, 'subagent_end');
  assert.ok(!JSON.stringify(main.events).includes('PRIVATE'));
  assert.ok(!JSON.stringify(main.events).includes('SECRET'));
  assert.ok(!main.handlers.has('tool_call'));
});

test('mounted tool calls and helper messages are labelled as metadata rather than file editing',()=>{
  const a=adapter(context('mounted-tools'),['orca','github-issue_read']);
  a.run('tool_execution_start',{toolCallId:'coord',toolName:'write',args:{path:'xd://orca',content:'PRIVATE PAYLOAD'}});
  assert.equal(a.events.at(-1).tool,'orca');assert.equal(a.events.at(-1).category,'agent');
  a.run('tool_execution_end',{toolCallId:'coord',toolName:'write'});
  assert.ok(a.events.some(e=>e.kind==='tool_end'&&e.tool==='orca'));
  a.run('tool_execution_start',{toolCallId:'github',toolName:'write',args:{path:'xd://github-issue_read',content:'PRIVATE PAYLOAD'}});
  assert.equal(a.events.at(-1).category,'mcp');
  a.run('tool_execution_start',{toolCallId:'message',toolName:'write',args:{path:'agent://helper',content:'PRIVATE MESSAGE'}});
  assert.equal(a.events.at(-1).category,'agent');assert.equal(a.events.at(-1).summary,'Messaging helper');
  a.run('tool_execution_start',{toolCallId:'unknown',toolName:'write',args:{path:'xd://unregistered',content:'PRIVATE PAYLOAD'}});
  assert.equal(a.events.at(-1).tool,'write');
  assert.ok(!JSON.stringify(a.events).includes('PRIVATE'));
});
test('session switches retire the previous seat and approval reporting never gates execution', () => {
  const a = adapter(context('one'));
  assert.equal(a.run('session_start'), undefined);
  assert.equal(a.run('tool_approval_requested'), undefined);
  a.run('session_switch', {}, context('two'));
  assert.equal(a.events.at(-2).kind, 'session_end');
  assert.equal(a.events.at(-1).kind, 'session_start');
  assert.notEqual(a.events.at(-2).workerId, a.events.at(-1).workerId);
});
test('delivery retries preserve event IDs and the queue is bounded when the host is absent', async () => {
  const bodies = []; let up = false;
  const r = createOfficeReporter({ readConfig: () => ({ version: 1, sourceId: '347bd1b8-7ae4-46b8-bdd0-b6a193d165d6', token: 'a'.repeat(64), url: 'http://127.0.0.1:19474/api/ingest' }),
    schedule: () => ({ unref() {} }), cancel() {}, request: async (_url, opts) => { bodies.push(JSON.parse(opts.body)); if (!up) throw Error('Offline'); return new Response('{}', { status: 202 }); } });
  r.publish({ workerId: 'one', kind: 'session_start' }); await r.flush();
  up = true; await r.flush();
  assert.equal(bodies[0].events[0].eventId, bodies[1].events[0].eventId);
  assert.equal(r.pending, 0);
  up = false; for (let i = 0; i < 1000; i++) r.publish({ workerId: 'one', kind: 'thinking' });
  assert.equal(r.pending, 200); await r.close();
});

test('a synchronous configuration failure cannot wedge delivery or idle coordinator heartbeats', async () => {
  const config = { version: 1, sourceId: '347bd1b8-7ae4-46b8-bdd0-b6a193d165d6', token: 'a'.repeat(64), url: 'http://127.0.0.1:19474/api/ingest' };
  const packets = [], timers = new Map(); let clock = 0, sequence = 0, reads = 0;
  const r = createOfficeReporter({ now: () => clock,
    readConfig: () => { if (++reads === 1) throw Error('Configuration temporarily replaced'); return config; },
    schedule: (callback, ms) => { const timer = { id: ++sequence, at: clock + ms, callback, unref() {} }; timers.set(timer.id, timer); return timer; },
    cancel: timer => timers.delete(timer.id),
    request: async (_url, opts) => { packets.push(JSON.parse(opts.body)); return new Response('{}', { status: 202 }); } });
  r.publish({ workerId: 'coordinator', kind: 'waiting', orchestration: { role: 'coordinator', runId: 'run-test' } });
  while (clock < 90_000) {
    const next = [...timers.values()].sort((a, b) => a.at - b.at)[0];
    assert.ok(next, 'the retry/heartbeat timer must remain scheduled');
    clock = next.at; timers.delete(next.id); next.callback(); await r.flush();
  }
  assert.ok(packets.length >= 9, 'idle sessions keep sending presence for longer than the 60-second expiry');
  assert.equal(packets[0].events[0].kind, 'waiting');
  assert.equal(r.pending, 0);
  for (const packet of packets) assert.deepEqual(packet.heartbeat, ['coordinator']);
  assert.ok(packets.slice(1).every(p => p.events.length === 0), 'heartbeats do not invent work or tool activity');
  await r.close(); assert.equal(timers.size, 0);
});

test('an invalid rotating configuration recovers and a missing waiting seat is reannounced', async () => {
  const config = { version: 1, sourceId: '347bd1b8-7ae4-46b8-bdd0-b6a193d165d6', token: 'b'.repeat(64), url: 'http://127.0.0.1:19474/api/ingest' };
  let valid = false; const packets = [];
  const r = createOfficeReporter({ readConfig: () => valid ? config : { version: 0 },
    schedule: () => ({ unref() {} }), cancel() {}, request: async (_url, opts) => {
      packets.push(JSON.parse(opts.body)); return new Response(JSON.stringify({ missing: packets.length === 1 ? ['coordinator'] : [] }), { status: 202 });
    } });
  r.publish({ workerId: 'coordinator', kind: 'waiting', placement: 'office', orchestration: { role: 'coordinator', runId: 'run-test' } });
  await r.flush(); valid = true; await r.flush(); await r.flush();
  assert.equal(packets.length, 2);
  assert.deepEqual(packets[1].events.map(e => e.kind), ['session_start', 'waiting']);
  assert.ok(packets[1].events.every(e => e.orchestration.role === 'coordinator' && e.placement === 'office'));
  await r.close();
});

test('placement follows the verified role contract after startup, never the model or prompt',()=>{
  const branch=[];const ctx=context('coordinator');ctx.sessionManager.getBranch=()=>branch;
  ctx.model.id='teck-orchestrator';
  const main=adapter(ctx);main.run('session_start');
  assert.equal(main.events[0].placement,'cloud');assert.equal(main.events[0].orchestration,null);
  branch.push({type:'custom',customType:'teck-orca-contract',data:{version:1,role:'coordinator',coordinatorRunId:'run-one'}});
  main.run('agent_start');assert.equal(main.events.at(-1).placement,'office');assert.equal(main.events.at(-1).orchestration.runId,'run-one');
  const helper=adapter(context('research-session',{kind:'sub',id:'research-one',parentId:'Main',name:'researcher'}));
  helper.run('session_start');assert.equal(helper.events[0].parentId,main.events[0].workerId);assert.equal(helper.events[0].placement,'office');
  assert.equal(helper.events[0].role,'researcher');assert.equal(helper.events[0].orchestration.role,'coordinator');
  branch.push({type:'custom',customType:'teck-orca-contract',data:{version:1,role:'executor',authority:{runId:'run-one',taskId:'task-one',dispatchId:'dispatch-one'},assignment:{issue:'https://github.com/Teck-Lab/Teck.Monorepo/issues/12',objective:'PRIVATE SCOPE'}}});
  main.run('tool_execution_start',{toolCallId:'native',toolName:'task'});
  assert.equal(main.events.at(-1).placement,'cloud');assert.equal(main.events.at(-1).orchestration.dispatchId,'dispatch-one');
  assert.ok(!JSON.stringify(main.events).includes('PRIVATE SCOPE'));
  helper.run('agent_start');assert.equal(helper.events.at(-1).placement,'cloud');assert.equal(helper.events.at(-1).orchestration.role,'executor');
  branch.push({type:'custom',customType:'teck-orca-contract',data:{version:1,role:'unbound'}});
  main.run('agent_start');assert.equal(main.events.at(-1).orchestration,null);assert.equal(main.events.at(-1).placement,'cloud');
});

test('unbound/malformed worker claims do not become a verified office role',()=>{
  const ctx=context('unbound');
  for(const data of [{version:1,role:'executor'},{version:2,role:'coordinator'},{version:1,role:'executor',authority:{runId:'run',taskId:'task',dispatchId:'../bad'}}]){
    ctx.sessionManager.getBranch=()=>[{type:'custom',customType:'teck-orca-contract',data}];
    assert.equal(readOrcaCoordination(ctx),null);
  }
});
