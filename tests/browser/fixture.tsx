import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { SettingsPage } from '../../src/client/SettingsPage.js';
import type { SettingsScope, SettingsScopeSnapshot } from '@deepseek-ai/dsh-client-ui-settings/client';
import type { Settings } from '../../src/shared/config.js';

const initial: Settings = { enabled: true, plannerProvider: 'codex', reviewerProvider: 'codex', workerProvider: 'spawn',
  workerModel: { provider: 'local', model: 'qwen3-coder' }, workerToolAllow: ['bash'], verifyCommands: [['npm', 'test']],
  maxStrongCalls: 2, maxFixRounds: 1, agentTimeoutMs: 1_800_000, commandTimeoutMs: 600_000, stateRoot: '/example/state/harness-orchestrator' };
const params = new URLSearchParams(location.search);
let snapshot: SettingsScopeSnapshot<Settings> = { status: 'ready', value: structuredClone(initial), base: initial,
  user: {}, revision: 1, writable: true, mode: 'host', ...JSON.parse(localStorage.getItem('fixture') ?? '{}') };
if (params.has('readonly')) snapshot.writable = false;
if (params.has('unavailable')) snapshot = { ...snapshot, status: 'unavailable', value: undefined, mode: 'memory' };
if (params.has('loading')) snapshot = { ...snapshot, status: 'loading', value: undefined };
const listeners = new Set<() => void>();
function publish(next: typeof snapshot) { snapshot = next; listeners.forEach(listener => listener()); }
let writes = 0;
const scope: SettingsScope<Settings> = {
  getSnapshot: () => snapshot, subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
  async mutate(ops, expected) {
    writes++;
    if (params.has('failure')) throw new Error('Fixture: connection failed');
    if (params.has('refused') || expected !== snapshot.revision) return;
    const user = { ...snapshot.user as Record<string, unknown> };
    for (const op of ops) { if (op.op === 'set') user[op.path[0]!] = op.value; else delete user[op.path[0]!]; }
    publish({ ...snapshot, value: { ...initial, ...user }, user, revision: snapshot.revision! + 1 });
    localStorage.setItem('fixture', JSON.stringify(snapshot));
  },
  set: async () => { throw new Error('Use atomic mutation'); }, unset: async () => { throw new Error('Use atomic mutation'); },
};
Object.assign(window, { fixture: { remoteChange() { publish({ ...snapshot, value: { ...snapshot.value!, maxStrongCalls: 5 }, revision: snapshot.revision! + 1 }); }, writes: () => writes } });
createRoot(document.getElementById('root')!).render(<SettingsPage scope={scope} />);
