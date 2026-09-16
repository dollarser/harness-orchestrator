import { createServer } from 'node:http';
import { build } from 'esbuild';
const { outputFiles } = await build({ entryPoints: ['tests/browser/fixture.tsx'], bundle: true, write: false, format: 'iife', platform: 'browser', define: { 'process.env.NODE_ENV': '"development"' } });
const server = createServer((req, res) => {
  res.setHeader('content-type', req.url === '/fixture.js' ? 'text/javascript' : 'text/html; charset=utf-8');
  res.end(req.url === '/fixture.js' ? outputFiles[0].contents : '<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Smart Dev UI fixture</title><style>body{margin:0;padding:24px;background:#fff}@media(prefers-color-scheme:dark){body{background:#202725}}@media(max-width:540px){body{padding:12px}}</style><div id="root"></div><script src="/fixture.js"></script></html>');
});
server.listen(4179, '127.0.0.1');
