import { readFile, mkdir, unlink } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { backend, backends, type BackendId, type Preferences, type PresetStatus, type Request, type Reply, type Status } from '../shared/types.js';
import { atomic, hash, readJson } from './files.js';
import { delegationGuidance } from '../shared/delegation.js';
import { enabledBackends, enableBackend } from './preset.js';

const execute = promisify(execFile);
interface Preset { id: string; name?: string; path: string; trust: string; broken?: string }
interface Manifest { dependencies?: Record<string, string>; dsh?: { profile?: { bundles?: string[] } }; version?: string }
interface Journal { before: string; after: string }
export interface Host {
  presets(): Promise<Preset[]>;
  copyPreset(from: string, id: string, name: string): Promise<void>;
  registered(): string[];
  agents(): Status['agents'];
}
export type Run = (file: string, args: string[], cwd: string, timeout: number) => Promise<string>;
export const run: Run = async (file, args, cwd, timeout) => {
  const result = await execute(file, args, { cwd, timeout, maxBuffer: 256 * 1024, encoding: 'utf8', env: process.env });
  return result.stdout + result.stderr;
};

/** Locate the owning profile, never infer it from the target project's cwd. */
export async function locateProfile(explicit?: string): Promise<string> {
  let path = explicit ? resolve(explicit) : dirname(fileURLToPath(import.meta.url));
  for (;;) {
    const manifest = await readJson<Manifest>(join(path, 'package.json'), {});
    if (Array.isArray(manifest.dsh?.profile?.bundles)) return path;
    if (explicit || dirname(path) === path) throw new Error('无法定位 DSH Profile，请在插件部署配置中设置 profileDir');
    path = dirname(path);
  }
}

export class Manager {
  preferences: Preferences = { guidancePresets: [] };
  private guidanceTexts: Record<string, string> = {};
  guidanceText(id: string) { return Object.hasOwn(this.guidanceTexts, id) ? this.guidanceTexts[id]! : delegationGuidance; }
  private busy = false;
  constructor(readonly profile: string, private host: Host, private command: Run = run) {}
  private get dir() { return join(this.profile, '.smart-dev'); }
  async init() {
    this.guidanceTexts = await readJson<Record<string, string>>(join(this.dir, 'guidance-texts.json'), {});
    if (!this.guidanceTexts || Array.isArray(this.guidanceTexts) || typeof this.guidanceTexts !== 'object' || Object.values(this.guidanceTexts).some(text => typeof text !== 'string' || !text.trim() || text.length > 16000)) throw new Error('指引内容配置格式无效');
    this.preferences = await readJson<Preferences>(join(this.dir, 'preferences.json'), { guidancePresets: [] });
    if (!Array.isArray(this.preferences.guidancePresets) || this.preferences.guidancePresets.some(id => typeof id !== 'string')) throw new Error('Smart Dev 提示词配置格式无效');
  }
  private async preset(id: unknown) {
    const preset = (await this.host.presets()).find(p => p.id === id);
    if (!preset || preset.trust !== 'user' || preset.broken) throw new Error('请选择可编辑的用户 Agent 预设；内置模式请使用“创建协作版并启用”');
    return preset;
  }
  private journalPath(id: string) { return join(this.dir, `preset-${hash(id)}.json`); }
  private async installed(id: BackendId): Promise<{ version?: string; entry?: string }> {
    try {
      const require = createRequire(join(this.profile, 'package.json'));
      const entry = require.resolve(`${backend(id).package}/package.json`);
      const pkg = await readJson<Manifest>(entry);
      return { version: pkg.version, entry };
    } catch { return {}; }
  }
  async status(): Promise<Status> {
    const manifest = await readJson<Manifest>(join(this.profile, 'package.json'));
    const registered = this.host.registered();
    const presets: PresetStatus[] = [];
    for (const preset of await this.host.presets()) {
      try {
        const content = await readFile(preset.path, 'utf8');
        presets.push({ id: preset.id, name: preset.name ?? preset.id, writable: preset.trust === 'user' && !preset.broken,
          copyable: preset.trust === 'system' && !preset.broken, revision: hash(content), enabled: enabledBackends(content), managed: !!await readJson<Journal | null>(this.journalPath(preset.id), null),
          guidanceText: this.guidanceText(preset.id), guidanceRevision: hash(this.guidanceText(preset.id)), guidance: this.preferences.guidancePresets.includes(preset.id), ...(preset.broken ? { error: preset.broken } : {}) });
      } catch { presets.push({ id: preset.id, name: preset.name ?? preset.id, writable: false, revision: '', enabled: [], managed: false, guidance: false, guidanceText: '', guidanceRevision: '', error: '无法读取或解析预设' }); }
    }
    return { profile: this.profile, presets, agents: this.host.agents(), backends: await Promise.all(backends.map(async item => {
      const pkg = await this.installed(item.id);
      return { id: item.id, installed: !!pkg.entry, version: pkg.version,
        bundled: manifest.dsh?.profile?.bundles?.includes(item.package) ?? false, registered: registered.includes(item.id) };
    })) };
  }
  async dispatch(request: Request): Promise<Reply> {
    if (!request || typeof request !== 'object') throw new Error('无效请求');
    if (request.action === 'status') return { status: await this.status() };
    if (request.action === 'auth') return this.auth(backend(request.backend).id);
    if (!['guidance-text', 'collaborate', 'install', 'enable', 'restore', 'guidance'].includes(request.action)) throw new Error('未知操作');
    if (this.busy) throw new Error('另一项接入操作正在进行，请稍后刷新');
    this.busy = true;
    let locked = false;
    try {
      await mkdir(this.dir, { recursive: true, mode: 0o700 });
      try { await mkdir(join(this.dir, 'operation.lock')); locked = true; }
      catch { throw new Error('接入配置正被其他操作占用；如果上次进程异常退出，请确认无安装进程后移除 .smart-dev/operation.lock'); }
      let message: string;
      if (request.action === 'collaborate') return await this.collaborate(request);
      if (request.action === 'install') {
        const id = backend(request.backend).id;
        const preset = request.preset === undefined ? undefined : await this.preset(request.preset);
        if (preset && hash(await readFile(preset.path, 'utf8')) !== request.revision) throw new Error('预设已更改，请刷新后重试');
        message = await this.install(id);
        if (preset) {
          try { await this.enable(preset, id, request.revision); }
          catch (error) { throw new Error(`后端已安装，但工具启用未完成：${error instanceof Error ? error.message : String(error)}`); }
          message = '后端已安装并启用所选预设工具。请重启 DSH，再刷新检查注册状态和工具可见性。';
        }
      }
      else {
        const preset = await this.preset(request.preset);
        const text = await readFile(preset.path, 'utf8');
        if (request.revision !== hash(text)) throw new Error('预设已更改，请刷新后重试');
        if (request.action === 'guidance-text') {
          if (request.guidanceRevision !== hash(this.guidanceText(preset.id))) throw new Error('指引已被其他页面修改，请载入最新内容后重试');
          if (request.text !== null && (typeof request.text !== 'string' || !request.text.trim() || request.text.length > 16000)) throw new Error('指引内容需为 1–16000 个字符，不能全为空白');
          const next = { ...this.guidanceTexts };
          if (request.text === null) delete next[preset.id]; else next[preset.id] = request.text;
          await atomic(join(this.dir, 'guidance-texts.json'), JSON.stringify(next, null, 2));
          this.guidanceTexts = next;
          message = request.text === null ? '已恢复默认指引，下次组装提示词生效。' : '指引已保存，下次组装提示词生效。';
        } else if (request.action === 'guidance') {
          if (typeof request.enabled !== 'boolean') throw new Error('请选择提示词开关');
          const ids = new Set(this.preferences.guidancePresets);
          request.enabled ? ids.add(preset.id) : ids.delete(preset.id);
          const next = { guidancePresets: [...ids] };
          await atomic(join(this.dir, 'preferences.json'), JSON.stringify(next, null, 2));
          this.preferences = next;
          message = '分工指引已保存，下次组装提示词生效；不修改原有 persona。';
        } else if (request.action === 'restore') {
          const journal = await readJson<Journal | null>(this.journalPath(preset.id), null);
          if (!journal) throw new Error('该预设没有 Smart Dev 管理的修改');
          if (text !== journal.after && text !== journal.before) throw new Error('预设在启用后被外部修改，不能自动还原；备份位于 Profile/.smart-dev，请手动合并');
          await atomic(preset.path, journal.before);
          await unlink(this.journalPath(preset.id));
          message = '已还原本插件对工具预设的修改。请重启 DSH；分工指引可单独关闭。';
        } else {
          const id = backend(request.backend).id;
          const state = (await this.status()).backends.find(b => b.id === id)!;
          if (!state.installed || !state.bundled) throw new Error('请先安装并注册该后端');
          message = await this.enable(preset, id, request.revision);
        }
      }
      return { message, status: await this.status() };
    } finally {
      try { if (locked) { const { rmdir } = await import('node:fs/promises'); await rmdir(join(this.dir, 'operation.lock')); } }
      finally { this.busy = false; }
    }
  }
  private async collaborate(request: Request): Promise<Reply> {
    const roster = await this.host.presets();
    const source = roster.find(p => p.id === request.preset);
    if (!source || source.trust !== 'system' || source.broken) throw new Error('请选择可用的内置预设');
    if (hash(await readFile(source.path, 'utf8')) !== request.revision) throw new Error('源预设已更改，请刷新后重试');
    const mappingPath = join(this.dir, 'copies.json');
    const copies = await readJson<Record<string, string>>(mappingPath, {});
    const id = copies[source.id] ?? `smart-dev-${source.id}`;
    const existing = roster.find(p => p.id === id);
    if (existing && copies[source.id] !== id) throw new Error(`预设 ${id} 已存在且不由 Smart Dev 管理，请先重命名该预设`);
    if (!existing) {
      await this.host.copyPreset(source.id, id, `${source.name ?? source.id} · 协作版`);
      copies[source.id] = id;
      await atomic(mappingPath, JSON.stringify(copies, null, 2));
    }
    try {
      const target = await this.preset(id);
      for (const item of backends) {
        await this.install(item.id);
        await this.enable(target, item.id, hash(await readFile(target.path, 'utf8')));
      }
      const next = { guidancePresets: [...new Set([...this.preferences.guidancePresets, id])] };
      await atomic(join(this.dir, 'preferences.json'), JSON.stringify(next, null, 2));
      this.preferences = next;
      return { selectedPreset: id, status: await this.status(), message: `协作版已就绪：${target.name ?? id}。已启用 Codex、Claude Code 和分工指引。请重启 DSH，然后新建会话，在输入框上方的模式选择器选择该协作版；当前会话模式不会自动改变。` };
    } catch (error) {
      throw new Error(`协作版 ${id} 已保留，但接入未全部完成：${error instanceof Error ? error.message : String(error)}。可重新选择原内置模式并点击创建协作版继续，或刷新后选择该副本处理。`);
    }
  }
  private async enable(preset: Preset, id: BackendId, revision: string | undefined) {
    const text = await readFile(preset.path, 'utf8');
    if (hash(text) !== revision) throw new Error('预设已更改，请刷新后重试');
    const output = enableBackend(text, id);
    if (output !== text) {
      const old = await readJson<Journal | null>(this.journalPath(preset.id), null);
      if (old && text !== old.after) throw new Error('预设存在外部修改，请先合并已有 Smart Dev 备份');
      await atomic(this.journalPath(preset.id), JSON.stringify({ before: old?.before ?? text, after: output }, null, 2));
      if (await readFile(preset.path, 'utf8') !== text) throw new Error('预设在保存前发生更改，请检查备份后重试');
      await atomic(preset.path, output);
    }
    return output === text ? '此预设已配置该工具；请查看运行中 Agent 的工具状态。' : '工具已启用。请重启 DSH，使已加载的预设重新生效。';
  }
  private async install(id: BackendId) {
    const item = backend(id);
    const file = join(this.profile, 'package.json');
    const backup = join(this.dir, `install-${Date.now()}`);
    await mkdir(backup, { recursive: true, mode: 0o700 });
    for (const name of ['package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml']) {
      try { await atomic(join(backup, name), await readFile(join(this.profile, name), 'utf8')); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    }
    if (!(await this.installed(id)).entry) {
      try { await this.command('pnpm', ['add', '--save-exact', `${item.package}@${item.version}`], this.profile, 180_000); }
      catch { throw new Error(`依赖安装失败或超时。请在 Profile 目录运行 pnpm add ${item.package}@${item.version} 查看原因；备份已保存，未启用工具。`); }
    }
    if (!(await this.installed(id)).entry) throw new Error('安装后未能解析后端包；未启用工具');
    const current = await readFile(file, 'utf8');
    const manifest = JSON.parse(current) as Manifest;
    if (!Array.isArray(manifest.dsh?.profile?.bundles)) throw new Error('安装后的 Profile 清单无效，请检查安装备份');
    if (!manifest.dsh!.profile!.bundles!.includes(item.package)) {
      manifest.dsh!.profile!.bundles!.push(item.package);
      if (await readFile(file, 'utf8') !== current) throw new Error('Profile 已被外部修改，请重试');
      await atomic(file, JSON.stringify(manifest, null, 2) + '\n');
    }
    return '后端已安装并加入 Profile。请重启 DSH；之后检查注册状态和登录状态，再启用所选预设工具。';
  }
  private async auth(id: BackendId): Promise<Reply> {
    const item = backend(id);
    try {
      let file = 'claude'; let args = ['auth', 'status'];
      if (id === 'codex') {
        const pkg = await this.installed(id);
        if (!pkg.entry) throw new Error('missing');
        const require = createRequire(pkg.entry);
        file = process.execPath;
        args = [require.resolve('@openai/codex/bin/codex.js'), 'login', 'status'];
      }
      const output = await this.command(file, args, this.profile, 15_000);
      const authenticated = id === 'codex' ? /Logged in/i.test(output) : JSON.parse(output).loggedIn === true;
      return { auth: authenticated ? 'authenticated' : 'not-authenticated', login: item.login,
        message: authenticated ? 'CLI 报告已登录；这不代表已验证模型请求或自定义后端认证配置。' : 'CLI 未登录，请在终端完成登录后重新检测。' };
    } catch {
      return { auth: 'unknown', login: item.login, message: '无法确认登录状态。请确认 CLI 可用，并在终端检查登录；不会启动交互登录或返回凭据内容。' };
    }
  }
}
