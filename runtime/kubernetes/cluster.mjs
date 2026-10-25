import {createHash} from 'node:crypto';
import {chmodSync,existsSync,lstatSync,statfsSync} from 'node:fs';
import {join} from 'node:path';
import {createServer} from 'node:net';
import {setTimeout as delay} from 'node:timers/promises';
import {command} from './command.mjs';
import {directory,readJson,writeJson,withProjectLock,processIdentity} from './state.mjs';
import {clusterProfile} from './profiles.mjs';

export function projectClusterName(id){
  if(typeof id!=='string'||!id.trim()||id.length>4096||/[\0\r\n]/.test(id))throw Error('Stable project identity is required');
  return 'teck-local-'+createHash('sha256').update(id).digest('hex').slice(0,12);
}
const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])])):value;
async function inventory(name,run){
  const ids=(await run('docker',['ps','-aq','--no-trunc'])).trim().split(/\s+/).filter(Boolean);
  if(ids.length>2000||ids.some(id=>!/^\w{12,64}$/.test(id)))throw Error('Cannot verify Docker node inventory');
  if(!ids.length)return [];
  const rows=JSON.parse(await run('docker',['inspect',...ids]));
  if(!Array.isArray(rows)||rows.length!==ids.length||rows.some(n=>typeof n.Id!=='string'||typeof n.Name!=='string'||!n.Config||typeof n.State?.Running!=='boolean')||new Set(rows.map(n=>n.Id)).size!==rows.length)throw Error('Cannot verify Docker node inventory');
  return rows.filter(n=>n.Name.startsWith('/'+name+'-')||n.Config.Labels?.['io.x-k8s.kind.cluster']===name);
}
function nodeRecords(rows,name,config,image){
  const roles=config.nodes.map(n=>n.role).sort();
  if(rows.length!==roles.length||JSON.stringify(rows.map(n=>n.Config.Labels?.['io.x-k8s.kind.role']).sort())!==JSON.stringify(roles))throw Error('Cluster node topology or identity changed');
  const digest=image.slice(image.indexOf('@'));
  if(rows.some(n=>n.Config.Labels?.['io.x-k8s.kind.cluster']!==name||!n.Config.Image?.endsWith(digest)||!/^\/[a-z0-9-]+$/.test(n.Name)||!/^\w{64}$/.test(n.Id)))throw Error('Cluster node image or identity changed');
  return rows.map(n=>({id:n.Id,name:n.Name.slice(1),role:n.Config.Labels['io.x-k8s.kind.role']})).sort((a,b)=>a.id.localeCompare(b.id));
}
export async function prepareDocker({folder,run,config}){
  await run('docker',['info','--format','{{.ServerVersion}}']);
  const disk=statfsSync(folder);if(disk.bavail*disk.bsize<8*1024**3)throw Error('Project cluster needs at least 8 GiB free in its state filesystem');
  const dockerDisk=await run('df',['-B1','--output=avail','/var/lib/docker']);
  const available=Number(dockerDisk.trim().split(/\s+/).at(-1));if(!Number.isFinite(available)||available<12*1024**3)throw Error('Project cluster needs at least 12 GiB free in Docker storage');
  const ports=[config.networking?.apiServerPort,5001,...config.nodes.flatMap(node=>(node.extraPortMappings??[]).map(p=>p.hostPort))];
  for(const port of new Set(ports)){
    if(!Number.isInteger(port)||port<1||port>65535)throw Error('Invalid local cluster port');
    await new Promise((resolve,reject)=>{const server=createServer();server.once('error',()=>reject(Error('Local Kubernetes requires free loopback port '+port)));server.listen({host:'127.0.0.1',port,exclusive:true},()=>server.close(resolve));});
  }
}
export async function prepareDevice({run,root,config}){
  // /dev is recreated at VM boot. Docker can otherwise turn a missing bind
  // source into a directory while auto-starting nodes before the shell hook.
  const path=join(root,'kmsg'),mounts=config.nodes.flatMap(node=>node.extraMounts??[]).filter(m=>m.containerPath==='/dev/kmsg');
  if(mounts.length!==config.nodes.length||mounts.some(m=>m.hostPath!==path||m.readOnly!==true))throw Error('Pinned kind nodes must use the persistent project kmsg device');
  if(!existsSync(path))await run('mknod',['-m','600',path,'c','1','11']);
  const device=lstatSync(path);if(!device.isCharacterDevice()||device.rdev!==267)throw Error('Cannot verify persistent sandbox kmsg character device');
}
export async function ensureProjectCluster({projectId,profile,root,config,nodeImage,revision,runtimeRevision,run=command,prepare=prepareDocker,device=prepareDevice,bootstrap}){
  clusterProfile(profile);
  if(profile!=='workspace')throw Error('The full profile uses an external Linux target; local Docker Sandbox provisioning is unsupported');
  const name=projectClusterName(projectId);
  if(!root||!config||config.kind!=='Cluster'||config.apiVersion!=='kind.x-k8s.io/v1alpha4'||!Array.isArray(config.nodes)||!config.nodes.length||config.networking?.disableDefaultCNI)throw Error('A pinned workspace kind configuration is required');
  if(!/^kindest\/node:v\d+\.\d+\.\d+@sha256:[a-f0-9]{64}$/.test(nodeImage)||typeof revision!=='string'||!revision||typeof bootstrap!=='function')throw Error('Pinned platform revision, node image and bootstrap are required');
  const digest=createHash('sha256').update(JSON.stringify(canonical({profile,config,nodeImage,revision}))).digest('hex');
  directory(root);const folder=directory(join(root,name)),path=join(folder,'state.json'),kubeconfig=join(folder,'kubeconfig');
  return withProjectLock(folder,async()=>{
    let state=existsSync(path)?readJson(path):null;
    if(state&&(state.version!==1||state.projectId!==projectId||state.name!==name||!Array.isArray(state.nodes)))throw Error('Invalid project cluster ownership record');
    if(state&&state.digest!==digest)throw Error('Pinned project cluster configuration changed; an explicit migration is required');
    let rows=await inventory(name,run);
    if(!state&&rows.length)throw Error('An unowned cluster uses this project name; refusing adoption');
    if(state){
      if(!state.nodes.length)throw Error('Initial creation was interrupted before node ownership was recorded; inspect the cluster');
      const current=nodeRecords(rows,name,config,nodeImage);
      if(JSON.stringify(current)!==JSON.stringify(state.nodes))throw Error('Project cluster node identity changed or is missing; retained ownership for inspection');
    }else{
      await prepare({folder,run,config});
      await device({run,root,config});
      const configuration=join(folder,'kind.json');writeJson(configuration,config);
      state={version:1,projectId,name,profile,nodeImage,revision,digest,nodes:[],phase:'creating'};writeJson(path,state);
      await run('kind',['create','cluster','--name',name,'--image',nodeImage,'--config',configuration,'--kubeconfig',kubeconfig,'--wait','180s']);
      rows=await inventory(name,run);state={...state,nodes:nodeRecords(rows,name,config,nodeImage),phase:'created'};writeJson(path,state);
    }
    try{
      await device({run,root,config});
      const stopped=rows.filter(n=>!n.State.Running);if(stopped.length)await run('docker',['start',...stopped.map(n=>n.Id)]);
      const verified=nodeRecords(await inventory(name,run),name,config,nodeImage);
      if(JSON.stringify(verified)!==JSON.stringify(state.nodes))throw Error('Project cluster identity changed during recovery');
      if(existsSync(kubeconfig)&&lstatSync(kubeconfig).isSymbolicLink())throw Error('Dedicated kubeconfig must not be a symlink');
      if(!existsSync(kubeconfig))await run('kind',['export','kubeconfig','--name',name,'--kubeconfig',kubeconfig]);
      if(existsSync(kubeconfig))chmodSync(kubeconfig,0o600);
      // The API can accept connections before its RBAC caches are warm on a
      // cold kind boot. Retry startup errors within a bound; never alter RBAC.
      const deadline=Date.now()+60_000;
      for(;;){
        try{await run('kubectl',['--kubeconfig',kubeconfig,'wait','nodes','--all','--for=condition=Ready','--timeout=180s']);break;}
        catch(error){if(Date.now()>=deadline)throw error;await delay(1500);}
      }
      state={...state,phase:'starting'};writeJson(path,state);
      await bootstrap({name,projectId,profile,kubeconfig,folder,nodes:state.nodes,run});
      state={...state,phase:'ready',readyBoot:processIdentity(process.pid)?.boot,...(runtimeRevision?{runtimeRevision}:{})};writeJson(path,state);return {...state,kubeconfig};
    }catch(error){writeJson(path,{...state,phase:'failed'});throw error;}
  });
}
