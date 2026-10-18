import { rememberSession } from './omp-session.mjs';
import type { ExtensionAPI } from '@oh-my-pi/pi-coding-agent';

export default function activate(pi: ExtensionAPI) {
  const path = process.env.TECK_ORCA_OMP_RECORD;
  const token = process.env.TECK_ORCA_OMP_TOKEN;
  if (!path || !token) return;
  // Update after /new, /resume, forks and model changes as well as ordinary turns.
  const remember = (_event, ctx) => rememberSession(path, token, ctx, ctx.model, pi.getThinkingLevel());
  for (const event of ['session_start', 'session_switch', 'session_branch', 'session_tree',
    'before_agent_start', 'agent_end', 'model_select']) pi.on(event, remember);
}
