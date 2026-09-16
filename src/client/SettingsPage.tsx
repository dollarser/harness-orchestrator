import * as React from 'react';
import { backends, type Api, type Request, type Status } from '../shared/types.js';
import { delegationGuidance } from '../shared/delegation.js';
import { styles } from './styles.js';
export function SettingsPage({ api }: { api: Api }) {
  const [status, setStatus] = React.useState<Status>();
  const [selected, select] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [notice, setNotice] = React.useState('');
  const [error, setError] = React.useState('');
  const [auth, setAuth] = React.useState<Record<string, string>>({});
  const generation = React.useRef(0);
  React.useEffect(() => {
    let live = true;
    void api({ action: 'status' }).then(reply => { if (live) setStatus(reply.status); }).catch(err => { if (live) setError(String(err)); });
    return () => { live = false; generation.current++; };
  }, [api]);
  const preset = status?.presets.find(p => p.id === selected);
  async function act(request: Request) {
    if (busy) return;
    setBusy(true); setError(''); setNotice('');
    const current = generation.current;
    try {
      const reply = await api(request);
      if (generation.current !== current) return;
      if (reply.status) setStatus(reply.status);
      if (reply.selectedPreset) select(reply.selectedPreset);
      setNotice(reply.message ?? '状态已刷新');
      if (reply.auth && request.backend) setAuth(old => ({ ...old, [request.backend!]: `${reply.auth === 'authenticated' ? '已登录' : reply.auth === 'not-authenticated' ? '未登录' : '未知'}。${reply.message} 登录命令：${reply.login}` }));
    } catch (err) { if (generation.current === current) setError(err instanceof Error ? err.message : String(err)); }
    finally { if (generation.current === current) setBusy(false); }
  }
  return <section className="sd-page" aria-label="Smart Dev 配置"><style>{styles}</style>
    <header className="sd-header"><div><span className="sd-kicker">MULTI-AGENT SETUP</span><h2>Smart Dev</h2><p>准备协作工具，让主 Agent 自主决定如何分工。</p></div></header>
    <p>在普通 DSH 对话中提出任务。无需 /smart-dev 命令，也没有固定规划、执行或验证流程。</p>
    <button disabled={busy} onClick={() => void act({ action: 'status' })}>刷新状态</button>
    {error && <p role="alert" className="sd-alert">{error}</p>}
    <p role="status">{busy ? '正在处理，请勿关闭或重启 DSH…' : notice}</p>
    {!status ? <p>正在读取宿主接入状态…</p> : <>
      <section className="sd-card"><h3>应用到 Agent 预设</h3><label className="sd-field">Agent 预设<select aria-label="Agent 预设" disabled={busy} value={selected} onChange={e => select(e.target.value)}><option value="">请选择预设</option>{status.presets.map(p => <option key={p.id} value={p.id}>{p.name}{p.writable ? '' : '（只读）'}</option>)}</select></label>
      <p>内置模式可一键创建协作版，自动启用两个后端和分工指引。原模式保留；工具配置变更后请重启 DSH。</p>{preset?.copyable && <button disabled={busy} onClick={() => void act({ action: 'collaborate', preset: preset.id, revision: preset.revision })}>创建协作版并启用</button>}{preset?.error && <p role="alert">{preset.error}</p>}</section>
      {backends.map(item => {
        const state = status.backends.find(b => b.id === item.id);
        return <section className="sd-card" key={item.id}><h3>{item.title}</h3>
          <p>{item.id === 'codex' ? '可用于分析、实现或独立审查；由主 Agent 按任务选择。' : '可委派完整上下文的实现、分析或检查任务；不固定分工。'}</p>
          <p>安装：{state?.installed ? `已安装 ${state.version ?? ''}` : '未安装'} · Profile：{state?.bundled ? '已配置' : '未配置'} · 当前宿主：{state?.registered ? '已注册' : '未注册'}</p>
          <p>所选预设工具：{preset ? preset.enabled.includes(item.id) ? '已配置启用' : '未启用' : '尚未选择预设'}</p>
          <div className="sd-footer"><button disabled={busy || !preset?.writable || !!(state?.installed && state.bundled)} onClick={() => void act({ action: 'install', backend: item.id, preset: preset!.id, revision: preset!.revision })}>安装并启用 {item.title}</button>
          <button disabled={busy || !preset?.writable || !state?.installed || !state.bundled || preset.enabled.includes(item.id)} onClick={() => void act({ action: 'enable', backend: item.id, preset: preset!.id, revision: preset!.revision })}>启用 {item.title} 工具</button>
          <button disabled={busy || !state?.installed} onClick={() => void act({ action: 'auth', backend: item.id })}>检测 {item.title} 登录</button></div>
          {auth[item.id] && <p>{auth[item.id]}</p>}
        </section>;
      })}
      <section className="sd-card"><h3>分工指引</h3><label><input type="checkbox" aria-label="注入分工指引" disabled={busy || !preset?.writable} checked={preset?.guidance ?? false} onChange={e => void act({ action: 'guidance', preset: preset!.id, revision: preset!.revision, enabled: e.target.checked })} /> 为所选预设注入非强制的分工指引</label><p>独立提示词片段，保留原有 persona。关闭或卸载本插件即停止注入；下次组装提示词生效。</p><details><summary>查看指引内容</summary><p>{delegationGuidance}</p></details></section>
      <section className="sd-card"><h3>运行中的 Agent</h3><p>以下仅表示工具已注册到 Agent；登录检测与真实模型调用是不同的检查。</p>{status.agents.filter(a => !selected || a.preset === selected).map((a, i) => <p key={i}>{a.preset || '无预设'}：{a.tools.join('、') || '未发现外部委派工具'}</p>)}{!status.agents.some(a => !selected || a.preset === selected) && <p>暂无该预设的运行实例。重启后打开对应会话，再刷新检查。</p>}</section>
      <details><summary>维护与卸载</summary><p>Profile：{status.profile}</p><p>卸载前可关闭指引并还原 Smart Dev 对所选工具预设的修改。已安装后端和原先启用的工具会保留；不会自动删除依赖。</p><button disabled={busy || !preset?.managed || !preset.writable} onClick={() => void act({ action: 'restore', preset: preset!.id, revision: preset!.revision })}>还原本插件对预设的修改</button></details>
    </>}
  </section>;
}
