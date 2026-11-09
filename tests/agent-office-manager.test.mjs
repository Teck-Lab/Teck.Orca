import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createServer } from 'node:http';
import { createHmac } from 'node:crypto';
import { once } from 'node:events';
import { createOfficeManager, officeTunnelArgs, verifyOfficeBundle } from '../runtime/agent-office-manager.mjs';
import { configureOfficeGuest } from '../runtime/office-guest.mjs';

const project = { projectId: 'p', id: '347bd1b8-7ae4-46b8-bdd0-b6a193d165d6', name: 'teck-orca-ssh-bc02e0548944', title: 'Teck.Monorepo', state: 'running' };
test('transport exposes only validated guest and host loopback ports', () => {
  const args = officeTunnelArgs(project.name,4747);
  assert.deepEqual(args.slice(-4),['node','/usr/local/lib/teck-orca/office-forward.mjs','19474','4747']);
  assert.ok(!args.includes('-R'));
  assert.throws(()=>officeTunnelArgs('unowned',4747));
  assert.deepEqual(officeTunnelArgs(project.name,4747,28765).slice(-2),['28765','4747']);
  assert.throws(()=>officeTunnelArgs(project.name,4747,0));
  new Function(configureOfficeGuest);
});
test('only exactly owned running sandboxes get a tunnel; duplicate refreshes coalesce', async t => {
  const root=fs.mkdtempSync(join(tmpdir(),'teck-office-manager-')); t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  let starts=0,configured=0,tunnelCount=0,closed=0,configuredPort;
  const m=createOfficeManager({root,run:async()=>JSON.stringify([{...project,status:'running'}]),
    service:async()=>{starts++;return{port:4747,url:'http://127.0.0.1:4747',home:join(root,'server'),secret:'a'.repeat(64)}},
    input:async(_program,args,stdin)=>{configured++;const data=JSON.parse(stdin);assert.equal(data.config.sourceId,project.id);assert.ok(!args.join(' ').includes(data.config.token));configuredPort=Number(new URL(data.config.url).port);assert.ok(configuredPort>=20000&&configuredPort<60000);assert.ok(Buffer.from(data.entry,'base64').toString().includes('./agent-office.mjs'));assert.ok(data.mcpAssets['office-usage.mjs']);assert.ok(data.mcpAssets['office-mcp-server.mjs']);assert.ok(Buffer.byteLength(stdin)<262144);},
    spawnTunnel:(_name,_port,guestPort)=>{assert.equal(guestPort,configuredPort);tunnelCount++;const child=new EventEmitter();child.stderr={resume(){}};child.kill=()=>{closed++};return child;},
    checkTunnel:async(_project,_record,guestPort)=>{assert.equal(guestPort,configuredPort)},open:async()=>{} });
  await Promise.all([m.sync([project],{autoOpen:false}),m.sync([project],{autoOpen:false})]);
  assert.equal(starts,1);assert.equal(configured,1);assert.equal(tunnelCount,1);
  await m.sync([{...project,state:'stopped'}]);assert.equal(closed,1);m.dispose();
  const other=createOfficeManager({root,run:async()=>JSON.stringify([{...project,id:'substitute',status:'running'}]),service:async()=>{throw Error('Must not start')}});
  await other.sync([project]);other.dispose();assert.equal(starts,1);
});
test('failed service startup backs off and logs one actionable message',async t=>{
  const root=fs.mkdtempSync(join(tmpdir(),'teck-office-failure-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  let calls=0,time=1000;const logs=[];
  const m=createOfficeManager({root,now:()=>time,run:async()=>JSON.stringify([{...project,status:'running'}]),service:async()=>{calls++;throw Error('Local Agent Office unavailable')},log:s=>logs.push(s)});
  await m.sync([project]);await m.sync([project]);assert.equal(calls,1);
  time+=16_000;await m.sync([project]);assert.equal(calls,2);assert.equal(logs.length,1);m.dispose();
});
test('bundled distribution is from our fork and passes all asset hashes',()=>{
  const root=new URL('../runtime/agent-office/',import.meta.url);const bundle=verifyOfficeBundle(root.pathname.replace(/^\/([A-Za-z]:)/,'$1'));
  assert.equal(bundle.source,'https://github.com/Teck-Lab/agent-office');assert.ok(bundle.files['cli.js']);
});

test('a live SSH helper with a dead Office listener is replaced without restarting the sandbox',async t=>{
  const root=fs.mkdtempSync(join(tmpdir(),'teck-office-health-')),secret='c'.repeat(64);
  const http=createServer((req,res)=>{const challenge=new URL(req.url,'http://localhost').searchParams.get('challenge');res.setHeader('Content-Type','application/json');res.end(JSON.stringify({external:true,clients:1,proof:createHmac('sha256',secret).update('agentoffice:'+challenge).digest('hex')}));});
  const port=await new Promise(resolve=>{http.listen(0,'127.0.0.1',()=>resolve(http.address().port))});
  const home=join(root,'server');fs.mkdirSync(home);fs.writeFileSync(join(home,'office.json'),JSON.stringify({host:'127.0.0.1',port,url:`http://127.0.0.1:${port}`,secret}));
  let spawned=0,killed=0,configured=0,failExisting=false;const policies=[];
  const m=createOfficeManager({root,run:async(_program,args)=>{if(args[0]==='policy')policies.push(args);return JSON.stringify([{...project,status:'running'}])},
    service:async()=>({home,port,url:`http://127.0.0.1:${port}`,secret,clients:1}),input:async()=>{configured++},open:async()=>{},
    spawnTunnel:()=>{spawned++;const c=new EventEmitter();c.kill=()=>{killed++};return c},
    checkTunnel:async(_p,_r,_port,options)=>{if(options?.retry===false&&failExisting){failExisting=false;throw Error('Listener lost')}}});
  t.after(()=>{m.dispose();http.closeAllConnections();http.close();fs.rmSync(root,{recursive:true,force:true})});
  await m.sync([project]);failExisting=true;await m.sync([project]);await m.sync([project]);
  assert.equal(spawned,2);assert.equal(configured,2);assert.equal(killed,1);
  assert.ok(policies.every(a=>a.includes('--sandbox')&&a.includes(project.name)&&a.includes(`localhost:${port}`)));
  assert.deepEqual([...new Set(policies.map(a=>a.at(-1)))].sort(),['/api/ingest','/healthz']);
});

test('an explicit open works even when another viewer is connected; automatic refresh does not duplicate it',async t=>{
  const root=fs.mkdtempSync(join(tmpdir(),'teck-office-viewer-'));
  const secret='b'.repeat(64), opened=[];let tunnelCount=0;
  const server=createServer((req,res)=>{
    const challenge=new URL(req.url,'http://localhost').searchParams.get('challenge');
    res.setHeader('Content-Type','application/json');
    res.end(JSON.stringify({external:true,clients:1,proof:createHmac('sha256',secret).update('agentoffice:'+challenge).digest('hex')}));
  });
  server.listen(0,'127.0.0.1');await once(server,'listening');
  t.after(()=>{server.closeAllConnections();server.close();fs.rmSync(root,{recursive:true,force:true})});
  const home=join(root,'server'),port=server.address().port,url=`http://127.0.0.1:${port}`;
  fs.mkdirSync(home);fs.writeFileSync(join(home,'office.json'),JSON.stringify({host:'127.0.0.1',port,url,secret}));
  const m=createOfficeManager({root,run:async()=>JSON.stringify([{...project,status:'running'}]),
    service:async()=>({home,port,url,secret,clients:1}),input:async()=>{},checkTunnel:async()=>{},
    spawnTunnel:()=>{tunnelCount++;const c=new EventEmitter();c.kill=()=>{};return c},
    open:async value=>opened.push(value)});
  t.after(()=>m.dispose());
  await m.sync([project]);assert.deepEqual(opened,[]);
  await m.open([project],project.id);assert.deepEqual(opened,[url]);
  await m.open([project],project.id);assert.deepEqual(opened,[url,url]);
  await m.sync([project]);assert.equal(opened.length,2);assert.equal(tunnelCount,1);
});
