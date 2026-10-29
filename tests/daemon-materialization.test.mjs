import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { materializeBundle } from '../runtime/kits/orcad/materialize-bundle.mjs';
import { gzipSync } from 'node:zlib';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'teck-daemon-materialize-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const binary = Buffer.from([0, 255, 128, 42]), archive = Buffer.from('pinned archive fixture');
  const file = 'targets/linux-x64-glibc/node_modules/node-pty/build/Release/pty.node';
  mkdirSync(join(root, file, '..'), { recursive: true });
  writeFileSync(join(root, file + '.b64'), binary.toString('base64') + '\n');
  const metadata = { encodedFiles: [file], nodeVersion: '24.22.1', nodeArchiveSha256: { x64: hash(archive) },
    upstreamManifest: { targets: { 'linux-x64-glibc': { files: { 'node_modules/node-pty/build/Release/pty.node': hash(binary) } } } } };
  const save = () => writeFileSync(join(root, 'provenance.json'), JSON.stringify(metadata)); save();
  return { root, binary, archive, file, metadata, save };
}
test('image materialization restores exact native bytes only after the pinned archive verifies', async t => {
  const f = fixture(t);
  await materializeBundle(f.root, 'x64', async url => {
    assert.equal(url, 'https://nodejs.org/dist/v24.22.1/node-v24.22.1-linux-x64.tar.gz');
    return new Response(f.archive);
  });
  assert.deepEqual(readFileSync(join(f.root, f.file)), f.binary);
  assert.equal(existsSync(join(f.root, f.file + '.b64')), false);
  assert.deepEqual(readFileSync(join(f.root, 'node/node-v24.22.1-linux-x64.tar.gz')), f.archive);
});
test('corrupt downloads and untrusted encoded bytes cannot produce an installable bundle', async t => {
  const f = fixture(t);
  await assert.rejects(materializeBundle(f.root, 'x64', async () => new Response('corrupt')), /archive checksum mismatch/);
  assert.equal(existsSync(join(f.root, f.file)), false);
  assert.equal(existsSync(join(f.root, 'node/node-v24.22.1-linux-x64.tar.gz')), false);
  writeFileSync(join(f.root, f.file + '.b64'), Buffer.from('wrong native module').toString('base64'));
  await assert.rejects(materializeBundle(f.root, 'x64', async () => { throw Error('must not download'); }), /asset checksum mismatch/);
  f.metadata.encodedFiles = ['../outside']; f.save();
  await assert.rejects(materializeBundle(f.root, 'x64'), /Unsafe encoded asset/);
  await assert.rejects(materializeBundle(f.root, 'other'), /Unsupported/);
});

test('split compressed vendor files reconstruct the original bytes and reject substituted content', async t => {
  const f = fixture(t), file = 'common/vendor.js', content = Buffer.from('export const version = "1.4.244";\n');
  const compressed = gzipSync(content), parts = [file + '.gz.b64.000', file + '.gz.b64.001'];
  mkdirSync(join(f.root, 'common'));
  for (const [index, bytes] of [compressed.subarray(0, 12), compressed.subarray(12)].entries())
    writeFileSync(join(f.root, parts[index]), bytes.toString('base64'));
  f.metadata.chunkedFiles = { [file]: { parts, sha256: hash(Buffer.from('substituted')) } }; f.save();
  await assert.rejects(materializeBundle(f.root, 'x64', async () => new Response(f.archive)), /Transport asset checksum mismatch/);
  assert.equal(existsSync(join(f.root, file)), false);
  f.metadata.chunkedFiles[file].sha256 = hash(content); f.save();
  await materializeBundle(f.root, 'x64', async () => new Response(f.archive));
  assert.deepEqual(readFileSync(join(f.root, file)), content);
  assert.ok(parts.every(part => !existsSync(join(f.root, part))));
});
