import {spawn} from 'node:child_process';

export async function command(program,args,{input,timeout=600_000,env}={}){
  return new Promise((resolve,reject)=>{
    const child=spawn(program,args,{shell:false,windowsHide:true,stdio:['pipe','pipe','pipe'],env:{...process.env,...env}});
    let stdout='',stderr='',expired=false;
    const timer=setTimeout(()=>{expired=true;child.kill();},timeout);
    child.stdout.on('data',chunk=>{stdout=(stdout+chunk).slice(-32*1024*1024);});
    child.stderr.on('data',chunk=>{stderr=(stderr+chunk).slice(-32_000);});
    child.once('error',error=>{clearTimeout(timer);reject(Error(`${program} could not start: ${error.message}`));});
    child.once('close',code=>{clearTimeout(timer);if(expired||code!==0)reject(Error(`${program} ${args[0]} ${expired?'timed out':`failed (${code})`}: ${stderr||stdout}`));else resolve(stdout);});
    child.stdin.on('error',()=>{});child.stdin.end(input);
  });
}
