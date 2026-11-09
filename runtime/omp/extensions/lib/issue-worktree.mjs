import fs from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { createHash, randomUUID } from 'node:crypto';
import { verifyExecutorReuse } from './orca-policy.mjs';

const hash = value => createHash('sha256').update(value).digest('hex');
export function executionKey(input) {
  if (input.role !== 'executor') return null;
  let key;
  if (input.issue) {
    if (!/^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/issues\/[1-9]\d*\/?$/.test(input.issue)) throw Error('Use the canonical GitHub issue URL for executor ownership.');
    key = input.issue.replace(/\/$/, '').toLowerCase();
  } else if (input.workspace_key) {
    if (!/^[a-z0-9][a-z0-9._-]{0,79}$/.test(input.workspace_key)) throw Error('workspace_key must be a stable short task identifier.');
    key = 'task:' + input.workspace_key;
  } else return null; // Legacy unkeyed terminal reuse remains supported.
  if (input.parallel_key || input.parallel_reason) {
    if (!/^[a-z0-9][a-z0-9._-]{0,59}$/.test(input.parallel_key ?? '') || !input.parallel_reason?.trim())
      throw Error('A separate parallel worktree needs a stable parallel_key and explicit file ownership/dependency reason.');
    key += '|parallel:' + input.parallel_key;
  }
  return key;
}

function completeList(result, field) {
  if (!Array.isArray(result?.[field]) || result.truncated !== false || result.totalCount !== result[field].length || result.hostScope?.omittedHostIds?.length)
    throw Error('Incomplete Orca inventory cannot authorize a new issue worktree.');
  return result[field];
}
function directChild(parent, child, parentId) {
  if (!parent || parent.id !== parentId || !child?.id || child.id === parentId || child.parentWorktreeId !== parentId ||
      !parent.projectId || child.projectId !== parent.projectId || !parent.branch || !child.branch || child.branch === parent.branch)
    throw Error('Issue reuse requires a verified direct child in the same project on a distinct branch.');
}
function parseAssignment(spec) {
  const text = spec?.match(/^TECK_ORCA_ASSIGNMENT (\{[^\n]+\})$/m)?.[1];
  try { return text ? JSON.parse(text) : null; } catch { return null; }
}

/** Shared across coordinator sessions; a crash keeps pending intent rather than launching a duplicate. */
export async function issueWorktree({ input, parentId, runId, run, signal,
  directory = join(homedir(), '.omp', 'run', 'issue-worktrees') }) {
  const key = executionKey(input);
  if (!key) return null;
  if (!parentId || !runId || input.run && input.run !== runId) throw Error('Bind the owning Orca Run before issue dispatch.');
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const lock = join(directory, hash(parentId) + '.lock');
  let fd;
  try { fd = fs.openSync(lock, 'wx', 0o600); }
  catch (error) { if (error.code === 'EEXIST') throw Error('Another issue placement is pending for this feature; reconcile it before retrying.'); throw error; }
  const close = () => { if (fd !== undefined) { fs.closeSync(fd); fd = undefined; fs.unlinkSync(lock); } };
  const file = join(directory, hash(JSON.stringify([parentId, key])) + '.json');
  let state;
  const save = value => {
    const temporary = file + '.' + randomUUID();
    try { fs.writeFileSync(temporary, JSON.stringify(value), { flag: 'wx', mode: 0o600 }); fs.renameSync(temporary, file); state = value; }
    finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); }
  };
  try {
    fs.writeFileSync(fd, JSON.stringify({ pid: process.pid, parentId }));
    state = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
    if (state.parentId && (state.parentId !== parentId || state.key !== key)) throw Error('Issue worktree ownership record mismatch.');
    const parent = (await run(['worktree', 'show', '--worktree', 'id:' + parentId, '--json'], signal)).worktree;
    if (parent?.id !== parentId || !parent.projectId || !parent.branch) throw Error('The coordinator feature identity could not be verified.');
    async function record(result) {
      const dispatchId = result.dispatchId ?? result.dispatch?.id;
      save({ ...state, requestId: result.requestId ?? result.operationId ?? state.requestId, receipt: result });
      if (!dispatchId || result.ok === false) return;
      const receipt = await run(['orchestration','worker-show','--dispatch',dispatchId,'--json','--full'], signal);
      const id = receipt.terminal?.worktreeId ?? receipt.resource?.worktreeId;
      if (receipt.dispatch?.id !== dispatchId || !id || state.worktreeId && state.worktreeId !== id) return;
      const child = (await run(['worktree','show','--worktree','id:' + id,'--json'], signal)).worktree;
      directChild(parent,child,parentId);
      save({ ...state, pending:false, worktreeId:id, dispatchId });
    }
    if (state.pending && input.retry_request && input.retry_request === state.requestId && state.args)
      return { replayArgs: [...state.args.filter((_, i, a) => a[i - 1] !== '--retry-request' && a[i] !== '--retry-request'), '--retry-request', input.retry_request], close, record };
    const list = completeList(await run(['worktree', 'list', '--limit', '10000', '--json'], signal), 'worktrees');
    const children = list.filter(w => w.parentWorktreeId === parentId);
    const workers = [], cursors = new Set(); let cursor;
    do {
      const page = await run(['orchestration', 'worker-list', '--include-remote', '--json', '--full', ...(cursor ? ['--cursor', cursor] : [])], signal);
      if (!Array.isArray(page.workers) || typeof page.page?.hasMore !== 'boolean' || page.page.hasMore && !page.page.nextCursor)
        throw Error('Incomplete worker inventory cannot authorize issue placement.');
      workers.push(...page.workers); cursor = page.page.hasMore ? page.page.nextCursor : null;
      if (cursor && cursors.has(cursor)) throw Error('Repeated worker inventory cursor.');
      if (cursor) cursors.add(cursor);
    } while (cursor);
    const childIds = new Set(children.map(w => w.id)), matches = new Set();
    if (state.worktreeId) {
      if (!childIds.has(state.worktreeId)) throw Error('The saved issue worktree is missing or reparented. Reconcile its data; no replacement was created.');
      matches.add(state.worktreeId);
    }
    const relevant = workers.filter(w => childIds.has(w.resource?.worktreeId)), assignedKeys = new Map();
    for (const id of new Set(relevant.map(w => w.runId))) {
      if (!id) throw Error('Worker ownership is missing its Run.');
      const tasks = await run(['orchestration', 'task-list', '--run', id, '--json', '--full'], signal);
      if (!Array.isArray(tasks.tasks) || tasks.count !== tasks.tasks.length || tasks.truncated === true) throw Error('Incomplete assignment history cannot authorize issue placement.');
      const assignments = new Map(tasks.tasks.map(t => [t.id, parseAssignment(t.spec)]));
      for (const w of relevant.filter(w => w.runId === id)) {
        const assignment = assignments.get(w.taskId);
        const assignedKey = assignment && executionKey(assignment);
        if (assignedKey) {
          const id=w.resource.worktreeId;
          if(!assignedKeys.has(id))assignedKeys.set(id,new Set());
          assignedKeys.get(id).add(assignedKey);
          if(assignedKey===key)matches.add(id);
        }
      }
    }
    // Old dispatches did not persist issue links. Their issue-prefixed names are
    // conservative collision evidence, not permission to silently adopt a checkout.
    const issueNumber = input.issue?.match(/\/issues\/(\d+)\/?$/)?.[1];
    if (!input.parallel_key) for (const w of children) {
      if (assignedKeys.has(w.id)) continue;
      if (typeof w.linkedIssue === 'string' && w.linkedIssue.replace(/\/$/, '').toLowerCase() === key ||
          issueNumber && w.path?.split('/').at(-1)?.startsWith('issue-' + issueNumber + '-')) matches.add(w.id);
    }
    const explicit = input.worktree?.startsWith('id:') ? input.worktree.slice(3) : null;
    if(explicit && assignedKeys.has(explicit) && !assignedKeys.get(explicit).has(key)) throw Error('This child belongs to another issue/task or parallel lane.');
    if (state.worktreeId && explicit && explicit !== state.worktreeId) throw Error('This issue already owns ' + state.worktreeId + '; follow-ups cannot switch to another worktree.');
    if (matches.size > 1 && !explicit && !state.worktreeId) throw Error('Multiple legacy worktrees exist for this issue. Select one exact id after reconciling its changes; no new child created: ' + [...matches].join(', '));
    if (explicit && matches.size && !matches.has(explicit)) throw Error('Select the existing issue worktree, not another checkout.');
    if (workers.some(w => matches.has(w.resource?.worktreeId) && ['dispatched','pending'].includes(w.dispatchStatus)))
      throw Error('This issue has an active dispatch. Message/wait for that worker; no second executor was started.');
    const selected = explicit ?? state.worktreeId ?? [...matches][0];
    if (state.pending && !explicit) throw Error('Previous issue launch is uncertain. Inspect its receipt and replay its request ID, or explicitly adopt the verified child; do not create a replacement.');
    let terminal;
    if (selected) {
      const child = (await run(['worktree', 'show', '--worktree', 'id:' + selected, '--json'], signal)).worktree;
      directChild(parent, child, parentId);
      const occupants = workers.filter(w => w.resource?.worktreeId === selected);
      if (occupants.some(w => ['dispatched', 'pending'].includes(w.dispatchStatus))) throw Error('This issue has an active dispatch. Message/wait for that worker; no second executor was started.');
      const ps = completeList(await run(['worktree', 'ps', '--json'], signal), 'worktrees').filter(w => w.worktreeId === selected);
      if (ps.length !== 1 || ps[0].unverifiableTerminalCount !== 0 || !Number.isSafeInteger(ps[0].liveTerminalCount)) throw Error('Issue checkout terminal ownership is uncertain.');
      if (ps[0].liveTerminalCount > 0) {
        const owners = occupants.filter(w => w.runId === runId && ['completed','failed'].includes(w.dispatchStatus) && w.terminalState === 'reclaimable' && w.resource?.ownerDispatchId === w.dispatchId);
        if (ps[0].liveTerminalCount !== 1 || owners.length !== 1) throw Error('Issue checkout still has live or ambiguous terminals. Settle/release them before follow-up.');
        terminal = owners[0].agentTerminalHandle;
        if (input.terminal && input.terminal !== terminal) throw Error('Requested terminal is not the issue owner.');
        verifyExecutorReuse({ ...input, worktree: 'id:' + selected, terminal }, { parent, child, workers: occupants.filter(w => w.resource?.ownershipState === 'owned' && w.resource.ownerDispatchId === w.dispatchId), parentId, runId });
      } else {
        if (input.terminal) throw Error('Requested terminal is no longer live; omit terminal to restart on the same issue worktree.');
        if (occupants.some(w => w.resource?.releaseState && !['released','completed'].includes(w.resource.releaseState) && w.resource?.ownershipState === 'owned'))
          throw Error('An issue worker release is unresolved; reconcile it before restarting on this checkout.');
      }
    } else if (input.worktree && input.worktree !== 'new-child') throw Error('New issue work requires a child worktree.');
    const placement = { worktree: selected ? 'id:' + selected : 'new-child', terminal, run: runId };
    return { ...placement, close,
      begin(args) { save({ parentId, key, worktreeId: selected, pending: true, args }); },
      record
    };
  } catch (error) { close(); throw error; }
}
