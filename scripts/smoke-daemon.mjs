// Explicit isolated daemon acceptance; no project sandboxes or desktop changes.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { command, createLifecycle, sandboxName } from './lifecycle.mjs';
import { installRelease, repositoryRoot } from './release.mjs';

const projectId = 'teck-orca-daemon-' + randomUUID(), featureId = 'version';
const name = sandboxName(projectId, featureId), release = installRelease();
const root = join(repositoryRoot, '.artifacts/smoke', projectId);
mkdirSync(root, { recursive: true });
const before = JSON.parse(command('sbx', ['ls', '--json']));
const expected = JSON.parse(readFileSync(join(repositoryRoot, 'runtime/kits/orcad/bundle/provenance.json')));
const report = { name, version: expected.version, nodeVersion: expected.nodeVersion, ok: false };
const run = (program, args, options) => args[0] === 'exec' && args[2] === 'git' && args[3] === 'clone' ?
  command('sbx', ['exec', '-u', 'agent', name, 'node', '-e',
    "const fs=require('fs'),cp=require('child_process');fs.mkdirSync('/home/agent/project',{recursive:true});for(const a of [['init','-b','main'],['config','user.name','Disposable daemon probe'],['config','user.email','probe@example.invalid'],['config','commit.gpgsign','false'],['commit','--allow-empty','-m','test: local daemon fixture']])cp.execFileSync('git',a,{cwd:'/home/agent/project'});"], options) : command(program, args, options);
const lifecycle = createLifecycle({ assetRoot: release.destination, stateRoot: join(root, 'features'), run,
  env: { ...process.env, ORCA_PROJECT_ID: projectId, ORCA_VM_INSTANCE_ID: featureId,
    ORCA_REPO_URL: 'https://example.invalid/local-daemon-probe.git', TECK_ORCA_CPUS: '2', TECK_ORCA_MEMORY: '4g' } });
const guest = args => command('sbx', ['exec', '-u', 'agent', name, ...args], { timeout: 120000 });
const cli = args => {
  const value = JSON.parse(guest(['orca-ide', ...args, '--json']));
  assert.equal(value.ok, true, JSON.stringify(value.error)); return value.result;
};
const identity = () => guest(['node', '-e', "const fs=require('fs'),c=require('crypto');const p='/home/agent/.local/share/teck-orca/orca';const files=fs.readdirSync(p).filter(n=>/key|identity|pair/i.test(n)).sort();let h=c.createHash('sha256');for(const n of files){const f=p+'/'+n;if(fs.statSync(f).isFile()){h.update(n);h.update(fs.readFileSync(f));}}console.log(JSON.stringify({files,hash:h.digest('hex')}));"]);
try {
  console.error('Disposable daemon validation: ' + name);
  const created = await lifecycle('create');
  guest(['orca-ide', 'skills', 'get', 'orca-cli']);
  guest(['orca-ide', 'skills', 'get', 'orchestration']);
  report.status = cli(['status']);
  assert.equal(report.status.runtime.reachable, true);
  assert.equal(report.status.runtime.appVersion, expected.version);
  assert.equal(guest(['/opt/teck-orcad/node', '--version']).trim(), 'v' + expected.nodeVersion);
  const added = cli(['repo', 'add', '--path', '/home/agent/project']);
  const repoId = added.repo?.id ?? added.repoId ?? added.id;
  const parent = cli(['worktree', 'create', '--repo', 'id:' + repoId, '--name', 'daemon-parent', '--no-parent', '--setup', 'skip']).worktree;
  report.parent = parent.id;
  const child = cli(['worktree', 'create', '--repo', 'id:' + repoId, '--name', 'daemon-child', '--parent-worktree', 'id:' + parent.id, '--setup', 'skip']).worktree;
  report.child = child.id;
  const marker = 'TECK_DAEMON_' + randomUUID();
  const terminal = cli(['terminal', 'create', '--worktree', 'id:' + child.id, '--title', 'Daemon acceptance terminal',
    '--command', `node -e "console.log('${marker}');setInterval(()=>{},1000)"`]).terminal;
  report.terminal = terminal.handle;
  const { setTimeout: delay } = await import('node:timers/promises');
  let seen = false;
  for (let i = 0; i < 20; i++) {
    if (JSON.stringify(cli(['terminal', 'read', '--terminal', terminal.handle, '--limit', '30'])).includes(marker)) { seen = true; break; }
    await delay(500);
  }
  assert.ok(seen, 'Managed terminal output is readable');
  cli(['terminal', 'close', '--terminal', terminal.handle]);
  const originalIdentity = identity();
  assert.ok(JSON.parse(originalIdentity).files.length, 'Persistent identity files were found');
  command('sbx', ['stop', name]);
  await lifecycle('resume', { recipeResult: created });
  report.resumed = cli(['status']);
  assert.equal(report.resumed.runtime.appVersion, expected.version);
  assert.equal(report.resumed.runtime.reachable, true);
  const trees = cli(['worktree', 'list']).worktrees;
  assert.ok(trees.some(tree => tree.id === parent.id) && trees.some(tree => tree.id === child.id));
  assert.equal(identity(), originalIdentity, 'Persistent pairing/identity files survive restart');
  report.identityPreserved = true;
  report.providerId = JSON.parse(command('sbx', ['ls', '--json'])).find(row => row.name === name).id;
  report.ok = true;
} catch (error) { report.error = error.message; process.exitCode = 1; }
finally {
  if (JSON.parse(command('sbx', ['ls', '--json'])).some(row => row.name === name)) command('sbx', ['rm', '--force', name], { progress: true });
  const after = JSON.parse(command('sbx', ['ls', '--json']));
  report.cleanedUp = !after.some(row => row.name === name);
  report.existingPreserved = before.every(b => after.some(a => a.name === b.name && a.id === b.id));
  assert.ok(report.existingPreserved);
  writeFileSync(join(root, 'result.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ ok: report.ok, cleanedUp: report.cleanedUp, error: report.error, result: join(root, 'result.json') }));
}
