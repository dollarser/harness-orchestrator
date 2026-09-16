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
const configured = { workerModel: { provider: 'local', model: 'model-a' }, workerToolAllow: ['bash'] };
test('first install exposes disabled settings; enabled saves validate before persistence', async t => {
  const { ctx, scope, fiber } = await fixture(t, {});
  assert.equal(scope.get().enabled, false);
  assert.throws(() => configForRun(scope.get()), /Settings → Smart Dev/);
  await assert.rejects(scope.update({ bogus: true }), /Unknown/);
  await assert.rejects(scope.update({ workerModel: { bogus: true } }), /Unknown/);
  await assert.rejects(scope.update({ enabled: true }), /workerModel/);
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
  await assert.rejects(ctx.settings.update('smart-dev', { agentTimeoutMs: 3000 }, rev), /revision|changed|conflict/i);
  assert.equal(scope.get().agentTimeoutMs, 1_800_000);
  await scope.replace({}); assert.equal(scope.get().workerModel.model, 'model-a');
});
test('Host rejects invalid limits, unknown enabled config and lock directory changes', async t => {
  const { ctx, scope } = await fixture(t, configured);
  for (const patch of [{ agentTimeoutMs: 0 }, { agentTimeoutMs: 0.5 },
    { workerToolAllow: [''] }, { workerModel: { model: '' } }, { bogus: true }, { stateRoot: '/tmp/other-locks' }]) {
    await assert.rejects(scope.update(patch), undefined, JSON.stringify(patch));
  }
  assert.equal(ctx.settings.writes, 0);
});
test('editor allows inherited tools and rejects missing model or invalid timeout', async t => {
  const { scope } = await fixture(t, configured);
  const draft = { ...toDraft(scope.get()), tools: '' };
  assert.deepEqual(fromDraft(draft, scope.get().stateRoot).workerToolAllow, []);
  assert.throws(() => fromDraft({ ...draft, model: '' }, '/tmp/state'), /workerModel/);
  assert.throws(() => fromDraft({ ...draft, agentTimeoutMs: '0.5' }, '/tmp/state'), /整数/);
});
test('removed workflow fields cannot be saved even while disabled', async t => {
  const { ctx, scope } = await fixture(t, {});
  for (const key of ['plannerProvider', 'reviewerProvider', 'verifyCommands', 'maxStrongCalls', 'maxFixRounds', 'commandTimeoutMs'])
    await assert.rejects(scope.update({ [key]: 1 }), /Unknown/);
  assert.equal(ctx.settings.writes, 0);
});
test('browser artifact registers a lazy DSH factory and contributes the native section', async () => {
  const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  let entry, registered, bound;
  runInNewContext(await readFile(new URL('../dist/client.js', import.meta.url), 'utf8'), { window: { __ModuleLoader__: { load(value) { entry = value; } } } });
  assert.equal(entry.id, pkg.name);
  assert.deepEqual(pkg.dsh.client.inject, ['@deepseek-ai/dsh-client-ui-settings', '@deepseek-ai/dsh-api-remotes']);
  const client = entry.factory(name => { assert.equal(name, 'react'); return React; });
  assert.deepEqual(Array.from(client.inject), ['slots', 'settingsScope', 'remote', 'remote.session']);
  let catalogResponse = { ok: true, value: { groups: [] } };
  client.apply({ remote: { session: { modelCatalog: async () => catalogResponse } }, settingsScope: { bind(spec) { bound = spec; return {}; } }, slots: {
    inject(name, work) { assert.equal(name, 'settings.section'); work(); }, register(options, component) { registered = options; assert.equal(typeof component, 'function'); },
  } });
  assert.equal(bound.namespace, 'smart-dev'); assert.equal(registered.id, 'smart-dev');
  assert.equal(await registered.inject().loadCatalog(), catalogResponse.value);
  catalogResponse = { ok: false, error: { message: 'Catalog unavailable' } };
  await assert.rejects(registered.inject().loadCatalog(), /Catalog unavailable/);
});
