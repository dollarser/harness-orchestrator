# 架构

## 职责

DSH 主 Agent 拥有任务决策权。原生 `subagent_codex`、`subagent_claude_code` 工具和对应后端拥有委派执行生命周期。Smart Dev 只准备接入条件、显示状态和提供可选指引。

| 层 | 实现 |
|---|---|
| Web | `src/client/SettingsPage.tsx` 展示状态和明确的操作按钮 |
| Host 插件 | `src/dsh/plugin.ts` 注入 DSH 服务，注册经过 DSH Connection 认证的 RPC 与独立 prompt section |
| 接入管理 | `src/host/manager.ts` 负责 Profile 包管理、原生预设启用、CLI 状态探测 |
| YAML 修改 | `src/host/preset.ts` 保留文档结构、注释、动态标签，不执行 YAML 中的 JS |
| 状态持久化 | Profile 下 `.smart-dev/preferences.json` 与预设备份日志 |

## 状态分开验证

包可解析、Bundle 在 Profile 清单中、后端在当前 `ctx.subagents` 注册、工具在预设 YAML 中启用、工具对运行中的 Agent 可见，是五个不同事实。页面逐项显示，不从磁盘配置推断当前工具可见。

CLI 登录检测只检查标准 CLI 的账户状态。不证明用户自定义后端配置、网络、额度或真实模型请求有效。未知状态不会标记成已登录。

## 提示词

在 `systemPrompt` 注册一个可撤销的 `smart-dev:delegation` section。每次组装时使用 DSH `agentPreset` session projection 获取当前预设，并读取所选预设开关和已保存的文字。不会直接修改 persona；切换预设后也不会继续依赖创建时的 header。无 Agent 的诊断组装不注入指引。

关闭开关后下次组装不包含指引。Cordis 卸载该插件会移除 section 与 API；已进入会话历史的文字不会被回溯删除。

自定义文字存于 Profile 的 `.smart-dev/guidance-texts.json`，按预设 ID 索引；没有自定义值时使用内置默认文字。保存使用内容修订校验，防止跨页面覆盖。注入关闭模板插值，用户文字中的花括号保持原样。

## 安装和配置修改

安装操作只接受 Codex / Claude Code 两个固定包名，首次安装固定 `0.1.5-rc.1`，不升级已存在的版本。使用 Profile 内 `pnpm add --save-exact`，遵循用户已有 pnpm 供应链设置。插件不放宽构建脚本、权限或后端 sandbox 配置。

一键安装启用先校验目标预设，再安装、注册 Bundle、启用工具。安装成功但启用失败会报告部分完成；包管理不是原子事务，不自动覆盖回滚 pnpm 可能写入的文件。备份可供手工恢复。

只写入 DSH roster 返回的 user 预设。存在对应原生工具行时只取消静态禁用；没有时添加 one-shot 原生工具行。动态禁用条件、禁用父组或重复配置需要先明确处理。内置模式通过 DSH 原生 `agentPresets.copy()` 复制整个预设目录（含附属文件），再启用副本中的工具。源预设不修改。

预设修改有读取版本校验、进程内串行化和 Profile 级操作锁。记录完整 before/after 文本供精确还原；外部修改后停止自动还原，避免丢失用户内容。外部编辑器并不遵循该锁，文件读取与原子 rename 之间仍有极小竞态窗口。

## 已知边界

- 支持本地 DSH Web/Profile；安装需要宿主 PATH 上有 pnpm，Claude 登录检测需要 claude CLI。
- 工具和后端变更统一提示重启；不承诺热加载成功，不在安装中自动重启服务。
- 提示词开关由本进程持有；不要同时运行多个 DSH 进程写同一 Profile。
- 异常退出可能遗留 `.smart-dev/operation.lock`；确认没有安装进程后才能删除。
- 还原功能仅还原本插件实际修改的工具配置，保留原来启用的工具和已安装依赖。
- 不提供任务超时、目录锁、Git 快照或额外报告；这些不属于接入助手职责。
