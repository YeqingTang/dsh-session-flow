# dsh-session-flow — DSH 会话回顾与归档插件

> **中文** | [English](README.en.md)

把 DSH 会话的原始消息流重构成「可折叠的信息流 + 会话级汇总」：每个会话变成一张档案卡，跨工作区回顾、检索、导出。官方会话视图（Trajectory / Chat）长于正在发生的微观检查，本插件补足**事后回顾 / 归档 / 洞察**这一层。

## 界面一览

| 总览工作台 | 会话流标签页 |
|---|---|
| ![总览工作台](assets/screenshots/overview.png) | ![会话流标签页](assets/screenshots/session-flow-tab.png) |
| 会话卡片墙：标题、状态、结论摘要行、首个任务；hover ✎ 行内重命名 | 原生会话页内嵌「会话流」标签：当前会话直接回顾 |

| 轮次悬浮条 | 跨会话全文检索 |
|---|---|
| ![轮次悬浮条](assets/screenshots/turn-rail.png) | ![跨会话全文检索](assets/screenshots/fulltext-search.png) |
| 对话页左侧轮次导航：收拢短横条 ⇄ 展开条目卡，一键跳转任意轮次 | 总览自由文本搜索触发全文模式：跨工作区召回，命中直达定位 |

| 详情并入右栏 | 折叠详情页 |
|---|---|
| ![详情并入右栏](assets/screenshots/dock-right.png) | ![折叠详情页](assets/screenshots/folded-detail.png) |
| 详情并入官方右侧面板：主对话与会话流并行，拖拽调宽 | 回合默认折叠，展开按真实时间序；右侧四标签导航 |

## 功能

| 能力 | 说明 |
|---|---|
| 总览工作台 | 会话卡片（状态/错误/耗时）+ 结论摘要行；排序、筛选、工作区 tabs |
| 结构化搜索 | `tool:` `file:` `err:` 前缀 + 自由文本 |
| 折叠详情页 | 回合折叠成「用户发言+结论」，展开按真实时间序；按需加载 |
| 四标签导航 | 用户发言 / 工具 / 错误 / 检索，点击定位高亮 |
| 血缘树 | 子代理派生关系树（离线档案 + 运行时实时双通道） |
| 双模式摘要 | 规则摘要（零开销实时组装）+ LLM 摘要（落盘复用、新对话提示重生成） |
| 实时跟踪 | 运行中会话 3 秒轮询，呼吸高亮 + 生成标志 |
| ZIP 导出 | 概览 + 时间线分卷 Markdown 报告 |
| 会话重命名 | 与官方标题同一数据源（log-backed），双向实时同步，随时改名 |
| 健康监控 | 活跃 / 工具执行中 / 静默中 / 疑似卡死四级分类；总览徽标 + 详情实时条 |
| 头部健康芯片 | 会话页顶栏模式标识右侧，竖条收拢 ⇄ 悬浮展开状态卡，点击直达详情 |
| 会话流标签页 | 原生会话页内嵌标签，与工作台互跳 |
| 轮次悬浮条 | 对话页左侧轮次跳转（仅对话页显示） |
| 跨会话全文检索 | 内容级召回，命中直达会话流标签页定位 |
| 详情并入右栏 | 与主对话双视角并行 |
| 缓存管理 | 索引/时间线缓存查看与清理（不影响 DSH 数据） |

## 安装

```sh
# 插件市场搜索 dsh-session-flow，或：
dsh plugin add dsh-session-flow
dsh plugin add github:YeqingTang/dsh-session-flow
```

安装后**重启 DSH Web 服务**并**硬刷新浏览器**（Ctrl+Shift+R），侧边栏出现「会话流」入口即成功。

环境要求：DSH Web GUI（最新稳定版）；Node.js ≥ 22.19（内置 zstd 解码，零第三方依赖）。

## 使用

- **总览**：侧边栏「会话流」→ 全部会话卡片。搜索支持 `tool:` / `file:` / `err:` 前缀；自由文本 ≥2 字符自动追加跨会话全文检索结果。
- **详情**：点卡片进入。回合默认折叠，点回合头展开；右侧四标签导航定位；顶部可生成 LLM 摘要、导出 ZIP、并入右栏、查看血缘。
- **原生会话页**：会话顶部「会话流」标签直接回顾当前会话；对话页左侧轮次悬浮条跳转任意轮次；标题 hover ✎ 重命名（与官方标题实时同步）。
- **健康状态**：顶栏模式标识右侧的健康芯片（竖条：绿=活跃 / 黄=工具执行中 / 红=疑似卡死），悬浮展开看详情，点击直达会话流详情页；总览卡片与详情实时条同步显示徽标。
- **实时**：运行中会话点「实时」，3 秒自动刷新。

## 外部依赖与运行条件

- **运行环境**：DSH Web GUI（0.1.2-rc.1 ~ 0.2.1-rc.2，逐版本兼容声明见 `package.json` 的 `dsh.compatibility.dshReleases`）；Node.js ≥ 22.19（使用 Node 内置 zstd 解码，无第三方解码库）。
- **运行依赖**：仅 `@deepseek-ai/schemastery`（DSH 官方同源 schema 库；用于设置表单 schema 与 `.volatile()` 热更新）。
- **无生命周期脚本**：不声明 `preinstall` / `install` / `postinstall` / `prepare`，安装过程不执行任何脚本。
- **以 Bundle Patch 方式挂载**：`cordis.patch.yml` 只插入本插件自身条目，不禁用、替换或遮蔽任何官方组件。
- **独立第三方项目**，非 DeepSeek 官方组件；包名不使用 `@deepseek-ai/*` 命名空间。

## 权限与数据边界

| 访问范围 | 用途 | 边界 |
|---|---|---|
| 读 `~/.dsh/sessions/**` | 解析会话存档（zstd/JSONL）生成索引与时间线 | 只读，不修改、不删除会话文件 |
| 写 `~/.dsh/session-flow/**` | 插件私有索引、时间线缓存、重命名映射 | 只写此目录；缓存管理面板只清理这里 |
| 本机 `POST /api/session-flow` | 索引 / 详情 / 检索 / 导出 / 健康检查 | 注册在 DSH 自带 webServer 上，沿用宿主登录鉴权；服务端不主动对外发起网络请求 |
| 读官方会话列表投影（`sessions.list`） | 列表标题、重命名同步 | 只读；不修改官方状态 |
| 宿主 `llm` 服务（可选） | LLM 摘要 | 只经宿主已配置的模型调用，不引入额外供应商 |

- 不收集遥测、不上报使用数据；ZIP 导出为本地文件。
- 设置保存写入 DSH profile patch（`~/.dsh/profiles/<profile>/cordis.patch.yml`），与官方设置同一存储。

## 已知限制与风险

- **会话存档是宿主实现细节**：dsh 每次存档代际迁移（v1→v2→v3→v4）都可能改变读取口径。本插件按「代际号最大」自适应，并为 v4 的 `isError` 变化做了双口径兼容，但**不保证**未来全新格式零改动。
- **索引为增量缓存**：首次安装 / 升级后首次打开会全量扫描一次；数百 MB 的超大会话首扫较慢，不影响宿主数据。
- **「详情并入右栏」**依赖官方右栏标签页体系（dsh ≥ 0.1.5）或旧 details 列（≤ 0.1.4）；自定义外壳两者都没有时，按钮会禁用并提示原因。
- **LLM 摘要**需要你已在 DSH 中配置可用模型；未配置时仅规则摘要可用。
- **DOM 级增强**（轮次悬浮条 / 官方 rail 增强 / 健康芯片）通过 DOM 观察实现（官方未提供扩展槽位）；宿主大版本若调整 DOM 结构可能静默失效，需随版本适配。
- **不接管、不修改任何官方 UI 行为**；与第三方皮肤 / 布局插件共存时，可能因布局差异需要额外适配。

## 致谢

- **[DeepSeek Harness (dsh)](https://github.com/deepseek-ai/deepseek-harness)** —— 运行基础。
- **[@deepseek-ai/dsh-session-persistence-jsonl](https://github.com/deepseek-ai/deepseek-harness)** —— zstd 多帧扫描算法（`lib/archive.js` 借鉴，MIT 许可）。
- **[dsh-web-ui（@linxin666 全家桶）](https://github.com/zhu1090093659/dsh-web-ui)** —— 侧边栏入口与面板挂载模式参照，未复制代码。
- **[dsh-webui-market-plugin](https://www.npmjs.com/package/@sanqi-normal/dsh-webui-market-plugin)** —— 插件市场机制与分发渠道。

本插件遵循 Apache-2.0 许可，使用第三方代码时保留其原始许可声明。

## 许可

[Apache-2.0](LICENSE)
