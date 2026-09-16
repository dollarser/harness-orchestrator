# 验证记录与兼容性

## 基线

- 日期：2026-09-16
- 开发依赖：DSH agent/commands/subagent/session/llm/settings/client-ui-* `0.1.5-rc.1`，Cordis `4.0.2`。
- 同时核对上游源代码提交 `0d1f50007f9bca3f52b06e1c3074fa14d5fb0720` 的命令、子 Agent 和插件契约。此提交不是本项目实测的完整 DSH 发行版。
- TypeScript strict 检查本项目；`skipLibCheck` 跳过上游声明文件内部检查。
- `.npmrc` 使用 legacy-peer-deps：上游类型包声明大量宿主运行时 peers，开发项目安装类型和测试所需依赖，不安装第二套完整 DSH 宿主。Host 运行时使用 schemastery 构造设置 schema，DSH 服务由宿主注入；浏览器运行时仅请求宿主 React，其他交互通过 Cordis 服务完成。

## 自动检查

`npm run check` 执行 TypeScript 编译、Node 测试和本地 Markdown 链接检查。

本次 macOS / Node.js 25.9.0 本地检查结果：干净 `npm ci` 成功；33 项 Node 测试通过；7 项 Playwright 浏览器交互测试通过；本地文档链接检查、`npm pack --dry-run` 和 overlay 生成检查通过。归档 Python 原型在前一次重构中通过的 3 项测试未在本次 UI 变更重复执行。没有把这些本地结果写成远端 CI 或真实模型验收结果。

覆盖范围：

- 成功路径、默认两次预算、修复后 NEEDS_REVIEW、三次预算后的最终复核。
- 失败验证不能被 Reviewer PASS 覆盖；修复收到实际失败证据。
- 预算在调用前持久化；启动失败、空/异常输出、非法产物和重复任务 ID。
- Planner/Reviewer 可见改动检测；超大 patch 拒绝静默截断。
- 取消、启动取消、子 Agent 超时、结果清理。
- 真实 Git 仓库中的新增文本/二进制文件、staging 保持、脏工作区拒绝、符号链接锁、产物路径限制。
- 真实宿主进程的 argv、启动失败、输出限制、超时和取消。
- 首次空配置、启用校验、设置持久化前拒绝非法值、原生 revision 冲突、继承重置、不可在线更改状态目录。
- Browser lazy factory 和原生 slot 注册；页面保存/刷新/放弃/重置、无效输入、并发更新、静默拒绝与网络错误、只读/未就绪状态、桌面和窄屏深色布局。
- 真实 Cordis 加载插件、命令注册/撤销；假 DSH provider + 真实 Git 的完整状态机，运行中保存配置不会改变该任务，而下一任务读取新值；以及卸载时在途 child 取消与锁释放。

GitHub Actions 配置 macOS/Linux × Node 22/24 的 Node 检查和独立 Ubuntu Chromium 交互检查；远端 CI 是否通过应以对应提交的运行结果为准。

## 真实 DSH Web 页面冒烟

使用本机 DSH 源码版本 `0.1.6-alpha.1-213cd1a-dirty`（HEAD `213cd1aa23b75a9597dfff50c0a9c75bedd87d69`，包含本地修改），另起隔离的 `DSH_HOME` 和端口，加载本插件构建后的 overlay。没有改动用户原来运行的 DSH 实例或个人模型配置。

已在真实 Settings 对话框中确认 Smart Dev 导航栏目，填写测试模型 ID / 验收命令并保存，页面显示宿主确认成功，浏览器刷新后再次进入页面仍保留保存值。数据通过真实 DSH settings 服务和文件 provider 持久化。模型 ID 为测试值，没有发起模型调用；此验证不证明模型可用，也不等于对干净上游该提交或所有 DSH 版本的完整兼容性验收。

## 未完成的验收

尚未用真实 Codex 认证和本地模型完成端到端编码任务。测试中的 subagent provider、命令服务和父 Agent 使用契约替身；Cordis 容器、Git 和验证进程是真实的。不能据此声称所有宿主版本都兼容。

尚未验证真实模型费用、任务胜率、完整后端遥测、Claude Code Worker、崩溃恢复、OS 级 Reviewer 只读和长期稳定性。安装指南需要使用者配置真实模型 ID、权限和目标项目验证命令后完成最后一段验收。

本次配置页开发没有读取模型密钥、发起付费模型任务或自动修改 DSH 个人配置。
