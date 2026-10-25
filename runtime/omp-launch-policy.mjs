// Session-local launch policy; never changes the user's saved configuration.
export function reviewLaunchArgs(args) {
  const terminator = args.indexOf('--');
  const end = terminator < 0 ? args.length : terminator;
  const options = args.slice(0, end);
  let model;
  for (let i = 0; i < options.length; i++) {
    if (options[i] === '--model') model = options[++i];
    else if (options[i].startsWith('--model=')) model = options[i].slice('--model='.length);
  }
  const overlay = '/home/agent/.omp/agent/reviewer.yml';
  const configured = options.some((option, index) => option === `--config=${overlay}` ||
    option === '--config' && options[index + 1] === overlay);
  if (!/^omniroute\/teck-advisor(?::(?:low|medium|high|xhigh|max))?$/.test(model ?? '') ||
      options.includes('--advisor') || configured) return [...args];
  return [...options, '--config', overlay, ...args.slice(end)];
}
