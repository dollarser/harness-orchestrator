import { spawn } from 'node:child_process';
import type { Verification } from '../core/types.js';

/** Trusted host commands, argv only. Cancellation kills the owned process group on POSIX. */
export function runCommand(argv: string[], cwd: string, signal: AbortSignal, timeoutMs: number,
  env?: NodeJS.ProcessEnv, maxBytes = 2_000_000): Promise<Verification> {
  signal.throwIfAborted();
  return new Promise(resolve => {
    const started = Date.now();
    const output: Buffer[] = [], errors: Buffer[] = [];
    let size = 0, failure: string | undefined, killTimer: NodeJS.Timeout | undefined;
    const child = spawn(argv[0]!, argv.slice(1), {
      cwd, env: env ?? process.env, shell: false, detached: process.platform !== 'win32',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    function kill(force: boolean) {
      try {
        if (process.platform !== 'win32' && child.pid) process.kill(-child.pid, force ? 'SIGKILL' : 'SIGTERM');
        else child.kill(force ? 'SIGKILL' : 'SIGTERM');
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ESRCH') failure ??= String(error);
      }
    }
    function stop(reason: string) {
      if (failure) return;
      failure = reason;
      kill(false);
      killTimer = setTimeout(() => kill(true), 1000);
    }
    function collect(chunks: Buffer[], chunk: Buffer) {
      const available = Math.max(0, maxBytes - size);
      chunks.push(chunk.subarray(0, available));
      size += chunk.length;
      if (size > maxBytes) stop('output_limit');
    }
    child.stdout.on('data', (chunk: Buffer) => collect(output, chunk));
    child.stderr.on('data', (chunk: Buffer) => collect(errors, chunk));
    child.on('error', error => { failure ??= error.message; });
    const abort = () => stop('cancelled');
    signal.addEventListener('abort', abort, { once: true });
    const timer = setTimeout(() => stop('timeout'), timeoutMs);
    if (signal.aborted) abort();
    child.on('close', code => {
      clearTimeout(timer);
      // Complete the group cleanup even if the leader exited first after SIGTERM.
      if (failure) kill(true);
      if (killTimer) clearTimeout(killTimer);
      signal.removeEventListener('abort', abort);
      resolve({ argv, code, stdout: Buffer.concat(output).toString('utf8'),
        stderr: Buffer.concat(errors).toString('utf8'), durationMs: Date.now() - started,
        ...(failure ? { failure } : {}) });
    });
  });
}
