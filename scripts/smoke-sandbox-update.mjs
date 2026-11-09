// A uniquely named disposable workload; never calls maintenance on a user VM.
import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { mkdirSync, writeFileSync, readFileSync, cpSync } from 'node:fs';
import { join } from 'node:path';
import { command } from '../native-ssh/src/system.mjs';
import { ensureKitBuilder } from '../native-ssh/src/provider.mjs';
import { updatePayload } from '../runtime/sandbox-update.mjs';
const root = process.cwd(), name = 'teck-orca-f-' + createHash('sha256').update(randomUUID()).digest('hex').slice(0,12);
const folder = join(root, '.artifacts', 'smoke', name); mkdirSync(folder, {recursive:true});
const before = JSON.parse(await command('sbx',['ls','--json']));
const report = { name, ok:false }; let id;
const exec = args => command('sbx',['exec','-u','root',name,...args],{timeout:900000});
try {
  assert.ok(!before.some(r=>r.name===name));
  await ensureKitBuilder(); console.error('Creating disposable update check: '+name);
  await command('sbx',['create','--no-progress','--name',name,'--cpus','2','--memory','4g','--skills','off',join(root,'runtime/kits/workload')],{log: s=>process.stderr.write(s)});
  const row=JSON.parse(await command('sbx',['ls','--json'])).find(r=>r.name===name);assert.ok(row);id=row.id;
  await command('sbx',['run','--detach','--name',name]);
  const init="const f=require('fs');f.mkdirSync('/home/agent/.omp/agent',{recursive:true});f.mkdirSync('/usr/local/lib/teck-orca',{recursive:true});f.mkdirSync('/etc/teck-orca',{recursive:true});for(const [p,v]of [['/home/agent/.omp/agent/config.yml','modelRoles: sentinel\\n'],['/home/agent/.omp/agent/mcp.json','{\"sentinel\":true}'],['/home/agent/.omp/session-sentinel.jsonl','saved-conversation'],['/home/agent/project-sentinel','uncommitted-work']])f.writeFileSync(p,v);";
  await exec(['node','-e',init]);
  await exec(['node','-e',"const f=require('fs');f.writeFileSync('/usr/local/lib/teck-orca/omp','#!/bin/sh\\n. /etc/teck-orca/environment.sh\\nexec node /usr/local/lib/teck-orca/omp-launch.mjs \\\"$@\\\"\\n',{mode:0o755});f.writeFileSync('/etc/teck-orca/environment.sh','');"]);
  writeFileSync(join(folder,'payload.json'),JSON.stringify(updatePayload()));
  cpSync(join(root,'runtime/sandbox-update-guest.mjs'),join(folder,'apply.mjs'));
  await command('sbx',['cp',folder,name+':/tmp/']);
  const remote='/tmp/'+name;
  // Verify an actual versioned npm install even though the image already pins
  // today's version. This exercises the upgrade path without downgrading it.
  const pending=exec(['node',remote+'/apply.mjs',remote+'/payload.json','--force-install']);pending.catch(()=>{});
  const {setTimeout:delay}=await import('node:timers/promises');
  for(let i=0;i<20;i++){const lock=(await exec(['node','-e',"console.log(require('fs').existsSync('/etc/teck-orca/update.lock'))"])).trim();if(lock==='true')break;await delay(100);}
  try{await assert.rejects(exec(['/usr/local/lib/teck-orca/omp','--version']),/maintenance is in progress/);report.launchGuardVerified=true;}
  finally{report.update=JSON.parse(await pending);}
  const check="const f=require('fs'),c=require('child_process');const p=JSON.parse(f.readFileSync('/etc/teck-orca/omp-runtime.json')).prefix;console.log(JSON.stringify({version:c.execFileSync(p+'/bin/omp',['--version'],{encoding:'utf8'}).trim(),config:f.readFileSync('/home/agent/.omp/agent/config.yml','utf8'),mcp:f.readFileSync('/home/agent/.omp/agent/mcp.json','utf8'),session:f.readFileSync('/home/agent/.omp/session-sentinel.jsonl','utf8'),work:f.readFileSync('/home/agent/project-sentinel','utf8'),lock:f.existsSync('/etc/teck-orca/update.lock'),digest:f.readFileSync('/home/agent/.omp/agent/teck-workflow.sha256','utf8')}));";
  report.verified=JSON.parse(await exec(['node','-e',check]));
  assert.equal(report.verified.version,'omp/'+updatePayload().omp);assert.match(report.verified.config,/sentinel/);assert.equal(report.verified.mcp,'{"sentinel":true}');
  assert.equal(report.verified.session,'saved-conversation');assert.equal(report.verified.work,'uncommitted-work');assert.equal(report.verified.lock,false);assert.equal(report.verified.digest,updatePayload().digest);
  report.repeat=JSON.parse(await exec(['node',remote+'/apply.mjs',remote+'/payload.json']));
  const prepareRollback="const f=require('fs'),c=require('crypto');const p=JSON.parse(f.readFileSync(process.argv[1]));const paths=p.files.map(x=>x.path.startsWith('runtime/')?'/usr/local/lib/teck-orca/'+x.path.slice(8):'/home/agent/.omp/agent/'+x.path);f.writeFileSync('/tmp/teck-managed-before.json',JSON.stringify(paths.map(path=>[path,c.createHash('sha256').update(f.readFileSync(path)).digest('hex')])));const target=paths.at(-1);f.renameSync(target,target+'.smoke-backup');f.symlinkSync('/home/agent/project-sentinel',target);";
  await exec(['node','-e',prepareRollback,remote+'/payload.json']);
  await assert.rejects(exec(['node',remote+'/apply.mjs',remote+'/payload.json']),/Sandbox update failed/);
  const verifyRollback="const f=require('fs'),c=require('crypto');const rows=JSON.parse(f.readFileSync('/tmp/teck-managed-before.json'));const last=rows.at(-1)[0];f.unlinkSync(last);f.renameSync(last+'.smoke-backup',last);if(rows.some(([p,h])=>c.createHash('sha256').update(f.readFileSync(p)).digest('hex')!==h))throw Error('Managed rollback mismatch');if(f.readFileSync('/home/agent/project-sentinel','utf8')!=='uncommitted-work'||f.existsSync('/etc/teck-orca/update.lock'))throw Error('Rollback damaged project or left lock');console.log('rollback verified');";
  assert.match(await exec(['node','-e',verifyRollback]),/rollback verified/);report.rollbackVerified=true;
  // A process with an OMP entry path is enough to prove the /proc gate without
  // consuming model tokens or creating an interactive agent.
  await exec(['sh','-c',"nohup node -e 'setInterval(()=>{},1000)' /opt/paseo-omp/test-maintenance-guard >/tmp/teck-update-guard.log 2>&1 &"]);
  await assert.rejects(exec(['node',remote+'/apply.mjs',remote+'/payload.json']),/Close all OMP/);
  report.busyRefused=true; report.ok=true;
}catch(error){report.error=error.message;process.exitCode=1;}
finally{
  const current=JSON.parse(await command('sbx',['ls','--json'])).find(r=>r.name===name);
  if(current){assert.equal(current.id,id);await command('sbx',['rm','--force',name]);}
  const after=JSON.parse(await command('sbx',['ls','--json']));report.cleanedUp=!after.some(r=>r.name===name);
  report.existingPreserved=before.every(b=>after.some(a=>a.id===b.id&&a.name===b.name));assert.ok(report.existingPreserved);
  writeFileSync(join(folder,'result.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({ok:report.ok,cleanedUp:report.cleanedUp,error:report.error,path:join(folder,'result.json')}));
}
