import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {takeoverPlatform} from '../runtime/kubernetes/platform.mjs';

test('platform takeover waits for the newly seeded source instead of an older healthy revision',async t=>{
 const folder=mkdtempSync(join(tmpdir(),'teck-takeover-'));t.after(()=>rmSync(folder,{recursive:true,force:true}));
 const revision='b'.repeat(40),calls=[];let refreshed=false;
 const bundle={root:'/verified',contentSha256:'new-source',files:{'apps/local/system/kargo/config.yaml':'hash'},yaml:()=>({appName:'local-kargo'})};
 const run=async(program,args)=>{calls.push({program,args});if(program==='git')return revision+'\trefs/heads/main\n';
  if(args.includes('annotate'))refreshed=true;
  if(args.includes('get'))return JSON.stringify({items:[{metadata:{name:'local-kargo'},status:{sync:{status:'Synced',revision:refreshed?revision:'a'.repeat(40)},health:{status:'Healthy'}}}]});return '';};
 await takeoverPlatform({folder,bundle,kubeconfig:'/owned/kubeconfig',run});
 assert.ok(refreshed,'Old healthy application status is not evidence of the new source');
 assert.equal(JSON.parse(readFileSync(join(folder,'gitops-managed.json'))).contentSha256,'new-source');
});
