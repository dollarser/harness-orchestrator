import { taskPrompt } from './prompts.js';
import type { Ports, Stage, State } from './types.js';

/** Run one autonomous Agent; only its lifecycle is controlled by the plugin. */
export async function orchestrate(task: string, initial: State, ports: Ports, signal: AbortSignal): Promise<State> {
  if (!task.trim()) throw new Error('Task must not be empty');
  const state = { ...initial };
  let event = 0;
  async function transition(stage: Stage, message?: string) {
    state.stage = stage; state.message = message;
    await ports.save('state.json', state);
    await ports.save(`event-${event++}.json`, state);
    try { ports.progress?.({ ...state }); } catch { /* observers do not control execution */ }
  }
  try {
    signal.throwIfAborted();
    await ports.save('task.txt', task);
    const prompt = taskPrompt(task);
    await ports.save('agent.prompt.txt', prompt);
    await transition('RUNNING');
    signal.throwIfAborted();
    const result = await ports.invoke(prompt, signal);
    await ports.save('agent.result.json', result);
    signal.throwIfAborted();
    if (result.stopReason !== 'completed') throw new Error(`Agent ended with ${result.stopReason}${result.diagnostic ? ': ' + result.diagnostic : ''}`);
    if (!result.output.trim()) throw new Error('Agent returned empty output');
    await ports.save('report.md', result.output);
    await transition('FINISHED', result.output);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await ports.save('error.txt', message);
    await transition(signal.aborted ? 'CANCELLED' : 'FAILED', message);
  }
  return state;
}
