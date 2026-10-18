import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawn } from 'node:child_process';

export const projectCodeFiles = ['runtime/project-state.mjs', 'runtime/project-transport.mjs', 'runtime/project-supervisor.mjs', 'scripts/lifecycle.mjs'];
export function startupSource(digest) {
  if (!/^[a-f0-9]{64}$/.test(digest)) throw Error('Invalid startup runtime digest');
  return `const fs=require('node:fs'),p=require('node:path'),c=require('node:crypto');const hash=x=>c.createHash('sha256').update(x).digest('hex');const root=p.join(process.env.TECK_ORCA_RELEASES_DIR||p.join(require('node:os').homedir(),'.teck-orca','releases'),'${digest}');const raw=fs.readFileSync(p.join(root,'release.json'));if(hash(raw)!=='${digest}')throw Error('Startup manifest changed');const manifest=JSON.parse(raw);for(const f of ${JSON.stringify(projectCodeFiles)}){if(typeof manifest[f]!=='string'||hash(fs.readFileSync(p.join(root,f)))!==manifest[f])throw Error('Startup runtime changed: '+f)}import(require('node:url').pathToFileURL(p.join(root,'runtime/project-supervisor.mjs')).href).then(m=>m.supervise()).catch(()=>{process.exitCode=1})`;
}
export function installProjectStartup(release, { platform = process.platform, env = process.env, node = process.execPath, start = true } = {}) {
  const args = ['-e', `eval(Buffer.from('${Buffer.from(startupSource(release.digest)).toString('base64')}','base64').toString())`];
  let path;
  if (platform === 'win32') {
    const directory = join(env.APPDATA, 'Microsoft/Windows/Start Menu/Programs/Startup');
    mkdirSync(directory, { recursive: true });
    path = join(directory, 'Teck.Orca.ProjectSSH.vbs');
    const quote = value => '"' + value.replaceAll('"', '""') + '"';
    // WScript starts Node hidden, without a PowerShell window or an admin task.
    const command = `"${node}" -e "${args[1]}"`;
    writeFileSync(path, `Set shell = CreateObject("WScript.Shell")\r\nshell.Run ${quote(command)}, 0, False\r\n`);
  } else {
    // Keep the portable runtime usable without silently choosing a user's login manager.
    return { installed: false, command: [node, ...args], reason: 'Configure this command in your user login manager for automatic recovery.' };
  }
  if (start) {
    const child = spawn(node, args, { detached: true, windowsHide: true, stdio: 'ignore',
      env: { ...env, ELECTRON_RUN_AS_NODE: '1' } });
    child.on('error', error => process.stderr.write(`Project SSH startup failed: ${error.message}\n`));
    child.unref();
  }
  return { installed: true, path };
}
