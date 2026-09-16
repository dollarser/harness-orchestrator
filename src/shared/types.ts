export const backends = [
  { id: 'codex', title: 'Codex', package: '@deepseek-ai/dsh-subagent-codex', tool: 'subagent_codex', version: '0.1.5-rc.1', login: 'codex login' },
  { id: 'claude-code', title: 'Claude Code', package: '@deepseek-ai/dsh-subagent-claude-code', tool: 'subagent_claude_code', version: '0.1.5-rc.1', login: 'claude auth login' },
] as const;
export type BackendId = typeof backends[number]['id'];
export function backend(id: unknown) {
  const value = backends.find(item => item.id === id);
  if (!value) throw new Error('请选择支持的后端');
  return value;
}
export interface Preferences { guidancePresets: string[] }
export interface BackendStatus { id: BackendId; installed: boolean; version?: string; bundled: boolean; registered: boolean }
export interface PresetStatus { id: string; name: string; writable: boolean; copyable?: boolean; revision: string; enabled: BackendId[]; managed: boolean; guidance: boolean; error?: string }
export interface Status {
  profile: string; backends: BackendStatus[]; presets: PresetStatus[];
  agents: { preset: string; tools: string[] }[];
}
export interface Request { action: 'collaborate' | 'status' | 'install' | 'enable' | 'restore' | 'guidance' | 'auth'; backend?: BackendId; preset?: string; revision?: string; enabled?: boolean }
export interface Reply { selectedPreset?: string; status?: Status; message?: string; auth?: 'authenticated' | 'not-authenticated' | 'unknown'; login?: string }
export type Api = (request: Request) => Promise<Reply>;
