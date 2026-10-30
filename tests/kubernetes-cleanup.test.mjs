import assert from 'node:assert/strict';
import {test} from 'node:test';
import {cleanupResources} from '../runtime/kubernetes/cleanup.mjs';
import {ownerLabels,targetIdentity} from '../runtime/kubernetes/worktree.mjs';
const context={projectId:'project-a',worktreeId:'repo::/checkout/a'};
test('cleanup checks every ownership record before deleting and uses UID preconditions',async()=>{
 const id=targetIdentity(context),labels=ownerLabels(context),calls=[];
 const rows=[{kind:'Namespace',metadata:{name:id.namespace,uid:'namespace-uid',labels}}];
 const targets=[{type:'namespace',name:id.namespace,uid:'namespace-uid'}];
 const k=async(args,options)=>{calls.push({args,options});if(args.includes('get'))return JSON.stringify(rows.find(r=>args.includes(r.metadata.name)&&args.includes(r.kind.toLowerCase())));return '{}';};
 await cleanupResources({context,k,targets});
 const deletes=calls.filter(c=>c.args.includes('delete'));assert.equal(deletes.length,1);
 assert.deepEqual(deletes.map(c=>JSON.parse(c.options.input).preconditions.uid),['namespace-uid']);
 rows[0].metadata.uid='replacement';calls.length=0;
 await assert.rejects(cleanupResources({context,k,targets}),/identity/);
 assert.equal(calls.some(c=>c.args.includes('delete')),false);
});
