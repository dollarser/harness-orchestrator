# Smart Dev · 在 DSH 中使用 Codex 和 Claude Code

Smart Dev 是 [DeepSeek Harness（DSH）](https://github.com/deepseek-ai/deepseek-harness) 的插件。安装后，你可以在 DSH 设置中接入 Codex 和 Claude Code，再通过普通对话让主 Agent 按任务需要使用它们。

你可以：

- 一键安装并启用 Codex、Claude Code 后端，查看登录状态。
- 为不同模式分别启用或禁用工具。
- 编辑分工指引，例如建议 Codex 分析方案、Claude Code 实现，也可以让主 Agent 自己决定。
- 为标准、PTC、极简、创造等内置模式创建可使用这些工具的“协作版”。

## 一、安装 Smart Dev

### 准备条件

- 已能通过 `pnpm dsh web` 启动 DSH。
- 已安装 Node.js 22 或更新版本、npm、pnpm 和 Git。
- 能访问 npm 包仓库，以便安装依赖和两个后端插件。

以下步骤适用于从 DSH 源码目录启动 Web 界面、使用 `web` Profile 的情况。本机已在 DSH `0.1.6-alpha.1` 上验证。

### 1. 获取安装包

在终端执行一次：

```sh
git clone https://github.com/dollarser/harness-orchestrator.git
cd harness-orchestrator
npm ci
npm pack
```

这会自动构建并生成 `dollarser-dsh-smart-dev-0.10.1.tgz`。记下该文件的完整路径，例如 `/Users/你的用户名/harness-orchestrator/dollarser-dsh-smart-dev-0.10.1.tgz`。

### 2. 安装到 DSH

进入你平时运行 `pnpm dsh web` 的 DSH 源码目录，执行以下命令，将路径替换为上一步生成的文件：

```sh
pnpm dsh plugin --profile web add /完整路径/dollarser-dsh-smart-dev-0.10.1.tgz
```

安装命令会自动登记插件自带的启动配置，无需编辑 YAML 或填写插件入口路径。如果你使用其他 Profile，请将命令中的 `web` 改为对应名称。

### 3. 重启 DSH

在启动 DSH 的终端按 `Ctrl+C` 停止服务，然后重新运行：

```sh
pnpm dsh web
```

打开 DSH 网页，进入 **设置 → Smart Dev**。看到配置页即表示插件已加载。

## 二、接入 Codex 和 Claude Code

在 **设置 → Smart Dev** 中：

1. **选择模式（Agent 预设）。** 如果使用标准、PTC、极简或创造模式，点击“创建协作版并启用”，会自动创建副本并接入两个后端。原模式保留。
2. **安装工具。** 对自己的预设，按需点击“安装并启用 Codex”或“安装并启用 Claude Code”。已安装时点击对应的“启用工具”。两个工具可以只开一个。
3. **重启 DSH 服务。** 安装后端或修改工具开关后，仅刷新网页不足以生效。
4. **选择对应模式开始会话。** 使用内置模式副本时，在新会话输入框上方选择“原模式名称 · 协作版”。配置页中的选择不会自动切换对话模式。
5. **检查状态与登录。** 返回 Smart Dev 点击“刷新状态”，确认后端“已注册”，并在“运行中的 Agent”中看到对应工具。点击“检测 Codex 登录”或“检测 Claude Code 登录”。

如果尚未登录，在终端完成相应 CLI 的登录，再回到页面检测：

```sh
codex login
claude auth login
```

两个后端使用各自的账户和模型配置。Smart Dev 不代替你登录，也不提供模型订阅。若终端提示命令不存在，或登录后仍检测失败，请查看[登录与故障处理](docs/usage.md)。

## 三、开始使用

在普通 DSH 对话中直接描述任务，无需输入 `/smart-dev`。例如：

> 帮我实现登录功能。先让 Codex 分析方案，再由你或 Claude Code 完成实现，并根据修改内容决定如何检查。

也可以只说目标：

> 帮我修复这个项目的启动错误，并确认能正常启动。

主 Agent 会结合任务、可用工具和分工指引，决定自己完成还是委派。没有固定的规划、实现、测试顺序；工具启用后，也不意味着每项任务都会调用它。

工具按钮和指引开关操作成功后自动保存，页面会提示保存结果和生效时间；指引文字需要单独点击“保存指引”。

### 修改分工指引

在 Smart Dev 中选择预设，打开“注入分工指引”，编辑“指引内容”并点击“保存指引”。例如：

> 复杂任务优先考虑让 Codex 分析方案，让 Claude Code 执行。简单修改直接完成。根据实际改动决定是否需要测试和审查。

每个预设独立保存。可以“恢复默认指引”，也可以关闭注入。**修改指引无需重启**，下次组装提示词时生效；保存文字不会自动打开注入开关。

### 暂时停用某个工具

选择预设，点击“禁用 Codex 工具”或“禁用 Claude Code 工具”，然后重启 DSH。再次使用时点击“启用工具”并重启。

禁用只影响所选预设，已安装的后端仍保留；它不会中止正在执行的子 Agent 任务。

## 常见问题

| 问题 | 怎么处理 |
|---|---|
| 设置中没有 Smart Dev | 确认安装到启动时使用的 Profile，并重启 DSH |
| 已安装，但显示“未注册” | 重启 DSH 服务，而不只是刷新网页 |
| 显示已启用，但对话没有工具 | 确认对话使用的是所配置的预设；重启后刷新状态 |
| 创建了协作版，但当前会话没变化 | 新建会话，在模式选择器中选择协作版 |
| 主 Agent 没有调用 Codex 或 Claude Code | 启用工具并不强制调用；可在任务中明确提出委派要求 |
| 已登录是否表示一定能完成任务？ | 登录检测仅确认认证状态，实际调用还取决于账户、网络及后端配置 |

## 更多帮助

- [使用、登录、故障处理与卸载](docs/usage.md)
- [配置页与状态含义](docs/configuration-page.md)
- [已验证的功能与使用边界](docs/validation.md)

开发和实现细节见[架构说明](docs/architecture.md)与[设计决定](docs/decisions/003-multi-agent-setup.md)。
