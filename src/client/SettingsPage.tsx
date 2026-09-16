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
  function textField(key: Exclude<keyof Draft, 'enabled' | 'tools' | 'commands'>, label: string, hint?: string, numeric?: { min: number; max: number }) {
    return <label className="sd-field">{label}<input aria-label={label} aria-describedby={hint ? `${fieldPrefix}-${key}` : undefined} value={draft?.[key] ?? ''}
      type={numeric ? 'number' : 'text'} min={numeric?.min} max={numeric?.max} step={numeric ? 1 : undefined}
      autoComplete="off" spellCheck={false} onChange={e => edit(key, e.target.value)} />{hint && <small id={`${fieldPrefix}-${key}`}>{hint}</small>}</label>;
  }
  return <section className="sd-page" aria-label="Smart Dev 配置">
    <style>{styles}</style>
    <header className="sd-header"><div><span className="sd-kicker">WORKFLOW SETTINGS</span><h2>Smart Dev</h2>
      <p>一次任务，从规划到验证与审查。</p></div><code>/smart-dev</code></header>
    <div className="sd-flow" aria-label="工作流阶段"><span>01 规划</span><span>02 执行</span><span>03 验证</span><span>04 审查</span></div>
    {!ready ? <p role="status">{snapshot.status === 'loading' ? '正在载入 DSH 配置…' : '当前连接无法读取 Smart Dev 配置。请确认宿主已加载插件，并通过本机 DSH Web 打开设置。'}</p> : <form onSubmit={e => { e.preventDefault(); void persist(false); }}>
      {!writable && <p className="sd-alert" role="status">当前连接只读，无法保存到 DSH。请使用允许写入设置的本机连接。</p>}
      {stale && <p className="sd-alert" role="alert">配置已在其他页面更新。草稿仍保留，请载入最新配置后重新编辑。</p>}
      <fieldset disabled={!writable || busy} className="sd-fields">
        <label className="sd-enable"><span><strong>启用工作流</strong><small>保存后用于新任务；正在运行的任务继续使用原配置。</small></span>
          <input type="checkbox" role="switch" checked={draft.enabled} onChange={e => edit('enabled', e.target.checked)} /></label>
        <section className="sd-card"><h3>模型与执行</h3><p>从 DSH 模型目录选择执行模型。模型连接与凭据在 Settings → Models 管理。</p>
          <div className="sd-grid">{textField('plannerProvider', '规划 Provider')}{textField('reviewerProvider', '审查 Provider')}
            {textField('workerProvider', '执行 Backend', '默认 spawn；需要支持模型覆盖、工具过滤和深度限制。')}
            <ModelFields provider={draft.modelProvider} model={draft.model} loadCatalog={loadCatalog}
              onChange={(modelProvider, model) => {
                setDraft(current => current ? { ...current, modelProvider, model } : current);
                setDirty(true); setNotice(undefined);
              }} /></div>
          <label className="sd-field">工具白名单<textarea rows={3} value={draft.tools} spellCheck={false} onChange={e => edit('tools', e.target.value)} /><small>每行一个精确工具名，例如 bash。</small></label>
        </section>
        <section className="sd-card"><h3>调用预算</h3><div className="sd-grid">
          {textField('maxStrongCalls', '强模型调用上限', '包含规划和每次审查。', { min: 2, max: 100 })}
          {textField('maxFixRounds', '修复轮次上限', '修复后会重新运行验证。', { min: 0, max: 10 })}</div>
          <p className="sd-note">预算为 2 次时，修复后可能停在 NEEDS_REVIEW。需要再次审查时，至少设置为 3。</p>
        </section>
        <section className="sd-card"><h3>验收与超时</h3><p>Worker 修改代码后，自动运行这些测试或构建命令，并将结果交给审查。验证或审查未通过时，会在预算允许范围内修复并重新验证。全部检查通过且审查通过，任务才算完成。启用工作流前至少配置一条。</p><label className="sd-field">验证命令（JSON）
          <textarea className="sd-code" rows={6} value={draft.commands} spellCheck={false} onChange={e => edit('commands', e.target.value)} />
          <small>例如 [["npm", "test"]]；本插件项目可用 [["npm", "run", "check"]]。每个数组是一条命令，参数分开填写；按顺序在任务工作区执行，不展开 shell。切换项目时请换成该项目的检查命令。</small></label>
          <div className="sd-grid">{textField('agentTimeoutMs', '单个 Agent 超时（毫秒）', undefined, { min: 1, max: 2_147_483_647 })}
          {textField('commandTimeoutMs', '单条验证超时（毫秒）', undefined, { min: 1, max: 2_147_483_647 })}</div>
        </section>
      </fieldset>
      <details className="sd-storage"><summary>存储与生效范围</summary><p>配置由 DSH 的 settings 服务持久化，适用于当前宿主的 Smart Dev 任务。跨项目运行前，请检查验证命令。</p>
        <label className="sd-field">产物与锁目录<input readOnly value={base.value!.stateRoot} /></label><p>该目录由部署配置决定；修改它需要停止相关任务并重新部署插件。</p></details>
      {notice && <p className={notice.error ? 'sd-alert' : 'sd-success'} role={notice.error ? 'alert' : 'status'}>{notice.text}</p>}
      <footer className="sd-footer"><span aria-live="polite">{busy ? '正在保存…' : dirty ? '有未保存的修改' : draft.enabled ? '工作流已启用' : '工作流未启用'}</span>
        <div><button type="button" disabled={busy} onClick={reload}>{stale ? '载入最新配置' : '放弃修改'}</button>
        <button type="button" disabled={!writable || busy || !!stale} onClick={() => void persist(true)}>恢复部署默认值</button>
        <button type="submit" className="sd-primary" disabled={!writable || busy || !dirty || !!stale}>保存配置</button></div></footer>
    </form>}
  </section>;
}
