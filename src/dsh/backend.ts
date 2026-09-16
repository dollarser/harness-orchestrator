import type { Context } from '@deepseek-ai/cordis';
import type { Agent } from '@deepseek-ai/dsh-agent';
import type {} from '@deepseek-ai/dsh-subagent';
import type { AgentResult } from '../core/types.js';
import { backendChoice } from '../shared/backends.js';
import type { Config } from './config.js';

export class ChildDisposalError extends Error {}

export function preflight(ctx: Pick<Context, 'subagents'>, config: Config): void {
  const provider = ctx.subagents.getProvider(config.workerProvider);
  if (!provider) throw new Error(`Missing subagent provider: ${config.workerProvider}`);
  if (backendChoice(config.workerProvider)?.dshModel && !provider.capabilities.agentOptions) throw new Error('Agent backend must support model selection');
  if (backendChoice(config.workerProvider)?.dshModel && config.workerToolAllow.length && !provider.capabilities.toolFilter)
    throw new Error('Agent backend must support the configured tool filter');
}

function cancelled(signal: AbortSignal): Promise<never> {
  return new Promise((_, reject) => {
    if (signal.aborted) reject(signal.reason);
    else signal.addEventListener('abort', () => reject(signal.reason), { once: true });
  });
}

export async function invokeChild(ctx: Pick<Context, 'subagents'>, parent: Agent, config: Config,
  prompt: string, signal: AbortSignal): Promise<AgentResult> {
  const timer = new AbortController();
  const timeout = setTimeout(() => timer.abort(new Error('Agent timed out')), config.agentTimeoutMs);
  const combined = AbortSignal.any([signal, timer.signal]);
  let run;
  try {
    combined.throwIfAborted();
    run = await ctx.subagents.start(config.workerProvider, {
      parent, signal: combined, label: 'smart-dev agent', prompt: [{ type: 'text', text: prompt }],
      ...(backendChoice(config.workerProvider)?.dshModel ? {
        agentOptions: config.workerModel,
        ...(config.workerToolAllow.length ? { toolFilter: { allow: config.workerToolAllow } } : {}),
      } : {}),
    });
    const result = await Promise.race([run.result, cancelled(combined)]);
    combined.throwIfAborted();
    return {
      runId: String(run.id), stopReason: result.stopReason,
      output: result.output.filter(block => block.type === 'text').map(block => block.text).join('\n'),
      ...('diagnostic' in result && typeof result.diagnostic === 'string' ? { diagnostic: result.diagnostic } : {}),
    };
  } finally {
    clearTimeout(timeout);
    // Never release the workspace to another writer before child disposal completes.
    try { await run?.dispose(); }
    catch (error) { throw new ChildDisposalError(`Child disposal failed; workspace lock retained: ${String(error)}`); }
  }
}
