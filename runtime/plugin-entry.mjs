import { fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { startProjectTransports } from './project-transport.mjs';
// The build emits a small, integrity-checked entry that imports this module.
export default function activate(orca) {
  // Also restore project listeners whenever this on-demand plugin is activated.
  // The login supervisor covers cold desktop startup without invoking a command.
  void startProjectTransports(process.ppid, { log: message => orca.log(message) }).catch(error => orca.log(error.message));
  orca.commands.register('teck.reconnectSandboxes', async () => {
    const projects = await startProjectTransports(process.ppid, { log: message => orca.log(message) });
    const child = fork(fileURLToPath(new URL('./reconnect-host.mjs', import.meta.url)), [String(process.ppid)], {
      detached: true, windowsHide: true, stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
      execArgv: [], env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
    });
    const result = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => { child.kill(); reject(Error('Sandbox recovery setup timed out')); }, 25_000);
      const finish = (error, value) => { clearTimeout(timer); error ? reject(error) : resolve(value); };
      child.once('error', error => finish(error));
      child.once('exit', () => finish(Error('Sandbox recovery helper exited before reporting readiness')));
      child.once('message', message => message.type === 'ready' ? finish(null, message) : finish(Error(message.error || 'Sandbox recovery failed')));
      child.send({ type: 'start' });
    });
    child.unref();
    const listening = result.results.filter(item => ['listening', 'direct'].includes(item.state));
    const blocked = result.results.filter(item => item.state === 'blocked');
    const unavailable = blocked.filter(item => item.reason === 'saved-port-unavailable');
    orca.log(`Recovery ready for ${listening.length} Teck feature(s); ${blocked.length} blocked. No desktop records were edited.`);
    for (const item of blocked) orca.log(`${item.sandbox}: ${item.error}`);
    orca.log(`Recovery diagnostics: ${result.logPath}`);
    await orca.host.call('notifications.show', { title: 'Teck sandbox recovery', body: listening.length
      ? `Recovery ready for ${listening.length} feature(s). Select Retry in the disconnected terminal. ${blocked.length} blocked.`
      : unavailable.length
        ? `${unavailable.length} feature(s) have saved ports reserved or denied by the OS. Suspend then resume those feature workspaces in Orca to refresh their connections. Retry alone cannot fix the saved address.`
        : 'No connection was changed. Check the Teck plugin logs for missing features or occupied ports.' });
    return { recovered: listening.length, blocked: blocked.length, projects };
  });
}
