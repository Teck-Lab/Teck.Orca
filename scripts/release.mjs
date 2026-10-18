import { createHash } from 'node:crypto';
import { cpSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const sha256 = (value) => createHash('sha256').update(value).digest('hex');
export const defaultReleasesRoot = () => join(homedir(), '.teck-orca', 'releases');

export function pluginEntrySource(digest) {
  if (!/^[a-f0-9]{64}$/.test(digest)) throw new Error('Invalid runtime digest');
  // Only this dependency closure can execute during activation/recovery. SDK
  // archives are checked at installation and by the recipe launcher, not on
  // Orca's ten-second plugin-start deadline.
  const codeFiles = ['runtime/plugin-entry.mjs', 'runtime/reconnect-host.mjs', 'scripts/lifecycle.mjs',
    'runtime/project-state.mjs', 'runtime/project-transport.mjs'];
  return `import fs from 'node:fs';import p from 'node:path';import c from 'node:crypto';import os from 'node:os';import{pathToFileURL}from 'node:url';\nexport default async function activate(orca){const hash=x=>c.createHash('sha256').update(x).digest('hex');const root=p.join(process.env.TECK_ORCA_RELEASES_DIR||p.join(os.homedir(),'.teck-orca','releases'),'${digest}');const raw=fs.readFileSync(p.join(root,'release.json'));if(hash(raw)!=='${digest}')throw Error('Runtime manifest mismatch; run npm run setup');const manifest=JSON.parse(raw);for(const f of ${JSON.stringify(codeFiles)}){const h=manifest[f];if(typeof h!=='string')throw Error('Missing runtime file: '+f);const t=p.join(root,f);if(!fs.lstatSync(t).isFile()||hash(fs.readFileSync(t))!==h)throw Error('Changed runtime file: '+f)}const m=await import(pathToFileURL(p.join(root,'runtime/plugin-entry.mjs')).href);return m.default(orca)}\n`;
}

function files(root, relative = '') {
  return readdirSync(join(root, relative), { withFileTypes: true }).flatMap((entry) => {
    const path = [relative, entry.name].filter(Boolean).join('/');
    if (entry.isSymbolicLink()) throw new Error(`Runtime symlinks are unsupported: ${path}`);
    return entry.isDirectory() ? files(root, path) : [path];
  });
}

export function releaseManifest(root = repositoryRoot) {
  const paths = ['scripts/lifecycle.mjs', ...files(join(root, 'runtime')).map((path) => `runtime/${path}`)].sort();
  const manifest = Object.fromEntries(paths.map((path) => [path, sha256(readFileSync(join(root, path)))]));
  const json = JSON.stringify(manifest) + '\n';
  return { manifest, json, digest: sha256(json) };
}

export function verifyRelease(root, digest) {
  const raw = readFileSync(join(root, 'release.json'));
  if (sha256(raw) !== digest) throw new Error('Teck.Orca release manifest does not match the approved recipe');
  for (const [path, hash] of Object.entries(JSON.parse(raw))) {
    if (path.startsWith('/') || path.includes('\\') || path.split('/').some((part) => part === '..')) {
      throw new Error('Unsafe runtime manifest path');
    }
    const target = join(root, path);
    if (!lstatSync(target).isFile() || sha256(readFileSync(target)) !== hash) throw new Error(`Runtime file changed: ${path}`);
  }
}

export function installRelease(root = repositoryRoot, releasesRoot = defaultReleasesRoot()) {
  const { manifest, json, digest } = releaseManifest(root);
  const destination = join(releasesRoot, digest);
  if (existsSync(destination)) {
    verifyRelease(destination, digest);
    return { digest, destination };
  }
  mkdirSync(releasesRoot, { recursive: true });
  const staging = join(releasesRoot, `.install-${digest}-${process.pid}`);
  mkdirSync(staging, { recursive: false });
  for (const path of Object.keys(manifest)) {
    const target = join(staging, path);
    mkdirSync(dirname(target), { recursive: true });
    cpSync(join(root, path), target);
  }
  writeFileSync(join(staging, 'release.json'), json);
  verifyRelease(staging, digest);
  try { renameSync(staging, destination); } catch (error) {
    // Another installer may have published the same immutable release first.
    if (!existsSync(destination)) throw error;
    verifyRelease(destination, digest);
  }
  return { digest, destination };
}

export function recipeCommand(digest, mode, entry = 'scripts/lifecycle.mjs') {
  if (!/^[a-f0-9]{64}$/.test(digest) || !['create', 'resume', 'suspend', 'destroy'].includes(mode) || !['scripts/lifecycle.mjs', 'runtime/project-recipe.mjs'].includes(entry)) throw new Error('Invalid recipe identity');
  // Both cmd.exe and POSIX sh accept this wrapper; no filesystem path is interpolated into shell code.
  // Orca supplies stdin to this process for lifecycle payloads, unchanged by the wrapper.
  const source = `const fs=require('node:fs'),p=require('node:path'),c=require('node:crypto');const hash=x=>c.createHash('sha256').update(x).digest('hex');const root=p.join(process.env.TECK_ORCA_RELEASES_DIR||p.join(require('node:os').homedir(),'.teck-orca','releases'),'${digest}');try{const raw=fs.readFileSync(p.join(root,'release.json'));if(hash(raw)!=='${digest}')throw Error('Release manifest mismatch');for(const [f,h]of Object.entries(JSON.parse(raw))){if(f.startsWith('/')||f.includes('\\\\')||f.split('/').includes('..'))throw Error('Unsafe release path');const t=p.join(root,f);if(!fs.lstatSync(t).isFile()||hash(fs.readFileSync(t))!==h)throw Error('Changed release file: '+f)}import(require('node:url').pathToFileURL(p.join(root,'scripts','lifecycle.mjs')).href).then(m=>m.main('${mode}')).catch(e=>{console.error(e.message);process.exitCode=1})}catch(e){console.error('Teck.Orca runtime unavailable or changed; run npm run setup in the matching checkout. '+e.message);process.exitCode=1}`;
  const selectedSource = entry === 'scripts/lifecycle.mjs' ? source : source.replace("p.join(root,'scripts','lifecycle.mjs')", "p.join(root,'runtime','project-recipe.mjs')");
  const code = `eval(Buffer.from('${Buffer.from(selectedSource).toString('base64')}','base64').toString())`;
  return `node -e "${code}"`;
}
