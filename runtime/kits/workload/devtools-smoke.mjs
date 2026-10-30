import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { accessSync, constants, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

// Compile and negotiate LSP as the non-root agent. Only creates a private temp
// fixture and removes that fixture; never reads or modifies project checkouts.
const lock = JSON.parse(readFileSync(new URL('./devtools.json', import.meta.url), 'utf8'));
const root = mkdtempSync(join(tmpdir(), 'teck-devtools-'));
const env = { ...process.env, DOTNET_CLI_TELEMETRY_OPTOUT: '1', DOTNET_NOLOGO: '1' };
const run = (cmd, args, cwd = root) => execFileSync(cmd, args, { cwd, env, encoding: 'utf8', timeout: 90_000, stdio: ['ignore', 'pipe', 'pipe'] }).trim();

async function initialize(command, args) {
  const child = spawn(command, args, { cwd: root, env, stdio: ['pipe', 'pipe', 'pipe'], detached: true });
  child.stdin.on('error', () => {});
  let buffer = Buffer.alloc(0), stderr = '';
  child.stderr.on('data', chunk => { stderr = (stderr + chunk).slice(-4000); });
  const send = message => {
    const body = Buffer.from(JSON.stringify({ jsonrpc: '2.0', ...message }));
    child.stdin.write(`Content-Length: ${body.length}\r\n\r\n`);
    child.stdin.write(body);
  };
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`${command} initialize timed out: ${stderr}`)), 60_000);
      const finish = (error) => { clearTimeout(timer); error ? reject(error) : resolve(); };
      child.once('error', finish);
      child.once('exit', code => finish(new Error(`${command} exited ${code}: ${stderr}`)));
      child.stdout.on('data', chunk => {
        buffer = Buffer.concat([buffer, chunk]);
        while (true) {
          const end = buffer.indexOf('\r\n\r\n');
          if (end < 0) return;
          const length = Number(buffer.subarray(0, end).toString().match(/Content-Length:\s*(\d+)/i)?.[1]);
          if (!Number.isFinite(length)) return finish(new Error(`${command}: invalid LSP header`));
          if (buffer.length < end + 4 + length) return;
          const message = JSON.parse(buffer.subarray(end + 4, end + 4 + length));
          buffer = buffer.subarray(end + 4 + length);
          if (message.id === 1) {
            if (message.error || !message.result?.capabilities) return finish(new Error(`${command}: ${JSON.stringify(message)}`));
            send({ method: 'initialized', params: {} });
            return finish();
          }
          // Respond to server requests encountered during initialization.
          if (message.id !== undefined && message.method) send({ id: message.id, result: null });
        }
      });
      send({ id: 1, method: 'initialize', params: { processId: process.pid, rootUri: pathToFileURL(root).href,
        workspaceFolders: [{ uri: pathToFileURL(root).href, name: 'toolkit-probe' }], capabilities: {}, initializationOptions: {} } });
    });
    console.log(`LSP OK: ${command}`);
  } finally {
    // A temporary probe is not an editor session; terminate its whole process group.
    child.stdin.destroy();
    child.stdout.destroy();
    child.stderr.destroy();
    try { process.kill(-child.pid, 'SIGKILL'); } catch (error) { if (error.code !== 'ESRCH') throw error; }
  }
}

try {
  assert.notEqual(process.getuid(), 0, 'Run toolkit verification as the agent user');
  assert.equal(run('dotnet', ['--version']), lock.dotnet.version);
  assert.equal(run('tsc', ['--version']), `Version ${lock.npm.typescript}`);
  const cs = join(root, 'csharp');
  run('dotnet', ['new', 'console', '--no-restore', '--output', cs]);
  assert.equal(run('dotnet', ['run', '--project', cs, '--verbosity', 'quiet']), 'Hello, World!');
  writeFileSync(join(root, 'probe.ts'), 'const answer: number = 42; console.log(answer);\n');
  run('tsc', ['--strict', '--noEmit', 'probe.ts']);
  writeFileSync(join(root, 'probe.cpp'), '#include <iostream>\nint main(){std::cout << 42;}\n');
  run('g++', ['-static', 'probe.cpp', '-o', join(root, 'cpp-probe')]);
  assert.equal(run(join(root, 'cpp-probe'), []), '42');
  assert.equal(run('python3', ['-c', 'print(42)']), '42');
  writeFileSync(join(root, 'probe.go'), 'package main\nimport "fmt"\nfunc main(){fmt.Print(42)}\n');
  assert.equal(run('go', ['run', 'probe.go']), '42');
  writeFileSync(join(root, 'Probe.java'), 'class Probe { public static void main(String[] args) { System.out.print(42); } }\n');
  run('javac', ['Probe.java']);
  assert.equal(run('java', ['-cp', root, 'Probe']), '42');
  const dockerTag = 'teck-toolkit-probe:' + process.pid;
  writeFileSync(join(root, 'Dockerfile'), 'FROM scratch\nCOPY cpp-probe /probe\nENTRYPOINT ["/probe"]\n');
  run('docker', ['build', '--network', 'none', '--tag', dockerTag, root]);
  assert.equal(run('docker', ['run', '--rm', '--network', 'none', dockerTag]), '42');
  run('docker', ['image', 'rm', dockerTag]);
  assert.match(run('docker', ['compose', 'version']), /Compose/);
  assert.match(run('docker', ['buildx', 'version']), /buildx/);
  assert.ok(run('kind', ['version']).startsWith(`kind v${lock.native.kind.version} `));
  assert.equal(JSON.parse(run('kubectl', ['version', '--client', '--output=json'])).clientVersion.gitVersion, `v${lock.native.kubectl.version}`);
  run('python3', ['-m', 'pip', '--version']);
  run('uv', ['--version']);
  const buildOnly = process.argv.includes('--build');
  for (const binary of ['next-devtools-mcp', 'gpg', 'git', 'gh', 'chromium', 'google-chrome-stable', 'agent-browser', ...(buildOnly ? [] : ['bun', 'bunx', 'omp'])]) {
    accessSync(run('sh', ['-c', `command -v ${binary}`]), constants.X_OK);
  }
  const report = { uid: process.getuid(), dotnet: lock.dotnet.version, node: run('node', ['--version']),
    bun: buildOnly ? null : run('bun', ['--version']), omp: buildOnly ? null : run('omp', ['--version']), typescript: lock.npm.typescript,
    chrome: run('google-chrome-stable', ['--version']), go: run('go', ['version']), java: run('javac', ['-version']), docker: run('docker', ['version', '--format', '{{.Server.Version}}']), uv: run('uv', ['--version']), kind: lock.native.kind.version, kubectl: lock.native.kubectl.version, compilers: ['C#', 'TypeScript', 'C++', 'Python', 'Go', 'Java'], languageServers: [] };
  const servers = [
    ['typescript-language-server', '--stdio'], ['biome', 'lsp-proxy'],
    ['vscode-html-language-server', '--stdio'], ['vscode-css-language-server', '--stdio'],
    ['vscode-json-language-server', '--stdio'], ['vscode-eslint-language-server', '--stdio'],
    ['tailwindcss-language-server', '--stdio'], ['pyright-langserver', '--stdio'],
    ['bash-language-server', 'start'], ['yaml-language-server', '--stdio'],
    ['docker-langserver', '--stdio'], ['marksman', 'server'], ['terraform-ls', 'serve'],
    ['helm_ls', 'serve'], ['omnisharp', '--languageserver', '--hostPID', String(process.pid)],
  ];
  for (const [binary, ...args] of servers) { await initialize(binary, args); report.languageServers.push(binary); }
  console.log(JSON.stringify(report));
} finally { rmSync(root, { recursive: true, force: true }); }
