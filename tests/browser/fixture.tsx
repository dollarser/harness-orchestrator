import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { SettingsPage } from '../../src/client/SettingsPage.js';
import type { SettingsScope, SettingsScopeSnapshot } from '@deepseek-ai/dsh-client-ui-settings/client';
import type { Settings } from '../../src/shared/config.js';
import type { ModelCatalog } from '@deepseek-ai/dsh-api-remotes/client';

const initial: Settings = { enabled: true, workerProvider: 'spawn',
  workerModel: { provider: 'local', model: 'qwen3-coder' }, workerToolAllow: [],
  agentTimeoutMs: 1_800_000, stateRoot: '/example/state/harness-orchestrator' };
const params = new URLSearchParams(location.search);
let snapshot: SettingsScopeSnapshot<Settings> = { status: 'ready', value: structuredClone(initial), base: initial,
  user: {}, revision: 1, writable: true, mode: 'host', ...JSON.parse(localStorage.getItem('fixture') ?? '{}') };
if (params.has('readonly')) snapshot.writable = false;
if (params.has('unavailable')) snapshot = { ...snapshot, status: 'unavailable', value: undefined, mode: 'memory' };
if (params.has('loading')) snapshot = { ...snapshot, status: 'loading', value: undefined };
if (params.has('unknown')) {
  const workerModel = { provider: 'removed', model: 'old-model' };
  snapshot.value = { ...initial, workerModel }; snapshot.user = { workerModel };
}
const catalog: ModelCatalog = {
  default: { provider: 'local', model: 'qwen3-coder' }, routableProviders: ['local', 'remote'], failures: [],
  groups: [
    { id: 'local', name: 'Local Models', models: ['qwen3-coder', 'new-model', 'unsaved', 'my-draft'].map(id => ({ id, name: id })) },
    { id: 'remote', name: 'Remote Models', models: [{ id: 'remote-model', name: 'Remote Coder' }] },
  ],
};
let catalogReads = 0;
async function loadCatalog(): Promise<ModelCatalog> {
  catalogReads++;
  if (params.has('catalog-failure') && catalogReads === 1) throw new Error('Fixture: catalog unavailable');
  if (params.has('empty-catalog')) return { ...catalog, groups: [], routableProviders: [] };
  if (params.has('partial-catalog')) return { ...catalog, groups: catalog.groups.slice(0, 1),
    failures: [{ id: 'remote', name: 'Remote Models', message: 'Model directory unavailable' }] };
  return catalog;
}
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
Object.assign(window, { fixture: { remoteChange() { publish({ ...snapshot, value: { ...snapshot.value!, agentTimeoutMs: 5000 }, revision: snapshot.revision! + 1 }); }, writes: () => writes } });
createRoot(document.getElementById('root')!).render(<SettingsPage scope={scope} loadCatalog={loadCatalog} />);
