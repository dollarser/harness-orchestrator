# 使用指南

## 1. 准备

macOS/Linux、Node.js 22+、Git，并满足 DSH 发行版的要求。插件以 DSH `0.1.5-rc.1` 为基线，请匹配原生 bundle 版本。

```bash
git clone https://github.com/dollarser/harness-orchestrator.git
cd harness-orchestrator
npm ci
npm run check
```

尚未安装 DSH 时：

```bash
npm install -g @deepseek-ai/dsh@0.1.5-rc.1
dsh web
```

在 Settings → Models 配置实际可用的本地模型/兼容网关，记下 provider ID 和 model ID。先单独验证该模型在 DSH 中的工具调用能力。

创建过 Web profile 后，停止 DSH 进程，安装原生 Codex backend：

```bash
dsh plugin --profile web add @deepseek-ai/dsh-subagent-codex@0.1.5-rc.1
```

它注册 provider，本插件通过服务调用，无需为父模型开放自由调用 Codex 的工具。认证和原生权限由该 backend 的宿主配置负责；本插件不读取或复制登录密钥。模型 API Key 留在 DSH 凭据管理中，不写入本仓库。

参考：[模型配置](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/guide/providers.md)、[Codex backend](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/subagent/subagent-codex/README.md)。

## 2. 配置

复制 [样例](../examples/config.json) 到仓库外，例如 `$HOME/.config/smart-dev.json`，修改：

| 字段 | 含义 |
|---|---|
| workerModel.provider / model | DSH 已配置好的路由，避免继承可能昂贵的父模型 |
| workerToolAllow | 精确工具名；样例只给 bash，可读写文件与运行检查 |
| verifyCommands | 目标项目真实的验收命令；不能为空，不展开 shell |
| maxStrongCalls | 2 = 规划＋审查；3 = 允许修复后再次复核 |
| maxFixRounds | 修复次数上限，默认 1 |
| stateRoot（可选） | 仓库外的绝对目录；同一 workspace 的插件实例应共享 |

Worker 要求 backend 支持模型覆盖、工具过滤和深度限制，默认 spawn。工具名称必须存在于当前 profile；未知名称由 DSH 拒绝。允许 shell 不构成全局费用或文件系统沙箱。

生成 overlay（输出文件必须不存在）：

```bash
node scripts/create-overlay.mjs \
  "$HOME/.config/smart-dev.json" \
  "$HOME/.config/smart-dev.patch.yml"
dsh web --patch "$HOME/.config/smart-dev.patch.yml"
```

overlay 是 YAML 可读取的 JSON，包含构建后插件的绝对路径。移动项目后需重新生成。不修改上游 DSH，不新增自定义 Web 页面。

## 3. 运行

准备干净且有提交的独立 Git worktree，在 DSH Web UI 选择它的根目录作为当前会话 workspace，输入：

```text
/smart-dev 为解析函数补充空输入处理，并添加回归测试
```

不要同时在同一 worktree 开启其他编码任务。执行时父会话由 maintenance 占用，终端日志显示阶段，结束返回结果和产物路径。

第一版固定包含规划/审查，不自动跳过简单任务的 Codex。首次选小任务，确认模型、权限、工具和验证命令可用。

## 4. 结果

- DONE：所有配置的验证通过，最新版本获得无未解决 issue 的 PASS。
- NEEDS_REVIEW：最新改动跑过验证，但审查预算不足；测试也可能未通过，查看 verification 和 last.patch 后人工处理。
- FAILED：查看 error.txt、角色结果和 last.patch；代码可能已修改。
- CANCELLED：请求取消，正常情况下已等待子 Agent 清理，保留现有改动。

DONE 不代表已提交或推送，验证充分性仍取决于测试和 acceptance criteria。目前不支持恢复命令；不要在 NEEDS_REVIEW 的脏工作区重跑整个流程来假装续跑。

## 5. 排错

- Missing subagent provider：确认 bundle 安装在当前 profile，并重启该 profile。
- UNKNOWN_MODEL / 凭据缺失：先单独验证同一 DSH 模型路由。
- Worker backend must support：该 backend 不具备要求的能力，暂不直接替换为 Claude Code。
- Workspace is dirty：使用独立干净 worktree；不自动 stash。
- Workspace already locked：检查锁内 owner.json，确认进程及子任务停止后人工处理。PID 可能被复用，崩溃锁不自动删除。
- Planner/Reviewer changed repository state：保留改动并失败；检查 diff，并配置原生 Harness 权限。
- Output / patch limit：缩小任务或测试输出量；不会靠静默截断获得通过。

验证命令直接运行于宿主，不是 DSH 工具沙箱。完整限制见 [架构](architecture.md)。
