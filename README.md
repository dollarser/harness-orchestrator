# harness-orchestrator

**DeepSeek Harness 原生编排插件**：通过 `/smart-dev <task>` 执行固定的编码工作流。

```text
Codex 规划 → DSH 本地 Worker → 确定性验证 → Codex 审查
                                  ↑           │
                                  └── 本地修复 ←┘
```

DSH 提供命令入口、父会话和子 Agent；插件代码负责状态机、预算、验证和产物。父模型无需额外推理来决定下一阶段。

## 当前实现

- TypeScript 插件，包名 `@dollarser/dsh-smart-dev`。
- 默认 Worker 使用 DSH `spawn`，必须显式配置模型和工具列表。
- 默认强模型预算 **2 次**：规划＋首次审查。修复后重新验证，预算不足返回 `NEEDS_REVIEW`；配置 3 次才允许一次修复后的复核。
- 没有验证命令、异常或空 Agent 输出、格式错误的计划/审查都不能产生 `DONE`。
- 使用干净的独立 Git worktree；产物放在仓库外，工作区锁串行化使用同一状态目录的插件任务。
- 有离线状态机、真实 Git/进程和 Cordis 加载测试。**尚未完成真实 Codex＋本地模型端到端验收。**

主实现对应原设计的**路线 A：DSH 作为总控**。原独立 Python CLI 已归档到 [legacy/python](legacy/python/README.md)，不再是主入口。

## 开发与检查

Node.js 22+、macOS/Linux、Git；DSH 宿主自身要求以其发行版为准。

```bash
npm ci
npm run check
```

开发类型依赖固定为 DSH `0.1.5-rc.1`，Cordis `4.0.2`。编译结果不导入 DSH 运行时代码，使用宿主提供的服务。见 [验证记录](docs/validation.md)。

## 安装到 DSH

1. 构建本项目，安装 DSH 的 Codex subagent bundle。
2. 在 DSH 配置实际可用的本地模型，选择干净的目标 Git worktree 根目录。
3. 根据 [examples/config.json](examples/config.json) 配置模型、工具和目标项目验证命令。
4. 生成 overlay，在 DSH Web profile 中加载，然后输入 `/smart-dev <task>`。

完整命令见 [使用指南](docs/usage.md)。示例模型 ID 是占位符，必须替换。

## 代码结构

```text
src/core/       状态机、提示词、产物校验；不依赖 DSH
src/dsh/        命令注册、配置解析、subagent 适配
src/host/       Git 证据、工作区锁、原子产物写入、验证进程
tests/         状态机、适配器、Cordis 生命周期与 Git/进程测试
examples/      配置样例
docs/          当前架构、使用说明、决策与验证边界
legacy/python/ 原 Python 外部编排原型
```

## 边界

预算计量规划/审查的启动次数，不是 token、费用或全部嵌套调用。工具 allowlist 和委派深度收窄 Worker 调用路径，但允许 shell 就不能声称拥有全局费用沙箱。

规划/审查的只读约束是提示词加 Git 状态变化检测，**不是操作系统级禁止写入**。各原生 Harness 仍使用自己的权限配置。插件不自动回滚、提交或推送目标项目。

没有自动续跑、跨状态目录的分布式锁、完整后端 trace/usage 汇总、自动 worktree 创建或 Claude Code Worker 适配。见 [架构](docs/architecture.md) 和 [ADR-001](docs/decisions/001-dsh-plugin.md)。
