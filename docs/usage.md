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

### 通过原生配置页（推荐）

在本插件仓库构建后，生成首次安装 overlay（输出文件必须不存在）：

```bash
npm run build
node scripts/create-overlay.mjs --configure "$HOME/.config/smart-dev.patch.yml"
```

在 DSH 源码目录，使用带 overlay 的命令重新启动 Web：

```bash
pnpm dsh web --patch "$HOME/.config/smart-dev.patch.yml"
```

使用全局安装的 DSH 时，将 `pnpm dsh` 换成 `dsh`。`--patch` 应写在 `--no-open`、`--port` 等 Web 参数之前。已运行的 `pnpm dsh web` 不会因为构建本仓库自动加载新插件，需要通过上述命令重新启动。

打开 **Settings → Smart Dev**：

1. 在「模型与执行」填写 DSH 已配置模型的 provider ID、model ID 和精确工具名。
2. 填写目标项目的验证命令，例如 `[["npm", "test"], ["npm", "run", "lint"]]`。
3. 按需调整预算和超时，打开「启用工作流」，点击「保存配置」。

首次安装默认禁用，可以保存尚未完成的配置；启用时宿主必须校验通过。配置存入 DSH settings 服务；默认文件 provider 写入 `$DSH_HOME/settings.yaml` 的 `smart-dev` 节。保存后的修改用于下一次任务，正在运行的任务继续使用自己的配置快照。模型凭据仍在 DSH 管理，页面不保存 API Key。

页面支持放弃修改、恢复部署默认值和并发修改提示。模型和 provider ID 为手动输入，页面不证明它们已安装或可调用；执行前仍由 provider 能力检查把关。更多说明见 [配置页](configuration-page.md)。

### 从文件预配置（兼容原入口）

复制 [样例](../examples/config.json) 到仓库外，例如 `$HOME/.config/smart-dev.json`，填写模型、工具和验收命令后生成：

```bash
node scripts/create-overlay.mjs \
  "$HOME/.config/smart-dev.json" \
  "$HOME/.config/smart-dev.patch.yml"
```

此方式载入后默认启用。文件配置成为部署默认值，页面保存的用户配置覆盖它；「恢复部署默认值」移除页面字段的用户覆盖。

| 字段 | 含义 |
|---|---|
| workerModel.provider / model | DSH 已配置好的路由，避免继承可能昂贵的父模型 |
| workerToolAllow | 精确工具名；页面每行一个，样例只给 bash |
| verifyCommands | 目标项目真实验收命令；启用时不能为空，不展开 shell |
| maxStrongCalls | 2 = 规划＋审查；3 = 允许修复后再次复核 |
| maxFixRounds | 修复次数上限，默认 1 |
| agentTimeoutMs / commandTimeoutMs | 单个 Agent / 单条验证命令的超时，毫秒 |
| stateRoot（仅部署配置） | 仓库外的绝对目录；同一 workspace 的插件实例应共享 |

Worker 要求 backend 支持模型覆盖、工具过滤和深度限制，默认 spawn。工具名称必须存在于当前 profile；未知名称由 DSH 拒绝。允许 shell 不构成全局费用或文件系统沙箱。

overlay 是 YAML 可读取的 JSON，包含构建后插件的绝对路径。移动项目后需重新生成。配置页挂载在 DSH 原生 Settings 内，无需单独启动前端服务。

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

- 找不到 Smart Dev 页面：确认已重新构建、通过 overlay 启动，当前 Web profile 包含原生 settings 和 UI 服务；首次更新后刷新浏览器。
- smart-dev is disabled：在 Settings → Smart Dev 填好必填项、启用并保存。
- Missing subagent provider：确认 bundle 安装在当前 profile，并重启该 profile。
- UNKNOWN_MODEL / 凭据缺失：先单独验证同一 DSH 模型路由。
- Worker backend must support：该 backend 不具备要求的能力，暂不直接替换为 Claude Code。
- Workspace is dirty：使用独立干净 worktree；不自动 stash。
- Workspace already locked：检查锁内 owner.json，确认进程及子任务停止后人工处理。PID 可能被复用，崩溃锁不自动删除。
- Planner/Reviewer changed repository state：保留改动并失败；检查 diff，并配置原生 Harness 权限。
- Output / patch limit：缩小任务或测试输出量；不会靠静默截断获得通过。

验证命令直接运行于宿主，不是 DSH 工具沙箱。完整限制见 [架构](architecture.md)。
