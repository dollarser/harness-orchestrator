import { validateConfig } from '../shared/config.js';
import type { Settings } from '../shared/config.js';

export const editableKeys = ['enabled', 'workerProvider', 'workerModel', 'workerToolAllow', 'agentTimeoutMs'] as const;
export type Draft = Record<'workerProvider' | 'modelProvider' | 'model' | 'tools' | 'agentTimeoutMs', string> & { enabled: boolean };
export function toDraft(value: Settings): Draft {
  return {
    enabled: value.enabled, workerProvider: value.workerProvider,
    modelProvider: value.workerModel.provider, model: value.workerModel.model,
    tools: value.workerToolAllow.join('\n'), agentTimeoutMs: String(value.agentTimeoutMs),
  };
}
export function fromDraft(draft: Draft, stateRoot: string): Settings {
  const agentTimeoutMs = Number(draft.agentTimeoutMs);
  if (!draft.agentTimeoutMs.trim() || !Number.isSafeInteger(agentTimeoutMs) || agentTimeoutMs < 1 || agentTimeoutMs > 2_147_483_647)
    throw new Error('agentTimeoutMs 必须是 1–2147483647 之间的整数。');
  const value: Settings = {
    enabled: draft.enabled, stateRoot, workerProvider: draft.workerProvider.trim(),
    workerModel: { provider: draft.modelProvider.trim(), model: draft.model.trim() },
    workerToolAllow: [...new Set(draft.tools.split('\n').map(t => t.trim()).filter(Boolean))], agentTimeoutMs,
  };
  if (value.enabled) validateConfig(value);
  return value;
}
export const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
