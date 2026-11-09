// Build/check/test a disposable source copy. Never refresh a watched plugin.
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const repository = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const directories = ['.github', 'docs', 'kits', 'native-ssh', 'runtime', 'sandbox', 'scripts', 'tests', 'ui'];
const rootFiles = ['.gitattributes', '.gitignore', 'package.json', 'package-lock.json', 'LICENSE', 'README.md', 'CONTRIBUTING.md', 'SECURITY.md', 'orca-plugin.json', 'orca-catalog.json'];
const excluded = new Set(['.git', '.artifacts', '.orca', 'node_modules', 'plugin', '__pycache__']);

export function copyValidationSources(source, destination) {
  const copy = (input, output) => {
    const stat = lstatSync(input);
    if (stat.isSymbolicLink()) throw Error(`Validation refuses source symlinks: ${input}`);
    if (stat.isDirectory()) {
      mkdirSync(output, { recursive: true });
      for (const name of readdirSync(input).sort()) if (!excluded.has(name)) copy(join(input, name), join(output, name));
    } else if (stat.isFile()) writeFileSync(output, readFileSync(input), { mode: stat.mode & 0o777 });
    else throw Error(`Unsupported validation source: ${input}`);
  };
  for (const name of directories) if (existsSync(join(source, name))) copy(join(source, name), join(destination, name));
  for (const name of rootFiles) if (existsSync(join(source, name))) copy(join(source, name), join(destination, name));
  // These outputs are generated solely from source in the disposable tree.
  mkdirSync(join(destination, 'recipes'), { recursive: true });
}

export function npmCliPath(env = process.env) {
  const candidates = [env.npm_execpath, join(dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js'), join(dirname(process.execPath), '../lib/node_modules/npm/bin/npm-cli.js')];
  const path = candidates.find(value => value && existsSync(value) && lstatSync(value).isFile());
  if (!path) throw Error('Cannot find npm CLI; run validation through npm run validate');
  return resolve(path);
}

export function validateSource({ source = repository, keep = false, npmCli = npmCliPath(), run = spawnSync, log = console.log } = {}) {
  const parent = resolve(tmpdir());
  const staging = mkdtempSync(join(parent, 'teck-orca-validate-'));
  try {
    log(`Validating isolated source: ${staging}`);
    copyValidationSources(resolve(source), staging);
    for (const script of ['build', 'check', 'test']) {
      log(`Isolated npm run ${script}`);
      const result = run(process.execPath, [npmCli, 'run', script], { cwd: staging, stdio: 'inherit', windowsHide: true, env: { ...process.env, TECK_ORCA_VALIDATION_COPY: '1' } });
      if (result.error) throw result.error;
      if (result.status !== 0) throw Error(`Isolated npm run ${script} failed (${result.signal || result.status})`);
    }
    return { passed: true, ...(keep ? { directory: staging } : {}) };
  } finally {
    if (keep) log(`Validation copy retained: ${staging}`);
    else {
      const target = resolve(staging);
      if (dirname(target) !== parent || !target.startsWith(parent + sep) || !basename(target).startsWith('teck-orca-validate-') || lstatSync(target).isSymbolicLink()) throw Error('Unsafe validation cleanup target');
      rmSync(target, { recursive: true, force: true });
    }
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.some(arg => arg !== '--keep') || args.length > 1) throw Error('Usage: npm run validate -- [--keep]');
  validateSource({ keep: args.includes('--keep') });
}
