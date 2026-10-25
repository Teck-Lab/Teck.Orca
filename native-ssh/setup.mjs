import { build, runtimeFiles } from './build.mjs';
import { installRelease } from './release.mjs';

build({ check: true });
const release = installRelease(runtimeFiles());
console.log(`Installed immutable native SSH preview runtime: ${release.destination}`);
console.log('Refresh the separate Teck OMP Native SSH Preview plugin in Orca.');
console.log('Select Teck OMP SSH Project (Preview) in Run on to create a workspace.');
console.log('Setup creates no sandbox, SSH target, Orca connection or workspace.');
