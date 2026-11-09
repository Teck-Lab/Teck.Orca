import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {validateKitRelease,selectKitRelease} from '../src/kit-release.mjs';

const fixture = () => ({schemaVersion:1,version:'0.8.0',sourceCommit:'a'.repeat(40),
  set:{ref:'ghcr.io/teck-lab/teck-orca:0.8.0',digest:'sha256:'+'a'.repeat(64)},
  components:['base','omp','devtools','browser','kubernetes','workflow','office','omniroute','mcphub'].map(name=>({name,ref:`ghcr.io/teck-lab/teck-orca/${name}:0.8.0`,digest:'sha256:'+'b'.repeat(64)})),
  verification:{issuer:'https://token.actions.githubusercontent.com',identity:'https://github.com/Teck-Lab/Teck.Orca/.github/workflows/release-kits.yml@refs/tags/v0.8.0'}});
test('release pins and signer must describe the complete expected immutable kit set',()=>{
  const lock=fixture(); assert.equal(validateKitRelease(lock),lock);
  for(const mutate of [x=>delete x.set.digest,x=>x.set.ref='ghcr.io/elsewhere/kit:0.8.0',x=>x.components.pop(),x=>x.components[1]=x.components[0],x=>x.verification.identity=x.verification.identity.replace('refs/tags/v0.8.0','refs/heads/main'),x=>x.sourceCommit='main']){
    const bad=fixture();mutate(bad);assert.throws(()=>validateKitRelease(bad),/published|Published/);
  }
});
test('normal provisioning refuses a missing lock and never silently builds the legacy source',t=>{
  const root=fs.mkdtempSync(join(tmpdir(),'teck-kit-selection-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  fs.mkdirSync(join(root,'assets/kits/workload'),{recursive:true});fs.writeFileSync(join(root,'assets/kits/workload/workload.yaml'),'fixture');
  assert.throws(()=>selectKitRelease(root),/no published sandbox kit release/);
  assert.equal(selectKitRelease(root,{sourceDevelopment:true}).kind,'source-development');
  fs.writeFileSync(join(root,'assets/kit-release.json'),JSON.stringify(fixture()));
  const selection=selectKitRelease(root,{sourceDevelopment:true});
  assert.equal(selection.kind,'published');assert.match(selection.reference,/@sha256:[a-f0-9]{64}$/);
  assert.equal(selection.verifyArgs[2],selection.reference);
  fs.writeFileSync(join(root,'assets/kit-release.json'),'{}');
  assert.throws(()=>selectKitRelease(root,{sourceDevelopment:true}),/Invalid published/);
});
