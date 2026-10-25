import assert from 'node:assert/strict';import fs from 'node:fs';
const cfg=JSON.parse(fs.readFileSync('/etc/teck-orca/kubernetes.json'));assert.ok(cfg.projectId.startsWith('isolated-kubernetes-'));const runtime='/usr/local/lib/teck-kubernetes/'+cfg.assetDigest,{command}=await import(runtime+'/command.mjs'),{waitFor}=await import(runtime+'/deploy.mjs'),{projectClusterName}=await import(runtime+'/cluster.mjs'),folder=cfg.root+'/'+projectClusterName(cfg.projectId),before=JSON.parse(fs.readFileSync('/tmp/teck-kind-direct-receipt.json')),boot=fs.readFileSync('/proc/sys/kernel/random/boot_id','utf8').trim(),k=a=>command('kubectl',['--kubeconfig',folder+'/kubeconfig',...a]);
if(process.argv[2]==='before'){
 await k(['-n',before.namespace,'exec','deployment/db-client','--','psql','-v','ON_ERROR_STOP=1','-c',"INSERT INTO local_probe VALUES ('durable-only') ON CONFLICT DO NOTHING"]);
 fs.writeFileSync('/tmp/teck-kind-restart-before.json',JSON.stringify({boot,...before}));
}else{
 const original=JSON.parse(fs.readFileSync('/tmp/teck-kind-restart-before.json'));assert.notEqual(boot,original.boot);
 await waitFor('automatic startup',()=>{const s=JSON.parse(fs.readFileSync(folder+'/state.json'));if(s.phase==='failed')throw Error('Startup failed');return s.phase==='ready'&&s.readyBoot===boot&&s.runtimeRevision===cfg.assetDigest;},300000);
 const state=JSON.parse(fs.readFileSync(folder+'/state.json'));assert.deepEqual(state.nodes,original.nodes);
 await k(['-n',before.namespace,'wait','cluster.postgresql.cnpg.io/db','--for=condition=Ready','--timeout=180s']);
 // Kubernetes can briefly retain pre-boot readiness status; probe the real app too.
 await waitFor('actual SQL application readiness',async()=>{try{return (await k(['-n',before.namespace,'exec','deployment/db-client','--','cat','/tmp/ready'])).trim()==='alpha-dirty';}catch{return false;}},180000);
 await k(['-n',before.namespace,'rollout','status','deployment/db-client','--timeout=180s']);
 for(const [kind,name,uid] of [['namespace',before.namespace,before.namespaceUid],['cluster.postgresql.cnpg.io','db',before.dbUid],['secret','db-app',before.secretUid]]){const r=JSON.parse(await k([...(kind==='namespace'?[]:['-n',before.namespace]),'get',kind,name,'-o','json']));assert.equal(r.metadata.uid,uid);}
 assert.equal((await k(['-n',before.namespace,'exec','deployment/db-client','--','psql','-Atc',"SELECT count(*) FROM local_probe WHERE version='durable-only'"])).trim(),'1');
 const receipt={passed:true,automaticInteractiveStartup:true,nodeAndResourceIdentitiesRetained:true,persistentDatabaseSentinel:true,version:'alpha-dirty',nodes:state.nodes};fs.writeFileSync('/tmp/teck-kind-restart-receipt.json',JSON.stringify(receipt,null,2));console.log(JSON.stringify(receipt));
}
