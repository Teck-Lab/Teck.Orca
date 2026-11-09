import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, lstatSync, readFileSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

const execute = promisify(execFile);
export const versions = JSON.parse(readFileSync(new URL('./versions.json', import.meta.url)));
export const statusSettings = { refreshSeconds: 30, runtimeDetails: true, showStatusBar: true };
const safeText = value => String(value ?? '').replace(/[\x00-\x1f\x7f]/g, ' ').slice(0, 160);
export async function statusCommand(program, args, options = {}) {
  const { stdout } = await execute(program, args, { windowsHide: true, timeout: 12_000,
    maxBuffer: 1024 * 1024, ...options });
  return stdout;
}

export function ownedProjects(root = process.env.TECK_ORCA_STATUS_STATE_DIR || join(homedir(), '.teck-orca-native-ssh')) {
  if (!existsSync(root)) return [];
  if (lstatSync(root).isSymbolicLink()) throw Error('Sandbox ownership directory requires inspection');
  return readdirSync(root).filter(name => /^teck-orca-ssh-[a-f0-9]{12}$/.test(name)).map(name => {
    const directory = join(root, name), path = join(directory, 'state.json');
    if (lstatSync(directory).isSymbolicLink() || !lstatSync(directory).isDirectory()) throw Error('Invalid sandbox ownership directory');
    if (!existsSync(path)) return null;
    const stat = lstatSync(path);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 65_536) throw Error('Invalid sandbox ownership record');
    const state = JSON.parse(readFileSync(path, 'utf8'));
    const expected = `teck-orca-ssh-${createHash('sha256').update(String(state.projectId)).digest('hex').slice(0, 12)}`;
    if (state.version !== 1 || state.sandboxName !== name || expected !== name ||
        state.projectRoot !== '/home/agent/project' || typeof state.sandboxId !== 'string' || !state.sandboxId ||
        !['provisioning', 'configured', 'cloned', 'ready'].includes(state.phase)) throw Error('Invalid sandbox ownership record');
    // Return an explicit public projection: never send the full record or auth
    // configuration to a panel or log.
    return { projectId: state.projectId, name, id: state.sandboxId, title: safeText(state.displayName || state.projectId) };
  }).filter(Boolean);
}

// Read-only guest commands: no start/ensure, daemon restart, profile import or
// workspace operation. The host calls this only for an exactly owned running VM.
export const guestStatusProbe = String.raw`
const fs=require('node:fs'),cp=require('node:child_process');
const text=v=>String(v??'').replace(/[\x00-\x1f\x7f]/g,' ').slice(0,160);
const command=(p,args)=>cp.execFileSync(p,args,{encoding:'utf8',timeout:4000,maxBuffer:524288,stdio:['ignore','pipe','pipe']});
const json=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const result={connection:'unverified',daemon:null,omp:null,disk:null,dockerDisk:null,kubernetes:null,ompProcesses:null,managedDigest:null};
let prefix='/opt/paseo-omp';
try{const p=json('/etc/teck-orca/omp-runtime.json').prefix;if(/^\/opt\/teck-omp\/releases\/[0-9.]+$/.test(p))prefix=p;}catch{}
try{result.omp=json(prefix+'/lib/node_modules/@oh-my-pi/pi-coding-agent/package.json').version;}catch{}
try{const r=JSON.parse(command('/home/agent/.orca/cli/bin/orca',['status','--json']));const s=r.result??r;
  result.daemon=text(s.runtime?.appVersion)||null;result.connection=s.runtime?.state==='ready'?'ready':'unavailable';
}catch{}
try{const s=fs.statfsSync('/');result.disk={total:s.blocks*s.bsize,available:s.bavail*s.bsize};}catch{}
try{result.dockerDisk=JSON.parse(command('sudo',['-n','node','-e',"const f=require('fs');const s=f.statfsSync('/var/lib/docker');console.log(JSON.stringify({total:s.blocks*s.bsize,available:s.bavail*s.bsize}));"]));}catch{}
try{result.ompProcesses=Number(command('sudo',['-n','node','-e',"const f=require('fs');let n=0;for(const p of f.readdirSync('/proc').filter(x=>/^[0-9]+$/.test(x))){try{const a=f.readFileSync('/proc/'+p+'/cmdline','utf8').split('\\0');if(a.some(x=>/^\\/opt\\/(?:paseo-omp|teck-omp)\\//.test(x)||/\\/teck-orca\\/omp-launch\\.mjs$/.test(x)))n++;}catch{}}console.log(n);"]));}catch{}
try{result.managedDigest=fs.readFileSync('/home/agent/.omp/agent/teck-workflow.sha256','utf8').trim();}catch{}
if(fs.existsSync('/etc/teck-orca/kubernetes.json'))try{
  const s=JSON.parse(command('/usr/local/bin/teck-kube',['status']));
  result.kubernetes={name:text(s.name),phase:text(s.phase),profile:text(s.profile),readiness:'unverified'};
  const config=json('/etc/teck-orca/kubernetes.json');
  if(config.root==='/var/lib/teck-kubernetes'&&/^teck-local-[a-f0-9]{12}$/.test(s.name)){
    const p=config.root+'/'+s.name+'/kubeconfig';
    const nodes=JSON.parse(command('sudo',['-n','kubectl','--kubeconfig',p,'--request-timeout=2s','get','nodes','-o','json']));
    result.kubernetes.nodes=nodes.items.length;
    result.kubernetes.ready=nodes.items.filter(n=>n.status?.conditions?.some(c=>c.type==='Ready'&&c.status==='True')).length;
    result.kubernetes.readiness=result.kubernetes.nodes>0&&result.kubernetes.ready===result.kubernetes.nodes?'ready':'not-ready';
  }
}catch{}
console.log(JSON.stringify(result));
`;

function inventory(text) {
  const rows = JSON.parse(text);
  if (!Array.isArray(rows) || rows.some(row => !row.name || !row.id) ||
      new Set(rows.map(row => row.name)).size !== rows.length || new Set(rows.map(row => row.id)).size !== rows.length)
    throw Error('Cannot verify sandbox inventory');
  return rows;
}
export async function readSandboxStatus({ root, run = statusCommand, runtimeDetails = true, now = Date.now } = {}) {
  const projects = ownedProjects(root);
  if (!projects.length) return { checkedAt: now(), projects: [], target: versions, error: null };
  let rows;
  try { rows = inventory(await run('sbx', ['ls', '--json'])); }
  catch { return { checkedAt: now(), projects: [], target: versions, error: 'Docker Sandboxes inventory is unavailable. No sandbox was started or changed.' }; }
  const results = [];
  for (const project of projects) {
    const row = rows.find(item => item.name === project.name);
    const result = { ...project, state: !row ? 'missing' : row.id !== project.id ? 'ownership-mismatch' : row.status,
      cpus: row?.id === project.id ? row.cpus ?? null : null,
      memory: row?.id === project.id ? row.memory ?? null : null, runtime: null, error: null };
    if (result.state === 'running' && runtimeDetails) {
      try {
        // Re-check immediately before exec: sbx exec can wake a stopped VM.
        const current = inventory(await run('sbx', ['ls', '--json'])).find(item => item.name === project.name);
        if (current?.id !== project.id || current.status !== 'running') {
          result.state = current?.id !== project.id ? 'ownership-mismatch' : current.status;
        } else {
          const raw = JSON.parse(await run('sbx', ['exec', '-u', 'agent', project.name, 'node', '-e', guestStatusProbe]));
          // Discard unknown guest output fields; never relay arbitrary JSON.
          result.runtime = { connection: ['ready','unavailable'].includes(raw.connection) ? raw.connection : 'unverified',
            daemon: /^\d+\.\d+\.\d+$/.test(raw.daemon) ? raw.daemon : null,
            omp: /^\d+\.\d+\.\d+$/.test(raw.omp) ? raw.omp : null,
            disk: raw.disk && Number.isFinite(raw.disk.total) && Number.isFinite(raw.disk.available) &&
              raw.disk.total > 0 && raw.disk.available >= 0 ? { total: raw.disk.total, available: raw.disk.available } : null,
            dockerDisk: raw.dockerDisk && Number.isFinite(raw.dockerDisk.total) && Number.isFinite(raw.dockerDisk.available) &&
              raw.dockerDisk.total > 0 && raw.dockerDisk.available >= 0 && raw.dockerDisk.available <= raw.dockerDisk.total ? { total: raw.dockerDisk.total, available: raw.dockerDisk.available } : null,
            ompProcesses: Number.isSafeInteger(raw.ompProcesses) && raw.ompProcesses >= 0 ? raw.ompProcesses : null,
            managedDigest: /^[a-f0-9]{64}$/.test(raw.managedDigest) ? raw.managedDigest : null,
            kubernetes: raw.kubernetes ? { name: safeText(raw.kubernetes.name), phase: safeText(raw.kubernetes.phase),
              readiness: ['ready','not-ready'].includes(raw.kubernetes.readiness) ? raw.kubernetes.readiness : 'unverified',
              nodes: Number.isInteger(raw.kubernetes.nodes) ? raw.kubernetes.nodes : null,
              ready: Number.isInteger(raw.kubernetes.ready) ? raw.kubernetes.ready : null } : null };
        }
      } catch { result.error = 'Runtime details unavailable; sandbox state was not changed.'; }
    }
    results.push(result);
  }
  return { checkedAt: now(), projects: results, target: versions, error: null };
}

export function connectionIndicator(snapshot) {
  const rows = snapshot.projects ?? [];
  if (snapshot.error || rows.some(p => ['ownership-mismatch', 'missing'].includes(p.state) || p.error))
    return { text: 'Teck: Check sandbox', tone: 'warning', tooltip: snapshot.error || 'Open sandbox status for details' };
  if (!rows.length) return { text: 'Teck: No sandbox', tone: 'neutral', tooltip: 'Created on first workspace use' };
  const connected = rows.filter(p => p.state === 'running' && p.runtime?.connection === 'ready').length;
  const running = rows.filter(p => p.state === 'running').length;
  return { text: connected ? `Teck: ${connected} connected` : running ? `Teck: ${running} running` : 'Teck: Sandbox stopped',
    tone: connected ? 'success' : running ? 'accent' : 'neutral',
    tooltip: rows.map(p => `${p.title}: ${p.state}, runtime ${p.runtime?.connection ?? 'not checked'}`).join('\n').slice(0, 1000) };
}
