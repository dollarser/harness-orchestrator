export type Role = 'planner' | 'worker' | 'reviewer' | 'fixer';
export type Stage = 'CREATED' | 'PLAN' | 'EXECUTE' | 'VERIFY' | 'REVIEW' | 'FIX'
  | 'DONE' | 'NEEDS_REVIEW' | 'FAILED' | 'CANCELLED';

export interface Plan {
  summary: string;
  risk: 'low' | 'medium' | 'high';
  tasks: { id: string; description: string; acceptance: string[] }[];
}
export interface Review {
  decision: 'PASS' | 'NEEDS_FIX';
  summary: string;
  issues: { severity: 'critical' | 'high' | 'medium' | 'low'; problem: string }[];
}
export interface Policy {
  maxStrongCalls: number;
  maxFixRounds: number;
  verifyCommands: string[][];
}
export interface AgentResult {
  stopReason: string;
  output: string;
  runId?: string;
  diagnostic?: string;
}
export interface Verification {
  argv: string[];
  code: number | null;
  stdout: string;
  stderr: string;
  durationMs: number;
  failure?: string;
}
export interface Evidence {
  patch: string;
  fingerprint: string;
}
export interface State {
  version: 1;
  runId: string;
  workspace: string;
  stage: Stage;
  strongCalls: number;
  fixRounds: number;
  message?: string;
}
/** All runtime effects cross these ports; the policy engine has no DSH imports. */
export interface Ports {
  invoke(role: Role, prompt: string, signal: AbortSignal): Promise<AgentResult>;
  verify(argv: string[], signal: AbortSignal): Promise<Verification>;
  evidence(signal: AbortSignal): Promise<Evidence>;
  save(name: string, value: unknown): Promise<void>;
  progress?(state: Readonly<State>): void;
}

export function validatePolicy(policy: Policy): void {
  if (!Number.isSafeInteger(policy.maxStrongCalls) || policy.maxStrongCalls < 2 || policy.maxStrongCalls > 100)
    throw new Error('maxStrongCalls must be an integer from 2 to 100');
  if (!Number.isSafeInteger(policy.maxFixRounds) || policy.maxFixRounds < 0 || policy.maxFixRounds > 10)
    throw new Error('maxFixRounds must be an integer from 0 to 10');
  if (!Array.isArray(policy.verifyCommands) || policy.verifyCommands.length === 0
    || policy.verifyCommands.some(cmd => !Array.isArray(cmd) || cmd.length === 0
      || cmd.some(arg => typeof arg !== 'string' || arg.length === 0 || arg.includes('\0'))))
    throw new Error('verifyCommands must contain at least one non-empty argv array');
}
