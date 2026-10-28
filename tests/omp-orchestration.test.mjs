import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resolveRole, permittedTool, coordinationArgs, coordinationAction, assignment } from '../runtime/omp/extensions/lib/orca-policy.mjs';
import activate from '../runtime/omp/extensions/orca-orchestration.mjs';

const roles = { default: 'gateway/lead', plan: 'gateway/lead', task: 'gateway/doer', slow: 'gateway/research', advisor: 'gateway/review' };
const models = { resolve: role => { const [provider, id] = (roles[role.replace('@', '')] ?? '').split('/'); return id ? { provider, id } : undefined; } };
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
test('coordinator cannot implement, inspect source, use alternate execution bridges or publish code', () => {
  for (const name of ['bash', 'eval', 'edit', 'write', 'task', 'github', 'lsp', 'computer', 'manage_skill', 'github__push_files']) {
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
test('review/research stay read-only and every role must use Orca rather than native subagents', () => {
  for (const role of ['coordinator', 'executor', 'reviewer', 'researcher', 'publisher']) {
    assert.equal(permittedTool(role, 'task', {}), false);
    assert.equal(permittedTool(role, 'eval', {}), false);
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
  let boundInput, pane = 'pane', pending = false;
  const timers = [], sent = [];
  let activeTools = ['bash', 'read', 'edit', 'eval', 'task', 'goal', 'todo', 'github__push_files', 'github__issue_write'];
  const schema = new Proxy(() => schema, { get: () => schema });
  const pi = { zod: schema, on: (name, fn) => handlers.set(name, fn), registerTool: tool => tools.set(tool.name, tool),
    getAllTools: () => ['bash', 'read', 'edit', 'eval', 'task', 'goal', 'todo', 'github__push_files', 'github__issue_write'].map(name => ({ name })),
    getActiveTools: () => [...activeTools],
    setActiveTools: async names => { activeTools = [...names]; calls.push({ active: names }); },
    sendUserMessage: text => { sent.push(text); pending = true; },
    appendEntry: (customType, data) => branch.push({ type: 'custom', customType, data }) };
  const ctx = { model: { provider: 'gateway', id: model }, models, sessionManager: { getBranch: () => branch },
    setTimeout: fn => timers.push(fn), isIdle: () => !pending, hasPendingMessages: () => pending };
  ctx.models = { resolve: role => role === '@default' ? ctx.model : models.resolve(role) };
  activate(pi, { environment: { ORCA_PANE_KEY: 'pane', ORCA_WORKTREE_ID: 'worktree' }, run: async args => {
    calls.push({ args });
    if (args[1] === 'worker-list') return { workers: boundInput ? [{ dispatchId: 'ctx_456', taskId: 'task_123', runId: 'run_123',
      dispatchStatus: 'dispatched', agentTerminalHandle: 'term_123', resource: { worktreeId: 'worktree' } }] : [] };
    if (args[1] === 'worker-show') return { dispatch: { assigneePaneKey: pane, assigneeHandle: 'term_123', status: 'dispatched', processIncarnation: 'pty:incarnation' },
      terminal: { ptyId: 'pty', incarnationId: 'incarnation' }, observation: { exactWorker: true, status: 'live' } };
    if (args[1] === 'task-list') return { tasks: [{ id: 'task_123', dispatch_id: 'ctx_456', assignee_handle: 'term_123', spec: assignment(boundInput) }] };
    if (args[1] === 'send' && sendResult) return sendResult(args);
    return { dispatchId: 'ctx_test' };
  } });
  return { pi, ctx, branch, calls, tools, handlers, timers, sent, setPane: value => { pane = value; }, setAssignment: value => { boundInput = value; },
    guard: (toolName, input = {}) => handlers.get('tool_call')({ toolName, input }) };
}
function createdGoal(s, objective) {
  const goal = { id: 'native-goal-123', status: 'active', objective };
  s.handlers.get('goal_updated')({ goal });
  s.handlers.get('tool_result')({ toolName: 'goal', isError: false, details: { op: 'create', goal } });
  return goal;
}
test('loaded extension requires an active native goal, dispatches configured role, and cannot promote coordinator through a prompt', async () => {
  const s = session();
  await s.handlers.get('session_start')({}, s.ctx);
  assert.equal(s.guard('orca_dispatch', {}).block, true);
  assert.equal(s.guard('edit', {}).block, true);
  s.handlers.get('goal_updated')({ goal: { status: 'active', objective: 'Deliver milestone' } });
  const input = { role: 'executor', objective: 'Implement #123', acceptance: ['Tests pass'], constraints: 'No publication', worktree: 'new-child', name: 'issue-123' };
  await s.handlers.get('before_agent_start')({ prompt: assignment(input), systemPrompt: [] }, s.ctx);
  assert.equal(s.guard('edit', {}).block, true, 'A copied worker marker cannot grant coordinator editing rights');
  await s.tools.get('orca_dispatch').execute('test', input, undefined, undefined, s.ctx);
  assert.ok(s.calls.some(call => call.args?.includes('gateway/doer')));
  assert.ok(s.calls.some(call => call.args?.includes('new-child')));
  assert.equal(s.handlers.get('before_subagent_spawn')().block, true);
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
