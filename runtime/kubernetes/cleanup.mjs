import {existsSync,readFileSync,writeFileSync} from 'node:fs';
import {dirname,join} from 'node:path';
import {readJson,withProjectLock,writeJson} from './state.mjs';
import {ownerLabels,targetIdentity} from './worktree.mjs';
import {assertOwner,kubernetes,object,waitFor} from './deploy.mjs';

function pathFor(target){
  const types={application:['argoproj.io','v1alpha1','applications'],appproject:['argoproj.io','v1alpha1','appprojects'],stage:['kargo.akuity.io','v1alpha1','stages'],warehouse:['kargo.akuity.io','v1alpha1','warehouses'],promotion:['kargo.akuity.io','v1alpha1','promotions'],analysistemplate:['argoproj.io','v1alpha1','analysistemplates']};
  if(target.type==='namespace')return '/api/v1/namespaces/'+target.name;
  const type=types[target.type];if(!type)throw Error('Unsupported cleanup resource');
  return `/apis/${type[0]}/${type[1]}/namespaces/${target.namespace}/${type[2]}/${target.name}`;
}
export async function cleanupResources({context,k,targets,onVerified=()=>{}}){
  const id=targetIdentity(context),promotion=targetIdentity(context,'promotion'),shared='teck-delivery-'+ownerLabels(context)['teck.orca.io/project'];
  const namespaces=[id.namespace,promotion.namespace,'argocd',shared],verified=[];
  for(const target of targets){
    if(!/^[a-z0-9.-]+$/.test(target.name)||typeof target.uid!=='string'||!target.uid||
      (target.type==='namespace'?![id.namespace,promotion.namespace].includes(target.name):!namespaces.includes(target.namespace))||
      (target.url&&target.url!==pathFor(target)))throw Error('Unsafe cleanup target');
    const resource=await object(k,target.type,target.name,target.namespace);
    if(resource){assertOwner(resource,context,target.uid);verified.push(target);}
  }
  await onVerified();
  for(const target of verified)await k(['delete','--raw',pathFor(target),'-f','-'],{input:JSON.stringify({apiVersion:'v1',kind:'DeleteOptions',preconditions:{uid:target.uid},propagationPolicy:'Background'})});
  return verified;
}
export async function cleanupWorktree({context,cluster,run}){
  const id=targetIdentity(context),projectFolder=dirname(cluster.kubeconfig),folder=join(projectFolder,'worktrees',id.hash),k=kubernetes(run,cluster.kubeconfig);
  if(!existsSync(join(folder,'state.json')))throw Error('No owned worktree environment is recorded');
  return withProjectLock(folder,async()=>{
    const records=[],targets=[],delivery='teck-delivery-'+ownerLabels(context)['teck.orca.io/project'];
    for(const mode of ['promotion','iteration']){
      const path=join(folder,mode==='iteration'?'':'promotion','state.json');if(!existsSync(path))continue;
      const state=readJson(path),identity=targetIdentity(context,mode);
      if(state.projectId!==context.projectId||state.worktreeId!==context.worktreeId||state.namespace!==identity.namespace)throw Error('Worktree cleanup ownership changed');
      records.push({path,state});
      if(state.stageUid)targets.push({type:'stage',name:'wt-'+id.hash,namespace:delivery,uid:state.stageUid});
      if(state.warehouseUid)targets.push({type:'warehouse',name:'release-'+id.hash,namespace:delivery,uid:state.warehouseUid});
      for(const [field,uid] of Object.entries(state).filter(([field])=>field.startsWith('verification:')))targets.push({type:'analysistemplate',name:field.slice(13),namespace:delivery,uid});
      if(state.applicationUid)targets.push({type:'application',name:identity.application,namespace:'argocd',uid:state.applicationUid});
      if(state.projectUid)targets.push({type:'appproject',name:identity.application,namespace:'argocd',uid:state.projectUid});
      targets.push({type:'namespace',name:identity.namespace,uid:state.namespaceUid});
    }
    const selector=Object.entries(ownerLabels(context)).map(([key,value])=>key+'='+value).join(',');
    const shared=await object(k,'namespace',delivery);
    if(shared){
      const promotions=JSON.parse(await k(['-n',delivery,'get','promotions','-l',selector,'-o','json'])).items;
      for(const p of promotions)targets.unshift({type:'promotion',name:p.metadata.name,namespace:delivery,uid:p.metadata.uid});
    }
    await cleanupResources({context,k,targets,onVerified:()=>{for(const {path,state} of records)writeJson(path,{...state,phase:'removing'});}});
    for(const {path,state} of records){
      await waitFor('owned namespace removal',async()=>!await object(k,'namespace',state.namespace),120_000);
      writeJson(path,{...state,phase:'removed'});
    }
    await withProjectLock(join(projectFolder,'hosts'),async()=>{
      const names=[id.hostname,targetIdentity(context,'promotion').hostname],text=readFileSync('/etc/hosts','utf8');
      writeFileSync('/etc/hosts',text.split('\n').filter(line=>!names.some(name=>line===`127.0.0.1 ${name} # teck-local ${name}`)).join('\n'));
    });
    return {phase:'removed',worktreeId:context.worktreeId,clusterRetained:true};
  });
}
