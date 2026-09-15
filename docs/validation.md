# 验证记录与兼容性

## 基线

- 日期：2026-09-16
- 开发依赖：DSH agent/commands/subagent/session/llm `0.1.5-rc.1`，Cordis `4.0.2`。
- 同时核对上游源代码提交 `0d1f50007f9bca3f52b06e1c3074fa14d5fb0720` 的命令、子 Agent 和插件契约。此提交不是本项目实测的完整 DSH 发行版。
- TypeScript strict 检查本项目；`skipLibCheck` 跳过上游声明文件内部检查。
- `.npmrc` 使用 legacy-peer-deps：上游类型包声明大量宿主运行时 peers，开发项目仅安装需要的类型依赖。编译输出对 DSH 只有类型引用，没有运行时代码导入，不安装第二套 DSH 宿主。

## 自动检查

`npm run check` 执行 TypeScript 编译、Node 测试和本地 Markdown 链接检查。

本次 macOS / Node.js 25.9.0 本地检查结果：干净 `npm ci` 成功；28 项测试通过；本地文档链接检查、`npm pack --dry-run` 和 overlay 生成检查通过。归档 Python 原型的 3 项原测试仍通过。没有把这些本地结果写成远端 CI 或真实模型验收结果。

覆盖范围：

- 成功路径、默认两次预算、修复后 NEEDS_REVIEW、三次预算后的最终复核。
- 失败验证不能被 Reviewer PASS 覆盖；修复收到实际失败证据。
- 预算在调用前持久化；启动失败、空/异常输出、非法产物和重复任务 ID。
- Planner/Reviewer 可见改动检测；超大 patch 拒绝静默截断。
- 取消、启动取消、子 Agent 超时、结果清理。
- 真实 Git 仓库中的新增文本/二进制文件、staging 保持、脏工作区拒绝、符号链接锁、产物路径限制。
- 真实宿主进程的 argv、启动失败、输出限制、超时和取消。
- 真实 Cordis 加载插件、命令注册/撤销；假 DSH provider + 真实 Git 的完整状态机，以及卸载时在途 child 取消与锁释放。

GitHub Actions 配置 macOS/Linux × Node 22/24；远端 CI 是否通过应以对应提交的运行结果为准。

## 未完成的验收

尚未用真实 DSH Web 会话、Codex 认证和本地模型完成端到端任务。测试中的 subagent provider、命令服务和父 Agent 使用契约替身；Cordis 容器、Git 和验证进程是真实的。不能据此声称所有宿主版本都兼容。

尚未验证真实模型费用、任务胜率、完整后端遥测、Claude Code Worker、崩溃恢复、OS 级 Reviewer 只读和长期稳定性。安装指南需要使用者配置真实模型 ID、权限和目标项目验证命令后完成最后一段验收。

本次重构没有读取模型密钥、发起付费模型任务或自动修改 DSH 个人配置。
