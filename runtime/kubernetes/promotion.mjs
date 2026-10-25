import {paths} from './layout.mjs';
import {existsSync,writeFileSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {randomUUID} from 'node:crypto';
import {directory,readJson,withProjectLock,writeJson} from './state.mjs';
import {contentHash,ownerLabels,targetIdentity,validateRelease} from './worktree.mjs';
import {appRepository,platformRepository,localGit,syncLocalGitOps} from './local-git.mjs';
import {application,assertOwner,ensureEnvironment,ensureHostname,kubernetes,localCredentials,object,probeHttps,waitFor} from './deploy.mjs';

export function deliveryResources(context,bundle){
  const id=targetIdentity(context),promotion=targetIdentity(context,'promotion'),labels=ownerLabels(context);
  const namespace='teck-delivery-'+labels['teck.orca.io/project'],name='wt-'+id.hash,warehouse='release-'+id.hash;
  const task=bundle.yaml(paths.promotion),template=task.spec;
  const allowed=['git-clone','yaml-update','git-commit','git-push','argocd-update'];
  if(!Array.isArray(template.steps)||template.steps.some(s=>!allowed.includes(s.uses))||JSON.stringify(template).includes('github.com'))throw Error('Promotion template must remain local-only');
  if(task.kind!=='ClusterPromotionTask'||task.metadata.name!=='local-worktree-release')throw Error('Unexpected local promotion task');
  if(/\$\{\{\s*outputs[.\[]/.test(JSON.stringify(template)))throw Error('Reusable promotion steps must use task-scoped outputs');
  const call={steps:[{task:{kind:task.kind,name:task.metadata.name},vars:[{name:'appRepo',value:appRepository},{name:'gitopsRepo',value:platformRepository},{name:'worktree',value:id.hash},{name:'application',value:promotion.application}]}]};
  return [
    {apiVersion:'kargo.akuity.io/v1alpha1',kind:'Warehouse',metadata:{name:warehouse,namespace,labels},spec:{interval:'30s',freightCreationPolicy:'Automatic',subscriptions:[{git:{repoURL:appRepository,branch:'worktrees/'+id.hash,discoveryLimit:10}}]}},
    {apiVersion:'kargo.akuity.io/v1alpha1',kind:'Stage',metadata:{name,namespace,labels},spec:{requestedFreight:[{origin:{kind:'Warehouse',name:warehouse},sources:{direct:true}}],promotionTemplate:{spec:call}}},
  ];
}
async function ensureObject({k,context,state,field,resource,path}){
  const current=await object(k,resource.kind,resource.metadata.name,resource.metadata.namespace);
  if(current){if(!state[field])throw Error('Unowned local delivery resource: '+resource.kind);assertOwner(current,context,state[field]);await k(['apply','-f','-'],{input:JSON.stringify(resource)});}
  else{
    if(state[field])throw Error('Owned delivery resource is missing; retained its identity');
    const created=JSON.parse(await k(['create','-f','-','-o','json'],{input:JSON.stringify(resource)}));state={...state,[field]:created.metadata.uid};writeJson(path,state);
  }
  return state;
}
async function ensureProject({context,folder,k,namespace}){
  const path=join(folder,'delivery-project.json'),record=existsSync(path)?readJson(path):null;
  const existing=await object(k,'project.kargo.akuity.io',namespace);
  if(existing){if(!record||record.projectId!==context.projectId||existing.metadata.uid!==record.uid)throw Error('Unowned or replaced local delivery project');}
  else{
    if(record)throw Error('Owned local delivery project is missing');
    const project={apiVersion:'kargo.akuity.io/v1alpha1',kind:'Project',metadata:{name:namespace,labels:{'teck.orca.io/project':ownerLabels(context)['teck.orca.io/project']}}};
    const created=JSON.parse(await k(['create','-f','-','-o','json'],{input:JSON.stringify(project)}));writeJson(path,{projectId:context.projectId,uid:created.metadata.uid});
  }
  await waitFor('local delivery project namespace',async()=>!!await object(k,'namespace',namespace),60_000);
}
export async function promoteWorktree({context,cluster,bundle,run}){
  const id=targetIdentity(context),target=targetIdentity(context,'promotion'),projectFolder=dirname(cluster.kubeconfig),folder=join(projectFolder,'worktrees',id.hash);
  if(!existsSync(join(folder,'state.json')))throw Error('Deploy a local worktree snapshot before promoting it');
  const k=kubernetes(run,cluster.kubeconfig);
  return withProjectLock(folder,async()=>{
    const failurePath=join(folder,'promotion','state.json');
    try{return await withProjectLock(join(projectFolder,'gitops-writer'),async()=>{
    const iteration=readJson(join(folder,'state.json')),release=iteration.release;
    if(!release||!/^[a-f0-9]{40}$/.test(release.commit))throw Error('No immutable local release is recorded');
    const source=join(folder,'source');
    const record=JSON.parse(await localGit(run,source,['show',release.commit+':release.json']));
    const committed=JSON.parse(await localGit(run,source,['show',release.commit+':iteration/kustomization.yaml']));
    const manifests=[];for(const name of committed.resources)manifests.push(JSON.parse(await localGit(run,source,['show',release.commit+':iteration/'+name])));
    validateRelease(record,manifests);
    const promoted=[];const promotionList=JSON.parse(await localGit(run,source,['show',release.commit+':promotion/kustomization.yaml']));
    for(const name of promotionList.resources)promoted.push(JSON.parse(await localGit(run,source,['show',release.commit+':promotion/'+name])));
    if(record.promotionManifestSha256!==contentHash(promoted)||release.sourceContentSha256!==record.sourceContentSha256)throw Error('Promotion manifests do not match the recorded source release');
    const promotionFolder=directory(join(folder,'promotion')),path=join(promotionFolder,'state.json');
    let state=await ensureEnvironment({context,folder:promotionFolder,k,mode:'promotion'});
    if(manifests.some(r=>r.kind==='Deployment'&&r.metadata.name==='keycloak'))state=await localCredentials({context,state,k,folder:promotionFolder});
    const resources=deliveryResources(context,bundle),warehouse=resources[0],stage=resources[1],namespace=stage.metadata.namespace;
    await ensureProject({context,folder:projectFolder,k,namespace});
    if(record.checks?.length){
      const names=[];
      for(const check of record.checks){
        if(!/^[a-z0-9-]{1,63}$/.test(check))throw Error('Invalid recorded application check');
        const original=promoted.find(r=>r.kind==='AnalysisTemplate'&&r.metadata.name===check);if(!original)throw Error('Recorded application check has no matching template');
        const name=id.hash+'-'+check,copy={...structuredClone(original),metadata:{name,namespace,labels:ownerLabels(context),annotations:{'teck.orca.io/source-release':release.commit}}};
        state=await ensureObject({k,context,state,field:'verification:'+name,resource:copy,path});names.push({name});
      }
      stage.spec.verification={analysisTemplates:names,args:[{name:'namespace',value:target.namespace}]};
    }
    const gitops=await syncLocalGitOps(projectFolder,run),appPath=join(gitops,'apps/local/teck-cloud/teck-cloud-core/worktrees',id.hash,'promotion');
    if(!existsSync(join(appPath,'kustomization.yaml'))){
      directory(join(appPath,'empty'));writeJson(join(appPath,'empty/kustomization.yaml'),{apiVersion:'kustomize.config.k8s.io/v1beta1',kind:'Kustomization',resources:[]});
      // Kargo's YAML updater preserves flow style; URLs containing '?' must use a block sequence.
      writeFileSync(join(appPath,'kustomization.yaml'),'apiVersion: kustomize.config.k8s.io/v1beta1\nkind: Kustomization\nresources:\n  - empty\n');
      await localGit(run,gitops,['add','apps/local/teck-cloud/teck-cloud-core/worktrees/'+id.hash+'/promotion']);await localGit(run,gitops,['commit','-m','chore(local): prepare promotion '+id.hash]);
      await localGit(run,gitops,['push','origin','HEAD:refs/heads/main']);
    }
    const app=application(context,'main',promoted,{mode:'promotion'});
    app.spec.source={repoURL:platformRepository,targetRevision:'main',path:'apps/local/teck-cloud/teck-cloud-core/worktrees/'+id.hash+'/promotion'};
    app.metadata.annotations={'kargo.akuity.io/authorized-stage':namespace+':'+stage.metadata.name};
    state=await ensureObject({k,context,state,field:'applicationUid',resource:app,path});
    state=await ensureObject({k,context,state,field:'warehouseUid',resource:warehouse,path});
    state=await ensureObject({k,context,state,field:'stageUid',resource:stage,path});
    await k(['-n',namespace,'annotate','warehouse',warehouse.metadata.name,'kargo.akuity.io/refresh='+randomUUID(),'--overwrite']);
    const freight=await waitFor('matching local release discovery',async()=>{
      const rows=JSON.parse(await k(['-n',namespace,'get','freight','-o','json'])).items;
      return rows.find(r=>r.origin?.name===warehouse.metadata.name&&r.commits?.some(c=>c.repoURL===appRepository&&c.id===release.commit));
    },120_000);
    const promotion={apiVersion:'kargo.akuity.io/v1alpha1',kind:'Promotion',metadata:{name:'promote-'+id.hash+'-'+randomUUID().slice(0,8),namespace,labels:ownerLabels(context)},spec:{stage:stage.metadata.name,freight:freight.metadata.name}};
    // Kargo's admission webhook assigns the canonical Promotion name.
    const created=JSON.parse(await k(['create','-f','-','-o','json'],{input:JSON.stringify(promotion)}));
    promotion.metadata.name=created.metadata.name;
    state={...state,phase:'promoting',releaseCommit:release.commit,promotionName:promotion.metadata.name};writeJson(path,state);
    await waitFor('local Kargo promotion',async()=>{
      const p=await object(k,'promotion',promotion.metadata.name,namespace);
      if(!p)throw Error('The recorded local Promotion is missing');
      if(['Failed','Errored','Aborted'].includes(p.status?.phase))throw Error('Local promotion failed: '+p.status.message);
      return p.status?.phase==='Succeeded';
    },480_000);
    await waitFor('local Kargo application verification',async()=>{
      const current=await object(k,'stage',stage.metadata.name,namespace);
      const selection=current.status?.freightHistory?.find(h=>Object.values(h.items??{}).some(item=>item.name===freight.metadata.name));
      const verification=selection?.verificationHistory?.[0];
      if(['Failed','Error','Errored','Inconclusive','Aborted'].includes(verification?.phase))throw Error('Local promotion verification failed: '+verification.message);
      const result=await object(k,'freight',freight.metadata.name,namespace);return !!result.status?.verifiedIn?.[stage.metadata.name];
    },300_000);
    await ensureHostname(target.hostname,projectFolder);
    await waitFor('promoted application HTTPS',async()=>{try{return await probeHttps(target.hostname,record.healthPath);}catch{return false;}});
    const current=await object(k,'application',target.application,'argocd');
    if(current.status?.health?.status!=='Healthy')throw Error('Promoted application is not healthy');
    state={...state,phase:'ready'};writeJson(path,state);
    return {phase:'ready',mode:'promotion',namespace:target.namespace,url:'https://'+target.hostname,releaseCommit:release.commit,promotion:promotion.metadata.name,mesh:'none',securityValidation:false};
    });}catch(error){if(existsSync(failurePath))writeJson(failurePath,{...readJson(failurePath),phase:'failed'});throw error;}
  });
}
