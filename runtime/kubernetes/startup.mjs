import {spawn} from 'node:child_process';
import {closeSync,existsSync,openSync} from 'node:fs';
import {join} from 'node:path';
import {alive,directory,processIdentity,readJson,withProjectLock,writeJson} from './state.mjs';

export async function launchBootstrap({root,entry,configPath}){
  const log=openSync(join(directory(root),'bootstrap.log'),'a',0o600);
  try{
    const child=spawn(process.execPath,[entry,'ensure','--config',configPath],{detached:true,stdio:['ignore',log,log],env:process.env});
    await new Promise((resolve,reject)=>{child.once('spawn',resolve);child.once('error',reject);});
    const identity=processIdentity(child.pid);if(!identity)throw Error('Cannot verify guest bootstrap process');
    child.unref();return {pid:child.pid,identity};
  }finally{closeSync(log);}
}
export async function startProject({root,projectId,ready,launch}){
  directory(root);
  return withProjectLock(join(root,'launcher'),async()=>{
    const path=join(root,'launcher.json'),previous=existsSync(path)?readJson(path):null;
    if(previous&&previous.projectId!==projectId)throw Error('Bootstrap belongs to another project');
    if(await ready())return {phase:'ready'};
    if(alive(previous))return {phase:'starting'};
    const process=await launch();if(!alive(process))throw Error('Cannot verify launched bootstrap');
    writeJson(path,{version:1,projectId,...process});return {phase:'starting'};
  });
}
