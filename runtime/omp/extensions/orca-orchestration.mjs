import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash, randomUUID } from 'node:crypto';
import { lstatSync, readFileSync, readlinkSync } from 'node:fs';
import { join } from 'node:path';
import { assignment, coordinationAction, coordinationActions, messageTypes, permittedTool, resolveRole, workerRoles, isPlanningWrite, isPlanningTool, implementationTool, dispatchPlacement, verifyExecutorReuse, dispatchLabels, canRenameWorkerTab, isOfficeTool } from './lib/orca-policy.mjs';
import { createPlanningScope } from './lib/github-plan-scope.mjs';

const execute = promisify(execFile);
// OMP rebinds the extension per native agent in the same process. Only actual
// child turns can record delegation; copied prompts/tool receipts cannot.
const nativeFamilies = new Map();
const officeInstructions = 'When the Agent Office MCP tools are available, read skill://agent-office once before using them. Update your own status at meaningful phase/wait changes, check peers before shared edits, announce real milestones and celebrate verified wins. A rare table flip is optional. Office tools never replace Orca messages, evidence or acceptance, and office failure/cooldown never delays work.';
const instructions = `Teck Orca role contract:
The coordinator only plans and manages GitHub metadata, Orca Tasks/Dispatches and messages.
Never inspect source, implement, integrate code, run tests or publish code as coordinator.
Workers are not coordinators: implement only their assigned scope using their role's allowed tools.
Use orca_dispatch(role=planner,issue=<authorized parent issue URL>) to delegate canonical GitHub planning writes on the existing slow model role. One plan writer at a time: the coordinator pauses its plan edits while the planner owns the assignment. Planners create/reuse children, record acceptance/test expectations and real dependencies, and return exact issue IDs and read-back evidence. Researchers and native technical-planner research helpers remain read-only. The coordinator checks the returned graph before dispatching execution.
If an executor finds a missed blocker, diagnose the failing layer and report evidence, the affected acceptance criterion, prerequisite/decision and proposed next action. Keep its goal incomplete. The coordinator sends only the affected question to planner/researcher, revises real dependency edges and runs ready prerequisite work while unrelated work continues. Resume the existing assignment when viable; do not rebuild the whole plan or turn every failed command into an issue.
All roles may use native OMP task/wait subagents as needed for their assignment. Unrestricted eval is an executor capability; read-only and coordinator roles use native task plus agent:// messages instead.
An Orca executor is the assignment owner: after creating its exact native goal, delegate implementation to implementation-worker using task. For a small change use one focused helper; for independent work use a bounded parallel wave with file ownership and dependencies. The parent integrates, verifies acceptance/TDD evidence and handles Orca messages. Do not create a ceremonial helper or duplicate its implementation.
Use native wait and agent:// reads/messages to follow actual progress. A task receipt is not proof of execution. Helpers may delegate further within their inherited role boundaries; they do not recursively need another implementation-worker.
An Orca reviewer leads one final review. For code/deployment changes, start correctness-reviewer and security-auditor native helpers in parallel on the same stable snapshot, then independently validate/deduplicate their findings and issue one verdict. A documentation-only review may use one correctness helper and record why a security pass is inapplicable. All review helpers stay read-only; never run duplicate full reviews just to count agents.
Assign canonical execution issues/sub-issues to Orca executors with bounded goals. Every role may use native helpers for its scoped work; helpers do not replace the tracked primary executor.
New Orca executors, including integration workers, always use worktree=new-child (the default). Never run parallel executor terminals in the feature checkout. Reuse requires an exact id:<child> and its settled reclaimable terminal from this coordinator's bound Run; the extension verifies parentage, a distinct branch and sole terminal ownership. Ambiguous/released/active reuse fails closed. Integrate accepted child snapshots in a separate integration child, then review and publish that exact resulting checkout. Native helpers keep sharing their owning executor's checkout with file ownership.
Give each dispatch a concise title describing its work. The adapter adds issue/role labels and a readable unique child name automatically, then labels only the verified worker pane. A naming warning never authorizes launching a replacement worker.
Native OMP owns helper lifecycle; the parent owns scope, acceptance and the final result.
Use native wait and agent:// reads/messages for helper results and follow-ups. Settle or cancel owned helpers before final parent settlement.
Use existing OMP roles; never invent model aliases.
Use a native OMP goal for the authorized delivery scope, matching the GitHub milestone when supplied.
Use native todo phases for your next coordination actions; Orca owns parallel worker state.
Create the native goal with goal(op=create) before dispatch. Workers also create their assigned goal before work.
Keep issues and tests together; do not manufacture sub-issues merely to delegate.
Workers follow skill://orca-workers and their live Task/Dispatch. Research is conditional.
One final independent review per deliverable/PR by default; correction rounds review the changed delta.
The coordinator verifies records/evidence/verdicts, not source or tests. Dispatch any missing technical verification.
Native goal completion instructions to read files/run checks are fulfilled by the assigned verification workers;
they do not permit the coordinator to acquire implementation tools or the reviewer to execute tests.
Complete a goal only at its explicit acceptance gate. Worker goal completion is not GitHub issue closure.
Publication uses a task-role worker and GitHub App MCP; merging requires separate authorization.
Use the structured orca action tool, not bash or raw CLI argument guessing.
Read exact versioned lifecycle rules with orca(action=guide,topic=orchestration).
Create a Run with orca(action=run_create,objective=<authorized goal>); it binds the caller automatically.
Wait for messages with orca(action=check,types=worker_done,escalation,question,timeout_ms=15000).
Release accepted settled workers with orca(action=worker_release,dispatch_id=<id>).
Workers report with orca(action=report,outcome=succeeded|failed,subject=...,body=...). Omit from/task_id/dispatch_id: the wrapper supplies this session's verified live identities. Never guess IDs or substitute a native helper ID.
Finish the technical result/report and native todos. Submit the report and complete the exact native goal, or complete that goal then report. A report submitted before completion is staged, NOT delivered; the adapter sends it automatically after native completion succeeds. For failure, drop the assigned native goal without completing it; the staged failed report is sent after drop succeeds. Do not wait or poll while your report is staged: finalize the native goal next.
If a worker goal is complete but its Orca Task is still dispatched, inspect worker_read and send a status message to that same Dispatch to recover the missing report. Never create a replacement editor for that condition.
After a successful worker goal, send worker_done using orca and idle. For terminal failure, record blockers in todos, drop the native goal without completing it, report failed and idle. This ends automatic continuation while preserving the failed Orca attempt and native goal history.
On resume reconcile the existing goal, milestone/issue and Run/Task/Dispatch records before launching anything.
Never duplicate an uncertain launch. Process mail before acknowledgement and reuse/release settled workers.
`;

export default function activate(pi, dependencies = {}) {
  const run = dependencies.run ?? (async (args, signal) => {
    const binary = process.env.ORCA_CLI_COMMAND || '/usr/local/bin/orca-ide';
    let stdout;
    try { ({ stdout } = await execute(binary, args, { cwd: process.cwd(), env: process.env, signal,
      timeout: 180_000, maxBuffer: 4 * 1024 * 1024, windowsHide: true })); }
    catch (error) {
      // Failed starts carry residual resources and replay/recovery identities in
      // stdout. Never discard that receipt and invite a blind duplicate launch.
      if (!error.stdout) throw error;
      stdout = error.stdout;
    }
    // skills get returns Markdown even with --json.
    if (args[0] === 'skills') return { guide: stdout };
    const result = JSON.parse(stdout);
    return result.ok === true ? result.result : result;
  });
  let role = 'coordinator', launchRole, currentAssignment, authority, assignmentGoal, goal, pendingReport, lastReport, planningScope, delegation, coordinatorRunId, baselineTools, initialized = false, nativeChild = false;
  let executorReusePending = false;
  const plannerCalls = new Map();
  const xdevCalls = new Map();
  const isNative = ctx => nativeChild || ['sub','advisor'].includes(ctx?.agent?.kind);
  const parentTools = ['orca', 'orca_dispatch', 'git_inspect'];
  const requireParent = ctx => { if (isNative(ctx)) throw Error('Orca lifecycle tools belong to the owning session; return native helper results to the parent.'); };
  const z = pi.zod;
  const environment = dependencies.environment ?? process.env;
  const officeContext = () => pi.getAllTools().some(t => isOfficeTool(t.name)) ? [officeInstructions] : [];
  const reply = data => ({ content: [{ type: 'text', text: JSON.stringify(data) }], details: data,
    ...(data?.ok === false ? { isError: true } : {}) });
  const entries = ctx => ctx.sessionManager.getBranch?.() ?? ctx.sessionManager.getEntries?.() ?? [];
  function restore(ctx) {
    const branch = entries(ctx);
    const saved = branch.filter(e => e.type === 'custom' && e.customType === 'teck-orca-contract').at(-1)?.data;
    launchRole = saved?.launchRole ?? resolveRole(ctx.model, ctx.models);
    role = saved?.role ?? launchRole;
    currentAssignment = saved?.assignment;
    authority = saved?.authority;
    assignmentGoal = saved?.assignmentGoal;
    pendingReport = saved?.pendingReport;
    lastReport = saved?.lastReport;
    planningScope = role === 'planner' && currentAssignment ? createPlanningScope(currentAssignment.issue, saved?.planningScope) : undefined;
    delegation = saved?.delegation;
    coordinatorRunId = saved?.coordinatorRunId;
    const native = branch.filter(e => e.type === 'mode_change').at(-1);
    goal = native?.mode === 'goal' || native?.mode === 'goal_paused' ? native.data?.goal : undefined;
    if (!goal && assignmentGoal && ['complete', 'dropped'].includes(assignmentGoal.status)) goal = { ...assignmentGoal };
    initialized = true;
  }
  let presentationReady = true;
  const save = () => pi.appendEntry('teck-orca-contract', { version: 1, presentationReady, launchRole, role, assignment: currentAssignment, authority, assignmentGoal, pendingReport, lastReport, delegation, coordinatorRunId, planningScope: planningScope?.state() });
  const matchingGoal = () => authority && currentAssignment && goal && assignmentGoal &&
    assignmentGoal.dispatchId === authority.dispatchId && assignmentGoal.id === goal.id &&
    assignmentGoal.objective === currentAssignment.objective && goal.objective === currentAssignment.objective;
  const delegatedImplementation = () => delegation?.dispatchId === authority?.dispatchId && delegation?.goalId === goal?.id && !!delegation?.helperId;
  const families=new Map();
  function ownFamily(ctx) {
    if (!ctx.agent?.id) return;
    const family = { get scope(){return role === 'coordinator' || role === 'planner' ? 'researcher' : role;},
      started: helperId => { if (role === 'executor' && matchingGoal() && goal.status === 'active' && !delegatedImplementation()) {
        delegation = { dispatchId: authority.dispatchId, goalId: goal.id, helperId }; save();
      } } };
    nativeFamilies.set(ctx.agent.id,family);
    families.set(ctx.agent.id,family);
  }
  function nativeScope(ctx, starting=false) {
    const agent=ctx?.agent, inherited=nativeFamilies.get(agent?.parentId);
    const knownParent=families.get(agent?.id)?.knownParent||!!inherited;
    const named=agent?.name==='technical-planner'?'researcher':
      ['correctness-reviewer','security-auditor','security-reviewer','reviewer'].includes(agent?.name)?'reviewer':undefined;
    // Current OMP represents advisors as native subagents named/id'd "advisor".
    const isAdvisor=agent?.kind==='advisor'||agent?.id==='advisor'||agent?.name==='advisor';
    const getScope=()=>{
      if(agent?.parentId===agent?.id&&agent?.id)return 'unbound';
      const parent=nativeFamilies.get(agent?.parentId);
      if(knownParent&&!parent)return 'unbound';
      const current=parent?.scope;
      return current==='unbound'?'unbound':isAdvisor?'reviewer':named||current;
    };
    const scope=getScope();
    if(agent?.id){const family={get scope(){return getScope();},knownParent,started:inherited?.started};nativeFamilies.set(agent.id,family);families.set(agent.id,family);}
    if(starting&&agent?.name==='implementation-worker'&&inherited?.scope==='executor')inherited.started?.(agent.id);
    return scope;
  }
  async function* workerRecords(runId) {
    const seen = new Set();
    let cursor;
    do {
      // Default CLI JSON is a compact display projection. Binding requires the
      // full ownership records, including workers beyond the first 100 rows.
      const fleet = await run(['orchestration', 'worker-list', '--include-remote', '--json', '--full',
        ...(runId ? ['--run', runId] : []),
        ...(cursor ? ['--cursor', cursor] : [])]);
      if (runId && (!Array.isArray(fleet.workers) || typeof fleet.page?.hasMore !== 'boolean' ||
          fleet.page.hasMore && (typeof fleet.page.nextCursor !== 'string' || !fleet.page.nextCursor)))
        throw Error('Incomplete worker inventory cannot authorize child reuse.');
      for (const worker of fleet.workers ?? []) yield worker;
      cursor = fleet.page?.nextCursor;
      if (cursor && seen.has(cursor)) throw Error('Orca worker inventory repeated a pagination cursor; ownership could not be verified.');
      if (cursor) seen.add(cursor);
    } while (cursor);
  }
  async function bindWorker(ctx) {
    if (!environment.ORCA_PANE_KEY || !environment.ORCA_WORKTREE_ID) return false;
    for await (const worker of workerRecords()) {
      if (worker.resource?.worktreeId !== environment.ORCA_WORKTREE_ID || worker.dispatchStatus !== 'dispatched') continue;
      const receipt = await run(['orchestration', 'worker-show', '--dispatch', worker.dispatchId, '--json', '--full']);
      const dispatch = receipt.dispatch;
      const incarnation = receipt.terminal?.ptyId && receipt.terminal?.incarnationId ?
        `${receipt.terminal.ptyId}:${receipt.terminal.incarnationId}` : undefined;
      if (dispatch?.assigneePaneKey !== environment.ORCA_PANE_KEY || dispatch.capabilityRevokedAt ||
          dispatch.status !== 'dispatched' || dispatch.assigneeHandle !== worker.agentTerminalHandle ||
          receipt.observation?.exactWorker !== true || receipt.observation?.status !== 'live' ||
          !incarnation || dispatch.processIncarnation !== incarnation) continue;
      const tasks = await run(['orchestration', 'task-list', '--run', worker.runId, '--json', '--full']);
      const task = tasks.tasks?.find(t => t.id === worker.taskId && t.dispatch_id === worker.dispatchId && t.assignee_handle === dispatch.assigneeHandle);
      const match = task?.spec?.match(/^TECK_ORCA_ASSIGNMENT (\{[^\n]+\})$/m);
      if (!match) return false;
      const next = JSON.parse(match[1]); assignment(next);
      const verifiedRole = resolveRole(ctx.model, ctx.models, next.role);
      if (verifiedRole === 'coordinator') return false;
      if (authority?.dispatchId !== worker.dispatchId) { assignmentGoal = undefined; pendingReport = undefined; lastReport = undefined; planningScope = undefined; delegation = undefined; plannerCalls.clear(); }
      role = verifiedRole; launchRole = verifiedRole === 'publisher' ? 'executor' : verifiedRole; currentAssignment = next;
      if (role === 'planner') planningScope ??= createPlanningScope(next.issue);
      authority = { taskId: worker.taskId, dispatchId: worker.dispatchId, handle: dispatch.assigneeHandle, runId: worker.runId };
      save();
      return true;
    }
    return false;
  }
  async function tools(ctx) {
    const available = pi.getAllTools().map(t => t.name);
    const active = baselineTools ??= pi.getActiveTools();
    // Every role retains native task/wait and agent:// messaging. Arbitrary
    // eval is exposed only to an editing executor.
    const names = [...new Set([...active.filter(n => permittedTool(role, n, {})), 'read', 'goal', 'todo', 'orca',
      ...(permittedTool(role,'git_inspect',{})?['git_inspect']:[]),
      ...(role === 'coordinator' ? ['orca_dispatch'] : [])])];
    for (const name of ['task', 'wait', 'write', ...(role==='executor'?['eval']:[])]) if (available.includes(name)) names.push(name);
    for (const name of available.filter(isOfficeTool)) names.push(name);
    if(['planner','researcher','reviewer','publisher'].includes(role)&&available.includes('lsp'))names.push('lsp');
    // Argument-sensitive tools stay visible; tool_call is the authoritative boundary.
    for (const name of available) if (/github/.test(name) && (isPlanningTool(name) || ['pull_request_read', 'manage_project', 'manage_issues', 'manage_milestones', 'manage_labels', 'manage_status_updates']
      .some(suffix => name.endsWith(suffix)))) names.push(name);
    await pi.setActiveTools([...new Set(names)]);
  }
  pi.on('session_start', async (_event, ctx) => {
    nativeChild = ['sub','advisor'].includes(ctx?.agent?.kind);
    if (nativeChild) {
      // OMP rebinds this factory per helper. Preserve its agent preset and own
      // lifecycle instead of claiming the parent's pane/Dispatch/goal.
      const scope=nativeScope(ctx);
      await pi.setActiveTools([...new Set([...pi.getActiveTools().filter(name => !parentTools.includes(name)&&
        (!scope||name==='yield'||permittedTool(scope,name,{})||name==='lsp'&&['researcher','reviewer','publisher'].includes(scope))),
        ...pi.getAllTools().map(t=>t.name).filter(isOfficeTool)])]);
      return;
    }
    restore(ctx); presentationReady = false; save();
    // Resolve the exact Dispatch before observers publish a provisional role.
    // This uses the same public ownership check as before_agent_start; no
    // prompt/model alias can mint worker authority or an office seat.
    try {
      const bound = await bindWorker(ctx);
      // A newly spawned pane can start before Orca attaches its Dispatch.
      // Do not publish the coordinator fallback during the existing recovery
      // window. Restored goals and already verified workers need no delay.
      presentationReady = bound || !!goal || !environment.ORCA_PANE_KEY || !environment.ORCA_WORKTREE_ID || !ctx.setTimeout;
    }
    catch { presentationReady = false; /* No provisional office seat on a failed lookup. */ }
    save();
    await tools(ctx);ownFamily(ctx);
    // Orca may accept terminal input before OMP finishes starting. Recover only
    // this pane's exact live assignment via public records, then deliver through
    // OMP's own queue after startup. Never replay a task already started/settled.
    if (ctx.setTimeout) ctx.setTimeout(async () => {
      const recoverInput = !goal && !ctx.hasPendingMessages?.() && ctx.isIdle?.();
      let bound;
      try { bound = await bindWorker(ctx); presentationReady = true; save(); }
      catch { presentationReady = false; save(); return; }
      if (bound && recoverInput) {
        pi.sendUserMessage(`${assignment(currentAssignment)}\nLive Orca task ${authority.taskId}, Dispatch ${authority.dispatchId}, handle ${authority.handle}.\n` +
          'The extension verified this pane owns the active Dispatch. Use the structured orca report/check/ask actions; lifecycle IDs are supplied from that verified binding.');
      }
    }, 1500);
  });
  for (const event of ['session_switch', 'session_branch', 'session_tree']) pi.on(event, async (_event, ctx) => { if (isNative(ctx)) return; restore(ctx); await tools(ctx);ownFamily(ctx); });
  pi.on('session_shutdown',(_event,ctx)=>{
    const ids=ctx.agent?.id==='advisor'?['advisor']:[...families.keys()];
    for(const id of ids)if(nativeFamilies.get(id)===families.get(id)){nativeFamilies.delete(id);families.delete(id);}
    xdevCalls.clear();
  });
  pi.on('before_agent_start', async (event, ctx) => {
    if (isNative(ctx)) { const scope=nativeScope(ctx,true);return { systemPrompt: [...event.systemPrompt, ...officeContext(),
      `You are a native OMP helper${scope?` within the ${scope} boundary`:''}. Follow your parent assignment, agent preset and permissions. Native delegation is allowed as needed. Return evidence/results to the parent; it owns its Orca Task/Dispatch, native goal and final settlement. Do not claim or settle the parent session's lifecycle. This helper does not need another implementation-worker before using its own permitted tools.`] }; }
    if (!initialized) restore(ctx);
    // Prompt text cannot mint authority, change role or narrow the assignment.
    let bound = false;
    try { bound = await bindWorker(ctx); presentationReady = true; save(); }
    catch { presentationReady = false; /* Unreachable authority must not preserve a previous editing grant. */ }
    if (!bound && authority) {
      role = 'unbound'; currentAssignment = undefined; authority = undefined; save();
    }
    await tools(ctx);
    ownFamily(ctx);
    return { systemPrompt: [...event.systemPrompt, instructions, ...officeContext(),
      `Current fixed role: ${role}. ${currentAssignment ? `Assigned native goal: ${JSON.stringify(currentAssignment.objective)}. Acceptance: ${JSON.stringify(currentAssignment.acceptance)}.` :
        'Before substantial delivery work create the authorized native goal. Do not invent or select a different GitHub milestone.'}`,
      ...(authority?[`Verified Orca Run ${authority.runId}, Task ${authority.taskId}, Dispatch ${authority.dispatchId}, handle ${authority.handle}. Structured orca report/check/ask calls supply their own lifecycle IDs; omit those fields instead of guessing.`]:[])] };
  });
  pi.on('goal_updated', (event, ctx) => { if (!isNative(ctx)) goal = event.goal ?? undefined; });
  pi.on('tool_result', async (event, ctx) => {
    if (isNative(ctx)) return;
    const transportDetails=event.details;
    const mountedName=xdevCalls.get(event.toolCallId);xdevCalls.delete(event.toolCallId);
    if(mountedName&&event.toolName==='write'&&event.details?.xdev?.tool===mountedName){
      event={...event,toolName:mountedName,details:event.details.xdev.inner};
    }
    const planningCall = plannerCalls.get(event.toolCallId);
    if (planningCall) {
      plannerCalls.delete(event.toolCallId);
      if (role === 'planner' && planningScope && planningCall.dispatchId === authority?.dispatchId) {
        planningScope.observe(event.toolName, planningCall.input, event); save();
      }
    }
    // Bind only a successfully CREATED native goal, never an accounting update,
    // failed create, unrelated resumed goal or a status copied from a prompt.
    const data = event.details;
    if (event.toolName === 'goal' && !event.isError && data?.op === 'create' &&
        authority && currentAssignment && data.goal?.id && data.goal.objective === currentAssignment.objective) {
      assignmentGoal = { id: data.goal.id, dispatchId: authority.dispatchId, objective: currentAssignment.objective };
      goal = data.goal; save();
    }
    if (event.toolName === 'goal' && !event.isError && ['complete', 'drop'].includes(data?.op) &&
        assignmentGoal?.id === data.goal?.id && matchingGoal()) {
      goal = data.goal;
      assignmentGoal.status = data.goal.status; save();
      if (pendingReport) {
        const result = await flushReport();
        const details={ ...data, orchestrationReport: result };
        return { content: [...event.content, { type: 'text', text: JSON.stringify(result) }],
          details: mountedName?{...transportDetails,xdev:{...transportDetails.xdev,inner:details}}:details,
          additionalContext: result.staged ? 'The native goal is finalized but its Orca report is still pending. Retry only the report, not implementation.' :
            'The staged Orca worker_done was accepted after native goal finalization. End this dispatched turn and idle; do not poll or report twice.' };
      }
    }
  });
  pi.on('tool_call', (event, ctx) => {
    let { toolName: name, input = {} } = event;
    let transport;
    if(['read','write'].includes(name)&&String(input.path??'').startsWith('xd://')){
      // OMP mounts discoverable built-ins, extensions and MCP tools at exact
      // registered names. Decode this transport, then apply the very same
      // tool/argument/role checks. A mounted route cannot mint a permission.
      if(name==='read'&&input.path==='xd://')return; // metadata listing only
      const route=/^xd:\/\/([A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)*)$/.exec(input.path);
      const registered=new Set([...pi.getAllTools().map(t=>t.name),'orca','orca_dispatch','git_inspect']);
      if(name==='read'&&route&&!route[1].split('/').some(p=>p==='.'||p==='..')&&
          [...registered].some(tool=>route[1]===tool||route[1].startsWith(tool+'/')))return; // registered metadata topics
      if(!route||!registered.has(route[1]))return{block:true,reason:'Use an exact registered tool route; unknown XDev bridges are not allowed.'};
      if(name==='read')return; // documentation only; execution uses write+JSON
      try{
        if(typeof input.content!=='string')throw Error();
        transport=input;
        input=JSON.parse(input.content);
        if(!input||typeof input!=='object'||Array.isArray(input))throw Error();
        name=route[1];
      }catch{return{block:true,reason:'The registered Orca endpoint requires one JSON argument object.'};}
    }
    // Presence and presentation remain usable before goal creation, after
    // completion and while waiting; they never authorize implementation.
    if (isOfficeTool(name)) return;
    if (isNative(ctx)) {
      if (parentTools.includes(name)) return { block: true, reason: 'Return native helper results to the parent; its Orca lifecycle belongs to the owning session.' };
      const scope=nativeScope(ctx);
      if (scope && name !== 'yield' && !permittedTool(scope, name, input))
        return { block: true, reason: `Native helper is within the ${scope} boundary. Return findings/results to the parent; delegation does not grant broader tools or publication authority.` };
      return;
    }
    if (!permittedTool(role, name, input)) return { block: true, reason: `${role}: ${name} is outside this role. Dispatch the appropriate Orca worker.` };
    if (role !== 'coordinator' && !currentAssignment && !['orca', 'read'].includes(name))
      return { block: true, reason: 'This worker needs an Orca assignment and live Task/Dispatch before starting a native goal or implementation.' };
    let revision;
    if (name === 'goal' && input.op === 'create' && currentAssignment) {
      // Native pre-execution argument revision prevents scope/budget guessing
      // loops while still creating a genuine OMP goal with its own runtime.
      revision = { ...input, objective: currentAssignment.objective };
      if (currentAssignment.token_budget === undefined) delete revision.token_budget;
      else revision.token_budget = currentAssignment.token_budget;
    }
    if (name === 'orca') {
      let args;
      try { args = coordinationAction(withAuthority(input), role); } catch (error) { return { block: true, reason: error.message }; }
      if (input.action === 'report' && !matchingGoal()) return { block: true, reason: 'The report is NOT delivered: it requires the exact native goal created for this Dispatch. An unrelated completed/resumed goal is not acceptance.' };
    }
    if (name === 'orca_dispatch') {
      try { dispatchPlacement(input); } catch (error) { return { block: true, reason: error.message }; }
    }
    if (role !== 'coordinator' && name === 'goal' && ['complete', 'drop', 'resume'].includes(input.op) && !matchingGoal())
      return { block: true, reason: 'This native goal is not bound to the current Dispatch; preserve it and report the mismatch. Do not complete or discard unrelated goals.' };
    if (!['goal', 'todo', 'read', 'orca', 'ask'].includes(name) &&
        (goal?.status !== 'active' || role !== 'coordinator' && !matchingGoal()))
      return { block: true, reason: 'Create/resume the native goal before work. A completed, paused or budget-limited goal does not authorize further work.' };
    if(role==='executor'&&!delegatedImplementation()&&(implementationTool(name,input)||name==='goal'&&input.op==='complete'))
      return {block:true,reason:'Delegate the assigned implementation to a native implementation-worker with task first. Wait for its actual turn to start; the executor parent then integrates and verifies its evidence. A queued receipt alone is insufficient.'};
    if (role === 'planner' && isPlanningWrite(name) && !planningScope?.allows(name, input))
      return { block: true, reason: 'Planner writes are limited to the assigned issue subtree in its repository. Read back existing/created children before using their IDs; closure, reparenting and publication remain outside this assignment.' };
    if (role === 'planner' && /github/.test(name) && event.toolCallId)
      plannerCalls.set(event.toolCallId, { input, dispatchId: authority?.dispatchId });
    if(transport&&event.toolCallId)xdevCalls.set(event.toolCallId,name);
    if (revision) return { input: transport?{...transport,content:JSON.stringify(revision)}:revision };
  });
  function withAuthority(input) {
    if (role === 'coordinator') return input;
    if (!authority && ['report', 'message', 'ask', 'check'].includes(input.action)) throw Error('No verified live Orca Dispatch is bound to this worker');
    const result = { ...input };
    if (['report', 'message', 'ask', 'check'].includes(input.action) && authority) {
      for (const [key, value] of [['from', authority.handle], ['task_id', authority.taskId], ['dispatch_id', authority.dispatchId]]) {
        if (result[key] && result[key] !== value) throw Error('Lifecycle identity differs from this pane\'s verified live Dispatch');
        result[key] = value;
      }
    }
    return result;
  }
  async function flushReport(signal) {
    if (!pendingReport) return lastReport?.receipt ?? { staged: false };
    if (!matchingGoal() || pendingReport.dispatchId !== authority.dispatchId || pendingReport.goalId !== goal.id)
      throw Error('Pending report no longer matches this Dispatch/native goal');
    const status = pendingReport.input.outcome === 'succeeded' ? 'complete' : 'dropped';
    if (goal.status !== status) return { staged: true, next: status === 'complete' ? 'Complete the exact native goal now; its staged report is sent automatically afterward.' :
      'Record blockers and drop the assigned native goal without completing it; its staged failed report is sent automatically afterward.' };
    const args = coordinationAction(withAuthority(pendingReport.input), role);
    args.push('--retry-request', pendingReport.requestId);
    let result;
    try { result = await run(args, signal); }
    catch (error) { return { staged: true, error: error.message, retryRequest: pendingReport.requestId }; }
    if (result?.ok === false) return { staged: true, receipt: result, retryRequest: pendingReport.requestId };
    lastReport = { dispatchId: authority.dispatchId, receipt: result };
    pendingReport = undefined; save();
    return result;
  }
  pi.registerTool({ name: 'orca', label: 'Orca coordination', approval: 'write', strict: true,
    description: 'Structured public Orca coordination. guide reads lifecycle rules; run_create creates and binds the Run; check waits for mail; worker_list/show/read inspect existing workers; worker_release settles cleanup; report sends worker_done. Use orca_dispatch to launch workers. Preserve live Task/Dispatch/handle IDs.',
    parameters: z.object({ action: z.enum(coordinationActions), topic: z.enum(['orca-cli', 'orchestration']).optional(),
      objective: z.string().optional(), id: z.string().optional(), run: z.string().optional(),
      dispatch_id: z.string().optional(), task_id: z.string().optional(), from: z.string().optional(), to: z.string().optional(),
      subject: z.string().optional(), body: z.string().optional(), type: z.enum(messageTypes.filter(type => type !== 'worker_done')).optional(),
      outcome: z.enum(['succeeded', 'failed']).optional(), phase: z.string().optional(),
      types: z.string().optional(), ack: z.string().optional(), resume: z.string().optional(), timeout_ms: z.number().optional(), limit: z.number().optional(),
      worktree: z.string().optional(), issue: z.string().optional(), reference: z.string().optional() }),
    async execute(_id, input, signal, _update, ctx) {
      requireParent(ctx);
      if (input.action === 'report') {
        withAuthority(input);
        if (lastReport?.dispatchId === authority?.dispatchId) return reply(lastReport.receipt);
        if (!matchingGoal()) throw Error('A report requires this Dispatch\'s exact native goal');
        if (pendingReport && pendingReport.input.outcome !== input.outcome) throw Error('A report with a different outcome is already staged; reconcile the original report instead of changing its outcome.');
        if (!pendingReport) pendingReport = { input: withAuthority(input), goalId: goal.id, dispatchId: authority.dispatchId, requestId: randomUUID() };
        save();
        return reply(await flushReport(signal));
      }
      const result=await run(coordinationAction(withAuthority(input), role), signal);
      const runId=result?.run?.id??result?.runId??result?.id??(input.action==='run_use'?input.id:undefined);
      if(role==='coordinator'&&['run_create','run_use'].includes(input.action)&&result?.ok!==false){
        coordinatorRunId=typeof runId==='string'&&/^run_[A-Za-z0-9_-]+$/.test(runId)?runId:undefined;save();
      }
      return reply(result);
    },
  });
  async function labelDispatchedWorker(result, title, signal) {
    if (!result || result.ok === false) return result;
    const dispatchId = result.dispatchId ?? result.dispatch?.id;
    const naming = { title, pane: 'skipped', tab: 'skipped' };
    if (typeof dispatchId !== 'string' || !/^ctx_[A-Za-z0-9_-]+$/.test(dispatchId)) return { ...result, naming };
    const deadline = AbortSignal.timeout(5000);
    const bounded = signal ? AbortSignal.any([signal, deadline]) : deadline;
    let handle, worktreeId;
    try {
      const worker = await run(['orchestration', 'worker-show', '--dispatch', dispatchId, '--json', '--full'], bounded);
      handle = worker.dispatch?.assigneeHandle; worktreeId = worker.terminal?.worktreeId;
      if (worker.dispatch?.id !== dispatchId || worker.dispatch.status !== 'dispatched' ||
          worker.observation?.exactWorker !== true || worker.observation.status !== 'live' ||
          typeof handle !== 'string' || !/^term_[A-Za-z0-9_-]+$/.test(handle) || !worktreeId ||
          worker.terminal?.handle && worker.terminal.handle !== handle) return { ...result, naming };
    } catch {
      naming.pane = 'unavailable';
      naming.warning = 'Naming unavailable; preserve this Dispatch. Do not launch a replacement to fix its label.';
      return { ...result, naming };
    }
    // Tab metadata can work on a headless server even when pane-title routing
    // to the desktop is unavailable. Keep these independent and bounded.
    try {
      const list = await run(['terminal', 'list', '--worktree', `id:${worktreeId}`, '--limit', '100', '--include-visual-layouts', '--json'], bounded);
      if (canRenameWorkerTab(list, handle, worktreeId)) {
        const tab = await run(['terminal', 'rename', '--terminal', handle, '--title', title, '--json'], bounded);
        naming.tab = tab?.ok === false ? 'unavailable' : 'updated';
      }
    } catch { naming.tab = 'unavailable'; }
    try {
      const pane = await run(['terminal', 'set-pane-title', '--terminal', handle, '--title', title, '--json'], bounded);
      naming.pane = pane?.ok === false ? 'unavailable' : 'updated';
    } catch { naming.pane = 'unavailable'; }
    if ([naming.pane, naming.tab].includes('unavailable'))
      naming.warning = 'Some labels unavailable; preserve this Dispatch. Do not launch a replacement to fix its label.';
    return { ...result, naming };
  }
  pi.registerTool({ name: 'orca_dispatch', label: 'Dispatch Orca goal', approval: 'write', strict: true,
    description: 'Assign an acceptance-bounded native OMP goal using existing model roles. New executors, including integration workers, use new-child; exact settled child-terminal reuse is checked. Start ready tasks only; inspect uncertain receipts before retry.',
    parameters: z.object({ role: z.enum(['executor', 'planner', 'researcher', 'reviewer', 'publisher']), objective: z.string().describe('Observable deliverable only. Keep lifecycle/reporting instructions in constraints, not the native goal objective.'),
      issue: z.string().optional(), acceptance: z.array(z.string()).min(1), constraints: z.string(),
      worktree: z.string().optional().describe('Executors default to new-child. Reuse needs exact id:<child> plus its settled terminal. Other roles require an explicit snapshot checkout.'),
      title: z.string().optional().describe('Short description for the GUI, e.g. Verify Billing finalize. Issue number and role are added automatically.'),
      name: z.string().optional().describe('Optional readable slug for a new child worktree; defaults to issue, role and task title with a unique suffix.'), run: z.string().optional(), deps: z.array(z.string()).optional(),
      token_budget: z.number().int().positive().optional(),
      terminal: z.string().optional(), retry_request: z.string().optional() }),
    async execute(_id, input, signal, _update, ctx) {
      requireParent(ctx);
      if (role !== 'coordinator' || goal?.status !== 'active') throw Error('An active coordinator goal is required');
      const placement = dispatchPlacement(input);
      if (placement.reuse) {
        if (executorReusePending) throw Error('Another child reuse is in progress; reconcile its dispatch receipt before retrying.');
        executorReusePending = true;
      }
      try {
        if (placement.reuse) {
          if (!coordinatorRunId || input.run && input.run !== coordinatorRunId) throw Error('Bind the owning Orca Run before child reuse; the requested Run must match.');
          const parentId = environment.ORCA_WORKTREE_ID;
          if (!parentId) throw Error('The coordinator worktree identity is required for child reuse.');
          const parent = await run(['worktree', 'show', '--worktree', `id:${parentId}`, '--json'], signal);
          const child = await run(['worktree', 'show', '--worktree', placement.worktree, '--json'], signal);
          const workers = [];
          for await (const worker of workerRecords(coordinatorRunId)) workers.push(worker);
          verifyExecutorReuse(input, { parent: parent.worktree, child: child.worktree, workers, parentId, runId: coordinatorRunId });
        }
        const model = ctx.models.resolve(`@${workerRoles[input.role]}`);
        if (!model) throw Error(`Configured OMP ${workerRoles[input.role]} model is unavailable`);
        const suffix = input.retry_request ? createHash('sha256').update(input.retry_request).digest('hex').slice(0, 8) : randomUUID().slice(0, 8);
        const labels = dispatchLabels(input, suffix);
        const args = ['orchestration', 'worker-start', '--spec', assignment({ ...input, worktree: placement.worktree }), '--task-title', labels.title,
          '--worktree', placement.worktree, ...(input.terminal ? ['--terminal', input.terminal] :
            ['--agent', 'omp', '--model', `${model.provider}/${model.id}`]), '--json'];
        if (['new-child','new-top-level'].includes(placement.worktree)) args.push('--name', labels.name, '--display-name', labels.title);
        if (input.run) args.push('--run', input.run);
        if (input.deps?.length) args.push('--deps', JSON.stringify(input.deps));
        if (input.retry_request) args.push('--retry-request', input.retry_request);
        const result = await run(args, signal);
        return reply(await labelDispatchedWorker(result, labels.title, signal));
      } finally { if (placement.reuse) executorReusePending = false; }
    },
  });
  pi.registerTool({ name: 'git_inspect', label: 'Inspect review snapshot', approval: 'read', strict: true,
    description: 'Read-only local Git status and diff for the assigned reviewer/publication worker. No network, external diff or textconv.',
    parameters: z.object({ base: z.string().optional(), head: z.string().optional() }),
    async execute(_id, input, signal) {
      if (!['executor', 'reviewer', 'publisher'].includes(role)) throw Error('Snapshot inspection is outside this role');
      const refs = [input.base, input.head].filter(Boolean);
      if (refs.some(ref => !/^[A-Za-z0-9_./~^@{}-]+$/.test(ref) || ref.startsWith('-'))) throw Error('Invalid review revision');
      const options = { signal, timeout: 30_000, maxBuffer: 4 * 1024 * 1024, windowsHide: true };
      const git = ['--no-pager', '-c', 'core.fsmonitor=false', '-c', 'core.hooksPath=/dev/null'];
      const status = await execute('git', [...git, 'status', '--porcelain=v1'], options);
      const diff = await execute('git', [...git, 'diff', '--no-ext-diff', '--no-textconv', ...refs, '--'], options);
      const working = await execute('git', [...git, 'diff', '--no-ext-diff', '--no-textconv', 'HEAD', '--'], options);
      const head = await execute('git', [...git, 'rev-parse', '--verify', 'HEAD'], options);
      const untracked = await execute('git', [...git, 'ls-files', '--others', '--exclude-standard', '-z'], options);
      const files = {};
      for (const path of untracked.stdout.split('\0').filter(Boolean)) {
        const full = join(process.cwd(), path), stat = lstatSync(full);
        if (stat.size > 10 * 1024 * 1024) throw Error('Untracked review file exceeds 10 MiB; narrow the snapshot explicitly');
        const bytes = stat.isSymbolicLink() ? readlinkSync(full) : readFileSync(full);
        files[path] = createHash('sha256').update(bytes).digest('hex');
      }
      const snapshot = { head: head.stdout.trim(), status: status.stdout, diff: diff.stdout, workingDiff: working.stdout, untracked: files };
      return reply({ ...snapshot, fingerprint: createHash('sha256').update(JSON.stringify(snapshot)).digest('hex') });
    },
  });
}
