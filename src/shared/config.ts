import { backendChoice } from './backends.js';

export interface Config {
  workerProvider: string;
  workerModel: { provider: string; model: string };
  workerToolAllow: string[];
  stateRoot: string;
  agentTimeoutMs: number;
}
export const configKeys = ['workerProvider', 'workerModel', 'workerToolAllow', 'stateRoot', 'agentTimeoutMs'];
export interface Settings extends Config { enabled: boolean }

export function validateConfig(config: Config): void {
  const backend = backendChoice(config.workerProvider);
  if (!backend) throw new Error('Select a supported execution backend');
  if (backend.dshModel && (!config.workerModel || typeof config.workerModel.provider !== 'string' || !config.workerModel.provider.trim()
    || typeof config.workerModel.model !== 'string' || !config.workerModel.model.trim()))
    throw new Error('workerModel must explicitly select a provider and model');
  if (Object.keys(config.workerModel ?? {}).some(k => !['provider', 'model'].includes(k))) throw new Error('Unknown workerModel setting');
  if (!Array.isArray(config.workerToolAllow) || config.workerToolAllow.some(t => typeof t !== 'string' || !t.trim()))
    throw new Error('workerToolAllow must be a list of tool names (empty inherits DSH tools)');
  if (!Number.isSafeInteger(config.agentTimeoutMs) || config.agentTimeoutMs < 1 || config.agentTimeoutMs > 2_147_483_647)
    throw new Error('agentTimeoutMs must be a positive timer duration');
}
