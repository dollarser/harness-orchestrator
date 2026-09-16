# 架构：Agent 决策，插件管理运行

## 职责

`/smart-dev` 是 DSH 的原生命令。父会话通过 `runMaintenance` 暂停并发工作，插件在其工作区启动一个配置好的 DSH 子 Agent。Agent 自行决定如何规划、实现、检查、修复与审查；不解析计划或审查 JSON，不强制调用其他角色。

| Agent 决策 | 插件运行保障 |
|---|---|
| 是否需要计划、测试、构建、额外审查 | 配置快照、工作区并发锁 |
| 选择检查命令、发现问题后如何修复 | 超时、取消、等待子 Agent 清理 |
| 何时停止、如何报告完成或阻塞 | 原子运行记录、Git 快照、原样呈现报告 |

`src/core` 仅通过 `invoke`、`save`、`progress` 管理一次执行。`src/dsh` 适配 DSH 服务，`src/host` 管理本机副作用。插件没有单独执行验证命令的入口；检查沿用 Agent 的 DSH 工具权限。

## 生命周期

```text
CREATED → RUNNING → FINISHED
              ├→ FAILED
              └→ CANCELLED
```

- FINISHED：子 Agent 以 completed 返回非空文本。报告可包含“未完成”或“阻塞”；插件不会据此伪造 PASS。
- FAILED：启动、执行或记录异常，或返回截断/异常/空结果。不会自动重试。
- CANCELLED：用户取消或插件卸载引发取消。已产生改动保留。
- 超时中断子 Agent，报告 FAILED 和超时原因。

这是一组进程生命周期状态，不是任务策略阶段。旧 `DONE` / `NEEDS_REVIEW` 及两次强模型预算规则不再适用。

## 子 Agent

Backend 提供四个标准选项：spawn（独立上下文）、fork（继承已完成对话）、codex、claude-code。spawn/fork 要求模型选择能力；配置工具过滤时还要求 toolFilter。Codex/Claude Code 不发送 agentOptions、toolFilter 或 maxDepth，模型和权限由后端自身管理。外部后端是否安装在执行前检查，不用静态下拉框假装探测结果。

插件不再强制 maxDepth=1，不禁止调用其他 Agent。能否委派、使用哪些工具，仍受宿主的工具配置、委派能力和深度限制约束。旧版本已保存的工具列表不会自动扩大。

每次启动传入父 Agent、任务文本、所选模型和取消信号。读取 `run.result` 后必须等待 `run.dispose()`；清理失败保留工作区锁，避免在子任务可能仍写入时启动另一个任务。启动阶段的取消清理由 backend 契约负责。

## 工作区和记录

- 当前支持 macOS/Linux 的已有普通目录、空目录和 Git 子目录，不要求 Git 或首次提交。
- 允许脏工作区，不自动 stage、stash、commit、reset；提示 Agent 保留已有工作。
- `stateRoot` 必须解析到仓库外；符号链接通过真实路径规整。
- 已有仓库内的目录按仓库根路径共用锁；非 Git 目录按真实目录路径加锁。锁只约束同一 stateRoot 下的本插件任务；普通目录之间的父子重叠、运行中创建 Git 后改变锁边界及其他程序写入不由此锁完整覆盖。
- 开始与结束时尽力记录 `before.json` / `last.json`。Git 可用时另存 patch；非 Git 或快照失败记录 unavailable 及原因，不阻止 Agent 执行。清理未确认成功时不采集可能仍在变动的最终快照。
- 快照使用临时 Git index，不修改用户暂存区；无 HEAD 时以空树为基线，子目录只记录该目录内的改动。两份 patch 相对于各自采集时 HEAD（如有），可能包含先前改动。任务中新建 Git 可在结束时捕获；提交后的变化需结合 Git 历史。
- 不自动回滚；崩溃遗留锁需要核对 owner.json、进程和子任务后人工处理。

记录目录：

```text
config.json / task.txt
before.json / last.json
before.patch / last.patch      Git 可用时
agent.prompt.txt / agent.result.json
report.md                     正常返回的原始报告
state.json / event-<n>.json
error.txt / snapshot.error.txt 按需生成
```

未聚合子 Agent 的全部工具遥测、token 或费用。运行记录不构成独立验证证明。

## 配置

配置仅包含执行 Agent 的 backend、模型、可选工具范围、超时和产物目录。旧流程字段已删除，不提供迁移或兼容逻辑；已有配置需要移除旧字段。插件拒绝未知字段，避免误以为配置仍在生效。

配置变更只影响下次执行，stateRoot 仍只能通过部署修改，以免运行中更换锁目录。恢复默认值重置当前页面字段。

设计决策见 [ADR-002](decisions/002-agent-owned-execution.md)。

## 主会话与后端工具

安装 backend 只注册宿主 provider，不自动赋予主 Agent 调用工具。主 Agent 所用预设必须启用对应 tool-subagent 条目，角色分工通过可选提示提供。普通聊天可以由主 Agent 自主调度；/smart-dev 仍将任务交给一个已选后端，不把主会话改成硬编码路由器。详见 [使用指南](usage.md)。
