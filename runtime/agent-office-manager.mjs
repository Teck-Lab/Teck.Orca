import { createHash, createHmac, randomBytes, randomInt } from 'node:crypto';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { statusCommand } from './sandbox-status.mjs';
import { configureOfficeGuest } from './office-guest.mjs';

const sha = b => createHash('sha256').update(b).digest('hex');
const readJson = p => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; } };
function save(path, data) {
  if (fs.existsSync(path) && fs.lstatSync(path).isSymbolicLink()) throw Error('Office state requires inspection');
  const next = JSON.stringify(data) + '\n';
  if (fs.existsSync(path) && fs.readFileSync(path, 'utf8') === next) return;
  fs.writeFileSync(path + '.new', next, { mode: 0o600 }); fs.renameSync(path + '.new', path);
}
export function verifyOfficeBundle(root) {
  const manifest = readJson(join(root, 'bundle.json'));
  if (manifest?.source !== 'https://github.com/Teck-Lab/agent-office' || !manifest.files) throw Error('Agent Office bundle unavailable');
  for (const [name, digest] of Object.entries(manifest.files)) {
    if (name.startsWith('/') || name.includes('\\') || name.split('/').some(p => p === '..' || !p)) throw Error('Invalid office asset');
    const path = join(root, name);
    if (!fs.lstatSync(path).isFile() || sha(fs.readFileSync(path)) !== digest) throw Error('Agent Office bundle changed');
  }
  return manifest;
}
export function officeTunnelArgs(name, port, guestPort = 19474) {
  if (!/^teck-orca-ssh-[a-f0-9]{12}$/.test(name) || [port,guestPort].some(p=>!Number.isInteger(p)||p<1024||p>65535)) throw Error('Invalid office transport');
  return ['-T','-o','BatchMode=yes','-o','ConnectTimeout=10','-o','ServerAliveInterval=10','-o','ServerAliveCountMax=2',
    `${name}.sbx`,'node','/usr/local/lib/teck-orca/office-forward.mjs',String(guestPort),String(port)];
}
export async function commandWithInput(program, args, input) {
  return new Promise((resolve, reject) => {
    const child = spawn(program, args, { windowsHide: true, stdio: ['pipe','pipe','pipe'] });
    let stdout = '';
    const timer = setTimeout(() => { child.kill(); reject(Error('Office guest setup timed out')); }, 12_000);
    child.stdout.on('data', b => { stdout = (stdout + b).slice(-8192); }); child.stderr.resume();
    child.stdin.on('error', () => {}); child.once('error', () => { clearTimeout(timer); reject(Error('Office guest setup unavailable')); });
    child.once('exit', code => { clearTimeout(timer); code === 0 ? resolve(stdout) : reject(Error('Office guest setup failed')); });
    child.stdin.end(input);
  });
}
async function health(home) {
  const record = readJson(join(home, 'office.json'));
  if (!record || record.host !== '127.0.0.1' || !Number.isInteger(record.port) || record.port < 1024 || record.port > 65535 || !/^[a-f0-9]{64}$/.test(record.secret)) return null;
  try {
    const challenge = randomBytes(16).toString('hex');
    const response = await fetch(`http://127.0.0.1:${record.port}/healthz?challenge=${challenge}`, { signal: AbortSignal.timeout(800) });
    const data = await response.json();
    if (data.proof !== createHmac('sha256', record.secret).update('agentoffice:' + challenge).digest('hex') || data.external !== true) return null;
    return { ...record, clients: data.clients, buildId: data.buildId };
  } catch { return null; }
}
export async function startLocalOffice({ root, bundleRoot = fileURLToPath(new URL('./agent-office/', import.meta.url)), ownerPid = process.ppid } = {}) {
  const home = join(root, 'server'); fs.mkdirSync(home, { recursive: true, mode: 0o700 });
  if (fs.lstatSync(home).isSymbolicLink()) throw Error('Office home requires inspection');
  verifyOfficeBundle(bundleRoot);
  const buildId = sha(fs.readFileSync(join(bundleRoot,'bundle.json')));
  let record = await health(home);
  if (record?.buildId === buildId) return { ...record, home };
  if (record) {
    if (!Number.isSafeInteger(record.pid) || record.pid < 1) throw Error('Office process identity requires inspection');
    process.kill(record.pid,'SIGTERM');
    for (let i=0;i<30&&await health(home);i++) await delay(100);
  }
  const log = fs.openSync(join(root, 'server.log'), 'a', 0o600);
  const child = spawn('node', [join(bundleRoot,'cli.js'),'--no-open','--no-control','--no-cloud','--external-only','--external-config',join(root,'ingest.json'),
    '--parent-pid', String(ownerPid), '--port','4747'], { windowsHide: true, detached: true, stdio: ['ignore',log,log],
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', AGENT_OFFICE_HOME: home, AGENT_OFFICE_BUILD_ID: buildId } });
  fs.closeSync(log);
  await new Promise((resolve,reject) => { child.once('spawn',resolve); child.once('error',()=>reject(Error('Local Agent Office could not start'))); }); child.unref();
  for (let i = 0; i < 70; i++) { record = await health(home); if (record) return { ...record, home }; if (child.exitCode !== null) break; await delay(100); }
  child.kill(); throw Error('Local Agent Office did not become ready; inspect the office server log');
}
export function openOfficeBrowser(url) {
  if (!/^http:\/\/127\.0\.0\.1:\d+\/?$/.test(url)) throw Error('Invalid office URL');
  return new Promise((resolve,reject) => {
    const program = process.platform === 'win32' ? 'rundll32.exe' : process.platform === 'darwin' ? 'open' : 'xdg-open';
    const child = spawn(program, process.platform === 'win32' ? ['url.dll,FileProtocolHandler',url] : [url], { windowsHide:true,stdio:'ignore' });
    child.once('error',reject); child.once('exit',c=>c===0?resolve():reject(Error('Office browser could not open')));
  });
}
function spawnOfficeTunnel(name,port,guestPort){
  const child=spawn('node',[fileURLToPath(new URL('./office-tunnel.mjs',import.meta.url)),name,String(port),String(process.pid),String(guestPort)],
    {cwd:homedir(),windowsHide:true,stdio:['pipe','pipe','pipe'],env:{...process.env,ELECTRON_RUN_AS_NODE:'1'}});
  const terminate=child.kill.bind(child);
  child.kill=()=>{child.stdin.end();const timer=setTimeout(()=>{if(child.exitCode===null)terminate()},2500);timer.unref();return true;};
  child.stdout.resume();child.stdin.on('error',()=>{});
  return child;
}
export function createOfficeManager({ root = join(homedir(),'.teck-orca','office'), run = statusCommand, input = commandWithInput,
  service = startLocalOffice, spawnTunnel = spawnOfficeTunnel,
  checkTunnel = async (project, record, guestPort, {retry=true}={}) => {
    const challenge = randomBytes(16).toString('hex');
    const expected = createHmac('sha256', record.secret).update('agentoffice:' + challenge).digest('hex');
    const script = `fetch('http://127.0.0.1:${guestPort}/healthz?challenge=${challenge}',{signal:AbortSignal.timeout(1200)}).then(r=>r.json()).then(d=>{if(d.proof!=='${expected}'||!d.external){console.log(JSON.stringify({proofMatches:d.proof==='${expected}',external:d.external===true}));process.exitCode=1}}).catch(e=>{console.log(JSON.stringify({code:e.cause?.code||e.name}));process.exitCode=1})`;
    const deadline=Date.now()+30_000;
    let lastProbe='';
    while(Date.now()<deadline) {
      const rows=JSON.parse(await run('sbx',['ls','--json']));
      if(!rows.some(r=>r.id===project.id&&r.name===project.name&&r.status==='running'))throw Error('Office sandbox is no longer running');
      try { await run('sbx',['exec','-u','agent',project.name,'node','-e',script]); return; } catch(error) { lastProbe=String(error.stdout||error.code||'').replace(/[^A-Za-z0-9_:{}",.-]/g,'').slice(0,180);if(!retry)break;await delay(500); }
    }
    throw Error('Office sandbox relay failed'+(lastProbe?': '+lastProbe:''));
  },
  open = openOfficeBrowser, now = Date.now, log = () => {} } = {}) {
  let pending, disposed = false, server, opened = false, backoff = 0, failure;
  const tunnels = new Map();
  async function sync(projects,{autoOpen=true}={}) {
    if (disposed) return; if (pending) return pending;
    pending=(async()=>{
      const eligible=projects.filter(p=>p.state==='running'&&/^teck-orca-ssh-[a-f0-9]{12}$/.test(p.name));
      for(const [id,item]of tunnels)if(!eligible.some(p=>p.id===id)){item.child.kill();tunnels.delete(id)}
      if (!eligible.length || now()<backoff) return;
      try {
        const rows=JSON.parse(await run('sbx',['ls','--json']));
        const verified=eligible.filter(p=>rows.some(r=>r.id===p.id&&r.name===p.name&&r.status==='running'));
        if(!verified.length)return;
        fs.mkdirSync(root,{recursive:true,mode:0o700});
        if(fs.lstatSync(root).isSymbolicLink())throw Error('Office state requires inspection');
        const configPath=join(root,'ingest.json'), old=readJson(configPath);
        const sources=Object.fromEntries(verified.map(p=>[p.id,{ token: old?.sources?.[p.id]?.token ?? randomBytes(32).toString('hex'),
          project:p.title||p.name,host:{kind:'docker-sandbox',id:p.id,name:p.name} }]));
        save(configPath,{version:1,sources});
        const live=server?await health(server.home):null;
        if(!live){for(const item of tunnels.values())item.child.kill();tunnels.clear();server=await service({root});opened=false;}
        else server={...server,...live};
        for(const p of verified){
          const previous=tunnels.get(p.id);
          if(previous){
            try {await checkTunnel(p,server,previous.guestPort,{retry:false});continue;}
            catch {previous.child.kill();tunnels.delete(p.id);}
          }
          // A new listener must not share a port with an old SSH session still being retired.
          const guestPort=randomInt(20000,60000);
          const config={version:1,sourceId:p.id,url:`http://127.0.0.1:${guestPort}/api/ingest`,token:sources[p.id].token};
          const extension=fs.readFileSync(new URL('./omp/extensions/agent-office.mjs',import.meta.url)).toString('base64');
          const roleGuard=fs.readFileSync(new URL('./omp/extensions/orca-orchestration.mjs',import.meta.url)).toString('base64');
          const forwarder=fs.readFileSync(new URL('./office-forward.mjs',import.meta.url)).toString('base64');
          const entry=fs.readFileSync(new URL('./omp/extensions/agent-office.ts',import.meta.url)).toString('base64');
          const mcpAssets=Object.fromEntries(['office-mcp.mjs','office-mcp-server.mjs','office-tools.mjs','office-usage.mjs','office-plan.mjs','agent-office.LICENSE'].map(name=>
            [name,fs.readFileSync(new URL('./omp/extensions/lib/'+name,import.meta.url)).toString('base64')]));
          const current=JSON.parse(await run('sbx',['ls','--json']));
          if(!current.some(r=>r.id===p.id&&r.name===p.name&&r.status==='running'))continue;
          // Docker translates this host-service address through its proxy.
          // Scope access to this sandbox, exact port and Office endpoints.
          await run('sbx',['policy','allow','network','--sandbox',p.name,`localhost:${server.port}`,'--method','GET','--path','/healthz']);
          await run('sbx',['policy','allow','network','--sandbox',p.name,`localhost:${server.port}`,'--method','POST','--path','/api/ingest']);
          await input('sbx',['exec','-i','-u','root',p.name,'node','-e',configureOfficeGuest],JSON.stringify({config,extension,roleGuard,forwarder,entry,mcpAssets}));
          if(disposed)return;
          const child=spawnTunnel(p.name,server.port,guestPort); const item={child,guestPort};tunnels.set(p.id,item);
          let diagnostics='', exitReason='still running';child.stderr?.on('data',b=>{diagnostics=(diagnostics+b).slice(-2048)});
          child.stderr?.resume();
          const lost=()=>{if(tunnels.get(p.id)===item){tunnels.delete(p.id);backoff=now()+5000;}};
          child.once('error',error=>{exitReason=error.code||'spawn failed';lost()});child.once('exit',(code,signal)=>{exitReason=signal||String(code);lost()});
          try { await checkTunnel(p,server,guestPort); }
          catch(error){child.kill();lost();
            fs.appendFileSync(join(root,'transport.log'),`${new Date().toISOString()} SSH ${exitReason}\n`+diagnostics.replace(/Bearer\s+\S+/gi,'Bearer [redacted]')+'\n',{mode:0o600});
            throw error;}
          log(`Agent Office connected to ${p.title||p.name}.`);
        }
        if(autoOpen&&!opened&&!disposed){if(!server.clients)await open(server.url);opened=true;}
        failure=null;backoff=0;
      }catch(error){backoff=now()+15_000;const reason=error?.message?.startsWith('Office ')||error?.message?.startsWith('Local Agent Office')?error.message:'Local Agent Office unavailable';
        if(reason!==failure){failure=reason;log(reason+'; use Open pixel office to retry.');}}
    })().finally(()=>{pending=null});return pending;
  }
  return {sync,async open(projects,id){backoff=0;await sync(projects,{autoOpen:false});if(!server||!tunnels.has(id))throw Error('Office connection unavailable for the owned running sandbox');
    const live=await health(server.home);if(!live)throw Error('Office service is unavailable');
    // A manual click must open the URL even when a viewer is already connected.
    // Viewer counts can suppress automatic startup, but cannot tell us which tab is visible.
    await open(live.url);opened=true;return{opened:true};},
    dispose(){disposed=true;for(const item of tunnels.values())item.child.kill();tunnels.clear();}};
}
