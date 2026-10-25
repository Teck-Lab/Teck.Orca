import {createHash} from 'node:crypto';
import {lstatSync,readFileSync,readdirSync} from 'node:fs';
import {join} from 'node:path';
import {parseYaml} from './layout.mjs';

export const checksum=value=>createHash('sha256').update(value).digest('hex');
export function bootstrapRevision(bundle){
  // Ordinary GitOps resource/template changes reconcile in Argo. Only the
  // pinned runtime/topology/controller configuration requires explicit migration.
  const files=Object.fromEntries(Object.entries(bundle.files).filter(([name])=>name==='bootstrap/local/components.lock.json'||name.startsWith('bootstrap/local/workspace/')||(name.startsWith('apps/local/')&&name.endsWith('/values.yaml'))));
  return checksum(JSON.stringify(files));
}
const validPath=name=>typeof name==='string'&&/^[a-zA-Z0-9_.-]+(?:\/[a-zA-Z0-9_.-]+)*$/.test(name)&&!name.split('/').some(n=>['.','..'].includes(n))&&/\.(?:json|yaml|md|pl)$/.test(name)&&name!=='snapshot.json';
export function bundleSnapshot({files,revision,dirty=false}){
  if(!/^[a-f0-9]{40}$/.test(revision))throw Error('GitOps source revision must be recorded');
  const entries=Object.entries(files).sort(([a],[b])=>a.localeCompare(b));
  if(!entries.length||entries.length>1000)throw Error('Invalid bundle inventory');
  let size=0;
  for(const [name,value] of entries){
    if(!validPath(name))throw Error('Invalid bundle path');
    const bytes=Buffer.from(value),text=bytes.toString('utf8');size+=bytes.length;
    if(!Buffer.from(text).equals(bytes)||bytes.includes(0)||size>32*1024**2)throw Error('Invalid bundle encoding or size');
    if(/-----BEGIN (?:[A-Z ]+ )?PRIVATE KEY-----/.test(text))throw Error('A bundle must not contain private key material');
  }
  const hashes=Object.fromEntries(entries.map(([name,text])=>[name,checksum(text)]));
  return {schemaVersion:1,repository:'https://github.com/Teck-Lab/Teck.GitOps',revision,dirty:dirty===true,
    contentSha256:checksum(JSON.stringify(hashes)),files:hashes};
}
export function bundleFiles(root,prefix=''){
  if(lstatSync(root).isSymbolicLink())throw Error('Bundle symlinks are forbidden');
  return readdirSync(root,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name)).flatMap(entry=>{
    if(entry.isSymbolicLink()||(!entry.isFile()&&!entry.isDirectory()))throw Error('Unsupported bundle entry');
    const name=prefix+entry.name;
    return entry.isDirectory()?bundleFiles(join(root,entry.name),name+'/'):[name];
  });
}
export function loadBundle(root){
  const manifest=JSON.parse(readFileSync(join(root,'snapshot.json'),'utf8'));
  if(manifest.schemaVersion!==1||typeof manifest.files!=='object'||!manifest.files||Array.isArray(manifest.files))throw Error('Invalid bundle manifest');
  const names=bundleFiles(root).filter(n=>n!=='snapshot.json');
  if(JSON.stringify(names.sort())!==JSON.stringify(Object.keys(manifest.files).sort()))throw Error('Bundle inventory changed');
  const contents=Object.fromEntries(names.map(name=>{if(!validPath(name))throw Error('Invalid bundle path');return [name,readFileSync(join(root,name))];}));
  const actual=bundleSnapshot({files:contents,revision:manifest.revision,dirty:manifest.dirty});
  if(actual.repository!==manifest.repository||actual.contentSha256!==manifest.contentSha256||Object.entries(actual.files).some(([name,hash])=>manifest.files[name]!==hash))throw Error('Bundle checksum mismatch');
  const read=name=>{if(!Object.hasOwn(contents,name))throw Error('File not in verified bundle');return contents[name].toString('utf8');};
  return {...actual,root,read,json:name=>JSON.parse(read(name)),yaml:name=>parseYaml(read(name))};
}
