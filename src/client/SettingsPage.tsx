import * as React from 'react';
import type { SettingsScope } from '@deepseek-ai/dsh-client-ui-settings/client';
import type { Settings } from '../shared/config.js';
import { editableKeys, fromDraft, same, toDraft } from './editor.js';
import type { Draft } from './editor.js';
import { styles } from './styles.js';
import { ModelFields } from './ModelFields.js';
import type { LoadModelCatalog } from './ModelFields.js';

type Props = { scope: SettingsScope<Settings>; loadCatalog: LoadModelCatalog };
export function SettingsPage({ scope, loadCatalog }: Props) {
  const fieldPrefix = React.useId();
  const snapshot = React.useSyncExternalStore(cb => scope.subscribe(cb), () => scope.getSnapshot());
  const [base, setBase] = React.useState(snapshot);
  const [draft, setDraft] = React.useState<Draft>();
  const [dirty, setDirty] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [notice, setNotice] = React.useState<{ error: boolean; text: string }>();
  React.useEffect(() => {
    if (!dirty && !busy && snapshot.status === 'ready' && snapshot.value) {
      setBase(snapshot); setDraft(toDraft(snapshot.value));
    }
  }, [snapshot, dirty, busy]);
  const ready = snapshot.status === 'ready' && snapshot.value && draft && base.value;
  const writable = snapshot.writable && snapshot.mode === 'host';
  const stale = dirty && snapshot.revision !== base.revision;
  function reload() {
    if (!snapshot.value) return;
    setBase(snapshot); setDraft(toDraft(snapshot.value)); setDirty(false); setNotice(undefined);
  }
  function edit<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft(current => current ? { ...current, [key]: value } : current);
    setDirty(true); setNotice(undefined);
  }
  async function persist(reset: boolean) {
    if (!draft || !base.value || base.revision === undefined || !writable || busy) return;
    setBusy(true); setNotice(undefined);
    try {
      if (snapshot.revision !== base.revision) throw new Error('配置已在其他页面更改。请先载入最新配置，再重新编辑。');
      const target = reset ? undefined : fromDraft(draft, base.value.stateRoot);
      const keys = target ? editableKeys.filter(key => !same(target[key], base.value![key])) : editableKeys;
      await scope.mutate(keys.map(key => target
        ? { op: 'set' as const, path: [key], value: target[key] }
        : { op: 'unset' as const, path: [key] }), base.revision);
      // DSH's scope may recover a rejected Remote response without throwing.
      // A settled promise is not save proof: verify the accepted Host mirror.
      const after = scope.getSnapshot();
      const confirmed = after.status === 'ready' && after.mode === 'host' && after.value && (target
        ? keys.every(key => same(after.value![key], target[key]))
        : editableKeys.every(key => !Object.hasOwn((after.user ?? {}) as object, key)));
      if (!confirmed) throw new Error('保存未获宿主确认，可能存在并发修改或配置校验失败。草稿已保留；请载入最新配置后重试。');
      setBase(after); setDraft(toDraft(after.value!)); setDirty(false);
      setNotice({ error: false, text: reset ? '已恢复部署默认值，从下一次任务生效。' : '已保存到 DSH，从下一次任务生效。' });
    } catch (error) { setNotice({ error: true, text: error instanceof Error ? error.message : String(error) }); }
    finally { setBusy(false); }
  }
  function textField(key: Exclude<keyof Draft, 'enabled' | 'tools'>, label: string, hint?: string, numeric?: { min: number; max: number }) {
    return <label className="sd-field">{label}<input aria-label={label} aria-describedby={hint ? `${fieldPrefix}-${key}` : undefined} value={draft?.[key] ?? ''}
      type={numeric ? 'number' : 'text'} min={numeric?.min} max={numeric?.max} step={numeric ? 1 : undefined}
      autoComplete="off" spellCheck={false} onChange={e => edit(key, e.target.value)} />{hint && <small id={`${fieldPrefix}-${key}`}>{hint}</small>}</label>;
  }
  return <section className="sd-page" aria-label="Smart Dev 配置">
    <style>{styles}</style>
    <header className="sd-header"><div><span className="sd-kicker">AGENT SETTINGS</span><h2>Smart Dev</h2>
      <p>把任务交给 Agent，由它决定如何完成和检查。</p></div><code>/smart-dev</code></header>

    {!ready ? <p role="status">{snapshot.status === 'loading' ? '正在载入 DSH 配置…' : '当前连接无法读取 Smart Dev 配置。请确认宿主已加载插件，并通过本机 DSH Web 打开设置。'}</p> : <form onSubmit={e => { e.preventDefault(); void persist(false); }}>
      {!writable && <p className="sd-alert" role="status">当前连接只读，无法保存到 DSH。请使用允许写入设置的本机连接。</p>}
      {stale && <p className="sd-alert" role="alert">配置已在其他页面更新。草稿仍保留，请载入最新配置后重新编辑。</p>}
      <fieldset disabled={!writable || busy} className="sd-fields">
        <label className="sd-enable"><span><strong>启用 Smart Dev</strong><small>保存后用于新任务；正在运行的任务继续使用原配置。</small></span>
          <input type="checkbox" role="switch" checked={draft.enabled} onChange={e => edit('enabled', e.target.checked)} /></label>
        <section className="sd-card"><h3>模型与执行</h3><p>从 DSH 模型目录选择执行模型。模型连接与凭据在 Settings → Models 管理。</p>
          <div className="sd-grid">{textField('workerProvider', '执行 Backend', '默认 spawn；使用 DSH Agent 执行任务，后端需支持模型选择。')}
            <ModelFields provider={draft.modelProvider} model={draft.model} loadCatalog={loadCatalog}
              onChange={(modelProvider, model) => {
                setDraft(current => current ? { ...current, modelProvider, model } : current);
                setDirty(true); setNotice(undefined);
              }} /></div>
          <label className="sd-field">工具范围（可选）<textarea rows={3} value={draft.tools} spellCheck={false} onChange={e => edit('tools', e.target.value)} /><small>留空继承 DSH 可用工具与权限；填写时每行一个工具名，进一步收窄范围。</small></label>
        </section>
        <section className="sd-card"><h3>执行方式</h3>
          <p>Agent 根据任务和项目决定是否规划、运行测试或构建、修复以及追加审查，无需预设验证命令或修复轮次。结果报告会说明实际完成的工作、检查和未解决的问题。</p>
          <div className="sd-grid">{textField('agentTimeoutMs', '任务超时（毫秒）', '超时将取消本次 Agent 执行并保留运行记录。', { min: 1, max: 2_147_483_647 })}</div>
        </section>
      </fieldset>
      <details className="sd-storage"><summary>存储与生效范围</summary><p>配置由 DSH 的 settings 服务持久化，适用于当前宿主的 Smart Dev 任务。正在运行的任务使用启动时的配置快照。</p>
        <label className="sd-field">产物与锁目录<input readOnly value={base.value!.stateRoot} /></label><p>该目录由部署配置决定；修改它需要停止相关任务并重新部署插件。</p></details>
      {notice && <p className={notice.error ? 'sd-alert' : 'sd-success'} role={notice.error ? 'alert' : 'status'}>{notice.text}</p>}
      <footer className="sd-footer"><span aria-live="polite">{busy ? '正在保存…' : dirty ? '有未保存的修改' : draft.enabled ? 'Smart Dev 已启用' : 'Smart Dev 未启用'}</span>
        <div><button type="button" disabled={busy} onClick={reload}>{stale ? '载入最新配置' : '放弃修改'}</button>
        <button type="button" disabled={!writable || busy || !!stale} onClick={() => void persist(true)}>恢复部署默认值</button>
        <button type="submit" className="sd-primary" disabled={!writable || busy || !dirty || !!stale}>保存配置</button></div></footer>
    </form>}
  </section>;
}
