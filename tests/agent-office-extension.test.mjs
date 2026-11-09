import test from 'node:test';
import assert from 'node:assert/strict';
import activate, { createOfficeReporter, readOrcaCoordination, readOfficePlan } from '../runtime/omp/extensions/agent-office.mjs';
const context = (id, agent = { kind: 'main', id: 'Main', name: 'main' }) => ({ sessionManager: { getSessionId: () => id }, agent, model: { id: 'teck-executor' } });
function adapter(ctx, registered = []) {
  const handlers = new Map(), events = [];
  const reporter = { publish: e => events.push(e), close: async () => {} };
  activate({ on: (name, handler) => handlers.set(name, handler),getAllTools:()=>registered.map(name=>({name})) }, { reporter });
  return { events, run: (name, data = {}, c = ctx) => handlers.get(name)?.(data, c), handlers };
}

test('whiteboard recovers canonical branch goals/todos, ignores failed/view calls and redacts bounded text',()=>{
  const branch=[{type:'mode_change',mode:'goal',data:{goal:{id:'g-one',objective:'Ship preview',status:'active'}}},
    {type:'message',message:{role:'toolResult',toolName:'todo',details:{op:'init',phases:[{name:'Delivery',tasks:[{content:'Verify restore',status:'blocked',blocker:'password=unsafe'}]}]}}},
    {type:'message',message:{role:'toolResult',toolName:'todo',isError:true,details:{op:'init',phases:[]}}},
    {type:'message',message:{role:'toolResult',toolName:'todo',details:{op:'view',phases:[]}}},
    {type:'message',message:{role:'user',content:'PRIVATE PROMPT'}},
    {type:'message',message:{role:'toolResult',toolName:'bash',details:{phases:[]},content:'PRIVATE OUTPUT'}}];
  const ctx=context('plan-restore');ctx.sessionManager.getBranch=()=>branch;
  let plan=readOfficePlan(ctx);assert.equal(plan.goal.objective,'Ship preview');assert.equal(plan.phases[0].tasks[0].status,'blocked');
  assert.ok(!JSON.stringify(plan).includes('unsafe'));assert.ok(!JSON.stringify(plan).includes('PRIVATE'));
  branch.push({type:'custom',customType:'user_todo_edit',data:{phases:[]}});
  assert.deepEqual(readOfficePlan(ctx).phases,[],'human todo edits replace the previous canonical list');
  assert.equal(readOfficePlan(ctx,{id:'g-one',objective:'Ship preview',status:'complete'}).goal.status,'complete');
  branch.push({type:'mode_change',mode:'none'});assert.equal(readOfficePlan(ctx).goal,null);
});

test('live plans update without model turns, clear on session switches and observe idle todo edits',()=>{
  let branch=[];const timers=[],ctx=context('plan-live');ctx.sessionManager.getBranch=()=>branch;ctx.setTimeout=fn=>timers.push(fn);
  const a=adapter(ctx);a.run('session_start');timers.shift()();
  assert.deepEqual(a.events[0].plan,{goal:null,phases:[]});
  a.run('goal_updated',{goal:{id:'g-live',objective:'Review feature',status:'active'}});
  assert.equal(a.events.at(-1).kind,'plan');assert.equal(a.events.at(-1).plan.goal.status,'active');
  const before=a.events.length;a.run('goal_updated',{goal:{id:'g-live',objective:'Review feature',status:'active',tokensUsed:100}});
  assert.equal(a.events.length,before,'accounting-only changes are not a new plan');
  branch.push({type:'custom',customType:'user_todo_edit',data:{phases:[{name:'Verify',tasks:[{content:'Check tests',status:'in_progress'}]}]}});
  timers.shift()();assert.equal(a.events.at(-1).plan.phases[0].tasks[0].content,'Check tests');
  const switched=context('another-plan');switched.setTimeout=fn=>timers.push(fn);switched.sessionManager.getBranch=()=>[];
  a.run('session_switch',{},switched);while(timers.length&&a.events.at(-1)?.workerId===a.events[0].workerId)timers.shift()();
  assert.deepEqual(a.events.at(-1).plan,{goal:null,phases:[]});assert.notEqual(a.events.at(-1).workerId,a.events[0].workerId);
  assert.ok(!a.events.some(e=>['thinking','prompt','tool_start'].includes(e.kind)),'plan snapshots never fabricate execution');
});

test('an unresolved Dispatch is never announced as an office coordinator',()=>{
  const branch=[{type:'custom',customType:'teck-orca-contract',data:{version:1,role:'coordinator',presentationReady:false}}];
  const timers=[],ctx=context('pending-dispatch');ctx.sessionManager.getBranch=()=>branch;ctx.setTimeout=fn=>timers.push(fn);
  const a=adapter(ctx);a.run('session_start');timers.shift()();a.run('agent_start');assert.equal(a.events.length,0);
  branch.push({type:'custom',customType:'teck-orca-contract',data:{version:1,presentationReady:true,role:'executor',authority:{runId:'run-bound',taskId:'task-bound',dispatchId:'dispatch-bound'}}});
  timers.shift()();assert.equal(a.events.length,1);assert.equal(a.events[0].kind,'session_start');assert.equal(a.events[0].placement,'cloud');
  assert.equal(a.events[0].orchestration.dispatchId,'dispatch-bound');
});

test('a restarted office receives the latest native plan without changing cached activity',async()=>{
  const packets=[];let missing=false;
  const r=createOfficeReporter({readConfig:()=>({version:1,sourceId:'347bd1b8-7ae4-46b8-bdd0-b6a193d165d6',token:'a'.repeat(64),url:'http://127.0.0.1:19474/api/ingest'}),schedule:()=>({unref(){}}),cancel(){},request:async(_url,opts)=>{packets.push(JSON.parse(opts.body));return new Response(JSON.stringify({missing:missing?['one']:[]}),{status:202});}});
  r.publish({workerId:'one',kind:'session_start',plan:{goal:null,phases:[]}});
  r.publish({workerId:'one',kind:'waiting'});await r.flush();
  const plan={goal:{id:'g-last',objective:'Retained plan',status:'paused'},phases:[]};r.publish({workerId:'one',kind:'plan',plan});await r.flush();
  missing=true;await r.flush();missing=false;await r.flush();
  const restored=packets.at(-1).events;assert.deepEqual(restored.map(e=>e.kind),['session_start','waiting','plan']);assert.deepEqual(restored.at(-1).plan,plan);
  await r.close();
});
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
  assert.equal(helper.events.at(-1).kind, 'subagent_end');
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

test('finished helpers retire without being destroyed, ignore late callbacks and return once when reused',()=>{
  const parent=context('helper-retirement-parent',{kind:'main',id:'retire-parent',name:'main'}),main=adapter(parent);main.run('session_start');
  const timers=[],ctx=context('helper-retirement-child',{kind:'sub',id:'retire-child',parentId:'retire-parent',name:'scout'});ctx.setTimeout=fn=>timers.push(fn);
  const a=adapter(ctx);a.run('session_start');timers.shift()();const id=a.events[0].workerId;
  a.run('agent_end',{willContinue:false});assert.equal(a.events.at(-1).kind,'subagent_end');
  const n=a.events.length;for(const timer of timers.splice(0))timer();
  a.run('goal_updated',{goal:null});a.run('tool_execution_end',{toolCallId:'late',toolName:'read'});
  a.run('message_end',{message:{role:'assistant',timestamp:123,usage:{totalTokens:12}}});
  assert.equal(a.events.length,n,'idle refresh and late accounting cannot resurrect a finished helper');
  a.run('before_agent_start',{reason:'revive'});a.run('agent_start');
  const starts=a.events.filter(e=>e.kind==='subagent_start');assert.equal(starts.length,2);assert.equal(starts[1].workerId,id);assert.equal(starts[1].parentId,main.events[0].workerId);
  a.run('agent_end',{awaitingAsyncWork:true,willContinue:true});assert.equal(a.events.at(-1).kind,'waiting');assert.equal(a.events.at(-1).summary,'Awaiting helper work');
  a.run('agent_end',{willContinue:true});assert.equal(a.events.at(-1).summary,'Awaiting continuation');
  main.run('agent_end',{});assert.equal(main.events.at(-1).kind,'waiting','a coordinator waiting on its workers remains in the office');
});

test('a retired helper stops presence heartbeats and resumes them on a new start',async()=>{
  const timers=new Map(),packets=[];let seq=0;
  const r=createOfficeReporter({readConfig:()=>({version:1,sourceId:'347bd1b8-7ae4-46b8-bdd0-b6a193d165d6',token:'a'.repeat(64),url:'http://127.0.0.1:19474/api/ingest'}),schedule:fn=>{const t={id:++seq,fn,unref(){}};timers.set(t.id,t);return t},cancel:t=>timers.delete(t.id),request:async(_u,o)=>{packets.push(JSON.parse(o.body));return new Response('{}',{status:202})}});
  async function next(){const t=timers.values().next().value;assert.ok(t);timers.delete(t.id);t.fn();await r.flush();}
  r.publish({workerId:'helper',parentId:'parent',kind:'subagent_start'});await next();
  r.publish({workerId:'helper',parentId:'parent',kind:'subagent_end'});await next();
  assert.deepEqual(packets.at(-1).heartbeat,[]);assert.equal(timers.size,0);
  r.publish({workerId:'helper',parentId:'parent',kind:'subagent_start'});await next();assert.deepEqual(packets.at(-1).heartbeat,['helper']);await r.close();
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
  // OMP clears lifecycle-scoped refresh timers when switching sessions.
  timers.length = 0;
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
