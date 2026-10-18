# Changelog

本插件所有显著变更。格式遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，
版本遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## [1.5.0] - 2026-10-18

### 新增
- **会话变更清单（P1-A）**：详情页统计条下方新增「变更清单」折叠区——本会话**写入文件 / 修改文件 / 执行命令**三组清单（各带回合号，点击回合号展开并定位该回合）；默认收拢，无变更不渲染
- **文件↔会话反查（P1-A）**：总览新增「文件反查」入口——输入路径片段，列出所有编辑过匹配路径的会话（按文件分组、会话按时间倒序、点击直达详情）；同一文件被 ≥2 个会话修改时显示「⚠ 多会话」标记（并行 agent 冲突预警）

### 修复
- **侧边栏「会话流」入口对齐官方 panelRow 规范**：对齐官方 `dsh-client-ui-sidebar` 的行样式（min-height 36 / radius-md / padding 7px 8px / margin 0 2px / gap 8px / font inherit / label-primary 常态色 / interactive-bg-hover 悬停激活）；图标 14→16px 与官方 glyph 对齐

### 新增
- **差异级变更视图（P1-A+）**：变更清单按文件生命周期语义分组——「新建文件」（write 且会话内无 read/edit 先例）/「编辑文件」（edit + 覆盖已有文件的 write）；条目可展开为 diff 卡——卡内固定文件头（路径 + 新建/覆盖/编辑徽标 + 回合号），`edit` 行级红删绿增（公共首尾各留 2 行做定位线索）、`write` 显示「新建/覆盖 · N 行」；数据经回合懒加载，索引不膨胀
- **命令成败标记（P1-B'）**：变更清单的执行命令按 tool 结果标红失败项（✗ + 划线），一眼看出本会话跑挂过的命令
- **反查冲突预警升级（P1-C'）**：文件反查的多会话标记分级——会话时间窗**重叠**才亮 ⚠ 强标记（并行改动真实风险），先后改动显示弱标记 ×N
- 索引格式升级（INDEX_VERSION 7→8）：命令条目带 `failed` 字段，首开会自动全量重扫一次

### 变更
- 索引格式升级（INDEX_VERSION 6→7→8→9）：write 条目带 isNew（会话内 read/edit 先例判定）：新增 `changes`（写入/修改/命令清单）与 `editedFiles`（反查索引）字段；命令条目带 `failed`；升级后首次打开自动全量重扫一次

## [1.4.9] - 2026-10-18

### 修复
- **DSH STORE 目录里 `dshReleases` 全 unknown 的根因修复**：商店扫描器（`check-plugin-submission.mjs` 的 `inferredCompatibility`）会拿每个声明的 release 再按 `engines.dsh` / `@deepseek-ai/dsh-*` peer 范围复核；我们的 dsh peer 范围是 `"*"`，而商店的 `parseDshRange("*")` 不识别（只支持 `>= <= > < ^ ~ =`）→ 返回 unknown → **所有 release 状态被统一下调为 unknown**（不是我们的矩阵写错，是范围不可解析）。现清单新增显式 `engines.dsh: ">=0.1.2-rc.1 <0.3.0"`，并把 dsh-* peer 改为同一范围；商店将按范围复核并保留我们逐版本 `dshReleases` 的真实状态
- **运行时兼容判定改为 `engines.dsh` 单独决定**（dsh 官方语义：有 engines.dsh 时忽略 dsh-* peer），对已支持版本（0.1.2-rc.1 ~ 0.2.1-rc.2）行为不变

## [1.4.8] - 2026-10-18

### 文档
- **README 补齐商店合规信息**（中/英双份）：新增「外部依赖与运行条件」（运行环境、唯一运行依赖 `@deepseek-ai/schemastery`、无生命周期脚本、Bundle Patch 只插入自身、第三方项目与命名空间声明）、「权限与数据边界」（读 `~/.dsh/sessions` 只读 / 只写插件私有目录 / 本机路由走宿主鉴权 / 只读官方投影 / 可选宿主 llm；不收集遥测）、「已知限制与风险」（存档代际演进、首扫性能、并入右栏版本依赖、LLM 摘要前置条件、DOM 级增强的适配风险）——对应 DSH STORE 提交自检清单的「用途 / 安装启用 / 外部依赖 / 权限 / 已知风险」要求

## [1.4.7] - 2026-10-18

### 修复
- **「并入右栏」在 dsh ≥0.1.5 彻底失效（GitHub issue #2）**：官方移除 details 列与 `layout.openDetails`（改为右栏标签页体系）后，旧实现点击无响应。现按官方公开两段式接入：`sidebarRightTabs.register` 注册 page 类型 + `sidebar.right.pane.tab`（keyed）注册 body，`sidebarRight.openTab(kind)` 打开（内部自动展开右栏列，会话切换不再强制关闭）；「退出并入」接到本标签页的 `tab.actions.close()`（与右栏 chip 的 ✕ 同源）；从右栏 ✕ 关闭时插件侧状态自动回落。≤0.1.4 宿主仍走旧 details 列路径；两代都不可用时按钮禁用并提示（不再是静默无响应）。致谢 @dzwalker 的 PR #3（同一方向的完整实现，作为集成基础）
- **实时通道在 dsh ≥0.1.5 恒报不可用（GitHub issue #4）**：0.1.5 起 connection 句柄移除 `api` 字段，旧门禁（`conn.api.sessions`）短路了明明可用的 `remote.session` 新面。改为双面判定 `sfLiveAvailable`：`remote.session`（≥0.1.5）或 `connection.api.sessions`（≤0.1.4），详情页/右栏实时/兜底视图三处门禁统一
- **存档定位改为代际自适应（根治「not found in archives」类问题）**：不再按 v1/v2/v3/v4 硬编码降序，改为 `session[.vN].jsonl[.zstd]` 取**代际号最大**者（同代际优先 zstd、`.tmp` 等非 canonical 名忽略）——以后 dsh 迁移到 v5/v6 无需改代码。致谢 @dzwalker 的 PR #1
- **dsh 0.2.x 会话打开与中栏锚点**：会话打开改双面（`uiWorkspace.openSession` 新面 → `sessions.open` 旧面）；中栏容器锚点补官方稳定钩 `[data-conversation-region="chat"]`（`centerCol` 已被 0.2.0 拆掉）；中栏容器被 React 重建时自愈重挂（不再永久消失）。致谢 @sulingqingQAQ 的 PR #5

### 变更
- **DSH 商店兼容性声明**：`dshReleases` 维持 `0.2.1-rc.2` compatible（本机真机复验）；新增 `verify/verify-dock-tabs.mjs`（右栏标签页接入运行时行为回归）

## [1.4.6] - 2026-10-18

### 修复
- **设置页真正写回宿主（dsh 0.2.x）**：设置弹窗「会话流」分节此前绑定 `webUiSettings`/`settingsScope` 桥——在 0.2.x 上 apply 时机取不到 web-all 桥，回落 `dsh-settings-scope-shim` 的 **localStorage 假存储**：面板显示默认值且「可保存」，但保存只写浏览器本地、宿主设置（profile patch）永远收不到，「疑似卡死」阈值等 host 侧参数不生效，且每次改动都被 shim 吞掉。现改为**优先直连 `configForms` 原生表单控制器**（命名空间 = profile 条目 id `dsh-session-flow`，即 Config 导出所对应的设置页），保存真实写入 profile patch 并触发 volatile 热更新；旧宿主（≤0.1.6）仍走 webUiSettings/settingsScope 兜底。保存被宿主拒绝（`scope.set` 返回 false）时现显式提示「部分设置未能保存」，不再静默
- **「并入右栏」在 dsh 0.2.x 优雅降级**：0.2.x 三层布局移除了官方 details 列（无 `layout.openDetails` / `details` 槽位），旧实现点击无反应且注册落在不存在的槽位。现 apply 时探测能力：不支持则隐藏「并入右栏」入口、不注册 details 槽位、不打开列、不报错；旧布局（≤0.1.x + web-all 详情面板）行为不变

### 变更
- **DSH 商店兼容性声明**：`dshReleases` 矩阵补 `0.2.1-rc.2`（compatible，本机真机验证）

## [1.4.5] - 2026-10-13

### 修复
- **修复 dsh 0.2.0 下钢琴键轮次悬浮条 / 官方 rail 增强层 / 会话健康芯片集体静默失效**：v0.2.0 把 `sessions.list.getSnapshot()` 快照从「直挂 `current`」改为 `{ids, byId, phase, projectionsBySession}`——旧代码读到 `current = undefined` → 当前会话 id 为空 → 条目永远空集、悬浮条按「少于 2 轮」规则隐藏（全程无报错，纯静默）。`currentSessionIdOf()` 改双口径：旧宿主读 `snap.current`；0.2.0+ 按官方 `ui-session.publishMain` 同算法取主视图保留者（`byId` 中 `retainedBy.mainView > 0` 的候选）。三处消费点（TurnKeys / RailEnhancer / SessionHealthChip）统一收敛到该辅助函数。根因定位经浏览器内探针实测（快照键清单 + 宿主 `get` 接口端到端响应）

## [1.4.4] - 2026-10-12

### 修复
- **修复 dsh 0.2.0 启动报错「cannot get property "config" without inject」**：v1.4.3 的设置新模型误从 `ctx.config` 读配置——cordis 上下文是 Proxy，读取未注入的属性即抛错（被插件 catch 不致命，但 host 侧设置永停默认值、「疑似卡死」阈值改动不生效，且每次设置页改动都重复刷错）。改从 cordis 一贯传入的 **`apply(ctx, config)` 第二参数**取已解析 Config（官方插件同款约定）；volatile 引用原地更新，「闭包捕获 + `loader/volatile-update` 重解引用」模式正确性不变

### 变更
- **DSH 商店兼容性声明**：`0.2.0-rc.2` 标记 compatible（修复后实测通过）

## [1.4.3] - 2026-09-29

### 修复
- **适配 dsh v0.1.7 存档 v4 布局**：v0.1.7 起会话存档迁移为 `session.v4.jsonl.zstd`——旧版只认 v3/v2/v1，纯 v4 会话的详情/重命名/检索全部 404「not found in archives」。现最高优先读取 v4 存档；`tool/result` 错误标记兼容 v4 新口径（`isError` 从 tool-result 包装块内提升到 `message` 顶层，摘要统计与时间线双消费点同步适配——修复前 v4 存档的工具错误数漏报为 0）；索引格式升级，首次打开自动全量重扫一次
- **适配 dsh v0.1.7 设置体系重构**：v0.1.7 移除旧 `settings.register` 命名空间 API，改为「插件导出 cordis `Config` 即官方设置页 + `.volatile()` 字段编辑热提交进运行中的插件配置」。旧版每次启动必抛「settings registration failed」（插件自身 catch 不致命，但卡死阈值等设置永远停在默认值、设置页改动不生效）。现新旧双模型兼容——新模型从运行中配置同步并监听 `loader/volatile-update` 热更新（读取入口在 1.4.4 修正为 apply 第二参数）；旧模型在 ≤0.1.6 宿主照常工作，0.1.7+ 静默跳过不再报错。10 个设置项现出现在官方设置界面 `dsh-session-flow` 条目下，编辑即时生效

### 变更
- **schema 依赖更换**：`schemastery` → `@deepseek-ai/schemastery`（上游无 `.volatile()` 方法，官方分叉才提供；volatile 字段解析值为 `{ get() }` 活引用而非裸值，消费侧统一 `readLive` 解引用兼容两种形态）
- **DSH 商店兼容性声明**：`dshReleases` 矩阵补 0.1.5-alpha.1 / 0.1.5-rc.2 / 0.1.7-alpha.2 / 0.1.7-rc.2（兼容）与 0.2.0-rc.2（未知）

### 已知遗留
- 插件自带客户端设置页（设置弹窗「会话流」tab）绑定旧设置桥命名空间，在 0.1.7+ 可能不可用——请改用官方设置界面的 `dsh-session-flow` 条目（≤0.1.6 宿主上该 tab 照常可用）

## [1.4.2] - 2026-09-14

### 修复
- **适配 dsh v0.1.5 存档 v3 布局**：v0.1.5 起会话存档迁移为 `session.v3.jsonl.zstd`——v3 为唯一持续写入的活文件，旧格式文件冻结在迁移时刻；且 header 行拍平为顶层字段（无 data 信封），事件行信封不变。旧版只认 v2——升级后新建的会话完全不可见、迁移老会话读到冻结旧数据。现最高优先读取 v3 存档，header 字段读取兼容「拍平 / 信封」两种位置

## [1.4.1] - 2026-09-13

### 新增
- **DSH 商店兼容性声明**：`package.json` 新增 `dsh.compatibility.dshReleases` 逐版本兼容矩阵（0.1.2-rc.1 兼容 / 0.1.3-alpha.1 未知 / 0.1.3-alpha.2 兼容），满足 DSH STORE 自动化上架契约

### 变更
- **浏览器端源码模块化 + 构建产物化**：客户端源码拆分至 `src/`（文案 / 样式 / 共享常量独立模块），发布产物 `lib/client.js` 改由 esbuild 打包压缩生成（附 sourcemap，`npm run build:client` 可复现）——运行行为不变，单文件体积 141KB（256KiB 自动审查上限以下）

## [1.4.0] - 2026-09-13

适配 dsh v0.1.3 存档 v2 布局，新增总览存档占用分析。

### 新增
- **存档占用分析**：总览统计条新增「存储」chip——当前范围（所选工作区）会话存档总占用，只读统计不改任何数据；排序下拉新增「占用最大」，快速定位最占空间的会话

### 修复
- **适配 dsh v0.1.3 存档 v2 布局**：v0.1.3 起会话存档迁移为 `session.v2.jsonl.zstd`（旧格式文件冻结在迁移时刻、v2 持续写入）。旧版只读旧格式——已有会话显示冻结的旧数据（轮次导航不随会话切换刷新）、v0.1.3 新建会话无法打开详情。现优先读取 v2 存档；索引格式升级，首次打开自动全量重扫一次

## [1.3.0] - 2026-09-05

适配 dsh v0.1.2（官方会话流重构进 dsh-client-ui-chat，新增官方轮次导航 TurnNavigatorRail）。

### 新增
- **官方轮次导航增强层**：dsh v0.1.2 起官方会话页右侧自带轮次导航刻度条（覆盖完整历史、可跳转未载入轮次）。本插件在其上叠加**官方没有的**信息维度（DOM 观察 + 自愈重挂，不拦截官方交互；独特性原则，不与官方 prompt/response 预览重复）：
  - hover 刻度时，在官方预览卡内部追加紧凑增强段：**纯色矢量图标 chips（耗时 / 工具调用 / 错误红标 / 思考标记）** + **工具分布懒加载**（驻留 250ms 拉取单轮明细，如 `pwsh ×6 · edit ×3`）；注入时自动解除官方预览卡固定高度裁剪，不另起悬浮卡
  - 右键导航条唤起会话流工作台
- **同款增强信息进钢琴键详情框**：经典悬浮条 hover 详情卡新增同款 meta chips + 工具分布行（缓存共享）
- **设置页新增「轮次导航」组（3 项布尔开关）**：「官方轮次导航增强」（默认开）、「**隐藏官方轮次导航**」（默认关——开启后完全屏蔽官方刻度条只留我们的悬浮条）、「经典左侧悬浮条」（**默认开**，与官方导航并存）
- **钢琴键吸收官方跳转引擎**：经典悬浮条点击未载入的轮次时，委托官方导航的加载跳转引擎（合成刻度点击）自动加载并定位——此前只提示不跳转；旧版 dsh（无官方导航）回退为提示
- **旧版 dsh 自动回退**：检测不到官方导航条（dsh < v0.1.2 或非对话标签页）时经典悬浮条照常工作，老用户功能不丢

### 修复（v0.1.2 兼容性）
- **头部健康胶囊 + 全部实时通道恢复**：官方 `sessions.history` 在 v0.1.2 **三重变更**——返回值 `{events}` 改为 `{records, hasMore}`（事件包 `{type:'event',event}` / chunk 合成行）、信封从 `{result:{ok,value}}` 改为**顶层 `{ok,value}`**、session RPC 整体迁入新 **`remote.session` 服务面**（`history` 改名 `page`、`throughSeq` 必填且宿主硬校验 ≤ 日志 cursor，需先经 `list` 投影 `asOfSeq` 解析）——旧读取全部静默失效，导致标题旁状态胶囊恒隐、详情页实时模式 / dock 实时 / 子代理实时 / 总览卡死监控 / 官方重命名全挂。新增 `sfBuildRemote` 双面适配器（新面优先、旧面回退保 v0.1.1）统一换线八类消费点；芯片 sessionId 另加 `sessions.list.current` 槽位兜底
- **中栏全页工作台挂载**：官方 v0.1.2 重构后会话面板选择器兜底改为 `[data-pane="conversation"], [class*=centerCol]`（与 dsh-web-all 全家桶新版同款约定；data-pane 打标本就来自全家桶运行时，非官方 dsh——纯净官方环境此前挂不上，现在也能工作了）
- **轮次悬浮条行锚点**：官方移除 `data-time-hover-root`，改锚 `[data-chat-flow] [data-chat-flow-kind="user"]`（官方内部查行同款选择器），旧锚点保留作旧版 dsh 回退
- **标题秒级同步**：官方移除 `conn.api.events.mux` 消费面，改用 `sessions.list` 订阅读取 `byId[].title`（官方 rename 后标题 projection 即时落到列表行，同样秒级）；mux 路径保留作旧版 dsh 回退

### 变更
- 轮次导航默认体验 = 我们的经典悬浮条（左）+ 官方 rail + 增强层（右）并存（方案 A 融合，用户拍板 2026-09-05）；两者均可在设置页单独关闭
- **状态胶囊常驻化**：空闲会话也展示——灰条「空闲 · N 分钟前」（计时基准 = 最后一条事件 time，即会话结束时刻；切入空闲时轻量拉一次最近事件，30s tick 保鲜；列表投影 updatedAt 语义是「投影上次变化」非「会话结束」，实测裁定弃用）；运行时保持活跃（绿）/ 工具执行中·静默中（黄）/ 疑似卡死（红脉冲）；probe 未返回前乐观显示活跃防闪烁；空白新会话不显示



## [1.2.0] - 2026-08-20

### 新增
- **插件设置页**：设置弹窗新增「会话流」独立分节（左导航顶级 tab）——轮次悬浮条可见行数/滚轮灵敏度/静止吸附延迟、实时轮询间隔/吸底阈值/保留历史回合数、疑似卡死判定阈值共 7 项参数可配置，保存即时生效；未配置时行为与此前版本完全一致
- **实时吸底跟随**：详情页与右栏的实时模式在用户处于底部（距底 ≤40px）时，每次轮询刷新后平滑滚动到新底部跟随最新对话；上滑阅读历史时不打扰；开启实时时默认从底部开始
- **右栏实时钉住原会话**：右栏实时开启后随会话切换自动钉住开播时的会话继续直播（监控多会话场景），琥珀色提示条告知「已钉住原会话」并提供「转播当前会话」一键重钉
- **右栏并入实时模式**：详情右栏（DetailsDock）内「实时」开关——开启后仅显示当前会话新产生的对话（开播时刻为基准，不含历史），轮次时间线渲染 + 健康徽标 + 3 秒轮询；嵌入标签页点「并入右栏」后自动跳回「对话」标签，边对话边看右栏直播

### 修复
- **右栏头部与第三方浮动按钮重叠**：右栏头部「实时 / 退出并入」按钮改为紧跟「会话流」标题聚左排布（spacer 吃掉右侧余量），彻底避开 dsh-better-sidebar 等视口级浮动插件常驻右上角的展开按钮区（此前「退出并入」被压在浮钮下）
- **轮次悬浮条展开滚动整体重构**：虚拟窗口渲染（12 可视 + 上下缓冲）+ JS 逐帧平滑位移（rAF 追逐 + 实测行距）+ 静止整行吸附（滚轮停止 ~170ms 对齐最近整行）——此前整行硬跳且缓冲条目露头。附带几何链修复：
  - 悬浮条高度精确钉死为恰好 12 行（`flex:1 1 auto` 让 JS 高度成为弹性基准；短会话自动缩短，60vh 上限保留）
  - 裁剪框与内容严格重合：垂直呼吸移至标题行下边距/根容器下内边距（静止件），可见区精确 12 行、上下零露头
- **并入右栏跳转错误**：嵌入标签页点「并入右栏」后正确跳回「对话」标签（按文本精确匹配同组标签，不限按钮元素——此前误跳其他插件标签）
- **轮次悬浮条动画整体重构**：收拢时纵向（条目高度 4↔30px）与横向（宽度 32↔200px）同时进行、展开为合理倒放——此前高度 `auto` 不可插值导致收拢瞬间跳变抖动。附带修复/增强：
  - **热区无缝链**：标题行与首条目热点连续（hover 标题行 ≡ hover 首条目），消灭两者间窄带上「横条出现/消失」的闪烁
  - **信息面板不粘滞**：鼠标离开悬浮条时面板与收拢动画同步消失（此前面板比收拢多拖 ~0.5s）
  - **信息面板锚定**：面板始终锚定在展开后条目的右侧（此前快速进入时常锚在收拢条右缘=鼠标旁，且不随展开完成自动纠正）
  - **快速路过零闪动**：鼠标快速扫过收拢态悬浮条完全静止（120ms 驻留判定），驻留后照常展开；收拢锁 300ms 防止收拢边缘几何自反馈回路
- **嵌入标签页滚动隔离**：会话流标签页内左侧时间线与右侧工具导航栏现各自独立滚动；根因是官方视图容器 `min-height:auto` 与 flex 百分比基准的循环依赖（`flex-basis:0%` 被按内容尺寸处理），改用绝对零基准（`flex:1 1 0`）钉死高度
- **状态胶囊返回失效**：从头部状态胶囊跳入会话流详情后，「← 返回」不再被旧跳转意图拉回详情（意图消费即清除，命中与否均一次性）
- **轮次悬浮条定位偏差**：当前轮次高亮定位改用单调游标行映射，修复部分场景下「所在对话」指示不准（含顶部被裁剪行的可见性判定）

### 变更
- 移除「详情右栏 × 多右栏面板共存」场景下的拖拽把手位置内置补偿：该补偿已由上游 aionui-panel ≥ 0.2.0 接管（dsh-web-ui PR #311）；与右侧扩展面板共存使用时请保持 aionui-panel 为 0.2.0 及以上版本

## [1.1.0] - 2026-08-17

### 新增
- **重命名对齐官方数据源**：改走官方 `session.rename` RPC（log-backed `session/title` 事件），与官方侧栏同一 store 即时同步；官方改名经 mux `session/projection` 广播**秒级同步**到会话流（免重扫）；显示优先级 档案 user 标题 > renames.json 遗留 > 自动标题
- **会话健康监控（疑似卡死识别）**：四级分类 🟢活跃 / 🟡工具执行中 / 🟡静默中 / 🔴疑似卡死（静默 ≥3 分钟），区分「长任务正常跑」与「LLM 挂起」；总览卡片徽标（30s 探测）+ 详情实时条徽标
- **会话页头部健康芯片**：顶栏模式标识右侧常驻（官方 `conversation.session.header.actions` 槽位），钢琴键语言——收拢为竖向彩色胶囊条（绿/黄/红语义色，卡死呼吸脉冲），悬浮展开为毛玻璃状态卡，点击直达会话流详情

### 说明
- 官方 rename 拒绝的场景（清空标题、子代理会话 agent-busy）回退本地 renames.json 覆盖层（自然淘汰，不再迁移）

## [1.0.0] - 2026-08-16

### 新增
- **会话流标签页**：嵌入原生会话页，当前会话直接回顾，与侧边栏工作台互跳；含跨视图定位握手与未落盘实时兜底
- **轮次悬浮条**：会话页左侧常驻轮次导航（收拢短横条 ⇄ 悬浮条目卡），本会话任意轮次一键跳转；仅「对话」页显示
- **跨会话全文检索**：总览全文模式跨工作区召回（最近 20 会话 / 5s 预算 / 取消支持），命中直达会话流标签页自动定位
- **详情并入右栏**：动态占用官方右侧面板，边看主对话、边看会话流；含与第三方右侧面板共存的拖拽把手位置兼容
- **会话重命名**：自定义标题显示层覆盖（独立存储，清缓存不丢；不动原始存档），卡片/详情页行内重命名，可随时恢复原名
- **结论摘要行**：总览卡片显示「最近结论 + 首个任务」，索引预存、零新增接口
- 上游贡献：修复 dsh-web-ui 右侧面板在扩展布局下的拖拽把手位置错位（PR #311）

### 待发布准备
- 补充 LICENSE（Apache-2.0）、CHANGELOG
- `package.json` 增加 `repository` 字段
- 发布文件白名单收窄：仅 `lib/` + `cordis.patch.yml` + `README.md`（本地开发文档与验证脚本不进公开包）

## [0.1.0] - 2026-08

### 新增（完整功能）

**归档与总览**
- 归档扫描与索引：zstd 多帧解码（Node 内置 `node:zlib`，零第三方依赖）+ JSONL 解析；增量索引缓存（mtime+size 跳过，版本化自动重扫）
- 总览工作台：会话卡片、结构化搜索（`tool:` / `file:` / `err:` + 自由文本）、工作区 tabs、5 种排序、工具 Top 统计、问题会话筛选、空会话隐藏

**详情与导航**
- 折叠详情页：回合默认折叠、渐进披露（思考/正文/工具）、真实时间序渲染、注入信息分类、结论徽标、四标签右侧导航（用户/工具/错误/检索）、选中回合高亮
- 轻量加载：回合摘要先行 + 按需展开；双通道派生缓存（内存 LRU + 磁盘持久化，512MiB 上限自动修剪）

**血缘与检索**
- 子代理血缘树：离线档案树 + 运行时实时树双通道，工具行一键直达
- 内容级检索：总览筛会话 + 详情页全文扫描定位（闪烁高亮）

**摘要引擎**
- 会话摘要：规则摘要（零请求实时组装）+ LLM 摘要（DSH 模型通道）
  - 多任务信息源：以回合为任务单元 + 全程均匀采样（防摘要退化成「最近几轮」）
  - 落盘复用 + 新对话过期提示；reasoning 兜底；失败透传真实原因
  - 迷你 Markdown 渲染

**导出**
- 导出报告：ZIP 分卷 Markdown（`00-概览.md` + 按体积滚动的时间线分卷，单卷 ≤700KB）
  - 手写 ZIP（deflate + CRC32，零依赖）；代码块使用规范；正文 HTML 污染防护

**实时跟踪**
- 实时通道：运行中会话 3 秒轮询刷新折叠视图
  - 运行中判定用事件结构信号（未闭合回合/步骤/工具），不依赖时间戳
  - 运行中回合呼吸高亮 + 动态生成标志；实时视图保留最近 3 个历史回合 + 当前回合

**其他**
- 缓存管理面板（索引 + 时间线分类清理，仅限插件私有目录）

[Unreleased]: https://github.com/YeqingTang/dsh-session-flow/compare/v1.5.0...HEAD
[0.1.0]: https://github.com/YeqingTang/dsh-session-flow/releases/tag/v0.1.0
[1.0.0]: https://github.com/YeqingTang/dsh-session-flow/releases/tag/v1.0.0
[1.1.0]: https://github.com/YeqingTang/dsh-session-flow/releases/tag/v1.1.0
[1.2.0]: https://github.com/YeqingTang/dsh-session-flow/releases/tag/v1.2.0
[1.3.0]: https://github.com/YeqingTang/dsh-session-flow/releases/tag/v1.3.0
[1.4.0]: https://github.com/YeqingTang/dsh-session-flow/releases/tag/v1.4.0
[1.4.1]: https://github.com/YeqingTang/dsh-session-flow/releases/tag/v1.4.1
[1.4.2]: https://github.com/YeqingTang/dsh-session-flow/releases/tag/v1.4.2
[1.4.3]: https://github.com/YeqingTang/dsh-session-flow/releases/tag/v1.4.3
[1.4.4]: https://github.com/YeqingTang/dsh-session-flow/releases/tag/v1.4.4
[1.4.5]: https://github.com/YeqingTang/dsh-session-flow/releases/tag/v1.4.5
[1.4.6]: https://github.com/YeqingTang/dsh-session-flow/releases/tag/v1.4.6
[1.4.7]: https://github.com/YeqingTang/dsh-session-flow/releases/tag/v1.4.7
[1.4.8]: https://github.com/YeqingTang/dsh-session-flow/releases/tag/v1.4.8
[1.4.9]: https://github.com/YeqingTang/dsh-session-flow/releases/tag/v1.4.9
[1.5.0]: https://github.com/YeqingTang/dsh-session-flow/releases/tag/v1.5.0
