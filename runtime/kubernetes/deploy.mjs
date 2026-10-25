import {paths} from './layout.mjs';
import {randomBytes} from 'node:crypto';
import {existsSync,lstatSync,mkdirSync,readFileSync,rmSync,writeFileSync} from 'node:fs';
import {dirname,join,resolve,relative} from 'node:path';
import {request} from 'node:https';
import {setTimeout as delay} from 'node:timers/promises';
import {directory,readJson,withProjectLock,writeJson} from './state.mjs';
import {worktreeIdentity} from './resources.mjs';
import {contentHash,manifestImages,ownerLabels,releaseRecord,syncOperation,targetIdentity,validateManifests,worktreeResources} from './worktree.mjs';
import {insideCheckout,parseResources,sourceIdentity} from './render.mjs';
import {appRepository,localGit} from './local-git.mjs';

export async function waitFor(label,predicate,timeout=240_000){
  const deadline=Date.now()+timeout;
  do{const result=await predicate();if(result)return result;await delay(1500);}while(Date.now()<deadline);
  throw Error('Timed out waiting for '+label);
}
export const kubernetes=(run,kubeconfig)=>(args,options)=>run('kubectl',['--kubeconfig',kubeconfig,...args],options);
export async function object(k,type,name,namespace){
  const text=await k([...(namespace?['-n',namespace]:[]),'get',type,name,'--ignore-not-found','-o','json']);return text.trim()?JSON.parse(text):null;
}
export function assertOwner(resource,context,uid){
  if(!resource)return;
  const labels=ownerLabels(context);
  if((uid&&resource.metadata.uid!==uid)||Object.entries(labels).some(([key,value])=>resource.metadata.labels?.[key]!==value))throw Error('Resource ownership or identity changed: '+resource.kind+'/'+resource.metadata.name);
}
export async function ensureEnvironment({context,folder,k,mode='iteration'}){
  const id=targetIdentity(context,mode),path=join(folder,'state.json');
  let state=existsSync(path)?readJson(path):null;
  if(state&&(state.projectId!==context.projectId||state.worktreeId!==context.worktreeId||state.namespace!==id.namespace))throw Error('Invalid worktree environment ownership record');
  const existing=await object(k,'namespace',id.namespace);
  if(existing){if(!state?.namespaceUid)throw Error('An unowned worktree namespace already exists');assertOwner(existing,context,state.namespaceUid);}
  else{
    if(state&&state.phase!=='removed')throw Error('Owned worktree namespace is missing; inspect its data before recreating it');
    const ns=worktreeResources(context,{mode}).find(r=>r.kind==='Namespace');
    const created=JSON.parse(await k(['create','-f','-','-o','json'],{input:JSON.stringify(ns)}));
    state={version:1,projectId:context.projectId,worktreeId:context.worktreeId,namespace:id.namespace,namespaceUid:created.metadata.uid,phase:'created'};writeJson(path,state);
  }
  const resources=worktreeResources(context,{mode}).filter(r=>r.kind!=='Namespace');
  for(const r of resources){const existing=await object(k,r.kind,r.metadata.name,r.metadata.namespace);if(existing)assertOwner(existing,context);}
  await k(['apply','-f','-'],{input:JSON.stringify({apiVersion:'v1',kind:'List',items:resources})});
  const project=await object(k,'appproject',id.application,'argocd');
  state={...state,projectUid:project.metadata.uid};writeJson(path,state);return state;
}
export async function localCredentials({context,state,k,folder}){
  const name='gateway-public-auth',existing=await object(k,'secret',name,state.namespace);
  if(existing){if(!state.secretUid)throw Error('An unowned local application secret already exists');assertOwner(existing,context,state.secretUid);return state;}
  if(state.secretUid)throw Error('The owned application credential was removed; restore it before redeploying its persistent identity service');
  const secret={apiVersion:'v1',kind:'Secret',metadata:{name,namespace:state.namespace,labels:ownerLabels(context)},type:'Opaque',stringData:{'client-secret':randomBytes(32).toString('base64url')}};
  const created=JSON.parse(await k(['create','-f','-','-o','json'],{input:JSON.stringify(secret)}));
  state={...state,secretUid:created.metadata.uid};writeJson(join(folder,'state.json'),state);return state;
}
async function buildImages({context,config,source,run}){
  if(config.schemaVersion!==1||!Array.isArray(config.images)||!config.images.length)throw Error('A local image build declaration is required');
  const id=worktreeIdentity(context.projectId,context.worktreeId),images=[];
  for(const build of config.images){
    if(!/^[a-z0-9][a-z0-9-]{0,62}$/.test(build.name)||!/^ghcr\.io\/[a-z0-9/._-]+$/.test(build.image))throw Error('Invalid application image declaration');
    const folder=insideCheckout(context.root,build.context),dockerfile=insideCheckout(context.root,build.dockerfile);
    const tag=`localhost:5001/${ownerLabels(context)['teck.orca.io/project']}/${id.hash}/${build.name}:${source.sourceContentSha256.slice(0,20)}`;
    const args=Object.entries({...build.args,VERSION:'0.0.0-local.'+source.sourceContentSha256.slice(0,12),SOURCE_SHA:source.sourceRevision});
    if(args.some(([key,value])=>! /^[A-Z][A-Z0-9_]*$/.test(key)||typeof value!=='string'||/[\0\r\n]/.test(value)))throw Error('Invalid application build argument');
    await run('docker',['build','--file',dockerfile,'--tag',tag,'--label','io.teck.local.source='+source.sourceContentSha256,'--label','org.opencontainers.image.revision='+source.sourceRevision,...args.flatMap(([key,value])=>['--build-arg',key+'='+value]),folder],{timeout:900_000});
    if((await sourceIdentity(context.root,run)).sourceContentSha256!==source.sourceContentSha256)throw Error('Worktree changed during the image build; redeploy the current source');
    const built=JSON.parse(await run('docker',['image','inspect',tag]))[0];
    if(built.Config.Labels?.['io.teck.local.source']!==source.sourceContentSha256)throw Error('Built image does not match the source content');
    await run('docker',['push',tag]);
    const pushed=JSON.parse(await run('docker',['image','inspect',tag]))[0];
    const image=pushed.RepoDigests.find(value=>value.startsWith(tag.slice(0,tag.lastIndexOf(':'))+'@sha256:'));
    if(!image)throw Error('The local registry did not return an immutable image digest');
    images.push({canonical:build.image,image});
  }
  return images;
}
async function render({context,bundle,config,images,folder,k}){
  const id=worktreeIdentity(context.projectId,context.worktreeId),overlay=directory(join(folder,'render'));
  const dependencies=config.dependencies??[],available=bundle.json(paths.profile).dependencies??{};
  if(!Array.isArray(dependencies)||dependencies.some(name=>!/^[a-z0-9-]+$/.test(name)||!available[name]||!Object.hasOwn(bundle.files,`${available[name]}/kustomization.yaml`)))throw Error('Unknown local dependency');
  const spec={apiVersion:'kustomize.config.k8s.io/v1beta1',kind:'Kustomization',namespace:id.namespace,
    resources:[insideCheckout(context.root,'deployment/local'),...dependencies.map(name=>join(bundle.root,available[name]))].map(path=>relative(overlay,path)),
    images:images.map(({canonical,image})=>({name:canonical,newName:image.split('@')[0],digest:image.split('@')[1]}))};
  writeJson(join(overlay,'kustomization.yaml'),spec);
  const yaml=await k(['kustomize','--load-restrictor=LoadRestrictionsNone',overlay]);
  const json=await k(['create','--dry-run=client','--validate=false','-f','-','-o','json'],{input:yaml});
  const resources=parseResources(json).map(resource=>{
    delete resource.status;for(const key of ['creationTimestamp','resourceVersion','generation','uid','managedFields'])delete resource.metadata[key];
    resource.metadata.labels={...resource.metadata.labels,...ownerLabels(context)};
    if(resource.spec?.template?.metadata)resource.spec.template.metadata.annotations={...resource.spec.template.metadata.annotations,'teck.orca.io/hostname':id.hostname};
    if(resource.kind==='HTTPRoute'){resource.spec.hostnames=[id.hostname];resource.spec.parentRefs=[{name:'edge',namespace:'teck-local-edge'}];}
    return resource;
  });
  const scopes={};
  for(const version of new Set(resources.map(r=>r.apiVersion))){
    const discovery=JSON.parse(await k(['get','--raw',version==='v1'?'/api/v1':'/apis/'+version]));
    for(const r of discovery.resources.filter(r=>!r.name.includes('/')))scopes[version+'/'+r.kind]=r.namespaced;
  }
  validateManifests(resources,id.namespace,scopes);return resources;
}
export async function ensureHostname(hostname,folder){
  if(!/^(?:wt-|promote-)[a-f0-9]{12}\.teck\.test$/.test(hostname))throw Error('Invalid worktree hostname');
  return withProjectLock(join(folder,'hosts'),async()=>{
    const path='/etc/hosts',text=readFileSync(path,'utf8'),marker='# teck-local '+hostname;
    const existing=text.split('\n').filter(line=>line.split('#')[0].trim().split(/\s+/).slice(1).includes(hostname));
    if(existing.length){if(existing.length!==1||existing[0]!==`127.0.0.1 ${hostname} ${marker}`)throw Error('An unowned hosts entry uses this worktree hostname');return;}
    writeFileSync(path,text.replace(/\n?$/,'\n')+`127.0.0.1 ${hostname} ${marker}\n`);
  });
}
export async function publishRelease({context,folder,source,manifests,run,checks=[],healthPath='/health'}){
  const id=worktreeIdentity(context.projectId,context.worktreeId),repo=directory(join(folder,'source'));
  if(!existsSync(join(repo,'.git')))await localGit(run,repo,['init','--initial-branch=worktrees/'+id.hash]);
  await localGit(run,repo,['config','remote.origin.url','http://127.0.0.1:19418/apps.git']);
  const promotion=structuredClone(manifests).map(r=>{
    r.metadata.namespace=id.namespace+'-promotion';
    if(r.spec?.template?.metadata)r.spec.template.metadata.annotations={...r.spec.template.metadata.annotations,'teck.orca.io/hostname':'promote-'+id.hash+'.teck.test'};
    const routing=r.spec?.strategy?.canary?.trafficRouting?.plugins?.['argoproj-labs/gatewayAPI'];if(routing?.namespace)routing.namespace=id.namespace+'-promotion';
    if(r.kind==='HTTPRoute')r.spec.hostnames=['promote-'+id.hash+'.teck.test'];return r;
  });
  for(const [mode,resources] of [['iteration',manifests],['promotion',promotion]]){
    const path=join(repo,mode);
    if(existsSync(path)){if(dirname(resolve(path))!==resolve(repo)||lstatSync(path).isSymbolicLink())throw Error('Unsafe local snapshot path');rmSync(path,{recursive:true});}
    directory(path);
    for(let i=0;i<resources.length;i++)writeJson(join(path,i+'.json'),resources[i]);
    writeJson(join(path,'kustomization.yaml'),{apiVersion:'kustomize.config.k8s.io/v1beta1',kind:'Kustomization',resources:resources.map((_r,i)=>i+'.json')});
  }
  const images=manifestImages(manifests).filter(i=>i.startsWith('localhost:5001/'));
  const record={...releaseRecord({...source,manifests,images}),checks,healthPath,promotionManifestSha256:contentHash(promotion)};
  writeJson(join(repo,'release.json'),record);
  await localGit(run,repo,['add','.']);
  if((await localGit(run,repo,['status','--porcelain'])).trim())await localGit(run,repo,['commit','-m','chore(local): snapshot '+source.sourceContentSha256]);
  await localGit(run,repo,['push','origin','HEAD:refs/heads/worktrees/'+id.hash]);
  const commit=(await localGit(run,repo,['rev-parse','HEAD'])).trim();
  return {commit,...record};
}
export function application(context,revision,manifests,{mode='iteration'}={}){
  const id=targetIdentity(context,mode);
  const ignores=manifests.filter(r=>r.kind==='HTTPRoute').map(r=>({group:'gateway.networking.k8s.io',kind:'HTTPRoute',name:r.metadata.name,namespace:id.namespace,jqPathExpressions:['.spec.rules[].backendRefs[].weight']}));
  for(const rollout of manifests.filter(r=>r.kind==='Rollout'))for(const name of [rollout.spec.strategy?.canary?.stableService,rollout.spec.strategy?.canary?.canaryService].filter(Boolean))ignores.push({group:'',kind:'Service',name,namespace:id.namespace,jsonPointers:['/spec/selector/rollouts-pod-template-hash']});
  return {apiVersion:'argoproj.io/v1alpha1',kind:'Application',metadata:{name:id.application,namespace:'argocd',labels:ownerLabels(context)},spec:{project:id.application,destination:{server:'https://kubernetes.default.svc',namespace:id.namespace},source:{repoURL:appRepository,targetRevision:revision,path:'iteration'},syncPolicy:{syncOptions:['RespectIgnoreDifferences=true']},ignoreDifferences:ignores}};
}
export async function syncLocal({context,state,release,manifests,k,folder}){
  const id=worktreeIdentity(context.projectId,context.worktreeId),existing=await object(k,'application',id.application,'argocd');
  if(existing){if(!state.applicationUid)throw Error('An unowned local Argo Application already exists');assertOwner(existing,context,state.applicationUid);}
  const app=application(context,state.baselineCommit??release.commit,manifests);
  await k(['apply','-f','-'],{input:JSON.stringify(app)});
  const created=await object(k,'application',id.application,'argocd');
  state={...state,applicationUid:created.metadata.uid,baselineCommit:state.baselineCommit??release.commit};writeJson(join(folder,'state.json'),state);
  const prior=created.status?.operationState?.startedAt;
  if(created.operation)throw Error('A prior Argo operation is still running; inspect it before deploying again');
  await k(['-n','argocd','patch','application',id.application,'--type=merge','-p',JSON.stringify({operation:syncOperation({revision:release.commit,manifests})})]);
  await waitFor('local Argo sync',async()=>{
    const app=await object(k,'application',id.application,'argocd'),op=app.status?.operationState;
    if(app.operation||op?.startedAt===prior)return false;
    if(['Failed','Error'].includes(op?.phase))throw Error('Local Argo sync failed: '+op.message);
    return op?.phase==='Succeeded';
  });
  return state;
}
export async function probeHttps(hostname,path='/health'){
  if(!/^\/[A-Za-z0-9/_-]*$/.test(path))throw Error('Invalid application health path');
  return new Promise((resolve,reject)=>{
    const req=request({hostname,path,ca:readFileSync('/etc/ssl/certs/ca-certificates.crt'),timeout:5000,agent:false},res=>{res.resume();res.on('end',()=>resolve(res.statusCode===200));});
    req.on('error',reject);req.on('timeout',()=>req.destroy(Error('Application HTTPS timeout')));req.end();
  });
}
export async function runInitialAnalyses({k,context,names=[],namespace}){
  if(!Array.isArray(names)||names.some(n=>typeof n!=='string'||!/^[a-z0-9-]{1,63}$/.test(n)))throw Error('Invalid initial application analysis declaration');
  const results=[];
  for(const name of names){
    const template=await object(k,'analysistemplate',name,namespace);if(!template)throw Error('Initial analysis template is missing: '+name);assertOwner(template,context);
    const spec=structuredClone(template.spec);
    spec.args=(spec.args??[]).map(arg=>arg.name==='namespace'?{name:'namespace',value:namespace}:arg);
    const analysis={apiVersion:'argoproj.io/v1alpha1',kind:'AnalysisRun',metadata:{generateName:'local-'+targetIdentity(context).hash+'-',namespace,labels:ownerLabels(context)},spec};
    const created=JSON.parse(await k(['create','-f','-','-o','json'],{input:JSON.stringify(analysis)}));
    await waitFor('initial application analysis',async()=>{
      const current=await object(k,'analysisrun',created.metadata.name,namespace),phase=current?.status?.phase;
      if(['Failed','Error','Inconclusive'].includes(phase))throw Error('Initial application analysis failed: '+name);
      return phase==='Successful';
    });
    results.push({name:created.metadata.name,uid:created.metadata.uid,phase:'Successful'});
  }
  return results;
}
export async function deployWorktree({context,cluster,bundle,run}){
  const id=worktreeIdentity(context.projectId,context.worktreeId),folder=directory(join(dirname(cluster.kubeconfig),'worktrees',id.hash)),k=kubernetes(run,cluster.kubeconfig);
  return withProjectLock(folder,async()=>{
    let state=await ensureEnvironment({context,folder,k});
    try{
      const config=readJson(insideCheckout(context.root,'deployment/local/builds.json'));
      if(config.dependencies?.includes('keycloak'))state=await localCredentials({context,state,k,folder});
      state={...state,phase:'building'};writeJson(join(folder,'state.json'),state);
      const source=await sourceIdentity(context.root,run),images=await buildImages({context,config,source,run});
      const manifests=await render({context,bundle,config,images,folder,k});
      const release=await publishRelease({context,folder,source,manifests,run,checks:config.initialAnalyses??[],healthPath:config.healthPath});
      state={...state,phase:'syncing',release};writeJson(join(folder,'state.json'),state);
      state=await syncLocal({context,state,release,manifests,k,folder});
      await ensureHostname(id.hostname,dirname(cluster.kubeconfig));
      await waitFor('application rollout',async()=>{
        for(const resource of manifests.filter(r=>['Rollout','Deployment'].includes(r.kind))){
          const current=await object(k,resource.kind,resource.metadata.name,id.namespace);
          if(resource.kind==='Rollout'){if(current.status?.phase==='Degraded')throw Error('Application rollout failed; stable traffic may still be serving');if(current.status?.phase!=='Healthy')return false;}
          else if((current.status?.availableReplicas??0)<(resource.spec.replicas??1))return false;
        }
        return true;
      },360_000);
      const analyses=await runInitialAnalyses({k,context,names:config.initialAnalyses??[],namespace:id.namespace});
      await waitFor('trusted application HTTPS',async()=>{try{return await probeHttps(id.hostname,config.healthPath);}catch{return false;}});
      state={...state,phase:'ready',analyses};writeJson(join(folder,'state.json'),state);
      return {phase:'ready',namespace:id.namespace,hostname:id.hostname,url:'https://'+id.hostname,release,mode:'local-override',mesh:'none',securityValidation:false};
    }catch(error){const latest=readJson(join(folder,'state.json'));writeJson(join(folder,'state.json'),{...latest,phase:'failed'});throw error;}
  });
}
