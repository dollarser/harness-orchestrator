import { validatePolicy } from '../core/types.js';
import type { Policy } from '../core/types.js';

export interface Config extends Policy {
  plannerProvider: string;
  reviewerProvider: string;
  workerProvider: string;
  workerModel: { provider: string; model: string };
  workerToolAllow: string[];
  stateRoot: string;
  agentTimeoutMs: number;
  commandTimeoutMs: number;
}

export const configKeys = ['plannerProvider', 'reviewerProvider', 'workerProvider', 'workerModel', 'workerToolAllow',
  'stateRoot', 'agentTimeoutMs', 'commandTimeoutMs', 'maxStrongCalls', 'maxFixRounds', 'verifyCommands'];

export interface Settings extends Config { enabled: boolean }

/** Browser-safe checks, shared by the editor and Host. */
export function validateConfig(config: Config): void {
  validatePolicy(config);
  for (const key of ['plannerProvider', 'reviewerProvider', 'workerProvider'] as const)
    if (typeof config[key] !== 'string' || !config[key].trim()) throw new Error(`Missing ${key}`);
  if (!config.workerModel || typeof config.workerModel.provider !== 'string' || !config.workerModel.provider.trim()
    || typeof config.workerModel.model !== 'string' || !config.workerModel.model.trim())
    throw new Error('workerModel must explicitly select a provider and model');
  if (Object.keys(config.workerModel).some(k => !['provider', 'model'].includes(k))) throw new Error('Unknown workerModel setting');
  if (!Array.isArray(config.workerToolAllow) || config.workerToolAllow.length === 0
    || config.workerToolAllow.some(t => typeof t !== 'string' || !t.trim()))
    throw new Error('workerToolAllow must explicitly name the worker tools');
  if (config.workerProvider === config.plannerProvider || config.workerProvider === config.reviewerProvider)
    throw new Error('Worker must use a separate local provider');
  for (const key of ['agentTimeoutMs', 'commandTimeoutMs'] as const)
    if (!Number.isSafeInteger(config[key]) || config[key] < 1 || config[key] > 2_147_483_647)
      throw new Error(`${key} must be a positive timer duration`);
}
