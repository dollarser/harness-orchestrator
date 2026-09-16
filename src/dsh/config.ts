import { homedir } from 'node:os';
import { isAbsolute, join, resolve } from 'node:path';
import { configKeys, validateConfig } from '../shared/config.js';
import type { Config } from '../shared/config.js';
export type { Config } from '../shared/config.js';

export function parseConfig(raw: unknown): Config {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('smart-dev requires plugin configuration');
  const value = raw as Record<string, unknown>;
  for (const key of Object.keys(value)) if (!configKeys.includes(key)) throw new Error(`Unknown smart-dev setting: ${key}`);
  const config = {
    plannerProvider: 'codex', reviewerProvider: 'codex', workerProvider: 'spawn',
    maxStrongCalls: 2, maxFixRounds: 1,
    stateRoot: join(process.env.XDG_STATE_HOME || join(homedir(), '.local', 'state'), 'harness-orchestrator'),
    agentTimeoutMs: 1_800_000, commandTimeoutMs: 600_000,
    ...value,
  } as Config;
  validateConfig(config);
  if (typeof config.stateRoot !== 'string' || !isAbsolute(config.stateRoot)) throw new Error('stateRoot must be absolute');
  config.stateRoot = resolve(config.stateRoot);
  return config;
}
