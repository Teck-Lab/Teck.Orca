import assert from 'node:assert/strict';
import {test} from 'node:test';
import {worktreeResources,validateRelease,releaseRecord,validateManifests} from '../runtime/kubernetes/worktree.mjs';
import {worktreeIdentity} from '../runtime/kubernetes/resources.mjs';
const context={projectId:'project-a',worktreeId:'repo::/checkout/a'};
const id=worktreeIdentity(context.projectId,context.worktreeId);
const manifests=[{apiVersion:'apps/v1',kind:'Deployment',metadata:{name:'app',namespace:id.namespace},spec:{template:{spec:{containers:[{name:'app',image:'teck-local/app:sha256-'+'a'.repeat(64)}]}}}}];
test('worktree environments contain namespace limits without delivery CRDs',()=>{
 const resources=worktreeResources(context);assert.equal(resources.some(r=>['AppProject','Application','Stage'].includes(r.kind)),false);assert.ok(resources.some(r=>r.kind==='ResourceQuota'));assert.equal(resources.find(r=>r.kind==='Namespace').metadata.name,id.namespace);
});
test('release binds source content, rendered manifests and immutable application images',()=>{
 const release=releaseRecord({sourceRevision:'b'.repeat(40),sourceContentSha256:'c'.repeat(64),manifests,images:[manifests[0].spec.template.spec.containers[0].image]});
 assert.equal(validateRelease(release,manifests),true);
 const mismatch=structuredClone(manifests);mismatch[0].spec.template.spec.containers[0].image='teck-local/app:sha256-'+'d'.repeat(64);
 assert.throws(()=>validateRelease(release,mismatch),/match/);
 assert.throws(()=>releaseRecord({...release,manifests,images:['teck-local/app:latest']}),/match/);
});
test('foreign namespace and cluster-scoped resources are refused before applying',()=>{
 const scopes={'apps/v1/Deployment':true,'rbac.authorization.k8s.io/v1/ClusterRole':false};
 assert.equal(validateManifests(manifests,id.namespace,scopes),true);
 assert.throws(()=>validateManifests([{...manifests[0],metadata:{name:'app',namespace:'other'}}],id.namespace,scopes),/namespace/);
 assert.throws(()=>validateManifests([{apiVersion:'rbac.authorization.k8s.io/v1',kind:'ClusterRole',metadata:{name:'admin'}}],id.namespace,scopes),/scope/);
 assert.throws(()=>validateManifests([{apiVersion:'unknown/v1',kind:'Unknown',metadata:{name:'x',namespace:id.namespace}}],id.namespace,scopes),/scope/);
});
test('route controllers cannot write another worktree',()=>{
 const rollout={apiVersion:'argoproj.io/v1alpha1',kind:'Rollout',metadata:{name:'app',namespace:id.namespace},spec:{strategy:{canary:{trafficRouting:{plugins:{'argoproj-labs/gatewayAPI':{namespace:'foreign'}}}}}}};
 assert.throws(()=>validateManifests([rollout],id.namespace,{'argoproj.io/v1alpha1/Rollout':true}),/namespace/);
});
