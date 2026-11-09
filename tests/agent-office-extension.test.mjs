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

test('a fresh idle coordinator waits for role initialization before its first office announcement', () => {
  const branch = [], timers = [], ctx = context('fresh-idle-coordinator');
  ctx.sessionManager.getBranch = () => branch;
  ctx.setTimeout = callback => { timers.push(callback); };
  const a = adapter(ctx);
  a.run('session_start');
  assert.equal(a.events.length, 0, 'do not classify a new terminal before the role guard starts');
  // The role guard is registered after the observer, exactly as in OMP startup.
  branch.push({ type: 'custom', customType: 'teck-orca-contract', data: { version: 1, role: 'coordinator' } });
  timers.shift()();
  assert.equal(a.events.length, 1);
  assert.equal(a.events[0].kind, 'session_start');
  assert.equal(a.events[0].orchestration.role, 'coordinator');
  assert.equal(a.events[0].placement, 'office');
});

test('deferred startup keeps dispatched workers in cloud and cannot revive a switched-away session', () => {
  const timers = [], branch = [], ctx = context('fresh-dispatch');
  ctx.sessionManager.getBranch = () => branch;
  ctx.setTimeout = callback => { timers.push(callback); };
  const a = adapter(ctx); a.run('session_start');
  branch.push({ type: 'custom', customType: 'teck-orca-contract', data: { version: 1, role: 'executor',
    authority: { runId: 'run-1', taskId: 'task-1', dispatchId: 'dispatch-1' } } });
  timers.shift()();
  assert.equal(a.events[0].placement, 'cloud');
  assert.equal(a.events[0].orchestration.role, 'executor');
  a.run('session_switch', {}, ctx);
  const next = context('next-session'); next.setTimeout = ctx.setTimeout;
  next.sessionManager.getBranch = () => [{ type: 'custom', customType: 'teck-orca-contract', data: { version: 1, role: 'coordinator' } }];
  a.run('session_switch', {}, next);
  const before = a.events.length;
  timers.shift()(); assert.equal(a.events.length, before, 'ignore a stale startup timer');
  timers.shift()();
  assert.equal(a.events.at(-1).placement, 'office');
  assert.equal(a.events.at(-2).kind, 'session_end');
});

test('unbound/malformed worker claims do not become a verified office role',()=>{
  const ctx=context('unbound');
  for(const data of [{version:1,role:'executor'},{version:2,role:'coordinator'},{version:1,role:'executor',authority:{runId:'run',taskId:'task',dispatchId:'../bad'}}]){
    ctx.sessionManager.getBranch=()=>[{type:'custom',customType:'teck-orca-contract',data}];
    assert.equal(readOrcaCoordination(ctx),null);
  }
});

test('native Office MCP results animate their exact owner without forwarding arbitrary arguments or output',()=>{
  const a=adapter(context('office-owner'),['agentoffice-office_status','agentoffice-office_flip']);
  a.run('tool_execution_start',{toolCallId:'status',toolName:'write',args:{path:'xd://agentoffice-office_status',content:'PRIVATE REQUEST'}});
  a.run('tool_execution_end',{toolCallId:'status',toolName:'write',result:{details:{xdev:{tool:'agentoffice-office_status',inner:{structuredContent:{officeSignal:{v:1,kind:'status',text:'Testing cache',mood:'🧪',extra:'PRIVATE'}}}}}}});
  const status=a.events.find(e=>e.kind==='status');
  assert.equal(status.workerId,a.events[0].workerId);assert.equal(status.summary,'Testing cache');assert.equal(status.tool,'🧪');
  a.run('tool_execution_start',{toolCallId:'flip',toolName:'agentoffice-office_flip',args:{reason:'PRIVATE REQUEST'}});
  a.run('tool_execution_end',{toolCallId:'flip',toolName:'agentoffice-office_flip',isError:true,result:{content:[{type:'text',text:'PRIVATE OUTPUT'}],details:{structuredContent:{officeSignal:{v:1,kind:'flip',text:'Not delivered'}}}}});
  assert.ok(!a.events.some(e=>e.kind==='flip'));assert.ok(!JSON.stringify(a.events).includes('PRIVATE'));
});

test('assistant usage is cumulative per owner and replay cannot replace its waiting pose',async()=>{
  const ctx=context('usage-owner'),a=adapter(ctx);
  a.run('session_start');a.run('agent_end');
  const message={role:'assistant',provider:'gateway',model:'model',timestamp:10,responseId:'shared-gateway-id',usage:{totalTokens:125}};
  a.run('message_end',{message});a.run('message_end',{message});
  assert.deepEqual(a.events.filter(e=>e.kind==='usage').map(e=>e.tokenTotal),[125]);
  const packets=[];const r=createOfficeReporter({readConfig:()=>({version:1,sourceId:'347bd1b8-7ae4-46b8-bdd0-b6a193d165d6',token:'a'.repeat(64),url:'http://127.0.0.1:19474/api/ingest'}),
    schedule:()=>({unref(){}}),cancel(){},request:async(_url,options)=>{packets.push(JSON.parse(options.body));return new Response(JSON.stringify({missing:packets.length===1?['owner']:[]}),{status:202})}});
  r.publish({workerId:'owner',kind:'waiting',tokenTotal:10,orchestration:{role:'coordinator',runId:'old-run'}});
  r.publish({workerId:'owner',kind:'status',summary:'Waiting for workers',tool:'⏳',tokenTotal:10,orchestration:{role:'coordinator',runId:'old-run'}});
  r.publish({workerId:'owner',kind:'waiting',tokenTotal:10,orchestration:{role:'coordinator',runId:'new-run'}});
  r.publish({workerId:'owner',kind:'usage',tokenTotal:125});
  await r.flush();await r.flush();
  assert.deepEqual(packets[1].events.map(e=>e.kind),['session_start','waiting','status']);
  assert.ok(packets[1].events.every(e=>e.tokenTotal===125&&e.orchestration.runId==='new-run'));
  await r.close();
});

test('burst observer batches fit the HTTP byte limit without dropping unsent events on acknowledgement',async()=>{
  const packets=[];const r=createOfficeReporter({readConfig:()=>({version:1,sourceId:'347bd1b8-7ae4-46b8-bdd0-b6a193d165d6',token:'a'.repeat(64),url:'http://127.0.0.1:19474/api/ingest'}),
    schedule:()=>({unref(){}}),cancel(){},request:async(_url,options)=>{assert.ok(Buffer.byteLength(options.body)<64*1024);packets.push(JSON.parse(options.body));return new Response('{}',{status:202})}});
  for(let i=0;i<100;i++)r.publish({workerId:'owner',kind:'tool_start',summary:'tool '+i,role:'r'.repeat(48),model:'m'.repeat(64),orchestration:{role:'executor',runId:'r'.repeat(120),taskId:'t'.repeat(120),dispatchId:'d'.repeat(120),issue:'https://github.com/owner/repository/issues/123'}});
  while(r.pending)await r.flush();
  assert.equal(packets.reduce((n,p)=>n+p.events.length,0),100);assert.ok(packets.length>1);
  await r.close();
});
