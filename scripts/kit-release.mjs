import fs from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const components = Object.freeze(['base', 'omp', 'devtools', 'browser', 'kubernetes', 'workflow', 'office', 'omniroute', 'mcphub']);
export const registry = 'ghcr.io/teck-lab/teck-orca';
const semver = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const digestPattern = /^sha256:[a-f0-9]{64}$/;
const commitPattern = /^[a-f0-9]{40}$/;
const platforms = ['linux/amd64', 'linux/arm64'];
const fail = message => { throw Error(message); };

export function releaseIdentity({ version, sourceCommit }) {
  if (!semver.test(version ?? '')) fail('Release version must be an exact stable semantic version');
  if (!commitPattern.test(sourceCommit ?? '')) fail('Release sourceCommit must be an exact Git commit');
  return { version, sourceCommit };
}

export function releasePlan({ tag, sourceCommit, repository, packageVersion, pluginVersion }) {
  if (repository !== 'Teck-Lab/Teck.Orca') fail('Kit publication belongs to Teck-Lab/Teck.Orca');
  if (!/^refs\/tags\/v/.test(tag ?? '')) fail('Run the release workflow against an existing vX.Y.Z tag');
  const identity = releaseIdentity({ version: tag.slice('refs/tags/v'.length), sourceCommit });
  if (identity.version !== packageVersion || identity.version !== pluginVersion) fail('Tag, package and plugin versions must match');
  return { ...identity, registry, components, platforms };
}

export function buildReceipt({ name, version, sourceCommit, metadata }) {
  releaseIdentity({ version, sourceCommit });
  if (name !== 'set' && !components.includes(name)) fail('Unknown kit component');
  const digest = metadata?.['containerimage.digest'];
  if (!digestPattern.test(digest ?? '')) fail('Buildx did not report a valid image digest');
  return { schemaVersion: 1, name, version, sourceCommit,
    ref: `${registry}${name === 'set' ? '' : '/' + name}:${version}`, digest, platforms };
}

export function validateReceipts(receipts) {
  if (!Array.isArray(receipts) || receipts.length !== components.length) fail('Every component needs one build receipt');
  const first = receipts[0];
  const identity = releaseIdentity(first);
  const byName = new Map();
  for (const receipt of receipts) {
    if (receipt.schemaVersion !== 1 || !components.includes(receipt.name) || byName.has(receipt.name)) fail('Duplicate or unknown component receipt');
    if (receipt.version !== identity.version || receipt.sourceCommit !== identity.sourceCommit) fail('Mixed release versions or source commits');
    if (receipt.ref !== `${registry}/${receipt.name}:${identity.version}` || !digestPattern.test(receipt.digest ?? '')) fail('Invalid component reference or digest');
    if (JSON.stringify(receipt.platforms) !== JSON.stringify(platforms)) fail('Both supported architectures must be built');
    byName.set(receipt.name, receipt);
  }
  return { ...identity, components: components.map(name => byName.get(name)) };
}

export function setDescriptor(receipts) {
  const release = validateReceipts(receipts);
  // JSON is valid YAML. The syntax directive selects Docker's v3 build frontend.
  return '# syntax=docker/sandbox-kit:3\n' + JSON.stringify({ schemaVersion: '3', kind: 'set',
    displayName: 'Teck OMP project sandbox', version: release.version,
    description: 'Pinned Teck OMP development environment; one persistent sandbox per Orca project.',
    kits: release.components.map(({ ref, digest }) => ({ ref, digest })) }, null, 2) + '\n';
}

export function auditFileInventories(inventories, receipts) {
  const release = validateReceipts(receipts);
  if (!Array.isArray(inventories) || inventories.length !== components.length * platforms.length) fail('File audit requires every component on both architectures');
  for (const inventory of inventories) {
    const receipt = release.components.find(r => r.name === inventory.name);
    if (!receipt || !platforms.includes(inventory.platform) || inventory.digest !== receipt.digest) fail('Invalid, duplicate or mismatched filesystem inventory');
  }
  return { schemaVersion: 1, version: release.version, sourceCommit: release.sourceCommit,
    ...auditFileCollisions(inventories), components: release.components.map(({ name, digest }) => ({ name, digest })) };
}

// Registry-independent file checks are shared by release and unprivileged PR builds.
// Callers separately validate the exact expected component names/digests/platforms.
export function auditFileCollisions(inventories) {
  if (!Array.isArray(inventories) || !inventories.length) fail('Missing filesystem inventories');
  const seen = new Set(), owners = new Map(), conflicts = [];
  let checkedEntries = 0;
  for (const inventory of inventories) {
    const key = `${inventory.name}:${inventory.platform}`;
    if (!components.includes(inventory.name) || !platforms.includes(inventory.platform) || seen.has(key) || !digestPattern.test(inventory.digest ?? '')) fail('Invalid, duplicate or mismatched filesystem inventory');
    if (!inventory.entries || typeof inventory.entries !== 'object' || Array.isArray(inventory.entries)) fail('Missing filesystem entries');
    seen.add(key);
    for (const [path, entry] of Object.entries(inventory.entries)) {
      // These are POSIX inventory keys, never host extraction paths. In
      // particular, systemd legitimately uses literal backslashes in filenames.
      if (!path || path.startsWith('/') || path.split('/').some(p => !p || p === '.' || p === '..')) fail('Unsafe inventory path');
      if (!entry || !['file', 'directory', 'symlink', 'hardlink'].includes(entry.type)) fail('Unsupported inventory entry');
      if (entry.type === 'file' && !digestPattern.test(entry.digest ?? '')) fail('File inventory needs a digest');
      if (entry.type !== 'file' && entry.type !== 'directory' && typeof entry.target !== 'string') fail('Link inventory needs a target');
      if (!Number.isInteger(entry.mode) || entry.mode < 0 || entry.mode > 0o7777) fail('Invalid inventory mode');
      if (![entry.uid, entry.gid].every(id => Number.isInteger(id) && id >= 0)) fail('Invalid inventory ownership');
      checkedEntries++;
      const id = inventory.platform + ':' + path, existing = owners.get(id);
      // Shared directories are normal. All other replacements must be byte/type/mode identical.
      const signature = entry.type === 'directory' ? 'directory' : JSON.stringify({ type: entry.type, mode: entry.mode, uid: entry.uid, gid: entry.gid, digest: entry.digest, target: entry.target });
      if (existing && existing.signature !== signature) conflicts.push({ platform: inventory.platform, path, first: existing.name, second: inventory.name });
      else owners.set(id, { name: inventory.name, signature });
    }
  }
  for (const [id, owner] of owners) {
    const boundary = id.indexOf(':');
    const prefix = id.slice(0, boundary + 1), path = id.slice(boundary + 1);
    const segments = path.split('/');
    while (segments.length > 1) {
      segments.pop();
      const parent = owners.get(prefix + segments.join('/'));
      if (parent && parent.signature !== 'directory') conflicts.push({ path, first: parent.name, second: owner.name, reason: 'Non-directory ancestor' });
    }
  }
  if (conflicts.length) fail('Kit files conflict: ' + JSON.stringify(conflicts.slice(0, 30)));
  return { passed: true, inventories: seen.size, checkedEntries };
}

export function releaseLock(receipts, setReceipt, audit) {
  const release = validateReceipts(receipts);
  if (!setReceipt || setReceipt.schemaVersion !== 1 || setReceipt.name !== 'set' || setReceipt.version !== release.version ||
      setReceipt.sourceCommit !== release.sourceCommit || setReceipt.ref !== `${registry}:${release.version}` ||
      !digestPattern.test(setReceipt.digest ?? '') || JSON.stringify(setReceipt.platforms) !== JSON.stringify(platforms)) fail('Set receipt does not match its component release');
  if (!audit || audit.passed !== true || audit.version !== release.version || audit.sourceCommit !== release.sourceCommit ||
      audit.inventories !== components.length * platforms.length ||
      JSON.stringify(audit.components) !== JSON.stringify(release.components.map(({ name, digest }) => ({ name, digest })))) fail('A matching successful filesystem audit is required');
  return { schemaVersion: 1, version: release.version, sourceCommit: release.sourceCommit,
    set: { ref: setReceipt.ref, digest: setReceipt.digest },
    components: release.components.map(({ name, ref, digest }) => ({ name, ref, digest })),
    verification: { issuer: 'https://token.actions.githubusercontent.com',
      identity: `https://github.com/Teck-Lab/Teck.Orca/.github/workflows/release-kits.yml@refs/tags/v${release.version}` } };
}

function read(path) { return JSON.parse(fs.readFileSync(path, 'utf8')); }
function write(path, value) { fs.mkdirSync(dirname(resolve(path)), { recursive: true }); fs.writeFileSync(path, typeof value === 'string' ? value : JSON.stringify(value, null, 2) + '\n'); }
function loadReceipts(folder) { return components.map(name => read(join(folder, name + '.json'))); }

export function main(argv = process.argv.slice(2), env = process.env) {
  const [command, ...args] = argv, options = {};
  for (let i = 0; i < args.length; i += 2) {
    if (!/^--[a-z-]+$/.test(args[i]) || !args[i + 1] || args[i + 1].startsWith('--') || Object.hasOwn(options, args[i].slice(2))) fail('Use unique --name value arguments');
    options[args[i].slice(2)] = args[i + 1];
  }
  let result;
  if (command === 'plan') result = releasePlan({ tag: env.GITHUB_REF, sourceCommit: env.GITHUB_SHA, repository: env.GITHUB_REPOSITORY,
    packageVersion: read('package.json').version, pluginVersion: read('orca-plugin.json').version });
  else if (command === 'record') result = buildReceipt({ name: options.name, version: options.version, sourceCommit: options.commit,
    metadata: options.metadata ? read(options.metadata) : JSON.parse(env.BUILD_METADATA ?? '{}') });
  else if (command === 'compose') result = setDescriptor(loadReceipts(options.receipts));
  else if (command === 'audit') {
    const inventories = components.flatMap(name => platforms.map(platform => read(join(options.inventories, `${name}-${platform.slice(6)}.json`))));
    result = auditFileInventories(inventories, loadReceipts(options.receipts));
  } else if (command === 'lock') result = releaseLock(loadReceipts(options.receipts), read(options.set), read(options.audit));
  else fail('Expected plan, record, compose, audit or lock');
  if (options.out) write(options.out, result);
  else console.log(typeof result === 'string' ? result : JSON.stringify(result));
  return result;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
