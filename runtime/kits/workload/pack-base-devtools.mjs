import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, rmSync } from 'node:fs';

// Build-time only, against the pinned source template's filesystem. Archive
// high-file-count SDK/documentation directories before flattening the image.
// Native executables and shared libraries remain available for provisioning.
const paths = [
  '/usr/share/nodejs', '/usr/lib/node_modules', '/usr/lib/jvm',
  '/usr/share/doc', '/usr/share/man',
  ...readdirSync('/usr/share').filter(name => /^go(?:-|$)|^gocode$/.test(name)).map(name => `/usr/share/${name}`),
  ...readdirSync('/usr/lib').filter(name => /^go(?:-|$)|^python3(?:\.|$)/.test(name)).map(name => `/usr/lib/${name}`),
].filter(path => existsSync(path));
if (!paths.includes('/usr/lib/jvm') || !paths.includes('/usr/share/nodejs')) {
  throw new Error('Pinned source base has an unexpected SDK layout');
}
execFileSync('tar', ['-C', '/', '-czf', '/usr/share/teck-devtools/base-runtime.tar.gz', ...paths.map(path => path.slice(1))], { stdio: 'inherit' });
for (const path of paths) rmSync(path, { recursive: true, force: true });
