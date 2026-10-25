import {existsSync,readFileSync,writeFileSync} from 'node:fs';
import {dirname,join} from 'node:path';import {readJson,withProjectLock,writeJson} from './state.mjs';
import {targetIdentity} from './worktree.mjs';import {assertOwner,kubernetes,object,waitFor} from './deploy.mjs';
export async function cleanupResources({context,k,targets,onVerified=()=>{}}){
  const id=targetIdentity(context),verified=[];
  for(const t of targets){
    if(t.type!=='namespace'||t.name!==id.namespace||typeof t.uid!=='string'||!t.uid)throw Error('Unsafe cleanup target');
    const resource=await object(k,'namespace',t.name);if(resource){assertOwner(resource,context,t.uid);verified.push(t);}
  }
  await onVerified();for(const t of verified)await k(['delete','--raw','/api/v1/namespaces/'+t.name,'-f','-'],{input:JSON.stringify({apiVersion:'v1',kind:'DeleteOptions',preconditions:{uid:t.uid},propagationPolicy:'Background'})});
  return verified;
}
export async function cleanupWorktree({context,cluster,run}){
  const id=targetIdentity(context),project=dirname(cluster.kubeconfig),folder=join(project,'worktrees',id.hash),path=join(folder,'state.json'),k=kubernetes(run,cluster.kubeconfig);
  if(!existsSync(path))throw Error('No owned worktree environment is recorded');
  return withProjectLock(folder,async()=>{
    const state=readJson(path);
    if(state.projectId!==context.projectId||state.worktreeId!==context.worktreeId||state.namespace!==id.namespace)throw Error('Worktree cleanup ownership changed');
    if(state.applicationUid||existsSync(join(folder,'promotion/state.json')))throw Error('Legacy delivery environment requires explicit migration before cleanup');
    await cleanupResources({context,k,targets:[{type:'namespace',name:id.namespace,uid:state.namespaceUid}],onVerified:()=>writeJson(path,{...state,phase:'removing'})});
    await waitFor('owned namespace removal',async()=>!await object(k,'namespace',id.namespace),120_000);
    writeJson(path,{...state,phase:'removed'});
    await withProjectLock(join(project,'hosts'),async()=>{const text=readFileSync('/etc/hosts','utf8');writeFileSync('/etc/hosts',text.split('\n').filter(l=>l!=='127.0.0.1 '+id.hostname+' # teck-local '+id.hostname).join('\n'));});
    return {phase:'removed',worktreeId:context.worktreeId,clusterRetained:true};
  });
}
