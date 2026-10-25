import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

// This gate checks ambient policy routing, not complete cluster compatibility.
// A private network namespace makes the live rule probe side-effect free.
export function ambientRoutingReport(config,probe){
  const available=typeof config==='string'&&config.length>0;
  const required=['CONFIG_IP_ADVANCED_ROUTER','CONFIG_IP_MULTIPLE_TABLES','CONFIG_FIB_RULES'];
  const missing=available?required.filter(name=>!new RegExp('^'+name+'=y$','m').test(config)):[];
  const ok=missing.length===0&&probe?.ok===true;
  return {ok,configAvailable:available,missing,probe:probe??{ok:false,error:'Live IPv4 routing probe not run'},
    ...(!ok?{error:'Istio ambient requires IPv4 policy routing in the VM kernel. '+(missing.length?'Missing '+missing.join(', ')+'. ':'')+(probe?.error??'')+' Package installation and workload kits cannot enable features compiled out of the kernel.'}:{})};
}
export function checkAmbientRouting(){
  let config;
  try{config=gunzipSync(readFileSync('/proc/config.gz')).toString();}catch{}
  let probe;
  try{execFileSync('unshare',['--net','ip','-4','rule','add','fwmark','1024','table','100'],{encoding:'utf8',timeout:10000,stdio:['ignore','pipe','pipe']});probe={ok:true};}
  catch(error){probe={ok:false,error:error.stderr?.toString().trim()||error.message.split('\n')[0]};}
  return ambientRoutingReport(config,probe);
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)&&process.argv[2]==='--check'){
  const report=checkAmbientRouting();console.log(JSON.stringify(report,null,2));if(!report.ok)process.exitCode=1;
}
