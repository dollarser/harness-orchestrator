import type { Plan, Review } from './types.js';

function object(text: string): Record<string, unknown> {
  // Accept a single fenced object, never extract a plausible object from unrelated prose.
  const source = text.trim().replace(/^```(?:json)?\s*\n([\s\S]*?)\n```$/u, '$1');
  if (source.length > 256_000) throw new Error('Structured artifact exceeds 256000 characters');
  const value: unknown = JSON.parse(source);
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Expected a JSON object');
  return value as Record<string, unknown>;
}
const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const text = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;

export function parsePlan(source: string): Plan {
  const p = object(source);
  if (!text(p.summary) || !['low', 'medium', 'high'].includes(String(p.risk))
    || !Array.isArray(p.tasks) || p.tasks.length === 0
    || p.tasks.some(t => !record(t) || !text(t.id) || !text(t.description)
      || !Array.isArray(t.acceptance) || t.acceptance.length === 0 || t.acceptance.some(a => !text(a))))
    throw new Error('Invalid plan: require summary, risk and tasks with acceptance criteria');
  if (new Set(p.tasks.map(t => t.id)).size !== p.tasks.length) throw new Error('Duplicate task id');
  return p as unknown as Plan;
}

export function parseReview(source: string): Review {
  const r = object(source);
  if (!['PASS', 'NEEDS_FIX'].includes(String(r.decision)) || !text(r.summary)
    || !Array.isArray(r.issues)
    || r.issues.some(i => !record(i) || !text(i.problem)
      || !['critical', 'high', 'medium', 'low'].includes(String(i.severity))))
    throw new Error('Invalid review: require decision, summary and typed issues');
  // No implicit severity threshold: PASS must mean there are no unresolved findings.
  if (r.decision === 'PASS' && r.issues.length !== 0) throw new Error('PASS contains unresolved issues');
  return r as unknown as Review;
}
