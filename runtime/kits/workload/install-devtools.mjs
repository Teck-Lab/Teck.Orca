import { execFileSync } from 'node:child_process';
import { chmodSync, mkdirSync, readFileSync, readdirSync, rmSync, symlinkSync } from 'node:fs';

// Build-time only. No host tools, credentials or user-data enter the image.
const lock = JSON.parse(readFileSync(new URL('./devtools.json', import.meta.url), 'utf8'));
const arch = process.arch;
if (!['x64', 'arm64'].includes(arch)) throw new Error(`Unsupported architecture: ${arch}`);
const debArch = arch === 'x64' ? 'amd64' : 'arm64';
const run = (cmd, args) => execFileSync(cmd, args, { stdio: 'inherit' });
const link = (target, path) => { rmSync(path, { force: true }); symlinkSync(target, path); };
const download = (url, path, hash, algorithm = 'sha256') => {
  run('curl', ['--fail', '--show-error', '--silent', '--location', '--retry', '5', '--retry-all-errors', url, '-o', path]);
  if (execFileSync(`${algorithm}sum`, [path], { encoding: 'utf8' }).split(/\s+/)[0] !== hash) {
    throw new Error(`Checksum mismatch: ${url}`);
  }
};

if (!process.argv.includes('--chrome')) {
mkdirSync('/usr/share/dotnet', { recursive: true });
download(`https://builds.dotnet.microsoft.com/dotnet/Sdk/${lock.dotnet.version}/dotnet-sdk-${lock.dotnet.version}-linux-${arch}.tar.gz`, '/tmp/teck-dotnet.tar.gz', lock.dotnet.sha512[arch], 'sha512');
run('tar', ['-xzf', '/tmp/teck-dotnet.tar.gz', '-C', '/usr/share/dotnet']);
rmSync('/tmp/teck-dotnet.tar.gz');
link('/usr/share/dotnet/dotnet', '/usr/local/bin/dotnet');
run('dotnet', ['--version']);

run('npm', ['install', '--global', '--prefix', '/opt/teck-devtools', '--no-audit', '--no-fund', ...Object.entries(lock.npm).map(([name, version]) => `${name}@${version}`)]);
for (const name of readdirSync('/opt/teck-devtools/bin')) link(`/opt/teck-devtools/bin/${name}`, `/usr/local/bin/${name}`);
run('npm', ['cache', 'clean', '--force']);

const { omnisharp, marksman, terraform, helm } = lock.native;
mkdirSync('/usr/local/lib/omnisharp', { recursive: true });
download(`https://github.com/OmniSharp/omnisharp-roslyn/releases/download/v${omnisharp.version}/omnisharp-linux-${arch}-net10.0.tar.gz`, '/tmp/teck-omnisharp.tar.gz', omnisharp.sha256[arch]);
run('tar', ['-xzf', '/tmp/teck-omnisharp.tar.gz', '-C', '/usr/local/lib/omnisharp']);
rmSync('/tmp/teck-omnisharp.tar.gz');
link('/usr/local/lib/omnisharp/OmniSharp', '/usr/local/bin/omnisharp');
download(`https://github.com/artempyanykh/marksman/releases/download/${marksman.version}/marksman-linux-${arch}`, '/usr/local/bin/marksman', marksman.sha256[arch]);
chmodSync('/usr/local/bin/marksman', 0o755);
download(`https://releases.hashicorp.com/terraform-ls/${terraform.version}/terraform-ls_${terraform.version}_linux_${debArch}.zip`, '/tmp/teck-terraform-ls.zip', terraform.sha256[arch]);
run('unzip', ['-o', '/tmp/teck-terraform-ls.zip', '-d', '/usr/local/bin']);
rmSync('/tmp/teck-terraform-ls.zip');
download(`https://github.com/mrjosh/helm-ls/releases/download/v${helm.version}/helm_ls_linux_${debArch}`, '/usr/local/bin/helm_ls', helm.sha256[arch]);
chmodSync('/usr/local/bin/helm_ls', 0o755);
if (process.argv.includes('--pack')) {
  // Keep the final kit layer below Docker's path-component inventory limit.
  // The lifecycle expands the complete toolchain into each new feature VM.
  run('tar', ['-C', '/', '-czf', '/tmp/teck-devtools-runtime.tar.gz',
    'usr/share/dotnet', 'opt/teck-devtools', 'usr/local/lib/omnisharp',
    ...readdirSync('/opt/teck-devtools/bin').map(name => 'usr/local/bin/' + name),
    ...['dotnet', 'omnisharp', 'marksman', 'terraform-ls', 'helm_ls'].map(name => 'usr/local/bin/' + name)]);
}

}

if (process.argv.includes('--chrome')) {
// Google publishes Linux Chrome for amd64. ARM features already have native
// Playwright Chromium; use that for the same Chrome-compatible entry points.
if (arch === 'x64') {
  download(`https://dl.google.com/linux/chrome/deb/pool/main/g/google-chrome-stable/google-chrome-stable_${lock.chrome.version}_amd64.deb`, '/tmp/teck-chrome.deb', lock.chrome.sha256);
  run('apt-get', ['update']);
  run('apt-get', ['install', '-y', '--no-install-recommends', '/tmp/teck-chrome.deb']);
  rmSync('/tmp/teck-chrome.deb');
  rmSync('/var/lib/apt/lists', { recursive: true, force: true });
} else {
  link('/usr/local/bin/chromium', '/usr/local/bin/google-chrome-stable');
  link('/usr/local/bin/chromium', '/usr/local/bin/google-chrome');
}
}
