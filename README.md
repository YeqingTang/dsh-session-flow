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
| 会话重命名 | 自定义标题显示层覆盖，随时恢复原名 |
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
- **原生会话页**：会话顶部「会话流」标签直接回顾当前会话；对话页左侧轮次悬浮条跳转任意轮次；标题 hover ✎ 重命名。
- **实时**：运行中会话点「实时」，3 秒自动刷新。

## 致谢

- **[DeepSeek Harness (dsh)](https://github.com/deepseek-ai/deepseek-harness)** —— 运行基础。
- **[@deepseek-ai/dsh-session-persistence-jsonl](https://github.com/deepseek-ai/deepseek-harness)** —— zstd 多帧扫描算法（`lib/archive.js` 借鉴，MIT 许可）。
- **[dsh-web-ui（@linxin666 全家桶）](https://github.com/zhu1090093659/dsh-web-ui)** —— 侧边栏入口与面板挂载模式参照，未复制代码。
- **[dsh-webui-market-plugin](https://www.npmjs.com/package/@sanqi-normal/dsh-webui-market-plugin)** —— 插件市场机制与分发渠道。

本插件遵循 Apache-2.0 许可，使用第三方代码时保留其原始许可声明。

## 许可

[Apache-2.0](LICENSE)
