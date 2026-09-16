import { createHash, randomUUID } from 'node:crypto';
import { mkdir, realpath, rename, rm, stat, writeFile } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { runCommand } from './process.js';
import type { Evidence } from '../core/types.js';

async function git(cwd: string, args: string[], signal: AbortSignal, env?: NodeJS.ProcessEnv): Promise<string> {
  const result = await runCommand(['git', ...args], cwd, signal, 30_000, env, 16_000_000);
  if (result.code !== 0 || result.failure) throw new Error(`git ${args[0]} failed: ${result.failure ?? result.stderr}`);
  return result.stdout;
}
async function gitRoot(cwd: string, signal: AbortSignal): Promise<string | undefined> {
  const result = await runCommand(['git', 'rev-parse', '--show-toplevel'], cwd, signal, 30_000);
  signal.throwIfAborted();
  return result.code === 0 && !result.failure ? realpath(result.stdout.trim()) : undefined;
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
  if (!(await stat(workspace)).isDirectory()) throw new Error('Workspace must be a directory');
  const top = await gitRoot(workspace, signal);
  // Existing repository subdirectories share a lock; ordinary directories use their own real path.
  const lockRoot = top ?? workspace;
  // Resolve existing ancestors before mkdir; even a rejected config must not dirty the repository.
  const canonicalStateRoot = await realLocation(stateRoot);
  if (inside(lockRoot, canonicalStateRoot)) throw new Error('stateRoot must resolve outside the target workspace');
  await mkdir(canonicalStateRoot, { recursive: true, mode: 0o700 });
  const key = createHash('sha256').update(lockRoot).digest('hex');
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
    await writeFile(join(lock, 'owner.json'), JSON.stringify({ pid: process.pid, workspace, lockRoot, runId }), { mode: 0o600 });
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
        const root = await gitRoot(workspace, captureSignal);
        if (!root) return { kind: 'unavailable', reason: 'No Git worktree detected; file changes are not captured as a patch.' };
        // A temporary index captures added/binary files without changing the user's index.
        const index = join(runDir, `.index-${randomUUID()}`);
        const env = { ...process.env, GIT_INDEX_FILE: index };
        try {
          const headResult = await runCommand(['git', 'rev-parse', '--verify', 'HEAD'], workspace, captureSignal, 30_000);
          const head = headResult.code === 0 && !headResult.failure ? headResult.stdout.trim() : undefined;
          await git(workspace, ['read-tree', head ?? '--empty'], captureSignal, env);
          await git(workspace, ['add', '-A', '--', '.'], captureSignal, env);
          const patch = await git(workspace, ['diff', '--cached', '--binary', '--no-ext-diff', '--no-textconv', ...(head ? [head] : []), '--', '.'], captureSignal, env);
          const branchResult = await runCommand(['git', 'symbolic-ref', '--quiet', 'HEAD'], workspace, captureSignal, 30_000);
          const branch = branchResult.code === 0 ? branchResult.stdout : '';
          const status = await git(workspace, ['status', '--porcelain=v1', '--untracked-files=all'], captureSignal);
          const staged = await git(workspace, ['diff', '--cached', '--binary', '--no-ext-diff', '--no-textconv', ...(head ? [head] : []), '--', '.'], captureSignal);
          return { kind: 'git', root, head, patch, fingerprint: createHash('sha256').update(JSON.stringify([patch, head, branch, status, staged])).digest('hex') };
        } finally {
          await rm(index, { force: true });
          await rm(`${index}.lock`, { force: true });
        }
      },
    };
  } catch (error) { await release(); throw error; }
}
