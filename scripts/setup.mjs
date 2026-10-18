import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { installRelease, recipeCommand, releaseManifest, repositoryRoot } from './release.mjs';
import { command } from './lifecycle.mjs';
import { checkPrerequisites, printPrerequisites } from './bootstrap.mjs';
import { buildPlugin, pluginRoot } from './plugin-package.mjs';
import { installProjectStartup } from './project-startup.mjs';

// Installation is explicit: it writes a versioned runtime outside the checkout
// It creates no sandbox or workspace.
const recipe = JSON.parse(readFileSync(join(repositoryRoot, 'recipes', 'sbx-project-sandbox.json')));
if (recipe.create !== recipeCommand(releaseManifest().digest, 'create', 'runtime/project-recipe.mjs')) throw new Error('Recipe is stale. Run npm run build before setup.');
buildPlugin({ check: true });
const release = installRelease();
const prerequisites = checkPrerequisites();
printPrerequisites(prerequisites);
if (!prerequisites.ok) process.exitCode = 1;
console.log(`Installed runtime: ${release.destination}`);
if (prerequisites.ok) {
  const startup = installProjectStartup(release);
  console.log(startup.installed ? `Automatic project SSH recovery: ${startup.path}` : startup.reason);
}
console.log(`Install or add this Dev plugin folder in Orca Settings > Plugins: ${pluginRoot}`);
console.log('The repository root contains runtime binaries and exceeds Orca\'s plugin size limit; use the plugin subfolder.');
console.log('In Orca, create a workspace and select Teck OMP Project in Run on. Orca creates the project sandbox only on first use and reuses it for later workspaces.');
console.log('Setup and plugin activation create no sandbox, connection or workspace.');
console.log('Existing feature sandboxes keep their original recipes and recovery command. No existing work is migrated or removed.');
