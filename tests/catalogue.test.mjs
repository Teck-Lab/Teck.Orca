import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { catalogueRelease, emptyCatalogue } from '../scripts/update-catalogue.mjs';

function fixture(t,{dirty='',commit='a'.repeat(40),reportedCommit=commit}={}){
 const root=fs.mkdtempSync(join(tmpdir(),'teck-catalogue-')),plugin=join(root,'plugin');fs.mkdirSync(plugin);
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 fs.writeFileSync(join(plugin,'orca-plugin.json'),JSON.stringify({publisher:'teck-lab',id:'teck-sbx-recipes',version:'1.0.0',description:'Fixture'}));
 fs.writeFileSync(join(plugin,'portable-release.json'),JSON.stringify({schemaVersion:1,kitSourceCommit:'b'.repeat(40),nativeDigest:'c'.repeat(64)}));
 const entry={version:'1.0.0',commit:reportedCommit,contentHash:'d'.repeat(64),execution:'trusted-worker',minimumOrca:'1.4.248'};
 const run=(program,args)=>{
  if(program==='orca')return JSON.stringify({ok:true,result:{pluginKey:'teck-lab.teck-sbx-recipes',entry,sourcePath:'plugin'}});
  if(args.includes('--show-toplevel'))return root;
  if(args.includes('ls-files'))return 'plugin/portable-release.json';
  if(args.includes('status'))return dirty;
  if(args.includes('HEAD'))return commit;
  throw Error('Unexpected command');
 };
 return{plugin,run,entry};
}
test('catalogue uses only the exact official committed release entry and retains older versions',t=>{
 const f=fixture(t),older={...f.entry,version:'0.9.0',commit:'e'.repeat(40)};
 const c={...emptyCatalogue(),plugins:[{id:'teck-lab.teck-sbx-recipes',releases:[older]}]};
 const next=catalogueRelease({...f,catalogue:c});
 assert.deepEqual(next.plugins[0].releases,[f.entry,older]);
 assert.equal(next.plugins[0].source.path,'plugin');
 assert.deepEqual(catalogueRelease({...f,catalogue:next}),next);
});
test('uncommitted package and mismatched official pins are refused',t=>{
 assert.throws(()=>catalogueRelease(fixture(t,{dirty:' M plugin/main.mjs'})),/uncommitted/);
 assert.throws(()=>catalogueRelease(fixture(t,{reportedCommit:'e'.repeat(40)})),/matching committed release/);
});
test('a released version cannot silently acquire new bytes',t=>{
 const f=fixture(t),c={...emptyCatalogue(),plugins:[{id:'teck-lab.teck-sbx-recipes',releases:[{...f.entry,contentHash:'f'.repeat(64)}]}]};
 assert.throws(()=>catalogueRelease({...f,catalogue:c}),/bump its version/);
});
