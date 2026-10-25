import assert from 'node:assert/strict';
import {test} from 'node:test';
import {worktreeResources,syncOperation,validateRelease,releaseRecord,validateManifests} from '../runtime/kubernetes/worktree.mjs';
import {worktreeIdentity} from '../runtime/kubernetes/resources.mjs';
const context={projectId:'project-a',worktreeId:'repo::/checkout/a'};
const id=worktreeIdentity(context.projectId,context.worktreeId);
const manifests=[{apiVersion:'apps/v1',kind:'Deployment',metadata:{name:'app',namespace:id.namespace},spec:{template:{spec:{containers:[{name:'app',image:'localhost:5001/app@sha256:'+'a'.repeat(64)}]}}}}];
test('worktree projects permit only local source repos and their exact namespace',()=>{
 const resources=worktreeResources(context);
 const project=resources.find(r=>r.kind==='AppProject');
 assert.deepEqual(project.spec.clusterResourceWhitelist,[]);
 assert.deepEqual(project.spec.destinations,[{server:'https://kubernetes.default.svc',namespace:id.namespace}]);
 assert.equal(resources.some(r=>r.apiVersion.startsWith('security.istio.io')),false);
 assert.equal(resources.find(r=>r.kind==='Namespace').metadata.labels['teck.orca.io/profile'],'workspace');
 assert.ok(resources.some(r=>r.kind==='ResourceQuota'));
});
test('local overrides pass ignore differences on the operation and never auto-sync',()=>{
 const op=syncOperation({revision:'b'.repeat(40),manifests});
 assert.ok(op.sync.syncOptions.includes('RespectIgnoreDifferences=true'));
 assert.deepEqual(op.sync.manifests,manifests.map(m=>JSON.stringify(m)));
 assert.equal(op.sync.prune,false);
});
test('release binds source content, rendered manifests and immutable application images',()=>{
 const release=releaseRecord({sourceRevision:'b'.repeat(40),sourceContentSha256:'c'.repeat(64),manifests,images:[manifests[0].spec.template.spec.containers[0].image]});
 assert.equal(validateRelease(release,manifests),true);
 const mismatch=structuredClone(manifests);mismatch[0].spec.template.spec.containers[0].image='localhost:5001/app@sha256:'+'d'.repeat(64);
 assert.throws(()=>validateRelease(release,mismatch),/match/);
 assert.throws(()=>releaseRecord({...release,manifests,images:['localhost:5001/app:latest']}),/digest/);
});
test('foreign namespace and cluster-scoped resources are refused before applying',()=>{
 const scopes={'apps/v1/Deployment':true,'rbac.authorization.k8s.io/v1/ClusterRole':false};
 assert.equal(validateManifests(manifests,id.namespace,scopes),true);
 assert.throws(()=>validateManifests([{...manifests[0],metadata:{name:'app',namespace:'other'}}],id.namespace,scopes),/namespace/);
 assert.throws(()=>validateManifests([{apiVersion:'rbac.authorization.k8s.io/v1',kind:'ClusterRole',metadata:{name:'admin'}}],id.namespace,scopes),/scope/);
 assert.throws(()=>validateManifests([{apiVersion:'unknown/v1',kind:'Unknown',metadata:{name:'x',namespace:id.namespace}}],id.namespace,scopes),/scope/);
});
test('promotion has a separate destination and route controllers cannot write another worktree',()=>{
 const resources=worktreeResources(context,{mode:'promotion'});
 assert.equal(resources.find(r=>r.kind==='Namespace').metadata.name,id.namespace+'-promotion');
 const rollout={apiVersion:'argoproj.io/v1alpha1',kind:'Rollout',metadata:{name:'app',namespace:id.namespace},spec:{strategy:{canary:{trafficRouting:{plugins:{'argoproj-labs/gatewayAPI':{namespace:'foreign'}}}}}}};
 assert.throws(()=>validateManifests([rollout],id.namespace,{'argoproj.io/v1alpha1/Rollout':true}),/namespace/);
});
