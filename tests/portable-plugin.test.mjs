import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { spawnSync } from 'node:child_process';
import { snapshot } from '../native-ssh/release.mjs';
import { ensureNativeRuntime, verifyBundledRuntime } from '../scripts/portable-bootstrap.mjs';
import { portableEntry, buildPortablePlugin } from '../scripts/package-portable-plugin.mjs';
import { repositoryRoot } from '../scripts/release.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex');
function fixture(t){const root=fs.mkdtempSync(join(tmpdir(),'teck-portable-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));return root;}
function bundle(root,files){const release=snapshot(files),payload=gzipSync(Buffer.from(JSON.stringify({manifest:release.json,files:Object.fromEntries(Object.entries(files).map(([p,b])=>[p,b.toString('base64')]))})));const path=join(root,'native-runtime.json.gz');fs.writeFileSync(path,payload);return{...release,path,payloadHash:sha(payload)};}

test('native runtime installs from approved bundled bytes on a fresh machine and rejects later tampering',t=>{
 const root=fixture(t),r=bundle(root,{'src/recipe.mjs':Buffer.from('export function main(){}'),'assets/kit-release.json':Buffer.from('{}')});
 const dest=ensureNativeRuntime(r.path,r.payloadHash,r.digest,join(root,'state'));
 assert.equal(fs.readFileSync(join(dest,'src/recipe.mjs'),'utf8'),'export function main(){}');
 assert.equal(ensureNativeRuntime(r.path,r.payloadHash,r.digest,join(root,'state')),dest);
 fs.writeFileSync(join(dest,'src/recipe.mjs'),'tampered');
 assert.throws(()=>ensureNativeRuntime(r.path,r.payloadHash,r.digest,join(root,'state')),/Changed bundled runtime file/);
});

test('archive tampering and path traversal cannot materialize a native release',t=>{
 const root=fixture(t),r=bundle(root,{'../escape':Buffer.from('bad')});
 assert.throws(()=>ensureNativeRuntime(r.path,r.payloadHash,r.digest,join(root,'state')),/Invalid bundled runtime path/);
 assert.equal(fs.existsSync(join(root,'escape')),false);
 fs.appendFileSync(r.path,'tampered');
 assert.throws(()=>ensureNativeRuntime(r.path,r.payloadHash,r.digest,join(root,'state')),/archive mismatch/);
});

test('portable activation works with no preinstalled recovery runtime and does not provision',async t=>{
 const root=fixture(t),files={'runtime/plugin-entry.mjs':Buffer.from('export default o=>o.commands.register("ready",()=>{});')};
 const host=snapshot(files);fs.mkdirSync(join(root,'host/runtime'),{recursive:true});
 for(const[name,bytes]of Object.entries(files))fs.writeFileSync(join(root,'host',name),bytes);
 fs.writeFileSync(join(root,'host/release.json'),host.json);
 fs.copyFileSync(new URL('../scripts/portable-bootstrap.mjs',import.meta.url),join(root,'portable-bootstrap.mjs'));
 const native=bundle(root,{'src/recipe.mjs':Buffer.from('throw Error("Must not provision during activation");')});
 fs.writeFileSync(join(root,'main.mjs'),portableEntry({hostDigest:host.digest,nativeDigest:native.digest,nativeHash:native.payloadHash}));
 const old=process.env.TECK_ORCA_NATIVE_SSH_RELEASES_DIR;process.env.TECK_ORCA_NATIVE_SSH_RELEASES_DIR=join(root,'native-state');
 t.after(()=>old===undefined?delete process.env.TECK_ORCA_NATIVE_SSH_RELEASES_DIR:process.env.TECK_ORCA_NATIVE_SSH_RELEASES_DIR=old);
 const registered=[];const entry=await import(pathToFileURL(join(root,'main.mjs')).href);await entry.default({commands:{register:k=>registered.push(k)}});
 assert.deepEqual(registered,['ready']);assert.ok(fs.existsSync(join(root,'native-state',native.digest,'src/recipe.mjs')));
 fs.writeFileSync(join(root,'host/runtime/plugin-entry.mjs'),'changed');
 await assert.rejects(entry.default({commands:{register(){}}}),/Changed bundled runtime file/);
});

test('portable build refuses the watched development plugin and missing published kit lock',t=>{
 const root=fixture(t);assert.throws(()=>buildPortablePlugin({source:root,destination:join(root,'plugin')}),/watched plugin/);
 assert.throws(()=>buildPortablePlugin({source:root,destination:join(root,'dist')}),/Publish and sign/);
});

test('portable package rejects a kit from another release and conflicting source versions',t=>{
 const root=fixture(t),destination=join(root,'candidate');
 fs.writeFileSync(join(root,'orca-plugin.json'),JSON.stringify({version:'1.0.0'}));
 fs.writeFileSync(join(root,'package.json'),JSON.stringify({version:'1.0.0'}));
 assert.throws(()=>buildPortablePlugin({source:root,destination,kitRelease:{version:'0.9.0'}}),/versions must match/);
 fs.writeFileSync(join(root,'package.json'),JSON.stringify({version:'1.1.0'}));
 assert.throws(()=>buildPortablePlugin({source:root,destination,kitRelease:{version:'1.0.0'}}),/versions must match/);
 assert.equal(fs.existsSync(destination),false);
});

test('complete portable package fits Orca limits and its native recipe runs without preinstalled runtimes',async t=>{
 const root=fixture(t),destination=join(root,'package');
 // Deliberately synthetic test-only lock, never written to the catalogue/source tree.
 const version=JSON.parse(fs.readFileSync(join(repositoryRoot,'orca-plugin.json'))).version;
 const registry='ghcr.io/teck-lab/teck-orca',digest='sha256:'+'a'.repeat(64);
 const kitRelease={schemaVersion:1,version,sourceCommit:'b'.repeat(40),set:{ref:registry+':'+version,digest},
   components:['base','omp','devtools','browser','kubernetes','workflow','office','omniroute','mcphub'].map(name=>({name,ref:registry+'/'+name+':'+version,digest})),
   verification:{issuer:'https://token.actions.githubusercontent.com',identity:`https://github.com/Teck-Lab/Teck.Orca/.github/workflows/release-kits.yml@refs/tags/v${version}`}};
 const result=buildPortablePlugin({source:repositoryRoot,destination,kitRelease});
 assert.ok(result.totalBytes<50*1024**2);assert.ok(result.entries<2000);
 assert.equal(fs.existsSync(join(destination,'host/runtime/kits/orcad/bundle')),false);
 const receipt=JSON.parse(fs.readFileSync(join(destination,'portable-release.json')));
 verifyBundledRuntime(join(destination,'host'),receipt.hostDigest);
 const installed=ensureNativeRuntime(join(destination,'native-runtime.json.gz'),receipt.nativeArchiveHash,receipt.nativeDigest,join(root,'native'));
 assert.equal(fs.existsSync(join(installed,'assets/kits/workload')),false);
 const {ensureKubernetesPrerequisites}=await import(pathToFileURL(join(installed,'src/kubernetes-prerequisites.mjs')).href);
 const calls=[];
 await ensureKubernetesPrerequisites({name:'fixture-only',assetRoot:installed,run:async(...args)=>{calls.push(args);return '';}});
 assert.equal(calls.length,1);
 assert.deepEqual(calls[0].slice(0,2),['sbx',['exec','-i','-u','root','fixture-only','sh','-s']]);
 assert.match(calls[0][2].input,/kubernetes-prerequisites\.sh --install/);
 assert.ok(calls[0][2].input.includes('/dev/kmsg'));
 const {workflowFiles}=await import(pathToFileURL(join(installed,'workflow-assets.mjs')).href);
 assert.ok(workflowFiles(join(installed,'assets/omp'),join(installed,'assets')).length>0);
 const recipeModule=await import(pathToFileURL(join(installed,'src/recipe.mjs')).href);
 assert.equal(typeof recipeModule.main,'function');
 const hostModule=await import(pathToFileURL(join(destination,'host/runtime/plugin-entry.mjs')).href);
 assert.equal(typeof hostModule.default,'function');
 const recipe=JSON.parse(fs.readFileSync(join(destination,'recipes/native-ssh-project.json')));
 assert.ok(recipe.suspend.includes('node -e'));
 const decoded=Buffer.from(recipe.suspend.match(/Buffer\.from\('([^']+)'/)[1],'base64').toString();
 assert.ok(decoded.includes(receipt.nativeDigest));
 const {sandboxName}=await import(pathToFileURL(join(installed,'src/provider.mjs')).href);
 const projectId='portable-test',instanceId='fixture-workspace';
 const execution=spawnSync(recipe.suspend,{shell:true,encoding:'utf8',windowsHide:true,timeout:30000,
   env:{...process.env,TECK_ORCA_NATIVE_SSH_RELEASES_DIR:join(root,'native'),ORCA_PROJECT_ID:projectId,ORCA_VM_INSTANCE_ID:instanceId},
   input:JSON.stringify({recipeResult:{userData:{version:1,projectId,instanceId,sandboxName:sandboxName(projectId),sandboxId:'test-only',connectionMode:'native-ssh'}}})});
 assert.equal(execution.status,0,execution.stderr);assert.equal(execution.stdout,'');
 buildPortablePlugin({source:repositoryRoot,destination,kitRelease,check:true});
});
