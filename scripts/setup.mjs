import { checkPrerequisites, printPrerequisites } from './bootstrap.mjs';
import { pluginRoot } from './plugin-package.mjs';
import { installProjectStartup } from './project-startup.mjs';
import { installPluginRuntimes } from './setup-runtime.mjs';

// Installation is explicit: it writes a versioned runtime outside the checkout
// It creates no sandbox or workspace.
const { ssh, recovery } = installPluginRuntimes();
const prerequisites = checkPrerequisites();
printPrerequisites(prerequisites);
if (!prerequisites.ok) process.exitCode = 1;
console.log(`Installed native SSH runtime: ${ssh.destination}`);
console.log(`Installed older-sandbox recovery runtime: ${recovery.destination}`);
if (prerequisites.ok) {
  const startup = installProjectStartup(recovery);
  console.log(startup.installed ? `Automatic project SSH recovery: ${startup.path}` : startup.reason);
}
console.log(`Install or add this Dev plugin folder in Orca Settings > Plugins: ${pluginRoot}`);
console.log('The repository root contains runtime binaries and exceeds Orca\'s plugin size limit; use the plugin subfolder.');
console.log('In Orca, create a workspace and select Teck OMP Project in Run on. Orca creates or reuses the native SSH project sandbox and manages its guest daemon.');
console.log('If the separate Teck OMP Native SSH Preview entry is installed, remove that plugin entry after refreshing this one. Keep its sandbox, workspaces and ownership records.');
console.log('Setup and plugin activation create no sandbox, connection or workspace.');
console.log('Existing feature sandboxes keep their original recipes and recovery command. No existing work is migrated or removed.');
