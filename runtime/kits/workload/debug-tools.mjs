import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmodSync, chownSync, copyFileSync, existsSync, lchownSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readlinkSync, renameSync, rmSync, symlinkSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export function debugTools(lock, arch = process.arch) {
  const platformArch = { x64: 'amd64', arm64: 'arm64' }[arch];
  if (!platformArch) throw Error(`Unsupported debugger architecture: ${arch}`);
  const netcore = lock?.debug?.netcoredbg, js = lock?.debug?.jsDebug;
  if (!/^\d+\.\d+\.\d+-\d+$/.test(netcore?.version ?? '') || !/^[a-f0-9]{64}$/.test(netcore?.sha256?.[arch] ?? '')) throw Error('Invalid netcoredbg pin');
  if (!/^\d+\.\d+\.\d+$/.test(js?.version ?? '') || !/^[a-f0-9]{64}$/.test(js?.sha256 ?? '')) throw Error('Invalid js-debug pin');
  return [
    { name: 'netcoredbg', version: netcore.version, sha256: netcore.sha256[arch], entry: 'netcoredbg/netcoredbg',
      url: `https://github.com/Samsung/netcoredbg/releases/download/${netcore.version}/netcoredbg-linux-${platformArch}.tar.gz` },
    { name: 'js-debug', version: js.version, sha256: js.sha256, entry: 'js-debug/src/dapDebugServer.js',
      url: `https://github.com/microsoft/vscode-js-debug/releases/download/v${js.version}/js-debug-dap-v${js.version}.tar.gz` },
  ];
}

// Image build only. Private destinations make the same installer usable in an isolated validation VM.
export function installDebugTools({ lock, arch = process.arch, destination = '/opt/teck-debuggers', binDirectory = '/usr/local/bin', agentHome = '/home/agent',
  agentUid = 1000, agentGid = 1000,
  fromDirectory,
  download = (tool, file) => execFileSync('curl', ['--fail', '--show-error', '--silent', '--location', '--retry', '5', '--retry-all-errors', tool.url, '-o', file], { stdio: 'inherit', timeout: 300_000 }),
  extract = (file, dir) => execFileSync('tar', ['-xzf', file, '--no-same-owner', '-C', dir], { stdio: 'inherit' }) } = {}) {
  const tools = debugTools(lock, arch);
  mkdirSync(destination, { recursive: true });
  const staging = mkdtempSync(join(destination, '.install-'));
  try {
    // Validate both archives before extracting any executable code.
    for (const tool of tools) {
      const file = join(staging, tool.name + '.tar.gz');
      if(fromDirectory)copyFileSync(join(fromDirectory,tool.name+'.tar.gz'),file);else download(tool, file);
      if (createHash('sha256').update(readFileSync(file)).digest('hex') !== tool.sha256) throw Error(`${tool.name} checksum mismatch`);
    }
    for (const tool of tools) {
      if (existsSync(join(destination, tool.name))) throw Error(`Debugger destination already exists: ${tool.name}`);
      extract(join(staging, tool.name + '.tar.gz'), staging);
      if (!lstatSync(join(staging, tool.entry)).isFile()) throw Error(`Debugger entry missing: ${tool.name}`);
    }
    for (const tool of tools) renameSync(join(staging, tool.name), join(destination, tool.name));
    copyFileSync(new URL('./netcoredbg.LICENSE',import.meta.url),join(destination,'netcoredbg/LICENSE'));
    chmodSync(join(destination, 'netcoredbg/netcoredbg'), 0o755);
    const link = (target, file) => {
      if (existsSync(file)) {
        if (lstatSync(file).isSymbolicLink() && readlinkSync(file) === target) return;
        throw Error(`Debugger link already exists: ${file}`);
      }
      symlinkSync(target, file);
    };
    mkdirSync(binDirectory, { recursive: true });
    const automatic = join(agentHome, '.local/opt');
    for(const directory of [join(agentHome,'.local'),automatic]){
      const existed=existsSync(directory);mkdirSync(directory,{recursive:true});
      if(!existed&&process.getuid?.()===0)chownSync(directory,agentUid,agentGid);
    }
    link(join(destination, 'netcoredbg/netcoredbg'), join(binDirectory, 'netcoredbg'));
    // This is OMP's documented auto-discovery location; no project dap.json is required.
    link(join(destination, 'js-debug'), join(automatic, 'js-debug'));
    if(process.getuid?.()===0)lchownSync(join(automatic,'js-debug'),agentUid,agentGid);
    return tools.map(({ name, version, sha256 }) => ({ name, version, sha256 }));
  } finally { rmSync(staging, { recursive: true, force: true }); }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]) && process.argv.includes('--install')) {
  const value = flag => { const i=process.argv.indexOf(flag); if(i<0)return undefined; if(!process.argv[i+1])throw Error(`${flag} requires a path`); return resolve(process.argv[i+1]); };
  const lock = JSON.parse(readFileSync(new URL('./devtools.json', import.meta.url), 'utf8'));
  console.log(JSON.stringify(installDebugTools({ lock, ...Object.fromEntries([['destination',value('--destination')],['binDirectory',value('--bin-directory')],['agentHome',value('--agent-home')],['fromDirectory',value('--from-directory')]].filter(([,v])=>v)) })));
}
