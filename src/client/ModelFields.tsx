import * as React from 'react';
import type { ModelCatalog } from '@deepseek-ai/dsh-api-remotes/client';

export type LoadModelCatalog = () => Promise<ModelCatalog>;
type Props = {
  provider: string;
  model: string;
  loadCatalog: LoadModelCatalog;
  onChange: (provider: string, model: string) => void;
};

/** Read the Host's advisory catalog without changing the saved route on refresh. */
export function ModelFields({ provider, model, loadCatalog, onChange }: Props) {
  const [catalog, setCatalog] = React.useState<ModelCatalog>();
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string>();
  const [revision, refresh] = React.useReducer(n => n + 1, 0);
  React.useEffect(() => {
    let active = true;
    setLoading(true); setError(undefined);
    void Promise.resolve().then(loadCatalog).then(value => {
      if (active) setCatalog(value);
    }).catch((reason: unknown) => {
      if (active) setError(reason instanceof Error ? reason.message : String(reason));
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [loadCatalog, revision]);

  const providers = [...new Set([
    ...(catalog?.routableProviders ?? []),
    ...(catalog?.groups.map(group => group.id) ?? []),
    ...(catalog?.failures.map(failure => failure.id) ?? []),
  ])];
  const group = catalog?.groups.find(group => group.id === provider);
  const failure = catalog?.failures.find(failure => failure.id === provider);
  const missingProvider = !!provider && !providers.includes(provider);
  const missingModel = !!model && !group?.models.some(entry => entry.id === model);
  const label = (id: string, name?: string) => name && name !== id ? `${name} (${id})` : id;

  return <div className="sd-full">
    <div className="sd-grid">
      <label className="sd-field">模型 Provider
        <select aria-label="模型 Provider" value={provider} disabled={loading || !catalog}
          onChange={event => onChange(event.target.value, '')}>
          <option value="">请选择模型 Provider</option>
          {missingProvider && <option value={provider}>{provider}（当前未列出，保留原值）</option>}
          {providers.map(id => <option key={id} value={id}>{label(id,
            catalog?.groups.find(group => group.id === id)?.name
              ?? catalog?.failures.find(failure => failure.id === id)?.name)}</option>)}
        </select>
        <small>选择 DSH 中已配置的模型服务。</small>
      </label>
      <label className="sd-field">模型
        <select aria-label="模型" value={model} disabled={loading || !group?.models.length}
          onChange={event => onChange(provider, event.target.value)}>
          <option value="">{provider ? '请选择模型' : '请先选择模型 Provider'}</option>
          {missingModel && <option value={model}>{model}（当前未列出，保留原值）</option>}
          {group?.models.map(entry => <option key={entry.id} value={entry.id}>{label(entry.id, entry.name)}</option>)}
        </select>
        <small>执行此任务的 Agent 使用该模型，自行决定工作步骤。</small>
      </label>
    </div>
    <button type="button" className="sd-refresh" disabled={loading} onClick={refresh}>刷新模型列表</button>
    {loading && <p role="status">正在读取 DSH 模型列表…</p>}
    {error && <p className="sd-alert" role="alert">模型列表读取失败：{error}。原配置已保留，请重试。</p>}
    {!loading && !error && catalog && <>
      {providers.length === 0 && <p role="status">尚无模型 Provider，请先在 Settings → Models 配置模型服务，再刷新列表。</p>}
      {failure && <p className="sd-alert" role="alert">此 Provider 的模型列表读取失败：{failure.message}。请检查 Settings → Models 后重试。</p>}
      {!failure && provider && !group?.models.length && <p role="status">此 Provider 暂无已列出的模型，请检查 Settings → Models 后刷新。</p>}
      {(missingProvider || missingModel) && <p className="sd-note">当前模型配置未出现在目录中，原值仍保留。请核对模型服务，或重新选择模型。</p>}
      {catalog.failures.length > 0 && !failure && <p role="status">部分 Provider 的模型列表读取失败，其他已加载模型仍可选择。</p>}
    </>}
  </div>;
}
