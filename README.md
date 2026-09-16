# harness-orchestrator

**DeepSeek Harness 原生任务插件**：输入 `/smart-dev <task>`，由执行 Agent 自主决定如何完成任务。

```text
用户任务 → DSH 执行 Agent → 工作结果与运行记录
              自主选择规划、检查、修复和审查
```

从 0.4.0 起，不再用代码强制规划、执行、验证、审查的顺序，也不要求预先填写验证命令或限制修复轮次。Agent 根据任务、项目说明和实际结果决策；插件负责运行保障。

## 当前实现

- 原生 **Settings → Smart Dev**：选择模型、可选工具范围、超时和启用开关。
- 默认使用 DSH `spawn`；一次任务交给一个执行 Agent。插件不强制调用 Codex，也不需要额外安装 Codex backend。
- 检查由 Agent 通过 DSH 工具自主执行；结果报告说明改动、实际检查、未完成事项和不确定性。
- 工作区锁、父会话 maintenance、取消、超时、子 Agent 清理及仓库外运行记录。
- 允许已有未提交改动，保存开始前后的 Git 差异，不自动 stash、重置或提交。
- `FINISHED` 表示 Agent 正常返回，**不是插件独立验收通过**。
- 有离线运行、真实 Git/进程、Cordis 生命周期和页面交互测试；尚未完成真实模型编码任务验收。

DSH 仍是运行宿主。旧固定流程被 [ADR-002](docs/decisions/002-agent-owned-execution.md) 替代，原 Python CLI 留在 [legacy/python](legacy/python/README.md)。

## 开发

Node.js 22+、macOS/Linux、Git；DSH 自身要求以使用版本为准。

```bash
npm ci
npm run check
npm run test:ui
```

开发类型固定为 DSH `0.1.5-rc.1`、Cordis `4.0.2`，使用宿主服务，不捆绑第二套 DSH 运行时。见 [验证记录](docs/validation.md)。

## 接入 DSH

1. 在 DSH 中配置模型并选择目标 Git worktree 根目录。
2. 构建本项目，生成 overlay：`node scripts/create-overlay.mjs --configure /绝对路径/smart-dev.patch.yml`。
3. 在 DSH 源码目录运行 `pnpm dsh web --patch /绝对路径/smart-dev.patch.yml`。
4. 在 **Settings → Smart Dev** 选择模型、启用并保存。
5. 输入 `/smart-dev <task>`。

详见 [使用指南](docs/usage.md)、[配置页](docs/configuration-page.md) 和 [配置样例](examples/config.json)。

## 代码结构

```text
src/core/       任务提示与运行生命周期，不依赖 DSH
src/dsh/        命令、设置、子 Agent 适配与清理
src/client/     原生设置页与模型选择
src/shared/     配置类型与校验
src/host/       工作区锁、Git 快照、原子文件和进程管理
tests/         运行保障、宿主集成与页面测试
docs/          当前设计、使用说明、决策和验证边界
legacy/python/ 原外部编排原型
```

## 边界

Agent 决策质量取决于模型、上下文和工具。插件没有强制验收门槛、费用预算或独立 Reviewer；不能把正常返回等同于任务已经完成。

权限和嵌套委派由 DSH 管理；可选工具过滤只收窄可用工具，允许 shell 不构成文件系统或费用沙箱。锁只协调共享状态目录的本插件任务，不能阻止其他编辑器写入。

当前仍需有 HEAD 的 Git 工作区，不提供自动续跑、自动 worktree 创建、完整嵌套 trace/费用汇总或自动回滚。详见 [架构](docs/architecture.md)。
