import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash, randomUUID } from 'node:crypto';
import { lstatSync, readFileSync, readlinkSync } from 'node:fs';
import { join } from 'node:path';
import { assignment, coordinationAction, coordinationActions, messageTypes, permittedTool, resolveRole, workerRoles, isPlanningWrite, isPlanningTool } from './lib/orca-policy.mjs';
import { createPlanningScope } from './lib/github-plan-scope.mjs';

const execute = promisify(execFile);
const instructions = `Teck Orca role contract:
The coordinator only plans and manages GitHub metadata, Orca Tasks/Dispatches and messages.
Never inspect source, implement, integrate code, run tests or publish code as coordinator.
Workers are not coordinators: implement only their assigned scope using their role's allowed tools.
Use orca_dispatch(role=planner,issue=<authorized parent issue URL>) to delegate canonical GitHub planning writes on the existing slow model role. One plan writer at a time: the coordinator pauses its plan edits while the planner owns the assignment. Planners create/reuse children, record acceptance/test expectations and real dependencies, and return exact issue IDs and read-back evidence. Researchers and native technical-planner research helpers remain read-only. The coordinator checks the returned graph before dispatching execution.
If an executor finds a missed blocker, diagnose the failing layer and report evidence, the affected acceptance criterion, prerequisite/decision and proposed next action. Keep its goal incomplete. The coordinator sends only the affected question to planner/researcher, revises real dependency edges and runs ready prerequisite work while unrelated work continues. Resume the existing assignment when viable; do not rebuild the whole plan or turn every failed command into an issue.
All roles may use native OMP task/eval subagents as needed for their assignment.
Assign canonical execution issues/sub-issues to Orca executors with bounded goals. Every role may use native helpers for its scoped work; helpers do not replace the tracked primary executor.
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
Workers report with orca(action=report,from=<live handle>,task_id=<live Task>,dispatch_id=<live Dispatch>,outcome=succeeded|failed,subject=...,body=...).
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
  let role = 'coordinator', launchRole, currentAssignment, authority, assignmentGoal, goal, pendingReport, lastReport, planningScope, baselineTools, initialized = false, nativeChild = false;
  const plannerCalls = new Map();
  const isNative = ctx => nativeChild || ctx?.agent?.kind === 'sub';
  const parentTools = ['orca', 'orca_dispatch', 'git_inspect'];
  const requireParent = ctx => { if (isNative(ctx)) throw Error('Orca lifecycle tools belong to the owning session; return native helper results to the parent.'); };
  const z = pi.zod;
  const environment = dependencies.environment ?? process.env;
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
    const native = branch.filter(e => e.type === 'mode_change').at(-1);
    goal = native?.mode === 'goal' || native?.mode === 'goal_paused' ? native.data?.goal : undefined;
    if (!goal && assignmentGoal && ['complete', 'dropped'].includes(assignmentGoal.status)) goal = { ...assignmentGoal };
    initialized = true;
  }
  const save = () => pi.appendEntry('teck-orca-contract', { version: 1, launchRole, role, assignment: currentAssignment, authority, assignmentGoal, pendingReport, lastReport, planningScope: planningScope?.state() });
  const matchingGoal = () => authority && currentAssignment && goal && assignmentGoal &&
    assignmentGoal.dispatchId === authority.dispatchId && assignmentGoal.id === goal.id &&
    assignmentGoal.objective === currentAssignment.objective && goal.objective === currentAssignment.objective;
  async function bindWorker(ctx) {
    if (!environment.ORCA_PANE_KEY || !environment.ORCA_WORKTREE_ID) return false;
    const fleet = await run(['orchestration', 'worker-list', '--include-remote', '--json']);
    for (const worker of fleet.workers ?? []) {
      if (worker.resource?.worktreeId !== environment.ORCA_WORKTREE_ID || worker.dispatchStatus !== 'dispatched') continue;
      const receipt = await run(['orchestration', 'worker-show', '--dispatch', worker.dispatchId, '--json']);
      const dispatch = receipt.dispatch;
      const incarnation = receipt.terminal?.ptyId && receipt.terminal?.incarnationId ?
        `${receipt.terminal.ptyId}:${receipt.terminal.incarnationId}` : undefined;
      if (dispatch?.assigneePaneKey !== environment.ORCA_PANE_KEY || dispatch.capabilityRevokedAt ||
          dispatch.status !== 'dispatched' || dispatch.assigneeHandle !== worker.agentTerminalHandle ||
          receipt.observation?.exactWorker !== true || receipt.observation?.status !== 'live' ||
          !incarnation || dispatch.processIncarnation !== incarnation) continue;
      const tasks = await run(['orchestration', 'task-list', '--run', worker.runId, '--json']);
      const task = tasks.tasks?.find(t => t.id === worker.taskId && t.dispatch_id === worker.dispatchId && t.assignee_handle === dispatch.assigneeHandle);
      const match = task?.spec?.match(/^TECK_ORCA_ASSIGNMENT (\{[^\n]+\})$/m);
      if (!match) return false;
      const next = JSON.parse(match[1]); assignment(next);
      const verifiedRole = resolveRole(ctx.model, ctx.models, next.role);
      if (verifiedRole === 'coordinator') return false;
      if (authority?.dispatchId !== worker.dispatchId) { assignmentGoal = undefined; pendingReport = undefined; lastReport = undefined; planningScope = undefined; plannerCalls.clear(); }
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
    // Native task/eval remain available alongside the root session's goal tools.
    const names = [...new Set([...active.filter(n => permittedTool(role, n, {})), 'read', 'goal', 'todo', 'orca', 'git_inspect',
      ...(role === 'coordinator' ? ['orca_dispatch'] : [])])];
    for (const name of ['task', 'eval', 'wait', 'write']) if (available.includes(name)) names.push(name);
    // Argument-sensitive tools stay visible; tool_call is the authoritative boundary.
    for (const name of available) if (/github/.test(name) && (isPlanningTool(name) || ['pull_request_read', 'manage_project', 'manage_issues', 'manage_milestones', 'manage_labels', 'manage_status_updates']
      .some(suffix => name.endsWith(suffix)))) names.push(name);
    await pi.setActiveTools([...new Set(names)]);
  }
  pi.on('session_start', async (_event, ctx) => {
    nativeChild = ctx?.agent?.kind === 'sub';
    if (nativeChild) {
      // OMP rebinds this factory per helper. Preserve its agent preset and own
      // lifecycle instead of claiming the parent's pane/Dispatch/goal.
      await pi.setActiveTools(pi.getActiveTools().filter(name => !parentTools.includes(name)));
      return;
    }
    restore(ctx); save(); await tools(ctx);
    // Orca may accept terminal input before OMP finishes starting. Recover only
    // this pane's exact live assignment via public records, then deliver through
    // OMP's own queue after startup. Never replay a task already started/settled.
    if (ctx.setTimeout) ctx.setTimeout(async () => {
      if (goal || ctx.hasPendingMessages?.() || !ctx.isIdle?.()) return;
      if (await bindWorker(ctx)) {
        pi.sendUserMessage(`${assignment(currentAssignment)}\nLive Orca task ${authority.taskId}, Dispatch ${authority.dispatchId}, handle ${authority.handle}.\n` +
          'The extension verified this pane owns the active Dispatch. Use the structured orca report/check/ask actions; lifecycle IDs are supplied from that verified binding.');
      }
    }, 1500);
  });
  for (const event of ['session_switch', 'session_branch', 'session_tree']) pi.on(event, async (_event, ctx) => { if (isNative(ctx)) return; restore(ctx); await tools(ctx); });
  pi.on('before_agent_start', async (event, ctx) => {
    if (isNative(ctx)) return { systemPrompt: [...event.systemPrompt,
      'You are a native OMP helper. Follow your parent assignment, agent preset and permissions. Native delegation is allowed as needed. Return evidence/results to the parent; it owns its Orca Task/Dispatch, native goal and final settlement. Do not claim or settle the parent session\'s lifecycle.'] };
    if (!initialized) restore(ctx);
    // Prompt text cannot mint authority, change role or narrow the assignment.
    let bound = false;
    try { bound = await bindWorker(ctx); }
    catch { /* Unreachable authority must not preserve a previous editing grant. */ }
    if (!bound && authority) {
      role = 'unbound'; currentAssignment = undefined; authority = undefined; save();
    }
    await tools(ctx);
    return { systemPrompt: [...event.systemPrompt, instructions,
      `Current fixed role: ${role}. ${currentAssignment ? `Assigned native goal: ${JSON.stringify(currentAssignment.objective)}. Acceptance: ${JSON.stringify(currentAssignment.acceptance)}.` :
        'Before substantial delivery work create the authorized native goal. Do not invent or select a different GitHub milestone.'}`] };
  });
  pi.on('goal_updated', (event, ctx) => { if (!isNative(ctx)) goal = event.goal ?? undefined; });
  pi.on('tool_result', async (event, ctx) => {
    if (isNative(ctx)) return;
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
        return { content: [...event.content, { type: 'text', text: JSON.stringify(result) }], details: { ...data, orchestrationReport: result },
          additionalContext: result.staged ? 'The native goal is finalized but its Orca report is still pending. Retry only the report, not implementation.' :
            'The staged Orca worker_done was accepted after native goal finalization. End this dispatched turn and idle; do not poll or report twice.' };
      }
    }
  });
  pi.on('tool_call', (event, ctx) => {
    const { toolName: name, input = {} } = event;
    if (isNative(ctx)) {
      if (parentTools.includes(name)) return { block: true, reason: 'Return native helper results to the parent; its Orca lifecycle belongs to the owning session.' };
      if (ctx?.agent?.name === 'technical-planner' && name !== 'yield' && !permittedTool('researcher', name, input))
        return { block: true, reason: 'Native planning research is read-only. Return findings to the assigned Orca planner for canonical GitHub writes.' };
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
    if (role !== 'coordinator' && name === 'goal' && ['complete', 'drop', 'resume'].includes(input.op) && !matchingGoal())
      return { block: true, reason: 'This native goal is not bound to the current Dispatch; preserve it and report the mismatch. Do not complete or discard unrelated goals.' };
    if (!['goal', 'todo', 'read', 'orca', 'ask'].includes(name) &&
        (goal?.status !== 'active' || role !== 'coordinator' && !matchingGoal()))
      return { block: true, reason: 'Create/resume the native goal before work. A completed, paused or budget-limited goal does not authorize further work.' };
    if (role === 'planner' && isPlanningWrite(name) && !planningScope?.allows(name, input))
      return { block: true, reason: 'Planner writes are limited to the assigned issue subtree in its repository. Read back existing/created children before using their IDs; closure, reparenting and publication remain outside this assignment.' };
    if (role === 'planner' && /github/.test(name) && event.toolCallId)
      plannerCalls.set(event.toolCallId, { input, dispatchId: authority?.dispatchId });
    if (revision) return { input: revision };
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
      return reply(await run(coordinationAction(withAuthority(input), role), signal));
    },
  });
  pi.registerTool({ name: 'orca_dispatch', label: 'Dispatch Orca goal', approval: 'write', strict: true,
    description: 'Assign an acceptance-bounded native OMP goal to a visible Orca worker using the existing configured task/slow/advisor roles. Start ready tasks only; inspect uncertain receipts before retry.',
    parameters: z.object({ role: z.enum(['executor', 'planner', 'researcher', 'reviewer', 'publisher']), objective: z.string().describe('Observable deliverable only. Keep lifecycle/reporting instructions in constraints, not the native goal objective.'),
      issue: z.string().optional(), acceptance: z.array(z.string()).min(1), constraints: z.string(), worktree: z.string(),
      name: z.string().optional(), run: z.string().optional(), deps: z.array(z.string()).optional(),
      token_budget: z.number().int().positive().optional(),
      terminal: z.string().optional(), retry_request: z.string().optional() }),
    async execute(_id, input, signal, _update, ctx) {
      requireParent(ctx);
      if (role !== 'coordinator' || goal?.status !== 'active') throw Error('An active coordinator goal is required');
      const model = ctx.models.resolve(`@${workerRoles[input.role]}`);
      if (!model) throw Error(`Configured OMP ${workerRoles[input.role]} model is unavailable`);
      const args = ['orchestration', 'worker-start', '--spec', assignment(input), '--task-title', input.objective,
        '--worktree', input.worktree, ...(input.terminal ? ['--terminal', input.terminal] :
          ['--agent', 'omp', '--model', `${model.provider}/${model.id}`]), '--json'];
      for (const key of ['name', 'run']) if (input[key]) args.push(`--${key}`, input[key]);
      if (input.deps?.length) args.push('--deps', JSON.stringify(input.deps));
      if (input.retry_request) args.push('--retry-request', input.retry_request);
      return reply(await run(args, signal));
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
