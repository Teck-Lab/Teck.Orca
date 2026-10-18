import { homedir } from 'node:os';
import { join } from 'node:path';
import { command, withFeatureLock } from '../scripts/lifecycle.mjs';

const builder = 'sbx-kit-builder';
const GiB = 1024 ** 3;

export function checkKitBuilderStorage(run = command) {
  const output = run('sbx', ['exec', '-u', 'root', builder, 'df', '-B1', '--output=size,avail', '/var/lib/docker']);
  const match = /^\s*(\d+)\s+(\d+)\s*$/m.exec(output);
  if (!match) throw Error('Cannot verify kit builder disk capacity');
  const total = Number(match[1]), available = Number(match[2]);
  if (total < 32 * GiB) throw Error(`Kit builder disk is too small (${(total / GiB).toFixed(1)} GiB). Recreate only sbx-kit-builder with volumeSize=40g using the builder repair command in README. No project sandbox was created`);
  if (available < 12 * GiB) throw Error(`Kit builder has only ${(available / GiB).toFixed(1)} GiB free; this workload needs at least 12 GiB of build headroom. Reclaim its unused build cache or recreate the builder. No project sandbox was created`);
  return { total, available };
}

// Docker otherwise recreates this shared builder with a 10 GiB engine store.
// Serialize first creation across projects; never replace or prune an existing
// builder automatically, because another project may be using its build cache.
export async function ensureKitBuilder({ run = command, stateRoot = join(homedir(), '.teck-orca') } = {}) {
  return withFeatureLock(stateRoot, builder, async () => {
    const inventory = () => {
      const rows = JSON.parse(run('sbx', ['ls', '--json']));
      if (!Array.isArray(rows)) throw Error('Cannot verify kit builder inventory');
      return rows;
    };
    let current = inventory().find(row => row.name === builder);
    const created = !current;
    if (created) {
      run('sbx', ['create', '--no-progress', '--name', builder, '--skills', 'off', '--kit-arg',
        'volumeSize=40g', 'docker.io/docker/sbx-kit-builder:1'], { progress: true });
      current = inventory().find(row => row.name === builder);
    }
    if (current?.agent !== 'sbx-kit-builder' || typeof current.id !== 'string' || !current.id) {
      throw Error('Cannot verify the shared Docker kit builder; retained it for inspection');
    }
    // A manually created builder otherwise auto-stops after a short exec
    // session disconnects, even while BuildKit is working in the background.
    run('sbx', ['run', '--detach', '--name', builder]);
    const detached = inventory().find(row => row.name === builder);
    if (detached?.id !== current.id || detached.detached !== true) throw Error('Cannot verify detached kit builder ownership');
    return { created, ...checkKitBuilderStorage(run) };
  });
}
