import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const digestPattern = /^sha256:[a-f0-9]{64}$/;
const versionPattern = /^[0-9]+\.[0-9]+\.[0-9]+(?:-[A-Za-z0-9.-]+)?$/;
const components = ['base', 'omp', 'devtools', 'browser', 'kubernetes', 'workflow', 'office', 'omniroute', 'mcphub'];
const registry = 'ghcr.io/teck-lab/teck-orca';

// This lock is release output, not a mutable tag lookup. The approved plugin
// pins both the composition digest and the CI identity that signed it.
export function validateKitRelease(lock) {
  if (!lock || lock.schemaVersion !== 1 || !versionPattern.test(lock.version ?? '') ||
      !/^[a-f0-9]{40}$/.test(lock.sourceCommit ?? '') ||
      lock.set?.ref !== `${registry}:${lock.version}` || !digestPattern.test(lock.set?.digest ?? '')) {
    throw Error('Invalid published Teck kit release; install a complete released plugin');
  }
  if (!Array.isArray(lock.components) || lock.components.length !== components.length ||
      new Set(lock.components.map(c => c.name)).size !== components.length ||
      lock.components.some(c => !components.includes(c.name) || c.ref !== `${registry}/${c.name}:${lock.version}` || !digestPattern.test(c.digest ?? ''))) {
    throw Error('Published Teck kit release has an incomplete or conflicting component set');
  }
  if (lock.verification?.issuer !== 'https://token.actions.githubusercontent.com' ||
      lock.verification?.identity !== `https://github.com/Teck-Lab/Teck.Orca/.github/workflows/release-kits.yml@refs/tags/v${lock.version}`) {
    throw Error('Published Teck kit release has an unexpected signing identity');
  }
  return lock;
}

export function selectKitRelease(assetRoot, { sourceDevelopment = false } = {}) {
  const path = join(assetRoot, 'assets/kit-release.json');
  if (existsSync(path)) {
    const lock = validateKitRelease(JSON.parse(readFileSync(path, 'utf8')));
    return { kind: 'published', reference: `${lock.set.ref}@${lock.set.digest}`,
      version: lock.version, digest: lock.set.digest,
      verifyArgs: ['kit', 'verify', `${lock.set.ref}@${lock.set.digest}`,
        '--certificate-identity', lock.verification.identity, '--certificate-oidc-issuer', lock.verification.issuer] };
  }
  // Retained for explicit source development of the pre-modular image only.
  // Distributed packages require a release lock and cannot silently fall back
  // to a large local build or a mutable registry tag.
  if (sourceDevelopment && existsSync(join(assetRoot, 'assets/kits/workload/workload.yaml'))) {
    return { kind: 'source-development', args: [join(assetRoot, 'assets/kits/workload'),
      '--kit', join(assetRoot, 'assets/kits/omniroute'), '--kit', join(assetRoot, 'assets/kits/mcphub')] };
  }
  throw Error('This plugin has no published sandbox kit release. Install a released Teck plugin; no sandbox was created.');
}
