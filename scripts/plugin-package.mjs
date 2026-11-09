import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { dirname, join, resolve, sep } from 'node:path';
import { repositoryRoot, releaseManifest, pluginEntrySource } from './release.mjs';

export const pluginRoot = join(repositoryRoot, 'plugin');
export function packageFiles(source = repositoryRoot) {
  const manifest = readFileSync(join(source, 'orca-plugin.json'));
  const parsed = JSON.parse(manifest);
  const files = { 'orca-plugin.json': manifest, LICENSE: readFileSync(join(source, 'LICENSE')) };
  if (parsed.main) {
    if (parsed.main !== 'reconnect.mjs') throw new Error('Unexpected plugin entry path');
    files[parsed.main] = Buffer.from(pluginEntrySource(releaseManifest(source).digest));
  }
  for (const panel of parsed.contributes.panels ?? []) {
    if (panel.entry !== 'ui/sandbox-status.tsx') throw Error('Unexpected packaged panel path');
    for (const name of ['sandbox-status.tsx', 'protocol.ts', 'sandbox-status.test.tsx', 'sandbox-status.check.ts']) {
      files[`ui/${name}`] = readFileSync(join(source, 'ui', name));
    }
  }
  for (const { path } of parsed.contributes.vmRecipes) {
    if (!/^recipes\/[a-z0-9-]+\.json$/.test(path)) throw new Error('Unsafe packaged recipe path');
    files[path] = readFileSync(join(source, path));
  }
  return files;
}

export function validatePackage(root, expected) {
  let entries = 0, bytes = 0;
  const files = [];
  function visit(relative = '') {
    for (const name of readdirSync(join(root, relative)).sort()) {
      const path = [relative, name].filter(Boolean).join('/');
      const stat = lstatSync(join(root, path));
      if (++entries > 2000) throw new Error('Plugin exceeds Orca\'s 2000-entry limit');
      if (stat.isSymbolicLink()) throw new Error(`Plugin symlink is forbidden: ${path}`);
      if (stat.isDirectory()) visit(path);
      else if (stat.isFile()) {
        bytes += stat.size;
        if (bytes > 50 * 1024 * 1024) throw new Error('Plugin exceeds Orca\'s 50 MiB limit');
        files.push(path);
      } else throw new Error(`Unsupported plugin entry: ${path}`);
    }
  }
  visit();
  if (JSON.stringify(files.sort()) !== JSON.stringify(Object.keys(expected).sort())) throw new Error('Plugin package contains unexpected files');
  for (const [path, data] of Object.entries(expected)) {
    if (!readFileSync(join(root, path)).equals(data)) throw new Error(`Packaged plugin is stale: ${path}`);
  }
  return { entries, fileCount: files.length, totalBytes: bytes };
}

export function buildPlugin({ source = repositoryRoot, destination = pluginRoot, check = false } = {}) {
  const files = packageFiles(source);
  if (!check) {
    // Dev-folder hashing ignores .orca, but worker integrity verification in
    // 1.4.248 includes it. Preserve generated typings/shots outside the shipped
    // tree so GUI installs hash the same bytes in both places. Never delete them.
    const outputRoot = resolve(destination);
    const generated = resolve(outputRoot, '.orca');
    if (existsSync(generated)) {
      if (lstatSync(generated).isSymbolicLink() || !lstatSync(generated).isDirectory()) throw Error('Unexpected generated SDK path');
      const archiveRoot = resolve(source, '.artifacts', 'plugin-sdk');
      const archive = resolve(archiveRoot, randomUUID());
      if (!generated.startsWith(outputRoot + sep) || !archive.startsWith(archiveRoot + sep)) throw Error('Generated SDK move escaped its intended directory');
      mkdirSync(dirname(archive), { recursive: true });
      renameSync(generated, archive);
    }
    const previousPath = join(destination, 'orca-plugin.json');
    if (existsSync(previousPath)) {
      const previous = JSON.parse(readFileSync(previousPath, 'utf8'));
      for (const { path } of previous.contributes?.vmRecipes ?? []) {
        if (/^recipes\/[a-z0-9-]+\.json$/.test(path) && !files[path]) rmSync(join(destination, path), { force: true });
      }
    }
    for (const [path, data] of Object.entries(files)) {
      mkdirSync(dirname(join(destination, path)), { recursive: true });
      writeFileSync(join(destination, path), data);
    }
  }
  if (!existsSync(destination)) throw new Error('Plugin package is missing; run npm run build');
  return validatePackage(destination, files);
}
