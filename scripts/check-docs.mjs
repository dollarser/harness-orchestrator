import { readdir, readFile, access } from 'node:fs/promises';
import { join, dirname, resolve } from 'node:path';

async function check(dir) {
  for (const item of await readdir(dir, { withFileTypes: true })) {
    if (['.git', 'node_modules', 'dist', 'test-results', 'playwright-report'].includes(item.name)) continue;
    const path = join(dir, item.name);
    if (item.isDirectory()) await check(path);
    else if (path.endsWith('.md')) {
      const text = await readFile(path, 'utf8');
      for (const [, target] of text.matchAll(/\]\(([^)]+)\)/gu)) {
        if (/^(https?:|#)/u.test(target)) continue;
        const local = target.split('#')[0];
        if (local) await access(resolve(dirname(path), decodeURIComponent(local)));
      }
    }
  }
}
await check('.');
console.log('Local Markdown links resolve.');
