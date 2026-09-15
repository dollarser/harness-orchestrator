# ADR-001：用 DSH 原生插件落实路线 A

- 日期：2026-09-16
- 状态：接受；真实模型端到端验收待完成

## 问题

原方案让 DSH 在路线 A 负责总控，路线 B 才转移到 Helix。初始 Python CLI 在外部管理状态机、通过进程调用 DSH，复现了角色分工却改变了总控归属。README 将其称为路线 1，造成代码与设计不一致。

## 决策

主实现为 TypeScript DSH 插件，提供 `/smart-dev` 人类命令。固定代码决定状态与预算，复用 DSH subagent backend。编排核心以窄接口隔离运行时，策略不散落到 profile 或模型提示词中。

Python 原型移至 legacy/python 并冻结。原两路线长文保留在 docs/archive 并标记历史状态。当前说明统一以 README、usage、architecture、validation 为准。

## 取舍

- 相比 Skill：预算、失败处理和完成条件可测试。
- 相比插件包裹 Python：避免双运行时的状态与取消协调。
- 相比独立 CLI：依赖 DSH 服务接口，暂不提供宿主无关的 CI 调度入口。
- 保留迁移空间：复用 Artifact 与 Policy 语义；跨语言迁移不是零成本。

本次只实现固定流程、显式 Worker、预算、产物校验、验证门槛、锁、部分改动留证与清理。暂不做 Router、Claude Code Worker、自动 worktree、PR 自动化、续跑和费用汇总。

真实收益须由后续任务验证；历史文档关于模型强弱和成本优势的描述不是测量结论。
