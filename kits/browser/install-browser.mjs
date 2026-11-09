import { execFileSync } from 'node:child_process';
import { cpSync, chmodSync, mkdirSync, readFileSync, symlinkSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const lock = JSON.parse(readFileSync(new URL('./devtools.json', import.meta.url)));
const arch = process.arch;
const hashes = { x64: '5100149a1903211c889de4e545bf36d90803740cea4f99aa22651649f9205ea1', arm64: '937b315ee0761e8a62f7950ddcfef9b3d3d8e8d5eb9c9d2bf9e23e5725664511' };
if (!hashes[arch]) throw Error(`Unsupported browser architecture: ${arch}`);
const run = (cmd, args) => execFileSync(cmd, args, { stdio: 'inherit' });
const download = (url, path, hash) => {
  run('curl', ['-fsSL', '--retry', '5', '--retry-all-errors', url, '-o', path]);
  if (execFileSync('sha256sum', [path], { encoding: 'utf8' }).split(/\s+/)[0] !== hash) throw Error(`Browser checksum mismatch: ${url}`);
};
mkdirSync('/out/usr/local/bin', { recursive: true });
mkdirSync('/out/opt', { recursive: true });
cpSync('/opt/paseo-browser', '/out/opt/paseo-browser', { recursive: true, verbatimSymlinks: true });
const chromium = require('/opt/paseo-browser/lib/node_modules/playwright-core').chromium.executablePath();
symlinkSync(chromium, '/out/usr/local/bin/chromium');
download(`https://github.com/vercel-labs/agent-browser/releases/download/v0.38.1/agent-browser-linux-${arch}`, '/out/usr/local/bin/agent-browser', hashes[arch]);
chmodSync('/out/usr/local/bin/agent-browser', 0o755);
if (arch === 'x64') {
  download(`https://dl.google.com/linux/chrome/deb/pool/main/g/google-chrome-stable/google-chrome-stable_${lock.chrome.version}_amd64.deb`, '/tmp/chrome.deb', lock.chrome.sha256);
  run('dpkg-deb', ['--extract', '/tmp/chrome.deb', '/tmp/chrome']);
  // Runtime content only: no dpkg database, alternatives, OS libraries or desktop
  // integration files can overwrite paths owned by the workload.
  cpSync('/tmp/chrome/opt/google', '/out/opt/google', { recursive: true, verbatimSymlinks: true });
}
for (const name of ['google-chrome', 'google-chrome-stable']) symlinkSync(arch === 'x64' ? '/opt/google/chrome/google-chrome' : '/usr/local/bin/chromium', `/out/usr/local/bin/${name}`);
