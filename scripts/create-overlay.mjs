import { readFile, writeFile } from 'node:fs/promises';
import { resolve, dirname, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';

const [input, output] = process.argv.slice(2);
if (!input || !output) throw new Error('Usage: node scripts/create-overlay.mjs <config.json> <output.yml>');
if (resolve(input) === resolve(output)) throw new Error('Input and output must differ');
const config = JSON.parse(await readFile(input, 'utf8'));
if (!config || typeof config !== 'object' || Object.keys(config).some(key => key !== 'profileDir')) throw new Error('Only profileDir is supported');
if (typeof config.profileDir !== 'string' || !isAbsolute(config.profileDir)) throw new Error('Set an absolute profileDir when loading from the source checkout');
const plugin = resolve(dirname(fileURLToPath(import.meta.url)), '../dist/dsh/plugin.js');
// JSON is valid YAML; absolute paths avoid profile-relative module resolution.
await writeFile(output, JSON.stringify([{ insert: [{ id: 'smart-dev', name: plugin, config }] }], null, 2) + '\n', { flag: 'wx', mode: 0o600 });
console.log(`Created ${resolve(output)}`);
