export type Stage = 'CREATED' | 'RUNNING' | 'FINISHED' | 'FAILED' | 'CANCELLED';

export interface AgentResult {
  stopReason: string;
  output: string;
  runId?: string;
  diagnostic?: string;
}
/** Result of a host process, used for Git snapshots, not task acceptance. */
export interface Verification {
  argv: string[];
  code: number | null;
  stdout: string;
  stderr: string;
  durationMs: number;
  failure?: string;
}
export interface Evidence { patch: string; fingerprint: string }
/** FINISHED describes the child lifecycle; the Agent's report describes task outcomes. */
export interface State {
  version: 2;
  runId: string;
  workspace: string;
  stage: Stage;
  message?: string;
}
export interface Ports {
  invoke(prompt: string, signal: AbortSignal): Promise<AgentResult>;
  save(name: string, value: unknown): Promise<void>;
  progress?(state: Readonly<State>): void;
}
