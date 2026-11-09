import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import YAML from '../runtime/kubernetes/vendor/yaml/dist/index.js';
import {components, releasePlan, buildReceipt, validateReceipts, setDescriptor, auditFileInventories, releaseLock} from '../scripts/kit-release.mjs';

const sourceCommit = 'a'.repeat(40), version = '1.2.3';
const receipts = () => components.map((name, index) => buildReceipt({name, version, sourceCommit,
  metadata: {'containerimage.digest': 'sha256:' + (index + 1).toString(16).repeat(64)}}));
const file = text => ({type:'file',mode:0o644,uid:0,gid:0,digest:'sha256:'+text.repeat(64)});
const inventories = rows => rows.flatMap(r => ['linux/amd64','linux/arm64'].map(platform => ({name:r.name, platform, digest:r.digest,
  entries:{usr:{type:'directory',mode:0o755,uid:0,gid:0},[`usr/${r.name}`]:file('a')}})));

test('publication requires the owning repository and matching exact release tag', () => {
  const identity={tag:'refs/tags/v1.2.3',sourceCommit,repository:'Teck-Lab/Teck.Orca',packageVersion:version,pluginVersion:version};
  assert.equal(releasePlan(identity).version,version);
  for(const change of [{tag:'refs/heads/main'},{tag:'refs/tags/v1.2.3;evil'},{repository:'someone/Teck.Orca'},{packageVersion:'1.2.4'},{sourceCommit:'main'}])
    assert.throws(()=>releasePlan({...identity,...change}));
});

test('set uses every actual digest and rejects missing, duplicate, foreign and mixed receipts', () => {
  const rows=receipts();
  const descriptor=YAML.parse(setDescriptor(rows));
  assert.equal(descriptor.kind,'set');
  assert.equal(descriptor.kits.length,9);
  assert.deepEqual(descriptor.kits,rows.map(({ref,digest})=>({ref,digest})));
  assert.equal(descriptor.build,undefined);
  for(const invalid of [rows.slice(1),[rows[0],...rows.slice(0,-1)],rows.map((r,i)=>i? r:{...r,version:'1.2.4'}),
    rows.map((r,i)=>i?r:{...r,ref:'ghcr.io/other/base:1.2.3'}),rows.map((r,i)=>i?r:{...r,digest:'latest'}),
    rows.map((r,i)=>i?r:{...r,platforms:['linux/amd64']})]) assert.throws(()=>validateReceipts(invalid));
  assert.throws(()=>buildReceipt({name:'base',version,sourceCommit,metadata:{'containerimage.config.digest':'sha256:'+'a'.repeat(64)}}),/Buildx/);
});

test('file audit catches content, ownership and symlink collisions on either architecture', () => {
  const rows=receipts(), files=inventories(rows);
  assert.equal(auditFileInventories(files,rows).passed,true);
  const same=structuredClone(files);same[2].entries['usr/base']=file('a');
  assert.equal(auditFileInventories(same,rows).passed,true);
  for(const entry of [file('b'),{...file('a'),uid:1000},{type:'symlink',mode:0o777,uid:0,gid:0,target:'somewhere'}]){
    const changed=structuredClone(files);changed[3].entries['usr/base']=entry;
    assert.throws(()=>auditFileInventories(changed,rows),/files conflict/);
  }
  const nested=structuredClone(files);nested[2].entries['usr/base/child']=file('a');
  assert.throws(()=>auditFileInventories(nested,rows),/Non-directory ancestor/);
  assert.throws(()=>auditFileInventories(files.slice(1),rows),/every component/);
  const wrong=structuredClone(files);wrong[0].digest='sha256:'+'f'.repeat(64);
  assert.throws(()=>auditFileInventories(wrong,rows),/mismatched/);
});

test('release lock cannot be emitted without the matching completed build and audit', () => {
  const rows=receipts(), audit=auditFileInventories(inventories(rows),rows);
  const set=buildReceipt({name:'set',version,sourceCommit,metadata:{'containerimage.digest':'sha256:'+'f'.repeat(64)}});
  const lock=releaseLock(rows,set,audit);
  assert.deepEqual(lock.set,{ref:'ghcr.io/teck-lab/teck-orca:1.2.3',digest:set.digest});
  assert.equal(lock.sourceCommit,sourceCommit);
  assert.match(lock.verification.identity,/release-kits\.yml@refs\/tags\/v1\.2\.3$/);
  assert.throws(()=>releaseLock(rows,set,null),/audit/);
  assert.throws(()=>releaseLock(rows,{...set,sourceCommit:'b'.repeat(40)},audit),/Set receipt/);
  assert.throws(()=>releaseLock(rows,set,{...audit,components:[]}),/audit/);
});

test('CLI emits a usable pinned set from Buildx receipt files without invoking Docker', t => {
  const root=fs.mkdtempSync(join(tmpdir(),'teck-kit-release-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  for(const row of receipts())fs.writeFileSync(join(root,row.name+'.json'),JSON.stringify(row));
  const output=join(root,'set','teck-orca.yaml');
  execFileSync(process.execPath,['scripts/kit-release.mjs','compose','--receipts',root,'--out',output],{windowsHide:true});
  assert.equal(YAML.parse(fs.readFileSync(output,'utf8')).kits.length,components.length);
});

test('workflow confines publication to manual tagged releases and preserves catalogue review', () => {
  const workflow=YAML.parse(fs.readFileSync(new URL('../.github/workflows/release-kits.yml',import.meta.url),'utf8'));
  assert.deepEqual(Object.keys(workflow.on),['workflow_dispatch']);
  assert.deepEqual(workflow.permissions,{contents:'read'});
  for(const job of Object.values(workflow.jobs))assert.notEqual(job.permissions?.contents,'write');
  assert.equal(workflow.jobs.components.permissions.packages,'write');
  assert.equal(workflow.jobs.components.permissions['id-token'],'write');
  assert.equal(workflow.defaults.run.shell,'bash','pipeline errors must propagate through the tar inventory pipe');
  const inventory=workflow.jobs.components.steps.find(s=>s.run?.includes('kit-release-files.py')).run;
  assert.match(inventory,/docker buildx build .*--output type=tar,dest=-/);
  assert.doesNotMatch(inventory,/container=|docker export "|docker create --/);
  const steps=workflow.jobs.compose.steps;
  const audit=steps.findIndex(s=>s.run?.includes('kit-release.mjs audit'));
  const publish=steps.findIndex(s=>s.name==='Build and publish composed workload');
  assert.ok(audit>=0&&audit<publish);
  assert.ok(steps.some(s=>s.run?.includes('package-portable-plugin.mjs')&&s.run.includes('--kit-release')));
  assert.ok(!steps.some(s=>s.run?.includes('git push')));
});
