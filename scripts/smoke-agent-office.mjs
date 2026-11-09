// Real OMP smoke in an isolated guest directory; never touches the user's agent turns.
import fs from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
const name=process.argv[2];
if(!/^teck-orca-ssh-[a-f0-9]{12}$/.test(name))throw Error('Choose an owned sandbox');
const record=JSON.parse(fs.readFileSync(join(homedir(),'.teck-orca','office','server','office.json')));
const events=[];const abort=new AbortController();
const response=await fetch(record.url+'/events',{signal:abort.signal});
const collect=(async()=>{const reader=response.body.getReader(),decoder=new TextDecoder();let pending='';try{while(true){const x=await reader.read();if(x.done)break;pending+=decoder.decode(x.value,{stream:true});let sep;while((sep=/\r?\n\r?\n/.exec(pending))){const frame=pending.slice(0,sep.index);pending=pending.slice(sep.index+sep[0].length);if(frame.includes('event: office')){const data=frame.split('\n').find(s=>s.startsWith('data:'));if(data)events.push(JSON.parse(data.slice(5)))}}}}catch(e){if(e.name!=='AbortError')throw e}})();
const script=String.raw`set -eu
. /etc/teck-orca/environment.sh
stage=$(mktemp -d /tmp/teck-office-omp-smoke-XXXXXX)
printf '%s\n' 'memory:' '  backend: off' 'hindsight:' '  autoRecall: false' '  autoRetain: false' 'modelRoles:' '  task: omniroute/teck-fast-tool' > "$stage/config.yml"
cd "$stage"
/usr/local/bin/omp --print --cwd "$stage" --session-dir "$stage/sessions" --config "$stage/config.yml" --no-skills --no-rules --no-context-files --no-lsp --no-title --tools task --model omniroute/teck-fast-tool --thinking off --max-time 70 --max-cost 0.15 'Use the task tool to spawn exactly one helper. Its entire task is to respond OFFICE_HELPER_OK without using any tools. When it completes, reply OFFICE_OK. Do not read or change files or do any other work.'
`;
let output='';let child;
try{
 child=spawn('ssh',['-o','BatchMode=yes',`${name}.sbx`,`echo ${Buffer.from(script).toString('base64')} | base64 -d | bash`],{windowsHide:true,stdio:['ignore','pipe','pipe']});
 child.stdout.on('data',b=>{output=(output+b).slice(-6000)});child.stderr.on('data',b=>{output=(output+b).slice(-6000)});
 const timeout=setTimeout(()=>child.kill(),100_000);
 const code=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',resolve)});clearTimeout(timeout);
 assert.equal(code,0,output);
 assert.ok(output.includes('OFFICE_OK'),output);
 const ours=events.filter(e=>e.agent==='omp');
 assert.ok(ours.some(e=>e.kind==='session_start'),'No real OMP start observed');
 assert.ok(ours.some(e=>e.kind==='subagent_start'&&e.parentId),'No native helper relationship observed');
 assert.ok(ours.some(e=>e.kind==='tool_start'&&e.tool==='task'),'No task execution observed');
 console.log(JSON.stringify({passed:true,url:record.url,events:ours.map(e=>({kind:e.kind,workerId:e.workerId,parentId:e.parentId,tool:e.tool})),output:output.slice(-800)},null,2));
}finally{abort.abort();await collect;child?.kill();}
