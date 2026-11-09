// Canonical managed update set; build mirrors this module into native-ssh/.
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
export function workflowFiles(ompRoot, launchRoot) {
  const roots = ['extensions/agent-office.ts', 'extensions/agent-office.mjs', 'extensions/orca-orchestration.mjs', 'extensions/lib/orca-policy.mjs', 'extensions/lib/github-plan-scope.mjs',
    'extensions/lib/office-tools.mjs', 'extensions/lib/office-usage.mjs', 'extensions/lib/office-plan.mjs', 'extensions/lib/office-mcp.mjs', 'extensions/lib/office-mcp-server.mjs', 'extensions/lib/agent-office.LICENSE',
    'extensions/omniroute-research.ts', 'extensions/lib/mcphub-client.mjs', 'extensions/lib/mcphub-search.mjs', 'extensions/lib/mcphub-firecrawl.mjs',
    'orchestration.yml', 'RULES.md', 'WATCHDOG.yml', 'agents/technical-planner.md',
    'agents/implementation-worker.md', 'agents/correctness-reviewer.md', 'agents/security-auditor.md',
    'skills/agent-office', 'skills/orca-feature-workflow', 'skills/orca-workers', 'skills/github-execution-planning', 'skills/github-publication',
    'skills/orca-cli', 'skills/orchestration', 'skills/orca-per-workspace-env', 'orca-guides.json'];
  const files = [];
  function walk(path, relative) {
    for (const child of readdirSync(path, { withFileTypes: true }).sort((a,b) => a.name.localeCompare(b.name))) {
      if (child.isSymbolicLink()) throw Error('Workflow asset symlink refused');
      if (child.isDirectory()) walk(join(path, child.name), `${relative}/${child.name}`);
      else files.push([`${relative}/${child.name}`, readFileSync(join(path, child.name))]);
    }
  }
  for (const relative of roots) {
    const path = join(ompRoot, relative);
    if (/\.(?:mjs|ts|yml|md|json)$|\/agent-office\.LICENSE$/.test(relative)) files.push([relative, readFileSync(path)]);
    else walk(path, relative);
  }
  for (const name of ['omp-launch.mjs', 'omp-launch-policy.mjs']) files.push([`runtime/${name}`, readFileSync(join(launchRoot, name))]);
  return files;
}
export const workflowDigest = files => createHash('sha256').update(Buffer.concat(files.flatMap(([path, bytes]) => [Buffer.from(path), bytes]))).digest('hex');
