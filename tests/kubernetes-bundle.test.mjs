import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname,join} from 'node:path';
import {bundleSnapshot,loadBundle,bootstrapRevision} from '../runtime/kubernetes/bundle.mjs';
const files={'components.lock.json':'{"schemaVersion":1}','profiles/workspace/profile.json':'{"name":"workspace","enabled":true}'};
test('app dependency additions do not silently upgrade shared controllers or require cluster replacement',()=>{
 const base=bundleSnapshot({files,revision:'a'.repeat(40)});
 const addition=bundleSnapshot({files:{...files,'platform/dependencies/keycloak/deployment.json':'{}'},revision:'a'.repeat(40)});
 assert.equal(bootstrapRevision(base),bootstrapRevision(addition));
 const changed=bundleSnapshot({files:{...files,'platform/argocd/values.yaml':'changed'},revision:'a'.repeat(40)});
 assert.notEqual(bootstrapRevision(base),bootstrapRevision(changed));
});
test('bundle content identity is deterministic and includes configuration changes',()=>{
 const a=bundleSnapshot({files,revision:'a'.repeat(40),dirty:true});
 const b=bundleSnapshot({files:Object.fromEntries(Object.entries(files).reverse()),revision:'a'.repeat(40),dirty:true});
 assert.deepEqual(a,b);
 assert.notEqual(a.contentSha256,bundleSnapshot({files:{...files,'extra.yaml':'x'},revision:'a'.repeat(40),dirty:true}).contentSha256);
 assert.throws(()=>bundleSnapshot({files:{'../secret':'x'},revision:'a'.repeat(40)}),/path/);
 assert.throws(()=>bundleSnapshot({files:{'key.yaml':'-----BEGIN PRIVATE KEY-----'},revision:'a'.repeat(40)}),/private/);
});
test('runtime verification rejects missing, tampered and extra bundle files',t=>{
 const root=mkdtempSync(join(tmpdir(),'teck-kube-bundle-'));t.after(()=>rmSync(root,{recursive:true,force:true}));
 const manifest=bundleSnapshot({files,revision:'a'.repeat(40),dirty:true});
 for(const [name,text] of Object.entries(files)){mkdirSync(dirname(join(root,name)),{recursive:true});writeFileSync(join(root,name),text);}
 writeFileSync(join(root,'snapshot.json'),JSON.stringify(manifest));
 assert.equal(loadBundle(root).contentSha256,manifest.contentSha256);
 writeFileSync(join(root,'components.lock.json'),'{}');assert.throws(()=>loadBundle(root),/checksum/);
 writeFileSync(join(root,'components.lock.json'),files['components.lock.json']);
 writeFileSync(join(root,'unexpected.json'),'{}');assert.throws(()=>loadBundle(root),/inventory/);
 rmSync(join(root,'unexpected.json'));rmSync(join(root,'components.lock.json'));assert.throws(()=>loadBundle(root),/inventory/);
});
