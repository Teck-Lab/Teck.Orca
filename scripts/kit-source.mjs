import { createHash } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const kitNames = Object.freeze(['base', 'omp', 'devtools', 'browser', 'kubernetes', 'workflow', 'office', 'omniroute', 'mcphub']);
const repository = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const slash = value => value.replaceAll('\\', '/');
const digest = value => createHash('sha256').update(value).digest('hex');
const officePath = path => path.startsWith('skills/agent-office/') || /^(?:extensions\/agent-office\.(?:ts|mjs)|extensions\/lib\/(?:office-(?:usage|plan|mcp|mcp-server)\.mjs|agent-office\.LICENSE))$/.test(path);

export function stageKitSources({ source = repository, destination } = {}) {
  if (!destination) throw Error('A fresh output directory is required');
  source = resolve(source); destination = resolve(destination);
  if (existsSync(destination) && (lstatSync(destination).isSymbolicLink() || !lstatSync(destination).isDirectory() || readdirSync(destination).length)) throw Error('Kit output must be an empty real directory');
  const overlap = relative(destination, source);
  if (!overlap || (!overlap.startsWith('..') && !isAbsolute(overlap))) throw Error('Kit output cannot contain the source repository');
  for (const inputRoot of ['kits', 'runtime']) {
    const nested = relative(join(source, inputRoot), destination);
    if (!nested || (!nested.startsWith('..') && !isAbsolute(nested))) throw Error('Kit output cannot be inside an input tree');
  }
  mkdirSync(destination, { recursive: true });
  const provenance = [];
  const write = (path, bytes) => { const file = join(destination, path); mkdirSync(dirname(file), { recursive: true }); writeFileSync(file, bytes); };
  const copy = (input, output, transform) => {
    const path = join(source, input), stat = lstatSync(path);
    if (stat.isSymbolicLink() || !stat.isFile()) throw Error(`Kit input is not a regular file: ${input}`);
    const bytes = readFileSync(path);
    const staged = transform ? Buffer.from(transform(bytes.toString('utf8'))) : bytes;
    write(output, staged);
    provenance.push({ source: slash(input), destination: slash(output), sourceSha256: digest(bytes), sha256: digest(staged) });
  };
  const walk = (input, callback, prefix = '') => {
    for (const child of readdirSync(join(source, input), { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (child.isSymbolicLink()) throw Error(`Kit input symlink refused: ${input}/${child.name}`);
      const path = prefix ? `${prefix}/${child.name}` : child.name;
      if (child.isDirectory()) walk(`${input}/${child.name}`, callback, path);
      else callback(`${input}/${child.name}`, path);
    }
  };
  for (const name of kitNames) walk(`kits/${name}`, (input, path) => copy(input, `${name}/${path}`));
  const canonical = 'runtime/kits/workload';
  for (const name of ['devtools', 'browser', 'kubernetes']) copy(`${canonical}/devtools.json`, `${name}/assets/devtools.json`);
  for (const file of ['debug-tools.mjs', 'netcoredbg.LICENSE', 'kubernetes-tools.mjs']) copy(`${canonical}/${file}`, `devtools/assets/${file}`);
  copy(`${canonical}/install-devtools.mjs`, 'devtools/assets/install-devtools.mjs', text => {
    const call = 'installKubernetesTools({ lock });';
    if (text.split(call).length !== 2) throw Error('Canonical devtools installer changed: review the Kubernetes ownership split');
    return text.replace(call, '// Kubernetes executables belong exclusively to the Kubernetes mixin.');
  });
  copy('kits/devtools/export-devtools.mjs', 'devtools/assets/export-devtools.mjs');
  copy('kits/browser/install-browser.mjs', 'browser/assets/install-browser.mjs');
  for (const file of ['kubernetes-tools.mjs', 'kubernetes-prerequisites.sh']) copy(`${canonical}/${file}`, `kubernetes/assets/${file}`);

  // Only repository-controlled static assets are eligible. Host profiles,
  // credentials, sessions and local settings are never copied into a context.
  const ompFiles = ['config.yml', 'lsp.json', 'mcp.json', 'models.yml', 'orca-guides.json', 'orchestration.yml', 'reviewer.yml', 'RULES.md', 'skill-snapshots.json', 'WATCHDOG.yml'];
  const profile = (input, path) => copy(input, `${officePath(path) ? 'office' : 'workflow'}/assets/omp/${path}`);
  for (const file of ompFiles) {
    if (file === 'mcp.json') copy(`runtime/omp/${file}`, `workflow/assets/omp/${file}`, text => {
      const value = JSON.parse(text); delete value.mcpServers.agentoffice;
      return JSON.stringify(value, null, 2) + '\n';
    });
    else profile(`runtime/omp/${file}`, file);
  }
  for (const directory of ['agents', 'extensions', 'scripts', 'skills']) walk(`runtime/omp/${directory}`, (input, path) => profile(input, `${directory}/${path}`));
  for (const file of ['omp-launch.mjs', 'omp-launch-policy.mjs', 'omp-session.mjs', 'omp-session-extension.ts']) copy(`runtime/${file}`, `workflow/assets/launch/${file}`);
  copy('runtime/project-name.mjs', 'workflow/assets/launch/project-name.mjs');

  const lock = JSON.parse(readFileSync(join(source, canonical, 'devtools.json')));
  const expected = { dotnet: lock.dotnet.version, typescript: lock.npm.typescript, kind: lock.native.kind.version, kubectl: lock.native.kubectl.version, helm: lock.native.helmCli.version };
  for (const [name, version] of Object.entries(expected)) {
    const component = ['kind', 'kubectl'].includes(name) ? 'kubernetes' : 'devtools';
    if (!readFileSync(join(destination, component, `${component}.yaml`), 'utf8').includes(`${name}@${version}`)) throw Error(`Update the ${component} descriptor to match canonical ${name}@${version}`);
  }
  const components = kitNames.map(name => ({ name, context: join(destination, name), descriptor: join(destination, name, `${name}.yaml`) }));
  const result = { schemaVersion: 1, components, provenance: provenance.sort((a, b) => a.destination.localeCompare(b.destination)) };
  write('sources.json', JSON.stringify(result, null, 2) + '\n');
  return result;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.length !== 2 || args[0] !== '--out') throw Error('Usage: node scripts/kit-source.mjs --out <empty-directory>');
  console.log(JSON.stringify(stageKitSources({ destination: args[1] }), null, 2));
}
