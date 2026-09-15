import test from 'node:test';
import assert from 'node:assert/strict';
import { Context } from '@deepseek-ai/cordis';
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as plugin from '../dist/dsh/plugin.js';
import { invokeChild, preflight } from '../dist/dsh/backend.js';
import { parseConfig } from '../dist/dsh/config.js';

const config = () => parseConfig({ verifyCommands: [[process.execPath, '-e', 'process.exit(0)']],
  workerModel: { provider: 'local', model: 'fixture' }, workerToolAllow: ['bash'] });
const parent = { session: { header: { cwd: '/tmp' } } };
const result = { stopReason: 'completed', output: [{ type: 'text', text: 'answer' }] };
const caps = { agentOptions: true, toolFilter: true, depthLimit: true };
test('adapter forwards ownership/model/tool limits and always disposes child', async () => {
  let request, route, disposed = false;
  const ctx = { subagents: { async start(name, req) { route = name; request = req; return { id: 'child', result: Promise.resolve(result), async dispose() { disposed = true; } }; } } };
  assert.equal((await invokeChild(ctx, parent, config(), 'worker', 'work', new AbortController().signal)).output, 'answer');
  assert.equal(route, 'spawn'); assert.equal(request.parent, parent); assert.deepEqual(request.agentOptions, config().workerModel);
  assert.deepEqual(request.toolFilter, { allow: ['bash'] }); assert.equal(request.maxDepth, 1); assert.ok(disposed);
  await invokeChild(ctx, parent, config(), 'reviewer', 'review', new AbortController().signal);
  assert.equal(route, 'codex'); assert.equal(request.agentOptions, undefined); assert.equal(request.toolFilter, undefined);
});
test('capability preflight rejects unsupported worker before any call', () => {
  assert.throws(() => preflight({ subagents: { getProvider() {} } }, config()), /Missing/);
  assert.throws(() => preflight({ subagents: { getProvider: () => ({ capabilities: {} }) } }, config()), /must support/);
});
test('adapter timeout cancels result wait and awaits disposal', async () => {
  let disposed = false, childSignal;
  const ctx = { subagents: { async start(_, req) { childSignal = req.signal; return { result: new Promise(() => {}), async dispose() { disposed = true; } }; } } };
  await assert.rejects(invokeChild(ctx, parent, { ...config(), agentTimeoutMs: 10 }, 'planner', 'work', new AbortController().signal), /timed out/);
  assert.ok(childSignal.aborted); assert.ok(disposed);
});
test('cancellation during startup cleans provider before any next stage', async () => {
  const controller = new AbortController(); let rolledBack = false;
  const ctx = { subagents: { async start(_, req) {
    await new Promise(resolve => req.signal.addEventListener('abort', resolve, { once: true }));
    rolledBack = true; throw new Error('startup cancelled');
  } } };
  const pending = invokeChild(ctx, parent, config(), 'worker', 'work', controller.signal);
  controller.abort(); await assert.rejects(pending, /cancelled/); assert.ok(rolledBack);
});

test('real Cordis plugin lifecycle: slash command runs full workflow against fake providers and a real Git repo', async t => {
  const root = await mkdtemp(join(tmpdir(), 'smart-dev-plugin-')); t.after(() => rm(root, { recursive: true, force: true }));
  const cwd = join(root, 'repo'); await mkdir(cwd);
  const git = (...args) => execFileSync('git', args, { cwd, encoding: 'utf8' });
  git('init', '-q'); git('config', 'user.name', 'Test'); git('config', 'user.email', 'test@example.invalid');
  await writeFile(join(cwd, 'initial'), 'initial'); git('add', 'initial'); git('commit', '-qm', 'initial');
  const ctx = new Context(), commands = new Map(), calls = []; let disposals = 0, maintained = false, block = false, begun;
  const started = new Promise(resolve => { begun = resolve; });
  ctx.provide('commands', { register(def) { commands.set(def.name, def); return () => commands.delete(def.name); } });
  ctx.provide('subagents', {
    getProvider: () => ({ capabilities: caps }),
    async start(provider, request) {
      calls.push(provider);
      if (block) {
        begun();
        return { id: 'blocked', result: new Promise(resolve => {
          const abort = () => resolve({ stopReason: 'aborted', output: [] });
          if (request.signal.aborted) abort(); else request.signal.addEventListener('abort', abort, { once: true });
        }), async dispose() { disposals++; } };
      }
      let output;
      if (request.label === 'smart-dev planner') output = { summary: 'Create a file', risk: 'low', tasks: [{ id: 'T1', description: 'Write output', acceptance: ['output exists'] }] };
      else if (request.label === 'smart-dev reviewer') output = { decision: 'PASS', summary: 'File exists', issues: [] };
      else { await writeFile(join(cwd, 'output'), 'done'); output = 'Wrote output'; }
      return { id: `child-${calls.length}`, result: Promise.resolve({ stopReason: 'completed', output: [{ type: 'text', text: typeof output === 'string' ? output : JSON.stringify(output) }] }), async dispose() { disposals++; } };
    },
  });
  const fiber = await ctx.plugin(plugin, { ...config(), stateRoot: join(root, 'state') });
  assert.ok(commands.has('smart-dev'));
  const agent = { session: { header: { cwd } }, async runMaintenance(work) { maintained = true; try { return await work(new AbortController().signal); } finally { maintained = false; } } };
  const outcome = await commands.get('smart-dev').handler({ agent, rawInput: 'Create output', signal: new AbortController().signal });
  assert.equal(outcome.kind, 'success'); assert.match(outcome.text, /DONE/);
  assert.deepEqual(calls, ['codex', 'spawn', 'codex']); assert.equal(disposals, 3); assert.equal(maintained, false);
  const ids = await readdir(join(root, 'state/runs'));
  const runDir = join(root, 'state/runs', ids[0]);
  assert.match(await readFile(join(runDir, 'final.patch'), 'utf8'), /output/);
  assert.equal(JSON.parse(await readFile(join(runDir, 'state.json'), 'utf8')).stage, 'DONE');
  assert.equal(git('diff', '--cached'), '');
  // A second run blocks in a child. Unloading must abort it, dispose it and release its lock.
  git('add', 'output'); git('commit', '-qm', 'accept fixture change'); block = true;
  const pending = commands.get('smart-dev').handler({ agent, rawInput: 'Next task', signal: new AbortController().signal });
  await started; assert.ok(maintained); await fiber.dispose();
  const cancelled = await pending;
  assert.equal(cancelled.kind, 'error'); assert.match(cancelled.text, /CANCELLED/);
  assert.equal(commands.has('smart-dev'), false); assert.equal(disposals, 4); assert.equal(maintained, false);
  assert.deepEqual(await readdir(join(root, 'state/locks')), []);
});
