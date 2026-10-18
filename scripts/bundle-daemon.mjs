// Import distribution assets only. Never import the desktop's profile or pairing data.
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { command } from './lifecycle.mjs';
import { repositoryRoot } from './release.mjs';

const source = resolve(process.env.TECK_ORCA_TEMPLATE_DIR || join(process.env.LOCALAPPDATA || '', 'Programs', 'orca', 'resources', 'orcad-template'));
const destination = join(repositoryRoot, 'runtime', 'kits', 'orcad', 'bundle');
const manifest = JSON.parse(readFileSync(join(source, 'orcad-template.json'), 'utf8'));
const version = JSON.parse(readFileSync(join(source, 'out', 'package.json'), 'utf8')).version;
const nodeVersion = '24.21.0';
const artifactVersion = '0.1.0+15ec2904eb00';
const hashes = {
  x64: '6e1db87ef58b8819e5d5402eff1536491b18edd8eb7bee5ef7897876e88dc5ff',
  arm64: '724282c3b43aec998aa9527380465b45d229e021b58035f5f4f63095eabfe5d5',
};
const sha256 = (path) => createHash('sha256').update(readFileSync(path)).digest('hex');
function copyVerified(root, files, output) {
  for (const [path, hash] of Object.entries(files)) {
    if (path.includes('..') || path.startsWith('/') || path.includes('\\')) throw new Error('Unsafe upstream asset path');
    const input = join(root, path);
    if (sha256(input) !== hash) throw new Error(`Upstream daemon checksum mismatch: ${path}`);
    mkdirSync(join(output, path, '..'), { recursive: true });
    cpSync(input, join(output, path));
  }
}
if (version !== '1.4.224') throw new Error(`Review the runtime/Node pins before bundling Orca ${version}`);
if (manifest.commonSha256['orcad-server.js'] !== 'bea1e0ce0f5cd40a046a40c04ef5e66c9e38ce110387f35d5b54abccf65cb8ba') throw new Error('Review the daemon artifact version before bundling a different build');
copyVerified(source, manifest.commonSha256, join(destination, 'common'));
writeFileSync(join(destination, 'common', '.version'), artifactVersion + '\n');
for (const arch of ['x64', 'arm64']) {
  const target = `linux-${arch}-glibc`;
  copyVerified(join(source, 'targets', target), manifest.targets[target].files, join(destination, 'targets', target));
  const archive = `node-v${nodeVersion}-linux-${arch}.tar.gz`;
  const path = join(destination, 'node', archive);
  mkdirSync(join(destination, 'node'), { recursive: true });
  if (!existsSync(path)) command('curl', ['--fail', '--silent', '--show-error', '--location', '--retry', '3', `https://nodejs.org/dist/v${nodeVersion}/${archive}`, '--output', path], { progress: true });
  if (sha256(path) !== hashes[arch]) throw new Error(`Node archive checksum mismatch: ${archive}`);
}
writeFileSync(join(destination, 'provenance.json'), JSON.stringify({ version, artifactVersion, nodeVersion, source: 'Orca packaged orcad-template; no runtime user data', nodeArchiveSha256: hashes, upstreamManifest: manifest }, null, 2) + '\n');
console.log(`Bundled Orca ${version} and Node ${nodeVersion} for Linux x64/arm64.`);
