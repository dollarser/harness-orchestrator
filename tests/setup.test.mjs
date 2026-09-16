import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Manager, locateProfile } from '../dist/host/manager.js';
import { enableBackend, enabledBackends } from '../dist/host/preset.js';
import { hash } from '../dist/host/files.js';
import { backends } from '../dist/shared/types.js';

const source = `# preserve me
- id: persona
  name: '@deepseek-ai/dsh-persona'
  config:
    prefix: Original user persona
- id: shell
  name: shell
  disabled: !!js process.platform === 'win32'
- id: delegation
  name: cordis:group
  config:
    - id: codex
      name: '@deepseek-ai/dsh-tool-subagent'
      disabled: true
      config:
        provider: codex
        toolName: subagent_codex
        backgroundMode: one-shot
        maxDepth: provider-managed
`;
async function fixture(t, command) {
  const profile = await mkdtemp(join(tmpdir(), 'smart-dev-'));
  t.after(() => rm(profile, { recursive: true, force: true }));
  await writeFile(join(profile, 'package.json'), JSON.stringify({ dsh: { profile: { bundles: [] } } }));
  const file = join(profile, 'agent.cordis.yml'); await writeFile(file, source);
  const presets = [{ id: 'user', path: file, trust: 'user' }, { id: 'standard', path: file, trust: 'system' }];
  const host = { copyPreset: async (from, id, name) => { const original = presets.find(p => p.id === from); const path = join(profile, `${id}.yml`); await writeFile(path, await readFile(original.path)); presets.push({ id, name, path, trust: 'user' }); }, presets: async () => presets, registered: () => [], agents: () => [] };
  const manager = new Manager(profile, host, command); await manager.init();
  async function installFake(id = 'codex') {
    const item = backends.find(b => b.id === id);
    const dir = join(profile, 'node_modules', item.package); await mkdir(dir, { recursive: true });
    await writeFile(join(dir, 'package.json'), JSON.stringify({ name: item.package, version: '0.1.5-rc.1', dsh: { bundle: { patch: './cordis.patch.yml' } } }));
    const manifest = JSON.parse(await readFile(join(profile, 'package.json'), 'utf8'));
    manifest.dsh.profile.bundles.push(item.package);
    await writeFile(join(profile, 'package.json'), JSON.stringify(manifest));
  }
  const revision = async () => hash(await readFile(file, 'utf8'));
  return { manager, profile, file, presets, installFake, revision };
}
test('nested tool enable preserves persona, comments and inert JS tags; idempotent', () => {
  const output = enableBackend(source, 'codex');
  assert.deepEqual(enabledBackends(output), ['codex']);
  assert.match(output, /Original user persona/); assert.match(output, /# preserve me/); assert.match(output, /!!js/);
  assert.equal(enableBackend(output, 'codex'), output);
});
test('missing tool gets one native one-shot row, with no scheduling policy', () => {
  const output = enableBackend(source, 'claude-code');
  assert.deepEqual(enabledBackends(output), ['claude-code']);
  assert.match(output, /maxDepth: provider-managed/);
  assert.equal(enableBackend(output, 'claude-code'), output);
});
test('disabled parent and malformed preset do not yield false enable success', () => {
  assert.throws(() => enableBackend(source.replace('name: cordis:group', 'name: cordis:group\n  disabled: true'), 'codex'), /分组/);
  assert.throws(() => enableBackend('hello: world', 'codex'), /YAML/);
  assert.throws(() => enableBackend(source.replace('disabled: true', 'disabled: !!js true'), 'codex'), /动态/);
});
test('installation, registration, preset configuration and runtime visibility are distinct', async t => {
  const f = await fixture(t); await f.installFake();
  const state = await f.manager.status();
  assert.equal(state.backends[0].installed, true); assert.equal(state.backends[0].registered, false);
  assert.deepEqual(state.presets[0].enabled, []); assert.deepEqual(state.agents, []);
});
test('enable and restore preserve exact original bytes', async t => {
  const f = await fixture(t); await f.installFake();
  await f.manager.dispatch({ action: 'enable', backend: 'codex', preset: 'user', revision: await f.revision() });
  assert.deepEqual(enabledBackends(await readFile(f.file, 'utf8')), ['codex']);
  await f.manager.dispatch({ action: 'restore', preset: 'user', revision: await f.revision() });
  assert.equal(await readFile(f.file, 'utf8'), source);
});
test('stale revision, unknown backend and system preset writes reject', async t => {
  const f = await fixture(t); await f.installFake();
  await assert.rejects(f.manager.dispatch({ action: 'enable', backend: 'codex', preset: 'user', revision: 'old' }), /更改/);
  await assert.rejects(f.manager.dispatch({ action: 'enable', backend: 'codex', preset: 'standard', revision: await f.revision() }), /用户/);
  await assert.rejects(f.manager.dispatch({ action: 'install', backend: '$(touch nope)' }), /支持/);
  assert.equal(await readFile(f.file, 'utf8'), source);
});
test('unrelated edits block restore instead of overwriting user changes', async t => {
  const f = await fixture(t); await f.installFake();
  await f.manager.dispatch({ action: 'enable', backend: 'codex', preset: 'user', revision: await f.revision() });
  await writeFile(f.file, (await readFile(f.file, 'utf8')) + '\n# user edit\n');
  await assert.rejects(f.manager.dispatch({ action: 'restore', preset: 'user', revision: await f.revision() }), /外部修改/);
  assert.match(await readFile(f.file, 'utf8'), /# user edit/);
});
test('guidance persists separately without changing persona or enabling tools', async t => {
  const f = await fixture(t);
  await f.manager.dispatch({ action: 'guidance', preset: 'user', revision: await f.revision(), enabled: true });
  assert.deepEqual(f.manager.preferences.guidancePresets, ['user']);
  assert.equal(await readFile(f.file, 'utf8'), source);
  await f.manager.init(); assert.deepEqual(f.manager.preferences.guidancePresets, ['user']);
  await f.manager.dispatch({ action: 'guidance', preset: 'user', revision: await f.revision(), enabled: false });
  assert.deepEqual(f.manager.preferences.guidancePresets, []);
});
test('install failure never enables tool or adds bundle, preserves actionable backup', async t => {
  const f = await fixture(t, async () => { throw new Error('private credential must not escape'); });
  await assert.rejects(f.manager.dispatch({ action: 'install', backend: 'codex' }), error => /安装失败/.test(error.message) && !/credential/.test(error.message));
  assert.equal(await readFile(f.file, 'utf8'), source);
  assert.deepEqual(JSON.parse(await readFile(join(f.profile, 'package.json'))).dsh.profile.bundles, []);
  assert.equal((await f.manager.dispatch({ action: 'status' })).status.backends[0].bundled, false);
});
test('install uses allowlisted package and preserves unrelated profile keys', async t => {
  let f, args;
  f = await fixture(t, async (file, argv) => { args = [file, ...argv]; await f.installFake(); return ''; });
  await f.manager.dispatch({ action: 'install', backend: 'codex' });
  assert.deepEqual(args, ['pnpm', 'add', '--save-exact', '@deepseek-ai/dsh-subagent-codex@0.1.5-rc.1']);
  assert.deepEqual(enabledBackends(await readFile(f.file, 'utf8')), []);
});
test('profile discovery validates explicit root and never uses cwd as fallback', async t => {
  const f = await fixture(t); assert.equal(await locateProfile(f.profile), f.profile);
  await assert.rejects(locateProfile(join(f.profile, 'missing')), /Profile/);
});
test('auth returns redacted state only and treats execution failure as unknown', async t => {
  const f = await fixture(t, async () => JSON.stringify({ loggedIn: true, token: 'DO_NOT_EXPOSE' }));
  const result = await f.manager.dispatch({ action: 'auth', backend: 'claude-code' });
  assert.equal(result.auth, 'authenticated'); assert.doesNotMatch(JSON.stringify(result), /DO_NOT_EXPOSE/);
  const g = await fixture(t, async () => { throw new Error('DO_NOT_EXPOSE'); });
  assert.equal((await g.manager.dispatch({ action: 'auth', backend: 'claude-code' })).auth, 'unknown');
});
test('concurrent mutations rejected, read-only status remains available', async t => {
  let unblock; const waiting = new Promise(resolve => { unblock = resolve; });
  const f = await fixture(t, async () => { await waiting; throw new Error('stopped'); });
  const first = f.manager.dispatch({ action: 'install', backend: 'codex' });
  await assert.rejects(f.manager.dispatch({ action: 'install', backend: 'claude-code' }), /正在进行/);
  assert.ok((await f.manager.dispatch({ action: 'status' })).status);
  unblock(); await assert.rejects(first, /安装失败/);
});
test('one-click setup installs and enables only the selected preset', async t => {
  let f;
  f = await fixture(t, async () => { await f.installFake('claude-code'); return ''; });
  const result = await f.manager.dispatch({ action: 'install', backend: 'claude-code', preset: 'user', revision: await f.revision() });
  assert.match(result.message, /重启/);
  assert.deepEqual(enabledBackends(await readFile(f.file, 'utf8')), ['claude-code']);
});
test('built-in collaboration copies once, enables both tools and guidance, leaves original intact', async t => {
  const f = await fixture(t); await f.installFake(); await f.installFake('claude-code');
  const request = { action: 'collaborate', preset: 'standard', revision: await f.revision() };
  const reply = await f.manager.dispatch(request);
  assert.equal(reply.selectedPreset, 'smart-dev-standard');
  assert.deepEqual(reply.status.presets.find(p => p.id === reply.selectedPreset).enabled.sort(), ['claude-code','codex']);
  assert.ok(f.manager.preferences.guidancePresets.includes(reply.selectedPreset));
  assert.equal(await readFile(f.file, 'utf8'), source);
  await f.manager.dispatch(request);
  assert.equal(f.presets.filter(p => p.id === reply.selectedPreset).length, 1);
});
test('collaboration rejects an unowned name collision without overwriting', async t => {
  const f = await fixture(t);
  f.presets.push({ id: 'smart-dev-standard', path: f.file, trust: 'user' });
  await assert.rejects(f.manager.dispatch({ action:'collaborate', preset:'standard', revision:await f.revision() }), /不由 Smart Dev 管理/);
  assert.equal(await readFile(f.file, 'utf8'), source);
});
test('failed setup keeps the copy and retries it instead of creating duplicates', async t => {
  let fail = true, f;
  f = await fixture(t, async (_file,args) => { if (fail) throw new Error('failure'); await f.installFake(args.at(-1).includes('claude-code') ? 'claude-code' : 'codex'); return ''; });
  const request = { action:'collaborate', preset:'standard', revision:await f.revision() };
  await assert.rejects(f.manager.dispatch(request), /已保留/);
  assert.equal(f.presets.filter(p => p.id === 'smart-dev-standard').length, 1);
  fail = false;
  const reply = await f.manager.dispatch(request);
  assert.equal(reply.selectedPreset, 'smart-dev-standard');
  assert.equal(f.presets.filter(p => p.id === 'smart-dev-standard').length, 1);
});
test('custom guidance is isolated per preset, persists, rejects stale writes and resets to default', async t => {
  const f = await fixture(t);
  const first = (await f.manager.status()).presets.find(p => p.id === 'user');
  const request = { action:'guidance-text', preset:'user', revision:await f.revision(), guidanceRevision:first.guidanceRevision, text:'Use agents when helpful. {{literal}}' };
  const result = await f.manager.dispatch(request);
  const saved = result.status.presets.find(p => p.id === 'user');
  assert.equal(saved.guidanceText, request.text); assert.equal(saved.guidance, false);
  assert.equal(result.status.presets.find(p => p.id === 'standard').guidanceText, first.guidanceText);
  await f.manager.init(); assert.equal(f.manager.guidanceText('user'), request.text);
  await assert.rejects(f.manager.dispatch(request), /其他页面/);
  await assert.rejects(f.manager.dispatch({ ...request, guidanceRevision:saved.guidanceRevision, text:'  ' }), /不能全为空白/);
  const reset = await f.manager.dispatch({ ...request, guidanceRevision:saved.guidanceRevision, text:null });
  assert.equal(reset.status.presets.find(p => p.id === 'user').guidanceText, first.guidanceText);
  assert.equal(await readFile(f.file,'utf8'), source);
});
test('disable only selected backend, works without installed package and can re-enable', async t => {
  const f = await fixture(t); await f.installFake(); await f.installFake('claude-code');
  for (const backend of ['codex','claude-code']) await f.manager.dispatch({action:'enable', backend, preset:'user', revision:await f.revision()});
  await f.manager.dispatch({action:'disable', backend:'codex', preset:'user', revision:await f.revision()});
  assert.deepEqual(enabledBackends(await readFile(f.file,'utf8')), ['claude-code']);
  await f.manager.dispatch({action:'enable', backend:'codex', preset:'user', revision:await f.revision()});
  assert.ok(enabledBackends(await readFile(f.file,'utf8')).includes('codex'));
  await rm(join(f.profile,'node_modules'),{recursive:true});
  await f.manager.dispatch({action:'disable', backend:'codex', preset:'user', revision:await f.revision()});
  assert.deepEqual(enabledBackends(await readFile(f.file,'utf8')), ['claude-code']);
});
