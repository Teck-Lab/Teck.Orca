// Publish immutable runtimes BEFORE replacing the entry of a watched dev plugin.
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { repositoryRoot, installRelease as installRecovery } from './release.mjs';
import { runtimeFiles } from '../native-ssh/build.mjs';
import { installRelease as installSsh } from '../native-ssh/release.mjs';
const node = path => execFileSync(process.execPath, [join(repositoryRoot, path)], { cwd: repositoryRoot, windowsHide: true, stdio: 'inherit' });
node('scripts/refresh-assets.mjs');
const ssh = installSsh(runtimeFiles());
const recovery = installRecovery();
node('scripts/build-recipe.mjs');
console.log(`Published installed runtimes: SSH ${ssh.digest}; plugin ${recovery.digest}`);
