import assert from 'node:assert/strict';import {readFileSync,writeFileSync} from 'node:fs';import {join} from 'node:path';import {request} from 'node:https';
const config=JSON.parse(readFileSync('/etc/teck-orca/kubernetes.json')),runtime='/usr/local/lib/teck-kubernetes/'+config.assetDigest;
assert.ok(config.projectId.startsWith('isolated-kubernetes-'),'Refusing a real project');
const {targetIdentity}=await import(runtime+'/worktree.mjs');
const identity=targetIdentity({projectId:config.projectId,worktreeId:'synthetic-repo::'+(process.argv[3]??'/tmp/teck-monorepo-source')});
const promotion=targetIdentity({projectId:config.projectId,worktreeId:'synthetic-repo::'+(process.argv[3]??'/tmp/teck-monorepo-source')},'promotion');
const {command}=await import(runtime+'/command.mjs');const {waitFor}=await import(runtime+'/deploy.mjs');const {projectClusterName}=await import(runtime+'/cluster.mjs');
const folder=join(config.root,projectClusterName(config.projectId)),path=folder+'/state.json',boot=readFileSync('/proc/sys/kernel/random/boot_id','utf8').trim();
if(process.argv[2]==='before')await waitFor('installed runtime ready before restart',()=>{const s=JSON.parse(readFileSync(path));return s.phase==='ready'&&s.readyBoot===boot&&s.runtimeRevision===config.assetDigest;},120_000);
if(process.argv[2]==='after')await waitFor('automatic guest startup reconciliation',()=>{const s=JSON.parse(readFileSync(path));if(s.phase==='failed')throw Error('Guest bootstrap failed; inspect retained bootstrap.log');return s.phase==='ready'&&s.readyBoot===boot&&s.runtimeRevision===config.assetDigest;},300_000);
const state=JSON.parse(readFileSync(path)),k=(args)=>command('kubectl',['--kubeconfig',folder+'/kubeconfig',...args]);
const uids={};for(const ns of [identity.namespace,promotion.namespace]){
 uids[ns]=(JSON.parse(await k(['get','namespace',ns,'-o','json']))).metadata.uid;
 uids[ns+'/application']=(JSON.parse(await k(['-n','argocd','get','application',ns,'-o','json']))).metadata.uid;
 uids[ns+'/secret']=(JSON.parse(await k(['-n',ns,'get','secret','gateway-public-auth','-o','json']))).metadata.uid;
}
async function read(hostname){return new Promise((resolve,reject)=>{const q=request({hostname,path:'/__local_probe',ca:readFileSync('/etc/ssl/certs/ca-certificates.crt'),agent:false,timeout:5000},r=>{let body='';r.on('data',c=>body+=c);r.on('end',()=>{try{assert.equal(r.statusCode,200);resolve(JSON.parse(body).version);}catch(e){reject(e);}});});q.on('error',reject);q.on('timeout',()=>q.destroy(Error('HTTPS timeout')));q.end();});}
await waitFor('worktree trusted HTTPS after restart',async()=>{try{return await read(identity.hostname)==='alpha-dirty'&&await read(promotion.hostname)==='alpha';}catch{return false;}},180_000);
const result={boot,nodes:state.nodes,uids,worktreeImage:JSON.parse(readFileSync(folder+'/worktrees/'+identity.hash+'/state.json')).release.images,trustedHttps:true};
if(process.argv[2]==='before')writeFileSync('/tmp/teck-restart-before.json',JSON.stringify(result));
else{const before=JSON.parse(readFileSync('/tmp/teck-restart-before.json'));assert.notEqual(before.boot,boot);assert.deepEqual(result.nodes,before.nodes);assert.deepEqual(result.uids,before.uids);assert.deepEqual(result.worktreeImage,before.worktreeImage);writeFileSync('/tmp/teck-restart-receipt.json',JSON.stringify({passed:true,automaticInteractiveStartup:true,identitiesRetained:true,...result}));}
console.log(JSON.stringify({phase:process.argv[2],boot,nodes:state.nodes.map(n=>n.id),identitiesVerified:Object.keys(uids).length,trustedHttps:true}));
