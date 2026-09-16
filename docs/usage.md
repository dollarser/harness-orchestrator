# 使用指南

## 准备

macOS/Linux、Node.js 22+、Git，并满足所用 DSH 版本要求。开发类型基线为 DSH `0.1.5-rc.1`；实际测试边界见 [验证记录](validation.md)。

```bash
git clone https://github.com/dollarser/harness-orchestrator.git
cd harness-orchestrator
npm ci
npm run check
```

在已有 DSH 的模型设置中配置可用模型。默认 backend 为 spawn；本插件不再依赖 Codex backend。其他原生 backend 只有支持显式模型选择时才可替换。

## 安装和配置

在插件仓库生成首次安装 overlay（目标文件必须不存在）：

```bash
node scripts/create-overlay.mjs --configure "$HOME/.config/smart-dev.patch.yml"
```

在 DSH 源码目录启动：

```bash
pnpm dsh web --patch "$HOME/.config/smart-dev.patch.yml"
```

全局安装可用 `dsh` 替代 `pnpm dsh`。overlay 指向插件构建后的绝对路径，移动目录后需重新生成。已安装打包版本时，应更新当前 profile 的安装包，而不只是重新构建本仓库。

打开 **Settings → Smart Dev**：

1. 依次选择模型 Provider 和模型。
2. 按需设置超时；工具范围留空时继承 DSH 可用工具与权限。
3. 启用 Smart Dev 并保存。无需验证命令或单独配置 Planner / Reviewer。

模型凭据仍在 DSH 管理，页面不保存密钥。新模型可通过“刷新模型列表”加载，目录外旧值保留并提示。完整行为见 [配置页](configuration-page.md)。

也可复制 [配置样例](../examples/config.json) 到仓库外，替换模型路由后生成预配置 overlay：

```bash
node scripts/create-overlay.mjs "$HOME/.config/smart-dev.json" "$HOME/.config/smart-dev.patch.yml"
```

非空有效部署配置默认启用，页面的用户配置覆盖部署值。

| 文件字段 | 含义 |
|---|---|
| workerProvider | 执行 Agent backend，默认 spawn |
| workerModel.provider / model | 显式选择的 DSH 模型路由 |
| workerToolAllow | 可选工具过滤；空列表继承宿主可用工具 |
| agentTimeoutMs | Agent 执行超时，默认 30 分钟 |
| stateRoot | 仓库外绝对目录，仅部署配置；同工作区的插件实例应共享 |

配置文件只使用上表字段；旧规划/审查 provider、预算、验证命令和命令超时字段均已删除，保留这些字段会被拒绝。

## 运行

在 DSH 选择有 HEAD 的 Git worktree 根目录，输入：

```text
/smart-dev 为解析函数补充空输入处理，并根据项目情况检查改动
```

Agent 会自行决定执行路径。用户也可在任务中明确要求测试、独立审查或跳过特定检查，插件不增加固定策略。

已有未提交改动可以保留；插件记录任务开始前的快照并提醒 Agent 保护现有工作。同一工作区不要同时启动其他写入任务，本插件锁无法约束其他程序。

## 结果

- **FINISHED**：Agent 正常返回；直接阅读报告判断完成项、检查结果和阻塞事项。这不是独立验收证书。
- **FAILED**：启动、执行、超时或记录异常；查看 error.txt、Agent 结果和工作区差异。
- **CANCELLED**：取消或卸载；等待子 Agent 清理，保留已有改动。

`report.md` 保存原始报告，`before.patch` / `last.patch` 保存任务前后相对各自 HEAD 的工作区差异。包括原有改动，不一定全由当前任务产生。插件不会自动提交、推送或回滚；Agent 是否执行这些动作取决于用户任务与宿主权限。

没有自动续跑命令；再次调用是一项新任务，Agent 可查看当前工作区继续处理。

## 排错

- 找不到页面：确认已加载插件、宿主包含原生 settings/UI 服务，更新后刷新页面。
- smart-dev is disabled：选择模型、启用并保存。
- Missing subagent provider / must support model selection：检查当前 profile 的 backend 和能力。
- 模型未列出：在 DSH 模型设置核对 Provider 和模型后刷新；不要把模型名称填作 Provider。
- Workspace already locked：核对 owner.json、进程和子任务是否已结束，再人工处理崩溃锁。
- Child disposal failed：清理未确认完成，锁会保留，先处理仍在运行的子任务。
- 快照失败：查看 snapshot.error.txt，结合 Agent 报告和 Git 历史检查改动。

权限、记录和运行边界见 [架构](architecture.md)。
