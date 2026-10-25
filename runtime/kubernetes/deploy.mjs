import {paths} from './layout.mjs';
import {randomBytes} from 'node:crypto';
import {existsSync,lstatSync,mkdirSync,readFileSync,rmSync,writeFileSync} from 'node:fs';
import {dirname,join,resolve,relative} from 'node:path';
import {request} from 'node:https';
import {setTimeout as delay} from 'node:timers/promises';
import {directory,readJson,withProjectLock,writeJson} from './state.mjs';
import {worktreeIdentity} from './resources.mjs';
import {contentHash,ownerLabels,releaseRecord,targetIdentity,validateManifests,worktreeResources} from './worktree.mjs';
import {insideCheckout,parseResources,sourceIdentity} from './render.mjs';
import {installAddons} from './platform.mjs';

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
export async function ensureEnvironment({context,folder,k}){
  const id=targetIdentity(context),path=join(folder,'state.json');
  let state=existsSync(path)?readJson(path):null;
  if(state&&(state.projectId!==context.projectId||state.worktreeId!==context.worktreeId||state.namespace!==id.namespace))throw Error('Invalid worktree environment ownership record');
  const existing=await object(k,'namespace',id.namespace);
  if(existing){if(!state?.namespaceUid)throw Error('An unowned worktree namespace already exists');assertOwner(existing,context,state.namespaceUid);}
  else{
    if(state&&state.phase!=='removed')throw Error('Owned worktree namespace is missing; inspect its data before recreating it');
    const ns=worktreeResources(context).find(r=>r.kind==='Namespace');
    const created=JSON.parse(await k(['create','-f','-','-o','json'],{input:JSON.stringify(ns)}));
    state={version:1,projectId:context.projectId,worktreeId:context.worktreeId,namespace:id.namespace,namespaceUid:created.metadata.uid,phase:'created'};writeJson(path,state);
  }
  const resources=worktreeResources(context).filter(r=>r.kind!=='Namespace');
  for(const r of resources){const existing=await object(k,r.kind,r.metadata.name,r.metadata.namespace);if(existing)assertOwner(existing,context);}
  await k(['apply','-f','-'],{input:JSON.stringify({apiVersion:'v1',kind:'List',items:resources})});
  return state;
}
export async function localCredentials({context,state,k,folder}){
  const name='gateway-public-auth',existing=await object(k,'secret',name,state.namespace);
  if(existing){if(!state.secretUid)throw Error('An unowned local application secret already exists');assertOwner(existing,context,state.secretUid);return state;}
  if(state.secretUid)throw Error('The owned application credential was removed; restore it before redeploying its persistent identity service');
  const secret={apiVersion:'v1',kind:'Secret',metadata:{name,namespace:state.namespace,labels:ownerLabels(context)},type:'Opaque',stringData:{'client-secret':randomBytes(32).toString('base64url')}};
  const created=JSON.parse(await k(['create','-f','-','-o','json'],{input:JSON.stringify(secret)}));
  state={...state,secretUid:created.metadata.uid};writeJson(join(folder,'state.json'),state);return state;
}
export async function buildImages({context,config,source,cluster,run,identify=sourceIdentity}){
  if(config.schemaVersion!==1||!Array.isArray(config.images))throw Error('A local image build declaration is required');
  const id=worktreeIdentity(context.projectId,context.worktreeId),images=[];
  for(const build of config.images){
    if(!/^[a-z0-9][a-z0-9-]{0,62}$/.test(build.name)||!/^ghcr\.io\/[a-z0-9/._-]+$/.test(build.image))throw Error('Invalid application image declaration');
    const folder=insideCheckout(context.root,build.context),dockerfile=insideCheckout(context.root,build.dockerfile);
    const repository='teck-local/'+ownerLabels(context)['teck.orca.io/project']+'/'+id.hash+'/'+build.name;
    const temporary=repository+':build-'+source.sourceContentSha256;
    const args=Object.entries({...build.args,VERSION:'0.0.0-local.'+source.sourceContentSha256.slice(0,12),SOURCE_SHA:source.sourceRevision});
    if(args.some(([key,value])=>!/^[A-Z][A-Z0-9_]*$/.test(key)||typeof value!=='string'||/[\0\r\n]/.test(value)))throw Error('Invalid application build argument');
    await run('docker',['build','--file',dockerfile,'--tag',temporary,'--label','io.teck.local.source='+source.sourceContentSha256,'--label','org.opencontainers.image.revision='+source.sourceRevision,...args.flatMap(([key,value])=>['--build-arg',key+'='+value]),folder],{timeout:900_000});
    if((await identify(context.root,run)).sourceContentSha256!==source.sourceContentSha256)throw Error('Worktree changed during the image build; redeploy the current source');
    const built=JSON.parse(await run('docker',['image','inspect',temporary]))[0];
    if(!/^sha256:[a-f0-9]{64}$/.test(built.Id)||built.Config.Labels?.['io.teck.local.source']!==source.sourceContentSha256)throw Error('Built image does not match the source content');
    const image=repository+':sha256-'+built.Id.slice(7);
    await run('docker',['tag',temporary,image]);
    await run('kind',['load','docker-image',image,'--name',cluster.name],{timeout:300_000});
    images.push({canonical:build.image,image,id:built.Id});
  }
  return images;
}
async function render({context,bundle,config,images,folder,k}){
  const id=worktreeIdentity(context.projectId,context.worktreeId),overlay=directory(join(folder,'render'));
  const dependencies=config.dependencies??[],available=bundle.json(paths.profile).dependencies??{};
  if(!Array.isArray(dependencies)||dependencies.some(name=>!/^[a-z0-9-]+$/.test(name)||!available[name]||!Object.hasOwn(bundle.files,`${available[name]}/kustomization.yaml`)))throw Error('Unknown local dependency');
  const spec={apiVersion:'kustomize.config.k8s.io/v1beta1',kind:'Kustomization',namespace:id.namespace,
    resources:[insideCheckout(context.root,'deployment/local'),...dependencies.map(name=>join(bundle.root,available[name]))].map(path=>relative(overlay,path)),
    images:images.map(({canonical,image})=>({name:canonical,newName:image.slice(0,image.lastIndexOf(':')),newTag:image.slice(image.lastIndexOf(':')+1)}))};
  writeJson(join(overlay,'kustomization.yaml'),spec);
  const yaml=await k(['kustomize','--load-restrictor=LoadRestrictionsNone',overlay]);
  const json=await k(['create','--dry-run=client','--validate=false','-f','-','-o','json'],{input:yaml});
  const resources=parseResources(json).map(resource=>{
    delete resource.status;for(const key of ['creationTimestamp','resourceVersion','generation','uid','managedFields'])delete resource.metadata[key];
    resource.metadata.labels={...resource.metadata.labels,...ownerLabels(context)};
    const pod=resource.kind==='CronJob'?resource.spec?.jobTemplate?.spec?.template?.spec:resource.kind==='Pod'?resource.spec:resource.spec?.template?.spec;
    for(const container of [...(pod?.containers??[]),...(pod?.initContainers??[])])if(images.some(i=>i.image===container.image))container.imagePullPolicy='IfNotPresent';
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
  if(!/^wt-[a-f0-9]{12}\.teck\.test$/.test(hostname))throw Error('Invalid worktree hostname');
  return withProjectLock(join(folder,'hosts'),async()=>{
    const path='/etc/hosts',text=readFileSync(path,'utf8'),marker='# teck-local '+hostname;
    const existing=text.split('\n').filter(line=>line.split('#')[0].trim().split(/\s+/).slice(1).includes(hostname));
    if(existing.length){if(existing.length!==1||existing[0]!==`127.0.0.1 ${hostname} ${marker}`)throw Error('An unowned hosts entry uses this worktree hostname');return;}
    writeFileSync(path,text.replace(/\n?$/,'\n')+`127.0.0.1 ${hostname} ${marker}\n`);
  });
}
function resourceKey(r){return r.apiVersion+'/'+r.kind+'/'+r.metadata.namespace+'/'+r.metadata.name;}
function resourceType(r){const group=r.apiVersion.includes('/')?r.apiVersion.split('/')[0]:'';return r.kind+(group?'.'+group:'');}
export async function waitResources({manifests,k}){
  for(const r of manifests){
    if(!['Deployment','StatefulSet','DaemonSet','Rollout','Job','PersistentVolumeClaim','Cluster'].includes(r.kind))continue;
    if(r.kind==='Cluster'&&r.apiVersion!=='postgresql.cnpg.io/v1')continue;
    if(['Deployment','StatefulSet','DaemonSet'].includes(r.kind)){
      await k(['-n',r.metadata.namespace,'rollout','status',r.kind.toLowerCase()+'/'+r.metadata.name,'--timeout=360s']);continue;
    }
    await waitFor(r.kind+'/'+r.metadata.name,async()=>{
      const current=await object(k,resourceType(r),r.metadata.name,r.metadata.namespace);if(!current)return false;
      const s=current.status??{},conditions=s.conditions??[];
      const failure=conditions.find(c=>c.status==='True'&&['Failed','Degraded'].includes(c.type));
      if(failure||s.phase==='Degraded')throw Error(r.kind+'/'+r.metadata.name+' failed: '+(failure?.message??s.message??'degraded'));
      if(r.kind==='Job')return conditions.some(c=>c.type==='Complete'&&c.status==='True');
      if(r.kind==='PersistentVolumeClaim')return s.phase==='Bound';
      if(r.kind==='Cluster')return conditions.some(c=>c.type==='Ready'&&c.status==='True')&&(s.observedGeneration===undefined||s.observedGeneration>=current.metadata.generation);
      if(r.kind==='Rollout')return s.phase==='Healthy'&&(s.observedGeneration===undefined||s.observedGeneration===current.metadata.generation);
      if((s.observedGeneration??0)<(current.metadata.generation??0))return false;
      if(r.kind==='DaemonSet')return s.numberReady===s.desiredNumberScheduled&&s.updatedNumberScheduled===s.desiredNumberScheduled;
      return (s.readyReplicas??0)>=(r.spec.replicas??1)&&(s.updatedReplicas??0)>=(r.spec.replicas??1);
    },360_000);
  }
}
export async function applyManifests({context,state,manifests,k,save}){
  const records=new Map((state.resources??[]).map(r=>[r.key,r]));
  // Validate every existing identity before writing any application resource.
  for(const r of manifests){
    const existing=await object(k,resourceType(r),r.metadata.name,r.metadata.namespace),record=records.get(resourceKey(r));
    if(existing){if(!record?.uid)throw Error('An unowned application resource already exists: '+r.kind+'/'+r.metadata.name);assertOwner(existing,context,record.uid);}
    else if(record)throw Error('Owned application resource is missing; inspect before recreating: '+r.kind+'/'+r.metadata.name);
  }
  const wave=r=>Number(r.metadata.annotations?.['teck.orca.io/apply-wave']??r.metadata.annotations?.['argocd.argoproj.io/sync-wave']??0);
  if(manifests.some(r=>!Number.isInteger(wave(r))))throw Error('Invalid local apply wave');
  for(const phase of [...new Set(manifests.map(wave))].sort((a,b)=>a-b)){
    const group=manifests.filter(r=>wave(r)===phase),input=JSON.stringify({apiVersion:'v1',kind:'List',items:group});
    await k(['apply','--dry-run=server','-f','-'],{input});
    // Use kubectl's normal three-way apply, preserving undeclared controller-owned fields.
    // Journal each successful write so an interrupted apply remains reviewable/retryable.
    for(const r of group){
      const actual=JSON.parse(await k(['apply','-f','-','-o','json'],{input:JSON.stringify(r)}));
      records.set(resourceKey(r),{key:resourceKey(r),uid:actual.metadata.uid});
      state={...state,resources:[...records.values()]};save(state);
    }
    await waitResources({manifests:group,k});
  }
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
    const save=value=>{state=value;writeJson(join(folder,'state.json'),state);};
    try{
      const config=readJson(insideCheckout(context.root,'deployment/local/builds.json'));
      await installAddons({names:config.addons??[],cluster,bundle,run});
      if(config.dependencies?.includes('keycloak'))state=await localCredentials({context,state,k,folder});
      save({...state,phase:'building'});
      const source=await sourceIdentity(context.root,run),images=await buildImages({context,config,source,cluster,run});
      const manifests=await render({context,bundle,config,images,folder,k});
      const release=releaseRecord({...source,manifests,images:images.map(i=>i.image)});
      // Only local, non-secret artifacts: no synthetic Git commits or remote publication.
      writeJson(join(folder,'manifests.json'),{apiVersion:'v1',kind:'List',items:manifests});
      save({...state,phase:'applying',release});
      state=await applyManifests({context,state,manifests,k,save});
      const analyses=await runInitialAnalyses({k,context,names:config.initialAnalyses??[],namespace:id.namespace});
      if(manifests.some(r=>r.kind==='HTTPRoute')){
        await ensureHostname(id.hostname,dirname(cluster.kubeconfig));
        await waitFor('trusted application HTTPS',async()=>{try{return await probeHttps(id.hostname,config.healthPath);}catch{return false;}});
      }
      save({...state,phase:'ready',analyses});
      return {phase:'ready',namespace:id.namespace,...(manifests.some(r=>r.kind==='HTTPRoute')?{url:'https://'+id.hostname}:{}),release,mode:'kubectl',mesh:'none',securityValidation:false};
    }catch(error){save({...state,phase:'failed'});throw error;}
  });
}
