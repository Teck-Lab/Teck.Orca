import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { updatePayload, updateSandbox } from '../runtime/sandbox-update.mjs';
import { isOmpProcess, validManagedPath, validatePayload } from '../runtime/sandbox-update-guest.mjs';
import { workflowDigest, workflowFiles } from '../runtime/workflow-assets.mjs';

test('maintenance payload verifies every file and rejects attempts to overwrite user config or escape managed paths', () => {
  const payload = updatePayload(); assert.equal(validatePayload(payload), payload);
  for (const path of ['config.yml', 'mcp.json', '../credentials', 'runtime/../x', 'skills/orchestration/../../config.yml', '/etc/passwd', 'skills/orchestration/../x']) assert.equal(validManagedPath(path), false);
  assert.equal(validManagedPath('runtime/omp-launch.mjs'), true);
  for (const path of ['extensions/omniroute-research.ts', 'extensions/lib/mcphub-client.mjs', 'extensions/lib/mcphub-search.mjs', 'extensions/lib/mcphub-firecrawl.mjs']) {
    assert.equal(validManagedPath(path), true);
    assert.ok(payload.files.some(file => file.path === path), 'maintenance must include the research extension and all of its dependencies');
  }
  for(const path of ['WATCHDOG.yml','agents/implementation-worker.md','agents/correctness-reviewer.md','agents/security-auditor.md']){
    assert.equal(validManagedPath(path),true);
    assert.ok(payload.files.some(file=>file.path===path),'managed updates must carry the native worker/review presets and their advisor policy together');
  }
  assert.equal(validManagedPath('agents/user-custom-agent.md'),false);
  const broken = structuredClone(payload); broken.files[0].data = Buffer.from('tampered').toString('base64');
  assert.throws(() => validatePayload(broken), /checksum/);
  const duplicate = structuredClone(payload); duplicate.files.push(duplicate.files[0]); assert.throws(() => validatePayload(duplicate), /path/);
  assert.equal(payload.files.some(f => /config\.yml|mcp\.json|session.*jsonl|token/.test(f.path)), false);
});
test('process guard covers both old and staged OMP plus the pane launcher, excluding unrelated tools', () => {
  for (const args of [['bun','/opt/paseo-omp/lib/node_modules/agent/cli.ts'], ['bun','/opt/teck-omp/releases/18.16.0/bin/omp'], ['node','/usr/local/lib/teck-orca/omp-launch.mjs'], ['sh','/usr/local/lib/teck-orca/omp']]) assert.equal(isOmpProcess(args), true);
  assert.equal(isOmpProcess(['node', '/tmp/teck-sandbox-update-example/apply.mjs']), false);
  assert.equal(isOmpProcess(['node', '/usr/local/lib/orca/server.js']), false);
});
test('native recipe and maintenance collect exactly the same workflow bytes and digest', () => {
  assert.equal(readFileSync('runtime/workflow-assets.mjs','utf8'), readFileSync('native-ssh/workflow-assets.mjs','utf8'));
  const files = workflowFiles('runtime/omp', 'runtime');
  assert.equal(workflowDigest(files), updatePayload().digest);
});
test('host update fences identity and refuses open OMP before copying or running an installer', async t => {
  const root = mkdtempSync(join(tmpdir(), 'teck-update-test-')); t.after(() => rmSync(root, {recursive:true,force:true}));
  const projectId = 'github:example/project', name = 'teck-orca-ssh-' + createHash('sha256').update(projectId).digest('hex').slice(0,12);
  mkdirSync(join(root,name)); writeFileSync(join(root,name,'state.json'), JSON.stringify({version:1,projectId,sandboxId:'vm',sandboxName:name,projectRoot:'/home/agent/project',phase:'ready'}));
  const base = {projectId,sandboxId:'vm',root};
  let calls=[];
  await assert.rejects(updateSandbox({...base,run:async(_p,args)=>{calls.push(args);return args[0]==='ls'?JSON.stringify([{name,id:'other',status:'running'}]):'0';}}),/unchanged/);
  assert.equal(calls.length,1); calls=[];
  await assert.rejects(updateSandbox({...base,run:async(_p,args)=>{calls.push(args);return args[0]==='ls'?JSON.stringify([{name,id:'vm',status:'running'}]):'2\n';}}),/Close all OMP/);
  assert.equal(calls.some(a=>a[0]==='cp'),false);
  await assert.rejects(updateSandbox({...base,sandboxId:'replaced',run:()=>{throw Error('Must not run');}}),/ownership/);
  calls=[];
  const result = await updateSandbox({...base,run:async(_p,args)=>{
    calls.push(args);
    if(args[0]==='ls')return JSON.stringify([{name,id:'vm',status:'running'}]);
    if(args[0]==='cp')assert.ok(readFileSync(join(args[1],'payload.json'),'utf8').includes(updatePayload().digest));
    if(args.at(-1)?.endsWith('/payload.json'))return JSON.stringify({omp:updatePayload().omp,digest:updatePayload().digest});
    return '0';
  }});
  assert.match(result.message,/Reopen OMP/);
  assert.equal(calls.some(a=>['create','rm','stop','run'].includes(a[0])),false);
  assert.equal(calls.filter(a=>a[0]==='cp').length,1);
});
