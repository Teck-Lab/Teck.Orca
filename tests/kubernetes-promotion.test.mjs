import assert from 'node:assert/strict';
import {test} from 'node:test';
import {fileURLToPath} from 'node:url';
import {deliveryResources} from '../runtime/kubernetes/promotion.mjs';
import {worktreeIdentity} from '../runtime/kubernetes/resources.mjs';
import {appRepository,platformRepository} from '../runtime/kubernetes/local-git.mjs';
import {loadBundle} from '../runtime/kubernetes/bundle.mjs';
import {paths} from '../runtime/kubernetes/layout.mjs';
const context={projectId:'project-a',worktreeId:'repo::/checkout/a'};
test('promotion sources and destinations are local and separate from iteration',()=>{
 const bundle=loadBundle(fileURLToPath(new URL('../runtime/kubernetes/gitops',import.meta.url)));
 const resources=deliveryResources(context,bundle),id=worktreeIdentity(context.projectId,context.worktreeId);
 const warehouse=resources.find(r=>r.kind==='Warehouse'),stage=resources.find(r=>r.kind==='Stage');
 assert.equal(warehouse.spec.subscriptions[0].git.repoURL,appRepository);
 assert.equal(warehouse.spec.subscriptions[0].git.branch,'worktrees/'+id.hash);
 const update=stage.spec.promotionTemplate.spec.steps[0];
 assert.equal(update.task.kind,'ClusterPromotionTask');
 assert.equal(update.task.name,'local-worktree-release');
 assert.equal(update.vars.find(v=>v.name==='application').value,id.application+'-promotion');
 assert.equal(update.vars.find(v=>v.name==='gitopsRepo').value,platformRepository);
 assert.equal(JSON.stringify(resources).includes('__WORKTREE__'),false);
 assert.equal(JSON.stringify(resources).includes('github.com'),false);
});

test('a reusable Kargo task cannot use the parent template output context',()=>{
 const bundle=loadBundle(fileURLToPath(new URL('../runtime/kubernetes/gitops',import.meta.url)));
 const task=structuredClone(bundle.yaml(paths.promotion));
 task.spec.steps.find(s=>s.uses==='argocd-update').config.apps[0].sources[0].desiredRevision='${{ outputs.commit.commit }}';
 assert.throws(()=>deliveryResources(context,{...bundle,yaml:()=>task}),/task-scoped outputs/);
});
