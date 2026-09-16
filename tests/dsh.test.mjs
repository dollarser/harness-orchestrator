import test from 'node:test';
import assert from 'node:assert/strict';
import { Context } from '@deepseek-ai/cordis';
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MemorySettings } from './helpers/settings.mjs';
import * as plugin from '../dist/dsh/plugin.js';
import { ChildDisposalError, invokeChild, preflight } from '../dist/dsh/backend.js';
import { parseConfig } from '../dist/dsh/config.js';

const config = () => parseConfig({
  workerModel: { provider: 'local', model: 'fixture' }, workerToolAllow: ['bash'] });
const parent = { session: { header: { cwd: '/tmp' } } };
const result = { stopReason: 'completed', output: [{ type: 'text', text: 'answer' }] };
const caps = { agentOptions: true, toolFilter: true, depthLimit: true };
test('adapter forwards ownership/model/tool limits and always disposes child', async () => {
  let request, route, disposed = false;
  const ctx = { subagents: { async start(name, req) { route = name; request = req; return { id: 'child', result: Promise.resolve(result), async dispose() { disposed = true; } }; } } };
  assert.equal((await invokeChild(ctx, parent, config(), 'work', new AbortController().signal)).output, 'answer');
  assert.equal(route, 'spawn'); assert.equal(request.parent, parent); assert.deepEqual(request.agentOptions, config().workerModel);
  assert.deepEqual(request.toolFilter, { allow: ['bash'] }); assert.equal(request.maxDepth, undefined); assert.ok(disposed);
  await invokeChild(ctx, parent, { ...config(), workerToolAllow: [] }, 'work', new AbortController().signal);
  assert.equal(route, 'spawn'); assert.equal(request.toolFilter, undefined);
});
test('capability preflight rejects unsupported worker before any call', () => {
  assert.throws(() => preflight({ subagents: { getProvider() {} } }, config()), /Missing/);
  assert.throws(() => preflight({ subagents: { getProvider: () => ({ capabilities: {} }) } }, config()), /must support/);
  const minimal = { subagents: { getProvider: () => ({ capabilities: { agentOptions: true } }) } };
  preflight(minimal, { ...config(), workerToolAllow: [] });
  assert.throws(() => preflight(minimal, config()), /tool filter/);
});
test('adapter timeout cancels result wait and awaits disposal', async () => {
  let disposed = false, childSignal;
  const ctx = { subagents: { async start(_, req) { childSignal = req.signal; return { result: new Promise(() => {}), async dispose() { disposed = true; } }; } } };
  await assert.rejects(invokeChild(ctx, parent, { ...config(), agentTimeoutMs: 10 }, 'work', new AbortController().signal), /timed out/);
  assert.ok(childSignal.aborted); assert.ok(disposed);
});
test('cancellation during startup cleans provider before any next stage', async () => {
  const controller = new AbortController(); let rolledBack = false;
  const ctx = { subagents: { async start(_, req) {
    await new Promise(resolve => req.signal.addEventListener('abort', resolve, { once: true }));
    rolledBack = true; throw new Error('startup cancelled');
  } } };
  const pending = invokeChild(ctx, parent, config(), 'work', controller.signal);
  controller.abort(); await assert.rejects(pending, /cancelled/); assert.ok(rolledBack);
});

test('real Cordis plugin lifecycle: slash command runs autonomous Agent against a fake provider and a real Git repo', async t => {
  const root = await mkdtemp(join(tmpdir(), 'smart-dev-plugin-')); t.after(() => rm(root, { recursive: true, force: true }));
  const cwd = join(root, 'repo'); await mkdir(cwd);
  const git = (...args) => execFileSync('git', args, { cwd, encoding: 'utf8' });
  git('init', '-q'); git('config', 'user.name', 'Test'); git('config', 'user.email', 'test@example.invalid');
  await writeFile(join(cwd, 'initial'), 'initial'); git('add', 'initial'); git('commit', '-qm', 'initial');
  const ctx = new Context(), commands = new Map(), calls = [], models = []; let disposals = 0, maintained = false, block = false, begun;
  const started = new Promise(resolve => { begun = resolve; });
  const settingsFiber = await ctx.plugin(MemorySettings);
  t.after(() => settingsFiber.dispose());
  ctx.provide('commands', { register(def) { commands.set(def.name, def); return () => commands.delete(def.name); } });
  ctx.provide('subagents', {
    getProvider: () => ({ capabilities: caps }),
    async start(provider, request) {
      calls.push(provider); models.push(request.agentOptions.model);
      if (block) {
        begun();
        return { id: 'blocked', result: new Promise(resolve => {
          const abort = () => resolve({ stopReason: 'aborted', output: [] });
          if (request.signal.aborted) abort(); else request.signal.addEventListener('abort', abort, { once: true });
        }), async dispose() { disposals++; } };
      }
      await ctx.settings.update('smart-dev', { workerModel: { provider: 'local', model: 'next-model' } });
      await writeFile(join(cwd, 'output'), 'done');
      const output = 'Wrote output; Agent chose its own checks.';
      return { id: `child-${calls.length}`, result: Promise.resolve({ stopReason: 'completed', output: [{ type: 'text', text: typeof output === 'string' ? output : JSON.stringify(output) }] }), async dispose() { disposals++; } };
    },
  });
  const fiber = await ctx.plugin(plugin, { ...config(), stateRoot: join(root, 'state') });
  assert.ok(commands.has('smart-dev'));
  const agent = { session: { header: { cwd } }, async runMaintenance(work) { maintained = true; try { return await work(new AbortController().signal); } finally { maintained = false; } } };
  const outcome = await commands.get('smart-dev').handler({ agent, rawInput: 'Create output', signal: new AbortController().signal });
  assert.equal(outcome.kind, 'success'); assert.match(outcome.text, /FINISHED/);
  assert.deepEqual(calls, ['spawn']); assert.equal(disposals, 1); assert.equal(maintained, false);
  const ids = await readdir(join(root, 'state/runs'));
  const runDir = join(root, 'state/runs', ids[0]);
  assert.match(await readFile(join(runDir, 'last.patch'), 'utf8'), /output/);
  assert.equal(JSON.parse(await readFile(join(runDir, 'state.json'), 'utf8')).stage, 'FINISHED');
  assert.equal(git('diff', '--cached'), '');
  // A second run blocks in a child. Unloading must abort it, dispose it and release its lock.
  block = true; // Existing uncommitted edits no longer prevent the next run.
  const pending = commands.get('smart-dev').handler({ agent, rawInput: 'Next task', signal: new AbortController().signal });
  await started; assert.equal(calls.at(-1), 'spawn'); assert.deepEqual(models, ['fixture', 'next-model']); assert.ok(maintained); await fiber.dispose();
  const cancelled = await pending;
  assert.equal(cancelled.kind, 'error'); assert.match(cancelled.text, /CANCELLED/);
  assert.equal(commands.has('smart-dev'), false); assert.equal(disposals, 2); assert.equal(maintained, false);
  assert.deepEqual(await readdir(join(root, 'state/locks')), []);
});

test('child cleanup failure is surfaced so the caller retains the workspace lock', async () => {
  const ctx = { subagents: { async start() {
    return { id: 'child', result: Promise.resolve(result), async dispose() { throw new Error('still running'); } };
  } } };
  await assert.rejects(invokeChild(ctx, parent, config(), 'work', new AbortController().signal), ChildDisposalError);
});

test('native Codex and Claude backends receive no DSH-specific model or tool options', async () => {
  for (const workerProvider of ['codex', 'claude-code']) {
    const native = parseConfig({ workerProvider });
    let request, selected;
    const ctx = { subagents: {
      getProvider: () => ({ capabilities: {} }),
      async start(provider, req) { selected = provider; request = req; return { id: 'native', result: Promise.resolve(result), async dispose() {} }; },
    } };
    preflight(ctx, native);
    await invokeChild(ctx, parent, { ...native, workerToolAllow: ['bash'] }, 'plan or implement', new AbortController().signal);
    assert.equal(selected, workerProvider);
    assert.equal(request.agentOptions, undefined); assert.equal(request.toolFilter, undefined); assert.equal(request.maxDepth, undefined);
  }
});
test('slash command executes in a plain directory and records unavailable Git evidence', async t => {
  const root = await mkdtemp(join(tmpdir(), 'smart-dev-plain-plugin-')); t.after(() => rm(root, { recursive: true, force: true }));
  const cwd = join(root, 'workspace'); await mkdir(cwd);
  const ctx = new Context(); const settingsFiber = await ctx.plugin(MemorySettings); t.after(() => settingsFiber.dispose());
  let command;
  ctx.provide('commands', { register(def) { command = def; return () => {}; } });
  ctx.provide('subagents', { getProvider: () => ({ capabilities: {} }), async start(provider, req) {
    assert.equal(provider, 'codex'); assert.equal(req.parent.session.header.cwd, cwd);
    await writeFile(join(cwd, 'new.txt'), 'done');
    return { id: 'native', result: Promise.resolve(result), async dispose() {} };
  } });
  const fiber = await ctx.plugin(plugin, { workerProvider: 'codex', stateRoot: join(root, 'state') }); t.after(() => fiber.dispose());
  const agent = { session: { header: { cwd } }, runMaintenance: work => work(signal()) };
  function signal() { return new AbortController().signal; }
  const response = await command.handler({ agent, rawInput: 'Create a project', signal: signal() });
  assert.equal(response.kind, 'success');
  const [id] = await readdir(join(root, 'state/runs'));
  const before = JSON.parse(await readFile(join(root, 'state/runs', id, 'before.json'), 'utf8'));
  const last = JSON.parse(await readFile(join(root, 'state/runs', id, 'last.json'), 'utf8'));
  assert.equal(before.kind, 'unavailable'); assert.equal(last.kind, 'unavailable');
  assert.equal(await readFile(join(cwd, 'new.txt'), 'utf8'), 'done');
});
