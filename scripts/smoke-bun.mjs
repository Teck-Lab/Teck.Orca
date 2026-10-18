// Explicit disposable validation: never touches an existing feature or terminal.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { command, createLifecycle, sandboxName } from './lifecycle.mjs';
import { installRelease, repositoryRoot } from './release.mjs';

const projectId = `teck-orca-bun-${randomUUID()}`;
const featureId = 'install-permissions';
const name = sandboxName(projectId, featureId);
const artifactRoot = join(repositoryRoot, '.artifacts', 'smoke', projectId);
mkdirSync(artifactRoot, { recursive: true });
const release = installRelease();
const lifecycle = createLifecycle({ assetRoot: release.destination, stateRoot: join(artifactRoot, 'features'),
  env: { ...process.env, ORCA_PROJECT_ID: projectId, ORCA_VM_INSTANCE_ID: featureId,
    ORCA_REPO_PATH: repositoryRoot, ORCA_REPO_URL: 'https://github.com/mattjohnson/orca-sbx-recipes.git',
    TECK_ORCA_CPUS: '2', TECK_ORCA_MEMORY: '4g' } });
const report = { sandbox: name, release: release.digest, ok: false, cleanedUp: false };
try {
  await lifecycle('create');
  const probe = `import os,json,shutil,subprocess
from pathlib import Path
p=Path('/home/agent/bun-install-probe')
p.mkdir()
(p/'package.json').write_text(json.dumps({'name':'permission-probe','dependencies':{'is-number':'7.0.0'}}))
cache=Path('/home/agent/.bun/install/cache')
for directory in [Path('/home/agent/.bun'),cache.parent,cache]:
 assert directory.stat().st_uid==os.getuid(),str(directory)
 assert os.access(directory,os.W_OK),str(directory)
results=[]
for label,args,extra in [('cold-cache',['install','--ignore-scripts'],{}),('frozen-default',['install','--frozen-lockfile','--ignore-scripts'],{}),('frozen-custom-tmp',['install','--frozen-lockfile','--ignore-scripts'],{'TMPDIR':str(p)})]:
 if (p/'node_modules').exists(): shutil.rmtree(p/'node_modules')
 r=subprocess.run(['bun',*args],cwd=p,env={**os.environ,**extra},capture_output=True,text=True,timeout=90)
 assert r.returncode==0,label+': '+r.stdout+r.stderr
 assert (p/'node_modules/is-number/index.js').is_file(),label
 results.append({'check':label,'exitCode':r.returncode})
print(json.dumps({'uid':os.getuid(),'cacheOwnerUid':cache.stat().st_uid,'installs':results}))
`;
  report.bun = JSON.parse(command('sbx', ['exec', '-u', 'agent', name, 'python3', '-c', probe], { timeout: 300_000 }));
  assert.equal(report.bun.installs.length, 3);
  report.ok = true;
} catch (error) {
  report.error = error.message;
  process.exitCode = 1;
} finally {
  try {
    if (JSON.parse(command('sbx', ['ls', '--json'])).some((row) => row.name === name)) {
      command('sbx', ['rm', '--force', name], { progress: true });
    }
    // The VM is gone; lifecycle cleanup can now clear this test's ownership record.
    await lifecycle('cleanup', { recipeResult: { userData: { projectId, featureId, instanceId: featureId, sandboxName: name } } });
    report.cleanedUp = true;
  } catch (error) { report.cleanupError = error.message; process.exitCode = 1; }
  writeFileSync(join(artifactRoot, 'result.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
}
