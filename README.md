# Smart Dev · DSH 多 Agent 接入助手

Smart Dev 为 DeepSeek Harness 接通 Codex、Claude Code：检测后端状态、安装依赖、启用选定 Agent 预设的原生工具，并按需注入分工指引。

**在普通 DSH 对话中提出任务，由主 Agent 自主决定直接完成或委派。** 本插件不接管任务，不提供 `/smart-dev` 命令，不规定规划、检查、修复或审查流程。

## 能力

- 配置页分别显示包安装、Profile Bundle、当前后端注册、预设工具配置及运行中 Agent 的工具可见性。
- 选择用户 Agent 预设，一键安装并启用 Codex / Claude Code；不改其他预设、模型或权限配置。
- 检测 CLI 登录状态，只返回概括结果；交互登录由用户在终端完成。
- 分工指引可按预设编辑、保存、恢复默认，通过独立 system prompt section 注入，保留原有 persona。可随时关闭，插件卸载后停止注入。
- 修改预设前保存可还原记录；有外部编辑时拒绝自动覆盖。安装前备份 Profile 清单与锁文件。

## 使用

打开 **DSH 设置 → Smart Dev**：

1. 选择要接入的用户 Agent 预设。内置模式点击“创建协作版并启用”，自动复制为用户预设并启用两个后端与分工指引。
2. 点击“安装并启用”，或为已安装后端点击“启用工具”。
3. 按提示重启 DSH，打开对应预设会话，再刷新检查实际工具可见性。
4. 检测登录，根据页面命令完成 CLI 登录。
5. 可选开启“注入分工指引”。在普通对话中发起任务。

例如：

> 帮我实现登录功能。你可以让 Codex 分析方案，自己或 Claude Code 实现；按实际需要决定如何检查。

指引只建议可能的分工，主 Agent 可直接执行，也可以采用其他组合。工具可见或已登录不代表模型调用已经验证成功。

## 安装插件

```sh
npm ci
npm run check
npm run test:ui
npm pack
# 在 DSH 源码目录运行，tarball 使用绝对路径：
pnpm dsh plugin --profile web add /absolute/path/dollarser-dsh-smart-dev-0.8.0.tgz
```

该包提供 Host 插件与 Web 配置页。需要在 Profile 的 `cordis.patch.yml` 中添加 Host 入口：

```yaml
- insert:
    - id: smart-dev
      name: '/absolute/path/to/profile/node_modules/@dollarser/dsh-smart-dev/dist/dsh/plugin.js'
      config: {}
```

安装在 Profile 内时自动定位 Profile；源码直接加载时必须配置 `profileDir`。之后重启 `pnpm dsh web --no-open`。

也可用 `node scripts/create-overlay.mjs examples/config.json /tmp/smart-dev.patch.yml` 生成一次性 overlay。示例中的 Profile 路径需要自行替换。

## 文档

- [使用、登录与卸载](docs/usage.md)
- [配置页与状态解释](docs/configuration-page.md)
- [架构与边界](docs/architecture.md)
- [验证记录](docs/validation.md)
- [设计决定：接入助手](docs/decisions/003-multi-agent-setup.md)

## 开发

```sh
npm ci
npm run check
npm run test:ui
npm pack --dry-run
```
