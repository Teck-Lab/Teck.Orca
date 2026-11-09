// Keep OpenSSH outside Electron's plugin worker and close it when its owner exits.
import { spawn, spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { officeTunnelArgs } from './agent-office-manager.mjs';
const [name, port, owner, guestPort] = process.argv.slice(2);
const ownerPid = Number(owner);
if (!Number.isSafeInteger(ownerPid) || ownerPid < 1) throw Error('Invalid tunnel owner');
const args = officeTunnelArgs(name, Number(port),Number(guestPort));
// Docker's SSH proxy resolves %LocalAppData% using its canonical mixed-case key.
// MSYS (Git's SSH) has case-sensitive environment lookups, unlike Windows itself.
const env={...process.env};
if(process.platform==='win32'){
  const local=Object.entries(env).find(([k])=>k.toLowerCase()==='localappdata')?.[1]||join(homedir(),'AppData','Local');
  for(const key of Object.keys(env))if(key.toLowerCase()==='localappdata')delete env[key];
  env.LocalAppData=local;
}
const candidates=process.platform==='win32'?[join(process.env.SystemRoot||'C:\\Windows','System32','OpenSSH','ssh.exe'),join(process.env.ProgramFiles||'C:\\Program Files','Git','usr','bin','ssh.exe')]:['ssh'];
const program=candidates.find(p=>spawnSync(p,['-V'],{cwd:homedir(),env,windowsHide:true,stdio:'ignore',timeout:3000}).status===0);
if(!program)throw Error('No usable OpenSSH client in the office helper');
const ssh = spawn(program, args,
  { cwd:homedir(), env, windowsHide:true, stdio:['pipe','ignore','pipe'] });
ssh.stdin.end();ssh.stderr.pipe(process.stderr);
let stopping=false;
function stop(){if(!stopping){
  stopping=true;
  if(process.platform==='win32'&&ssh.pid&&ssh.exitCode===null){
    // Terminating only ssh.exe leaves its ProxyCommand (sbx.exe) alive on Windows.
    // Close this owned SSH tree so Docker releases the old remote forwarding listener.
    const killer=spawn(join(process.env.SystemRoot||'C:\\Windows','System32','taskkill.exe'),['/PID',String(ssh.pid),'/T','/F'],
      {cwd:homedir(),windowsHide:true,stdio:'ignore'});
    killer.once('error',()=>ssh.kill());
  }else ssh.kill();
}}
process.stdin.resume();process.stdin.once('end',stop);
process.once('SIGTERM',stop);process.once('SIGINT',stop);
const timer=setInterval(()=>{try{process.kill(ownerPid,0)}catch{stop()}},1000);
ssh.once('error',()=>{clearInterval(timer);process.exit(1)});
ssh.once('exit',code=>{clearInterval(timer);process.exit(code??0)});
