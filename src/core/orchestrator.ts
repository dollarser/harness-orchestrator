import { parsePlan, parseReview } from './artifacts.js';
import { fixerPrompt, plannerPrompt, reviewerPrompt, workerPrompt } from './prompts.js';
import { validatePolicy } from './types.js';
import type { Policy, Ports, Role, Stage, State } from './types.js';

export async function orchestrate(task: string, initial: State, policy: Policy, ports: Ports, signal: AbortSignal): Promise<State> {
  validatePolicy(policy);
  if (!task.trim()) throw new Error('Task must not be empty');
  const state = { ...initial };
  async function transition(stage: Stage, message?: string) {
    state.stage = stage;
    state.message = message;
    await ports.save('state.json', state);
    await ports.save(`event-${event++}.json`, state);
    try { ports.progress?.({ ...state }); } catch { /* observers cannot decide run outcome */ }
  }
  let event = 0;
  let invocation = 0;
  async function invoke(role: Role, prompt: string): Promise<string> {
    signal.throwIfAborted();
    if (prompt.length > 256_000) throw new Error(`${role} prompt exceeds 256000 characters; split the task or reduce verification output`);
    if (role === 'planner' || role === 'reviewer') {
      if (state.strongCalls >= policy.maxStrongCalls) throw new Error('Strong-agent call budget exhausted');
      state.strongCalls++;
      // Charge attempts durably before startup; aliases and failed starts cannot bypass the budget.
      await ports.save('state.json', state);
    }
    const stem = `${invocation++}-${role}`;
    await ports.save(`${stem}.prompt.txt`, prompt);
    const readOnly = role === 'planner' || role === 'reviewer';
    const before = readOnly ? await ports.evidence(signal) : undefined;
    let result;
    try {
      result = await ports.invoke(role, prompt, signal);
    } catch (error) {
      await ports.save(`${stem}.error.txt`, String(error));
      throw error;
    }
    await ports.save(`${stem}.result.json`, result);
    signal.throwIfAborted();
    if (before && before.fingerprint !== (await ports.evidence(signal)).fingerprint)
      throw new Error(`${role} changed repository state; changes retained for inspection`);
    if (result.stopReason !== 'completed') throw new Error(`${role} ended with ${result.stopReason}`);
    if (!result.output.trim()) throw new Error(`${role} returned empty output`);
    return result.output;
  }
  try {
    await ports.save('task.txt', task);
    await ports.save('policy.json', policy);
    await transition('PLAN');
    const plan = parsePlan(await invoke('planner', plannerPrompt(task)));
    await ports.save('plan.json', plan);
    await transition('EXECUTE');
    await invoke('worker', workerPrompt(task, plan));
    while (true) {
      signal.throwIfAborted();
      await transition('VERIFY');
      const verification = [];
      for (const argv of policy.verifyCommands) {
        signal.throwIfAborted();
        verification.push(await ports.verify(argv, signal));
        await ports.save(`verification-${state.fixRounds}.json`, verification);
      }
      signal.throwIfAborted();
      const evidence = await ports.evidence(signal);
      await ports.save(`changes-${state.fixRounds}.patch`, evidence.patch);
      if (state.strongCalls >= policy.maxStrongCalls) {
        await transition('NEEDS_REVIEW', 'Verification recorded; no budget remains for review of the latest changes');
        break;
      }
      // Refuse oversized evidence rather than silently dropping files from the review prompt.
      if (evidence.patch.length > 120_000) throw new Error('Patch exceeds review limit; split the task');
      await transition('REVIEW');
      const review = parseReview(await invoke('reviewer', reviewerPrompt(task, plan, evidence.patch, verification)));
      await ports.save(`review-${state.fixRounds}.json`, review);
      if (review.decision === 'PASS' && verification.every(v => v.code === 0 && !v.failure)) {
        await ports.save('final.patch', evidence.patch);
        await transition('DONE');
        break;
      }
      if (state.fixRounds >= policy.maxFixRounds) throw new Error('Fix round budget exhausted');
      state.fixRounds++;
      await transition('FIX');
      await invoke('fixer', fixerPrompt(task, plan, review, verification));
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await ports.save('error.txt', message);
    await transition(signal.aborted ? 'CANCELLED' : 'FAILED', message);
  }
  return state;
}
