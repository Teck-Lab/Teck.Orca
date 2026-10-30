// Build-time only: restore transport-encoded vendor bytes and fetch the pinned
// Node archive. Nothing is downloaded when an installed sandbox reconnects.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { gunzipSync } from 'node:zlib';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
export async function materializeBundle(root, arch, fetcher = fetch) {
  if (!['x64', 'arm64'].includes(arch)) throw Error('Unsupported daemon architecture');
  const metadata = JSON.parse(readFileSync(join(root, 'provenance.json')));
  const restored = new Map();
  for (const [file, item] of Object.entries(metadata.chunkedFiles ?? {})) {
    if (!/^(?:common|targets\/linux-(?:x64|arm64)-glibc)\//.test(file) || file.includes('..') || file.includes('\\')) throw Error('Unsafe transport asset path');
    if (!Array.isArray(item.parts) || !item.parts.length || item.parts.length > 1000) throw Error('Invalid transport parts');
    const buffers = item.parts.map((part, index) => {
      if (part !== file + '.gz.b64.' + String(index).padStart(3, '0')) throw Error('Unsafe transport part');
      return Buffer.from(readFileSync(join(root, part), 'utf8').trim(), 'base64');
    });
    const bytes = gunzipSync(Buffer.concat(buffers));
    if (hash(bytes) !== item.sha256) throw Error('Transport asset checksum mismatch');
    restored.set(file, bytes);
  }
  const decoded = [];
  for (const file of metadata.encodedFiles ?? []) {
    if (file.startsWith('/') || file.includes('..') || file.includes('\\')) throw Error('Unsafe encoded asset path');
    const match = /^(common|targets\/(linux-(?:x64|arm64)-glibc))\/(.+)$/.exec(file);
    if (!match) throw Error('Invalid encoded asset location');
    const expected = match[1] === 'common' ? metadata.upstreamManifest.commonSha256[match[3]] : metadata.upstreamManifest.targets[match[2]].files[match[3]];
    const bytes = Buffer.from((restored.get(file + '.b64') ?? readFileSync(join(root, file + '.b64'))).toString('utf8').trim(), 'base64');
    if (!expected || hash(bytes) !== expected) throw Error('Encoded upstream asset checksum mismatch: ' + file);
    decoded.push([file, bytes]);
  }
  const version = metadata.nodeVersion, expected = metadata.nodeArchiveSha256[arch];
  if (!/^\d+\.\d+\.\d+$/.test(version) || !/^[a-f0-9]{64}$/.test(expected)) throw Error('Invalid pinned Node identity');
  const archive = `node-v${version}-linux-${arch}.tar.gz`;
  const response = await fetcher(`https://nodejs.org/dist/v${version}/${archive}`, { redirect: 'error', signal: AbortSignal.timeout(180000) });
  if (!response.ok) throw Error('Pinned Node download failed: HTTP ' + response.status);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (hash(bytes) !== expected) throw Error('Pinned Node archive checksum mismatch');
  for (const [file, content] of restored) {
    writeFileSync(join(root, file), content);
    for (const part of metadata.chunkedFiles[file].parts) rmSync(join(root, part));
  }
  for (const [file, content] of decoded) {
    writeFileSync(join(root, file), content); rmSync(join(root, file + '.b64'));
  }
  mkdirSync(join(root, 'node'), { recursive: true });
  writeFileSync(join(root, 'node', archive), bytes);
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  await materializeBundle('/usr/share/teck-orcad/bundle', process.arch);
