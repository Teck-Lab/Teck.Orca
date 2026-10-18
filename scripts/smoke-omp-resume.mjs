// Explicit disposable recovery test. No desktop UI or existing VM is changed.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { command, createLifecycle, sandboxName, REMOTE_PROJECT, shellQuote, publishedEndpoint } from './lifecycle.mjs';
import { installRelease, repositoryRoot } from './release.mjs';

const projectId = `teck-omp-resume-${randomUUID()}`, featureId = 'resume';
const name = sandboxName(projectId, featureId);
const artifacts = join(repositoryRoot, '.artifacts/smoke', projectId);
mkdirSync(artifacts, { recursive: true });
const release = installRelease();
const lifecycle = createLifecycle({ assetRoot: release.destination, stateRoot: join(artifacts, 'features'),
  env: { ...process.env, ORCA_PROJECT_ID: projectId, ORCA_VM_INSTANCE_ID: featureId,
    ORCA_REPO_PATH: repositoryRoot, ORCA_REPO_URL: 'https://github.com/mattjohnson/orca-sbx-recipes.git',
    TECK_ORCA_CPUS: '2', TECK_ORCA_MEMORY: '4g' } });
const report = { sandbox: name, release: release.digest, checks: [], ok: false, cleanedUp: false };
const guest = args => command('sbx', ['exec', '-u', 'agent', name, ...args], { timeout: 120_000 });
const cli = args => {
  const r = JSON.parse(guest(['orca-ide', ...args, '--json']));
  assert.equal(r.ok, true, JSON.stringify(r.error)); return r.result;
};
const records = () => JSON.parse(guest(['python3', '-c',
  'import json,pathlib\nprint(json.dumps([json.loads(p.read_text()) for p in pathlib.Path("/home/agent/.local/state/teck-orca/omp-terminals").glob("*.json")]))']));
let payload;
try {
  const created = await lifecycle('create'); payload = { recipeResult: created };
  const added = cli(['repo', 'add', '--path', REMOTE_PROJECT]);
  const repoId = added.repo?.id ?? added.id ?? added.repoId;
  const parent = cli(['worktree', 'create', '--repo', `id:${repoId}`, '--name', 'resume-parent', '--no-parent', '--setup', 'skip']).worktree;
  report.worktree = parent.id;
  guest(['sh', '-c', `printf '%s\n' 'advisor: { enabled: false }' 'memory: { enabled: false }' > /tmp/teck-resume-test.yml`]);
  for (const marker of ['TECK_RESUME_MARKER_A', 'TECK_RESUME_MARKER_B']) {
    const launch = `omp --no-title --no-tools --no-skills --no-rules --config /tmp/teck-resume-test.yml --model omniroute/teck-fast-text ${shellQuote(`This is a read-only smoke test. Respond exactly ${marker}.`)}`;
    cli(['terminal', 'create', '--worktree', `id:${parent.id}`, '--title', marker, '--command', launch]);
  }
  const deadline = Date.now() + 120_000;
  let before;
  while (Date.now() < deadline) {
    before = records().filter(r => r.owner.worktreeId === parent.id && r.sessionFile);
    if (before.length === 2) {
      const complete = before.every(r => guest(['python3', '-c',
        `from pathlib import Path\np=Path(${JSON.stringify(r.sessionFile)})\nprint(p.exists() and '"role":"assistant"' in p.read_text().replace(' ',''))`]).trim() === 'True');
      if (complete) break;
    }
    await delay(1500);
  }
  assert.equal(before?.length, 2, 'Both real OMP terminals must publish exact session files');
  assert.notEqual(before[0].sessionFile, before[1].sessionFile);
  assert.notEqual(before[0].owner.paneKey, before[1].owner.paneKey);
  assert.ok(before.every(r => r.model === 'omniroute/teck-fast-text'));
  report.sessions = before.map(r => ({ pane: r.owner.paneKey, sessionId: r.sessionId, model: r.model }));
  report.checks.push('two real Orca OMP terminals in one worktree record distinct root conversations');
  command('sbx', ['stop', name], { progress: true });
  assert.equal(JSON.parse(command('sbx', ['ls', '--json'])).find(r => r.name === name).status, 'stopped');
  // Match reconnect-host: wake and start only; no configuration sync after stop.
  guest(['true']);
  guest(['node', '/usr/local/lib/teck-orca/manage-daemon.mjs', publishedEndpoint(command('sbx', ['ports', name, '--json']))]);
  const stopped = records();
  assert.ok(stopped.every(r => r.active), 'VM stop must leave crash-recoverable active sessions');
  // Exercise the guest shell fallback with the original stable pane identities.
  // These PTYs test the launcher; they do not claim to exercise desktop GUI Retry.
  const probe = `import json,os,pty,subprocess,time,pathlib,signal
rows=json.loads(pathlib.Path('/tmp/teck-resume-before.json').read_text())
children=[]
try:
 for row in rows:
  master,slave=pty.openpty()
  env=os.environ.copy()
  for key in ['ORCA_AGENT_LAUNCH_TOKEN','ORCA_SEQUENCED_STARTUP_COMMAND','ORCA_SEQUENCED_STARTUP_SCRIPT']:
   env.pop(key,None)
  env.update(ORCA_PANE_KEY=row['owner']['paneKey'],ORCA_WORKTREE_ID=row['owner']['worktreeId'])
  p=subprocess.Popen(['bash','-i'],cwd=row['owner']['cwd'],env=env,stdin=slave,stdout=slave,stderr=slave,start_new_session=True)
  os.close(slave)
  children.append((p,master))
 deadline=time.time()+60
 while time.time()<deadline:
  current=[json.loads(p.read_text()) for p in pathlib.Path('/home/agent/.local/state/teck-orca/omp-terminals').glob('*.json')]
  if len(current)==2 and all(r.get('sessionId') and r['bootId']!=rows[0]['bootId'] for r in current):
   assert {r['sessionId'] for r in current}=={r['sessionId'] for r in rows}, 'wrong sessions resumed'
   assert all(r['model']=='omniroute/teck-fast-text' for r in current), 'wrong model restored'
   print(json.dumps({'ok':True,'sessions':[r['sessionId'] for r in current]}))
   break
  time.sleep(1)
 else:
  raise Exception('Shell fallback did not restore both exact sessions')
finally:
 for p,master in children:
  os.killpg(p.pid,signal.SIGTERM)
  os.close(master)
`;
  guest(['sh', '-c', `printf '%s' ${shellQuote(JSON.stringify(before))} > /tmp/teck-resume-before.json`]);
  const resumed = JSON.parse(guest(['python3', '-c', probe]));
  assert.equal(resumed.ok, true);
  report.checks.push('real VM stop/start and bare restored shells reopen both exact OMP sessions and models');
  report.ok = true;
} catch (error) { report.error = error.message.replace(/orca:\/\/pair\?[^\s"']+/g, '[redacted]'); process.exitCode = 1; }
finally {
  try {
    if (JSON.parse(command('sbx', ['ls', '--json'])).some(r => r.name === name)) command('sbx', ['rm', '--force', name], { progress: true });
    if (payload) await lifecycle('cleanup', payload);
    report.cleanedUp = true;
  } catch (error) { report.cleanupError = error.message; process.exitCode = 1; }
  writeFileSync(join(artifacts, 'result.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
}
