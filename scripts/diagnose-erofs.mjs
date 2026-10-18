import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { repositoryRoot } from './release.mjs';
const executable = join(process.env.LOCALAPPDATA, 'DockerSandboxes', 'libexec', 'mkfs.erofs.exe');
const output = join(repositoryRoot, '.artifacts', 'erofs-probe');
mkdirSync(output, { recursive: true });
for (const [label, tmp] of [['inherited', process.env.TMPDIR], ['windows-temp', process.env.TEMP], ['short-path', 'C:\\tmp']]) {
  const env = { ...process.env };
  if (tmp) env.TMPDIR = tmp;
  else delete env.TMPDIR;
  const result = spawnSync(executable, ['--tar=f', '--aufs', '--quiet', '-Enoinline_data', join(output, `${label}.erofs`)], {
    env, input: Buffer.alloc(1024), encoding: 'utf8', windowsHide: true,
  });
  console.log(JSON.stringify({ label, tmpdir: tmp ?? '(unset)', status: result.status, error: result.error?.message, stderr: result.stderr.trim() }));
}
