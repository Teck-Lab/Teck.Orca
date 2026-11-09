import fs from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { kitNames, stageKitSources } from './kit-source.mjs';
import { auditFileCollisions } from './kit-release.mjs';

const repository = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const registry = 'localhost:5000/teck-kit-validation';
const digestPattern = /^sha256:[a-f0-9]{64}$/;

export function validationPlan({ architecture, sourceCommit, run }) {
  if (!['amd64','arm64'].includes(architecture) || !/^[a-f0-9]{40}$/.test(sourceCommit ?? '') || !/^\d+(?:-\d+)?$/.test(run ?? '')) throw Error('Invalid validation architecture, commit or run');
  const tag = `${sourceCommit.slice(0,12)}-${run}-${architecture}`;
  return { schemaVersion:1, purpose:'validation-only', architecture, platform:`linux/${architecture}`, sourceCommit, run, tag, registry, components:kitNames };
}
function checkPlan(plan) {
  if (JSON.stringify(plan) !== JSON.stringify(validationPlan(plan))) throw Error('Unexpected validation plan; only the loopback registry is permitted');
  return plan;
}
export function validationReceipt(plan, name, metadata) {
  checkPlan(plan);
  if (!kitNames.includes(name) && name !== 'set') throw Error('Unknown validation component');
  const digest=metadata?.['containerimage.digest'];
  if (!digestPattern.test(digest ?? '')) throw Error('Buildx must supply the real validation digest');
  return {schemaVersion:1,purpose:'validation-only',name,sourceCommit:plan.sourceCommit,platform:plan.platform,ref:`${registry}/${name}:${plan.tag}`,digest};
}
function checkReceipt(plan, receipt, name) {
  const expected=validationReceipt(plan,name,{'containerimage.digest':receipt?.digest});
  if (JSON.stringify(receipt)!==JSON.stringify(expected)) throw Error('Mismatched validation receipt');
  return receipt;
}
export function validationSet(plan, receipts, inventories) {
  checkPlan(plan);
  if (receipts.length!==kitNames.length || inventories.length!==kitNames.length) throw Error('Validation requires every component and inventory');
  const ordered=kitNames.map(name=>checkReceipt(plan,receipts.find(row=>row.name===name),name));
  for(const row of inventories) {
    const receipt=ordered.find(item=>item.name===row.name);
    if (!receipt || row.platform!==plan.platform || row.digest!==receipt.digest) throw Error('Mismatched validation filesystem');
  }
  const audit={schemaVersion:1,purpose:'validation-only',sourceCommit:plan.sourceCommit,platform:plan.platform,...auditFileCollisions(inventories)};
  const descriptor='# syntax=docker/sandbox-kit:3\n'+JSON.stringify({schemaVersion:'3',kind:'set',displayName:'Teck PR validation only',kits:ordered.map(({ref,digest})=>({ref,digest}))},null,2)+'\n';
  return {audit,descriptor};
}
export function smokeDockerfile(plan, receipt) {
  checkReceipt(plan,receipt,'set');
  return `FROM ${receipt.ref}@${receipt.digest} AS smoke\nUSER root\nCOPY --chown=1000:1000 smoke/ /opt/teck-validation/\nUSER 1000:1000\nENV HOME=/home/agent TECK_EXPECT_ARCH=${plan.architecture==='amd64'?'x64':'arm64'}\nRUN --network=none node /opt/teck-validation/tools.mjs\nRUN --network=none node /opt/teck-validation/browser-smoke.mjs\nFROM scratch\nCOPY --from=smoke /tmp/teck-kit-validation/report.json /report.json\n`;
}
const read=path=>JSON.parse(fs.readFileSync(path,'utf8'));
const write=(path,value)=>{fs.mkdirSync(dirname(path),{recursive:true});fs.writeFileSync(path,typeof value==='string'?value:JSON.stringify(value,null,2)+'\n');};
export function main(args=process.argv.slice(2)) {
  const [command,...rest]=args,options={};
  for(let i=0;i<rest.length;i+=2){if(!/^--[a-z-]+$/.test(rest[i])||!rest[i+1]||rest[i+1].startsWith('--')||Object.hasOwn(options,rest[i].slice(2)))throw Error('Use unique --name value arguments');options[rest[i].slice(2)]=rest[i+1];}
  if(!options.root)throw Error('--root is required');
  const root=resolve(options.root);
  if(command==='prepare') {
    const plan=validationPlan({architecture:options.architecture,sourceCommit:options.commit,run:options.run});
    if(fs.existsSync(root)&&fs.readdirSync(root).length)throw Error('Validation output must be empty');
    stageKitSources({source:repository,destination:join(root,'contexts')});
    write(join(root,'plan.json'),plan);
    for(const folder of ['metadata','receipts','inventories','set','smoke'])fs.mkdirSync(join(root,folder),{recursive:true});
    for(const [source,destination] of [['scripts/kit-validation-tools.mjs','tools.mjs'],['runtime/kits/workload/devtools.json','devtools.json'],['runtime/kits/workload/browser-smoke.mjs','browser-smoke.mjs']])fs.copyFileSync(join(repository,source),join(root,'smoke',destination));
    return plan;
  }
  const plan=checkPlan(read(join(root,'plan.json')));
  if(command==='record') {
    const receipt=validationReceipt(plan,options.name,read(join(root,'metadata',`${options.name}.json`)));
    write(join(root,'receipts',`${options.name}.json`),receipt);return receipt;
  }
  if(command==='compose') {
    const {audit,descriptor}=validationSet(plan,kitNames.map(name=>read(join(root,'receipts',`${name}.json`))),kitNames.map(name=>read(join(root,'inventories',`${name}.json`))));
    write(join(root,'filesystem-audit.json'),audit);write(join(root,'set','validation.yaml'),descriptor);return audit;
  }
  if(command==='smoke') {const dockerfile=smokeDockerfile(plan,read(join(root,'receipts/set.json')));write(join(root,'smoke.dockerfile'),dockerfile);return {dockerfile:join(root,'smoke.dockerfile')};}
  throw Error('Expected prepare, record, compose or smoke');
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))console.log(JSON.stringify(main()));
