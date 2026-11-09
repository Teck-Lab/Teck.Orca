// Shipped with the approved plugin. Materializes only its bundled immutable
// recipe runtime; it never provisions a sandbox or changes a saved connection.
import fs from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { gunzipSync } from 'node:zlib';

const hash = value => createHash('sha256').update(value).digest('hex');
const safeName = name => typeof name === 'string' && name.length <= 1024 && !name.includes('\\') &&
  !name.includes(':') && !name.includes('\0') && !name.split('/').some(p => !p || p === '.' || p === '..');

function regularPath(root, name) {
  if (!safeName(name)) throw Error('Invalid bundled runtime path');
  let current = resolve(root);
  if (fs.existsSync(current) && fs.lstatSync(current).isSymbolicLink()) throw Error('Runtime root is a symlink');
  for (const part of name.split('/')) {
    current = join(current, part);
    if (fs.existsSync(current) && fs.lstatSync(current).isSymbolicLink()) throw Error('Runtime path is a symlink');
  }
  return current;
}

export function verifyBundledRuntime(root, digest) {
  if (!/^[a-f0-9]{64}$/.test(digest)) throw Error('Invalid bundled runtime digest');
  const raw = fs.readFileSync(regularPath(root, 'release.json'));
  if (hash(raw) !== digest) throw Error('Bundled runtime manifest mismatch');
  const manifest = JSON.parse(raw);
  if (!manifest || Array.isArray(manifest) || Object.keys(manifest).length > 2000) throw Error('Invalid bundled runtime manifest');
  for (const [name, expected] of Object.entries(manifest)) {
    const path = regularPath(root, name);
    if (!/^[a-f0-9]{64}$/.test(expected) || !fs.lstatSync(path).isFile() || hash(fs.readFileSync(path)) !== expected)
      throw Error('Changed bundled runtime file: ' + name);
  }
  return manifest;
}

export function ensureNativeRuntime(payloadPath, payloadHash, digest,
  releasesRoot = process.env.TECK_ORCA_NATIVE_SSH_RELEASES_DIR || join(homedir(), '.teck-orca-native-ssh', 'releases')) {
  if (!/^[a-f0-9]{64}$/.test(payloadHash) || !/^[a-f0-9]{64}$/.test(digest)) throw Error('Invalid bundled runtime identity');
  const payload = fs.readFileSync(payloadPath);
  if (hash(payload) !== payloadHash) throw Error('Bundled native runtime archive mismatch');
  const destination = regularPath(releasesRoot, digest);
  if (fs.existsSync(destination)) { verifyBundledRuntime(destination, digest); return destination; }
  const bundle = JSON.parse(gunzipSync(payload, { maxOutputLength: 32 * 1024 * 1024 }));
  if (!bundle || typeof bundle.manifest !== 'string' || !bundle.files || Array.isArray(bundle.files) || hash(bundle.manifest) !== digest)
    throw Error('Invalid bundled native runtime');
  const manifest = JSON.parse(bundle.manifest);
  const names = Object.keys(manifest);
  if (!names.length || names.length > 2000 || JSON.stringify(names.sort()) !== JSON.stringify(Object.keys(bundle.files).sort()))
    throw Error('Bundled native file set mismatch');
  let bytes = 0;
  const files = names.map(name => {
    if (!safeName(name) || name === 'release.json' || typeof bundle.files[name] !== 'string') throw Error('Invalid bundled runtime path');
    const data = Buffer.from(bundle.files[name], 'base64');
    bytes += data.length;
    if (bytes > 24 * 1024 * 1024 || hash(data) !== manifest[name]) throw Error('Bundled native file mismatch: ' + name);
    return [name, data];
  });
  fs.mkdirSync(releasesRoot, { recursive: true });
  const staging = regularPath(releasesRoot, '.install-' + randomUUID());
  fs.mkdirSync(staging);
  try {
    for (const [name, data] of files) {
      const path = regularPath(staging, name);
      fs.mkdirSync(dirname(path), { recursive: true });
      fs.writeFileSync(path, data, { flag: 'wx' });
    }
    fs.writeFileSync(join(staging, 'release.json'), bundle.manifest, { flag: 'wx' });
    verifyBundledRuntime(staging, digest);
    try { fs.renameSync(staging, destination); }
    catch (error) { if (!fs.existsSync(destination)) throw error; verifyBundledRuntime(destination, digest); }
    return destination;
  } finally {
    // staging is a UUID child created by this invocation, never a project path.
    if (fs.existsSync(staging)) fs.rmSync(staging, { recursive: true, force: true });
  }
}
