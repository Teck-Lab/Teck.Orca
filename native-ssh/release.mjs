import { createHash, randomUUID } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

const hash = value => createHash('sha256').update(value).digest('hex');
export const releasesRoot = () => join(homedir(), '.teck-orca-native-ssh', 'releases');
export function snapshot(files) {
  const manifest = Object.fromEntries(Object.keys(files).sort().map(name => [name, hash(files[name])]));
  const json = JSON.stringify(manifest) + '\n';
  return { manifest, json, digest: hash(json) };
}
export function verifyRelease(destination, digest) {
  const raw = readFileSync(join(destination, 'release.json'));
  if (hash(raw) !== digest) throw Error('Preview release manifest changed');
  for (const [name, expected] of Object.entries(JSON.parse(raw))) {
    if (name.startsWith('/') || name.includes('\\') || name.split('/').includes('..')) throw Error('Unsafe preview release path');
    const path = join(destination, name);
    if (!lstatSync(path).isFile() || hash(readFileSync(path)) !== expected) throw Error(`Preview release changed: ${name}`);
  }
}
export function installRelease(files, root = releasesRoot()) {
  const { digest, json } = snapshot(files), destination = join(root, digest);
  if (existsSync(destination)) { verifyRelease(destination, digest); return { digest, destination }; }
  const staging = join(root, `.install-${randomUUID()}`);
  for (const [name, bytes] of Object.entries(files)) {
    const path = join(staging, name); mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, bytes);
  }
  writeFileSync(join(staging, 'release.json'), json);
  verifyRelease(staging, digest);
  try { renameSync(staging, destination); }
  catch (error) { if (!existsSync(destination)) throw error; verifyRelease(destination, digest); }
  return { digest, destination };
}
export function recipeCommand(digest, mode) {
  if (!/^[a-f0-9]{64}$/.test(digest) || !['create', 'suspend', 'resume'].includes(mode)) throw Error('Invalid preview recipe identity');
  const source = `const fs=require('node:fs'),p=require('node:path'),c=require('node:crypto');const hash=x=>c.createHash('sha256').update(x).digest('hex');const root=p.join(process.env.TECK_ORCA_NATIVE_SSH_RELEASES_DIR||p.join(require('node:os').homedir(),'.teck-orca-native-ssh','releases'),'${digest}');(async()=>{const raw=fs.readFileSync(p.join(root,'release.json'));if(hash(raw)!=='${digest}')throw Error('Preview release manifest changed');for(const[f,h]of Object.entries(JSON.parse(raw))){if(f.startsWith('/')||f.includes('\\\\')||f.split('/').includes('..'))throw Error('Unsafe release path');const t=p.join(root,f);if(!fs.lstatSync(t).isFile()||hash(fs.readFileSync(t))!==h)throw Error('Preview release changed: '+f)}const m=await import(require('node:url').pathToFileURL(p.join(root,'src','recipe.mjs')).href);await m.main('${mode}')})().catch(e=>{console.error('Teck SSH preview: '+e.message);process.exitCode=1})`;
  return `node -e "eval(Buffer.from('${Buffer.from(source).toString('base64')}','base64').toString())"`;
}
