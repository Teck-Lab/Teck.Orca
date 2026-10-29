globalThis.process ??= { env: { NODE_ENV: 'production', EXPO_OS: 'web' }, platform: 'web', version: '', nextTick: (fn) => setTimeout(fn, 0) };globalThis.__zod_globalConfig ??= {}; globalThis.__zod_globalConfig.jitless = true;
var t=new Intl.Collator("en",{numeric:!0});function i(r,e){let n=t.compare(r,e);return n!==0?n:r<e?-1:r>e?1:0}export{i as a};
