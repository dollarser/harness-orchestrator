# Smart Dev 配置页

## 入口与安装

入口为 **DSH Web → Settings → Smart Dev**。本插件包含 Host 和浏览器两个构建产物；浏览器部分通过 DSH `settings.section` 插槽注册。只需加载插件，无需额外部署网站。

首次安装可用 `node scripts/create-overlay.mjs --configure <绝对输出路径>` 生成默认禁用的 overlay，然后用 `pnpm dsh web --patch <绝对输出路径>` 从 DSH 源码目录启动。已安装并使用旧 overlay 的用户重新构建插件、重启 DSH 并刷新浏览器即可。完整步骤见 [使用指南](usage.md)。

## 可编辑内容

- 启用或禁用新任务。
- Planner / Reviewer provider、Worker backend、Worker 模型路由。
- 工具白名单，每行一个精确工具名。
- 强模型调用数、修复轮数。
- 验证命令，使用 JSON 二维 argv 数组，不解析 shell 命令行。
- Agent 和验证命令超时，单位毫秒。

Provider 和模型 ID 手动填写；页面不会自动安装 backend、创建模型连接或探测真实调用能力。API Key 不属于此页，继续由 DSH Models / credentials 管理。

## 保存与覆盖

配置按「schema 默认值 → overlay 部署值 → DSH 用户设置」合成。页面只为修改的字段写入用户覆盖，一次保存以原始 revision 原子提交。默认文件存储为 `$DSH_HOME/settings.yaml` 的 `smart-dev` 节；自定义 settings provider 的存储位置由该 provider 决定。

- **保存配置**：宿主校验通过并返回可确认的配置后显示成功。保存承诺已结算并不代表成功，页面还会检查 DSH 返回的镜像，避免拒绝响应被误报为成功。
- **放弃修改**：丢弃本页草稿，载入当前宿主值。
- **恢复部署默认值**：移除可编辑字段的用户覆盖，重新继承 overlay 和 schema。首次空配置部署会恢复到禁用、未选择模型的状态。
- **并发修改**：其他页面的更新不会覆盖正在编辑的草稿；页面提示冲突，需载入最新配置后重新编辑。保存途中的竞争也由宿主 revision 检查拒绝。
- **只读或远程 memory 连接**：不能保存；不会把浏览器临时状态冒充宿主持久化。

禁用时可保存未填写完的模型和命令；启用时必须满足完整运行配置校验。每次任务启动时复制一份配置快照；修改设置或关闭启用开关不会取消已经开始的任务。

当前设置属于 DSH 宿主，不是按 workspace 分组的项目配置。同一 DSH Home 下的配置使用者应协调；切换项目时尤其需要检查验收命令。跨多个进程写同一设置文件的行为由 DSH provider 决定，本插件不增加跨进程事务保证。

## 状态目录

`stateRoot` 在页内只读，由部署配置确定。宿主 schema 拒绝在线改为其他路径，避免仍有任务持有旧目录锁时启动第二个写者。需要修改时，先停止使用旧目录的所有任务，再修改 overlay 并重新加载；同一 workspace 的实例继续共享同一目录。

## 开发与验证

```bash
npm ci
npm run check
npx playwright install chromium
npm run test:ui
```

`test:ui` 用真实页面组件和隔离的 settings-scope 替身验证交互；宿主测试使用真实 Cordis / DSH SettingsProvider 检查校验、revision 和生命周期。它们与真实 DSH UI 冒烟、真实 Codex＋本地模型端到端任务是不同验证层，见 [验证记录](validation.md)。
