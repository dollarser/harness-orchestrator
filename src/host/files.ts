import { readFile, writeFile, rename, mkdir, unlink } from 'node:fs/promises';
import { dirname } from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
export const hash = (text: string) => createHash('sha256').update(text).digest('hex');
export async function readJson<T>(path: string, fallback?: T): Promise<T> {
  try { return JSON.parse(await readFile(path, 'utf8')) as T; }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT' && fallback !== undefined) return fallback; throw error; }
}
export async function atomic(path: string, text: string) {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const temp = `${path}.${randomUUID()}.tmp`;
  try { await writeFile(temp, text, { mode: 0o600, flag: 'wx' }); await rename(temp, path); }
  finally { await unlink(temp).catch(() => {}); }
}
