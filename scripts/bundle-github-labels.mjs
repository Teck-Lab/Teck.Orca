import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { repositoryRoot } from './release.mjs';

// Host-side, read-only maintenance. Runtime agents use the GitHub MCP rather
// than host credentials or gh. Keep normal builds offline and deterministic.
const repository = 'Teck-Lab/Teck.Monorepo';
const endpoint = `repos/${repository}/labels?per_page=100`;
const response = spawnSync('gh', ['api', '--paginate', '--slurp', endpoint], {
  encoding: 'utf8', shell: false, windowsHide: true, timeout: 60_000,
  maxBuffer: 1024 * 1024,
});
if (response.error || response.status !== 0) {
  throw new Error(`Label catalog retrieval failed: ${(response.error?.message || response.stderr || 'GitHub API failure').trim().slice(0, 500)}`);
}
const pages = JSON.parse(response.stdout);
if (!Array.isArray(pages) || !pages.length || pages.some(page => !Array.isArray(page))) {
  throw new Error('GitHub returned an invalid paginated label catalog');
}
const names = new Set();
const labels = pages.flat().map(label => {
  if (!label || typeof label.name !== 'string' || !label.name.trim()
      || !(label.description === null || typeof label.description === 'string')
      || !/^[a-f0-9]{6}$/i.test(label.color)) {
    throw new Error('GitHub returned an invalid label definition');
  }
  const key = label.name.toLowerCase();
  if (names.has(key)) throw new Error(`Duplicate label in paginated response: ${label.name}`);
  names.add(key);
  return {
    name: label.name, description: label.description, color: label.color,
    archived: label.archived_at != null,
  };
}).sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
if (!labels.length) throw new Error('Refusing to replace the bundled catalog with an empty response');
const catalog = {
  schemaVersion: 1, repository,
  source: `https://api.github.com/${endpoint}`,
  retrievedAt: new Date().toISOString(),
  labels,
};
const destination = join(repositoryRoot, 'runtime/omp/skills/github-execution-planning/references/teck-monorepo-labels.json');
mkdirSync(dirname(destination), { recursive: true });
writeFileSync(destination, JSON.stringify(catalog, null, 2) + '\n');
console.log(`Bundled ${labels.length} labels for ${repository}; read back selected labels through MCP before applying them.`);
