import test from 'node:test';
import assert from 'node:assert/strict';
import { orchestrate } from '../dist/core/orchestrator.js';
import { parseConfig } from '../dist/dsh/config.js';

const initial = { version: 2, runId: 'test', workspace: '/test', stage: 'CREATED' };
function fixture(overrides = {}) {
  const saved = new Map(), calls = [];
  const ports = {
    async invoke(prompt) { calls.push(prompt); return { stopReason: 'completed', output: 'Updated documentation; no build needed for this task.' }; },
    async save(name, value) { saved.set(name, structuredClone(value)); },
    ...overrides,
  };
  return { saved, calls, ports, run: (signal = new AbortController().signal) => orchestrate('Do work', initial, ports, signal) };
}
test('one Agent chooses its approach without command, plan JSON or review gates', async () => {
  const f = fixture(); const state = await f.run();
  assert.equal(state.stage, 'FINISHED'); assert.equal(f.calls.length, 1);
  assert.equal(f.saved.get('report.md'), state.message);
  assert.deepEqual([...f.saved.keys()].filter(k => /plan|review|verification|policy/.test(k)), []);
  assert.deepEqual([...f.saved.entries()].filter(([k]) => k.startsWith('event-')).map(([, v]) => v.stage), ['RUNNING', 'FINISHED']);
});
test('Agent can report unfinished work without plugin inventing an acceptance verdict', async () => {
  const output = 'Blocked on a missing credential. No changes or checks performed.';
  const f = fixture({ invoke: async () => ({ stopReason: 'completed', output }) });
  const state = await f.run();
  assert.equal(state.stage, 'FINISHED'); assert.equal(state.message, output);
  assert.equal(f.saved.get('report.md'), output);
});
test('startup error is recorded without automatic retries or another Agent', async () => {
  const f = fixture({ invoke: async () => { throw new Error('startup failed'); } });
  const state = await f.run(); assert.equal(state.stage, 'FAILED'); assert.match(f.saved.get('error.txt'), /startup failed/);
});
test('partial and empty responses cannot look like a finished run', async () => {
  for (const result of [{ stopReason: 'max-tokens', output: 'partial' }, { stopReason: 'completed', output: '' }]) {
    const f = fixture({ invoke: async () => result });
    assert.equal((await f.run()).stage, 'FAILED'); assert.deepEqual(f.saved.get('agent.result.json'), result);
    assert.equal(f.saved.has('report.md'), false);
  }
});
test('cancellation before dispatch never starts an Agent', async () => {
  const c = new AbortController(); c.abort(new Error('stop'));
  const f = fixture(); assert.equal((await f.run(c.signal)).stage, 'CANCELLED'); assert.equal(f.calls.length, 0);
});
test('cancellation after child returns preserves output without claiming completion', async () => {
  const c = new AbortController();
  const f = fixture({ invoke: async () => { c.abort(); return { stopReason: 'completed', output: 'partial work' }; } });
  assert.equal((await f.run(c.signal)).stage, 'CANCELLED'); assert.ok(f.saved.has('agent.result.json'));
});
test('observer errors cannot change Agent outcome; task must be nonempty', async () => {
  const f = fixture({ progress() { throw new Error('UI failure'); } });
  assert.equal((await f.run()).stage, 'FINISHED');
  await assert.rejects(orchestrate('  ', initial, f.ports, new AbortController().signal), /empty/);
});
test('only current settings are accepted and tools may inherit from DSH', () => {
  const base = { workerModel: { provider: 'local', model: 'test' } };
  assert.deepEqual(parseConfig(base).workerToolAllow, []);
  for (const key of ['plannerProvider', 'reviewerProvider', 'maxStrongCalls', 'maxFixRounds', 'verifyCommands', 'commandTimeoutMs', 'typo'])
    assert.throws(() => parseConfig({ ...base, [key]: 1 }), /Unknown/);
  assert.throws(() => parseConfig({ workerModel: {} }), /workerModel/);
  assert.throws(() => parseConfig({ ...base, workerToolAllow: [''] }), /workerToolAllow/);
  assert.throws(() => parseConfig({ ...base, agentTimeoutMs: 0 }), /agentTimeoutMs/);
});
