/** Standard DSH backend choices; registration and credentials are checked by the Host. */
export const backends = [
  { id: 'spawn', title: 'DSH Agent · 独立上下文', dshModel: true,
    description: '新建一个 DSH 子 Agent，使用下方选择的模型。只接收本次任务，不继承此前对话，适合独立实现或分析。' },
  { id: 'fork', title: 'DSH Agent · 继承对话', dshModel: true,
    description: '从当前会话已完成的对话创建子 Agent，使用下方模型。适合依赖前文的继续开发或审查；不包含仍在生成的当前轮内容。' },
  { id: 'codex', title: 'Codex · 原生后端', dshModel: false,
    description: '通过 DSH 的 Codex 后端执行任务，使用它自己的模型、认证和权限设置。可用于规划、实现或审查，不固定角色；需要安装并注册 Codex 后端。' },
  { id: 'claude-code', title: 'Claude Code · 原生后端', dshModel: false,
    description: '通过 DSH 的 Claude Code 后端执行任务，使用它自己的模型、认证和权限设置。可用于实现、分析或审查，不固定角色；需要安装并注册 Claude Code 后端。' },
] as const;
export function backendChoice(id: string) { return backends.find(backend => backend.id === id); }
