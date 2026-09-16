import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { acquireWorkspace } from '../dist/host/workspace.js';
import { runCommand } from '../dist/host/process.js';
const signal = () => new AbortController().signal;
async function repo(t) {
  const root = await mkdtemp(join(tmpdir(), 'smart-dev-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const cwd = join(root, 'repo'), state = join(root, 'state'); await mkdir(cwd);
  const git = (...args) => execFileSync('git', args, { cwd, encoding: 'utf8' });
  git('init', '-q'); git('config', 'user.name', 'Test'); git('config', 'user.email', 'test@example.invalid');
  await writeFile(join(cwd, 'tracked.txt'), 'original\n'); git('add', 'tracked.txt'); git('commit', '-qm', 'initial');
  return { root, cwd, state, git };
}
test('isolated index captures tracked, untracked and binary changes without staging', async t => {
  const f = await repo(t), lease = await acquireWorkspace(f.cwd, f.state, signal()); t.after(() => lease.release());
  await writeFile(join(f.cwd, 'tracked.txt'), 'changed\n');
  await writeFile(join(f.cwd, 'new file.txt'), 'new content\n');
  await writeFile(join(f.cwd, 'binary.dat'), Buffer.from([0, 255, 4, 3]));
  const evidence = await lease.evidence(signal());
  assert.match(evidence.patch, /new file.txt/); assert.match(evidence.patch, /GIT binary patch/);
  assert.match(evidence.patch, /changed/); assert.equal(f.git('diff', '--cached'), '');
  const before = evidence.fingerprint; f.git('add', 'tracked.txt');
  assert.notEqual((await lease.evidence(signal())).fingerprint, before);
});
test('workspace lock serializes plugin runs and survives symlink aliases', async t => {
  const f = await repo(t), alias = join(f.root, 'alias'); await symlink(f.cwd, alias);
  const lease = await acquireWorkspace(f.cwd, f.state, signal());
  await assert.rejects(acquireWorkspace(alias, f.state, signal()), /locked/);
  await lease.release(); const second = await acquireWorkspace(alias, f.state, signal()); await second.release();
});
test('existing staged and untracked changes are preserved and captured', async t => {
  const f = await repo(t); await writeFile(join(f.cwd, 'extra'), 'x');
  await writeFile(join(f.cwd, 'tracked.txt'), 'user edit'); f.git('add', 'tracked.txt');
  const before = f.git('diff', '--cached');
  const lease = await acquireWorkspace(f.cwd, f.state, signal());
  const evidence = await lease.evidence(signal());
  assert.match(evidence.patch, /extra/); assert.match(evidence.patch, /user edit/);
  assert.equal(f.git('diff', '--cached'), before); await lease.release();
});
test('artifacts cannot be stored inside target workspace', async t => {
  const f = await repo(t);
  await assert.rejects(acquireWorkspace(f.cwd, join(f.cwd, 'runs'), signal()), /outside/);
  assert.equal(f.git('status', '--porcelain'), '');
});
test('atomic artifact writer rejects path traversal', async t => {
  const f = await repo(t), lease = await acquireWorkspace(f.cwd, f.state, signal()); t.after(() => lease.release());
  await assert.rejects(lease.save('../escape', {}), /filename/);
  await lease.save('state.json', { stage: 'DONE' });
  assert.equal(JSON.parse(await readFile(join(lease.runDir, 'state.json'), 'utf8')).stage, 'DONE');
});
test('argv is literal, command failures and output limits are evidence', async () => {
  const literal = '$(touch should-not-exist); echo nope';
  const ok = await runCommand([process.execPath, '-e', 'console.log(process.argv[1])', literal], tmpdir(), signal(), 5000);
  assert.equal(ok.stdout.trim(), literal);
  const missing = await runCommand(['/nonexistent-smart-dev-command'], tmpdir(), signal(), 5000);
  assert.match(missing.failure, /ENOENT/);
  const overflow = await runCommand([process.execPath, '-e', 'console.log("x".repeat(10000))'], tmpdir(), signal(), 5000, undefined, 100);
  assert.equal(overflow.failure, 'output_limit'); assert.ok(overflow.stdout.length <= 100);
});
test('host process timeout and cancellation stop processes', async () => {
  const argv = [process.execPath, '-e', 'setInterval(() => {}, 1000)'];
  assert.equal((await runCommand(argv, tmpdir(), signal(), 30)).failure, 'timeout');
  const c = new AbortController(), pending = runCommand(argv, tmpdir(), c.signal, 5000);
  c.abort(); assert.equal((await pending).failure, 'cancelled');
});
