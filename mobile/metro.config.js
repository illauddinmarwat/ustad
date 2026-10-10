const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

// Dev-only: `JOB_DEMO=1` swaps the backend for an in-memory job so the job flow can be viewed without an account.
if (process.env.JOB_DEMO === '1') {
  const swaps = [
    [/^(\.{1,2}\/)+(lib\/)?supabase$|^\.\/supabase$/, 'demoSupabase.ts'],
    [/^(\.{1,2}\/)+config\/env$|^\.\/env$/, 'demoEnv.ts'],
    [/^(\.{1,2}\/)+(context\/)?AuthContext$/, 'demoAuth.tsx'],
  ];
  const original = config.resolver.resolveRequest;
  config.resolver.resolveRequest = (context, moduleName, platform) => {
    const fromDemo = context.originModulePath.includes(`${path.sep}demo${path.sep}`);
    if (!fromDemo) {
      for (const [pattern, file] of swaps) {
        if (pattern.test(moduleName)) {
          return { type: 'sourceFile', filePath: path.join(__dirname, 'demo', file) };
        }
      }
    }
    if (moduleName === './App' && context.originModulePath.endsWith('index.ts')) {
      return { type: 'sourceFile', filePath: path.join(__dirname, 'demo', 'DemoApp.tsx') };
    }
    return (original ?? context.resolveRequest)(context, moduleName, platform);
  };
}

module.exports = config;
