import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { delegationGuidance } from '../../src/shared/delegation.js';
import { SettingsPage } from '../../src/client/SettingsPage.js';
import type { Api, Status } from '../../src/shared/types.js';
const params = new URLSearchParams(location.search);
const initial: Status = { profile: '/fixture/profile', backends: [
  { id: 'codex', installed: true, bundled: true, registered: false, version: '0.1.5-rc.1' },
  { id: 'claude-code', installed: false, bundled: false, registered: false },
], presets: [
  { id: 'user', name: '自研搜索模式', writable: true, revision: 'v1', guidanceText: delegationGuidance, guidanceRevision: 'g1', enabled: [], managed: false, guidance: false },
  { id: 'standard', name: 'Standard', writable: false, copyable: true, revision: 'v1', guidanceText: delegationGuidance, guidanceRevision: 'g1', enabled: [], managed: false, guidance: false },
], agents: [{ preset: 'user', tools: [] }] };
let state = JSON.parse(localStorage.getItem('smart-dev-fixture') || 'null') as Status | null;
state ??= initial;
const calls: unknown[] = [];
const api: Api = async request => {
  calls.push(request);
  if (params.has('failure')) throw new Error('宿主连接失败');
  if (request.action === 'status') return { status: structuredClone(state!) };
  if (params.has('conflict')) throw new Error('预设已更改，请刷新后重试');
  if (request.action === 'collaborate') {
    const copied = { id: 'smart-dev-standard', name: 'Standard · 协作版', writable: true, revision: 'v1', guidanceText: delegationGuidance, guidanceRevision: 'g1', enabled: ['codex', 'claude-code'] as const, managed: true, guidance: true };
    state!.presets.push({ ...copied, enabled: [...copied.enabled] });
    return { status: structuredClone(state!), selectedPreset: copied.id, message: '协作版已就绪。请重启 DSH，然后新建会话选择 Standard · 协作版；当前会话模式不会自动改变。' };
  }
  const preset = state!.presets.find(p => p.id === request.preset);
  if (request.action === 'disable' && preset) preset.enabled = preset.enabled.filter(id => id !== request.backend);
  if (request.action === 'enable' && preset && request.backend) { preset.enabled.push(request.backend); preset.managed = true; }
  if (request.action === 'guidance-text' && preset) { preset.guidanceText = request.text === null ? delegationGuidance : request.text!; preset.guidanceRevision += 'x'; }
  if (request.action === 'guidance' && preset) preset.guidance = request.enabled!;
  if (request.action === 'restore' && preset) { preset.enabled = []; preset.managed = false; }
  if (request.action === 'install') { const b = state!.backends.find(b => b.id === request.backend)!; b.installed = true; b.bundled = true; }
  localStorage.setItem('smart-dev-fixture', JSON.stringify(state));
  if (request.action === 'auth') return { auth: 'unknown', login: 'codex login', message: '无法确认登录状态' };
  return { status: structuredClone(state!), message: '配置已保存。请重启 DSH。' };
};
Object.assign(window, { fixture: { calls } });
createRoot(document.getElementById('root')!).render(<SettingsPage api={api} />);
