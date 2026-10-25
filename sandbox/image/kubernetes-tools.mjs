import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmodSync, copyFileSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export function kubernetesTools(lock, arch = process.arch) {
  const platformArch = { x64: 'amd64', arm64: 'arm64' }[arch];
  if (!platformArch) throw Error(`Unsupported Kubernetes tool architecture: ${arch}`);
  return ['kind', 'kubectl'].map(name => {
    const pin = lock?.native?.[name];
    if (!/^\d+\.\d+\.\d+$/.test(pin?.version ?? '') || !/^[a-f0-9]{64}$/.test(pin?.sha256?.[arch] ?? '')) throw Error(`Invalid ${name} version/checksum pin`);
    return { name, version: pin.version, sha256: pin.sha256[arch], url: name === 'kind'
      ? `https://github.com/kubernetes-sigs/kind/releases/download/v${pin.version}/kind-linux-${platformArch}`
      : `https://dl.k8s.io/release/v${pin.version}/bin/linux/${platformArch}/kubectl` };
  });
}
export function verifyKubernetesVersion(tool, binary) {
  const options = { encoding: 'utf8', timeout: 20_000, env: { ...process.env, KUBECONFIG: '/dev/null' } };
  const output = execFileSync(binary, tool.name === 'kind' ? ['version'] : ['version', '--client', '--output=json'], options);
  if (tool.name === 'kind' ? !output.startsWith(`kind v${tool.version} `) : JSON.parse(output).clientVersion?.gitVersion !== `v${tool.version}`) throw Error(`Unexpected ${tool.name} version`);
}
export function installKubernetesTools({ lock, arch = process.arch, destination = '/usr/local/bin', fromDirectory,
  download = (tool, file) => execFileSync('curl', ['--fail', '--show-error', '--silent', '--location', '--retry', '5', '--retry-all-errors', tool.url, '-o', file], { stdio: 'inherit', timeout: 300_000 }),
  verifyVersion = verifyKubernetesVersion } = {}) {
  const tools = kubernetesTools(lock, arch);
  mkdirSync(destination, { recursive: true });
  const staging = mkdtempSync(join(destination, '.teck-kubernetes-'));
  try {
    // Check every artifact before touching either installed executable.
    for (const tool of tools) {
      const file = join(staging, tool.name);
      if (fromDirectory) copyFileSync(join(fromDirectory, tool.name), file);
      else download(tool, file);
      if (createHash('sha256').update(readFileSync(file)).digest('hex') !== tool.sha256) throw Error(`${tool.name} checksum mismatch`);
      chmodSync(file, 0o755);
      verifyVersion(tool, file);
    }
    for (const tool of tools) renameSync(join(staging, tool.name), join(destination, tool.name));
    return tools.map(({ name, version, sha256 }) => ({ name, version, sha256 }));
  } finally { rmSync(staging, { recursive: true, force: true }); }
}
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]) && process.argv[2] === '--install') {
  const lock = JSON.parse(readFileSync(new URL('./devtools.json', import.meta.url), 'utf8'));
  const index = process.argv.indexOf('--from-directory');
  if (index >= 0 && !process.argv[index + 1]) throw Error('--from-directory requires a path');
  console.log(JSON.stringify(installKubernetesTools({ lock, ...(index >= 0 ? { fromDirectory: process.argv[index + 1] } : {}) })));
}
