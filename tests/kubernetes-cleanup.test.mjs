import assert from 'node:assert/strict';
import {test} from 'node:test';
import {cleanupResources} from '../runtime/kubernetes/cleanup.mjs';
import {ownerLabels,targetIdentity} from '../runtime/kubernetes/worktree.mjs';
const context={projectId:'project-a',worktreeId:'repo::/checkout/a'};
test('cleanup checks every ownership record before deleting and uses UID preconditions',async()=>{
 const id=targetIdentity(context),labels=ownerLabels(context),calls=[];
 const rows=[{kind:'Application',metadata:{name:id.application,namespace:'argocd',uid:'app-uid',labels}},{kind:'Namespace',metadata:{name:id.namespace,uid:'namespace-uid',labels}}];
 const targets=[{type:'application',name:id.application,namespace:'argocd',uid:'app-uid',url:'/apis/argoproj.io/v1alpha1/namespaces/argocd/applications/'+id.application},{type:'namespace',name:id.namespace,uid:'namespace-uid',url:'/api/v1/namespaces/'+id.namespace}];
 const k=async(args,options)=>{calls.push({args,options});if(args.includes('get'))return JSON.stringify(rows.find(r=>args.includes(r.metadata.name)&&args.includes(r.kind.toLowerCase())));return '{}';};
 await cleanupResources({context,k,targets});
 const deletes=calls.filter(c=>c.args.includes('delete'));assert.equal(deletes.length,2);
 assert.deepEqual(deletes.map(c=>JSON.parse(c.options.input).preconditions.uid),['app-uid','namespace-uid']);
 rows[1].metadata.uid='replacement';calls.length=0;
 await assert.rejects(cleanupResources({context,k,targets}),/identity/);
 assert.equal(calls.some(c=>c.args.includes('delete')),false);
});
