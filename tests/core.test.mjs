import test from 'node:test';
import assert from 'node:assert/strict';
import { orchestrate } from '../dist/core/orchestrator.js';
import { parsePlan, parseReview } from '../dist/core/artifacts.js';
import { parseConfig } from '../dist/dsh/config.js';

export const plan = { summary: 'A change', risk: 'medium', tasks: [{ id: 'T1', description: 'Implement it', acceptance: ['Check passes'] }] };
export const pass = { decision: 'PASS', summary: 'Requirements met', issues: [] };
const fix = { decision: 'NEEDS_FIX', summary: 'Incorrect behavior', issues: [{ severity: 'high', problem: 'Wrong output' }] };
const initial = { version: 1, runId: 'test', workspace: '/test', stage: 'CREATED', strongCalls: 0, fixRounds: 0 };
function fixture(overrides = {}, policyOverrides = {}) {
  const saved = new Map(), calls = [];
  const policy = { maxStrongCalls: 2, maxFixRounds: 1, verifyCommands: [['test-runner']], ...policyOverrides };
  const ports = {
    async invoke(role, prompt) { calls.push({ role, prompt }); return { stopReason: 'completed', output: role === 'planner' ? JSON.stringify(plan) : role === 'reviewer' ? JSON.stringify(pass) : 'Changed files' }; },
    async verify(argv) { return { argv, code: 0, stdout: 'ok', stderr: '', durationMs: 1 }; },
    async evidence() { return { patch: 'a patch', fingerprint: 'stable' }; },
    async save(name, value) { saved.set(name, structuredClone(value)); },
    ...overrides,
  };
  return { ports, saved, calls, policy, run: (signal = new AbortController().signal) => orchestrate('Do work', initial, policy, ports, signal) };
}

test('successful fixed workflow charges planner and reviewer and records evidence', async () => {
  const f = fixture();
  const state = await f.run();
  assert.equal(state.stage, 'DONE'); assert.equal(state.strongCalls, 2);
  assert.deepEqual(f.calls.map(c => c.role), ['planner', 'worker', 'reviewer']);
  assert.ok(f.saved.has('final.patch')); assert.ok(f.saved.has('verification-0.json'));
});
test('reject empty verification before any agent call', async () => {
  const f = fixture({}, { verifyCommands: [] });
  await assert.rejects(f.run(), /verifyCommands/); assert.equal(f.calls.length, 0);
});
test('two-call budget fixes then verifies but returns NEEDS_REVIEW', async () => {
  const f = fixture(); let reviews = 0, checks = 0;
  f.ports.invoke = async role => { f.calls.push(role); if (role === 'reviewer') reviews++; return { stopReason: 'completed', output: JSON.stringify(role === 'planner' ? plan : role === 'reviewer' ? fix : {}) }; };
  f.ports.verify = async argv => { checks++; return { argv, code: 0 }; };
  const state = await f.run();
  assert.equal(state.stage, 'NEEDS_REVIEW'); assert.equal(state.strongCalls, 2);
  assert.equal(state.fixRounds, 1); assert.equal(reviews, 1); assert.equal(checks, 2);
  assert.ok(!f.saved.has('final.patch'));
});
test('three-call budget reviews the repaired version before DONE', async () => {
  const f = fixture({}, { maxStrongCalls: 3 }); let reviews = 0;
  f.ports.invoke = async role => ({ stopReason: 'completed', output: JSON.stringify(role === 'planner' ? plan : role === 'reviewer' ? (++reviews === 1 ? fix : pass) : {}) });
  const state = await f.run(); assert.equal(state.stage, 'DONE'); assert.equal(state.strongCalls, 3);
});
test('failed verification overrides reviewer PASS and is included in fixer input', async () => {
  const f = fixture({ verify: async argv => ({ argv, code: 1, stdout: '', stderr: 'assertion failed' }) });
  assert.equal((await f.run()).stage, 'NEEDS_REVIEW');
  assert.match(f.calls.find(c => c.role === 'fixer').prompt, /assertion failed/);
});
test('fix budget exhaustion fails without another worker', async () => {
  const f = fixture({ verify: async argv => ({ argv, code: 1 }) }, { maxFixRounds: 0 });
  assert.equal((await f.run()).stage, 'FAILED'); assert.equal(f.calls.length, 3);
});
test('strong startup failure is charged and persisted before dispatch', async () => {
  const f = fixture();
  f.ports.invoke = async () => { assert.equal(f.saved.get('state.json').strongCalls, 1); throw new Error('startup failed'); };
  const state = await f.run(); assert.equal(state.strongCalls, 1); assert.equal(state.stage, 'FAILED');
  assert.match(f.saved.get('0-planner.error.txt'), /startup failed/);
});
test('partial/error child output never advances to implementation', async () => {
  const f = fixture({ invoke: async () => ({ stopReason: 'max-tokens', output: JSON.stringify(plan) }) });
  const state = await f.run(); assert.equal(state.stage, 'FAILED'); assert.match(state.message, /max-tokens/);
  assert.ok(f.saved.has('0-planner.result.json'));
});
test('empty or malformed planner output cannot start a worker', async () => {
  for (const output of ['', '{"summary":"incomplete"}']) {
    let calls = 0;
    const f = fixture({ invoke: async () => { calls++; return { stopReason: 'completed', output }; } });
    assert.equal((await f.run()).stage, 'FAILED'); assert.equal(calls, 1);
  }
});
test('planner mutation is detected and blocks worker', async () => {
  let n = 0; const f = fixture({ evidence: async () => ({ patch: '', fingerprint: String(n++) }) });
  const state = await f.run(); assert.equal(state.stage, 'FAILED'); assert.match(state.message, /planner changed/);
  assert.equal(f.calls.length, 1);
});
test('reviewer mutation cannot produce DONE', async () => {
  let n = 0; const f = fixture({ evidence: async () => ({ patch: '', fingerprint: ++n < 5 ? 'before' : 'after' }) });
  const state = await f.run(); assert.equal(state.stage, 'FAILED'); assert.match(state.message, /reviewer changed/);
});
test('oversized patch is retained but never silently truncated into review', async () => {
  const f = fixture({ evidence: async () => ({ patch: 'x'.repeat(120_001), fingerprint: 'same' }) });
  assert.equal((await f.run()).stage, 'FAILED'); assert.equal(f.calls.length, 2);
  assert.equal(f.saved.get('changes-0.patch').length, 120_001);
});
test('cancellation prevents subsequent stages and records CANCELLED', async () => {
  const controller = new AbortController(), f = fixture();
  const original = f.ports.invoke;
  f.ports.invoke = async (...args) => { const result = await original(...args); controller.abort(new Error('stop')); return result; };
  assert.equal((await f.run(controller.signal)).stage, 'CANCELLED'); assert.equal(f.calls.length, 1);
});
test('observer failure does not change policy decisions', async () => {
  assert.equal((await fixture({ progress() { throw new Error('UI failure'); } }).run()).stage, 'DONE');
});
test('strict artifacts reject misleading or incomplete answers', () => {
  assert.deepEqual(parsePlan('```json\n' + JSON.stringify(plan) + '\n```'), plan);
  for (const value of ['{}', 'null', '[]', 'text ' + JSON.stringify(plan)]) assert.throws(() => parsePlan(value));
  assert.throws(() => parseReview(JSON.stringify({ ...pass, issues: fix.issues })), /unresolved/);
  assert.throws(() => parsePlan(JSON.stringify({ ...plan, tasks: [plan.tasks[0], plan.tasks[0]] })), /Duplicate/);
});
test('deployment config requires explicit worker model/tools and rejects typos', () => {
  const config = { verifyCommands: [['node', '--test']], workerModel: { provider: 'local', model: 'test' }, workerToolAllow: ['bash'] };
  assert.equal(parseConfig(config).maxStrongCalls, 2);
  assert.throws(() => parseConfig({ ...config, typo: 2 }), /Unknown/);
  assert.throws(() => parseConfig({ ...config, workerModel: {} }), /workerModel/);
  assert.throws(() => parseConfig({ ...config, maxFixRounds: -1 }), /maxFixRounds/);
  assert.throws(() => parseConfig({ ...config, workerProvider: 'codex' }), /separate local/);
});
