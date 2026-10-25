import {randomUUID} from 'node:crypto';
import {existsSync,lstatSync,mkdirSync,readFileSync,renameSync,rmSync,statSync,writeFileSync} from 'node:fs';
import {dirname,join,resolve} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';

export function directory(path){
  mkdirSync(path,{recursive:true,mode:0o700});
  if(lstatSync(path).isSymbolicLink()||!lstatSync(path).isDirectory())throw Error('Cluster state directory must not be a symlink');
  return path;
}
export function readJson(path){
  if(lstatSync(path).isSymbolicLink())throw Error('Cluster state symlink is forbidden');
  return JSON.parse(readFileSync(path,'utf8'));
}
export function writeJson(path,data){
  directory(dirname(path));
  if(existsSync(path)&&lstatSync(path).isSymbolicLink())throw Error('Cluster state symlink is forbidden');
  const temporary=path+'.'+randomUUID()+'.tmp';
  writeFileSync(temporary,JSON.stringify(data,null,2)+'\n',{mode:0o600});renameSync(temporary,path);
}
export function processIdentity(pid){
  if(!Number.isSafeInteger(pid)||pid<1)return null;
  try{
    process.kill(pid,0);
    if(process.platform!=='linux')return {boot:process.platform,start:'unknown'};
    const stat=readFileSync(`/proc/${pid}/stat`,'utf8');
    const fields=stat.slice(stat.lastIndexOf(')')+2).split(' ');
    if(['Z','X'].includes(fields[0]))return null;
    return {boot:readFileSync('/proc/sys/kernel/random/boot_id','utf8').trim(),start:fields[19]};
  }catch(error){if(error.code==='EPERM')throw Error('Cannot verify bootstrap process ownership');return null;}
}
export const alive=owner=>!!owner?.identity&&JSON.stringify(processIdentity(owner.pid))===JSON.stringify(owner.identity);

// Linux boot/start identities distinguish a stale pre-restart PID from a new process.
export async function withProjectLock(folder,operation,{timeout=1_800_000}={}){
  directory(folder);
  const lock=join(folder,'.lock'),recovery=join(folder,'.lock-recovery'),token=randomUUID(),deadline=Date.now()+timeout;
  function remove(path){
    if(dirname(resolve(path))!==resolve(folder)||lstatSync(path).isSymbolicLink())throw Error('Unsafe cluster lock path');
    rmSync(path,{recursive:true,force:true});
  }
  function owner(){try{return readJson(join(lock,'owner.json'));}catch(error){if(error.code!=='ENOENT')throw error;return null;}}
  for(;;){
    try{mkdirSync(lock);writeJson(join(lock,'owner.json'),{pid:process.pid,identity:processIdentity(process.pid),token});break;}
    catch(error){
      if(error.code!=='EEXIST')throw error;
      if(lstatSync(lock).isSymbolicLink())throw Error('Cluster lock symlink is forbidden');
      const previous=owner();
      if(previous?!alive(previous):Date.now()-statSync(lock).mtimeMs>30_000){
        try{
          mkdirSync(recovery);
          try{const current=owner();if(previous?current?.token===previous.token&&!alive(current):!current&&existsSync(lock)&&Date.now()-statSync(lock).mtimeMs>30_000)remove(lock);}
          finally{remove(recovery);}
        }catch(error){if(!['ENOENT','EEXIST'].includes(error.code))throw error;}
      }
      if(Date.now()>=deadline)throw Error('Project cluster bootstrap is still locked; inspect its status');
      await delay(100);
    }
  }
  try{return await operation();}
  finally{if(existsSync(join(lock,'owner.json'))&&owner().token===token)remove(lock);}
}
