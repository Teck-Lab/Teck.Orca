import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { repositoryRoot, defaultReleasesRoot, installRelease as installRecovery } from './release.mjs';
import { buildPlugin } from './plugin-package.mjs';
import { nativeRecipe, runtimeFiles } from '../native-ssh/build.mjs';
import { installRelease as installSsh, releasesRoot } from '../native-ssh/release.mjs';

// One plugin install prepares the native SSH recipe and the retained recovery
// command. Preserve the established release roots so existing saved recipes work.
export function installPluginRuntimes({ source = repositoryRoot,
  recoveryReleasesRoot = defaultReleasesRoot(), sshReleasesRoot = releasesRoot() } = {}) {
  buildPlugin({ source, destination: join(source, 'plugin'), check: true });
  assert.deepEqual(JSON.parse(readFileSync(join(source, 'recipes/native-ssh-project.json'))), nativeRecipe(source),
    'Native SSH recipe is stale; run npm run build before setup');
  const ssh = installSsh(runtimeFiles(source), sshReleasesRoot);
  const recovery = installRecovery(source, recoveryReleasesRoot);
  return { ssh, recovery };
}
