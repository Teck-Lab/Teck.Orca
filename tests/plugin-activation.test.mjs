import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { installRelease, pluginEntrySource } from '../scripts/release.mjs';

test('plugin activation verifies its executable closure without reading SDK archives', async t => {
  const temp = fs.mkdtempSync(join(tmpdir(), 'teck-plugin-activation-'));
  t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
  const source = join(temp, 'source');
  fs.mkdirSync(join(source, 'scripts'), { recursive: true });
  fs.mkdirSync(join(source, 'runtime/kits/workload'), { recursive: true });
  fs.writeFileSync(join(source, 'scripts/lifecycle.mjs'), 'export function main() {}');
  fs.writeFileSync(join(source, 'runtime/reconnect-host.mjs'), '// fixture recovery');
  fs.writeFileSync(join(source, 'runtime/project-state.mjs'), '// fixture project state');
  fs.writeFileSync(join(source, 'runtime/project-transport.mjs'), '// fixture SSH transport');
  fs.writeFileSync(join(source, 'runtime/plugin-entry.mjs'), 'export default orca => orca.commands.register("fixture-ready", () => {});');
  fs.writeFileSync(join(source, 'runtime/kits/workload/sdk.tar.gz'), Buffer.alloc(1024));
  const release = installRelease(source, join(temp, 'releases'));
  const previousRoot = process.env.TECK_ORCA_RELEASES_DIR;
  process.env.TECK_ORCA_RELEASES_DIR = join(temp, 'releases');
  t.after(() => previousRoot === undefined ? delete process.env.TECK_ORCA_RELEASES_DIR : process.env.TECK_ORCA_RELEASES_DIR = previousRoot);
  const entryPath = join(temp, 'entry.mjs');
  fs.writeFileSync(entryPath, pluginEntrySource(release.digest));
  const { default: activate } = await import(pathToFileURL(entryPath).href);
  const read = fs.readFileSync, accessed = [];
  fs.readFileSync = (path, ...args) => {
    accessed.push(String(path));
    if (String(path).endsWith('sdk.tar.gz')) throw Error('Archive scan exceeded activation budget');
    return read(path, ...args);
  };
  const registered = [];
  try { await activate({ commands: { register: name => registered.push(name) } }); }
  finally { fs.readFileSync = read; }
  assert.deepEqual(registered, ['fixture-ready']);
  assert.ok(accessed.some(path => path.endsWith('scripts'+(process.platform === 'win32' ? '\\' : '/')+'lifecycle.mjs')));
  for (const name of ['runtime/plugin-entry.mjs', 'runtime/reconnect-host.mjs', 'scripts/lifecycle.mjs', 'runtime/project-state.mjs', 'runtime/project-transport.mjs']) {
    const target = join(release.destination, name), original = read(target);
    fs.writeFileSync(target, '// tampered');
    await assert.rejects(activate({ commands: { register() { throw Error('Must not register'); } } }), /Changed runtime file/);
    fs.writeFileSync(target, original);
  }
});
