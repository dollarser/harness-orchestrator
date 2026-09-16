import type { Context } from '@deepseek-ai/cordis';
import type { SettingsScope } from '@deepseek-ai/dsh-settings';
import Schema from '@deepseek-ai/schemastery';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { parseConfig } from './config.js';
import { configKeys } from '../shared/config.js';
import type { Settings } from '../shared/config.js';

export function configForRun(settings: Settings) {
  const { enabled, ...config } = structuredClone(settings);
  if (!enabled) throw new Error('smart-dev is disabled. Open Settings → Smart Dev, configure and enable it.');
  return parseConfig(config);
}

/** Settings belong to the plugin fiber; reads are detached at each run boundary. */
export function registerSettings(ctx: Context, raw: unknown): SettingsScope<Settings> {
  if (raw !== undefined && (!raw || typeof raw !== 'object' || Array.isArray(raw)))
    throw new Error('smart-dev configuration must be an object');
  const configured = raw !== undefined && Object.keys(raw as object).length > 0;
  const base = configured ? { ...parseConfig(raw), enabled: true } : undefined;
  const stateRoot = base?.stateRoot ?? join(process.env.XDG_STATE_HOME || join(homedir(), '.local', 'state'), 'harness-orchestrator');
  const timer = (fallback: number) => Schema.number().step(1).min(1).max(2_147_483_647).default(fallback);
  const schema = Schema.object({
    enabled: Schema.boolean().default(false),
    workerProvider: Schema.string().default('spawn'),
    workerModel: Schema.object({ provider: Schema.string().default(''), model: Schema.string().default('') }),
    workerToolAllow: Schema.array(Schema.string()).default([]),
    agentTimeoutMs: timer(1_800_000),
    // Changing this while a workflow holds a lock could permit a competing run.
    stateRoot: Schema.const(stateRoot).default(stateRoot),
  });
  return ctx.settings.register('smart-dev', schema, {
    base, applies: 'live',
    validate(value) {
      const { enabled, ...config } = value;
      for (const key of Object.keys(config)) if (!configKeys.includes(key)) throw new Error(`Unknown smart-dev setting: ${key}`);
      if (Object.keys(config.workerModel).some(key => !['provider', 'model'].includes(key))) throw new Error('Unknown workerModel setting');
      if (typeof enabled !== 'boolean') throw new Error('enabled must be boolean');
      if (enabled) parseConfig(config);
    },
  });
}
