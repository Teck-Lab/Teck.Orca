import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { installKubernetesTools, kubernetesTools } from '../runtime/kits/workload/kubernetes-tools.mjs';

const lock = JSON.parse(readFileSync(new URL('../runtime/kits/workload/devtools.json', import.meta.url)));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
function fixture(t) {
  const destination = mkdtempSync(join(tmpdir(), 'teck-kubernetes-test-'));
  t.after(() => rmSync(destination, { recursive: true, force: true }));
  const bytes = { kind: Buffer.from('kind fixture'), kubectl: Buffer.from('kubectl fixture') };
  const config = { native: Object.fromEntries(Object.entries(bytes).map(([name, data]) => [name, { version: name === 'kind' ? '0.33.0' : '1.37.1', sha256: { x64: sha(data), arm64: sha(data) } }])) };
  const probes = [];
  return { destination, config, bytes, options: { lock: config, arch: 'x64', destination,
    download: (tool, file) => writeFileSync(file, bytes[tool.name]), verifyVersion: (tool, file) => probes.push({ tool: tool.name, bytes: readFileSync(file) }) }, probes };
}
test('kind and kubectl are pinned with checksums and official architecture-specific URLs', () => {
  assert.equal(lock.native.kind.version, '0.33.0');
  assert.equal(lock.native.kubectl.version, '1.37.1');
  for (const arch of ['x64', 'arm64']) {
    const tools = kubernetesTools(lock, arch);
    assert.deepEqual(tools.map(t => t.name), ['kind', 'kubectl']);
    for (const tool of tools) assert.match(tool.sha256, /^[a-f0-9]{64}$/);
    assert.match(tools[0].url, new RegExp('github.com/kubernetes-sigs/kind/releases/download/v0.33.0/kind-linux-'+(arch === 'x64' ? 'amd64' : arch)));
    assert.match(tools[1].url, new RegExp('dl.k8s.io/release/v1.37.1/bin/linux/'+(arch === 'x64' ? 'amd64' : arch)+'/kubectl'));
  }
  assert.throws(() => kubernetesTools(lock, 'ia32'), /architecture/);
});
test('verified tools are installed and repeat installation leaves the same bytes', t => {
  const f = fixture(t);
  const result = installKubernetesTools(f.options);
  assert.equal(result.length, 2);
  for (const [name, bytes] of Object.entries(f.bytes)) assert.deepEqual(readFileSync(join(f.destination, name)), bytes);
  installKubernetesTools(f.options);
  assert.equal(f.probes.length, 4);
});
test('a failed checksum or version check preserves both existing executables', t => {
  const f = fixture(t);
  for (const name of ['kind', 'kubectl']) writeFileSync(join(f.destination, name), 'previous '+name);
  assert.throws(() => installKubernetesTools({ ...f.options, download: (tool, file) => writeFileSync(file, tool.name === 'kubectl' ? 'tampered' : f.bytes.kind) }), /checksum/i);
  assert.throws(() => installKubernetesTools({ ...f.options, verifyVersion: () => { throw Error('wrong version'); } }), /wrong version/);
  for (const name of ['kind', 'kubectl']) assert.equal(readFileSync(join(f.destination, name), 'utf8'), 'previous '+name);
});
test('invalid pins fail before downloading or changing the installation', t => {
  const f = fixture(t); let downloads = 0;
  assert.throws(() => installKubernetesTools({ ...f.options, lock: { native: {} }, download: () => downloads++ }), /pin/);
  assert.equal(downloads, 0);
  assert.equal(existsSync(join(f.destination, 'kind')), false);
});
