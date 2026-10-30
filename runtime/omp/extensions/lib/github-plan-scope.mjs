import { mcpName } from './orca-policy.mjs';

const positive = value => Number.isSafeInteger(value) && value > 0;

// Tracks records returned by GitHub, not IDs invented in prompts or mutation input.
// This is an extension tool boundary within trusted OMP, not OS isolation.
export function createPlanningScope(issue, saved) {
  const match = /^https:\/\/github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)\/issues\/([1-9][0-9]*)$/.exec(issue ?? '');
  if (!match || !positive(Number(match[3]))) throw Error('Invalid planner parent issue URL');
  const [, owner, repo] = match, root = Number(match[3]);
  const restored = saved?.issue === issue ? saved : undefined;
  const numbers = new Set([root, ...(restored?.numbers ?? []).filter(positive)]);
  const ids = new Map((restored?.ids ?? []).filter(([id, number]) => positive(id) && positive(number)));
  const sameRepo = input => input.owner?.toLowerCase() === owner.toLowerCase() && input.repo?.toLowerCase() === repo.toLowerCase();
  const state = () => ({ issue, numbers: [...numbers], ids: [...ids] });
  function allows(name, input) {
    if (!sameRepo(input)) return false;
    switch (mcpName(name)) {
      case 'create_issue': return numbers.has(input.parent_issue_number) &&
        (!input.parent_owner && !input.parent_repo || sameRepo({ owner: input.parent_owner, repo: input.parent_repo }));
      case 'add_sub_issue': return numbers.has(input.issue_number) && ids.has(input.sub_issue_id) && input.replace_parent !== true;
      case 'reprioritize_sub_issue': return numbers.has(input.issue_number) && numbers.has(ids.get(input.sub_issue_id)) &&
        [input.before_id, input.after_id].filter(value => value !== undefined).every(id => numbers.has(ids.get(id)));
      case 'issue_dependency_write': return numbers.has(input.issue_number) && positive(input.related_issue_number) &&
        ['add', 'remove'].includes(input.method) && ['blocked_by', 'blocking'].includes(input.type);
      case 'update_issue_body': case 'update_issue_title': case 'add_issue_comment': return numbers.has(input.issue_number);
      default: return false;
    }
  }
  function observe(name, input, event) {
    if (event.isError || !sameRepo(input)) return;
    const tool = mcpName(name);
    const admit = tool === 'create_issue' && allows(name, input) ||
      tool === 'issue_read' && input.method === 'get_sub_issues' && numbers.has(input.issue_number);
    const candidate = tool === 'issue_read' && input.method === 'get';
    if (admit || candidate) {
      const visit = (value, depth = 0) => {
        if (depth > 8 || value === null || value === undefined) return;
        if (typeof value === 'string') return;
        if (Array.isArray(value)) { for (const item of value) visit(item, depth + 1); return; }
        if (typeof value !== 'object' || value.isError === true || value.pull_request) return;
        if (value.type === 'text' && typeof value.text === 'string') {
          try { visit(JSON.parse(value.text), depth + 1); } catch {}
          return;
        }
        const url = value.html_url ?? value.url;
        const record = typeof url === 'string' ? /^https:\/\/(?:github\.com\/|api\.github\.com\/repos\/)([^/]+)\/([^/]+)\/issues\/([0-9]+)$/.exec(url) : undefined;
        const number = value.number ?? (record ? Number(record[3]) : undefined);
        const id = typeof value.id === 'string' && /^[0-9]+$/.test(value.id) ? Number(value.id) : value.id;
        if (positive(number) && (!url || record && sameRepo({ owner: record[1], repo: record[2] }) && Number(record[3]) === number)) {
          if (positive(id)) ids.set(id, number);
          if (admit) numbers.add(number);
        }
        // Parse tool envelopes, never JSON embedded in an issue body/comment or
        // unrelated author/milestone metadata returned alongside the issue.
        for (const key of ['structuredContent', 'result', 'data', 'issue', 'issues', 'sub_issues', 'items', 'nodes', 'content'])
          if (Object.hasOwn(value, key)) visit(value[key], depth + 1);
      };
      visit(event.details); visit(event.content);
    }
    if (tool === 'add_sub_issue' && allows(name, input)) numbers.add(ids.get(input.sub_issue_id));
  }
  return { allows, observe, state };
}
