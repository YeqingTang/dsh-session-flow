# Changelog

本插件所有显著变更。格式遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，
版本遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## [Unreleased]

### 待发布准备
- 补充 LICENSE（Apache-2.0）、CHANGELOG
- `package.json` 增加 `repository` 字段
- 发布文件白名单收窄：仅 `lib/` + `cordis.patch.yml` + `README.md`（本地开发文档与验证脚本不进公开包）

## [0.1.0] - 2026-08

### 新增（M1–M6 完整功能）

**归档与总览**
- M1 归档扫描与索引：zstd 多帧解码（Node 内置 `node:zlib`，零第三方依赖）+ JSONL 解析；增量索引缓存（mtime+size 跳过，版本化自动重扫）
- M2 总览工作台：会话卡片、结构化搜索（`tool:` / `file:` / `err:` + 自由文本）、工作区 tabs、5 种排序、工具 Top 统计、问题会话筛选、空会话隐藏

**详情与导航**
- M3 折叠详情页：回合默认折叠、渐进披露（思考/正文/工具）、真实时间序渲染、注入信息分类、结论徽标、四标签右侧导航（用户/工具/错误/检索）、选中回合高亮
- 轻量加载：回合摘要先行 + 按需展开（`getTurn`）；双通道派生缓存（内存 LRU + 磁盘持久化，512MiB 上限自动修剪）

**血缘与检索**
- M4 子代理血缘树：离线档案树（parentSession）+ 运行时实时树（subagents API）双通道，工具行一键直达
- M5c 内容级检索：总览筛会话 + 详情页全文扫描定位（闪烁高亮）

**摘要引擎**
- M5 会话摘要：规则摘要（零请求实时组装）+ LLM 摘要（DSH 模型通道）
  - 多任务信息源：以回合为任务单元 + 全程均匀采样（防摘要退化成「最近几轮」）
  - 落盘复用 + 新对话过期提示（`summaryStale`）；reasoning 兜底；失败透传真实原因
  - 迷你 Markdown 渲染

**导出**
- M5d 导出报告：ZIP 分卷 Markdown（`00-概览.md` + 按体积滚动的时间线分卷，单卷 ≤700KB）
  - 手写 ZIP（deflate + CRC32，零依赖）；代码块使用规范；正文 HTML 污染防护（`mdBodyEsc` 状态机）

**实时跟踪**
- M6 实时通道：`sessions.history` → `derive` → 折叠视图，3 秒轮询刷新
  - 运行中判定用事件结构信号（未闭合回合/步骤/工具），不依赖时间戳
  - 运行中回合呼吸高亮 + 动态生成标志；实时视图保留最近 3 个历史回合 + 当前回合

**其他**
- 缓存管理面板（索引 + 时间线分类清理，仅限插件私有目录）

[0.1.0]: https://github.com/YeqingTang/dsh-session-flow/releases/tag/v0.1.0
