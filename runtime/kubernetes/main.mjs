import {existsSync} from 'node:fs';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {setTimeout as delay} from 'node:timers/promises';
import {paths} from './layout.mjs';
import {loadBundle,bootstrapRevision} from './bundle.mjs';
import {ensureProjectCluster,projectClusterName} from './cluster.mjs';
import {command} from './command.mjs';
import {bootstrapWorkspace,takeoverPlatform} from './platform.mjs';
import {readJson,processIdentity} from './state.mjs';
import {launchBootstrap,startProject} from './startup.mjs';
import {seedPlatformSource} from './local-git.mjs';
import {deployWorktree} from './deploy.mjs';
import {promoteWorktree} from './promotion.mjs';
import {cleanupWorktree} from './cleanup.mjs';
import {currentWorktree} from './render.mjs';

const entry=fileURLToPath(import.meta.url),assetRoot=dirname(entry);
export async function ensureConfiguredProject(config,{run=command}={}){
  const bundle=loadBundle(join(assetRoot,'gitops')),profile=bundle.json(paths.profile);
  if(config.profile!=='workspace'||!profile.enabled)throw Error('Only the validated workspace profile can be provisioned in Docker Sandboxes');
  const deadline=Date.now()+60_000;
  for(;;){try{await run('docker',['info','--format','{{.ServerVersion}}']);break;}catch(error){if(Date.now()>=deadline)throw error;await delay(2000);}}
  return ensureProjectCluster({projectId:config.projectId,profile:'workspace',root:config.root,
    config:bundle.yaml(paths.kind),nodeImage:bundle.json(paths.lock).kubernetes.nodeImage,revision:bootstrapRevision(bundle),runtimeRevision:config.assetDigest,run,
    bootstrap:async options=>{await bootstrapWorkspace({...options,bundle});await seedPlatformSource({...options,bundle});await takeoverPlatform({...options,bundle});}});
}
export async function main(args=process.argv.slice(2)){
  if(process.platform!=='linux'||process.getuid?.()!==0)throw Error('Use the installed teck-kube command inside the project sandbox');
  const index=args.indexOf('--config'),configPath=index>=0?resolve(args[index+1]):'/etc/teck-orca/kubernetes.json';
  const config=readJson(configPath);projectClusterName(config.projectId);
  if(config.version!==1||config.profile!=='workspace'||typeof config.root!=='string'||!config.root.startsWith('/'))throw Error('Invalid installed project cluster configuration');
  const name=projectClusterName(config.projectId),folder=join(config.root,name),path=join(folder,'state.json');
  const action=args[0];
  if(action==='ensure'){
    const state=await ensureConfiguredProject(config);
    return {phase:state.phase,name:state.name,profile:state.profile,mesh:'none',securityValidation:false};
  }
  if(action==='start')return startProject({root:config.root,projectId:config.projectId,
    ready:async()=>{
      if(!existsSync(path))return false;const state=readJson(path),bundle=loadBundle(join(assetRoot,'gitops'));
      if(state.projectId!==config.projectId)throw Error('Cluster belongs to another project');
      if(state.phase!=='ready'||state.readyBoot!==processIdentity(process.pid)?.boot||state.revision!==bootstrapRevision(bundle)||state.runtimeRevision!==config.assetDigest||!state.nodes?.length)return false;
      try{const rows=JSON.parse(await command('docker',['inspect',...state.nodes.map(n=>n.id)]));return rows.length===state.nodes.length&&rows.every(r=>r.State?.Running&&state.nodes.some(n=>n.id===r.Id)&&r.Config?.Labels?.['io.x-k8s.kind.cluster']===name);}catch{return false;}
    },launch:()=>launchBootstrap({root:config.root,entry,configPath})});
  if(action==='status'){
    const state=existsSync(path)?readJson(path):null,bundle=loadBundle(join(assetRoot,'gitops'));
    return {name,profile:'workspace',phase:state?.phase??'not-started',mesh:'none',securityValidation:false,
      configuredVersions:bundle.json(paths.lock).charts.map(({name,version})=>({name,version})),
      components:existsSync(join(folder,'components.json'))?readJson(join(folder,'components.json')):{},
      nodes:state?.nodes??[],log:join(config.root,'bootstrap.log')};
  }
  if(action==='deploy'||action==='promote'){
    const context=await currentWorktree(config,process.env,command),cluster=await ensureConfiguredProject(config),bundle=loadBundle(join(assetRoot,'gitops'));
    return (action==='deploy'?deployWorktree:promoteWorktree)({context,cluster,bundle,run:command});
  }
  if(action==='cleanup'){
    const worktreeIndex=args.indexOf('--worktree');
    const context=worktreeIndex>=0?{projectId:config.projectId,worktreeId:args[worktreeIndex+1]}:await currentWorktree(config,process.env,command);
    if(!existsSync(path)||readJson(path).projectId!==config.projectId)throw Error('The owned project cluster is unavailable; nothing was removed');
    return cleanupWorktree({context,cluster:{kubeconfig:join(folder,'kubeconfig')},run:command});
  }
  if(action==='kubectl'){
    const state=await ensureConfiguredProject(config);
    const remaining=args.slice(1);if(index>=0)remaining.splice(index-1,2);
    return {output:await command('kubectl',['--kubeconfig',state.kubeconfig,...remaining])};
  }
  throw Error('Use teck-kube start, ensure, status, deploy, promote, cleanup or kubectl');
}
if(process.argv[1]&&resolve(process.argv[1])===entry){
  main().then(result=>process.stdout.write(JSON.stringify(result)+'\n')).catch(error=>{process.stderr.write('Teck local Kubernetes: '+error.message+'\n');process.exitCode=1;});
}
