import { createHash, randomUUID } from 'node:crypto';
import { mkdir, realpath, rename, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { runCommand } from './process.js';
import type { Evidence } from '../core/types.js';

async function git(cwd: string, args: string[], signal: AbortSignal, env?: NodeJS.ProcessEnv): Promise<string> {
  const result = await runCommand(['git', ...args], cwd, signal, 30_000, env, 16_000_000);
  if (result.code !== 0 || result.failure) throw new Error(`git ${args[0]} failed: ${result.failure ?? result.stderr}`);
  return result.stdout;
}
function inside(root: string, path: string): boolean {
  const rel = relative(root, path);
  return rel === '' || (!rel.startsWith(`..${sep}`) && rel !== '..' && !isAbsolute(rel));
}

async function realLocation(path: string): Promise<string> {
  const resolved = resolve(path);
  try { return await realpath(resolved); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    return join(await realLocation(dirname(resolved)), basename(resolved));
  }
}

export interface WorkspaceRun {
  workspace: string;
  runId: string;
  runDir: string;
  save(name: string, value: unknown): Promise<void>;
  evidence(signal: AbortSignal): Promise<Evidence>;
  release(): Promise<void>;
}

export async function acquireWorkspace(cwd: string, stateRoot: string, signal: AbortSignal): Promise<WorkspaceRun> {
  if (process.platform === 'win32') throw new Error('This MVP requires POSIX process-group cancellation');
  const workspace = await realpath(cwd);
  const top = await realpath((await git(workspace, ['rev-parse', '--show-toplevel'], signal)).trim());
  if (workspace !== top) throw new Error('Select the Git worktree root as the DSH session workspace');
  // Resolve existing ancestors before mkdir; even a rejected config must not dirty the repository.
  const canonicalStateRoot = await realLocation(stateRoot);
  if (inside(workspace, canonicalStateRoot)) throw new Error('stateRoot must resolve outside the target workspace');
  await mkdir(canonicalStateRoot, { recursive: true, mode: 0o700 });
  const key = createHash('sha256').update(workspace).digest('hex');
  const lock = join(canonicalStateRoot, 'locks', key);
  await mkdir(join(canonicalStateRoot, 'locks'), { recursive: true, mode: 0o700 });
  try { await mkdir(lock, { mode: 0o700 }); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') throw new Error(`Workspace already locked: ${lock}`);
    throw error;
  }
  const runId = randomUUID();
  const runDir = join(canonicalStateRoot, 'runs', runId);
  let released = false;
  const release = async () => {
    if (!released) { await rm(lock, { recursive: true, force: true }); released = true; }
  };
  try {
    signal.throwIfAborted();
    await writeFile(join(lock, 'owner.json'), JSON.stringify({ pid: process.pid, workspace, runId }), { mode: 0o600 });
    await git(workspace, ['rev-parse', '--verify', 'HEAD'], signal);
    if ((await git(workspace, ['status', '--porcelain=v1', '--untracked-files=all'], signal)).trim())
      throw new Error('Workspace is dirty; use a clean isolated worktree');
    await mkdir(runDir, { recursive: true, mode: 0o700 });
    const save = async (name: string, value: unknown) => {
      if (!/^[a-zA-Z0-9_.-]+$/u.test(name)) throw new Error('Invalid artifact filename');
      const temp = join(runDir, `.${name}.${randomUUID()}.tmp`);
      await writeFile(temp, typeof value === 'string' ? value : JSON.stringify(value, null, 2) + '\n', { mode: 0o600 });
      await rename(temp, join(runDir, name));
    };
    return {
      workspace, runId, runDir, save, release,
      async evidence(captureSignal) {
        // A temporary index captures added/binary files without changing the user's index.
        const index = join(runDir, `.index-${randomUUID()}`);
        const env = { ...process.env, GIT_INDEX_FILE: index };
        try {
          await git(workspace, ['read-tree', 'HEAD'], captureSignal, env);
          await git(workspace, ['add', '-A', '--', '.'], captureSignal, env);
          const patch = await git(workspace, ['diff', '--cached', '--binary', '--no-ext-diff', '--no-textconv', 'HEAD', '--'], captureSignal, env);
          const head = await git(workspace, ['rev-parse', 'HEAD'], captureSignal);
          const branch = await git(workspace, ['rev-parse', '--symbolic-full-name', 'HEAD'], captureSignal);
          const status = await git(workspace, ['status', '--porcelain=v1', '--untracked-files=all'], captureSignal);
          const staged = await git(workspace, ['diff', '--cached', '--binary', '--no-ext-diff', '--no-textconv', 'HEAD', '--'], captureSignal);
          return { patch, fingerprint: createHash('sha256').update(JSON.stringify([patch, head, branch, status, staged])).digest('hex') };
        } finally {
          await rm(index, { force: true });
          await rm(`${index}.lock`, { force: true });
        }
      },
    };
  } catch (error) { await release(); throw error; }
}
