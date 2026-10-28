// Explicit end-to-end probe. Creates its own sandbox and local fixture; never
// touches project sandboxes, remote Git transport, GitHub records or desktop UI.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { command, createLifecycle, sandboxName } from './lifecycle.mjs';
import { installRelease, repositoryRoot } from './release.mjs';

const projectId = `teck-orca-goals-${randomUUID()}`, featureId = 'goals';
const name = sandboxName(projectId, featureId);
const root = join(repositoryRoot, '.artifacts/smoke', projectId);
mkdirSync(root, { recursive: true });
const release = installRelease();
const before = JSON.parse(command('sbx', ['ls', '--json'])).map(row => ({ name: row.name, id: row.id }));
const report = { sandbox: name, ok: false, cleanedUp: false };
console.error(`Disposable goal validation: ${name}`);
const fixture = `const fs=require('fs'),cp=require('child_process');const p='/home/agent/project';fs.mkdirSync(p,{recursive:true});
fs.writeFileSync(p+'/clamp.mjs','export function clamp(value,min,max) { return Math.min(max,Math.max(min,value)); }\\n');
fs.writeFileSync(p+'/clamp.test.mjs',"import {test} from 'node:test'; import assert from 'node:assert/strict'; import {clamp} from './clamp.mjs'; test('clamping boundaries',()=>{assert.equal(clamp(-1,0,10),0);assert.equal(clamp(5,0,10),5);assert.equal(clamp(11,0,10),10);});\\n");
for(const args of [['init','-b','main'],['config','user.name','Disposable goal probe'],['config','user.email','probe@example.invalid'],['config','commit.gpgsign','false'],['add','.'],['commit','-m','test: local clamp fixture']])cp.execFileSync('git',args,{cwd:p});`;
const run = (program, args, options) => args[0] === 'exec' && args[2] === 'git' && args[3] === 'clone' ?
  command('sbx', ['exec', '-u', 'agent', name, 'node', '-e', fixture], options) : command(program, args, options);
const lifecycle = createLifecycle({ assetRoot: release.destination, stateRoot: join(root, 'features'), run,
  env: { ...process.env, ORCA_PROJECT_ID: projectId, ORCA_VM_INSTANCE_ID: featureId,
    ORCA_REPO_URL: 'https://example.invalid/disposable-fixture.git', TECK_ORCA_CPUS: '4', TECK_ORCA_MEMORY: '8g' } });
const guest = args => command('sbx', ['exec', '-u', 'agent', name, ...args], { timeout: 120_000 });
const cli = args => { const result = JSON.parse(guest(['orca-ide', ...args, '--json'])); assert.equal(result.ok, true, JSON.stringify(result.error)); return result.result; };
const put = (path, content) => guest(['node', '-e', `require('fs').writeFileSync(process.argv[1],Buffer.from(process.argv[2],'base64'))`, path, Buffer.from(content).toString('base64')]);
async function launchPolicyProbe(worktree) {
  put('/tmp/teck-conflicting.yml', 'goal: { enabled: false }\nadvisor: { enabled: true }\n');
  put('/tmp/teck-policy-inspector.mjs', `import fs from 'node:fs';export default function(pi){pi.on('before_agent_start',(_event,ctx)=>{const tools=pi.getActiveTools();fs.writeFileSync('/tmp/teck-launch-policy-proof.json',JSON.stringify({policyLoaded:ctx.sessionManager.getBranch().some(e=>e.customType==='teck-orca-contract'),nativeGoalAvailable:tools.includes('goal'),forbiddenToolsAbsent:['bash','edit','write','eval','task'].every(t=>!tools.includes(t)),noExtensionsFlag:process.argv.includes('--no-extensions'),configOrder:process.argv.filter((a,i)=>process.argv[i-1]==='--config')}));});}`);
  const terminal = cli(['terminal', 'create', '--worktree', `id:${worktree}`, '--title', 'Launch policy probe', '--command',
    "omp --no-title --no-extensions --config /tmp/teck-conflicting.yml --extension /tmp/teck-policy-inspector.mjs 'Read-only launch-policy probe. Reply POLICY_PROBE_OK. Do not create tasks or change records.'"]);
  for (let i = 0; i < 40; i++) {
    const value = JSON.parse(guest(['node', '-e', "const fs=require('fs');console.log(fs.existsSync('/tmp/teck-launch-policy-proof.json')?fs.readFileSync('/tmp/teck-launch-policy-proof.json','utf8'):'null')"]));
    if (value) {
      assert.ok(value.policyLoaded && value.nativeGoalAvailable && value.forbiddenToolsAbsent && value.noExtensionsFlag);
      assert.equal(value.configOrder.at(-1), '/home/agent/.omp/agent/orchestration.yml');
      return { ...value, terminal };
    }
    await delay(1500);
  }
  throw Error('Real OMP launch policy probe timed out');
}
try {
  await lifecycle('create');
  guest(['orca-ide', 'skills', 'get', 'orca-cli']);
  guest(['orca-ide', 'skills', 'get', 'orchestration']);
  const added = cli(['repo', 'add', '--path', '/home/agent/project']);
  const repoId = added.repo?.id ?? added.id ?? added.repoId;
  const parent = cli(['worktree', 'create', '--repo', `id:${repoId}`, '--name', 'goal-coordinator', '--no-parent', '--setup', 'skip']).worktree;
  report.worktree = parent.id;
  const prompt = `Controlled isolated workflow validation. LOCAL ONLY: no GitHub records, remote Git operations, publication or merge.
Your authorized goal is: deliver a reviewed clamp fix through Orca workers in this disposable fixture.
You are only the coordinator. Create the native goal and native todos, then use orca to create/bind one Run.
Dispatch an executor through orca_dispatch in new-child named clamp-executor. Objective: clamp rejects inverted ranges.
Acceptance: existing clamping behavior preserved; inverted min>max throws RangeError; a behavioral test demonstrates RED then GREEN;
node --test --experimental-test-coverage --test-coverage-include=**/clamp.mjs clamp.test.mjs passes; coverage does not decrease.
The executor must keep its native goal exact, return its worktree and evidence, send worker_done then idle. Do not create sub-issues or PRs.
Then dispatch one independent reviewer in that exact child checkout, never a fresh child, using the reviewer role.
Its acceptance is an explicit verdict about actual code, behavior and recorded RED/GREEN/coverage evidence; use git_inspect for the diff.
Require REVIEW_VERDICT=approve, REVIEW_VERDICT=request_changes or REVIEW_VERDICT=blocked in its report body.
If corrections are needed, dispatch them to an executor and obtain a delta review. Do not implement or run tests yourself.
Reconcile and release settled workers using their actual Dispatch IDs. Finish your native goal and todos only after approve and no reclaimable workers.
Do not publish anything. This is the explicit local-only acceptance gate. Stop when complete.`;
  report.launch = cli(['agent', 'launch', '--agent', 'omp', '--surface', 'terminal', '--worktree', `id:${parent.id}`,
    '--model', 'omniroute/teck-orchestrator', '--prompt', prompt]);
  writeFileSync(join(root, 'live.json'), JSON.stringify({ sandbox: name, worktree: parent.id, launch: report.launch }));
  const probe = `const fs=require('fs'),p=require('path');const folder='/home/agent/.local/state/teck-orca/omp-terminals';const rows=fs.existsSync(folder)?fs.readdirSync(folder).filter(n=>n.endsWith('.json')).map(n=>JSON.parse(fs.readFileSync(p.join(folder,n)))):[];const out=[];for(const r of rows){if(!r.sessionFile||!fs.existsSync(r.sessionFile))continue;const entries=fs.readFileSync(r.sessionFile,'utf8').trim().split('\\n').map(l=>JSON.parse(l));const calls=entries.filter(e=>e.type==='message'&&e.message?.role==='assistant').flatMap(e=>e.message.content??[]).filter(c=>c.type==='toolCall').map(c=>({name:c.name,args:c.arguments}));out.push({owner:r.owner,sessionId:r.sessionId,roles:entries.filter(e=>e.type==='custom'&&e.customType==='teck-orca-contract').map(e=>e.data),goals:entries.filter(e=>e.type==='mode_change'&&e.data?.goal).map(e=>e.data.goal),calls,errors:entries.filter(e=>e.type==='message'&&e.message?.role==='toolResult'&&e.message.isError).map(e=>({tool:e.message.toolName,content:e.message.content})).slice(-5)});}process.stdout.write(JSON.stringify(out));`;
  const deadline = Date.now() + 18 * 60_000;
  let last = '';
  while (Date.now() < deadline) {
    report.sessions = JSON.parse(guest(['node', '-e', probe]));
    const summary = report.sessions.map(s => `${s.roles.at(-1)?.role}:${s.goals.at(-1)?.status ?? 'no-goal'}:${s.calls.length}`).join(', ');
    if (summary !== last) { console.error(summary); last = summary; }
    const coordinator = report.sessions.find(s => s.owner.worktreeId === parent.id);
    if (coordinator?.goals.at(-1)?.status === 'complete') {
      const executor = report.sessions.find(s => s.roles.at(-1)?.role === 'executor' && s.goals.some(g => g.status === 'complete'));
      assert.ok(executor, 'A real executor completed its native goal');
      const runId = executor.roles.at(-1).authority.runId;
      const reviewers = report.sessions.filter(s => s.roles.at(-1)?.role === 'reviewer' && s.roles.at(-1)?.authority?.runId === runId);
      assert.ok(reviewers.some(s => s.goals.some(g => g.status === 'complete')));
      assert.ok(reviewers.some(s => s.calls.some(c => c.name === 'orca' && c.args.action === 'report' && /REVIEW_VERDICT=approve/.test(c.args.body))), 'This Run has explicit independent code approval');
      assert.ok(coordinator.calls.every(c => !['bash', 'eval', 'edit', 'write', 'task', 'git_inspect'].includes(c.name)));
      const run = coordinator.calls.find(c => c.name === 'orca' && (c.args.action === 'run_create' || c.args.args?.[1] === 'run-create'));
      assert.ok(run, 'Coordinator used real Orca orchestration');
      report.workers = cli(['orchestration', 'worker-list', '--run', runId]);
      assert.ok(report.workers.workers.every(w => w.terminalState === 'released'), 'Every settled worker was released');
      const child = cli(['worktree', 'show', '--worktree', `id:${executor.owner.worktreeId}`]).worktree;
      report.validation = guest(['node', '--test', '--experimental-test-coverage', '--test-coverage-include=**/clamp.mjs', `${child.path ?? child.id.split('::')[1]}/clamp.test.mjs`]);
      report.runId = runId;
      report.launchPolicy = await launchPolicyProbe(parent.id);
      report.ok = true;
      break;
    }
    await delay(5000);
  }
  assert.equal(report.ok, true, 'Goal orchestration exceeded its deadline');
} catch (error) { report.error = error.message; process.exitCode = 1; }
finally {
  if (JSON.parse(command('sbx', ['ls', '--json'])).some(row => row.name === name)) {
    command('sbx', ['rm', '--force', name], { progress: true }); report.cleanedUp = true;
  }
  const after = JSON.parse(command('sbx', ['ls', '--json']));
  report.cleanedUp = !after.some(row => row.name === name);
  assert.ok(before.every(original => after.some(row => row.name === original.name && row.id === original.id)), 'Pre-existing sandboxes were preserved');
  writeFileSync(join(root, 'result.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ ok: report.ok, cleanedUp: report.cleanedUp, error: report.error, result: join(root, 'result.json') }));
}
