import { command } from './lifecycle.mjs';
import { repositoryRoot } from './release.mjs';
import { join } from 'node:path';

// Optional richer .NET/LSP image. The default recipe builds the v3 workload kit instead.
command('docker', ['build', '--tag', 'teck-orca-worker:dev', join(repositoryRoot, 'sandbox', 'image')], { progress: true });
