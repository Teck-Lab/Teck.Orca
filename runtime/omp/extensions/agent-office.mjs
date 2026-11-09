// Observe documented OMP events only. Network delivery never gates tools or approvals.
import { readFileSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { isOfficeTool, officeSignalFromResult, officeToolName } from './lib/office-tools.mjs';
import { createOfficeUsage, ompMessageTokens } from './lib/office-usage.mjs';
import { cleanPlan } from './lib/office-plan.mjs';
const registry = new Map();
const key = value => createHash('sha256').update(value).digest('hex').slice(0, 32);
const categories = { read: 'read', edit: 'edit', write: 'edit', bash: 'bash', exec: 'bash', grep: 'search', find: 'search', glob: 'search', task: 'agent', eval: 'agent', wait: 'agent', orca: 'agent', orca_dispatch: 'agent', todo: 'todo', web_search: 'web', fetch: 'web' };
const category = name => categories[name] ?? (/^(?:mcp[_.]|github(?:-projects)?[-_/])|\//.test(name) ? 'mcp' : 'other');
const safe = (value, length = 48) => typeof value === 'string' ? value.replace(/[^A-Za-z0-9_.:/@ -]/g, '').slice(0, length) : undefined;
const orcaRoles = new Set(['coordinator','executor','planner','researcher','reviewer','publisher']);
const id = value => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9:_.-]{0,119}$/.test(value) ? value : undefined;
// The role guard writes this entry after binding exact live Orca ownership. Never
// classify a session by its model alias, prompt text, or inherited environment.
export function readOrcaCoordination(ctx) {
  const entries = ctx.sessionManager.getBranch?.() ?? ctx.sessionManager.getEntries?.() ?? [];
  const contract = entries.filter(e => e.type === 'custom' && e.customType === 'teck-orca-contract').at(-1)?.data;
  if (contract?.version !== 1 || !orcaRoles.has(contract.role)) return null;
  const authority = contract.authority;
  if (contract.role !== 'coordinator' && (!id(authority?.runId) || !id(authority?.taskId) || !id(authority?.dispatchId))) return null;
  const result = { role: contract.role };
  const runId = id(authority?.runId ?? contract.coordinatorRunId);
  if (runId) result.runId = runId;
  if (contract.role !== 'coordinator') {
    result.taskId = authority.taskId; result.dispatchId = authority.dispatchId;
  }
  const issue = contract.assignment?.issue;
  if (typeof issue === 'string' && issue.length <= 256 && /^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/issues\/[1-9]\d*$/.test(issue)) result.issue = issue;
  return result;
}

// Rehydrate only canonical native state on this branch, never prompt text,
// arbitrary tool results, assignment descriptions or a different session.
export function readOfficePlan(ctx, liveGoal) {
  let goal = null, phases = [];
  for (const e of ctx.sessionManager.getBranch?.() ?? []) {
    if (e.type === 'mode_change') goal = e.data?.goal ?? null;
    if (e.type === 'custom' && e.customType === 'user_todo_edit' && Array.isArray(e.data?.phases)) phases = e.data.phases;
    const m = e.type === 'message' ? e.message : null;
    if (m?.role !== 'toolResult' || m.isError) continue;
    if (m.toolName === 'todo' && m.details?.op !== 'view' && Array.isArray(m.details?.phases)) phases = m.details.phases;
    if (m.toolName === 'goal' && m.details?.goal) goal = m.details.goal;
  }
  return cleanPlan({goal: liveGoal === undefined ? goal : liveGoal, phases}) ?? {goal:null,phases:[]};
}

export function createOfficeReporter({ readConfig = () => JSON.parse(readFileSync('/etc/teck-orca/office.json', 'utf8')), request = fetch,
  schedule = setTimeout, cancel = clearTimeout, now = Date.now } = {}) {
  const queue = []; let timer, inFlight, stopped = false, retry = 500;
  let current, currentStatus, currentPlan;
  function later(ms = 20) {
    if (timer || stopped) return;
    timer = schedule(() => { timer = null; void flush(); }, ms); timer.unref?.();
  }
  function publish(event) {
    if (stopped) return;
    if (queue.length >= 200) queue.shift();
    queue.push({ ...event, eventId: randomUUID(), ts: new Date(now()).toISOString(), agent: 'omp' });
    if (event.plan !== undefined) currentPlan = { ...event, kind: 'plan' };
    if (['plan','usage','status','shout','celebrate','flip','meeting'].includes(event.kind)) {
      if (event.kind === 'status') currentStatus = event;
      if (current?.workerId === event.workerId && event.tokenTotal !== undefined) current = { ...current, tokenTotal: event.tokenTotal };
    } else if (!['session_end','subagent_end'].includes(event.kind)) current = event;
    else if (current?.workerId === event.workerId) { current = undefined; currentStatus = undefined; currentPlan = undefined; }
    later();
  }
  async function flush() {
    if (inFlight || stopped) return inFlight;
    // Defer the body until inFlight is assigned. A missing/rotating config can
    // fail before the first await; clearing the latch inside an eager async
    // function then assigning its settled promise wedges all future heartbeats.
    inFlight = Promise.resolve().then(async () => {
      try {
        const config = readConfig();
        if (config.version !== 1 || !/^http:\/\/127\.0\.0\.1:\d+\/api\/ingest$/.test(config.url) || !/^[a-f0-9]{64}$/.test(config.token) || !/^[a-f0-9-]{16,64}$/.test(config.sourceId)) return;
        while (queue.length && now() - Date.parse(queue[0].ts) > 90_000) queue.shift();
        // Ingestion accepts 64 KiB. Burst tool activity and native helper
        // metadata must not wedge the queue behind an oversized 100-event batch.
        const events = []; let bytes = 512;
        while (events.length < 100 && queue[events.length]) {
          const candidate = queue[events.length], size = Buffer.byteLength(JSON.stringify(candidate)) + 1;
          if (bytes + size > 60 * 1024) { if (!events.length) { queue.shift(); continue; } break; }
          events.push(candidate); bytes += size;
        }
        const response = await request(config.url, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.token}` },
          body: JSON.stringify({ version: 1, sourceId: config.sourceId, events, heartbeat: current ? [current.workerId] : [] }), signal: AbortSignal.timeout(1200) });
        if (response.status !== 202) { await response.body?.cancel(); throw Error('Office unavailable'); }
        const receipt = await response.json();
        const delivered = new Set(events.map(e => e.eventId));
        for (let i = queue.length - 1; i >= 0; i--) if (delivered.has(queue[i].eventId)) queue.splice(i, 1);
        retry = 500;
        if (current && receipt.missing?.includes(current.workerId)) {
          const previous = current;
          publish({ ...previous, kind: previous.parentId ? 'subagent_start' : 'session_start' });
          publish(previous);
          if (currentPlan?.workerId === previous.workerId) publish(currentPlan);
          if (currentStatus?.workerId === previous.workerId) publish({ ...previous, kind: 'status', summary: currentStatus.summary, tool: currentStatus.tool });
        }
      } catch { retry = Math.min(retry * 2, 10_000); }
    }).finally(() => { inFlight = null; if (queue.length || current) later(queue.length ? retry : 10_000); });
    return inFlight;
  }
  return { publish, flush, get pending() { return queue.length; }, async close() {
    if (timer) cancel(timer); timer = null;
    if (inFlight) await inFlight;
    await flush(); stopped = true; if (timer) cancel(timer); timer = null;
  } };
}

export default function activate(pi, dependencies = {}) {
  const reporter = dependencies.reporter ?? createOfficeReporter(dependencies);
  const usage = createOfficeUsage();
  let identity, session, startupGeneration = 0, planKey, liveGoal, retired = false, visible = false; const tools = new Map();
  function ensure(ctx) {
    if (retired) return false;
    const nextSession = ctx.sessionManager.getSessionId();
    const agent = ctx.agent ?? { kind: 'main', id: 'Main', name: 'main' };
    const helper = agent.kind === 'sub';
    if (!helper && (ctx.sessionManager.getBranch?.() ?? []).filter(e=>e.type==='custom'&&e.customType==='teck-orca-contract').at(-1)?.data?.presentationReady === false) return false;
    const parent = helper ? registry.get(agent.parentId) : undefined;
    const orchestration = parent ? parent.orchestration : helper ? null : readOrcaCoordination(ctx);
    const started = !identity || !visible || nextSession !== session;
    if (started && identity && visible) reporter.publish({ ...identity, kind: identity.parentId ? 'subagent_end' : 'session_end' });
    if (started) { planKey = undefined; liveGoal = undefined; }
    session = nextSession;
    identity = { workerId: key(`${session}:${agent.id}`), ...(parent ? { parentId: parent.workerId } : {}),
      nativeKind: helper ? 'sub' : 'main',
      role: safe(helper ? agent.name : orchestration?.role ?? agent.name), model: safe(ctx.model?.id, 64),
      orchestration, placement: orchestration?.role === 'coordinator' ? 'office' : 'cloud', tokenTotal: usage.total(ctx) };
    registry.set(agent.id, identity);
    visible = true;
    const plan = readOfficePlan(ctx, liveGoal), nextKey = JSON.stringify(plan);
    if (started) { tools.clear(); reporter.publish({ ...identity, kind: parent ? 'subagent_start' : 'session_start', plan }); }
    else if (nextKey !== planKey) reporter.publish({ ...identity, kind: 'plan', plan });
    planKey = nextKey;
    return true;
  }
  function emit(kind, ctx, extra = {}) { if (ensure(ctx)) reporter.publish({ ...identity, kind, ...extra }); }
  const on = (name, handler) => pi.on(name, (event, ctx) => {
    try { handler(event, ctx); } catch { /* Best-effort observer; never affect a model turn. */ }
  });
  pi.on('tool_call', (event, ctx) => {
    let name = event.toolName;
    if (name === 'write' && typeof event.input?.path === 'string') {
      const route = /^xd:\/\/([A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)*)$/.exec(event.input.path);
      if (route && pi.getAllTools?.().some(t => t.name === route[1])) name = route[1];
    }
    if (officeToolName(name) === 'office_meeting' && ctx.agent?.kind !== 'main')
      return { block: true, reason: 'Meeting participation belongs to main terminal sessions. Return findings to your parent; native helpers stay at their desks.' };
  });
  function refresh(ctx) {
    // Ambient observers load before the explicitly loaded role guard. Wait for
    // its lifecycle handler to append the contract, even if no prompt follows.
    const generation = ++startupGeneration;
    liveGoal = undefined; planKey = undefined;
    const announce = () => { try {
      if (generation !== startupGeneration || retired) return;
      const ready = ensure(ctx);
      // Also observe human /todo edits while idle; read-only branch metadata,
      // no agent input, polling Orca or fabricated activity events.
      if (typeof ctx.setTimeout === 'function') ctx.setTimeout(announce, ready ? 5000 : 50);
    } catch { /* Observer only. */ } };
    if (typeof ctx.setTimeout === 'function') ctx.setTimeout(announce, 0);
    else announce();
  }
  for (const name of ['session_start','session_switch','session_branch','session_tree']) on(name, (_e, ctx) => {
    retired = false;
    refresh(ctx);
  });
  const wake = ctx => { if (retired) { retired = false; refresh(ctx); } };
  on('before_agent_start', (_e, ctx) => { wake(ctx); emit('prompt', ctx); });
  on('agent_start', (_e, ctx) => { wake(ctx); emit('thinking', ctx); });
  on('tool_execution_start', (e, ctx) => {
    ensure(ctx);
    let name=e.toolName;
    const route=name==='write'&&typeof e.args?.path==='string'?/^xd:\/\/([A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)*)$/.exec(e.args.path):null;
    // The virtual route is tool metadata. Never inspect or publish its JSON content.
    if(route&&pi.getAllTools?.().some(t=>t.name===route[1]))name=route[1];
    const tool = safe(name) ?? 'tool', messaging=name==='write'&&e.args?.path?.startsWith('agent://');
    const data = { tool, category: messaging?'agent':isOfficeTool(name)?'mcp':category(tool), summary: messaging?'Messaging helper':`Executing ${tool}` };
    tools.set(e.toolCallId, data); emit('tool_start', ctx, data);
  });
  on('tool_execution_end', (e, ctx) => {
    const data = tools.get(e.toolCallId) ?? { tool: safe(e.toolName) ?? 'tool' };
    tools.delete(e.toolCallId); emit('tool_end', ctx, { ...data, isError: e.isError === true });
    const signal = !e.isError ? officeSignalFromResult(data.tool, e.result) : null;
    if (signal && (signal.kind !== 'meeting' || ctx.agent?.kind === 'main')) emit(signal.kind, ctx, {
      ...(signal.summary ? { summary: signal.summary } : {}), ...(signal.tool ? { tool: signal.tool } : {}), ...(signal.meeting ? { meeting: signal.meeting } : {}) });
    if (!tools.size) emit('thinking', ctx);
  });
  on('tool_approval_requested', (_e, ctx) => emit('waiting', ctx, { summary: 'Awaiting approval' }));
  on('tool_approval_resolved', (_e, ctx) => emit(tools.size ? 'thinking' : 'idle', ctx));
  on('agent_end', (e, ctx) => {
    if (ctx.agent?.kind === 'sub' && !e.willContinue && !e.awaitingAsyncWork) {
      if (ensure(ctx)) reporter.publish({ ...identity, kind: identity.parentId ? 'subagent_end' : 'session_end' });
      // Retire the seat, not the native helper. Only a real new turn revives
      // it; timer refreshes, late usage and plan events cannot resurrect it.
      retired = true; visible = false; ++startupGeneration;
      return;
    }
    emit('waiting', ctx, e.awaitingAsyncWork ? {summary:'Awaiting helper work'} : e.willContinue ? {summary:'Awaiting continuation'} : {});
  });
  on('goal_updated', (e, ctx) => {
    if (!ensure(ctx)) return;
    liveGoal = e.goal ?? null;
    ensure(ctx);
  });
  on('message_end', (e, ctx) => {
    // Tool results have been persisted by this point, including successful
    // todo changes. Failed calls/view reads cannot replace the canonical list.
    if (e.message?.role === 'toolResult' && ['todo','goal'].includes(e.message.toolName)) ensure(ctx);
    if (ompMessageTokens(e.message) !== undefined) {
      const previous = usage.total(ctx), total = usage.observe(e.message, ctx);
      if (total !== previous) emit('usage', ctx, { tokenTotal: total });
    }
    if (e.message?.role === 'assistant' && ['error','aborted'].includes(e.message.stopReason)) emit('error', ctx, { summary: 'Turn interrupted or failed' });
  });
  // Native helpers can remain reusable after their Office seat has retired.
  pi.on('session_shutdown', async (_e, ctx) => {
    ++startupGeneration;
    try {
      if (!ensure(ctx)) {
        if (registry.get(ctx.agent?.id)?.workerId === identity?.workerId) registry.delete(ctx.agent.id);
        await reporter.close(); return;
      }
      reporter.publish({ ...identity, kind: identity.parentId ? 'subagent_end' : 'session_end' });
      if (registry.get(ctx.agent?.id)?.workerId === identity.workerId) registry.delete(ctx.agent.id);
      // Shutdown is the only awaited handler: preserve the final event before process exit.
      await reporter.close();
    } catch { /* Exit stays bounded by the reporter deadline. */ }
  });
}
