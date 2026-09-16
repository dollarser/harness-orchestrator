# 使用 Smart Dev

## 接入

打开“设置 → Smart Dev”，选择用户 Agent 预设。若只有系统预设，先在 DSH 的 Agent 预设管理中复制。

- 后端缺失或尚未加入 Profile：点击“安装并启用”。
- 后端已安装且加入 Profile：点击“启用工具”。
- 重启 DSH，打开该预设的会话，刷新页面检查“当前宿主”和“运行中的 Agent”。
- 点击登录检测；未知或未登录时在终端使用 `codex login` 或 `claude auth login` 完成登录。Codex 检测使用后端包依赖的 CLI；如果系统 `codex` 版本不同，请检查实际后端使用的账户配置。
- 可选开启分工指引。普通对话直接提任务。

后端各自管理模型、凭据和权限。这里不提供重复的模型选择，也不会授予额外写入权限。

## 分工

主 Agent 可选择自己实现、调用原生 DSH 子 Agent、委派给 Codex 或 Claude Code。没有强制的 Codex 规划 → Claude 执行顺序。外部 Agent 不继承完整对话，应由主 Agent 提供任务背景、约束及预期产物。

配置页显示的是工具可见性，并不证明主 Agent 一定会采用合理分工，也不证明任务已成功完成。

## 失败处理

| 状态 | 处理 |
|---|---|
| 已安装、Profile 未配置 | 安装并启用会补充 Bundle，不升级已安装版本 |
| Profile 已配置、宿主未注册 | 重启并检查 DSH 启动日志 |
| 工具 YAML 已启用、运行实例未显示 | 重启后打开正确预设，再刷新 |
| 登录未知 | 检查 CLI 路径和登录；页面不展示原始认证输出 |
| pnpm 失败 | 按错误中的固定命令在 Profile 目录重试；备份在 `.smart-dev/install-*` |
| 预设被外部修改 | 刷新重新确认；已管理文件的还原需手工合并 `.smart-dev/preset-*.json` |

## 停用与卸载

1. 为相关预设关闭分工指引。
2. 如需撤销插件启用的工具，点击“还原本插件对预设的修改”。没有管理记录的原有工具不会被禁用。
3. 从 Profile 的 `cordis.patch.yml` 移除 `smart-dev` Host 入口。
4. 通过 `dsh plugin --profile web remove @dollarser/dsh-smart-dev` 删除包，重启 DSH。

Codex / Claude Code 后端包和原本启用的工具继续保留。`.smart-dev` 下的本地记录可以按需保留；移除插件本身即停止运行时提示词注入。

旧版 `workerProvider`、`workerModel` 等字段不再接受。旧 settings 存储和任务产物不参与新版运行，无需为它们提供兼容逻辑。
