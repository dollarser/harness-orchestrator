# 使用指南

## 准备

macOS/Linux、Node.js 22+、Git，并满足所用 DSH 版本要求。开发类型基线为 DSH `0.1.5-rc.1`；实际测试边界见 [验证记录](validation.md)。

```bash
git clone https://github.com/dollarser/harness-orchestrator.git
cd harness-orchestrator
npm ci
npm run check
```

在已有 DSH 的模型设置中配置可用模型。Backend 可选 spawn、fork、Codex 和 Claude Code。spawn/fork 使用 DSH 模型；外部后端使用各自的模型、认证和权限配置。

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

1. 选择执行 Backend，并阅读下方说明；spawn/fork 再选择模型 Provider 和模型。
2. 按需设置超时；spawn/fork 的工具范围留空时继承 DSH 工具与权限。外部后端不接收这些参数。
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
| workerModel.provider / model | 显式选择的 DSH 模型路由；仅 spawn/fork 使用 |
| workerToolAllow | 可选工具过滤；仅 spawn/fork 使用，空列表继承宿主可用工具 |
| agentTimeoutMs | Agent 执行超时，默认 30 分钟 |
| stateRoot | 仓库外绝对目录，仅部署配置；同工作区的插件实例应共享 |

配置文件只使用上表字段；旧规划/审查 provider、预算、验证命令和命令超时字段均已删除，保留这些字段会被拒绝。

## 运行

在 DSH 选择一个已有目录（普通目录、空目录或 Git 仓库子目录均可），输入：

```text
/smart-dev 为解析函数补充空输入处理，并根据项目情况检查改动
```

Agent 会自行决定执行路径。用户也可在任务中明确要求测试、独立审查或跳过特定检查，插件不增加固定策略。

已有未提交改动可以保留；插件记录任务开始前的快照并提醒 Agent 保护现有工作。同一工作区不要同时启动其他写入任务，本插件锁无法约束其他程序。

## 结果

- **FINISHED**：Agent 正常返回；直接阅读报告判断完成项、检查结果和阻塞事项。这不是独立验收证书。
- **FAILED**：启动、执行、超时或记录异常；查看 error.txt、Agent 结果和工作区差异。
- **CANCELLED**：取消或卸载；等待子 Agent 清理，保留已有改动。

`report.md` 保存原始报告，`before.json` / `last.json` 说明是否有 Git 快照；有 Git 时保存对应 patch，普通目录不强制初始化 Git。无首次提交的仓库也可以记录快照，仓库子目录只记录该目录内改动。差异包括原有改动，不一定全由当前任务产生。插件不会自动提交、推送或回滚；Agent 是否执行这些动作取决于用户任务与宿主权限。

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

## 主 DSH Agent 自主调度多个后端

普通对话由主 DSH Agent 处理。要让它调用 Codex / Claude Code，需要两层配置：

1. 当前 profile 安装后端 bundle（与宿主契约匹配），例如：

   ```bash
   pnpm dsh plugin --profile web add @deepseek-ai/dsh-subagent-codex@0.1.5-rc.1
   pnpm dsh plugin --profile web add @deepseek-ai/dsh-subagent-claude-code@0.1.5-rc.1
   ```

2. 在实际使用的 Agent 预设中启用 `@deepseek-ai/dsh-tool-subagent` 对应条目：

   ```yaml
   - id: tool-subagent-codex
     name: '@deepseek-ai/dsh-tool-subagent'
     config:
       provider: codex
       toolName: subagent_codex
       backgroundMode: one-shot
       maxDepth: provider-managed
   - id: tool-subagent-claude-code
     name: '@deepseek-ai/dsh-tool-subagent'
     config:
       provider: claude-code
       toolName: subagent_claude_code
       backgroundMode: one-shot
       maxDepth: provider-managed
   ```

若预设已含这些条目，只移除对应 `disabled: true`，不要重复注册。保持各后端自己的权限与认证设置；安装包不等于认证成功。重启宿主后使用该预设，新会话更容易确认配置已经载入。

主 Agent 可依据工具说明选择调用。可把 [可选分工指引](../examples/delegation-guidance.md) 加入 persona prefix，建议复杂任务请 Codex 规划或复核，实现可以自行完成或委派 Claude Code；不规定固定顺序。模型可能仍选择自行处理。

例如直接发普通消息：

```text
在当前目录创建一个新项目，实现一个待办应用。你自行决定实现方式；
如果任务复杂，可以请 Codex 提供计划，再自行实现或委派 Claude Code。
是否初始化 Git、做哪些检查，由你根据项目需要决定。
```

普通对话的主 Agent 可持续利用聊天上下文并调度多个后端；`/smart-dev` 仍是将整项任务交给当前选定的一个后端，主会话等待其返回。选 spawn/fork 时，该执行 Agent 也可使用其预设允许的委派工具。Backend 选项列表是支持的标准选项，不是宿主实时安装清单。

无需先创建仓库。若项目目录还不存在，可先选已有父目录，让主 Agent 在里面创建项目子目录；插件不会替 Agent 决定 `git init` 或创建提交。新建的子目录不会自动成为当前 DSH 会话的 workspace，后续可手动切换。
