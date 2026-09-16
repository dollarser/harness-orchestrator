import { rm } from 'node:fs/promises';
// Avoid shipping obsolete modules after source deletions or renames.
await rm(new URL('../dist/', import.meta.url), { recursive: true, force: true });
