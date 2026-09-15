import type { Context } from '@deepseek-ai/cordis';
import type { Agent } from '@deepseek-ai/dsh-agent';
import type {} from '@deepseek-ai/dsh-subagent';
import type { AgentResult, Role } from '../core/types.js';
import type { Config } from './config.js';

export class ChildDisposalError extends Error {}

export function preflight(ctx: Pick<Context, 'subagents'>, config: Config): void {
  for (const name of [config.plannerProvider, config.reviewerProvider, config.workerProvider])
    if (!ctx.subagents.getProvider(name)) throw new Error(`Missing subagent provider: ${name}`);
  const caps = ctx.subagents.getProvider(config.workerProvider)!.capabilities;
  if (!caps.agentOptions || !caps.toolFilter || !caps.depthLimit)
    throw new Error('Worker backend must support model selection, tool filtering and delegation depth limits');
}

function cancelled(signal: AbortSignal): Promise<never> {
  return new Promise((_, reject) => {
    if (signal.aborted) reject(signal.reason);
    else signal.addEventListener('abort', () => reject(signal.reason), { once: true });
  });
}

export async function invokeChild(ctx: Pick<Context, 'subagents'>, parent: Agent, config: Config,
  role: Role, prompt: string, signal: AbortSignal): Promise<AgentResult> {
  const timer = new AbortController();
  const timeout = setTimeout(() => timer.abort(new Error(`${role} timed out`)), config.agentTimeoutMs);
  const combined = AbortSignal.any([signal, timer.signal]);
  const local = role === 'worker' || role === 'fixer';
  const provider = local ? config.workerProvider : role === 'planner' ? config.plannerProvider : config.reviewerProvider;
  let run;
  try {
    combined.throwIfAborted();
    run = await ctx.subagents.start(provider, {
      parent, signal: combined, label: `smart-dev ${role}`, prompt: [{ type: 'text', text: prompt }],
      ...(local ? { agentOptions: config.workerModel, maxDepth: 1, toolFilter: { allow: config.workerToolAllow } } : {}),
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
