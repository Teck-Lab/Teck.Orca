import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { validationPlan, validationReceipt, validationSet, smokeDockerfile, main } from '../scripts/kit-validation.mjs';
import { components } from '../scripts/kit-release.mjs';
import * as YAML from '../runtime/kubernetes/vendor/yaml/dist/index.js';

const plan=architecture=>validationPlan({architecture,sourceCommit:'a'.repeat(40),run:'123-1'});
function fixture(architecture='amd64') {
  const p=plan(architecture);
  const receipts=components.map((name,i)=>validationReceipt(p,name,{'containerimage.digest':'sha256:'+String(i+1).repeat(64)}));
  const inventories=receipts.map(r=>({name:r.name,platform:r.platform,digest:r.digest,entries:{[`opt/${r.name}`]:{type:'file',mode:0o644,uid:0,gid:0,digest:'sha256:'+'e'.repeat(64)}}}));
  return {p,receipts,inventories};
}
test('PR composition pins every actual local digest and cannot redirect publication',()=>{
  for(const architecture of ['amd64','arm64']) {
    const {p,receipts,inventories}=fixture(architecture);
    const {descriptor,audit}=validationSet(p,receipts,inventories);
    const yaml=YAML.parse(descriptor);assert.equal(yaml.kind,'set');assert.equal(yaml.kits.length,9);assert.equal(audit.inventories,9);
    assert.ok(yaml.kits.every(row=>row.ref.startsWith('localhost:5000/')&&row.digest.startsWith('sha256:')));
    assert.throws(()=>validationSet({...p,registry:'ghcr.io/teck-lab'},receipts,inventories),/loopback/);
    assert.throws(()=>validationSet(p,[...receipts.slice(1),receipts[1]],inventories),/digest|receipt/);
    assert.throws(()=>validationSet(p,receipts,inventories.map((r,i)=>i? r:{...r,digest:'sha256:'+'f'.repeat(64)})),/filesystem/);
  }
  assert.throws(()=>validationPlan({architecture:'x64',sourceCommit:'main',run:'1'}),/Invalid/);
  assert.throws(()=>validationReceipt(plan('amd64'),'base',{}),/real validation digest/);
});
test('PR file audit rejects actual layer collisions and smoke remains non-root and offline',()=>{
  const {p,receipts,inventories}=fixture();
  inventories[1].entries['opt/base']={...inventories[0].entries['opt/base'],digest:'sha256:'+'f'.repeat(64)};
  assert.throws(()=>validationSet(p,receipts,inventories),/Kit files conflict/);
  const set=validationReceipt(p,'set',{'containerimage.digest':'sha256:'+'f'.repeat(64)});
  const dockerfile=smokeDockerfile(p,set);
  assert.match(dockerfile,/FROM localhost:5000\/.*@sha256:/);
  assert.match(dockerfile,/USER 1000:1000/);assert.equal((dockerfile.match(/RUN --network=none/g)||[]).length,2);
  assert.match(dockerfile,/browser-smoke/);assert.match(dockerfile,/FROM scratch/);
  assert.throws(()=>smokeDockerfile(p,{...set,ref:'ghcr.io/elsewhere:latest'}),/receipt/);
});
test('validation CLI stages canonical sources then composes real receipts without a production lock',t=>{
  const root=fs.mkdtempSync(join(tmpdir(),'teck-pr-validation-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const p=main(['prepare','--root',root,'--architecture','arm64','--commit','a'.repeat(40),'--run','123-1']);
  for(const [i,name] of components.entries()) {
    fs.writeFileSync(join(root,'metadata',name+'.json'),JSON.stringify({'containerimage.digest':'sha256:'+String(i+1).repeat(64)}));
    const row=main(['record','--root',root,'--name',name]);
    fs.writeFileSync(join(root,'inventories',name+'.json'),JSON.stringify({name,platform:p.platform,digest:row.digest,entries:{}}));
  }
  assert.equal(main(['compose','--root',root]).passed,true);
  assert.equal(fs.existsSync(join(root,'kit-release.json')),false);
  assert.equal(YAML.parse(fs.readFileSync(join(root,'set/validation.yaml'),'utf8')).kits.length,9);
  assert.equal(fs.existsSync(join(root,'smoke/tools.mjs')),true);
  assert.throws(()=>main(['prepare','--root',root,'--architecture','arm64','--commit','a'.repeat(40),'--run','123-1']),/empty/);
});
test('PR builds use native supported runners and loopback registry with read-only permissions',()=>{
  const workflow=YAML.parse(fs.readFileSync(new URL('../.github/workflows/validate-kits.yml',import.meta.url),'utf8'));
  assert.ok(Object.hasOwn(workflow.on,'pull_request'));assert.ok(!Object.hasOwn(workflow.on,'pull_request_target'));
  assert.deepEqual(workflow.permissions,{contents:'read'});
  assert.deepEqual(workflow.jobs.build.strategy.matrix.include,[{runner:'ubuntu-24.04',architecture:'amd64'},{runner:'ubuntu-24.04-arm',architecture:'arm64'}]);
  assert.deepEqual(workflow.jobs.build.services.registry.ports,['127.0.0.1:5000:5000']);
  const steps=workflow.jobs.build.steps,text=steps.map(s=>s.run??'').join('\n');
  assert.match(text,/--file "\$root\/set\/validation.yaml"/);
  assert.match(text,/--output "type=local,dest=\$root\/smoke-result"/);
  assert.doesNotMatch(text,/ghcr.io|cosign|GITHUB_TOKEN|sbx create|docker system prune/);
  assert.ok(!steps.some(s=>s.uses?.includes('login-action')||s.uses?.includes('setup-qemu')));
  assert.match(text,/bash scripts\/kit-ci-disk.sh/);
  assert.equal(workflow.jobs.build.services.registry.env.REGISTRY_LOG_LEVEL,'warn');
  assert.match(text,/docker buildx prune --builder "\$BUILDER" --all --force/);
});

test('both publishing jobs use the same guarded hosted-runner disk preflight before installing Node',()=>{
  const workflow=YAML.parse(fs.readFileSync(new URL('../.github/workflows/release-kits.yml',import.meta.url),'utf8'));
  for(const job of ['components','compose']) {
    const steps=workflow.jobs[job].steps;
    const disk=steps.findIndex(s=>s.run==='bash scripts/kit-ci-disk.sh');
    assert.ok(disk>0&&disk<steps.findIndex(s=>s.uses?.startsWith('actions/setup-node@')));
  }
  const script=fs.readFileSync(new URL('../scripts/kit-ci-disk.sh',import.meta.url),'utf8');
  for(const value of ['GITHUB_ACTIONS','RUNNER_ENVIRONMENT','github-hosted','RUNNER_OS','34359738368'])assert.ok(script.includes(value));
  assert.ok(script.indexOf('exit 1')<script.indexOf('sudo rm -rf --'));
  assert.match(script,/sudo rm -rf -- \/usr\/share\/dotnet \/usr\/local\/lib\/android \/opt\/ghc \/usr\/local\/\.ghcup \/opt\/hostedtoolcache\n/);
});
