// Behavioral tool boundary, not OS isolation. Project extensions are trusted by OMP.
// Keep this module dependency-free so permission regressions run on the host too.
import { realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, relative, isAbsolute } from 'node:path';
import { isOfficeTool } from './office-tools.mjs';
export { isOfficeTool } from './office-tools.mjs';
export const workerRoles = { executor: 'task', planner: 'slow', researcher: 'slow', reviewer: 'advisor', publisher: 'task' };
const same = (a, b) => a && b && a.provider === b.provider && a.id === b.id;
export function resolveRole(model, models, assignedRole) {
  // --model overrides OMP's session default. A worker's default can therefore
  // equal its executor/reviewer model: verified Dispatch role wins, never a
  // model-name guess or a copied prompt marker.
  if (assignedRole) return workerRoles[assignedRole] && same(model, models.resolve(`@${workerRoles[assignedRole]}`)) ? assignedRole : 'coordinator';
  if (!model || same(model, models.resolve('@default')) || same(model, models.resolve('@plan'))) return 'coordinator';
  const matches = ['executor', 'researcher', 'reviewer'].filter(role => same(model, models.resolve(`@${workerRoles[role]}`)));
  return matches.length === 1 ? matches[0] : 'coordinator';
}
const planning = new Set(['issue_read', 'issue_write', 'search_issues', 'list_issues', 'list_issue_types',
  'list_issue_fields', 'set_issue_fields', 'add_issue_comment', 'sub_issue_read', 'sub_issue_write',
  'issue_dependency_read', 'issue_dependency_write', 'get_label', 'list_label', 'list_pull_requests', 'search_pull_requests',
  'create_issue', 'update_issue_body', 'update_issue_title', 'update_issue_labels', 'update_issue_type',
  'update_issue_assignees', 'update_issue_milestone', 'update_issue_state', 'update_issue_comment',
  'add_sub_issue', 'remove_sub_issue', 'reprioritize_sub_issue']);
const planningWrites = new Set(['issue_write', 'set_issue_fields', 'add_issue_comment', 'sub_issue_write', 'issue_dependency_write',
  'create_issue', 'update_issue_body', 'update_issue_title', 'update_issue_labels', 'update_issue_type',
  'update_issue_assignees', 'update_issue_milestone', 'update_issue_state', 'update_issue_comment',
  'add_sub_issue', 'remove_sub_issue', 'reprioritize_sub_issue']);
const plannerWrites = new Set(['update_issue_body', 'update_issue_title', 'add_issue_comment', 'add_sub_issue', 'reprioritize_sub_issue']);
const reading = new Set(['get_file_contents', 'get_commit', 'list_commits', 'search_code', 'list_branches',
  'get_code_scanning_alert', 'list_code_scanning_alerts', 'get_dependabot_alert', 'list_dependabot_alerts']);
const publishing = new Set(['push_files', 'create_or_update_file', 'delete_file', 'create_branch', 'create_pull_request', 'update_pull_request',
  'update_pull_request_body', 'update_pull_request_title', 'update_pull_request_draft_state']);
const compounds = {
  manage_project: ['create', 'list', 'get', 'update', 'get_readme', 'update_readme', 'list_fields', 'list_views',
    'add_item', 'remove_item', 'list_items', 'archive_item', 'unarchive_item', 'set_field_value', 'get_field_value',
    'clear_field_value', 'filter_items', 'update_item_position'],
  manage_issues: ['create', 'list', 'get', 'update', 'create_comment', 'update_comment', 'list_comments',
    'search_advanced', 'add_sub_issue', 'list_sub_issues', 'get_parent_issue', 'reprioritize_sub_issue', 'remove_sub_issue'],
  manage_milestones: ['create', 'list', 'update', 'get_metrics', 'get_overdue', 'get_upcoming'],
  manage_labels: ['create', 'list'], manage_status_updates: ['create', 'list', 'get'],
};
const readActions = new Set(['list', 'get', 'list_comments', 'list_sub_issues', 'get_parent_issue', 'search_advanced',
  'list_fields', 'list_items', 'get_field_value', 'filter_items', 'get_metrics', 'get_overdue', 'get_upcoming', 'get_readme']);
const readOnlyLspActions = new Set(['diagnostics','definition','type_definition','implementation','references','hover','symbols','status','capabilities']);
const structuralWrite = input => ['rewrite','replacement','replace','replacements'].some(key=>Object.hasOwn(input,key));
export function implementationTool(name,input={}){
  if(['edit','bash','debug','eval','ast_edit'].includes(name))return true;
  if(name==='write')return !input.path?.startsWith('agent://');
  if(name==='lsp')return !readOnlyLspActions.has(String(input.action??'').toLowerCase())||input.apply===true;
  return name==='ast_grep'&&structuralWrite(input);
}
export function mcpName(name) {
  if (!/(?:^|[\/_-])github(?:-projects)?(?:[\/_-]|$)/.test(name)) return null;
  return name.replace(/^.*github(?:-projects)?[\/_-]+/, '');
}
export const isPlanningWrite = name => planningWrites.has(mcpName(name));
export const isPlanningTool = name => planning.has(mcpName(name));
export function permittedTool(role, name, input = {}) {
  // These five visual/presence tools do not grant repository, shell or Orca
  // lifecycle authority, including in a read-only helper or a waiting session.
  if (isOfficeTool(name)) return true;
  // Knowledge capture is separate from repository editing/publication authority.
  if (['recall', 'retain', 'reflect', 'learn'].includes(name)) return true;
  // Native OMP delegation is available to every role. The parent remains
  // accountable for the helper's scope, permissions and returned evidence.
  if (['task', 'wait'].includes(name)) return true;
  // eval exposes arbitrary Bun/JS and can bypass read-only/coordinator tool
  // restrictions. Native task/wait still provide delegation for every role.
  if (name === 'eval') return role === 'executor';
  if (['read', 'write'].includes(name) && /^agent:\/\/[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_./-]+)?$/.test(input.path ?? '') && !input.path.includes('..')) return true;
  if (name === 'ask') return role === 'coordinator';
  if (['goal', 'todo', 'orca', 'orca_dispatch'].includes(name)) return name !== 'orca_dispatch' || role === 'coordinator';
  if (name === 'read') {
    if (['executor', 'planner', 'reviewer', 'researcher', 'publisher'].includes(role)) return true;
    const path = input.path ?? '';
    if (path.includes('..')) return false;
    if (/^skill:\/\/[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_./-]+)?$/.test(path)) return true;
    try {
      const root = realpathSync(join(homedir(), '.omp/agent/skills'));
      const target = realpathSync(path.startsWith('~/') ? join(homedir(), path.slice(2)) : path);
      const inside = relative(root, target);
      return inside !== '' && !inside.startsWith('..') && !isAbsolute(inside);
    } catch { return false; }
  }
  if (name === 'git_inspect') return ['reviewer', 'publisher', 'executor'].includes(role);
  if(['planner','researcher','reviewer','publisher'].includes(role)){
    if(name==='lsp')return readOnlyLspActions.has(String(input.action??'').toLowerCase())&&input.apply!==true;
    if(name==='ast_grep'&&structuralWrite(input))return false;
  }
  const tool = mcpName(name);
  if (tool) {
    if (tool === 'pull_request_read') return role !== 'coordinator' || ['get', 'get_status', 'get_reviews', 'get_comments', 'get_review_comments', 'get_check_runs'].includes(input.method);
    if (compounds[tool]) return compounds[tool].includes(input.action) &&
      (role === 'coordinator' || readActions.has(input.action));
    if (planning.has(tool)) {
      if (role === 'coordinator' || !planningWrites.has(tool)) return true;
      if (role !== 'planner') return false;
      if (tool === 'create_issue') return Number.isSafeInteger(input.parent_issue_number) && input.parent_issue_number > 0;
      if (tool === 'issue_dependency_write') return ['add', 'remove'].includes(input.method);
      return plannerWrites.has(tool);
    }
    if (reading.has(tool)) return role !== 'coordinator';
    return role === 'publisher' && publishing.has(tool);
  }
  if (role === 'executor') return ['edit', 'write', 'bash', 'grep', 'glob', 'find', 'lsp', 'ast_edit', 'ast_grep', 'debug', 'web_search'].includes(name);
  if (['planner', 'researcher', 'reviewer', 'publisher'].includes(role)) return ['grep', 'glob', 'find', 'ast_grep', 'web_search'].includes(name);
  return false; // Includes xd://, native github and arbitrary MCP bridges.
}

const verbs = {
  'status': [], 'skills get': ['--reference', '--full', '--references'],
  'worktree current': [], 'worktree list': ['--repo', '--limit'], 'worktree show': ['--worktree'],
  'worktree set': ['--worktree', '--issue', '--display-name'], 'repo list': [],
  'orchestration run-create': ['--objective'], 'orchestration run-use': ['--id'],
  'orchestration run-list': [], 'orchestration run-show': ['--id'],
  'orchestration task-create': ['--spec', '--title', '--deps', '--parent', '--run'],
  'orchestration task-list': ['--run', '--ready', '--brief'],
  'orchestration task-update': ['--id', '--status', '--result', '--spec'],
  'orchestration check': ['--wait', '--peek', '--format', '--ack', '--types', '--timeout-ms', '--terminal', '--run'],
  'orchestration send': ['--to', '--from', '--subject', '--body', '--type', '--task-id', '--dispatch-id', '--outcome', '--phase', '--files-modified', '--report-path'],
  'orchestration ask': ['--from', '--question', '--options', '--timeout-ms', '--resume'],
  'orchestration reply': ['--id', '--body'],
  'orchestration worker-list': ['--run', '--include-remote', '--terminal-state', '--cursor'],
  'orchestration worker-show': ['--dispatch'], 'orchestration worker-read': ['--dispatch', '--source', '--limit'],
  'orchestration worker-release': ['--dispatch'], 'orchestration worker-retain': ['--dispatch', '--reason'],
  'orchestration worker-stop': ['--dispatch'], 'orchestration worker-abandon': ['--dispatch'],
};
const workerVerbs = new Set(['status', 'skills get', 'worktree current', 'worktree show', 'orchestration check', 'orchestration send', 'orchestration ask']);
const booleans = new Set(['--json', '--wait', '--peek', '--format', '--ready', '--brief', '--full', '--references', '--include-remote']);
export function coordinationArgs(args, role) {
  if (!Array.isArray(args) || args.some(a => typeof a !== 'string' || a.includes('\0'))) throw Error('Orca arguments not permitted');
  const count = args[0] === 'status' ? 1 : 2;
  const verb = args.slice(0, count).join(' '), flags = verbs[verb];
  if (!flags || role !== 'coordinator' && !workerVerbs.has(verb)) throw Error('Orca action is not permitted for this role. Use structured actions: guide, check, report, ask or worktree_current. Only coordinators create Runs or use orca_dispatch.');
  for (let i = count; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--json') continue;
    if (verb === 'skills get' && i === count && ['orca-cli', 'orchestration'].includes(arg)) continue;
    if (!flags.includes(arg)) throw Error(`Orca option not permitted: ${arg}`);
    if (!booleans.has(arg) && (args[++i] === undefined || args[i].startsWith('--'))) throw Error('Orca option value not permitted');
  }
  return args.includes('--json') ? [...args] : [...args, '--json'];
}
export const coordinationActions = ['guide', 'status', 'run_create', 'run_list', 'run_show', 'run_use', 'task_list',
  'check', 'reply', 'message', 'report', 'ask', 'worker_list', 'worker_show', 'worker_read', 'worker_release', 'worker_retain',
  'worker_stop', 'worker_abandon', 'worktree_current', 'worktree_list', 'worktree_show', 'worktree_issue'];
export const messageTypes = ['status', 'dispatch', 'worker_done', 'merge_ready', 'escalation', 'handoff', 'decision_gate', 'question', 'heartbeat'];
export function coordinationAction(input, role) {
  const required = key => {
    if (typeof input[key] !== 'string' || !input[key].trim()) throw Error(`${key} is required for ${input.action}`);
    return input[key];
  };
  let args;
  switch (input.action) {
    case 'guide': args = ['skills', 'get', input.topic ?? 'orchestration']; if (input.reference) args.push('--reference', input.reference); break;
    case 'status': args = ['status']; break;
    case 'run_create': args = ['orchestration', 'run-create', '--objective', required('objective')]; break;
    case 'run_list': args = ['orchestration', 'run-list']; break;
    case 'run_show': case 'run_use': args = ['orchestration', input.action.replace('_', '-'), '--id', required('id')]; break;
    case 'task_list': args = ['orchestration', 'task-list']; if (input.run) args.push('--run', input.run); break;
    case 'check':
      args = ['orchestration', 'check', '--wait', '--timeout-ms', String(Math.min(60_000, Math.max(1000, input.timeout_ms ?? 15000)))];
      if (input.types) {
        if (input.types.split(',').some(type => !messageTypes.includes(type))) throw Error(`Unknown message type. Allowed: ${messageTypes.join(',')}`);
        args.push('--types', input.types);
      }
      if (input.ack) args.push('--ack', input.ack);
      if (input.from) args.push('--terminal', input.from);
      break;
    case 'reply': args = ['orchestration', 'reply', '--id', required('id'), '--body', required('body')]; break;
    case 'message': case 'report':
      args = ['orchestration', 'send', '--type', input.action === 'report' ? 'worker_done' : input.type ?? 'status',
        '--subject', required('subject'), '--body', required('body')];
      for (const [key, flag] of [['to', '--to'], ['from', '--from'], ['task_id', '--task-id'], ['dispatch_id', '--dispatch-id'], ['phase', '--phase'], ['outcome', '--outcome']])
        if (input[key]) args.push(flag, input[key]);
      if (input.action === 'report' && !['succeeded', 'failed'].includes(input.outcome)) throw Error('A report requires succeeded or failed outcome');
      break;
    case 'ask': args = ['orchestration', 'ask', '--from', required('from'),
      ...(input.resume ? ['--resume', input.resume] : ['--question', required('body')]), '--timeout-ms', '60000']; break;
    case 'worker_list': args = ['orchestration', 'worker-list']; if (input.run) args.push('--run', input.run); break;
    case 'worker_show': case 'worker_read': case 'worker_release': case 'worker_retain': case 'worker_stop': case 'worker_abandon':
      args = ['orchestration', input.action.replace('_', '-'), '--dispatch', required('dispatch_id')];
      if (input.action === 'worker_read') args.push('--source', 'auto', '--limit', String(input.limit ?? 80));
      if (input.action === 'worker_retain') args.push('--reason', required('body'));
      break;
    case 'worktree_current': args = ['worktree', 'current']; break;
    case 'worktree_list': args = ['worktree', 'list']; break;
    case 'worktree_show': args = ['worktree', 'show', '--worktree', required('worktree')]; break;
    case 'worktree_issue': args = ['worktree', 'set', '--worktree', required('worktree'), '--issue', required('issue')]; break;
    default: throw Error('Unknown Orca action; use the action enum');
  }
  return coordinationArgs(args, role);
}
const genericWorkerName = value => /^(?:worker[-_ ])?task[-_ ][a-z0-9]+$/i.test(value) || /^worker(?:[-_ ][a-z0-9]+)?$/i.test(value);
export function dispatchLabels(input, suffix) {
  const clean = value => typeof value === 'string' ? value.split(/[\r\n\u2028\u2029]/)[0].replace(/[\p{Cc}\p{Cf}]/gu, ' ').replace(/\s+/gu, ' ').trim() : '';
  const slug = value => clean(value).normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  const role = { executor: 'Executor', planner: 'Planner', researcher: 'Researcher', reviewer: 'Reviewer', publisher: 'Publisher' }[input.role] ?? 'Worker';
  const issue = /^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/issues\/([1-9]\d{0,19})$/.exec(input.issue ?? '')?.[1];
  let scope = clean(input.title) || clean(input.objective);
  if (!scope || genericWorkerName(scope)) scope = 'Assigned work';
  const title = [...`${issue ? `#${issue} · ` : ''}${role} · ${scope}`].slice(0, 80).join('').trimEnd();
  const custom = slug(input.name);
  if (custom && !genericWorkerName(clean(input.name))) return { title, name: custom.slice(0, 64).replace(/-+$/g, '') };
  if (!/^[a-f0-9]{8}$/.test(suffix)) throw Error('A dispatch name needs its unique suffix');
  const prefix = `${issue ? `issue-${issue}-` : ''}${role.toLowerCase()}-`;
  const shortScope = (slug(scope) || 'work').slice(0, 64 - prefix.length - suffix.length - 1).replace(/-+$/g, '');
  return { title, name: `${prefix}${shortScope}-${suffix}` };
}

export function canRenameWorkerTab(list, handle, worktreeId) {
  if (list.truncated !== false || !Array.isArray(list.terminals) || list.totalCount !== list.terminals.length) return false;
  const terminal = list.terminals.find(t => t.handle === handle && t.worktreeId === worktreeId);
  if (!terminal?.tabId || list.terminals.filter(t => t.tabId === terminal.tabId).length !== 1) return false;
  const seen = new Set();
  function find(node) {
    if (!node || typeof node !== 'object' || seen.has(node) || seen.size > 512) return;
    seen.add(node);
    if (node.type === 'group') return node.tabs?.find(t => t.tabId === terminal.tabId);
    if (node.type === 'split') return find(node.first) ?? find(node.second);
  }
  const tab = find(list.visualLayouts?.find(l => l.worktreeId === worktreeId)?.root);
  return !!tab && genericWorkerName(tab.title ?? '') && tab.panes?.type === 'terminal' && tab.panes.handle === handle;
}

export function dispatchPlacement(input) {
  const worktree = input.worktree ?? (input.role === 'executor' ? 'new-child' : undefined);
  if (typeof worktree !== 'string' || !worktree || worktree.trim() !== worktree || worktree.includes('\0'))
    throw Error('An exact worktree placement is required');
  if (input.role !== 'executor') return { worktree, reuse: false };
  if (!input.issue && !input.workspace_key && !input.terminal)
    throw Error('Executor child ownership requires a canonical issue URL or stable workspace_key; reuse the same key for follow-ups.');
  if (worktree === 'new-child' && !input.terminal) return { worktree, reuse: false };
  if (worktree === 'new-child') throw Error('A new child cannot reuse an existing terminal. Omit terminal for new execution.');
  if ((input.issue || input.workspace_key) && worktree.startsWith('id:') && worktree.length > 3) return { worktree, reuse: false };
  if (!input.terminal || !worktree.startsWith('id:') || worktree.length <= 3)
    throw Error('New executors, including integration workers, require new-child. Reuse requires the exact id: of an owned child and its settled terminal.');
  return { worktree, reuse: true };
}

export function verifyExecutorReuse(input, { parent, child, workers, runId, parentId }) {
  if (!runId || input.run && input.run !== runId) throw Error('Bind the owning Orca Run before child reuse; a different Run cannot reuse this worker.');
  if (!parentId || parent?.id !== parentId || child?.id !== input.worktree.slice(3) || child.id === parentId || child.parentWorktreeId !== parentId)
    throw Error('Executor reuse requires the exact direct child of this coordinator worktree; parent/child identity could not be verified.');
  if (!parent.projectId || child.projectId !== parent.projectId || !parent.branch || !child.branch || child.branch === parent.branch)
    throw Error('Executor reuse requires a child in the same project on a distinct branch.');
  const occupants = workers.filter(w => w.resource?.worktreeId === child.id);
  if (occupants.some(w => w.dispatchStatus === 'dispatched')) throw Error('Another dispatch is active in this checkout; wait for settlement, do not create a replacement child.');
  // A legacy checkout with several terminal owners is ambiguous. Never race
  // two different settled terminals back into editing that same checkout.
  if (occupants.some(w => w.runId !== runId || w.agentTerminalHandle !== input.terminal))
    throw Error('Child reuse has multiple or foreign terminal owners; reconcile ownership instead of creating a replacement child.');
  const owner = occupants.find(w => w.agentTerminalHandle === input.terminal);
  if (!owner || !['completed', 'failed'].includes(owner.dispatchStatus) || owner.terminalState !== 'reclaimable' ||
      owner.resource?.ownershipState !== 'owned' || owner.resource.ownerDispatchId !== owner.dispatchId ||
      owner.resource.terminalHandle !== input.terminal || owner.resource.releaseState !== 'not_requested')
    throw Error('Reuse requires an owned, settled, reclaimable child terminal with no release in progress.');
}

export function assignment(input) {
  if (!workerRoles[input.role] || !input.objective?.trim() || !input.acceptance?.length || input.acceptance.some(a => !a.trim())) throw Error('Worker role, objective and acceptance criteria are required');
  if (input.role === 'planner' && !/^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/issues\/[1-9][0-9]*$/.test(input.issue ?? ''))
    throw Error('A planner requires its authorized parent GitHub issue URL');
  return `TECK_ORCA_ASSIGNMENT ${JSON.stringify(input)}\n\n` +
    'Use the native OMP goal tool to create this assignment objective before work. Keep its acceptance criteria in native todos. ' +
    'Follow the live Orca Task/Dispatch preamble. Own this assignment; native OMP helpers use no separate Orca Dispatches. Do not create a competing PR. ' +
    (input.role==='executor'?'Delegate actual implementation and scoped RED/GREEN tests to implementation-worker first. Use one focused helper or a bounded parallel file-disjoint wave; parent owns integration and acceptance verification. ':input.role==='reviewer'?'For code/deployment changes, use correctness-reviewer and security-auditor native tasks in parallel on the stable snapshot, validate their findings and deliver one consolidated verdict. For documentation-only work, record why a security pass is inapplicable. ':'Use scoped native task/wait helpers for independent research where useful. ') +
    'Complete the native goal only with evidence for every criterion, then send worker_done and idle. ' +
    'A review goal completes when its explicit verdict/report is ready, including request_changes; it does not accept implementation. ' +
    'If blocked, ask the coordinator and leave the goal incomplete while awaiting a reply. For terminal failure, record blockers, drop the native goal without completing it, report failed and idle. ' +
    'Read skill://orca-feature-workflow and the relevant role references. Tests and fixes stay with the executor; publication uses only GitHub App MCP.\n';
}
