import test from 'node:test';
import assert from 'node:assert/strict';
import { Context } from '@deepseek-ai/cordis';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import * as React from 'react';
import { MemorySettings } from './helpers/settings.mjs';
import { registerSettings, configForRun } from '../dist/dsh/settings.js';
import { fromDraft, toDraft } from '../dist/client/editor.js';

async function fixture(t, raw) {
  const ctx = new Context(); const settingsFiber = await ctx.plugin(MemorySettings);
  let scope;
  const fiber = await ctx.plugin({ inject: ['settings'], apply(owner) { scope = registerSettings(owner, raw); } });
  t.after(async () => { await fiber.dispose(); await settingsFiber.dispose(); });
  return { ctx, scope, fiber };
}
const configured = { workerModel: { provider: 'local', model: 'model-a' }, workerToolAllow: ['bash'], verifyCommands: [['npm', 'test']] };
test('first install exposes disabled settings; enabled saves validate before persistence', async t => {
  const { ctx, scope, fiber } = await fixture(t, {});
  assert.equal(scope.get().enabled, false);
  assert.throws(() => configForRun(scope.get()), /Settings → Smart Dev/);
  await assert.rejects(scope.update({ bogus: true }), /Unknown/);
  await assert.rejects(scope.update({ workerModel: { bogus: true } }), /Unknown/);
  await assert.rejects(scope.update({ enabled: true }), /verifyCommands|workerModel/);
  assert.equal(ctx.settings.writes, 0);
  await scope.update({ ...configured, enabled: true });
  assert.equal(configForRun(scope.get()).workerModel.model, 'model-a');
  assert.equal(ctx.settings.writes, 1);
  await fiber.dispose(); assert.deepEqual(ctx.settings.describe(), []);
});
test('native revisions prevent stale saves; resets inherit composition; runs own detached snapshots', async t => {
  const { ctx, scope } = await fixture(t, configured);
  const old = configForRun(scope.get()), rev = ctx.settings.describe()[0].revision;
  await ctx.settings.mutate('smart-dev', [{ op: 'set', path: ['workerModel', 'model'], value: 'model-b' }], rev);
  assert.equal(old.workerModel.model, 'model-a'); assert.equal(configForRun(scope.get()).workerModel.model, 'model-b');
  await assert.rejects(ctx.settings.update('smart-dev', { maxStrongCalls: 3 }, rev), /revision|changed|conflict/i);
  assert.equal(scope.get().maxStrongCalls, 2);
  await scope.replace({}); assert.equal(scope.get().workerModel.model, 'model-a');
});
test('Host rejects invalid limits, unknown enabled config and lock directory changes', async t => {
  const { ctx, scope } = await fixture(t, configured);
  for (const patch of [{ maxStrongCalls: 1 }, { maxFixRounds: 0.5 }, { verifyCommands: [] }, { agentTimeoutMs: 0 },
    { workerProvider: 'codex' }, { workerToolAllow: [] }, { workerModel: { model: '' } }, { bogus: true }, { stateRoot: '/tmp/other-locks' }]) {
    await assert.rejects(scope.update(patch), undefined, JSON.stringify(patch));
  }
  assert.equal(ctx.settings.writes, 0);
});
test('editor preserves argv boundaries and rejects invalid JSON, empty model and fractional limits', async t => {
  const { scope } = await fixture(t, configured);
  const draft = toDraft(scope.get());
  draft.commands = JSON.stringify([['node', '-e', 'console.log("hello world")']]);
  assert.equal(fromDraft(draft, scope.get().stateRoot).verifyCommands[0][2], 'console.log("hello world")');
  assert.throws(() => fromDraft({ ...draft, commands: 'npm test' }, '/tmp/state'), /JSON/);
  assert.throws(() => fromDraft({ ...draft, model: '' }, '/tmp/state'), /workerModel/);
  assert.throws(() => fromDraft({ ...draft, maxFixRounds: '0.5' }, '/tmp/state'), /整数/);
});
test('browser artifact registers a lazy DSH factory and contributes the native section', async () => {
  const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  let entry, registered, bound;
  runInNewContext(await readFile(new URL('../dist/client.js', import.meta.url), 'utf8'), { window: { __ModuleLoader__: { load(value) { entry = value; } } } });
  assert.equal(entry.id, pkg.name);
  assert.deepEqual(pkg.dsh.client.inject, ['@deepseek-ai/dsh-client-ui-settings']);
  const client = entry.factory(name => { assert.equal(name, 'react'); return React; });
  client.apply({ settingsScope: { bind(spec) { bound = spec; return {}; } }, slots: {
    inject(name, work) { assert.equal(name, 'settings.section'); work(); }, register(options, component) { registered = options; assert.equal(typeof component, 'function'); },
  } });
  assert.equal(bound.namespace, 'smart-dev'); assert.equal(registered.id, 'smart-dev');
});
