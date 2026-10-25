// Explicit live tests use a new mountless VM, never a project sandbox.
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const template='docker.io/docker/sandbox-templates:shell-docker@sha256:5fc81bc7a127e59d81b244a06831ae3212a0310b2e5a0349c54e29249e45e919';
const labName=name=>{if(!/^teck-k8s-test-[a-f0-9]{12}$/.test(name))throw Error('Expected an isolated test sandbox name');return name;};
export function command(program,args,options={}) {
  const r=spawnSync(program,args,{shell:false,windowsHide:true,encoding:'utf8',input:options.input,
    timeout:options.timeout??900000,maxBuffer:32*1024*1024,
    env:{...process.env,...(process.platform==='win32'?{TMPDIR:tmpdir()}:{}),...options.env}});
  if(options.progress){if(r.stdout)process.stderr.write(r.stdout);if(r.stderr)process.stderr.write(r.stderr);}
  if(r.error)throw Error(`${program}: ${r.error.message}`);
  if(r.status!==0)throw Error(`${program} ${args[0]} failed (${r.status}): ${r.stderr||r.stdout}`);
  return r.stdout??'';
}
function inventory(run){
  const rows=JSON.parse(run('sbx',['ls','--json']));
  if(!Array.isArray(rows)||rows.some(r=>typeof r.name!=='string'||typeof r.id!=='string'||!r.id)||new Set(rows.map(r=>r.name)).size!==rows.length||new Set(rows.map(r=>r.id)).size!==rows.length)throw Error('Unverifiable sandbox inventory');
  return rows;
}
export function createLab({name=`teck-k8s-test-${randomUUID().replaceAll('-','').slice(0,12)}`,run=command}={}) {
  labName(name);
  const before=inventory(run);
  if(before.some(r=>r.name===name))throw Error('Test sandbox already exists; refusing adoption');
  run('sbx',['create','--no-progress','--name',name,'--cpus','8','--memory','16g','--skills','off','--template',template,'shell'],
    {env:{DOCKER_SANDBOXES_DOCKER_SIZE:'40g',DOCKER_SANDBOXES_ROOT_SIZE:'30g'},progress:true});
  const created=inventory(run).find(r=>r.name===name);
  if(!created||before.some(r=>r.id===created.id))throw Error('Cannot verify new test identity');
  return {version:1,name,id:created.id,template,protected:before.map(({name,id})=>({name,id})),createdAt:new Date().toISOString()};
}
export function verifyLab(lab,{run=command}={}) {
  labName(lab?.name);
  if(typeof lab.id!=='string'||!lab.id||!Array.isArray(lab.protected)||lab.protected.some(r=>r.name===lab.name||r.id===lab.id))throw Error('Invalid test ownership');
  const current=inventory(run).find(r=>r.name===lab.name);
  if(current?.id!==lab.id)throw Error('Test sandbox identity changed or missing');
  return current;
}
export function runInLab(lab,args,options={}) {
  const run=options.run??command;verifyLab(lab,{run});
  return run('sbx',['exec','-u','root',lab.name,...args],options);
}
export function removeLab(lab,{run=command}={}) {
  verifyLab(lab,{run});run('sbx',['rm','--force',lab.name],{progress:true});
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const args=process.argv.slice(2),index=args.indexOf('--record');
  const record=resolve(index>=0?args[index+1]:'.artifacts/kubernetes-lab/active.json');
  if(dirname(record)!==resolve('.artifacts/kubernetes-lab')||!record.endsWith('.json'))throw Error('Test ownership records must stay in .artifacts/kubernetes-lab');
  if(index>=0)args.splice(index,2);
  const action=args[0];
  if(action==='create'){
    if(existsSync(record))throw Error('A test ownership record already exists; inspect before creating another lab');
    const lab=createLab();mkdirSync(dirname(record),{recursive:true});writeFileSync(record,JSON.stringify(lab,null,2)+'\n');
    console.log(JSON.stringify(lab));
  }else{
    const lab=JSON.parse(readFileSync(record,'utf8'));
    if(action==='exec')process.stdout.write(runInLab(lab,args.slice(1),{input:readFileSync(0,'utf8'),progress:false}));
    else if(action==='script')process.stdout.write(runInLab(lab,['sh','-s'],{input:readFileSync(resolve(args[1]),'utf8'),progress:false}));
    else if(action==='start'||action==='stop'){verifyLab(lab);command('sbx',[action==='start'?'run':'stop',...(action==='start'?['--detach','--name']:[]),lab.name],{progress:true});}
    else if(action==='remove')removeLab(lab);
    else if(action==='verify')console.log(JSON.stringify(verifyLab(lab)));
    else throw Error('Use create, exec, script <path>, start, stop, verify or remove');
  }
}
