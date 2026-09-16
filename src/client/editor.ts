import { validateConfig } from '../shared/config.js';
import type { Settings } from '../shared/config.js';

export const editableKeys = ['enabled', 'plannerProvider', 'reviewerProvider', 'workerProvider',
  'workerModel', 'workerToolAllow', 'verifyCommands', 'maxStrongCalls', 'maxFixRounds',
  'agentTimeoutMs', 'commandTimeoutMs'] as const;
export type Draft = Record<'plannerProvider' | 'reviewerProvider' | 'workerProvider' | 'modelProvider' | 'model'
  | 'tools' | 'commands' | 'maxStrongCalls' | 'maxFixRounds' | 'agentTimeoutMs' | 'commandTimeoutMs', string> & { enabled: boolean };
export function toDraft(value: Settings): Draft {
  return {
    enabled: value.enabled, plannerProvider: value.plannerProvider, reviewerProvider: value.reviewerProvider,
    workerProvider: value.workerProvider, modelProvider: value.workerModel.provider, model: value.workerModel.model,
    tools: value.workerToolAllow.join('\n'), commands: JSON.stringify(value.verifyCommands, null, 2),
    maxStrongCalls: String(value.maxStrongCalls), maxFixRounds: String(value.maxFixRounds),
    agentTimeoutMs: String(value.agentTimeoutMs), commandTimeoutMs: String(value.commandTimeoutMs),
  };
}
export function fromDraft(draft: Draft, stateRoot: string): Settings {
  let commands: unknown;
  try { commands = JSON.parse(draft.commands); }
  catch { throw new Error('验证命令必须是 JSON 二维数组，例如 [["npm", "test"]]。'); }
  if (!Array.isArray(commands) || commands.some(cmd => !Array.isArray(cmd)
    || cmd.some(arg => typeof arg !== 'string'))) throw new Error('验证命令必须是字符串二维数组。');
  const integer = (key: 'maxStrongCalls' | 'maxFixRounds' | 'agentTimeoutMs' | 'commandTimeoutMs', min: number, max: number) => {
    const value = Number(draft[key]);
    if (!draft[key].trim() || !Number.isSafeInteger(value) || value < min || value > max)
      throw new Error(`${key} 必须是 ${min}–${max} 之间的整数。`);
    return value;
  };
  const value: Settings = {
    enabled: draft.enabled, stateRoot,
    plannerProvider: draft.plannerProvider.trim(), reviewerProvider: draft.reviewerProvider.trim(),
    workerProvider: draft.workerProvider.trim(),
    workerModel: { provider: draft.modelProvider.trim(), model: draft.model.trim() },
    workerToolAllow: [...new Set(draft.tools.split('\n').map(t => t.trim()).filter(Boolean))],
    verifyCommands: commands as string[][],
    maxStrongCalls: integer('maxStrongCalls', 2, 100), maxFixRounds: integer('maxFixRounds', 0, 10),
    agentTimeoutMs: integer('agentTimeoutMs', 1, 2_147_483_647), commandTimeoutMs: integer('commandTimeoutMs', 1, 2_147_483_647),
  };
  if (value.enabled) validateConfig(value);
  return value;
}
export const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
