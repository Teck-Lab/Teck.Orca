// Guest loopback endpoint for Docker's documented host.docker.internal route.
// Only Office ingestion/health paths reach one fixed host loopback service.
import http from 'node:http';
import https from 'node:https';
import { pathToFileURL } from 'node:url';

export async function startOfficeForwarder({ port, hostPort, env = process.env, host = '127.0.0.1' }) {
  if (![port,hostPort].every(n=>Number.isInteger(n)&&n>=1024&&n<=65535) || host!=='127.0.0.1') throw Error('Invalid Office relay ports');
  const proxy = new URL(env.http_proxy || env.HTTP_PROXY || '');
  if (!['http:','https:'].includes(proxy.protocol)) throw Error('Office requires the sandbox HTTP proxy');
  const upstream = proxy.protocol==='https:' ? https : http;
  const pending = new Set();
  const server = http.createServer(async (req,res)=>{
    const fail=(code)=>{if(res.destroyed||res.writableEnded)return;if(!res.headersSent)res.writeHead(code,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end('{"message":"Office relay unavailable"}');};
    if(req.headers.origin || req.headers['sec-fetch-site'])return fail(403);
    const health = req.method==='GET' && /^\/healthz(?:\?challenge=[a-f0-9]{32})?$/.test(req.url??'');
    if(!health && !(req.method==='POST' && req.url==='/api/ingest'))return fail(404);
    if(pending.size>=32)return fail(503);
    try {
      let size=0;const chunks=[];
      for await(const chunk of req){size+=chunk.length;if(size>64*1024){fail(413);return;}chunks.push(Buffer.from(chunk));}
      const destination=`http://host.docker.internal:${hostPort}${req.url}`;
      const headers={Host:`host.docker.internal:${hostPort}`,Connection:'close'};
      for(const name of ['authorization','content-type'])if(typeof req.headers[name]==='string')headers[name]=req.headers[name];
      if(proxy.username||proxy.password)headers['Proxy-Authorization']='Basic '+Buffer.from(decodeURIComponent(proxy.username)+':'+decodeURIComponent(proxy.password)).toString('base64');
      const bytes=Buffer.concat(chunks);if(bytes.length)headers['Content-Length']=String(bytes.length);
      const call=upstream.request({hostname:proxy.hostname,port:proxy.port||(proxy.protocol==='https:'?443:80),method:req.method,path:destination,headers},response=>{
        let length=0;
        res.writeHead(response.statusCode??502,{'Content-Type':'application/json','Cache-Control':'no-store'});
        response.on('data',b=>{length+=b.length;if(length>4*1024*1024){response.destroy();res.destroy();}else if(!res.write(b))response.pause();});
        res.on('drain',()=>response.resume());response.once('end',()=>res.end());response.once('error',()=>res.destroy());
      });
      pending.add(call);call.once('close',()=>pending.delete(call));
      call.setTimeout(5000,()=>call.destroy());call.once('error',()=>fail(502));
      res.once('close',()=>{if(!res.writableFinished)call.destroy();});call.end(bytes);
    } catch {fail(502);}
  });
  server.maxConnections=64;server.requestTimeout=7000;server.headersTimeout=5000;
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,host,resolve);});
  return {close(){for(const call of pending)call.destroy();server.closeAllConnections();server.close();}};
}

if(process.argv[1]&&pathToFileURL(process.argv[1]).href===import.meta.url){
  let relay;
  try {relay=await startOfficeForwarder({port:Number(process.argv[2]),hostPort:Number(process.argv[3])});}
  catch {console.error('Office loopback relay could not start');process.exit(1);}
  const stop=()=>{relay.close();process.exit(0);};
  process.stdin.resume();process.stdin.once('end',stop);process.once('SIGTERM',stop);process.once('SIGINT',stop);
}
