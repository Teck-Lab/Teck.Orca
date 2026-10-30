// Explicit maintenance only: build/startup never downloads or rewrites YAML.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { hardenYaml, sha256, yamlRelease } from './lib/yaml-hardening.mjs';

const repository = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const destination = join(repository, 'runtime/kubernetes/vendor/yaml');
const walk = root => readdirSync(root, { withFileTypes: true }).flatMap(entry => {
  if (entry.isSymbolicLink()) throw Error('Unexpected symlink in YAML vendor tree');
  const file = join(root, entry.name);
  return entry.isDirectory() ? walk(file) : [file];
});
if (process.argv.includes('--check')) {
  const provenance = JSON.parse(readFileSync(join(destination, 'provenance.json')));
  assert.equal(provenance.version, yamlRelease.version);
  assert.equal(provenance.integrity, yamlRelease.integrity);
  assert.equal(provenance.hardeningSourceSha256, sha256(readFileSync(join(repository, 'scripts/lib/yaml-hardening.mjs'))));
  const actual = Object.fromEntries(walk(destination).filter(file => basename(file) !== 'provenance.json')
    .map(file => [relative(destination, file).replaceAll('\\', '/'), sha256(readFileSync(file))]));
  assert.deepEqual(actual, provenance.files, 'YAML vendor inventory/hashes differ from provenance');
  assert.equal(provenance.patches.length, 2);
  for (const patch of provenance.patches) assert.equal(actual[patch.file], patch.patchedSha256);
  console.log('Verified pinned YAML ' + provenance.version + ', both scalar-hardening patches and all vendor hashes.');
} else {
  const response = await fetch(yamlRelease.url, { signal: AbortSignal.timeout(60_000) });
  if (!response.ok) throw Error('YAML archive download HTTP ' + response.status);
  const bytes = Buffer.from(await response.arrayBuffer());
  assert.equal('sha512-' + createHash('sha512').update(bytes).digest('base64'), yamlRelease.integrity, 'YAML archive integrity mismatch');
  const staging = mkdtempSync(join(tmpdir(), 'teck-yaml-vendor-'));
  try {
    const archive = join(staging, 'yaml.tgz');
    writeFileSync(archive, bytes);
    const names = execFileSync('tar', ['-tzf', archive], { encoding: 'utf8', windowsHide: true }).trim().split(/\r?\n/);
    assert.ok(names.every(name => name.startsWith('package/') && !name.split('/').includes('..') && !name.includes('\\')));
    execFileSync('tar', ['-xzf', archive, '-C', staging], { windowsHide: true });
    const root = join(staging, 'package');
    assert.equal(JSON.parse(readFileSync(join(root, 'package.json'))).version, yamlRelease.version);
    const upstream = Object.fromEntries([...walk(join(root, 'dist')), join(root, 'package.json'), join(root, 'LICENSE')]
      .map(file => [relative(root, file).replaceAll('\\', '/'), readFileSync(file)]));
    const { files, patches } = hardenYaml(upstream);
    if (existsSync(destination)) {
      const obsolete = walk(destination).map(file => relative(destination, file).replaceAll('\\', '/'))
        .filter(name => name !== 'provenance.json' && !Object.hasOwn(files, name));
      assert.deepEqual(obsolete, [], 'Unexpected existing vendor files: inspect before removing them');
    }
    const provenance = { name: 'yaml', ...yamlRelease, license: 'ISC', source: 'https://github.com/eemeli/yaml',
      parserBackport: 'https://github.com/eemeli/yaml/blob/1420d2dbfecf43f89ff1bc6b3ca6e90db538155d/src/compose/resolve-flow-scalar.ts',
      hardeningSourceSha256: sha256(readFileSync(join(repository, 'scripts/lib/yaml-hardening.mjs'))), patches,
      files: Object.fromEntries(Object.entries(files).map(([name, content]) => [name, sha256(content)])) };
    for (const [name, content] of Object.entries(files)) {
      const file = join(destination, name); mkdirSync(dirname(file), { recursive: true }); writeFileSync(file, content);
    }
    writeFileSync(join(destination, 'provenance.json'), JSON.stringify(provenance, null, 2) + '\n');
    console.log(`Vendored integrity-verified YAML ${yamlRelease.version} with ${patches.length} recorded scalar-hardening patches.`);
  } finally {
    const absolute = resolve(staging), parent = resolve(tmpdir());
    if (!absolute.startsWith(parent + sep) || !basename(absolute).startsWith('teck-yaml-vendor-')) throw Error('Unsafe YAML staging cleanup path');
    rmSync(absolute, { recursive: true, force: true });
  }
}
