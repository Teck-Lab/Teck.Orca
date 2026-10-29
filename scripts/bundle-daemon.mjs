// Import distribution assets only. Never import the desktop's profile or pairing data.
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { gzipSync } from 'node:zlib';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { command } from './lifecycle.mjs';
import { repositoryRoot } from './release.mjs';

const source = resolve(process.env.TECK_ORCA_TEMPLATE_DIR || join(process.env.LOCALAPPDATA || '', 'Programs', 'orca', 'resources', 'orcad-template'));
const destination = join(repositoryRoot, 'runtime', 'kits', 'orcad', 'bundle');
const manifest = JSON.parse(readFileSync(join(source, 'orcad-template.json'), 'utf8'));
const version = JSON.parse(readFileSync(join(source, 'out', 'package.json'), 'utf8')).version;
const nodeVersion = '24.22.1';
// Use this packaged build's own file ordering: its startup preflight hashes the
// complete target distribution, including native addons and mobile web assets.
const artifacts = createRequire(import.meta.url)(join(source, '..', 'app.asar.unpacked', 'out', 'shared', 'orcad-artifacts.js'));
const artifactVersions = {};
const encodedFiles = [];
const chunkedFiles = {};
const hashes = {
  x64: 'eb6728e77c576a35162c122c45ccadf224d89ff00abc8dae46cc2897c6002d7c',
  arm64: '33c37be234ba8bee041961047b19160f4d7d0f164e8e246f78bdd10feff148b3',
};
const sha256 = (path) => createHash('sha256').update(readFileSync(path)).digest('hex');
function copyVerified(root, files, output, inputPath = path => join(root, path)) {
  for (const [path, hash] of Object.entries(files)) {
    if (path.includes('..') || path.startsWith('/') || path.includes('\\')) throw new Error('Unsafe upstream asset path');
    const input = inputPath(path);
    if (sha256(input) !== hash) throw new Error(`Upstream daemon checksum mismatch: ${path}`);
    mkdirSync(join(output, path, '..'), { recursive: true });
    cpSync(input, join(output, path));
  }
}
if (version !== '1.4.244') throw new Error(`Review the runtime/Node pins before bundling Orca ${version}`);
if (manifest.commonSha256['orcad-server.js'] !== '64dae2b415759c0d5e0d73ff4622c10ac135a9eac7178eaa99e9c34a4ab0e392') throw new Error('Review the daemon artifact version before bundling a different build');
// Retire only files declared by the previous distribution manifest. Generated
// mobile asset names change between releases; retaining them bloats every kit.
const previousPath = join(destination, 'provenance.json');
if (existsSync(previousPath)) {
  const previous = JSON.parse(readFileSync(previousPath)).upstreamManifest;
  for (const [relative, next] of [['common', manifest.commonSha256], ...['x64', 'arm64'].map(arch => {
    const target = `linux-${arch}-glibc`; return [`targets/${target}`, manifest.targets[target].files];
  })]) {
    const old = relative === 'common' ? previous.commonSha256 : previous.targets[relative.slice(8)]?.files;
    for (const file of Object.keys(old ?? {})) {
      if (file.includes('..') || file.startsWith('/') || file.includes('\\')) throw Error('Unsafe previous asset path');
      if (!Object.hasOwn(next, file)) rmSync(join(destination, relative, file), { force: true });
    }
  }
}
copyVerified(source, manifest.commonSha256, join(destination, 'common'));
rmSync(join(destination, 'common', '.version'), { force: true });
for (const arch of ['x64', 'arm64']) {
  const target = `linux-${arch}-glibc`;
  const targetRoot = join(source, 'targets', target);
  // Template schema 4 shares ripgrep with the desktop's packaged resources.
  // Materialize and verify that reference in our self-contained distribution.
  const packagedRipgrep = artifacts.orcadTemplatePackagedRipgrep(manifest.schemaVersion, target, manifest.targets[target].packagedRipgrep);
  copyVerified(targetRoot, manifest.targets[target].files, join(destination, 'targets', target),
    file => join(file === packagedRipgrep ? resolve(source, '..') : targetRoot, file));
  const mobileAssets = artifacts.orcadMobileWebAssetFilenames(readFileSync(join(source, artifacts.ORCAD_MOBILE_WEB_MANIFEST), 'utf8'));
  const hash = createHash('sha256');
  for (const file of artifacts.orcadArtifactFilenames(target, mobileAssets)) {
    const base = Object.hasOwn(manifest.commonSha256, file) ? join(destination, 'common') : join(destination, 'targets', target);
    hash.update(readFileSync(join(base, file)));
  }
  artifactVersions[target] = `${artifacts.ORCAD_VERSION}+${hash.digest('hex').slice(0, 12)}`;
  writeFileSync(join(destination, 'targets', target, '.version'), artifactVersions[target] + '\n');
  const archive = `node-v${nodeVersion}-linux-${arch}.tar.gz`;
  const path = join(repositoryRoot, '.artifacts', 'daemon', 'node', archive);
  mkdirSync(join(path, '..'), { recursive: true });
  if (!existsSync(path)) command('curl', ['--fail', '--silent', '--show-error', '--location', '--retry', '3', `https://nodejs.org/dist/v${nodeVersion}/${archive}`, '--output', path], { progress: true });
  if (sha256(path) !== hashes[arch]) throw new Error(`Node archive checksum mismatch: ${archive}`);
  const executable = execFileSync('tar', ['-xOf', path, `node-v${nodeVersion}-linux-${arch}/bin/node`], { maxBuffer: 160 * 1024 ** 2, windowsHide: true });
  const executableHash = createHash('sha256').update(executable).digest('hex');
  if (executableHash !== readFileSync(join(targetRoot, '.runtime-node'), 'utf8').trim()) throw Error(`Node executable does not match upstream runtime marker: ${target}`);
}
// The App-backed MCP publishes UTF-8 files. Store PNGs and ABI-sensitive native
// modules as explicit base64 sidecars; the image materializer restores and checks
// their original upstream bytes before the daemon can be installed.
for (const [folder, files] of [['common', manifest.commonSha256], ...['x64', 'arm64'].map(arch => {
  const target = `linux-${arch}-glibc`; return [`targets/${target}`, manifest.targets[target].files];
})]) {
  for (const file of Object.keys(files)) if (/\.(?:png|woff2?)$/.test(file) || /\/(?:watcher|pty)\.node$/.test(file)) {
    const relative = `${folder}/${file}`, path = join(destination, relative);
    writeFileSync(path + '.b64', readFileSync(path).toString('base64') + '\n');
    rmSync(path); encodedFiles.push(relative);
  }
}
if (existsSync(previousPath)) for (const file of JSON.parse(readFileSync(previousPath)).encodedFiles ?? []) {
  if (file.includes('..') || file.startsWith('/') || file.includes('\\')) throw Error('Unsafe previous encoded asset path');
  if (!encodedFiles.includes(file)) rmSync(join(destination, file + '.b64'), { force: true });
}
// Large generated vendor files exceed MCPHub's request size. Compress and split
// their transport representation; the original bytes remain hash-verified.
function transportFiles(folder) {
  return readdirSync(join(destination, folder), { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? transportFiles(`${folder}/${entry.name}`) : [`${folder}/${entry.name}`]);
}
for (const file of [...transportFiles('common'), ...transportFiles('targets')]) {
  if (/\.gz\.b64\.\d+$/.test(file)) continue;
  const bytes = readFileSync(join(destination, file));
  if (bytes.length < 256 * 1024 || bytes.includes(0) || !Buffer.from(bytes.toString('utf8')).equals(bytes)) continue;
  const compressed = gzipSync(bytes), parts = [];
  for (let offset = 0; offset < compressed.length; offset += 192 * 1024) {
    const part = file + '.gz.b64.' + String(parts.length).padStart(3, '0');
    writeFileSync(join(destination, part), compressed.subarray(offset, offset + 192 * 1024).toString('base64') + '\n'); parts.push(part);
  }
  chunkedFiles[file] = { parts, sha256: createHash('sha256').update(bytes).digest('hex') }; rmSync(join(destination, file));
}
if (existsSync(previousPath)) for (const item of Object.values(JSON.parse(readFileSync(previousPath)).chunkedFiles ?? {})) {
  for (const part of item.parts) {
    if (part.includes('..') || part.startsWith('/') || part.includes('\\')) throw Error('Unsafe previous transport part');
    if (!Object.values(chunkedFiles).some(next => next.parts.includes(part))) rmSync(join(destination, part), { force: true });
  }
}
writeFileSync(join(destination, 'provenance.json'), JSON.stringify({ version, artifactVersions, nodeVersion, source: 'Orca packaged orcad-template; no runtime user data', nodeArchiveSha256: hashes, encodedFiles, chunkedFiles, upstreamManifest: manifest }, null, 2) + '\n');
console.log(`Bundled Orca ${version} and Node ${nodeVersion} for Linux x64/arm64.`);
