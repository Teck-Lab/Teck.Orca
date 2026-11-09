import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {startOfficeForwarder} from '../runtime/office-forward.mjs';

async function listen(server){server.listen(0,'127.0.0.1');await once(server,'listening');return server.address().port;}
test('Docker host-service relay accepts fresh and parallel producers, scopes paths and retains backend authentication',async t=>{
  const seen=[];
  const proxy=createServer(async(req,res)=>{
    const chunks=[];for await(const b of req)chunks.push(b);
    seen.push({url:req.url,auth:req.headers.authorization,host:req.headers.host,proxyAuth:req.headers['proxy-authorization'],body:Buffer.concat(chunks).toString()});
    res.setHeader('Content-Type','application/json');
    res.statusCode=req.method==='GET'?200:req.headers.authorization==='Bearer office-test'?202:401;
    res.end(JSON.stringify({accepted:res.statusCode===202}));
  });
  const proxyPort=await listen(proxy),reserve=createServer();const port=await listen(reserve);await new Promise(r=>reserve.close(r));
  const relay=await startOfficeForwarder({port,hostPort:4747,env:{HTTP_PROXY:`http://proxy-user:proxy-pass@127.0.0.1:${proxyPort}`}});
  t.after(()=>{relay.close();proxy.closeAllConnections();proxy.close();});
  const url=`http://127.0.0.1:${port}`,send=()=>fetch(url+'/api/ingest',{method:'POST',headers:{Authorization:'Bearer office-test','Content-Type':'application/json',Connection:'close'},body:'{"events":[]}'});
  for(let i=0;i<4;i++){const r=await send();assert.equal(r.status,202);await r.json();}
  const parallel=await Promise.all(Array.from({length:5},send));assert.ok(parallel.every(r=>r.status===202));await Promise.all(parallel.map(r=>r.json()));
  assert.ok(seen.every(r=>r.url==='http://host.docker.internal:4747/api/ingest'&&r.host==='host.docker.internal:4747'));
  assert.ok(seen.every(r=>r.proxyAuth==='Basic '+Buffer.from('proxy-user:proxy-pass').toString('base64')));
  const unauthorized=await fetch(url+'/api/ingest',{method:'POST',body:'{}'});assert.equal(unauthorized.status,401);await unauthorized.text();
  const health=await fetch(url+'/healthz?challenge='+'a'.repeat(32));assert.equal(health.status,200);await health.text();
  const before=seen.length;
  for(const path of ['/api/control','/api/ingest?target=http://other','http://elsewhere/']){const r=await fetch(url+'/'+path.replace(/^\//,''));assert.equal(r.status,404);await r.text();}
  const browser=await fetch(url+'/api/ingest',{method:'POST',headers:{Origin:'https://elsewhere'},body:'{}'});assert.equal(browser.status,403);await browser.text();
  const large=await fetch(url+'/api/ingest',{method:'POST',body:'x'.repeat(65537)});assert.equal(large.status,413);await large.text();
  assert.equal(seen.length,before,'rejected requests never reach another host service');
});

test('relay requires a sandbox proxy and refuses public listeners and privileged ports',async()=>{
  await assert.rejects(()=>startOfficeForwarder({port:45000,hostPort:4747,env:{}}));
  await assert.rejects(()=>startOfficeForwarder({port:80,hostPort:4747,env:{HTTP_PROXY:'http://127.0.0.1:3128'}}));
  await assert.rejects(()=>startOfficeForwarder({port:45000,hostPort:4747,host:'0.0.0.0',env:{HTTP_PROXY:'http://127.0.0.1:3128'}}));
});
