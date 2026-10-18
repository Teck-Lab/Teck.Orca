// Explicit model evaluation: no tools, GitHub writes, Orca dispatches or saved
// OMP sessions. This checks policy interpretation, not end-to-end delivery.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { command } from './lifecycle.mjs';
import { repositoryRoot } from './release.mjs';

const args = process.argv.slice(2);
const checkOnly = args.length === 1 && args[0] === '--check';
assert.ok(checkOnly || (args.length === 2 && args[0] === '--sandbox'), 'Usage: npm run smoke:workflow-policy -- --sandbox <running-sandbox> (or --check to print the guest module without running it)');
const name = args[1];
if (!checkOnly) assert.match(name, /^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/);
const paths = ['runtime/omp/RULES.md', 'runtime/omp/skills/orca-feature-workflow/SKILL.md',
  'runtime/omp/skills/github-execution-planning/SKILL.md',
  'runtime/omp/skills/github-execution-planning/references/issue-structure.md',
  'runtime/omp/skills/orca-feature-workflow/references/review-gates.md'];
const policy = paths.map(path => `FILE: ${path}\n${readFileSync(join(repositoryRoot, path), 'utf8')}`).join('\n\n');
const cases = [
  { id: 'contained', request: 'Fix an incorrect rounding boundary in a pricing calculation, update its regression tests and document the behavior. Four files will change. One owner can deliver and validate it together.', expected: ['single', false, false, false, false] },
  { id: 'risk', request: 'Repair a serious tenant authorization defect. Scope is one coherent fix and its security regression tests. No independent deliverables or owners have been identified.', expected: ['single', false, false, false, false] },
  { id: 'partial-blocker', request: 'Implement a new API contract and update an independently owned consumer. Both have separate acceptance criteria. The consumer cannot start until the contract is accepted, while the API work can proceed now.', expected: ['feature', true, false, true, false] },
  { id: 'whole-blocker', request: 'One coherent bug fix cannot proceed at all until the customer supplies a required schema sample. There is no other independent in-scope work available.', expected: ['single', false, true, false, false] },
  { id: 'tool-failure', request: 'During one contained fix, the first NuGet restore timed out. The cause has not been investigated. Should this alone create execution sub-issues?', expected: ['single', false, false, false, false] },
  { id: 'external-prerequisite', request: 'A single integration change is wholly waiting on an already tracked, externally owned API issue #900 in another project. No unblocked part of our deliverable exists.', expected: ['single', false, true, true, false] },
  { id: 'helpers', request: 'One contained endpoint change has one implementation owner. A research helper and an independent reviewer assist; neither owns an independent product deliverable.', expected: ['single', false, false, false, false] },
  { id: 'promote', request: 'Existing issue #71 started as one deliverable. Diagnosis now establishes an independent migration and a separately owned consumer rollout with distinct acceptance gates; the rollout waits on the migration. The issue already contains useful investigation.', expected: ['feature', true, false, true, true] },
  { id: 'assigned', request: 'You are the executor already dispatched on execution sub-issue #72 with a verified parent plan and live Dispatch. Implement only that assignment. Decide whether you should create a new parent/child issue graph.', expected: ['assigned', false, false, false, false] },
];
const scenarios = cases.map(({ expected, ...scenario }) => scenario);
const prompt = `Apply the supplied policy to each scenario. This is a read-only policy evaluation, not an instruction to perform the work.
Return only a JSON array in input order. Each entry must have:
id, mode (single, feature, or assigned), createExecutionSubissues (boolean),
wholeIssueBlocked (boolean), needsDependencyLink (boolean), reuseIssueAsParent (boolean),
defaultReviewPath (final, child-and-final, or follow-dispatch), and reason (one sentence).
wholeIssueBlocked means evidence establishes that no in-scope progress can currently proceed;
an undiagnosed first tool failure does not establish that condition.
SCENARIOS: ${JSON.stringify(scenarios)}`;
const modelConfig = readFileSync(join(repositoryRoot, 'runtime/omp/models.yml'), 'utf8');
const settings = 'startup: { setupWizard: false }\nadvisor: { enabled: false }\nmemory: { backend: "off" }\nautolearn: { enabled: false }\n';
const guest = `import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';import {join} from 'node:path';import {spawnSync} from 'node:child_process';
const root=mkdtempSync(join(tmpdir(),'teck-workflow-policy-'));try{
 const agent=join(root,'agent');mkdirSync(agent);
 writeFileSync(join(agent,'models.yml'),${JSON.stringify(modelConfig)});
 writeFileSync(join(agent,'config.yml'),${JSON.stringify(settings)});
 const result=spawnSync('/opt/paseo-omp/bin/omp',['--print','--no-title','--no-session','--no-tools','--no-lsp','--no-skills','--no-rules','--no-extensions','--max-time','180','--model','omniroute/teck-orchestrator','--system-prompt',${JSON.stringify('Evaluate the workflow policy faithfully. Do not use tools or perform actions.\n\n' + policy)},${JSON.stringify(prompt)}],{cwd:root,env:{...process.env,PI_CODING_AGENT_DIR:agent},encoding:'utf8',timeout:210000,maxBuffer:4*1024*1024});
 if(result.status!==0)throw Error(result.stderr||result.stdout||result.error?.message||'OMP failed');
 process.stdout.write(result.stdout);
}finally{rmSync(root,{recursive:true,force:true});}`;
if (checkOnly) { process.stdout.write(guest); process.exit(0); }
assert.equal(JSON.parse(command('sbx', ['ls', '--json'])).find(row => row.name === name)?.status, 'running');
const root = join(repositoryRoot, '.artifacts', 'smoke', `workflow-policy-${randomUUID()}`);
mkdirSync(root, { recursive: true });
const output = command('sbx', ['exec', '-i', '-u', 'agent', name, '/opt/paseo-omp/bin/bun', 'run', '-'],
  { input: guest, timeout: 240_000 });
writeFileSync(join(root, 'output.txt'), output);
const start = output.indexOf('['), end = output.lastIndexOf(']');
const results = JSON.parse(output.slice(start, end + 1));
writeFileSync(join(root, 'results.json'), JSON.stringify(results, null, 2) + '\n');
assert.equal(results.length, cases.length);
for (let i = 0; i < cases.length; i++) {
  const expected = cases[i], actual = results[i];
  assert.equal(actual.id, expected.id);
  assert.deepEqual([actual.mode, actual.createExecutionSubissues, actual.wholeIssueBlocked,
    actual.needsDependencyLink, actual.reuseIssueAsParent], expected.expected, `${expected.id}: ${actual.reason}`);
  assert.equal(actual.defaultReviewPath, actual.mode === 'feature' ? 'child-and-final' : actual.mode === 'assigned' ? 'follow-dispatch' : 'final');
}
console.log(`OMP interpreted all ${cases.length} workflow scenarios correctly. Evidence: ${root}`);
