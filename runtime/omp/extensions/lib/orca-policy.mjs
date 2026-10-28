// Behavioral tool boundary, not OS isolation. Project extensions are trusted by OMP.
// Keep this module dependency-free so permission regressions run on the host too.
import { realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, relative, isAbsolute } from 'node:path';
export const workerRoles = { executor: 'task', researcher: 'slow', reviewer: 'advisor', publisher: 'task' };
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
  'issue_dependency_read', 'issue_dependency_write', 'get_label', 'list_label', 'list_pull_requests', 'search_pull_requests']);
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
function mcpName(name) {
  if (!/(?:^|[\/_-])github(?:-projects)?(?:[\/_-]|$)/.test(name)) return null;
  return name.replace(/^.*github(?:-projects)?[\/_-]+/, '');
}
export function permittedTool(role, name, input = {}) {
  if (name === 'ask') return role === 'coordinator';
  if (['goal', 'todo', 'orca', 'orca_dispatch'].includes(name)) return name !== 'orca_dispatch' || role === 'coordinator';
  if (name === 'read') {
    if (['executor', 'reviewer', 'researcher', 'publisher'].includes(role)) return true;
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
  const tool = mcpName(name);
  if (tool) {
    if (tool === 'pull_request_read') return role !== 'coordinator' || ['get', 'get_status', 'get_reviews', 'get_comments', 'get_review_comments', 'get_check_runs'].includes(input.method);
    if (compounds[tool]) return compounds[tool].includes(input.action) &&
      (role === 'coordinator' || readActions.has(input.action));
    if (planning.has(tool)) return role === 'coordinator' || !['issue_write', 'set_issue_fields', 'add_issue_comment', 'sub_issue_write', 'issue_dependency_write'].includes(tool);
    if (reading.has(tool)) return role !== 'coordinator';
    return role === 'publisher' && publishing.has(tool);
  }
  if (role === 'executor') return ['edit', 'write', 'bash', 'grep', 'glob', 'find', 'lsp', 'ast_edit', 'ast_grep', 'debug', 'web_search'].includes(name);
  if (['researcher', 'reviewer', 'publisher'].includes(role)) return ['grep', 'glob', 'find', 'ast_grep', 'web_search'].includes(name);
  return false; // Includes native task, eval, xd://, native github and arbitrary MCP bridges.
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
export function assignment(input) {
  if (!workerRoles[input.role] || !input.objective?.trim() || !input.acceptance?.length || input.acceptance.some(a => !a.trim())) throw Error('Worker role, objective and acceptance criteria are required');
  return `TECK_ORCA_ASSIGNMENT ${JSON.stringify(input)}\n\n` +
    'Use the native OMP goal tool to create this assignment objective before work. Keep its acceptance criteria in native todos. ' +
    'Follow the live Orca Task/Dispatch preamble. Do only this assignment; no recursive delegation or competing PR. ' +
    'Complete the native goal only with evidence for every criterion, then send worker_done and idle. ' +
    'A review goal completes when its explicit verdict/report is ready, including request_changes; it does not accept implementation. ' +
    'If blocked, ask the coordinator and leave the goal incomplete while awaiting a reply. For terminal failure, record blockers, drop the native goal without completing it, report failed and idle. ' +
    'Read skill://orca-feature-workflow and the relevant role references. Tests and fixes stay with the executor; publication uses only GitHub App MCP.\n';
}
