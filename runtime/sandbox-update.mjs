import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, basename, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ownedProjects, statusCommand, versions } from './sandbox-status.mjs';
import { workflowFiles, workflowDigest } from './workflow-assets.mjs';
const root = dirname(fileURLToPath(import.meta.url));
export function updatePayload() {
  const files = workflowFiles(join(root, 'omp'), root);
  return { version: 1, omp: versions.omp, digest: workflowDigest(files), files: files.map(([path, bytes]) =>
    ({ path, data: bytes.toString('base64'), sha256: createHash('sha256').update(bytes).digest('hex') })) };
}
export const managedTarget = () => updatePayload().digest;
export async function updateSandbox({ projectId, sandboxId, run = statusCommand, root: stateRoot, onProgress = () => {} }) {
  const project = ownedProjects(stateRoot).find(p => p.projectId === projectId && p.id === sandboxId);
  if (!project) throw Error('Sandbox ownership changed. Refresh before updating.');
  async function verify() {
    const rows = JSON.parse(await run('sbx', ['ls', '--json']));
    if (!Array.isArray(rows) || rows.filter(r => r.name === project.name).length !== 1 || !rows.some(r => r.name === project.name && r.id === project.id && r.status === 'running')) throw Error('The owned sandbox must be running and unchanged before updating.');
  }
  onProgress('Checking sandbox'); await verify();
  const count = await run('sbx', ['exec', '-u', 'root', project.name, 'node', '-e',
    "const f=require('fs');let n=0;for(const p of f.readdirSync('/proc').filter(x=>/^[0-9]+$/.test(x))){try{if(f.readFileSync('/proc/'+p+'/cmdline','utf8').split('\\0').some(x=>/^\\/opt\\/(?:paseo-omp|teck-omp)\\//.test(x)||/\\/teck-orca\\/omp-launch\\.mjs$/.test(x)))n++;}catch{}}console.log(n);"]);
  if (Number(count.trim()) !== 0) throw Error('Close all OMP sessions before updating. Your files and session history are preserved.');
  const staging = mkdtempSync(join(tmpdir(), 'teck-sandbox-update-'));
  let remote;
  try {
    writeFileSync(join(staging, 'payload.json'), JSON.stringify(updatePayload()));
    writeFileSync(join(staging, 'apply.mjs'), readFileSync(new URL('./sandbox-update-guest.mjs', import.meta.url)));
    await verify(); await run('sbx', ['cp', staging, project.name + ':/tmp/']);
    onProgress('Updating OMP and managed guides');
    await verify();
    remote = '/tmp/' + basename(staging);
    const result = JSON.parse(await run('sbx', ['exec', '-u', 'root', project.name, 'node', remote + '/apply.mjs', remote + '/payload.json'], { timeout: 900000 }));
    if (result.omp !== versions.omp || result.digest !== managedTarget()) throw Error('Update verification failed.');
    return { ...result, message: 'OMP and managed guides are current. Reopen OMP to load them. Image packages and resource limits were not changed.' };
  } finally {
    if (remote) try {
      await verify();
      await run('sbx', ['exec', '-u', 'root', project.name, 'node', '-e',
        "const f=require('fs'),p=process.argv[1];if(!/^\\/tmp\\/teck-sandbox-update-[A-Za-z0-9-]+$/.test(p))throw Error('Unsafe cleanup');if(f.existsSync(p)){if(f.lstatSync(p).isSymbolicLink())throw Error('Unsafe staging');f.rmSync(p,{recursive:true,force:true});}", remote]);
    } catch { /* A stopped/replaced VM is never woken for temporary-file cleanup. */ }
    if (!resolve(staging).startsWith(resolve(tmpdir()) + sep)) throw Error('Unsafe host staging cleanup');
    rmSync(staging, { recursive: true, force: true });
  }
}
