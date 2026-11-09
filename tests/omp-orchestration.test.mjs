import assert from 'node:assert/strict';
import { test, after } from 'node:test';
import fs from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const routingTests=fs.mkdtempSync(join(tmpdir(),'teck-route-integration-'));after(()=>fs.rmSync(routingTests,{recursive:true,force:true}));
import { resolveRole, permittedTool, coordinationArgs, coordinationAction, assignment, dispatchLabels, canRenameWorkerTab } from '../runtime/omp/extensions/lib/orca-policy.mjs';
import activate from '../runtime/omp/extensions/orca-orchestration.mjs';
import { createPlanningScope } from '../runtime/omp/extensions/lib/github-plan-scope.mjs';

const roles = { default: 'gateway/lead', plan: 'gateway/lead', task: 'gateway/doer', slow: 'gateway/research', advisor: 'gateway/review' };
const models = { resolve: role => { const [provider, id] = (roles[role.replace('@', '')] ?? '').split('/'); return id ? { provider, id } : undefined; } };
let sessionSequence=0;
const officeTools=['office_status','office_peers','office_shout','office_celebrate','office_flip'];

test('all roles permit exactly the five Office presentation tools across supported MCP aliases',()=>{
  for(const role of ['coordinator','executor','planner','researcher','reviewer','publisher','unbound']){
    for(const tool of officeTools)for(const prefix of ['', 'agentoffice-', 'agentoffice/', 'agentoffice__', 'agentoffice_', 'agent-office-', 'agent_office/', 'mcp__agentoffice__'])
      assert.equal(permittedTool(role,prefix+tool,{}),true,role+': '+prefix+tool);
    for(const tool of ['office_shell','office_status_extra','office_status/exec','unrelated-office_status','agentoffice-exec','agentoffice-office_status/exec','github-office_flip'])
      assert.equal(permittedTool(role,tool,{}),false,role+': '+tool);
  }
});
test('roles follow existing OMP configuration, with ambiguous or unknown models restricted to coordination', () => {
  assert.equal(resolveRole({ provider: 'gateway', id: 'lead' }, models), 'coordinator');
  assert.equal(resolveRole({ provider: 'gateway', id: 'doer' }, models), 'executor');
  assert.equal(resolveRole({ provider: 'gateway', id: 'research' }, models), 'researcher');
  assert.equal(resolveRole({ provider: 'gateway', id: 'review' }, models), 'reviewer');
  assert.equal(resolveRole({ provider: 'unknown', id: 'model' }, models), 'coordinator');
  const overridden = { resolve: role => role === '@default' ? { provider: 'gateway', id: 'doer' } : models.resolve(role) };
  assert.equal(resolveRole({ provider: 'gateway', id: 'doer' }, overridden, 'executor'), 'executor');
  assert.equal(resolveRole({ provider: 'gateway', id: 'lead' }, models, 'executor'), 'coordinator');
});
test('direct coordinator tools cannot implement, inspect source or publish code', () => {
  for (const name of ['bash', 'edit', 'write', 'github', 'lsp', 'computer', 'manage_skill', 'github__push_files']) {
    assert.equal(permittedTool('coordinator', name, {}), false, name);
  }
  assert.equal(permittedTool('coordinator', 'read', { path: '/project/src/app.ts' }), false);
  assert.equal(permittedTool('coordinator', 'read', { path: 'https://github.com/org/repo/blob/main/app.ts' }), false);
  assert.equal(permittedTool('coordinator', 'github__get_file_contents', {}), false);
  assert.equal(permittedTool('coordinator', 'github__pull_request_read', { method: 'get_diff' }), false);
  assert.equal(permittedTool('coordinator', 'github__issue_write', { method: 'update' }), true);
  assert.equal(permittedTool('coordinator', 'github__pull_request_read', { method: 'get' }), true);
  assert.equal(permittedTool('coordinator', 'read', { path: 'skill://orca-workers' }), true);
  assert.equal(permittedTool('coordinator', 'read', { path: 'skill://orca-workers/../../secrets' }), false);
});
test('every role may delegate through native task/wait while arbitrary eval remains an editing capability', () => {
  for (const role of ['coordinator', 'planner', 'executor', 'reviewer', 'researcher', 'publisher']) {
    assert.equal(permittedTool(role, 'task', {}), true, role);
    assert.equal(permittedTool(role, 'eval', {}), role==='executor', role);
    assert.equal(permittedTool(role, 'wait', {}), true, role);
    assert.equal(permittedTool(role, 'read', { path: 'agent://0-Helper' }), true, role);
    assert.equal(permittedTool(role, 'write', { path: 'agent://0-Helper' }), true, role);
    assert.equal(permittedTool(role, 'github__merge_pull_request', {}), false);
  }
  assert.equal(permittedTool('reviewer', 'edit', {}), false);
  assert.equal(permittedTool('reviewer', 'bash', { command: 'npm test' }), false);
  assert.equal(permittedTool('reviewer', 'github__issue_write', {}), false);
  assert.equal(permittedTool('executor', 'edit', {}), true);
  assert.equal(permittedTool('executor', 'github__push_files', {}), false);
  assert.equal(permittedTool('publisher', 'github__push_files', {}), true);
  for (const name of ['github-update_pull_request_body', 'github-update_pull_request_title', 'github-update_pull_request_draft_state']) {
    assert.equal(permittedTool('publisher', name, {}), true, 'Support the configured App MCP\'s split PR metadata tools');
    assert.equal(permittedTool('coordinator', name, {}), false);
    assert.equal(permittedTool('executor', name, {}), false);
  }
  assert.equal(permittedTool('publisher', 'edit', {}), false);
});

test('read-only roles allow semantic navigation but never LSP or structural edits',()=>{
  for(const role of ['planner','researcher','reviewer','publisher']){
    for(const action of ['definition','references','hover','diagnostics','symbols'])assert.equal(permittedTool(role,'lsp',{action}),true,role+': '+action);
    for(const action of ['rename','rename_file','code_actions','format','apply_edit','reload'])assert.equal(permittedTool(role,'lsp',{action,apply:true}),false,role+': '+action);
    assert.equal(permittedTool(role,'lsp',{action:'definition',apply:true}),false);
    assert.equal(permittedTool(role,'ast_grep',{pat:'call($X)',path:'src'}),true);
    assert.equal(permittedTool(role,'ast_grep',{pat:'call($X)',rewrite:'other($X)'}),false);
    assert.equal(permittedTool(role,'ast_edit',{pat:'call($X)',rewrite:'other($X)'}),false);
  }
});

test('executor implementation requires a real implementation helper turn, not a task receipt',async()=>{
  const s=session('doer');const input={role:'executor',objective:'Implement assigned behavior',acceptance:['RED then GREEN'],constraints:'One scope'};
  s.setAssignment(input);await s.handlers.get('session_start')({},s.ctx);
  await s.handlers.get('before_agent_start')({systemPrompt:[],prompt:'Start'},s.ctx);createdGoal(s,input.objective);
  assert.equal(s.guard('read',{path:'/project/source'}),undefined);
  assert.equal(s.guard('task',{}),undefined);
  for(const name of ['edit','bash','debug','eval','ast_edit'])assert.equal(s.guard(name,{}).block,true,name);
  assert.equal(s.guard('lsp',{action:'rename',new_name:'Changed'}).block,true);
  assert.equal(s.guard('lsp',{action:'definition'}),undefined);
  await s.handlers.get('tool_result')({toolName:'task',isError:false,details:{accepted:true}});
  assert.equal(s.guard('edit',{}).block,true,'A receipt is not actual execution');
  await startImplementation(s,'scout');assert.equal(s.guard('edit',{}).block,true,'Read-only scouting is not implementation');
  const child=await startImplementation(s);
  assert.equal(child.guard('edit',{}),undefined,'The implementation helper need not recursively delegate');
  assert.equal(child.guard('debug',{}),undefined,'Scoped runtime verification stays available');
  assert.equal(s.guard('edit',{}),undefined);
  assert.equal(s.guard('goal',{op:'complete'}),undefined);
  assert.ok(s.branch.at(-1).data.delegation.helperId);
  const advisorCtx={...child.ctx,agent:{kind:'sub',id:'advisor',name:'advisor',parentId:child.ctx.agent.id}};
  for(const name of ['edit','bash','eval'])assert.equal(child.handlers.get('tool_call')({toolName:name,input:{}},advisorCtx).block,true,'Actual advising-session hooks: '+name);
  const nested=await startImplementation(child,'task');assert.equal(nested.guard('edit',{}),undefined);
  s.setAssignment(undefined);await s.handlers.get('before_agent_start')({systemPrompt:[],prompt:'Continue'},s.ctx);
  assert.equal(nested.guard('edit',{}).block,true,'Revocation reaches a grandchild even when its parent is idle');
  s.handlers.get('session_shutdown')({},s.ctx);
  assert.equal(nested.guard('edit',{}).block,true,'Removing the owning family must not turn a scoped grandchild into an unrestricted standalone helper');
});

test('review/advisor helpers inherit read-only scope through nested task delegation',async()=>{
  const lead=session('review');lead.setAssignment({role:'reviewer',objective:'Review stable snapshot',acceptance:['One verdict'],constraints:'Read-only'});
  await lead.handlers.get('session_start')({},lead.ctx);
  await lead.handlers.get('before_agent_start')({systemPrompt:[],prompt:'Review'},lead.ctx);createdGoal(lead,'Review stable snapshot');
  const helper=await startImplementation(lead,'correctness-reviewer');const nested=await startImplementation(helper,'task');
  for(const agent of [helper,nested]){
    assert.equal(agent.guard('read',{path:'/project/source'}),undefined);
    assert.equal(agent.guard('task',{}),undefined);
    for(const name of ['edit','write','bash','eval','debug','github__push_files'])assert.equal(agent.guard(name,{}).block,true,name);
  }
  const advisor=session('review');advisor.ctx.agent={kind:'sub',id:'advisor',name:'advisor',parentId:helper.ctx.agent.id};
  await advisor.handlers.get('session_start')({},advisor.ctx);
  await advisor.handlers.get('before_agent_start')({systemPrompt:[],prompt:'Advise'},advisor.ctx);
  assert.equal(advisor.guard('read',{path:'/project/source'}),undefined);
  assert.equal(advisor.guard('eval',{}).block,true);
  assert.ok(!advisor.branch.some(e=>e.customType==='teck-orca-contract'),'Advisors never claim the parent Dispatch');
});

test('every role can use native Hindsight memory without gaining arbitrary MCP or repository writes', () => {
  for (const role of ['coordinator', 'planner', 'executor', 'reviewer', 'researcher', 'publisher']) {
    for (const tool of ['recall', 'retain', 'reflect', 'learn']) assert.equal(permittedTool(role, tool), true, `${role}: ${tool}`);
    assert.equal(permittedTool(role, 'hindsight__delete_bank'), false);
  }
  assert.equal(permittedTool('coordinator', 'edit', {}), false);
  assert.equal(permittedTool('reviewer', 'write', { path: '/project/file' }), false);
});

test('planner supports the configured split issue APIs without giving researchers publication or planning writes', () => {
  const create = { owner: 'org', repo: 'repo', parent_issue_number: 123, title: 'Contract', body: 'Acceptance and tests' };
  assert.equal(permittedTool('coordinator', 'github-create_issue', create), true);
  assert.equal(permittedTool('planner', 'github-create_issue', create), true);
  assert.equal(permittedTool('planner', 'github-create_issue', { ...create, parent_issue_number: undefined }), false);
  for (const name of ['github-update_issue_body', 'github-update_issue_title', 'github-add_sub_issue', 'github-issue_dependency_write']) {
    assert.equal(permittedTool('planner', name, { method: 'add' }), true, name);
    assert.equal(permittedTool('researcher', name, { method: 'add' }), false, name);
  }
  for (const name of ['github-update_issue_state', 'github-update_issue_milestone', 'github-remove_sub_issue', 'github-push_files', 'github-create_pull_request', 'bash', 'edit']) {
    assert.equal(permittedTool('planner', name, {}), false, name);
  }
  assert.equal(permittedTool('planner', 'github-projects-manage_milestones', { action: 'create' }), false);
});
test('Orca transport accepts only explicit coordination verbs, never shell or agent-launch escape hatches', () => {
  assert.deepEqual(coordinationArgs(['orchestration', 'check', '--wait', '--timeout-ms', '15000'], 'coordinator'),
    ['orchestration', 'check', '--wait', '--timeout-ms', '15000', '--json']);
  for (const args of [['terminal', 'create', '--command', 'bash'], ['exec', '--command', 'rm'],
    ['orchestration', 'worker-start', '--spec', 'bypass'], ['orchestration', 'check', '--environment', 'host'],
    ['skills', 'get', 'orca-cli', '--output', '/project/overwrite']]) {
    assert.throws(() => coordinationArgs(args, 'coordinator'), /not permitted/);
  }
  assert.throws(() => coordinationArgs(['orchestration', 'task-create', '--spec', 'nested'], 'executor'), /not permitted/);
  assert.deepEqual(coordinationAction({ action: 'worktree_current' }, 'executor'), ['worktree', 'current', '--json']);
});
test('assignment transfers an explicit goal and acceptance boundary without inventing GitHub sub-issues', () => {
  const spec = assignment({ role: 'executor', objective: 'Implement #123 rotation', issue: 'https://github.com/org/repo/issues/123',
    acceptance: ['Rotated credentials connect', 'Previous credentials are rejected'], constraints: 'Do not publish or merge.' });
  assert.match(spec, /TECK_ORCA_ASSIGNMENT/);
  assert.match(spec, /goal/);
  assert.match(spec, /Rotated credentials connect/);
  assert.match(spec, /worker_done/);
  assert.throws(() => assignment({ role: 'executor', objective: 'vague', acceptance: [] }), /acceptance/);
});

function session(model = 'lead', branch = [], sendResult) {
  const handlers = new Map(), tools = new Map(), calls = [];
  let boundInput, pane = 'pane', pending = false, workerPages, runReceipt, placementRecord, workerReceipt, terminalList, labelAction, worktreeList, worktreePs;
  const timers = [], sent = [];
  let activeTools = ['bash', 'read', 'edit', 'eval', 'task', 'goal', 'todo', 'github__push_files', 'github__issue_write'];
  const schema = new Proxy(() => schema, { get: () => schema });
  const pi = { zod: schema, on: (name, fn) => handlers.set(name, fn), registerTool: tool => tools.set(tool.name, tool),
    getAllTools: () => ['bash', 'read', 'edit', 'eval', 'task', 'goal', 'todo', 'github__push_files', 'github__issue_write',
      'github/github-get_file_contents','github-projects/manage_project','web_search','lsp','debug','ast_edit',
      ...officeTools.map(n=>'agentoffice-'+n),'agentoffice-office_exec'].map(name => ({ name })),
    getActiveTools: () => [...activeTools],
    setActiveTools: async names => { activeTools = [...names]; calls.push({ active: names }); },
    sendUserMessage: text => { sent.push(text); pending = true; },
    appendEntry: (customType, data) => branch.push({ type: 'custom', customType, data }) };
  const ctx = { agent:{kind:'main',id:'main-'+(++sessionSequence),name:'main'},model: { provider: 'gateway', id: model }, models, sessionManager: { getBranch: () => branch },
    setTimeout: fn => timers.push(fn), isIdle: () => !pending, hasPendingMessages: () => pending };
  ctx.models = { resolve: role => role === '@default' ? ctx.model : models.resolve(role) };
  activate(pi, { issueWorktreeDirectory:join(routingTests,ctx.agent.id), environment: { ORCA_PANE_KEY: 'pane', ORCA_WORKTREE_ID: 'worktree' }, run: async args => {
    calls.push({ args });
    if (args[0] === 'terminal' && args[1] === 'list') return terminalList ?? {};
    if (args[0] === 'terminal' && ['rename','set-pane-title'].includes(args[1])) return labelAction?.(args) ?? { applied: true };
    if (args[0] === 'worktree' && args[1] === 'show') return placementRecord?.(args) ?? {worktree:args.includes('id:worktree')?{id:'worktree',branch:'feature',projectId:'project'}:{id:'child',branch:'child',projectId:'project',parentWorktreeId:'worktree'}};
    if (args[0] === 'worktree' && args[1] === 'list') return worktreeList ?? {worktrees:[],totalCount:0,truncated:false};
    if (args[0] === 'worktree' && args[1] === 'ps') return worktreePs ?? {worktrees:[],totalCount:0,truncated:false};
    if(['run-create','run-use'].includes(args[1]))return runReceipt??{run:{id:'run_created'}};
    // Orca 1.4.246's default JSON is a concise presentation, not the raw
    // identity-bearing records. Mirror that boundary rather than granting
    // fields which the production CLI never returned to these calls.
    if (args[1] === 'worker-list' && !args.includes('--full')) return { workers: boundInput ? [{
      dispatchId: 'ctx_456', taskId: 'task_123', state: 'ready', liveness: 'live', terminal: 'term_123' }] : [] };
    if (args[1] === 'worker-show' && !args.includes('--full')) return { dispatchId: 'ctx_456', state: 'ready', stage: 'input_accepted', terminal: 'term_123' };
    if (args[1] === 'worker-show' && workerReceipt) return workerReceipt;
    if (args[1] === 'task-list' && !args.includes('--full')) return { tasks: [{ id: 'task_123', status: 'dispatched', title: 'Worker task' }] };
    if (args[1] === 'worker-list' && workerPages) return workerPages(args);
    if (args[1] === 'worker-list') return { workers: boundInput ? [{ dispatchId: 'ctx_456', taskId: 'task_123', runId: 'run_123',
      dispatchStatus: 'dispatched', agentTerminalHandle: 'term_123', resource: { worktreeId: 'worktree' } }] : [], page:{hasMore:false} };
    if (args[1] === 'worker-show') return { dispatch: { assigneePaneKey: pane, assigneeHandle: 'term_123', status: 'dispatched', processIncarnation: 'pty:incarnation' },
      terminal: { ptyId: 'pty', incarnationId: 'incarnation' }, observation: { exactWorker: true, status: 'live' } };
    if (args[1] === 'task-list') return { tasks: [{ id: 'task_123', dispatch_id: 'ctx_456', assignee_handle: 'term_123', spec: assignment(boundInput) }] };
    if (args[1] === 'send' && sendResult) return sendResult(args);
    return { dispatchId: 'ctx_test' };
  } });
  return { pi, ctx, branch, calls, tools, handlers, timers, sent, setPane: value => { pane = value; }, setAssignment: value => { boundInput = value; },
    setWorkerPages: value => { workerPages = value; },
    setPlacementRecord: value => { placementRecord = value; },
    setWorkerReceipt: value => { workerReceipt = value; },
    setTerminalList: value => { terminalList = value; },
    setLabelAction: value => { labelAction = value; },
    setWorktreeList:value=>{worktreeList=value},setWorktreePs:value=>{worktreePs=value},
    setRunReceipt:value=>{runReceipt=value},
    guard: (toolName, input = {}) => handlers.get('tool_call')({ toolName, input },ctx) };
}
async function startImplementation(parent,name='implementation-worker') {
  const child=session('doer');
  child.ctx.agent={kind:'sub',id:'helper-'+(++sessionSequence),parentId:parent.ctx.agent.id,name,depth:1};
  await child.handlers.get('session_start')({},child.ctx);
  await child.handlers.get('before_agent_start')({systemPrompt:[],prompt:'Implement assigned scope'},child.ctx);
  return child;
}
function createdGoal(s, objective) {
  const goal = { id: 'native-goal-123', status: 'active', objective };
  s.handlers.get('goal_updated')({ goal });
  s.handlers.get('tool_result')({ toolName: 'goal', isError: false, details: { op: 'create', goal } });
  return goal;
}

test('Office tools are visible and callable before goals and while waiting, without widening execution rights',async()=>{
  for(const role of ['coordinator','executor','planner','researcher','reviewer','publisher','unbound']){
    const s=session('lead',[{type:'custom',customType:'teck-orca-contract',data:{version:1,role,launchRole:role}}]);
    await s.handlers.get('session_start')({},s.ctx);
    for(const tool of officeTools){
      assert.ok(s.pi.getActiveTools().includes('agentoffice-'+tool),role+': advertised Office tool');
      assert.equal(s.guard('agentoffice-'+tool,{text:'Waiting for workers'}),undefined);
      assert.equal(s.guard('write',{path:'xd://agentoffice-'+tool,content:JSON.stringify({text:'Waiting for workers'})}),undefined);
    }
    assert.equal(s.pi.getActiveTools().includes('agentoffice-office_exec'),false);
    assert.equal(s.guard('agentoffice-office_exec',{}).block,true);
    assert.equal(s.guard('write',{path:'xd://agentoffice-office_exec',content:'{}'}).block,true);
    s.handlers.get('goal_updated')({goal:{id:'goal',status:'complete',objective:'Done'}});
    assert.equal(s.guard('agentoffice-office_status',{text:'Waiting for verification'}),undefined);
    assert.equal(s.guard('edit',{path:'/project/source'}).block,true);
  }
});

test('native reviewers and advisors retain Office tools without acquiring edits or parent lifecycle rights',async()=>{
  const parent=session('review');const input={role:'reviewer',objective:'Review snapshot',acceptance:['Verdict'],constraints:'Read only'};
  await parent.handlers.get('session_start')({},parent.ctx);parent.setAssignment(input);
  await parent.handlers.get('before_agent_start')({systemPrompt:[],prompt:'Review'},parent.ctx);createdGoal(parent,input.objective);
  const child=await startImplementation(parent,'correctness-reviewer');
  for(const tool of officeTools){assert.ok(child.pi.getActiveTools().includes('agentoffice-'+tool));assert.equal(child.guard('agentoffice-'+tool,{}),undefined);}
  const advisor={...child.ctx,agent:{kind:'sub',id:'advisor',name:'advisor',parentId:child.ctx.agent.id}};
  assert.equal(child.handlers.get('tool_call')({toolName:'agentoffice-office_status',input:{text:'Checking evidence'}},advisor),undefined);
  for(const tool of ['edit','bash','eval','orca_dispatch'])assert.equal(child.guard(tool,{}).block,true);
  const prompt=await child.handlers.get('before_agent_start')({systemPrompt:[],prompt:'Review'},child.ctx);
  assert.match(prompt.systemPrompt.join('\n'),/skill:\/\/agent-office/);
});
test('loaded extension requires an active native goal, dispatches configured role, and cannot promote coordinator through a prompt', async () => {
  const s = session();
  await s.handlers.get('session_start')({}, s.ctx);
  assert.equal(s.guard('orca_dispatch', {}).block, true);
  assert.equal(s.guard('edit', {}).block, true);
  s.handlers.get('goal_updated')({ goal: { status: 'active', objective: 'Deliver milestone' } });
  const input = { role: 'executor', workspace_key:'implement-123', objective: 'Implement #123', acceptance: ['Tests pass'], constraints: 'No publication', worktree: 'new-child', name: 'issue-123' };
  await s.handlers.get('before_agent_start')({ prompt: assignment(input), systemPrompt: [] }, s.ctx);
  assert.equal(s.guard('edit', {}).block, true, 'A copied worker marker cannot grant coordinator editing rights');
  assert.equal(s.pi.getActiveTools().includes('eval'),false,'A blocked unrestricted tool must not be advertised to the coordinator');
  await s.tools.get('orca').execute('bind',{action:'run_create',objective:'Delivery'},undefined,undefined,s.ctx);
  await s.tools.get('orca_dispatch').execute('test', input, undefined, undefined, s.ctx);
  assert.ok(s.calls.some(call => call.args?.includes('gateway/doer')));
  assert.ok(s.calls.some(call => call.args?.includes('new-child')));
  assert.equal(s.handlers.has('before_subagent_spawn'), false, 'No blanket native spawn veto is registered');
});

test('coordinator metadata follows successful Run creation/use and never accepts a failed switch',async()=>{
  const s=session();await s.handlers.get('session_start')({},s.ctx);
  await s.tools.get('orca').execute('create',{action:'run_create',objective:'Delivery'},undefined,undefined,s.ctx);
  assert.equal(s.branch.at(-1).data.coordinatorRunId,'run_created');
  s.setRunReceipt({bound:true});
  await s.tools.get('orca').execute('use',{action:'run_use',id:'run_other'},undefined,undefined,s.ctx);
  assert.equal(s.branch.at(-1).data.coordinatorRunId,'run_other');
  s.setRunReceipt({ok:false,error:{message:'No binding'}});
  await s.tools.get('orca').execute('failed',{action:'run_use',id:'run_failed'},undefined,undefined,s.ctx);
  assert.equal(s.branch.at(-1).data.coordinatorRunId,'run_other');
});

test('dispatch labels include role, issue and readable scope with bounded safe worktree names',()=>{
  const labels=dispatchLabels({role:'executor',issue:'https://github.com/Teck-Lab/Teck.Monorepo/issues/906',objective:'Verify Billing finalize\nPRIVATE SECOND LINE'},'1234abcd');
  assert.equal(labels.title,'#906 · Executor · Verify Billing finalize');
  assert.equal(labels.name,'issue-906-executor-verify-billing-finalize-1234abcd');
  const custom=dispatchLabels({role:'reviewer',objective:'Long goal',title:'Security review',name:'custom-review'},'1234abcd');
  assert.equal(custom.title,'Reviewer · Security review');assert.equal(custom.name,'custom-review');
  const generic=dispatchLabels({role:'executor',name:'worker-task_123',objective:'Fix tenant lookup'},'1234abcd');
  assert.equal(generic.name,'executor-fix-tenant-lookup-1234abcd');
  const long=dispatchLabels({role:'researcher',title:'測試 \u001b\u202e'+('å'.repeat(250)),objective:'Investigate'},'1234abcd');
  assert.ok([...long.title].length<=80);assert.ok(long.name.length<=64);
  assert.ok(!/[\u001b\u202e]/.test(long.title));assert.match(long.name,/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
});

test('tab naming preserves custom names and refuses split, truncated or mismatched topology',()=>{
  const list={terminals:[{handle:'term_worker',worktreeId:'child',tabId:'tab-worker'}],totalCount:1,truncated:false,
    visualLayouts:[{worktreeId:'child',root:{type:'group',tabs:[{tabId:'tab-worker',title:'worker-task_123',panes:{type:'terminal',handle:'term_worker'}}]}}]};
  assert.equal(canRenameWorkerTab(list,'term_worker','child'),true);
  assert.equal(canRenameWorkerTab({...list,truncated:true},'term_worker','child'),false);
  assert.equal(canRenameWorkerTab({...list,totalCount:2},'term_worker','child'),false);
  assert.equal(canRenameWorkerTab(list,'term_other','child'),false);
  assert.equal(canRenameWorkerTab(list,'term_worker','other'),false);
  list.visualLayouts[0].root.tabs[0].title='My chosen tab name';
  assert.equal(canRenameWorkerTab(list,'term_worker','child'),false);
  list.visualLayouts[0].root.tabs[0].title='worker-task_123';
  list.visualLayouts[0].root.tabs[0].panes={type:'pane-split',first:{type:'terminal',handle:'term_worker'},second:{type:'terminal',handle:'term_other'}};
  assert.equal(canRenameWorkerTab(list,'term_worker','child'),false);
});

test('dispatch names new worktrees and labels only the verified worker pane and its unshared generic tab',async()=>{
  const s=session();await s.handlers.get('session_start')({},s.ctx);createdGoal(s,'Delivery');
  s.setWorkerReceipt({dispatch:{id:'ctx_test',assigneeHandle:'term_worker',status:'dispatched'},terminal:{handle:'term_worker',worktreeId:'child'},observation:{exactWorker:true,status:'live'}});
  const terminal={handle:'term_worker',worktreeId:'child',tabId:'tab-worker',leafId:'leaf-worker'};
  s.setTerminalList({terminals:[terminal],totalCount:1,truncated:false,visualLayouts:[{worktreeId:'child',root:{type:'group',tabs:[{tabId:'tab-worker',title:'worker-task_123',panes:{type:'terminal',handle:'term_worker'}}]}}]});
  await s.tools.get('orca').execute('bind',{action:'run_create',objective:'Delivery'},undefined,undefined,s.ctx);
  const result=await s.tools.get('orca_dispatch').execute('named',{role:'executor',issue:'https://github.com/Teck-Lab/Teck.Monorepo/issues/906',objective:'Verify Billing finalize',acceptance:['Tests pass'],constraints:'No publication'},undefined,undefined,s.ctx);
  const start=s.calls.find(c=>c.args?.[1]==='worker-start').args;
  assert.equal(start[start.indexOf('--task-title')+1],'#906 · Executor · Verify Billing finalize');
  assert.equal(start[start.indexOf('--display-name')+1],'#906 · Executor · Verify Billing finalize');
  assert.match(start[start.indexOf('--name')+1],/^issue-906-executor-verify-billing-finalize-[a-f0-9]{8}$/);
  const actions=s.calls.filter(c=>c.args?.[0]==='terminal'&&['rename','set-pane-title'].includes(c.args[1]));
  assert.equal(actions.length,2);assert.ok(actions.every(c=>c.args.includes('term_worker')&&c.args.includes('#906 · Executor · Verify Billing finalize')));
  assert.equal(result.details.dispatchId,'ctx_test');assert.equal(result.details.naming.pane,'updated');
  s.setLabelAction(args=>{if(args[1]==='set-pane-title')throw Error('No desktop');return{applied:true}});
  const headless=await s.tools.get('orca_dispatch').execute('headless',{role:'executor',workspace_key:'headless',objective:'Headless labels',acceptance:['Tests pass'],constraints:'No publication'},undefined,undefined,s.ctx);
  assert.equal(headless.details.naming.tab,'updated');assert.equal(headless.details.naming.pane,'unavailable');
  assert.equal(headless.details.dispatchId,'ctx_test');assert.equal(headless.isError,undefined);
});

test('existing snapshot dispatches do not receive creation flags; split tabs and naming failures preserve the dispatch',async()=>{
  const s=session();await s.handlers.get('session_start')({},s.ctx);createdGoal(s,'Review');
  s.setWorkerReceipt({dispatch:{id:'ctx_test',assigneeHandle:'term_worker',status:'dispatched'},terminal:{handle:'term_worker',worktreeId:'reviewed'},observation:{exactWorker:true,status:'live'}});
  s.setTerminalList({terminals:[{handle:'term_worker',worktreeId:'reviewed',tabId:'shared'},{handle:'term_coordinator',worktreeId:'reviewed',tabId:'shared'}],totalCount:2,truncated:false});
  const input={role:'reviewer',objective:'Review accepted snapshot',name:'would-be-invalid-creation-flag',worktree:'id:reviewed',acceptance:['One verdict'],constraints:'Read only'};
  const result=await s.tools.get('orca_dispatch').execute('review',input,undefined,undefined,s.ctx);
  const start=s.calls.find(c=>c.args?.[1]==='worker-start').args;
  assert.ok(!start.includes('--name'));assert.ok(!start.includes('--display-name'));
  assert.equal(s.calls.filter(c=>c.args?.[0]==='terminal'&&c.args[1]==='rename').length,0);
  assert.equal(result.details.dispatchId,'ctx_test');
  s.setLabelAction(()=>{throw Error('Desktop window unavailable')});
  const failedLabel=await s.tools.get('orca_dispatch').execute('review2',input,undefined,undefined,s.ctx);
  assert.equal(failedLabel.details.dispatchId,'ctx_test');assert.equal(failedLabel.isError,undefined);
  assert.equal(failedLabel.details.naming.pane,'unavailable');
  s.setWorkerReceipt({dispatch:{id:'ctx_test',assigneeHandle:'term_coordinator',status:'dispatched'},terminal:{handle:'term_coordinator',worktreeId:'reviewed'},observation:{exactWorker:false,status:'live'}});
  const before=s.calls.filter(c=>c.args?.[0]==='terminal').length;
  await s.tools.get('orca_dispatch').execute('unverified',input,undefined,undefined,s.ctx);
  assert.equal(s.calls.filter(c=>c.args?.[0]==='terminal').length,before);
});

test('new executor dispatches default to a child and reject shared-checkout selectors before launching',async()=>{
  const s=session();await s.handlers.get('session_start')({},s.ctx);
  createdGoal(s,'Isolated delivery');
  const input={role:'executor',objective:'Implement acceptance',acceptance:['Tests pass'],constraints:'No publication'};
  const dispatch=s.tools.get('orca_dispatch');
  for(const worktree of ['current','active','new-top-level','id:worktree','branch:feature']){
    await assert.rejects(dispatch.execute('bad',{...input,worktree},undefined,undefined,s.ctx),/child|reuse/i);
  }
  await assert.rejects(dispatch.execute('bad',{...input,worktree:'new-child',terminal:'term_shared'},undefined,undefined,s.ctx),/reuse|terminal/i);
  assert.equal(s.calls.filter(c=>c.args?.[1]==='worker-start').length,0);
  await assert.rejects(dispatch.execute('unkeyed',input,undefined,undefined,s.ctx),/issue URL or stable workspace_key/);
  await s.tools.get('orca').execute('bind',{action:'run_create',objective:'Delivery'},undefined,undefined,s.ctx);
  await dispatch.execute('default',{...input,workspace_key:'acceptance'},undefined,undefined,s.ctx);
  const start=s.calls.find(c=>c.args?.[1]==='worker-start').args;
  assert.equal(start[start.indexOf('--worktree')+1],'new-child');
  assert.equal(s.guard('write',{path:'xd://orca_dispatch',content:JSON.stringify({...input,worktree:'current'})}).block,true);
});

test('managed dispatch reopens a released issue child without any new-worktree flags',async()=>{
  const s=session();await s.handlers.get('session_start')({},s.ctx);createdGoal(s,'Follow-up');
  await s.tools.get('orca').execute('bind',{action:'run_create',objective:'Delivery'},undefined,undefined,s.ctx);
  s.setWorktreeList({worktrees:[{id:'child',parentWorktreeId:'worktree',path:'/work/issue-906-executor-previous'}],totalCount:1,truncated:false});
  s.setWorktreePs({worktrees:[{worktreeId:'child',liveTerminalCount:0,unverifiableTerminalCount:0}],totalCount:1,truncated:false});
  s.setWorkerReceipt({dispatch:{id:'ctx_test',assigneeHandle:'term_worker',status:'dispatched'},terminal:{handle:'term_worker',worktreeId:'child'},observation:{exactWorker:true,status:'live'}});
  const result=await s.tools.get('orca_dispatch').execute('followup',{role:'executor',issue:'https://github.com/Teck-Lab/Teck.Monorepo/issues/906',worktree:'new-child',objective:'Fix review findings',acceptance:['Accepted'],constraints:'Existing scope'},undefined,undefined,s.ctx);
  const start=s.calls.find(c=>c.args?.[1]==='worker-start').args;
  assert.equal(start[start.indexOf('--worktree')+1],'id:child');assert.equal(start.includes('--terminal'),false);assert.ok(start.includes('--agent'));assert.equal(start.includes('--name'),false);assert.equal(start.includes('--display-name'),false);
  const spec=JSON.parse(start[start.indexOf('--spec')+1].split('\n')[0].slice('TECK_ORCA_ASSIGNMENT '.length));assert.equal(spec.worktree,'id:child');assert.equal(spec.issue,'https://github.com/Teck-Lab/Teck.Monorepo/issues/906');assert.equal(result.details.dispatchId,'ctx_test');
});

test('executor reuse needs its own settled terminal in a distinct direct child, with no other active dispatch',async()=>{
  const s=session();await s.handlers.get('session_start')({},s.ctx);createdGoal(s,'Follow-up');
  s.setRunReceipt({run:{id:'run_own'}});
  await s.tools.get('orca').execute('bind',{action:'run_use',id:'run_own'},undefined,undefined,s.ctx);
  const parent={id:'worktree',branch:'refs/heads/feature',projectId:'project'};
  let child={id:'child',parentWorktreeId:'worktree',branch:'refs/heads/child',projectId:'project'};
  const row={dispatchId:'ctx_owned',runId:'run_own',dispatchStatus:'completed',agentTerminalHandle:'term_child',terminalState:'reclaimable',
    resource:{worktreeId:'child',terminalHandle:'term_child',ownershipState:'owned',ownerDispatchId:'ctx_owned',releaseState:'not_requested'}};
  let rows=[row];
  s.setPlacementRecord(args=>({worktree:args[args.indexOf('--worktree')+1]==='id:worktree'?parent:child}));
  s.setWorkerPages(()=>({workers:rows,page:{hasMore:false,nextCursor:null}}));
  const input={role:'executor',objective:'Fix acceptance',acceptance:['Tests pass'],constraints:'No publication',worktree:'id:child',terminal:'term_child'};
  const dispatch=s.tools.get('orca_dispatch');
  for(const change of [{parentWorktreeId:'other'},{branch:parent.branch},{id:'other'},{projectId:'other'}]){
    child={id:'child',parentWorktreeId:'worktree',branch:'refs/heads/child',projectId:'project',...change};
    await assert.rejects(dispatch.execute('bad',input,undefined,undefined,s.ctx),/child|parent|branch|project|identity/i);
  }
  child={id:'child',parentWorktreeId:'worktree',branch:'refs/heads/child',projectId:'project'};
  for(const change of [{dispatchStatus:'dispatched'},{runId:'run_other'},{terminalState:'released'},
    {resource:{...row.resource,ownershipState:'released'}},{resource:{...row.resource,ownerDispatchId:'ctx_other'}}]){
    rows=[{...row,...change}];await assert.rejects(dispatch.execute('bad',input,undefined,undefined,s.ctx),/reuse|owned|settled|active/i);
  }
  rows=[row,{...row,dispatchId:'ctx_other',dispatchStatus:'dispatched',agentTerminalHandle:'term_other'}];
  await assert.rejects(dispatch.execute('bad',input,undefined,undefined,s.ctx),/active|checkout|reuse/i);
  rows=[row];
  await assert.rejects(dispatch.execute('bad',{...input,run:'run_other'},undefined,undefined,s.ctx),/run/i);
  assert.equal(s.calls.filter(c=>c.args?.[1]==='worker-start').length,0);
  await dispatch.execute('valid',input,undefined,undefined,s.ctx);
  const start=s.calls.find(c=>c.args?.[1]==='worker-start').args;
  assert.equal(start[start.indexOf('--worktree')+1],'id:child');
  assert.equal(start[start.indexOf('--terminal')+1],'term_child');
  assert.ok(s.calls.some(c=>c.args?.[1]==='worker-list'&&c.args.includes('--full')&&c.args.includes('run_own')));
});

test('read-only review placement remains explicit and can target the existing integrated checkout',async()=>{
  const s=session();await s.handlers.get('session_start')({},s.ctx);createdGoal(s,'Review accepted snapshot');
  await s.tools.get('orca_dispatch').execute('review',{role:'reviewer',objective:'Review snapshot',acceptance:['One verdict'],constraints:'Read only',worktree:'id:integrated'},undefined,undefined,s.ctx);
  const start=s.calls.find(c=>c.args?.[1]==='worker-start').args;
  assert.equal(start[start.indexOf('--worktree')+1],'id:integrated');
});

test('child reuse reads every inventory page and refuses incomplete or ambiguous terminal ownership',async()=>{
  const s=session();await s.handlers.get('session_start')({},s.ctx);createdGoal(s,'Follow-up');
  s.setRunReceipt({run:{id:'run_own'}});
  await s.tools.get('orca').execute('bind',{action:'run_use',id:'run_own'},undefined,undefined,s.ctx);
  s.setPlacementRecord(args=>({worktree:args.includes('id:worktree')?
    {id:'worktree',projectId:'project',branch:'feature'}:{id:'child',parentWorktreeId:'worktree',projectId:'project',branch:'child'}}));
  const row={dispatchId:'ctx_owned',runId:'run_own',dispatchStatus:'completed',agentTerminalHandle:'term_child',terminalState:'reclaimable',
    resource:{worktreeId:'child',terminalHandle:'term_child',ownershipState:'owned',ownerDispatchId:'ctx_owned',releaseState:'not_requested'}};
  const input={role:'executor',objective:'Follow-up',acceptance:['Accepted'],constraints:'No publication',worktree:'id:child',terminal:'term_child'};
  let other={...row,dispatchId:'ctx_busy',dispatchStatus:'dispatched',agentTerminalHandle:'term_other'};
  s.setWorkerPages(args=>args.includes('--cursor')?{workers:[other],page:{hasMore:false,nextCursor:null}}:
    {workers:[row],page:{hasMore:true,nextCursor:'page-two'}});
  await assert.rejects(s.tools.get('orca_dispatch').execute('busy',input,undefined,undefined,s.ctx),/active/i);
  other={...other,dispatchStatus:'completed'};
  await assert.rejects(s.tools.get('orca_dispatch').execute('ambiguous',input,undefined,undefined,s.ctx),/multiple|foreign/i);
  s.setWorkerPages(()=>({workers:[row],page:{hasMore:true,nextCursor:null}}));
  await assert.rejects(s.tools.get('orca_dispatch').execute('partial',input,undefined,undefined,s.ctx),/incomplete/i);
  s.setWorkerPages(()=>({workers:[row],page:{hasMore:true,nextCursor:'same-cursor'}}));
  await assert.rejects(s.tools.get('orca_dispatch').execute('loop',input,undefined,undefined,s.ctx),/cursor/i);
  assert.equal(s.calls.filter(c=>c.args?.[1]==='worker-start').length,0);
});

test('simultaneous child-terminal reuse is serialized and failed metadata reads release the guard',async()=>{
  const s=session();await s.handlers.get('session_start')({},s.ctx);createdGoal(s,'Follow-up');
  s.setRunReceipt({run:{id:'run_own'}});
  await s.tools.get('orca').execute('bind',{action:'run_use',id:'run_own'},undefined,undefined,s.ctx);
  const input={role:'executor',objective:'Follow-up',acceptance:['Accepted'],constraints:'No publication',worktree:'id:child',terminal:'term_child'};
  s.setPlacementRecord(()=>{throw Error('Metadata unavailable')});
  await assert.rejects(s.tools.get('orca_dispatch').execute('offline',input,undefined,undefined,s.ctx),/metadata/i);
  let release;const gate=new Promise(resolve=>{release=resolve});
  s.setPlacementRecord(async args=>{await gate;return{worktree:args.includes('id:worktree')?
    {id:'worktree',projectId:'project',branch:'feature'}:{id:'child',parentWorktreeId:'worktree',projectId:'project',branch:'child'}}});
  s.setWorkerPages(()=>({workers:[{dispatchId:'ctx_owned',runId:'run_own',dispatchStatus:'completed',agentTerminalHandle:'term_child',terminalState:'reclaimable',
    resource:{worktreeId:'child',terminalHandle:'term_child',ownershipState:'owned',ownerDispatchId:'ctx_owned',releaseState:'not_requested'}}],page:{hasMore:false,nextCursor:null}}));
  const first=s.tools.get('orca_dispatch').execute('first',input,undefined,undefined,s.ctx);
  await assert.rejects(s.tools.get('orca_dispatch').execute('second',input,undefined,undefined,s.ctx),/in progress/i);
  release();await first;
  assert.equal(s.calls.filter(c=>c.args?.[1]==='worker-start').length,1);
});

test('OMP XDev transport preserves registered-tool role/lifecycle checks without granting file or arbitrary bridge writes',async()=>{
  const lead=session();await lead.handlers.get('session_start')({},lead.ctx);
  assert.equal(lead.guard('read',{path:'xd://orca'}),undefined);
  assert.equal(lead.guard('read',{path:'xd://'}),undefined);
  assert.equal(lead.guard('read',{path:'xd://eval/tool-discovery'}),undefined,'Native tool documentation topics are metadata only');
  assert.equal(lead.guard('read',{path:'xd://eval/../other'}).block,true);
  assert.equal(lead.guard('write',{path:'xd://eval/tool-discovery',content:'{}'}).block,true,'Metadata topics never become invocation routes');
  assert.equal(lead.guard('write',{path:'xd://orca',content:JSON.stringify({action:'status'})}),undefined);
  assert.equal(lead.guard('write',{path:'xd://orca_dispatch',content:'{}'}).block,true,'Dispatch still requires a goal');
  assert.equal(lead.guard('write',{path:'xd://other',content:'{}'}).block,true);
  assert.equal(lead.guard('write',{path:'xd://orca',content:'[]'}).block,true);
  assert.equal(lead.guard('write',{path:'/project/file',content:'x'}).block,true);
  assert.equal(lead.guard('write',{path:'xd://eval',content:'{}'}).block,true);
  assert.equal(lead.guard('write',{path:'xd://github/github-get_file_contents',content:'{}'}).block,true,'Coordinator cannot inspect source through mounted MCP');
  lead.handlers.get('goal_updated')({goal:{status:'active',objective:'Delivery'}});
  assert.equal(lead.guard('write',{path:'xd://github-projects/manage_project',content:JSON.stringify({action:'list'})}),undefined);
  const reviewer=session('review');reviewer.setAssignment({role:'reviewer',objective:'Review',acceptance:['Verdict'],constraints:'Read-only'});
  await reviewer.handlers.get('session_start')({},reviewer.ctx);await reviewer.handlers.get('before_agent_start')({systemPrompt:[],prompt:'Review'},reviewer.ctx);
  createdGoal(reviewer,'Review');
  assert.equal(reviewer.guard('write',{path:'xd://orca',content:JSON.stringify({action:'report',outcome:'succeeded',subject:'Review complete',body:'Verdict and evidence'})}),undefined);
  assert.equal(reviewer.guard('write',{path:'xd://orca',content:JSON.stringify({action:'run_create',objective:'nested'})}).block,true);
  assert.equal(reviewer.guard('write',{path:'xd://github/github-get_file_contents',content:'{}'}),undefined);
  assert.equal(reviewer.guard('write',{path:'xd://github__push_files',content:'{}'}).block,true);
  assert.equal(reviewer.guard('write',{path:'xd://github-projects/manage_project',content:JSON.stringify({action:'create'})}).block,true);
  assert.equal(reviewer.guard('write',{path:'xd://lsp',content:JSON.stringify({action:'definition'})}),undefined);
  assert.equal(reviewer.guard('write',{path:'xd://lsp',content:JSON.stringify({action:'rename',apply:true})}).block,true);
  const helper=await startImplementation(reviewer,'correctness-reviewer');
  assert.equal(helper.guard('write',{path:'xd://orca',content:JSON.stringify({action:'report',outcome:'succeeded'})}).block,true,'A helper cannot claim the parent lifecycle through XDev');
  const publisher=session('doer');publisher.setAssignment({role:'publisher',objective:'Publish',acceptance:['Published'],constraints:'App MCP only'});
  await publisher.handlers.get('session_start')({},publisher.ctx);await publisher.handlers.get('before_agent_start')({systemPrompt:[],prompt:'Publish'},publisher.ctx);createdGoal(publisher,'Publish');
  assert.equal(publisher.guard('write',{path:'xd://github__push_files',content:JSON.stringify({files:[{path:'large.mjs',content:'x'.repeat(70000)}]})}),undefined,'Mounted App publication preserves payload sizes accepted by the underlying tool');
});

test('mounted goal revisions preserve outer transport and bind only the matching tracked result',async()=>{
  const s=session('doer');const objective='Exact delegated objective';
  s.setAssignment({role:'executor',objective,acceptance:['Verified'],constraints:'Scope'});
  await s.handlers.get('session_start')({},s.ctx);await s.handlers.get('before_agent_start')({systemPrompt:[],prompt:'Start'},s.ctx);
  const input={path:'xd://goal',content:JSON.stringify({op:'create',objective:'Wrong',token_budget:99})};
  const revised=s.handlers.get('tool_call')({toolName:'write',toolCallId:'mounted-goal',input},s.ctx);
  assert.equal(revised.input.path,input.path);assert.equal(JSON.parse(revised.input.content).objective,objective);
  assert.equal(Object.hasOwn(JSON.parse(revised.input.content),'token_budget'),false);
  const goal={id:'mounted-native-goal',status:'active',objective};s.handlers.get('goal_updated')({goal});
  await s.handlers.get('tool_result')({toolName:'write',toolCallId:'untracked',details:{xdev:{tool:'goal',inner:{op:'create',goal}}}},s.ctx);
  assert.equal(s.guard('task',{}).block,true,'Untracked details cannot mint goal binding');
  await s.handlers.get('tool_result')({toolName:'write',toolCallId:'mounted-goal',isError:true,details:{xdev:{tool:'goal',inner:{op:'create',goal}}}},s.ctx);
  assert.equal(s.guard('task',{}).block,true,'Mounted failures preserve the inner error boundary');
  s.handlers.get('tool_call')({toolName:'write',toolCallId:'mounted-goal',input},s.ctx);
  await s.handlers.get('tool_result')({toolName:'write',toolCallId:'mounted-goal',details:{xdev:{tool:'goal',inner:{op:'create',goal}}}},s.ctx);
  assert.equal(s.guard('task',{}),undefined);await startImplementation(s);assert.equal(s.guard('edit',{}),undefined);
});

test('staged reports preserve mounted goal metadata when adding settlement evidence',async()=>{
  const s=session('review',[],()=>({accepted:true,submitted:true}));
  s.setAssignment({role:'reviewer',objective:'Review',acceptance:['Verdict'],constraints:'Read-only'});
  await s.handlers.get('session_start')({},s.ctx);await s.handlers.get('before_agent_start')({systemPrompt:[],prompt:'Review'},s.ctx);
  const goal=createdGoal(s,'Review');
  await s.tools.get('orca').execute('stage',{action:'report',outcome:'succeeded',subject:'Approved',body:'Evidence'});
  const input={path:'xd://goal',content:JSON.stringify({op:'complete'})};
  assert.equal(s.handlers.get('tool_call')({toolName:'write',toolCallId:'mounted-complete',input},s.ctx),undefined);
  const completed={...goal,status:'complete'};s.handlers.get('goal_updated')({goal:completed});
  const result=await s.handlers.get('tool_result')({toolName:'write',toolCallId:'mounted-complete',content:[],details:{xdev:{tool:'goal',mode:'execute',inner:{op:'complete',goal:completed}}}},s.ctx);
  assert.equal(result.details.xdev.tool,'goal');assert.equal(result.details.xdev.mode,'execute');
  assert.equal(result.details.xdev.inner.goal.id,goal.id);assert.ok(result.details.xdev.inner.orchestrationReport);
});

test('native helpers retain OMP tools and lifecycle rather than acquiring their parent Orca assignment', async () => {
  const s = session('doer');
  s.ctx.agent = { kind: 'sub', id: '0-helper', name: 'task', depth: 1, parentId: 'Main' };
  s.setAssignment({ role: 'executor', objective: 'Parent assignment', acceptance: ['Verified'], constraints: 'Scope' });
  await s.handlers.get('session_start')({}, s.ctx);
  const result = await s.handlers.get('before_agent_start')({ prompt: 'Help parent', systemPrompt: ['Native OMP task brief'] }, s.ctx);
  assert.ok(s.pi.getActiveTools().includes('task'));
  assert.ok(s.pi.getActiveTools().includes('eval'));
  assert.ok(s.pi.getActiveTools().includes('edit'), 'OMP agent preset owns native helper tools');
  assert.equal(s.guard('edit'), undefined);
  assert.equal(s.guard('goal', { op: 'create', objective: 'Native helper objective' }), undefined);
  assert.ok(!s.calls.some(c => c.args), 'Native helpers do not claim the parent pane Dispatch');
  assert.ok(!s.branch.some(e => e.customType === 'teck-orca-contract'));
  assert.match(result.systemPrompt.join('\n'), /native OMP helper/i);
  assert.doesNotMatch(result.systemPrompt.join('\n'), /Current fixed role|Assigned native goal/);
  await assert.rejects(s.tools.get('orca_dispatch').execute('nested', { role: 'executor', objective: 'Nested' }, undefined, undefined, s.ctx), /parent|owning session/i);
});

test('a verified planner writes only its issue subtree, learns created children and preserves scope on resume', async () => {
  const s = session('research');
  const input = { role: 'planner', issue: 'https://github.com/org/repo/issues/123', objective: 'Prepare the execution plan',
    acceptance: ['Existing children reused; dependencies read back'], constraints: 'Single plan writer; no implementation' };
  await s.handlers.get('session_start')({}, s.ctx);
  assert.equal(s.guard('github-create_issue', { owner: 'org', repo: 'repo', parent_issue_number: 123 }).block, true,
    'Sharing the researcher model does not confer planner authority');
  s.setAssignment(input);
  await s.handlers.get('before_agent_start')({ prompt: 'Plan the assigned issue', systemPrompt: [] }, s.ctx);
  const native = createdGoal(s, input.objective);
  const create = { owner: 'org', repo: 'repo', parent_issue_number: 123, title: 'Contract', body: 'Observable behavior' };
  assert.equal(s.guard('edit', {}).block, true);
  assert.equal(s.guard('github-create_issue', { ...create, repo: 'foreign' }).block, true);
  assert.equal(s.guard('github-create_issue', { ...create, parent_issue_number: 999 }).block, true);
  assert.equal(s.guard('github-update_issue_body', { owner: 'org', repo: 'repo', issue_number: 124 }).block, true);
  assert.equal(s.handlers.get('tool_call')({ toolName: 'github-create_issue', toolCallId: 'create-child', input: create }, s.ctx), undefined);
  await s.handlers.get('tool_result')({ toolName: 'github-create_issue', toolCallId: 'create-child', isError: false,
    content: [{ type: 'text', text: JSON.stringify({ id: '4567', url: 'https://github.com/org/repo/issues/124' }) }] }, s.ctx);
  assert.equal(s.guard('github-update_issue_body', { owner: 'org', repo: 'repo', issue_number: 124, body: 'Acceptance + tests' }), undefined);
  assert.equal(s.guard('github-create_issue', { ...create, parent_issue_number: 124 }), undefined, 'Nested deliverables stay within the admitted subtree');
  assert.equal(s.guard('github-issue_dependency_write', { owner: 'org', repo: 'repo', issue_number: 124, method: 'add', type: 'blocked_by', related_issue_number: 123 }), undefined);
  s.branch.push({ type: 'mode_change', mode: 'goal', data: { goal: native } });
  const resumed = session('research', s.branch);
  await resumed.handlers.get('session_start')({}, resumed.ctx);
  assert.equal(resumed.guard('github-update_issue_body', { owner: 'org', repo: 'repo', issue_number: 124, body: 'Updated plan' }), undefined);
  assert.equal(resumed.guard('github-update_issue_body', { owner: 'org', repo: 'repo', issue_number: 125, body: 'Out of scope' }).block, true);
});

test('native planning helpers remain read-only and cannot acquire tracked planner authority from their name or prompt', async () => {
  const s = session('research');
  s.ctx.agent = { kind: 'sub', id: '0-plan', name: 'technical-planner', depth: 1, parentId: 'Main' };
  await s.handlers.get('session_start')({}, s.ctx);
  assert.equal(s.handlers.get('tool_call')({ toolName: 'github-create_issue', input: { owner: 'org', repo: 'repo', parent_issue_number: 123 } }, s.ctx).block, true);
  assert.equal(s.handlers.get('tool_call')({ toolName: 'task', input: {} }, s.ctx), undefined);
  assert.equal(s.handlers.get('tool_call')({ toolName: 'yield', input: { data: { report: 'Research findings' } } }, s.ctx), undefined,
    'Read-only helpers must still be able to submit OMP structured results');
  assert.ok(!s.branch.some(e => e.customType === 'teck-orca-contract'));
});

test('planner recovers actual child records without admitting failed, foreign or body-injected issue IDs', () => {
  const scope = createPlanningScope('https://github.com/org/repo/issues/123');
  const lookup = { owner: 'org', repo: 'repo', issue_number: 123, method: 'get_sub_issues' };
  const injected = { id: 9999, number: 999, html_url: 'https://github.com/org/repo/issues/999' };
  scope.observe('github-issue_read', lookup, { content: [{ type: 'text', text: JSON.stringify([
    { id: 4567, number: 124, html_url: 'https://github.com/org/repo/issues/124', body: JSON.stringify(injected), milestone: injected },
    { id: 5678, number: 125, html_url: 'https://github.com/org/foreign/issues/125' },
    { number: 128, title: 'Compact issue response', html_url: 'https://github.com/org/repo/issues/128' },
  ]) }] });
  const update = issue_number => scope.allows('github-update_issue_body', { owner: 'org', repo: 'repo', issue_number });
  assert.equal(update(124), true);
  assert.equal(update(128), true, 'Compact read results may omit database IDs');
  assert.equal(update(125), false);
  assert.equal(update(999), false);
  scope.observe('github-create_issue', { owner: 'org', repo: 'repo', parent_issue_number: 123 },
    { isError: true, details: { id: 6789, number: 126 } });
  assert.equal(update(126), false);
  assert.equal(scope.allows('github-add_sub_issue', { owner: 'org', repo: 'repo', issue_number: 123, sub_issue_id: 7777 }), false);
  scope.observe('github-issue_read', { owner: 'org', repo: 'repo', issue_number: 127, method: 'get' },
    { details: { id: 7777, number: 127, html_url: 'https://github.com/org/repo/issues/127' } });
  assert.equal(update(127), false, 'Read-only evidence does not itself admit a candidate to the writable subtree');
  const attach = { owner: 'org', repo: 'repo', issue_number: 123, sub_issue_id: 7777 };
  assert.equal(scope.allows('github-add_sub_issue', attach), true);
  assert.equal(scope.allows('github-add_sub_issue', { ...attach, replace_parent: true }), false);
  scope.observe('github-add_sub_issue', attach, { isError: false });
  assert.equal(update(127), true);
  const fresh = createPlanningScope('https://github.com/org/repo/issues/555', scope.state());
  assert.equal(fresh.allows('github-update_issue_body', { owner: 'org', repo: 'repo', issue_number: 124 }), false);
});

test('planner dispatch uses the existing slow role and requires an explicit parent issue', async () => {
  const s = session();
  await s.handlers.get('session_start')({}, s.ctx);
  createdGoal(s, 'Deliver the authorized feature');
  const input = { role: 'planner', issue: 'https://github.com/org/repo/issues/123', objective: 'Prepare executable children and dependencies',
    acceptance: ['Return issue IDs and read-back evidence'], constraints: 'Single plan writer', worktree: 'current' };
  await s.tools.get('orca_dispatch').execute('planner', input, undefined, undefined, s.ctx);
  assert.ok(s.calls.some(call => call.args?.includes('gateway/research')));
  assert.throws(() => assignment({ ...input, issue: undefined }), /parent GitHub issue/);
});
test('worker native goal must match its Orca assignment; success requires completion and role survives resume/model changes', async () => {
  const s = session('doer');
  await s.handlers.get('session_start')({}, s.ctx);
  assert.equal(s.guard('edit', {}).block, true);
  const input = { role: 'executor', objective: 'Implement rotation', acceptance: ['Rotation tested'], constraints: 'No publication' };
  s.setAssignment(input);
  await s.handlers.get('before_agent_start')({ prompt: `Task task_123 Dispatch ctx_456\n${assignment(input)}`, systemPrompt: [] }, s.ctx);
  assert.ok(s.pi.getActiveTools().includes('edit'), 'Live binding restores original execution tools removed during coordinator-safe startup');
  assert.ok(s.pi.getActiveTools().includes('bash'));
  assert.equal(s.guard('goal', { op: 'create', objective: 'Do less' }).input.objective, input.objective);
  assert.equal(s.guard('goal', { op: 'create', objective: input.objective }).input.objective, input.objective);
  assert.equal(Object.hasOwn(s.guard('goal', { op: 'create', objective: input.objective, token_budget: 5000 }).input, 'token_budget'), false);
  const native = createdGoal(s, input.objective);
  await startImplementation(s);
  assert.equal(s.guard('edit', {}), undefined);
  const done = { action: 'report', outcome: 'succeeded', subject: 'Done', body: 'Evidence' };
  assert.equal(s.guard('orca', done), undefined, 'Reports may be staged before completion; no settlement is sent yet');
  s.handlers.get('goal_updated')({ goal: { ...native, status: 'complete' } });
  assert.equal(s.guard('orca', done), undefined);
  assert.equal(s.guard('edit', {}).block, true);
  s.branch.push({ type: 'mode_change', mode: 'goal', data: { goal: native } });
  const resumed = session('doer', s.branch);
  await resumed.handlers.get('session_start')({}, resumed.ctx);
  assert.equal(resumed.guard('edit', {}), undefined, 'Resume retains the original worker role and native goal');
});
test('a staged failure settles only after native drop and is delivered once', async () => {
  const s = session('doer');
  s.setAssignment({ role: 'executor', objective: 'Task', acceptance: ['Verified'], constraints: 'Scope' });
  await s.handlers.get('session_start')({}, s.ctx);
  await s.handlers.get('before_agent_start')({ prompt: 'Start', systemPrompt: [] }, s.ctx);
  const native = createdGoal(s, 'Task');
  const report = { action: 'report', outcome: 'failed', subject: 'Blocked', body: 'Evidence of failure' };
  const staged = await s.tools.get('orca').execute('stage', report);
  assert.equal(staged.details.staged, true);
  assert.equal(s.calls.filter(c => c.args?.[1] === 'send').length, 0);
  const dropped = { ...native, status: 'dropped' };
  s.handlers.get('goal_updated')({ goal: dropped });
  const settled = await s.handlers.get('tool_result')({ toolName: 'goal', content: [], details: { op: 'drop', goal: dropped } });
  assert.ok(settled.details.orchestrationReport);
  assert.ok(s.calls.find(c => c.args?.[1] === 'send').args.includes('failed'));
  await s.tools.get('orca').execute('retry', report);
  assert.equal(s.calls.filter(c => c.args?.[1] === 'send').length, 1);
});

test('staged success survives resume, rejects unrelated completion, and retries the same delivery identity', async () => {
  let attempts = 0;
  const s = session('doer', [], () => { if (++attempts === 1) throw Error('Lost transport'); return { accepted: true }; });
  const input = { role: 'executor', objective: 'Task', acceptance: ['Verified'], constraints: 'Scope' };
  s.setAssignment(input);
  await s.handlers.get('session_start')({}, s.ctx);
  await s.handlers.get('before_agent_start')({ prompt: 'Start', systemPrompt: [] }, s.ctx);
  const native = createdGoal(s, 'Task');
  const report = { action: 'report', outcome: 'succeeded', subject: 'Done', body: 'Evidence' };
  assert.equal((await s.tools.get('orca').execute('stage', report)).details.staged, true);
  await assert.rejects(s.tools.get('orca').execute('change', { ...report, outcome: 'failed' }), /different outcome/);
  await s.handlers.get('tool_result')({ toolName: 'goal', content: [], details: { op: 'complete', goal: { ...native, id: 'unrelated', status: 'complete' } } });
  assert.equal(attempts, 0);
  const complete = { ...native, status: 'complete' };
  s.handlers.get('goal_updated')({ goal: complete });
  const result = await s.handlers.get('tool_result')({ toolName: 'goal', content: [], details: { op: 'complete', goal: complete } });
  assert.equal(result.details.orchestrationReport.staged, true);
  assert.equal(attempts, 1);
  // OMP leaves goal mode after completion. The saved exact goal/Dispatch proof
  // and staged mutation identity still authorize retry after session recovery.
  s.branch.push({ type: 'mode_change', mode: 'none' });
  const resumed = session('doer', s.branch, () => ({ accepted: true }));
  resumed.setAssignment(input);
  await resumed.handlers.get('session_start')({}, resumed.ctx);
  await resumed.handlers.get('before_agent_start')({ prompt: 'Retry delivery only', systemPrompt: [] }, resumed.ctx);
  assert.equal(resumed.guard('orca', report), undefined);
  await resumed.tools.get('orca').execute('retry', report);
  const sent = s.calls.find(c => c.args?.[1] === 'send').args;
  const replay = resumed.calls.find(c => c.args?.[1] === 'send').args;
  assert.deepEqual(replay, sent, 'Retry reuses the same body, live identities and operation UUID');
  await resumed.tools.get('orca').execute('again', report);
  assert.equal(resumed.calls.filter(c => c.args?.[1] === 'send').length, 1);
});
test('a copied assignment cannot grant worker access without matching active pane ownership', async () => {
  const s = session('doer');
  const input = { role: 'executor', objective: 'Do work', acceptance: ['Verified'], constraints: 'Scope' };
  s.setAssignment(input); s.setPane('another-pane');
  await s.handlers.get('session_start')({}, s.ctx);
  await s.handlers.get('before_agent_start')({ prompt: `task_123 ctx_456\n${assignment(input)}`, systemPrompt: [] }, s.ctx);
  s.handlers.get('goal_updated')({ goal: { status: 'active' } });
  assert.equal(s.guard('edit', {}).block, true);
});
test('worker binding follows the full inventory cursor when its Dispatch is beyond the first page', async () => {
  const s = session('doer');
  const input = { role: 'executor', objective: 'Execute the existing task', acceptance: ['Verified'], constraints: 'No publication' };
  s.setAssignment(input);
  s.setWorkerPages(args => args.includes('--cursor') ? {
    workers: [{ dispatchId: 'ctx_456', taskId: 'task_123', runId: 'run_123', dispatchStatus: 'dispatched',
      agentTerminalHandle: 'term_123', resource: { worktreeId: 'worktree' } }], page: { hasMore: false, nextCursor: null }
  } : { workers: [{ dispatchId: 'old', dispatchStatus: 'failed' }], page: { hasMore: true, nextCursor: 'older-page' } });
  await s.handlers.get('session_start')({}, s.ctx);
  await s.handlers.get('before_agent_start')({ prompt: assignment(input), systemPrompt: [] }, s.ctx);
  createdGoal(s, input.objective);
  await startImplementation(s);
  assert.equal(s.guard('edit'), undefined);
  assert.equal(s.branch.at(-1).data.authority.dispatchId, 'ctx_456');
  assert.ok(s.calls.some(c => c.args?.includes('older-page')));
  for (const { args } of s.calls.filter(c => ['worker-list', 'worker-show', 'task-list'].includes(c.args?.[1]))) {
    assert.ok(args.includes('--full'), args.join(' '));
  }
});

test('a repeated inventory cursor cannot loop or preserve stale editing authority', async () => {
  const s = session('doer');
  const input = { role: 'executor', objective: 'Existing task', acceptance: ['Verified'], constraints: 'Scope' };
  s.setAssignment(input);
  await s.handlers.get('session_start')({}, s.ctx);
  await s.handlers.get('before_agent_start')({ prompt: assignment(input), systemPrompt: [] }, s.ctx);
  createdGoal(s, input.objective);
  await startImplementation(s);
  assert.equal(s.guard('edit'), undefined);
  s.setWorkerPages(() => ({ workers: [], page: { hasMore: true, nextCursor: 'same-page' } }));
  await s.handlers.get('before_agent_start')({ prompt: 'Continue', systemPrompt: [] }, s.ctx);
  assert.equal(s.guard('edit').block, true);
  assert.equal(s.branch.at(-1).data.role, 'unbound');
});

test('startup binds an exact Dispatch before declaring the presentation role ready',async()=>{
  const s=session('doer');s.setAssignment({role:'executor',objective:'Bound before display',acceptance:['Verified']});
  const pending=s.handlers.get('session_start')({},s.ctx);
  assert.equal(s.branch.at(-1).data.presentationReady,false,'do not display the coordinator fallback during ownership lookup');
  await pending;
  const contract=s.branch.at(-1).data;assert.equal(contract.presentationReady,true);assert.equal(contract.role,'executor');assert.equal(contract.authority.dispatchId,'ctx_456');
  assert.equal(s.sent.length,0,'startup role resolution does not send input');
  assert.equal(s.guard('edit').block,true,'presentation does not skip the native goal/delegation gates');
});

test('a Dispatch attached during initial pane startup never publishes the coordinator fallback',async()=>{
  const s=session('doer');
  await s.handlers.get('session_start')({},s.ctx);
  assert.equal(s.branch.at(-1).data.presentationReady,false,'a new pane waits through assignment recovery before becoming an office coordinator');
  s.setAssignment({role:'executor',objective:'Attach after pane startup',acceptance:['Verified']});
  await s.timers[0]();
  assert.equal(s.branch.at(-1).data.presentationReady,true);assert.equal(s.branch.at(-1).data.role,'executor');
  assert.equal(s.branch.at(-1).data.authority.dispatchId,'ctx_456');
});

test('startup recovers the exact idle worker assignment through OMP queue once, without another Orca start', async () => {
  const s = session('doer');
  const input = { role: 'executor', objective: 'Recover task', acceptance: ['Verified'], constraints: 'Scope' };
  s.setAssignment(input);
  await s.handlers.get('session_start')({}, s.ctx);
  await s.timers[0]();
  assert.equal(s.sent.length, 1);
  assert.match(s.sent[0], /Recover task/);
  assert.match(s.sent[0], /ctx_456/);
  await s.timers[0]();
  assert.equal(s.sent.length, 1, 'Pending input prevents duplicate recovery');
  assert.ok(!s.calls.some(call => call.args?.[1] === 'worker-start'));
});
test('worker reports cannot change the verified lifecycle identities', async () => {
  const s = session('doer');
  s.setAssignment({ role: 'executor', objective: 'Task', acceptance: ['Verified'], constraints: 'Scope' });
  await s.handlers.get('session_start')({}, s.ctx);
  await s.handlers.get('before_agent_start')({ prompt: 'Continue', systemPrompt: [] }, s.ctx);
  const native = createdGoal(s, 'Task');
  s.handlers.get('goal_updated')({ goal: { ...native, status: 'complete' } });
  assert.equal(s.guard('orca', { action: 'report', subject: 'Done', body: 'Evidence', outcome: 'succeeded', dispatch_id: 'ctx_forged' }).block, true);
  await s.tools.get('orca').execute('report', { action: 'report', subject: 'Done', body: 'Evidence', outcome: 'succeeded' });
  assert.ok(s.calls.at(-1).args.includes('ctx_456'));
  assert.ok(s.calls.at(-1).args.includes('task_123'));
  assert.ok(s.calls.at(-1).args.includes('term_123'));
});
test('loss of live ownership invalidates restored editing authority instead of trusting the saved role', async () => {
  const s = session('doer');
  s.setAssignment({ role: 'executor', objective: 'Task', acceptance: ['Verified'], constraints: 'Scope' });
  await s.handlers.get('session_start')({}, s.ctx);
  await s.handlers.get('before_agent_start')({ prompt: 'Start', systemPrompt: [] }, s.ctx);
  createdGoal(s, 'Task');
  await startImplementation(s);
  assert.equal(s.guard('edit'), undefined);
  s.setAssignment(undefined);
  await s.handlers.get('before_agent_start')({ prompt: 'Continue', systemPrompt: [] }, s.ctx);
  assert.equal(s.guard('edit').block, true);
  assert.equal(s.guard('orca', { action: 'report', outcome: 'succeeded', subject: 'Done', body: 'Claim' }).block, true);
});
test('an unrelated completed goal, replacement goal ID or mismatched resume can never authorize worker success', async () => {
  const s = session('doer');
  s.setAssignment({ role: 'executor', objective: 'Task', acceptance: ['Verified'], constraints: 'Scope' });
  await s.handlers.get('session_start')({}, s.ctx);
  await s.handlers.get('before_agent_start')({ prompt: 'Start', systemPrompt: [] }, s.ctx);
  const native = createdGoal(s, 'Task');
  const report = { action: 'report', outcome: 'succeeded', subject: 'Done', body: 'Evidence' };
  for (const bad of [{ ...native, status: 'complete', objective: 'Something else' }, { ...native, status: 'complete', id: 'different-goal' }]) {
    s.handlers.get('goal_updated')({ goal: bad });
    assert.equal(s.guard('orca', report).block, true);
    assert.equal(s.guard('goal', { op: 'drop' }).block, true);
  }
  s.branch.push({ type: 'mode_change', mode: 'goal', data: { goal: { ...native, id: 'resumed-other-goal', status: 'complete' } } });
  const resumed = session('doer', s.branch);
  await resumed.handlers.get('session_start')({}, resumed.ctx);
  assert.equal(resumed.guard('orca', report).block, true);
});
test('structured actions generate exact public commands and cannot express arbitrary launch or execution', () => {
  assert.deepEqual(coordinationAction({ action: 'run_show', id: 'run_123' }, 'coordinator'), ['orchestration', 'run-show', '--id', 'run_123', '--json']);
  assert.deepEqual(coordinationAction({ action: 'guide' }, 'coordinator'), ['skills', 'get', 'orchestration', '--json']);
  assert.throws(() => coordinationAction({ action: 'terminal_create' }, 'coordinator'), /Unknown/);
  assert.throws(() => coordinationAction({ action: 'run_create', objective: 'nested' }, 'executor'), /not permitted/);
  assert.throws(() => coordinationAction({ action: 'worker_read' }, 'coordinator'), /dispatch_id/);
});
