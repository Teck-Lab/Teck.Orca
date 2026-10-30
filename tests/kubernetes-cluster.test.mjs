import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mkdtempSync,readFileSync,rmSync,statfsSync} from 'node:fs';
import {createServer} from 'node:net';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {ensureProjectCluster,projectClusterName,prepareDocker} from '../runtime/kubernetes/cluster.mjs';

const image='kindest/node:v1.36.4@sha256:099e049362a1526b2db71494e1947aae99bd16290d7c895f2b7ea312e3cbfaed';
const config={kind:'Cluster',apiVersion:'kind.x-k8s.io/v1alpha4',nodes:[{role:'control-plane'},{role:'worker'}]};
function fixture(t){
  const root=mkdtempSync(join(tmpdir(),'teck-kind-test-'));t.after(()=>rmSync(root,{recursive:true,force:true}));
  const nodes=[],calls=[];let bootstraps=0;
  const projectId='project-a',name=projectClusterName(projectId);
  const run=async(program,args)=>{
    calls.push({program,args});
    if(program==='docker'&&args[0]==='ps')return nodes.map(n=>n.Id).join('\n');
    if(program==='docker'&&args[0]==='inspect')return JSON.stringify(nodes.filter(n=>args.includes(n.Id)));
    if(program==='docker'&&args[0]==='start'){for(const n of nodes)if(args.includes(n.Id))n.State.Running=true;return '';}
    if(program==='kind'&&args[0]==='create'){
      for(const role of ['control-plane','worker'])nodes.push({Id:(role==='worker'?'b':'a').repeat(64),Name:`/${name}-${role}`,Config:{Image:image,Labels:{'io.x-k8s.kind.cluster':name,'io.x-k8s.kind.role':role}},State:{Running:true}});
    }
    return '';
  };
  const options={projectId,profile:'workspace',root,config,nodeImage:image,revision:'gitops-fixture-sha',run,prepare:async()=>{},device:async()=>{},bootstrap:async()=>{bootstraps++;}};
  return {root,nodes,calls,options,name,get bootstraps(){return bootstraps;}};
}
test('parallel first use creates one project cluster and never changes default kubeconfig',async t=>{
  const f=fixture(t),[a,b]=await Promise.all([ensureProjectCluster(f.options),ensureProjectCluster(f.options)]);
  assert.deepEqual(a.nodes,b.nodes);assert.equal(a.phase,'ready');
  assert.equal(f.calls.filter(c=>c.program==='kind'&&c.args[0]==='create').length,1);
  const creation=f.calls.find(c=>c.program==='kind'&&c.args[0]==='create');
  assert.equal(creation.args[creation.args.indexOf('--kubeconfig')+1],join(f.root,f.name,'kubeconfig'));
  assert.equal(f.calls.some(c=>['delete','rm','prune'].includes(c.args[0])),false);
});
test('resume starts only recorded node IDs and preserves cluster identity',async t=>{
  const f=fixture(t),first=await ensureProjectCluster(f.options);for(const n of f.nodes)n.State.Running=false;
  f.calls.length=0;const resumed=await ensureProjectCluster(f.options);
  assert.deepEqual(resumed.nodes,first.nodes);
  assert.equal(f.calls.filter(c=>c.program==='kind'&&c.args[0]==='create').length,0);
  assert.deepEqual(f.calls.find(c=>c.args[0]==='start').args.slice(1).sort(),first.nodes.map(n=>n.id).sort());
});

test('cold API authorization/cache startup failures retry without recreating nodes',async t=>{
  const f=fixture(t);let attempts=0;
  const run=async(program,args)=>{
    if(program==='kubectl'&&args.includes('nodes')&&args.includes('wait')&&++attempts===1)throw Error('nodes is forbidden during API startup');
    return f.options.run(program,args);
  };
  const state=await ensureProjectCluster({...f.options,run});
  assert.equal(state.phase,'ready');assert.equal(attempts,2);
  assert.equal(f.calls.filter(c=>c.program==='kind'&&c.args[0]==='create').length,1);
});
test('foreign or replaced nodes cause no start, delete or adoption',async t=>{
  const f=fixture(t);await ensureProjectCluster(f.options);f.nodes[0].Id='f'.repeat(64);f.calls.length=0;
  await assert.rejects(ensureProjectCluster(f.options),/identity/);
  assert.equal(f.calls.some(c=>['start','create','delete','rm','prune'].includes(c.args[0])),false);
  rmSync(join(f.root,f.name,'state.json'));
  await assert.rejects(ensureProjectCluster(f.options),/unowned/);
});
test('failed platform bootstrap is retryable without recreating nodes',async t=>{
  const f=fixture(t);
  await assert.rejects(ensureProjectCluster({...f.options,bootstrap:async()=>{throw Error('Controller unavailable');}}),/Controller unavailable/);
  const state=JSON.parse(readFileSync(join(f.root,f.name,'state.json')));assert.equal(state.phase,'failed');assert.equal(state.nodes.length,2);
  const result=await ensureProjectCluster(f.options);assert.equal(result.phase,'ready');
  assert.equal(f.calls.filter(c=>c.program==='kind'&&c.args[0]==='create').length,1);
});
test('profile and pin changes cannot silently replace or upgrade a cluster',async t=>{
  const f=fixture(t);await ensureProjectCluster(f.options);f.calls.length=0;
  await assert.rejects(ensureProjectCluster({...f.options,revision:'different-sha'}),/configuration/);
  await assert.rejects(ensureProjectCluster({...f.options,profile:'full'}),/external/);
  assert.equal(f.calls.length,0);
});

test('an occupied API port fails preflight before leaving an interrupted cluster record',async t=>{
  const f=fixture(t),disk=statfsSync(f.root);
  if(disk.bavail*disk.bsize<8*1024**3){t.skip('Preflight disk minimum exceeds available test storage');return;}
  const server=createServer();await new Promise(resolve=>server.listen({host:'127.0.0.1',port:0},resolve));
  t.after(()=>new Promise(resolve=>server.close(resolve)));
  const port=server.address().port;
  const run=async(program,args)=>{assert.ok(program==='docker'||program==='df');return program==='df'?'Avail\n20000000000\n':'30.0.0';};
  await assert.rejects(prepareDocker({folder:f.root,run,config:{...config,networking:{apiServerPort:port}}}),new RegExp('loopback port '+port));
  assert.throws(()=>readFileSync(join(f.root,f.name,'state.json')),/ENOENT/);
});
