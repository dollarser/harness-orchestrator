import { homedir } from 'node:os';
import { isAbsolute, join, resolve } from 'node:path';
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

export function parseConfig(raw: unknown): Config {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('smart-dev requires plugin configuration');
  const value = raw as Record<string, unknown>;
  const known = ['plannerProvider', 'reviewerProvider', 'workerProvider', 'workerModel', 'workerToolAllow',
    'stateRoot', 'agentTimeoutMs', 'commandTimeoutMs', 'maxStrongCalls', 'maxFixRounds', 'verifyCommands'];
  for (const key of Object.keys(value)) if (!known.includes(key)) throw new Error(`Unknown smart-dev setting: ${key}`);
  const config = {
    plannerProvider: 'codex', reviewerProvider: 'codex', workerProvider: 'spawn',
    maxStrongCalls: 2, maxFixRounds: 1,
    stateRoot: join(process.env.XDG_STATE_HOME || join(homedir(), '.local', 'state'), 'harness-orchestrator'),
    agentTimeoutMs: 1_800_000, commandTimeoutMs: 600_000,
    ...value,
  } as Config;
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
  if (typeof config.stateRoot !== 'string' || !isAbsolute(config.stateRoot)) throw new Error('stateRoot must be absolute');
  config.stateRoot = resolve(config.stateRoot);
  return config;
}
