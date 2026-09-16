// Optional network integration check. Uses real pnpm in an isolated temporary Profile.
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Manager } from '../dist/host/manager.js';
import { hash } from '../dist/host/files.js';
import { enabledBackends } from '../dist/host/preset.js';
const root = await mkdtemp(join(tmpdir(), 'smart-dev-install-'));
try {
  await writeFile(join(root, 'package.json'), JSON.stringify({ name: 'smart-dev-install-check', private: true, dsh: { profile: { bundles: [] } } }));
  await writeFile(join(root, 'pnpm-workspace.yaml'), 'packages: [.]\nnodeLinker: hoisted\nautoInstallPeers: false\n');
  const preset = join(root, 'agent.cordis.yml');
  await writeFile(preset, '- id: persona\n  name: "@deepseek-ai/dsh-persona"\n  config:\n    prefix: Test persona\n');
  const manager = new Manager(root, { copyPreset: async () => { throw new Error('Not used'); }, presets: async () => [{ id: 'test', path: preset, trust: 'user' }], registered: () => [], agents: () => [] });
  await manager.init();
  for (const backend of ['codex', 'claude-code']) {
    const revision = hash(await readFile(preset, 'utf8'));
    const reply = await manager.dispatch({ action: 'install', backend, preset: 'test', revision });
    const state = reply.status.backends.find(item => item.id === backend);
    assert.equal(state.installed, true); assert.equal(state.bundled, true); assert.equal(state.registered, false);
    assert.ok(enabledBackends(await readFile(preset, 'utf8')).includes(backend));
    console.log(`${backend}: real pnpm installation and preset enable passed`);
  }
  await manager.dispatch({ action: 'restore', preset: 'test', revision: hash(await readFile(preset, 'utf8')) });
  assert.deepEqual(enabledBackends(await readFile(preset, 'utf8')), []);
  console.log('Exact preset restoration passed; no model request made.');
} finally { await rm(root, { recursive: true, force: true }); }
