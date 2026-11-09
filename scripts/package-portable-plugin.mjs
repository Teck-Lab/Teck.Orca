import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { gzipSync } from 'node:zlib';
import { repositoryRoot } from './release.mjs';
import { packageFiles, validatePackage } from './plugin-package.mjs';
import { runtimeFiles, nativeRecipe } from '../native-ssh/build.mjs';
import { snapshot } from '../native-ssh/release.mjs';

const sha = value => createHash('sha256').update(value).digest('hex');
function tree(source, prefix = '') {
  return fs.readdirSync(join(source, prefix), { withFileTypes: true }).sort((a,b)=>a.name.localeCompare(b.name)).flatMap(entry => {
    const name = prefix + entry.name;
    if (entry.isSymbolicLink()) throw Error('Portable runtime symlink refused: ' + name);
    if (name === 'kits/orcad/bundle') return [];
    if (entry.isDirectory()) return tree(source, name + '/');
    if (!entry.isFile()) throw Error('Unsupported portable runtime entry');
    return [[name, fs.readFileSync(join(source, name))]];
  });
}

export function portableEntry({ hostDigest, nativeDigest, nativeHash }) {
  for (const digest of [hostDigest, nativeDigest, nativeHash]) if (!/^[a-f0-9]{64}$/.test(digest)) throw Error('Invalid portable identity');
  return `import {fileURLToPath} from 'node:url';
import {verifyBundledRuntime,ensureNativeRuntime} from './portable-bootstrap.mjs';
let implementation;
export default async function activate(orca){
  const root=fileURLToPath(new URL('./host/',import.meta.url));
  verifyBundledRuntime(root,'${hostDigest}');
  ensureNativeRuntime(fileURLToPath(new URL('./native-runtime.json.gz',import.meta.url)),'${nativeHash}','${nativeDigest}');
  implementation=await import(new URL('./host/runtime/plugin-entry.mjs',import.meta.url).href);
  return implementation.default(orca);
}
export function deactivate(){return implementation?.deactivate?.();}
`;
}

export function portablePackageFiles({ source = repositoryRoot, kitRelease } = {}) {
  if (!kitRelease) {
    const path = join(source, 'kits/release-lock.json');
    if (!fs.existsSync(path)) throw Error('Publish and sign the v3 kit set first; a real kits/release-lock.json is required for a portable plugin.');
    kitRelease = JSON.parse(fs.readFileSync(path, 'utf8'));
  }
  const pluginVersion = JSON.parse(fs.readFileSync(join(source, 'orca-plugin.json'), 'utf8')).version;
  const packageVersion = JSON.parse(fs.readFileSync(join(source, 'package.json'), 'utf8')).version;
  if (!pluginVersion || pluginVersion !== packageVersion || kitRelease.version !== pluginVersion)
    throw Error('Portable plugin, package and published kit release versions must match');
  const native = runtimeFiles(source, { kitRelease, portable: true });
  if (!native['assets/kit-release.json']) throw Error('Portable native runtime must include a validated kit release');
  const nativeRelease = snapshot(native);
  const archive = gzipSync(Buffer.from(JSON.stringify({ manifest: nativeRelease.json,
    files: Object.fromEntries(Object.entries(native).map(([name,bytes])=>[name,bytes.toString('base64')])) })), { level: 9 });
  const host = Object.fromEntries(tree(join(source, 'runtime')).map(([name,data])=>['runtime/'+name,data]));
  host['scripts/lifecycle.mjs'] = fs.readFileSync(join(source, 'scripts/lifecycle.mjs'));
  const hostRelease = snapshot(host);
  const files = packageFiles(source);
  for (const [name,data] of Object.entries(host)) files['host/'+name] = data;
  files['host/release.json'] = Buffer.from(hostRelease.json);
  files['native-runtime.json.gz'] = archive;
  files['portable-bootstrap.mjs'] = fs.readFileSync(new URL('./portable-bootstrap.mjs', import.meta.url));
  files['reconnect.mjs'] = Buffer.from(portableEntry({ hostDigest: hostRelease.digest, nativeDigest: nativeRelease.digest, nativeHash: sha(archive) }));
  files['recipes/native-ssh-project.json'] = Buffer.from(JSON.stringify(nativeRecipe(source, { kitRelease, portable: true }), null, 2) + '\n');
  files['portable-release.json'] = Buffer.from(JSON.stringify({ schemaVersion: 1, kitVersion: kitRelease.version,
    kitSourceCommit: kitRelease.sourceCommit, hostDigest: hostRelease.digest, nativeDigest: nativeRelease.digest,
    nativeArchiveHash: sha(archive) }, null, 2) + '\n');
  return files;
}

export function buildPortablePlugin({ source = repositoryRoot, destination, kitRelease, check = false } = {}) {
  if (!destination) throw Error('Specify an isolated portable plugin output directory');
  source = resolve(source); destination = resolve(destination);
  const watched = join(source, 'plugin');
  if (destination === watched || destination.startsWith(watched + sep)) throw Error('Portable packaging cannot write the watched plugin folder; use a release staging directory.');
  if (destination === source || source.startsWith(destination + sep)) throw Error('Output cannot contain the source repository');
  const files = portablePackageFiles({ source, kitRelease });
  if (!check) for (const [name,data] of Object.entries(files)) {
    const path = join(destination,name);
    let parent = destination;
    for (const part of name.split('/')) {
      if (fs.existsSync(parent) && fs.lstatSync(parent).isSymbolicLink()) throw Error('Portable output symlink refused');
      parent = join(parent,part);
    }
    if (fs.existsSync(path) && fs.lstatSync(path).isSymbolicLink()) throw Error('Portable output symlink refused');
    fs.mkdirSync(dirname(path), { recursive: true }); fs.writeFileSync(path,data);
  }
  return { destination, ...validatePackage(destination,files) };
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const args = process.argv.slice(2), options = {};
  while (args.length) {
    const arg=args.shift();
    if (arg==='--check') options.check=true;
    else if (['--source','--output','--kit-release'].includes(arg)) {
      const value=args.shift(); if (!value || value.startsWith('--')) throw Error('Missing '+arg+' value');
      if (arg==='--kit-release') options.kitRelease=JSON.parse(fs.readFileSync(value,'utf8'));
      else options[arg==='--output'?'destination':'source']=value;
    } else throw Error('Unknown portable packaging option: '+arg);
  }
  console.log(JSON.stringify(buildPortablePlugin(options)));
}
