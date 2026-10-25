import assert from 'node:assert/strict';import fs from 'node:fs';import {join} from 'node:path';
const cfg=JSON.parse(fs.readFileSync('/etc/teck-orca/kubernetes.json'));assert.ok(cfg.projectId.startsWith('isolated-kubernetes-'));const runtime='/usr/local/lib/teck-kubernetes/'+cfg.assetDigest;
const {ensureConfiguredProject}=await import(runtime+'/main.mjs'),{command}=await import(runtime+'/command.mjs'),{deployWorktree,waitResources,waitFor}=await import(runtime+'/deploy.mjs'),{cleanupWorktree}=await import(runtime+'/cleanup.mjs'),{loadBundle}=await import(runtime+'/bundle.mjs');
const cluster=await ensureConfiguredProject(cfg),bundle=loadBundle(runtime+'/gitops'),k=(args,o)=>command('kubectl',['--kubeconfig',cluster.kubeconfig,...args],o);
const context=root=>({projectId:cfg.projectId,root,worktreeId:'synthetic-repo::'+root});
const write=(p,s)=>{fs.mkdirSync(p.slice(0,p.lastIndexOf('/')),{recursive:true});fs.writeFileSync(p,s);};const json=(p,v)=>write(p,JSON.stringify(v,null,2)+'\n');
async function source(root,version){
 write(root+'/version',version+'\n');write(root+'/Dockerfile','FROM postgres:18.1-alpine\nCOPY app.sh version /app/\nENTRYPOINT ["/bin/sh", "/app/app.sh"]\n');
 write(root+'/app.sh',`set -eu
version=$(cat /app/version)
psql -v ON_ERROR_STOP=1 -c "CREATE TABLE IF NOT EXISTS local_probe(version text PRIMARY KEY); INSERT INTO local_probe VALUES ('$version') ON CONFLICT DO NOTHING;"
while :; do
  psql -v ON_ERROR_STOP=1 -Atc "SELECT version FROM local_probe WHERE version='$version'" | grep -qx "$version"
  printf '%s\\n' "$version" > /tmp/ready
  sleep 2
done
`);
 const env=[['PGHOST','host'],['PGDATABASE','dbname'],['PGUSER','username'],['PGPASSWORD','password']].map(([name,key])=>({name,valueFrom:{secretKeyRef:{name:'db-app',key}}}));
 const resources=[{apiVersion:'postgresql.cnpg.io/v1',kind:'Cluster',metadata:{name:'db',annotations:{'teck.orca.io/apply-wave':'0'}},spec:{instances:1,imageName:'ghcr.io/cloudnative-pg/postgresql:18.1',bootstrap:{initdb:{database:'app',owner:'app'}},storage:{size:'1Gi'},resources:{requests:{cpu:'50m',memory:'256Mi'},limits:{memory:'512Mi'}}}},{apiVersion:'apps/v1',kind:'Deployment',metadata:{name:'db-client',annotations:{'teck.orca.io/apply-wave':'1'}},spec:{replicas:1,selector:{matchLabels:{app:'db-client'}},template:{metadata:{labels:{app:'db-client'}},spec:{containers:[{name:'app',image:'ghcr.io/teck-lab/cnpg-probe',env,readinessProbe:{exec:{command:['sh','-ec','test "$(cat /tmp/ready)" = "$(cat /app/version)"']},periodSeconds:2},resources:{requests:{cpu:'10m',memory:'32Mi'},limits:{memory:'128Mi'}}}]}}}}];
 json(root+'/deployment/local/resources.json',{apiVersion:'v1',kind:'List',items:resources});json(root+'/deployment/local/kustomization.yaml',{apiVersion:'kustomize.config.k8s.io/v1beta1',kind:'Kustomization',resources:['resources.json']});json(root+'/deployment/local/builds.json',{schemaVersion:1,addons:['cnpg'],images:[{name:'app',image:'ghcr.io/teck-lab/cnpg-probe',context:'.',dockerfile:'Dockerfile',args:{}}]});
 await command('git',['-C',root,'init','--initial-branch=main']);await command('git',['-C',root,'add','.']);if((await command('git',['-C',root,'status','--porcelain'])).trim())await command('git',['-C',root,'-c','commit.gpgsign=false','-c','core.hooksPath=/dev/null','-c','user.name=Local KIND Test','-c','user.email=fixture@agents.invalid','commit','-qm','test: local fixture'],{env:{GIT_CONFIG_GLOBAL:'/dev/null',GIT_CONFIG_SYSTEM:'/dev/null'}});
}
// Prove the untouched base has no delivery controller, add-on or registry.
if(!fs.existsSync('/tmp/teck-kind-base-receipt.json')){const ns=JSON.parse(await k(['get','namespaces','-o','json'])).items.map(r=>r.metadata.name);assert.ok(!ns.some(n=>['argocd','kargo','cnpg-system','teck-local-sources','kgateway-system'].includes(n)));assert.equal((await command('docker',['ps','-a','--format','{{.Names}}'])).trim().split('\n').length,1);write('/tmp/teck-kind-base-receipt.json',JSON.stringify({projectId:cfg.projectId,nodes:cluster.nodes,bare:true}));console.log('PASS bare KIND base: no add-ons, registry or delivery services');}
await source('/tmp/kind-probe-a','alpha');await source('/tmp/kind-probe-b','beta');
const results=await Promise.allSettled(['/tmp/kind-probe-a','/tmp/kind-probe-b'].map(root=>deployWorktree({context:context(root),cluster,bundle,run:command})));for(const r of results)if(r.status==='rejected')throw r.reason;const [a,b]=results.map(r=>r.value);
async function read(ns){return (await k(['-n',ns,'exec','deployment/db-client','--','cat','/tmp/ready'])).trim();}
assert.equal(await read(a.namespace),'alpha');assert.equal(await read(b.namespace),'beta');console.log('PASS two independent CNPG databases and locally loaded applications');
write('/tmp/kind-probe-a/version','alpha-dirty\n');const dirty=await deployWorktree({context:context('/tmp/kind-probe-a'),cluster,bundle,run:command});assert.notEqual(dirty.release.images[0],a.release.images[0]);assert.equal(await read(a.namespace),'alpha-dirty');assert.equal(await read(b.namespace),'beta');
const state=JSON.parse(fs.readFileSync(join(cluster.kubeconfig,'../worktrees',a.namespace.slice(8),'state.json'))); // use label-independent lookup below
const labels={'teck.orca.io/project':cluster.name.slice(11),'teck.orca.io/worktree':a.namespace.slice(8)};
const bad={apiVersion:'batch/v1',kind:'Job',metadata:{name:'intentional-failure',namespace:a.namespace,labels},spec:{backoffLimit:0,template:{spec:{restartPolicy:'Never',containers:[{name:'test',image:dirty.release.images[0],imagePullPolicy:'IfNotPresent',env:[['PGHOST','host'],['PGDATABASE','dbname'],['PGUSER','username'],['PGPASSWORD','password']].map(([name,key])=>({name,valueFrom:{secretKeyRef:{name:'db-app',key}}})),command:['sh','-ec','psql -v ON_ERROR_STOP=1 -c "SELECT * FROM deliberately_missing_table"']}]}}}};await k(['create','-f','-'],{input:JSON.stringify(bad)});await assert.rejects(waitResources({manifests:[bad],k}),/Job.*failed/);console.log('PASS real failed test Job is rejected');
await cleanupWorktree({context:context('/tmp/kind-probe-b'),cluster,run:command});assert.equal(await read(a.namespace),'alpha-dirty');
const db=JSON.parse(await k(['-n',a.namespace,'get','cluster.postgresql.cnpg.io','db','-o','json'])),secret=JSON.parse(await k(['-n',a.namespace,'get','secret','db-app','-o','json']));
const receipt={passed:true,bareBase:true,cnpgChart:'0.28.0',kubernetes:cluster.nodeImage,nodes:cluster.nodes,namespace:a.namespace,namespaceUid:state.namespaceUid,dbUid:db.metadata.uid,secretUid:secret.metadata.uid,release:dirty.release,version:'alpha-dirty',otherWorktreeCleaned:true,failedTestRejected:true};write('/tmp/teck-kind-direct-receipt.json',JSON.stringify(receipt,null,2));console.log(JSON.stringify(receipt));
