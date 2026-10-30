import {createHash} from 'node:crypto';
import {worktreeIdentity} from './resources.mjs';

export const contentHash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
export function ownerLabels(context){
  const id=worktreeIdentity(context.projectId,context.worktreeId);
  return {'teck.orca.io/project':createHash('sha256').update(context.projectId).digest('hex').slice(0,12),'teck.orca.io/worktree':id.hash};
}
export const targetIdentity=context=>worktreeIdentity(context.projectId,context.worktreeId);
export function worktreeResources(context){
  const id=targetIdentity(context),labels=ownerLabels(context);
  const meta=(name,namespace)=>({name,...(namespace?{namespace}:{}),labels});
  return [
    {apiVersion:'v1',kind:'Namespace',metadata:{...meta(id.namespace),labels:{...labels,'teck.orca.io/local-worktree':'true','teck.orca.io/profile':'workspace'}}},
    {apiVersion:'v1',kind:'ResourceQuota',metadata:meta('worktree',id.namespace),spec:{hard:{'requests.cpu':'2','requests.memory':'3Gi','limits.cpu':'6','limits.memory':'6Gi','requests.storage':'5Gi',pods:'40'}}},
    {apiVersion:'v1',kind:'LimitRange',metadata:meta('worktree',id.namespace),spec:{limits:[{type:'Container',defaultRequest:{cpu:'10m',memory:'32Mi'},default:{cpu:'1',memory:'512Mi'}}]}},
  ];
}
export function validateManifests(manifests,namespace,scopes){
  if(!Array.isArray(manifests)||!manifests.length)throw Error('No application resources were rendered');
  const seen=new Set();
  for(const resource of manifests){
    if(scopes[resource.apiVersion+'/'+resource.kind]!==true)throw Error('Unknown or cluster resource scope: '+resource.kind);
    if(resource.metadata?.namespace!==namespace)throw Error('Application resource targets another namespace');
    if(resource.kind==='Rollout'){
      const target=resource.spec?.strategy?.canary?.trafficRouting?.plugins?.['argoproj-labs/gatewayAPI']?.namespace;
      if(target&&target!==namespace)throw Error('Rollout traffic routing targets another namespace');
    }
    if(resource.kind==='HTTPRoute'&&resource.spec?.rules?.some(rule=>rule.backendRefs?.some(ref=>ref.namespace&&ref.namespace!==namespace)))throw Error('Route backend targets another namespace');
    const key=resource.apiVersion+'/'+resource.kind+'/'+resource.metadata.name;
    if(seen.has(key))throw Error('Duplicate application resource');seen.add(key);
    if(resource.kind==='Secret'&&(resource.data||resource.stringData))throw Error('Generate local secrets separately; do not publish secret values in deployment snapshots');
  }
  return true;
}
export function manifestImages(value){
  const images=new Set();
  const visit=object=>{if(!object||typeof object!=='object')return;for(const [key,value] of Object.entries(object)){if(key==='image'&&typeof value==='string')images.add(value);else visit(value);}};
  visit(value);return [...images].sort();
}
export function releaseRecord({sourceRevision,sourceContentSha256,manifests,images}){
  const record={schemaVersion:2,sourceRevision,sourceContentSha256,manifestSha256:contentHash(manifests),images:[...new Set(images)].sort()};
  validateRelease(record,manifests);return record;
}
export function validateRelease(record,manifests){
  const images=manifestImages(manifests),local=i=>/^teck-local\/[a-z0-9/._-]+:sha256-[a-f0-9]{64}$/.test(i);
  if(record.schemaVersion!==2||!/^[a-f0-9]{40}$/.test(record.sourceRevision)||!/^[a-f0-9]{64}$/.test(record.sourceContentSha256)||record.manifestSha256!==contentHash(manifests)||!Array.isArray(record.images)||record.images.some(i=>!local(i)||!images.includes(i))||images.filter(i=>i.startsWith('teck-local/')).some(i=>!record.images.includes(i)))throw Error('Local release source, manifest and loaded image references do not match');
  return true;
}
