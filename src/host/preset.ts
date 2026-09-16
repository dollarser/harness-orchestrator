import { parseDocument, isSeq, isMap, YAMLMap, YAMLSeq } from 'yaml';
import { backend, type BackendId } from '../shared/types.js';

// Parse custom !!js tags as inert YAML scalars. Never evaluate preset code here.
function document(text: string) {
  const doc = parseDocument(text, { logLevel: 'silent' });
  if (doc.errors.length || !isSeq(doc.contents)) throw new Error('预设必须是有效的 Cordis YAML 列表');
  return doc;
}
function rows(seq: YAMLSeq): YAMLMap[] {
  const result: YAMLMap[] = [];
  for (const item of seq.items) {
    if (!isMap(item)) continue;
    result.push(item);
    const nested = item.get('config');
    if (isSeq(nested)) result.push(...rows(nested));
  }
  return result;
}
function matches(row: YAMLMap, id: BackendId) {
  const config = row.get('config');
  return row.get('name') === '@deepseek-ai/dsh-tool-subagent' && isMap(config)
    && config.get('provider') === id && config.get('toolName') === backend(id).tool;
}
export function enabledBackends(text: string): BackendId[] {
  const doc = document(text);
  const enabled = new Set<BackendId>();
  function walk(seq: YAMLSeq, active: boolean) {
    for (const item of seq.items) {
      if (!isMap(item)) continue;
      const disabled = item.get('disabled', true);
      const on = active && (disabled === undefined || (typeof disabled === 'object' && disabled !== null && 'value' in disabled && disabled.value === false && !('tag' in disabled && disabled.tag)));
      for (const id of ['codex', 'claude-code'] as const) if (on && matches(item, id)) enabled.add(id);
      const nested = item.get('config'); if (isSeq(nested)) walk(nested, on);
    }
  }
  walk(doc.contents as YAMLSeq, true);
  return [...enabled];
}
export function enableBackend(text: string, id: BackendId): string {
  if (enabledBackends(text).includes(id)) return text;
  const doc = document(text);
  const found = rows(doc.contents as YAMLSeq).filter(row => matches(row, id));
  if (!found.length) {
    if (rows(doc.contents as YAMLSeq).some(row => { const config = row.get('config'); return isMap(config) && config.get('toolName') === backend(id).tool; })) throw new Error('对应工具名称已被其他配置占用');
    (doc.contents as YAMLSeq).add(doc.createNode({ id: `smart-dev-${id}`, name: '@deepseek-ai/dsh-tool-subagent', config: { provider: id, toolName: backend(id).tool, backgroundMode: 'one-shot', maxDepth: 'provider-managed' } }));
    return doc.toString();
  }
  if (found.length !== 1) throw new Error('发现重复的原生子 Agent 工具配置，请先消除重复');
  const row = found[0]!;
  const disabled = row.get('disabled', true);
  if (disabled && typeof disabled === 'object' && 'tag' in disabled && disabled.tag) throw new Error('工具使用动态禁用条件，请先在预设中明确其启用方式');
  row.delete('disabled');
  const output = doc.toString();
  if (!enabledBackends(output).includes(id)) throw new Error('工具所在分组被禁用，请先启用该分组');
  return output;
}

export function disableBackend(text: string, id: BackendId): string {
  const doc = document(text);
  const found = rows(doc.contents as YAMLSeq).filter(row => matches(row, id));
  if (!found.length) return text;
  for (const row of found) row.set('disabled', true);
  const output = doc.toString();
  return enabledBackends(text).includes(id) ? output : text;
}
