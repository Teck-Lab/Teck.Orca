import assert from 'node:assert/strict';
import {test} from 'node:test';
import {runInitialAnalyses} from '../runtime/kubernetes/deploy.mjs';
import {ownerLabels} from '../runtime/kubernetes/worktree.mjs';
test('a ready application cannot pass deployment when its declared initial analysis fails',async()=>{
 const context={projectId:'project',worktreeId:'repo::/checkout'};let created;
 const k=async(args,options)=>{
   if(args.includes('get')&&args.includes('analysistemplate'))return JSON.stringify({metadata:{labels:ownerLabels(context)},spec:{args:[{name:'namespace'}],metrics:[{name:'actual-health',provider:{job:{spec:{}}}}]}});
   if(args.includes('create')){created=JSON.parse(options.input);return JSON.stringify({metadata:{name:'initial-check-1',uid:'uid'}});}
   if(args.includes('get')&&args.includes('analysisrun'))return JSON.stringify({status:{phase:'Failed'}});
   throw Error('Unexpected fixture request');
 };
 await assert.rejects(runInitialAnalyses({k,context,names:['health'],namespace:'teck-wt-test'}),/analysis.*failed/i);
 assert.equal(created.spec.args[0].value,'teck-wt-test');
});
