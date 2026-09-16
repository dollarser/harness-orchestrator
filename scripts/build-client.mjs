import { build } from 'esbuild';
import { readFile } from 'node:fs/promises';
const { name } = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
// DSH materializes this lazy factory after its dependency factories are available.
await build({
  entryPoints: ['src/client/index.ts'], outfile: 'dist/client.js', bundle: true,
  platform: 'browser', format: 'cjs', target: 'es2022', external: ['react'],
  banner: { js: `window.__ModuleLoader__.load({ id: ${JSON.stringify(name)}, factory: (require) => { var module = { exports: {} }; var exports = module.exports;` },
  footer: { js: 'return module.exports; } });' },
});
