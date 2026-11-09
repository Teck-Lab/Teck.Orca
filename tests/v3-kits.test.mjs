import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { stageKitSources, kitNames } from '../scripts/kit-source.mjs';
const require = createRequire(import.meta.url);
const { parse } = require('../runtime/kubernetes/vendor/yaml/dist/index.js');
const source = fileURLToPath(new URL('..', import.meta.url));
const temporary = fn => {
  const dir = mkdtempSync(join(tmpdir(), 'teck-v3-kit-test-'));
  try { return fn(dir); } finally { rmSync(dir, { recursive: true, force: true }); }
};
const allFiles = dir => readdirSync(dir, { withFileTypes: true }).flatMap(item => item.isDirectory() ? allFiles(join(dir, item.name)) : [join(dir, item.name)]);

test('isolated staging is deterministic and preserves canonical runtime assets', () => temporary(dir => {
  const first = stageKitSources({ destination: join(dir, 'one') });
  const second = stageKitSources({ destination: join(dir, 'two') });
  assert.deepEqual(first.provenance, second.provenance);
  assert.deepEqual(first.components.map(value => value.name), kitNames);
  for (const component of first.components) assert.ok(existsSync(component.descriptor));
  const canonical = readFileSync(join(source, 'runtime/kits/workload/install-devtools.mjs'), 'utf8');
  assert.match(canonical, /installKubernetesTools\(\{ lock \}\);/);
  const isolated = readFileSync(join(dir, 'one/devtools/assets/install-devtools.mjs'), 'utf8');
  assert.doesNotMatch(isolated, /installKubernetesTools\(\{ lock \}\);/);
  assert.match(isolated, /installDebugTools\(\{ lock \}\);/);
  assert.ok(existsSync(join(dir, 'one/kubernetes/assets/kubernetes-prerequisites.sh')));
}));

test('set components form one workload with unique features and satisfied dependencies', () => temporary(dir => {
  const staged = stageKitSources({ destination: join(dir, 'contexts') });
  const descriptors = staged.components.map(component => parse(readFileSync(component.descriptor, 'utf8')));
  assert.equal(descriptors.filter(value => value.kind === 'workload').length, 1);
  const features = new Map();
  for (const descriptor of descriptors) {
    assert.equal(descriptor.schemaVersion, '3');
    for (const feature of descriptor.provides ?? []) {
      const name = feature.split('@')[0];
      assert.equal(features.has(name), false, `Duplicate feature ${name}`);
      features.set(name, descriptor.displayName);
    }
  }
  for (const descriptor of descriptors) for (const dependency of descriptor.requires ?? []) assert.ok(features.has(dependency.split(' ')[0]), `Missing provider for ${dependency}`);
  for (const name of ['omniroute', 'mcphub']) assert.equal(existsSync(join(dir, 'contexts', name, `${name}.dockerfile`)), false);
  for (const descriptor of descriptors) for (const capability of descriptor.capabilities ?? []) {
    if (capability.type !== 'com.docker.sandbox/lifecycle@1') continue;
    for (const hook of capability.config.install ?? []) assert.doesNotMatch(hook.command, /tar\s+-|curl|npm install/, 'Install hooks initialize state; builds install tools');
  }
}));

test('workflow and Office have disjoint ownership and a complete relative-import closure', () => temporary(dir => {
  stageKitSources({ destination: join(dir, 'contexts') });
  const ownership = new Map();
  for (const name of ['workflow', 'office']) {
    const root = join(dir, 'contexts', name, 'assets/omp');
    for (const file of allFiles(root)) {
      const relative = file.slice(root.length + 1).replaceAll('\\', '/');
      assert.equal(ownership.has(relative), false, `Duplicate OMP file ${relative}`);
      ownership.set(relative, file);
    }
  }
  for (const name of ['extensions/lib/issue-worktree.mjs', 'extensions/lib/orca-policy.mjs', 'extensions/lib/office-tools.mjs']) assert.ok(ownership.get(name)?.includes('workflow'));
  assert.ok(ownership.get('skills/agent-office/SKILL.md')?.includes('office'));
  for (const [relative, file] of ownership) {
    if (!/\.(mjs|ts)$/.test(file)) continue;
    const text = readFileSync(file, 'utf8');
    for (const match of text.matchAll(/(?:from\s+|import\s*\()['"](\.[^'"]+)['"]/g)) {
      const imported = join(dirname(relative), match[1]).replaceAll('\\', '/');
      assert.ok(ownership.has(imported), `Missing relative import ${imported} from ${relative}`);
    }
  }
  const config = JSON.parse(readFileSync(join(dir, 'contexts/workflow/assets/omp/mcp.json')));
  assert.equal(config.mcpServers.agentoffice, undefined, 'Optional Office initializes its own binding');
  assert.ok(config.mcpServers.github && config.mcpServers.firecrawl);
}));

test('tool images export selected artifacts instead of OS trees or retired archives', () => {
  for (const name of ['omp', 'devtools', 'browser', 'kubernetes', 'workflow', 'office']) {
    const text = readFileSync(join(source, 'kits', name, `${name}.dockerfile`), 'utf8');
    assert.match(text, /FROM scratch/);
    assert.doesNotMatch(text, /COPY --from=\S+ \/ \/|base-runtime\.tar|runtime\.tar\.gz|sandbox-templates/);
  }
  const base = readFileSync(join(source, 'kits/base/base.dockerfile'), 'utf8');
  assert.match(base, /sbx\/shell-docker-image@sha256:[a-f0-9]{64}/);
  assert.match(base, /install-deps chromium/);
  assert.match(base, /npm install --global --prefix \/tmp\/teck-playwright/);
  assert.doesNotMatch(base, /\bnpx\b/, 'The upstream image declares an initially absent global npm prefix; use an explicit build-only prefix');
  assert.match(base, /install -d -o agent -g agent -m 755 \/usr\/local\/share\/npm-global\/lib\/node_modules \/usr\/local\/share\/npm-global\/bin/);
  const browser = readFileSync(join(source, 'kits/browser/browser.dockerfile'), 'utf8');
  assert.match(browser, /npm install --global --prefix \/opt\/paseo-browser/);
});

test('staging refuses a nonempty destination instead of deleting unrelated data', () => temporary(dir => {
  stageKitSources({ destination: join(dir, 'contexts') });
  assert.throws(() => stageKitSources({ destination: join(dir, 'contexts') }), /empty real directory/);
  assert.throws(() => stageKitSources({ destination: join(source, 'kits/base/generated-never-created') }), /inside an input tree/);
  assert.equal(existsSync(join(source, 'kits/base/generated-never-created')), false);
}));
