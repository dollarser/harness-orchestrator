import type { Context } from '@deepseek-ai/cordis';
import type { CommandInvocation, CommandResult } from '@deepseek-ai/dsh-commands';
import type {} from '@deepseek-ai/dsh-subagent';
import { orchestrate } from '../core/orchestrator.js';
import type { WorkspaceRun } from '../host/workspace.js';
import { acquireWorkspace } from '../host/workspace.js';
import { ChildDisposalError, invokeChild, preflight } from './backend.js';
import { registerSettings, configForRun } from './settings.js';

/** Snapshots are useful evidence, never a prerequisite for Agent execution. */
async function capture(lease: WorkspaceRun, label: string, signal: AbortSignal) {
  try {
    const evidence = await lease.evidence(signal);
    const { patch, ...metadata } = evidence.kind === 'git' ? evidence : { ...evidence, patch: undefined };
    await lease.save(`${label}.json`, metadata);
    if (patch !== undefined) await lease.save(`${label}.patch`, patch);
  } catch (error) {
    signal.throwIfAborted();
    await lease.save(`${label}.json`, { kind: 'unavailable', reason: String(error) });
  }
}

export const name = 'smart-dev';
export const inject = ['commands', 'subagents', 'settings'];

/** Human slash command: Agent-owned execution with host lifecycle safeguards. */
export function apply(ctx: Context, raw: unknown): void {
  const settings = registerSettings(ctx, raw);
  const shutdown = new AbortController();
  const active = new Set<Promise<CommandResult>>();
  async function execute(invocation: CommandInvocation): Promise<CommandResult> {
    let lease;
    let runDir: string | undefined;
    let disposalFailed = false;
    try {
      const config = configForRun(settings.get());
      const task = invocation.rawInput.trim();
      if (!task) throw new Error('Usage: /smart-dev <task>');
      const signal = AbortSignal.any([invocation.signal, shutdown.signal]);
      signal.throwIfAborted();
      const cwd = invocation.agent.session.header.cwd;
      if (!cwd) throw new Error('Select a workspace before running /smart-dev');
      preflight(ctx, config);
      lease = await acquireWorkspace(cwd, config.stateRoot, signal);
      runDir = lease.runDir;
      await lease.save('config.json', config);
      await capture(lease, 'before', signal);
      const result = await orchestrate(task, {
        version: 2, runId: lease.runId, workspace: lease.workspace,
        stage: 'CREATED',
      }, {
        invoke: async (prompt, childSignal) => {
          try { return await invokeChild(ctx, invocation.agent, config, prompt, childSignal); }
          catch (error) { if (error instanceof ChildDisposalError) disposalFailed = true; throw error; }
        },
        save: lease.save,
        progress: state => ctx.logger.info(`smart-dev ${state.runId}: ${state.stage}`),
      }, signal);
      // Capture partial worker changes on failures/cancellation as well as on successful runs.
      if (!disposalFailed) {
        try { await capture(lease, 'last', AbortSignal.timeout(30_000)); }
        catch (error) { await lease.save('snapshot.error.txt', String(error)); }
      }
      return { kind: result.stage === 'FINISHED' ? 'success' : 'error',
        text: `${result.stage}: ${result.message ?? ''}\nArtifacts: ${runDir}` };
    } catch (error) {
      return { kind: 'error', text: `${String(error)}${runDir ? `\nArtifacts: ${runDir}` : ''}` };
    } finally {
      if (!disposalFailed) await lease?.release();
    }
  }
  ctx.effect(function* () {
    yield async () => { shutdown.abort(new Error('smart-dev unloaded')); await Promise.allSettled(active); };
    yield ctx.commands.register({
      name: 'smart-dev', description: 'Delegate a coding task to an autonomous Agent',
      input: { hint: 'Describe the task and acceptance criteria' },
      handler(invocation) {
        // Keep the parent quiescent; queued UI prompts wake only after the workflow settles.
        const operation = Promise.resolve().then(() => invocation.agent.runMaintenance(
          signal => execute({ ...invocation, signal: AbortSignal.any([invocation.signal, signal]) }),
        )).catch((error: unknown): CommandResult => ({ kind: 'error', text: String(error) }));
        active.add(operation);
        void operation.then(() => active.delete(operation), () => active.delete(operation));
        return operation;
      },
    });
  });
}
