import * as React from 'react';
import type { PresetStatus, Request, Reply } from '../shared/types.js';
export function GuidanceEditor({ preset, busy, act }: { preset: PresetStatus; busy: boolean; act(request: Request): Promise<Reply | undefined> }) {
  const [draft, setDraft] = React.useState(preset.guidanceText);
  const [base, setBase] = React.useState({ text: preset.guidanceText, revision: preset.guidanceRevision });
  const dirty = draft !== base.text;
  const stale = base.revision !== preset.guidanceRevision;
  React.useEffect(() => {
    if (!dirty) { setDraft(preset.guidanceText); setBase({ text: preset.guidanceText, revision: preset.guidanceRevision }); }
  }, [preset.guidanceText, preset.guidanceRevision, dirty]);
  function reload() { setDraft(preset.guidanceText); setBase({ text: preset.guidanceText, revision: preset.guidanceRevision }); }
  async function save(reset: boolean) {
    const reply = await act({ action: 'guidance-text', preset: preset.id, revision: preset.revision, guidanceRevision: base.revision, text: reset ? null : draft });
    const saved = reply?.status?.presets.find(item => item.id === preset.id);
    if (saved) { setDraft(saved.guidanceText); setBase({ text: saved.guidanceText, revision: saved.guidanceRevision }); }
  }
  return <div>
    <label className="sd-field">指引内容<textarea aria-label="指引内容" rows={10} maxLength={16000} value={draft} disabled={busy || !preset.writable} onChange={event => setDraft(event.target.value)} /></label>
    {stale && dirty && <p role="alert">指引已更新，当前草稿保留。请先载入最新内容，再合并修改。</p>}
    <p>{draft.length}/16000 字符{dirty ? ' · 有未保存的修改，请点击“保存指引”' : ' · 与已保存内容一致'}</p>
    <p>恢复默认指引会立即保存；放弃修改只撤销当前草稿。切换预设或关闭页面前，请先保存需要保留的文字。</p>
    <div className="sd-footer">
      <button disabled={busy || !preset.writable || !dirty || stale || !draft.trim()} onClick={() => void save(false)}>保存指引</button>
      <button disabled={busy || !preset.writable || stale} onClick={() => void save(true)}>恢复默认指引</button>
      <button disabled={busy || (!dirty && !stale)} onClick={reload}>{stale ? '载入最新内容' : '放弃指引修改'}</button>
    </div>
  </div>;
}
