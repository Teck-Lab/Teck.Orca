import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { recipeCommand, releaseManifest, repositoryRoot } from './release.mjs';
import { buildPlugin, pluginRoot } from './plugin-package.mjs';

export function buildRecipe() {
  const { digest } = releaseManifest();
  const recipe = {
    schemaVersion: 1,
    id: 'teck-sbx-feature',
    name: 'Teck OMP Feature',
    description: 'One Docker Sandbox and bundled Orca daemon per feature. OMP creates visible child worktrees and workers on the sandbox runtime; the desktop connects through local pairing.',
    ...Object.fromEntries(['create', 'suspend', 'resume', 'destroy'].map((mode) => [mode, recipeCommand(digest, mode)])),
  };
  for (const mode of ['create', 'suspend', 'resume', 'destroy']) {
    if (Buffer.byteLength(recipe[mode]) >= 8191) throw new Error(`Recipe exceeds Windows cmd.exe limit: ${mode}`);
  }
  return JSON.stringify(recipe, null, 2) + '\n';
}

const recipes = [];
for (const filename of ['sbx-feature-sandbox.json', 'sbx-project-sandbox.json']) {
  const path = join(repositoryRoot, 'recipes', filename);
  const generated = filename === 'sbx-feature-sandbox.json' ? buildRecipe() : JSON.stringify({
    schemaVersion: 1, id: 'teck-sbx-project', name: 'Teck OMP Project',
    description: 'Orca creates a sandbox on first use and reuses it for every workspace in the project. Native Docker SSH wakes it after restart; worktree deletion retains the shared sandbox.',
    ...Object.fromEntries(['create', 'suspend', 'resume'].map(mode => [mode, recipeCommand(releaseManifest().digest, mode, 'runtime/project-recipe.mjs')])),
    destroy: 'none',
  }, null, 2) + '\n';
  const { schemaVersion, ...recipe } = JSON.parse(generated);
  if (filename === 'sbx-project-sandbox.json') recipes.push(recipe);
  if (process.argv.includes('--check')) {
    if (readFileSync(path, 'utf8') !== generated) throw new Error('Recipe is stale. Run npm run build, then npm run setup.');
    console.log(`${filename} matches the runtime assets.`);
  } else {
    writeFileSync(path, generated);
    console.log(`Generated recipes/${filename}`);
  }
}
// JSON is valid YAML; this mirror exists for Orca's repository recipe doctor.
const mirror = JSON.stringify({ environmentRecipes: recipes }, null, 2) + '\n';
const mirrorPath = join(repositoryRoot, 'orca.yaml');
if (process.argv.includes('--check')) {
  if (readFileSync(mirrorPath, 'utf8') !== mirror) throw new Error('Doctor mirror is stale. Run npm run build.');
} else writeFileSync(mirrorPath, mirror);
const packaged = buildPlugin({ check: process.argv.includes('--check') });
console.log(`Plugin package: ${pluginRoot} (${packaged.totalBytes} bytes)`);
