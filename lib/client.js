// lib/client.js — dsh-session-flow 浏览器半。
//
// 挂载两个 DOM 面：
//  1) 侧边栏入口行（「会话流」按钮，DOM 级注入 + MutationObserver 自愈，
//     模式参照 dsh-client-ui-task-board 的 sidebar-entry）；
//  2) 中栏全页视图（容器追加进 [data-pane="conversation"]，
//     <html data-dsh-session-flow-active> 切换可见性，React root 渲染）。
//
// 视图：M2 会话总览页 + M3 折叠时间线详情页（回合/步骤/工具链折叠、产物内联、锚点定位）。
// 跨插件激活协调：与 taskboard / ssh 面板互斥（dsh-panel-activate 事件 + 移除对方 html 属性）。
// 失败策略：挂载问题只记日志，绝不让 GUI 启动失败。
window.__ModuleLoader__.load({ id: 'dsh-session-flow', factory: (require) => {
  var module = { exports: {} }; var exports = module.exports;

  const React = require('react')
  const { useState, useEffect, useMemo, useRef } = React
  const h = React.createElement
  const { createRoot } = require('react-dom/client')

  // ── 常量 ────────────────────────────────────────────────────────────
  const ENTRY_SELECTOR = '[data-dsh-session-flow-entry]'
  const VIEW_SELECTOR = '[data-dsh-session-flow-view]'
  const ACTIVE_ATTR = 'data-dsh-session-flow-active'
  const OTHER_ACTIVE_ATTRS = ['data-dsh-taskboard-active', 'data-dsh-ssh-active']
  const ACTIVATE_EVENT = 'dsh-panel-activate'
  const PANEL_NAME = 'sessionflow'
  const CONVERSATION_SELECTOR = '[data-pane="conversation"]'
  const SIDEBAR_ROW_SELECTOR = '[class*="sessionRow"], [class*="projectRow"], [class*="searchResultRow"], [class*="searchResultWorkspace"], [class*="newSession"]'
  const ACTIVE_WINDOW_MS = 15 * 60 * 1000 // 最近 15 分钟有事件 → 视为进行中（归档/总览徽标用）

  let LOCALE = 'en'
  try {
    const nl = String(navigator.language || navigator.userLanguage || '')
    if (nl.toLowerCase().startsWith('zh')) LOCALE = 'zh'
  } catch (e) {}

  const STR = LOCALE === 'zh' ? {
    entry: '会话流', title: '会话流', rescan: '重新扫描', scanning: '扫描中…',
    pianoTitle: '轮次', pianoNew: '新建会话', pianoFav: '收藏', pianoUnfav: '取消收藏', pianoFavs: '收藏', pianoOpenInFlow: '在会话流中打开',
    pianoJumpFail: '该轮次尚未加载：请在会话区向上滚动加载历史后再点击',
    fullText: '全文检索', fullTextSearching: '搜索中…', fullTextPartial: '已扫描 {N}/{M} 个会话（结果未完整）', fullTextNone: '全文无命中', fullTextFail: '全文检索失败',
    dock: '并入右栏', dockExit: '退出并入', dockHint: '会话流已并入右侧栏 · 随当前会话切换', dockEmpty: '打开会话后可在此查看会话流',
    rename: '重命名', renamePlaceholder: '输入新标题…', renameFail: '重命名失败', origTitle: '原名',
    search: '搜索标题/工具/文件… 支持 tool: pwsh · file: src · err:', allWorkspaces: '全部工作区',
    sortRecent: '最近运行', sortNewest: '最近创建', sortOldest: '最早创建', sortTools: '工具最多', sortLongest: '耗时最长',
    noMatch: '没有匹配的会话', noData: '暂无会话数据',
    running: '进行中', ended: '已结束', subagent: '子代理',
    turns: '回合', steps: '步骤', tools: '工具', errors: '错误', msgs: '消息',
    duration: '耗时', created: '创建', size: '大小', records: '记录',
    jumpFailed: '无法跳转（会话不在当前列表）', unknownTitle: '（未命名会话）',
    loadFailed: '加载失败',
    back: '返回', openWorkbench: '打开完整工作台', close: '关闭', jumpNative: '跳转原生会话', expandAll: '全部展开', collapseAll: '全部折叠',
    exportMd: '导出报告 (ZIP)', exporting: '导出中…', exportFail: '导出失败',
    live: '实时', liveActive: '实时 · 进行中', liveExit: '退出实时', liveLoading: '实时加载…',
    liveFail: '实时不可用', liveUnavailable: '（实时通道不可用：连接不可用）',
    liveFallbackHint: '会话尚未落盘 · 实时视图（3s 轮询）', retryArchive: '重试档案视图',
    liveEvents: '事件', liveRefreshing: '刷新…', liveLastActive: '最后活动',
    liveTurn: '运行中', liveGenerating: '正在生成…',
    detailLoading: '正在解析会话…', noTimeline: '无可展示的时间线', artifacts: '产物',
    noArtifacts: '（未提取到产物路径）', user: '用户', assistant: '助手', step: '步骤',
    args: '参数', result: '结果', thinking: '思考', expanded: '展开', collapsed: '收起',
    detailFailed: '会话详情加载失败', showEmpty: '显示空会话', emptySession: '空会话',
    emptyHint: '此会话已创建但尚未开始对话', userNav: '用户发言', noUserNav: '（无用户发言）',
    conclusion: '结论', injected: '注入', lineage: '血缘', noLineage: '（无子代理血缘信息）', task: '任务',    liveTree: '运行时血缘', offlineTree: '档案血缘', modeOneShot: '一次性', modeContinuable: '可续',
    subagentDetail: '子代理详情', loadDetail: '加载子代理详情…', noDetail: '该子代理无可见事件',
    viewSubagent: '查看子代理', toolTop: '工具 Top', issues: '问题会话', issuesHint: '只显示有错误记录的会话',
    searchTab: '检索', searchInPlaceholder: '会话内检索…', noMatches: '无匹配位置', matches: '命中', navUsers: '用户',
    cache: '缓存管理', cacheTotal: '缓存总量', cacheIndex: '会话索引', cacheTimeline: '时间线缓存',
    cleanTimeline: '清理时间线缓存', cleanAll: '清理全部缓存', cacheDone: '已清理', cacheEmpty: '（无缓存文件）',
    summary: '会话摘要', summaryGoal: '首个任务', summaryConclusion: '最近结论', summaryTools: '工具',
    summaryTaskCount: '任务数', summaryProvisional: '（可能仅为当前进展）',
    summaryStale: '⚠ 摘要生成后有新对话，内容可能已不准确，建议重新生成',
    llmSummary: '生成 LLM 摘要', llmGenerating: '生成中…', llmFail: '生成失败', summaryRuleTag: '规则', summaryLlmTag: 'LLM',
    cacheHint: '仅清理本插件的缓存（可自动重建），不影响 DSH 会话存档与任何其他数据', cacheLimit: '时间线缓存上限',
  } : {
    entry: 'Session Flow', title: 'Session Flow', rescan: 'Rescan', scanning: 'Scanning…',
    pianoTitle: 'Turns', pianoNew: 'New session', pianoFav: 'Favorite', pianoUnfav: 'Unfavorite', pianoFavs: 'Favorites', pianoOpenInFlow: 'Open in Session Flow',
    pianoJumpFail: 'Turn not loaded — scroll up in the conversation to load history, then retry',
    fullText: 'Full-text', fullTextSearching: 'Searching…', fullTextPartial: 'Scanned {N}/{M} sessions (partial)', fullTextNone: 'No full-text matches', fullTextFail: 'Full-text search failed',
    dock: 'Dock right', dockExit: 'Undock', dockHint: 'Session Flow docked · follows current session', dockEmpty: 'Open a session to view its flow here',
    rename: 'Rename', renamePlaceholder: 'New title…', renameFail: 'Rename failed', origTitle: 'Original',
    search: 'Search title / tools / files… use tool: · file: · err:', allWorkspaces: 'All workspaces',
    sortRecent: 'Recently run', sortNewest: 'Recently created', sortOldest: 'Oldest first', sortTools: 'Most tools', sortLongest: 'Longest',
    noMatch: 'No matching sessions', noData: 'No session data yet',
    running: 'Running', ended: 'Ended', subagent: 'subagent',
    turns: 'turns', steps: 'steps', tools: 'tools', errors: 'errors', msgs: 'msgs',
    duration: 'duration', created: 'created', size: 'size', records: 'records',
    jumpFailed: 'Cannot open (session not in live list)', unknownTitle: '(untitled session)',
    loadFailed: 'Load failed',
    back: 'Back', openWorkbench: 'Open workbench', close: 'Close', jumpNative: 'Open in native view', expandAll: 'Expand all', collapseAll: 'Collapse all',
    exportMd: 'Export report (ZIP)', exporting: 'Exporting…', exportFail: 'Export failed',
    live: 'Live', liveActive: 'Live · running', liveExit: 'Exit live', liveLoading: 'Loading live…',
    liveFail: 'Live unavailable', liveUnavailable: '(live channel unavailable: no connection)',
    liveFallbackHint: 'Session not persisted yet · live view (3s poll)', retryArchive: 'Retry archive view',
    liveEvents: 'events', liveRefreshing: 'refreshing…', liveLastActive: 'last active',
    liveTurn: 'Running', liveGenerating: 'Generating…',
    detailLoading: 'Parsing session…', noTimeline: 'No timeline to show', artifacts: 'Artifacts',
    noArtifacts: '(no artifact paths extracted)', user: 'User', assistant: 'Assistant', step: 'Step',
    args: 'Args', result: 'Result', thinking: 'Thinking', expanded: 'Expanded', collapsed: 'Collapsed',
    detailFailed: 'Failed to load session detail', showEmpty: 'Show empty sessions', emptySession: 'Empty',
    emptyHint: 'This session was created but has no conversation yet', userNav: 'User turns', noUserNav: '(no user turns)',
    conclusion: 'Conclusion', injected: 'Injected', lineage: 'Lineage', noLineage: '(no subagent lineage)', task: 'Task',
    liveTree: 'Live lineage', offlineTree: 'Archive lineage', modeOneShot: 'one-shot', modeContinuable: 'continuable',
    subagentDetail: 'Subagent detail', loadDetail: 'Loading subagent detail…', noDetail: 'No visible events for this subagent',
    viewSubagent: 'View subagent', toolTop: 'Tool Top', issues: 'Problem sessions', issuesHint: 'Only sessions with errors',
    searchTab: 'Search', searchInPlaceholder: 'Search in session…', noMatches: 'No matches', matches: 'matches', navUsers: 'User',
    cache: 'Cache Mgmt', cacheTotal: 'Cache total', cacheIndex: 'Index', cacheTimeline: 'Timeline cache',
    cleanTimeline: 'Clean timeline cache', cleanAll: 'Clean all cache', cacheDone: 'Cleaned', cacheEmpty: '(no cache files)',
    summary: 'Session summary', summaryGoal: 'First task', summaryConclusion: 'Latest result', summaryTools: 'Tools',
    summaryTaskCount: 'Tasks', summaryProvisional: '(may only be current progress)',
    summaryStale: '⚠ New conversation since summary was generated; content may be outdated — regenerate',
    llmSummary: 'Generate LLM summary', llmGenerating: 'Generating…', llmFail: 'Failed', summaryRuleTag: 'rule', summaryLlmTag: 'LLM',
    cacheHint: "Only this plugin's cache (auto-rebuilds); never touches DSH session archives or other data", cacheLimit: 'Timeline cache limit',
  }

  // ── 右侧导航图标（组件级共享，定义在顶层避免作用域问题）───────────
  // feather 风格线条，currentColor 自适应明暗主题、与文字同色。
  const NAV_ICON_USER = `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`
  const NAV_ICON_TOOL = `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="15" cy="7" r="4.2"/><path d="M12.1 9.9 4.6 17.4a1.9 1.9 0 0 0 2.7 2.7l7.5-7.5"/></svg>`
  const NAV_ICON_ERR = `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`
  const NAV_ICON_SEARCH = `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>`

  // ── 样式 ────────────────────────────────────────────────────────────
  // 注意：挂载容器只靠 [data-dsh-session-flow-view] 属性控制可见性（display:none!important），
  // 容器上不得再加任何会设置 display 的 class —— 同级特异性下后者会覆盖 display:none，
  // 导致视图永久显示、属性切换失效（曾踩过 .sf-view 覆盖的坑）。
  // 滚动策略：容器 overflow:hidden，滚动只发生在本视图内部（.sf-body / .sf-timeline 等），
  // 这样 top 栏（flex:none + sticky）天然固定，不会随内容滚出视口。
  const STYLE = [
    `[data-pane=conversation]{position:relative}`,
    `${VIEW_SELECTOR}{z-index:60;background:var(--dsw-alias-bg-base,#fff);display:none!important;position:absolute;inset:0;overflow:hidden}`,
    `html[${ACTIVE_ATTR}]:not([data-dsh-taskboard-active]):not([data-dsh-ssh-active]) ${VIEW_SELECTOR}{display:block!important}`,
    `html[${ACTIVE_ATTR}]:not([data-dsh-taskboard-active]):not([data-dsh-ssh-active]) [data-pane=conversation]>:not(${VIEW_SELECTOR}),html[${ACTIVE_ATTR}]:not([data-dsh-taskboard-active]):not([data-dsh-ssh-active]) [class*=centerCol]>:not(${VIEW_SELECTOR}){display:none!important}`,
    `.sf-entry{width:100%;height:32px;color:var(--dsw-alias-label-secondary,#666);cursor:pointer;white-space:nowrap;background:0 0;border:none;border-radius:8px;align-items:center;gap:8px;padding:0 12px;font-size:13px;display:flex}`,
    `.sf-entry:hover{background:var(--dsw-specific-sidebar-nav-item-hover,rgba(0,0,0,.06));color:var(--dsw-alias-label-primary,#222)}`,
    `.sf-entry[data-active]{background:var(--dsw-specific-sidebar-nav-item-active,rgba(0,0,0,.1));color:var(--dsw-alias-label-primary,#222);font-weight:600}`,
    `.sf-entryIcon{flex:none;justify-content:center;align-items:center;display:inline-flex}`,
    `.sf-entryLabel{text-overflow:ellipsis;overflow:hidden}`,
    `[data-dsh-frame][data-sidebar-collapsed] .sf-entry{justify-content:center;width:100%;padding:0}`,
    `[data-dsh-frame][data-sidebar-collapsed] .sf-entryLabel{display:none}`,
    // box-sizing:border-box 必须：height:100% + padding 在 content-box 下会溢出容器，
    // 产生多余的整页滚动条，导致 top 栏随滚动消失（用户实测反馈）。
    `.sf-view{box-sizing:border-box;background:var(--dsw-alias-bg-base,#fff);min-width:0;height:100%;min-height:0;color:var(--dsw-alias-label-primary,#222);font-family:var(--dsw-font-family,inherit);flex-direction:column;gap:10px;padding:14px 16px 16px;display:flex;overflow:hidden}`,
    // top 栏悬浮固定：flex:none 在布局上已固定；再加 sticky + 背景双保险。
    `.sf-viewHeader{flex:none;position:sticky;top:0;z-index:1;background:var(--dsw-alias-bg-base,#fff);align-items:center;gap:10px;display:flex;flex-wrap:wrap}`,
    `.sf-viewTitle{color:var(--dsw-alias-label-primary,#222);white-space:nowrap;margin:0;font-size:16px;font-weight:700}`,
    `.sf-input{color:var(--dsw-alias-label-primary,#222);background:var(--dsw-specific-input-major,#f5f5f5);border:1px solid var(--dsw-alias-border-l2,#ddd);border-radius:8px;outline:none;padding:5px 10px;font-size:12px}`,
    `.sf-input:focus{border-color:var(--dsw-specific-accent,#4a7dff)}`,
    `.sf-btn{color:var(--dsw-alias-label-primary,#222);background:var(--dsw-specific-input-major,#f5f5f5);border:1px solid var(--dsw-alias-border-l2,#ddd);border-radius:8px;outline:none;padding:5px 12px;font-size:12px;cursor:pointer}`,
    `.sf-btn:hover{opacity:.85}.sf-btn:disabled{opacity:.5;cursor:default}`,
    `.sf-btnActive{border-color:rgba(28,158,90,.55);color:#1c9e5a;background:rgba(28,158,90,.08)}`,
    `.sf-body{flex:1;min-height:0;overflow:auto;display:flex;flex-direction:column;gap:8px}`,
    `.sf-groupTitle{flex:none;font-size:12px;font-weight:600;color:var(--dsw-alias-label-secondary,#888);margin:6px 0 2px}`,
    `.sf-card{background:var(--dsw-specific-input-major,#fafafa);border:1px solid var(--dsw-alias-border-l2,#e5e5e5);border-radius:10px;padding:9px 12px;font-size:13px;cursor:pointer;transition:border-color .12s,box-shadow .12s}`,
    `.sf-card:hover{border-color:var(--dsw-specific-accent,#4a7dff);box-shadow:0 1px 4px rgba(0,0,0,.06)}`,
    `.sf-cardTitle{font-weight:600;margin-bottom:4px;display:flex;align-items:center;gap:8px;flex-wrap:wrap}`,
    `.sf-cardText{color:var(--dsw-alias-label-primary,#222)}`,
    // M8a 会话重命名：hover 显示 ✏️；编辑态行内输入；自定义标题时显示「原名」小字。
    `.sf-renameBtn{flex:none;border:none;background:none;padding:1px 4px;margin-left:2px;border-radius:6px;cursor:pointer;color:var(--dsw-alias-label-secondary,#888);font-size:11px;line-height:16px;opacity:0;transition:opacity .12s,color .12s}`,
    `.sf-card:hover .sf-renameBtn,.sf-renameBtn:focus-visible,.sf-renameBtn[data-active='true']{opacity:1}`,
    `.sf-renameBtn:hover{color:var(--dsw-specific-accent,#4a7dff);background:rgba(90,140,255,.1)}`,
    `.sf-renameWrap{flex:1 1 100%;min-width:0;display:inline-flex;align-items:center;gap:6px}`,
    `.sf-renameInput{flex:1 1 auto;min-width:0;border:1px solid var(--dsw-specific-accent,#4a7dff);border-radius:6px;padding:3px 8px;font-size:12.5px;background:var(--dsw-alias-bg-base,#fff);color:var(--dsw-alias-label-primary,#222);outline:none}`,
    `.sf-renameErr{color:#d43b3b;font-size:11px;white-space:nowrap}`,
    `.sf-origTitle{flex:none;font-size:11px;color:var(--dsw-alias-label-secondary,#888);font-weight:400;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:180px;margin-left:8px}`,
    // 候选 B：卡片结论摘要行（最近结论主行 + 首个任务小字，单行 ellipsis，hover 悬浮全文）。
    `.sf-cardConclusion,.sf-cardTask{display:flex;align-items:center;gap:6px;min-width:0;margin-top:3px;font-size:11.5px;line-height:1.5;color:var(--dsw-alias-label-secondary,#666)}`,
    `.sf-cardConclusionText,.sf-cardTaskText{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}`,
    `.sf-cardTag{flex:none;border-radius:5px;padding:0 5px;font-size:10px;line-height:16px;font-weight:700;background:rgba(90,140,255,.12);color:#4a7dff}`,
    `.sf-viewTitle .sf-renameBtn{opacity:.55}.sf-viewTitle:hover .sf-renameBtn{opacity:1}`,
    `.sf-muted{color:var(--dsw-alias-label-secondary,#888);font-size:12px}`,
    `.sf-mono{font-family:ui-monospace,Consolas,monospace;font-size:12px}`,
    `.sf-badge{flex:none;border-radius:6px;padding:1px 7px;font-size:11px;line-height:16px}`,
    `.sf-badgeWs{background:rgba(90,140,255,.12);color:#4a7dff}`,
    `.sf-badgeRun{background:rgba(60,190,120,.15);color:#1c9e5a}`,
    // 运行中回合内的「运行中」徽标与边框同步呼吸（亮度脉动，周期 2.8s）。
    `.sf-turnLive .sf-badgeRun{animation:sfBadgePulse 2.8s ease-in-out infinite}`,
    `@keyframes sfBadgePulse{0%,100%{opacity:.7}50%{opacity:1}}`,
    `.sf-badgeEnd{background:rgba(120,120,120,.12);color:#888}`,
    `.sf-badgeSub{background:rgba(240,150,60,.15);color:#d97706}`,
    `.sf-badgeErr{background:rgba(230,80,80,.13);color:#d43b3b}`,
    `.sf-statsRow{display:flex;gap:12px;flex-wrap:wrap;margin-top:3px}`,
    `.sf-hint{color:var(--dsw-alias-label-secondary,#888);font-size:12px;padding:2px 2px 0}`,
    // ── 工作区筛选 tabs（独立一行，醒目）──
    `.sf-wsTabs{flex:none;display:flex;gap:6px;flex-wrap:wrap;align-items:center}`,
    `.sf-wsTab{flex:none;display:inline-flex;align-items:center;gap:5px;max-width:280px;padding:3px 11px;border-radius:999px;border:1px solid var(--dsw-alias-border-l2,#ddd);background:var(--dsw-specific-input-major,#f5f5f5);color:var(--dsw-alias-label-secondary,#666);font-size:12px;cursor:pointer;white-space:nowrap}`,
    `.sf-wsTab:hover{border-color:var(--dsw-specific-accent,#4a7dff);color:var(--dsw-alias-label-primary,#222)}`,
    `.sf-wsTab[data-active]{background:rgba(90,140,255,.14);border-color:#4a7dff;color:#4a7dff;font-weight:600}`,
    `.sf-wsTabName{overflow:hidden;text-overflow:ellipsis}`,
    `.sf-wsTabCount{flex:none;border-radius:999px;background:rgba(90,140,255,.12);color:#4a7dff;min-width:18px;text-align:center;padding:0 5px;font-size:11px;line-height:16px}`,
    // ── 卡片工作区行（醒目 + 点击即筛选）──
    `.sf-cardWs{display:flex;align-items:center;gap:6px;padding:0 0 6px;margin-bottom:6px;border-bottom:1px dashed var(--dsw-alias-border-l2,#ddd);color:#4a7dff;font-size:12px;font-weight:600;cursor:pointer;user-select:none}`,
    `.sf-cardWs:hover{color:#2f5fd0}`,
    `.sf-cardWsIcon{flex:none;display:inline-flex}`,
    `.sf-cardWsName{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-family:ui-monospace,Consolas,monospace;font-size:11.5px}`,
    `.sf-cardWsFilter{flex:none;margin-left:auto;font-size:11px;font-weight:400;opacity:.75}`,
    // ── 详情页 ──
    `.sf-detailBody{flex:1;min-height:0;display:flex;gap:12px;overflow:hidden}`,
    `.sf-timeline{flex:1;min-width:0;overflow:auto;display:flex;flex-direction:column;gap:10px;padding-right:4px}`,
    `.sf-artifacts{flex:none;width:250px;min-width:200px;overflow:auto;border-left:1px solid var(--dsw-alias-border-l2,#eee);padding-left:12px;display:flex;flex-direction:column;gap:6px}`,
    `.sf-turn{border:1px solid var(--dsw-alias-border-l2,#e5e5e5);border-radius:10px;background:var(--dsw-specific-input-major,#fafafa);scroll-margin-top:8px}`,
    `.sf-turnHead{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:7px 10px;cursor:pointer;border-radius:10px}`,
    `.sf-turnHead:hover{background:rgba(90,140,255,.06)}`,
    // 运行中回合：整圈边框 + 内辉光呼吸——零掉帧方案。
    // 容器边框透明，呼吸由 ::before 伪元素完成：伪元素画「亮边框 + 静态 inset
    // 辉光」，动画只驱动 opacity（合成器线程，不触发布局/重绘）。
    // 静态辉光不参与动画 → 视觉是整圈「发光边框」一起明暗呼吸（非粗细变换），
    // 且 inset 辉光在容器内部，无边缘裁剪问题。
    `.sf-turn.sf-turnLive{position:relative;border-color:transparent;background:rgba(28,158,90,.05)}`,
    `.sf-turn.sf-turnLive::before{content:'';position:absolute;inset:0;border-radius:10px;border:1px solid rgba(28,158,90,.95);box-shadow:inset 0 0 8px 1px rgba(28,158,90,.28);pointer-events:none;animation:sfLiveFade 2.8s ease-in-out infinite}`,
    `.sf-turnHeadLive{background:rgba(28,158,90,.14)}`,
    `@keyframes sfLiveFade{0%,100%{opacity:.35}50%{opacity:1}}`,
    // 选中回合（正文区）：蓝色高亮边框 + 底色，点击定位后一眼可辨。
    `.sf-turn.sf-turnSelected{border-color:rgba(74,125,255,.6);background:rgba(74,125,255,.06);box-shadow:0 0 0 2px rgba(74,125,255,.12)}`,
    // 选中回合（右侧导航项）：蓝色高亮底色。
    `.sf-navItem.sf-navItemSel{background:rgba(74,125,255,.12);border-color:rgba(74,125,255,.45)}`,
    // 运行中底部动态标志：三点跳动省略号 + 文案。
    `.sf-liveTyping{display:flex;align-items:center;gap:8px;padding:8px 10px 10px;font-size:12px}`,
    `.sf-liveDots{display:inline-flex;gap:3px;align-items:center}`,
    `.sf-liveDots span{width:6px;height:6px;border-radius:50%;background:var(--dsw-alias-label-primary,#333);opacity:.35;animation:sfDotBounce 1.2s infinite ease-in-out}`,
    `.sf-liveDots span:nth-child(2){animation-delay:.15s}.sf-liveDots span:nth-child(3){animation-delay:.3s}`,
    `@keyframes sfDotBounce{0%,60%,100%{transform:translateY(0);opacity:.35}30%{transform:translateY(-3px);opacity:1}}`,
    // 回合摘要（默认折叠态）：用户发言 + 最终结论预览。
    `.sf-turnSummary{display:flex;flex-direction:column;gap:4px;padding:0 10px 9px;cursor:pointer}`,
    `.sf-turnSummary:hover{background:rgba(90,140,255,.04)}`,
    `.sf-turnSummaryRow{display:flex;gap:8px;align-items:flex-start;min-width:0}`,
    `.sf-turnSummaryTag{flex:none;border-radius:6px;padding:0 6px;font-size:10.5px;line-height:16px;font-weight:600;margin-top:1px}`,
    `.sf-turnSummaryTag.user{background:rgba(90,140,255,.12);color:#4a7dff}`,
    `.sf-turnSummaryTag.ok{background:rgba(60,190,120,.15);color:#1c9e5a}`,
    `.sf-turnSummaryText{min-width:0;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow:hidden;font-size:12px;line-height:1.5;color:var(--dsw-alias-label-secondary,#666);word-break:break-word}`,
    `.sf-turnBody{padding:2px 10px 10px;display:flex;flex-direction:column;gap:8px}`,
    `.sf-msg{border-left:3px solid var(--dsw-alias-border-l2,#ddd);padding:2px 10px}`,
    `.sf-msgUser{border-left-color:#4a7dff}.sf-msgAssistant{border-left-color:#1c9e5a}`,
    `.sf-msgInject{border-left-color:#bbb;opacity:.85}`,
    `.sf-injectBadge{display:inline-block;border-radius:6px;background:rgba(120,120,120,.14);color:var(--dsw-alias-label-secondary,#888);padding:0 6px;font-size:10.5px;line-height:15px;margin-left:8px;vertical-align:middle}`,
    `.sf-msgTextInject{display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:3;overflow:hidden;cursor:pointer;white-space:pre-wrap;word-break:break-word;font-size:12px;line-height:1.5;color:var(--dsw-alias-label-secondary,#777)}`,
    `.sf-msgTextInject.sf-open{display:block;-webkit-line-clamp:unset}`,
    `.sf-msgRole{font-size:11px;font-weight:600;color:var(--dsw-alias-label-secondary,#888);margin-bottom:2px}`,
    // 核心内容（用户发言/最终结论）：默认可见，超过 5 行折叠（line-clamp），点击展开/收起。
    `.sf-msgText{display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:5;overflow:hidden;cursor:pointer;white-space:pre-wrap;word-break:break-word;font-size:12.5px;line-height:1.55}`,
    `.sf-msgText.sf-open{display:block;-webkit-line-clamp:unset}`,
    // 思考内容：默认只显示 2 行。
    `.sf-thinking{display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow:hidden;cursor:pointer;white-space:pre-wrap;word-break:break-word;color:var(--dsw-alias-label-tertiary,#999);font-size:12px;line-height:1.5;padding:2px 0}`,
    `.sf-thinking.sf-open{display:block;-webkit-line-clamp:unset}`,
    `.sf-thinkingLabel{display:inline-block;font-size:11px;font-weight:600;color:#d97706;margin-right:6px}`,
    `.sf-msgToggle{font-size:11px;color:#4a7dff;cursor:pointer;border:none;background:none;padding:2px 0;display:inline-block}`,
    `.sf-msgToggle:hover{text-decoration:underline}`,
    `.sf-step{display:flex;flex-direction:column;gap:4px}`,
    `.sf-stepHead{font-size:11px;font-weight:600;color:var(--dsw-alias-label-secondary,#888);display:flex;gap:8px;align-items:center}`,
    `.sf-tool{border:1px solid var(--dsw-alias-border-l2,#e5e5e5);border-radius:8px;background:var(--dsw-alias-bg-base,#fff);scroll-margin-top:8px}`,
    `.sf-toolHead{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:5px 9px;cursor:pointer;border-radius:8px;font-size:12.5px}`,
    `.sf-toolHead:hover{background:rgba(90,140,255,.06)}`,
    `.sf-toolName{font-weight:600;font-family:ui-monospace,Consolas,monospace;background:rgba(90,140,255,.1);border-radius:5px;padding:1px 7px;color:var(--dsw-alias-label-primary,#333)}`,
    `.sf-toolArgPrev{flex:1 1 auto;min-width:0;font-family:ui-monospace,Consolas,monospace;font-size:11.5px;color:var(--dsw-alias-label-secondary,#666);background:rgba(127,127,127,.08);border-radius:4px;padding:1px 6px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:60%}`,
    `.sf-toolStatus{width:8px;height:8px;border-radius:50%;flex:none}`,
    `.sf-toolStatus.ok{background:#1c9e5a}.sf-toolStatus.err{background:#d43b3b}.sf-toolStatus.run{background:#d97706}`,
    `.sf-toolBody{padding:2px 9px 9px;display:flex;flex-direction:column;gap:6px}`,
    `.sf-pre{background:var(--dsw-specific-input-major,#f5f5f5);border:1px solid var(--dsw-alias-border-l2,#e5e5e5);border-radius:6px;padding:6px 8px;white-space:pre-wrap;word-break:break-word;font-size:12px;line-height:1.5;max-height:260px;overflow:auto;margin:0;font-family:ui-monospace,Consolas,monospace}`,
    `.sf-pre.err{border-color:rgba(230,80,80,.4);background:rgba(230,80,80,.05)}`,
    `.sf-preLabel{font-size:11px;font-weight:600;color:var(--dsw-alias-label-secondary,#888)}`,
    `.sf-chip{display:inline-block;border-radius:6px;background:rgba(90,140,255,.1);color:#4a7dff;padding:0 6px;font-size:11px;line-height:18px;font-family:ui-monospace,Consolas,monospace;cursor:pointer;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;vertical-align:middle}`,
    `.sf-chip:hover{background:rgba(90,140,255,.2)}`,
    // ── 右侧用户发言大纲 ──
    `.sf-navItem{position:relative;display:flex;gap:7px;align-items:flex-start;border-radius:8px;padding:5px 8px;cursor:pointer;font-size:12px;line-height:1.5;border:1px solid transparent}`,
    `.sf-navItem:hover{background:rgba(90,140,255,.07);border-color:var(--dsw-alias-border-l2,#e5e5e5)}`,
    `.sf-navIndex{flex:none;color:#4a7dff;font-weight:600;font-size:11px;line-height:18px;min-width:20px;text-align:right}`,
    `.sf-navText{min-width:0;color:var(--dsw-alias-label-secondary,#666);display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;word-break:break-word;padding-right:30px}`,
    // 回合标识统一固定在卡片右上角（不再跟随内容流，一行内也明显可见）。
    `.sf-navTurn{position:absolute;top:5px;right:8px;flex:none;color:var(--dsw-alias-label-tertiary,#999);font-size:10.5px;line-height:14px}`,
    // ── 血缘树 ──
    `.sf-tree{flex:none;width:280px;min-width:240px;overflow:auto;border-right:1px solid var(--dsw-alias-border-l2,#eee);padding-right:10px;display:flex;flex-direction:column;gap:2px}`,
    `.sf-treeRow{display:flex;align-items:center;gap:6px;padding:4px 6px;border-radius:6px;cursor:pointer;font-size:12px;line-height:18px;min-width:0}`,
    `.sf-treeRow:hover{background:rgba(90,140,255,.07)}`,
    `.sf-treeRow[data-active]{background:rgba(90,140,255,.13)}`,
    `.sf-treeIndent{flex:none;width:14px}`,
    `.sf-treeCaret{flex:none;width:12px;text-align:center;color:var(--dsw-alias-label-tertiary,#999)}`,
    `.sf-treeLabel{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}`,
    `.sf-liveDot{flex:none;width:7px;height:7px;border-radius:50%}`,
    `.sf-liveDot.running{background:#1c9e5a}.sf-liveDot.inactive{background:#bbb}`,
    `.sf-treeMeta{flex:none;font-size:10.5px;color:var(--dsw-alias-label-tertiary,#999)}`,
    `.sf-treeDetail{flex:1;min-width:0;overflow:auto;display:flex;flex-direction:column;gap:10px;padding-left:12px}`,
    // ── 档案统计条（M5b）──
    `.sf-statsBar{flex:none;display:flex;align-items:center;gap:6px;flex-wrap:wrap;font-size:12px}`,
    `.sf-statsLabel{flex:none;font-weight:600;color:var(--dsw-alias-label-secondary,#888);font-size:11.5px}`,
    `.sf-statChip{flex:none;display:inline-flex;align-items:center;gap:4px;border-radius:999px;border:1px solid var(--dsw-alias-border-l2,#ddd);background:var(--dsw-specific-input-major,#f5f5f5);color:var(--dsw-alias-label-secondary,#666);padding:2px 10px;font-size:11.5px;cursor:default}`,
    `.sf-statChip.active{background:rgba(230,80,80,.12);border-color:#d43b3b;color:#d43b3b;font-weight:600;cursor:pointer}`,
    `.sf-statChip.clickable{cursor:pointer}`,
    `.sf-statChip.clickable:hover{border-color:var(--dsw-specific-accent,#4a7dff);color:var(--dsw-alias-label-primary,#222)}`,
    `.sf-statCount{flex:none;border-radius:999px;background:rgba(120,120,120,.14);min-width:16px;text-align:center;padding:0 5px;font-size:10.5px;line-height:15px}`,
    `.sf-statCount.err{background:rgba(230,80,80,.15);color:#d43b3b}`,
    // ── 缓存管理面板 ──
    `.sf-btnActive{background:rgba(90,140,255,.12);border-color:#4a7dff;color:#4a7dff}`,
    `.sf-btnDanger{color:#d43b3b;border-color:rgba(230,80,80,.4)}`,
    `.sf-btnDanger:hover{background:rgba(230,80,80,.08)}`,
    `.sf-cachePanel{flex:none;display:flex;flex-direction:column;gap:6px;border:1px solid var(--dsw-alias-border-l2,#e5e5e5);border-radius:10px;background:var(--dsw-specific-input-major,#fafafa);padding:10px 12px;font-size:12px}`,
    `.sf-cacheRow{display:flex;align-items:center;gap:8px;min-width:0}`,
    `.sf-cacheLabel{flex:none;font-weight:600;color:var(--dsw-alias-label-secondary,#888)}`,
    `.sf-cacheValue{font-variant-numeric:tabular-nums;font-family:ui-monospace,Consolas,monospace}`,
    // 方向 A：跨会话全文检索结果区（与元数据筛选结果分区展示）。
    `.sf-fulltext{flex:none;border:1px solid rgba(90,140,255,.3);background:rgba(90,140,255,.05);border-radius:10px;padding:8px 10px;display:flex;flex-direction:column;gap:4px;max-height:220px;overflow:auto}`,
    `.sf-fulltextHead{display:flex;align-items:center;gap:8px;flex:none}`,
    `.sf-fulltextTitle{font-weight:700;font-size:12px;color:var(--dsw-alias-label-primary,#222)}`,
    `.sf-fulltextHit{border-radius:8px;padding:5px 8px;cursor:pointer;display:flex;flex-direction:column;gap:2px;min-width:0}`,
    `.sf-fulltextHit:hover{background:rgba(90,140,255,.1)}`,
    `.sf-fulltextHitTitle{display:flex;align-items:center;gap:8px;min-width:0}`,
    `.sf-fulltextName{flex:1;min-width:0;font-size:12px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--dsw-alias-label-primary,#222)}`,
    `.sf-fulltextCount{flex:none;border-radius:999px;background:rgba(90,140,255,.15);color:#4a7dff;font-size:10px;line-height:15px;min-width:18px;text-align:center;padding:0 5px;font-weight:700}`,
    `.sf-fulltext .sf-muted{font-size:11px;color:var(--dsw-alias-label-secondary,#666)}`,
    // M12：详情并入右侧栏（details 槽位轻量视图）。
    `.dk-root{box-sizing:border-box;height:100%;min-height:0;display:flex;flex-direction:column;gap:8px;padding:10px 12px;overflow:hidden;color:var(--dsw-alias-label-primary,#222);font-family:var(--dsw-font-family,inherit)}`,
    `.dk-head{flex:none;display:flex;align-items:center;gap:8px;min-width:0}`,
    `.dk-title{flex:1;min-width:0;font-size:13px;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}`,
    `.dk-btn{flex:none;border:1px solid var(--dsw-alias-border-l2,#ddd);background:var(--dsw-alias-bg-layer-1,#f5f5f5);color:var(--dsw-alias-label-primary,#222);border-radius:7px;padding:3px 9px;font-size:11px;cursor:pointer}`,
    `.dk-btn:hover{border-color:var(--dsw-alias-brand-primary,#4a7dff);color:var(--dsw-alias-brand-primary,#4a7dff)}`,
    `.dk-body{flex:1;min-height:0;overflow:auto;display:flex;flex-direction:column;gap:6px}`,
    `.dk-summary{border:1px solid var(--dsw-alias-border-l2,#e4e6eb);border-radius:10px;padding:8px 10px;background:var(--dsw-alias-bg-layer-1,#f8f9fa);flex:none;display:flex;flex-direction:column;gap:4px}`,
    `.dk-summaryRow{display:flex;gap:6px;font-size:11.5px;line-height:1.5;color:var(--dsw-alias-label-secondary,#666);min-width:0}`,
    `.dk-summaryTag{flex:none;border-radius:5px;padding:0 5px;font-size:10px;line-height:16px;font-weight:700;background:rgba(90,140,255,.12);color:#4a7dff}`,
    `.dk-summaryText{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}`,
    `.dk-summaryFull{font-size:12px;line-height:1.6;color:var(--dsw-alias-label-primary,#222);white-space:pre-wrap;word-break:break-word;max-height:140px;overflow:auto}`,
    // M12：并入期间禁用 layout grid 列宽过渡——官方会话切换会 closeDetails（宽 360→0），
    // 守护重开（0→360）若带过渡动画会产生「关→开」闪烁；禁用后切换直接刷新内容（实测踩坑）。
    `html[data-dsh-dock-active] [class*=frame],html[data-dsh-dock-active] [data-side=details]{transition:none!important}`,
    // ── M5 会话摘要卡 ──
    `.sf-summaryCard{flex:none;display:flex;flex-direction:column;gap:5px;border:1px solid var(--dsw-alias-border-l2,#e5e5e5);border-radius:10px;background:var(--dsw-specific-input-major,#fafafa);padding:9px 12px;font-size:12px}`,
    `.sf-summaryHead{display:flex;align-items:center;gap:8px}`,
    `.sf-summaryTitle{font-weight:700;font-size:12.5px}`,
    `.sf-summaryRow{display:flex;gap:8px;align-items:flex-start;min-width:0}`,
    `.sf-summaryFull{min-width:0;white-space:pre-wrap;word-break:break-word;font-size:12px;line-height:1.6;color:var(--dsw-alias-label-secondary,#666);overflow:visible}`,
    `.sf-summaryStale{flex:none;font-size:11px;line-height:1.5;color:#b8860b;background:rgba(255,193,7,.14);border:1px solid rgba(255,193,7,.4);border-radius:6px;padding:4px 8px;cursor:pointer;margin-top:2px}`,
    `.sf-liveBar{display:flex;align-items:center;gap:10px;border:1px solid rgba(28,158,90,.35);background:rgba(28,158,90,.06);border-radius:8px;padding:5px 10px;font-size:12px;flex-wrap:wrap}`,
    // 实时状态行：文本区弹性收缩（nowrap+省略），按钮固定右侧，事件数/时间变化不引起跳动。
    `.sf-liveBar .sf-liveText{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;display:flex;align-items:center;gap:8px}`,
    `.sf-liveBar .sf-liveExitBtn{flex:none;margin-left:auto}`,
    // ── 右侧导航标签（用户/工具/错误/检索）──
    `.sf-navTabs{flex:none;display:flex;gap:3px;flex-wrap:wrap;border-bottom:1px solid var(--dsw-alias-border-l2,#e5e5e5);padding-bottom:6px}`,
    `.sf-navTab{flex:1 1 44px;min-width:0;display:inline-flex;align-items:center;justify-content:center;gap:4px;border:1px solid transparent;border-radius:8px;background:none;color:var(--dsw-alias-label-secondary,#666);font-size:11.5px;cursor:pointer;padding:4px 5px;white-space:nowrap;overflow:hidden}`,
    `.sf-navTab:hover{background:rgba(90,140,255,.06)}`,
    `.sf-navTab.active{background:rgba(90,140,255,.12);border-color:rgba(90,140,255,.25);color:#4a7dff;font-weight:600}`,
    `.sf-navTabLabel{min-width:0;overflow:hidden;text-overflow:ellipsis}`,
    `.sf-navIcon{flex:none;display:inline-flex;align-items:center;justify-content:center;color:currentColor}`,
    `.sf-navTabCount{flex:none;border-radius:999px;background:rgba(120,120,120,.14);min-width:15px;text-align:center;padding:0 4px;font-size:10px;line-height:14px}`,
    `.sf-navTabCount.err{background:rgba(230,80,80,.15);color:#d43b3b}`,
    `.sf-navBody{flex:1;min-height:0;overflow:auto;display:flex;flex-direction:column;gap:2px}`,
    `.sf-navToolGroup{display:flex;flex-direction:column;gap:1px}`,
    `.sf-navToolHead{display:flex;align-items:center;gap:6px;padding:4px 6px;border-radius:6px;cursor:pointer;font-size:12px;min-width:0}`,
    `.sf-navToolHead:hover{background:rgba(90,140,255,.07)}`,
    `.sf-navToolName{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:600;font-family:ui-monospace,Consolas,monospace;font-size:11.5px}`,
    // ── 会话内检索（M5c 方案C）──
    `.sf-navKind{flex:none;border-radius:6px;padding:0 5px;font-size:10px;line-height:15px;font-weight:600;font-family:ui-monospace,Consolas,monospace}`,
    `.sf-navKind.tool{background:rgba(90,140,255,.12);color:#4a7dff}`,
    `.sf-navKind.error{background:rgba(230,80,80,.13);color:#d43b3b}`,
    `.sf-navKind.user{background:rgba(60,190,120,.15);color:#1c9e5a}`,
    `.sf-navKind.thinking{background:rgba(240,150,60,.15);color:#d97706}`,
    `.sf-navKind.assistant{background:rgba(120,120,120,.14);color:#666}`,
    `@keyframes sfFlashBg{0%{background:rgba(90,140,255,.4)}100%{background:transparent}}`,
    `.sf-flash{animation:sfFlashBg 1.5s ease}`,
    // ── M11 本会话轮次导航（会话页左侧常驻悬浮条目条，DeepSeek 悬浮导航风格）──
    // 只显示【当前会话】的对话轮次（用户消息），不跨会话/不跨工作区；
    // DOM 锚点驱动（data-time-hover-root，dsh-navbar 同款，零 RPC）。
    // 形态：默认收拢为一列短横条（胶囊线，极简不占空间），悬浮/聚焦展开为文字条目卡；
    // 垂直居中悬浮于会话内容区中间（top 由组件算区中心 + translateY(-50%)）。
    // 动画体系：一切组件的产生/消失都有「来源与目标」——display 硬切全部改为
    // transform/opacity/max-height 过渡（实测踩坑：display 切换无动画、视觉突兀）。
    `[data-dsh-piano-keys]{position:fixed;left:0;top:50%;width:32px;max-height:60vh;z-index:15;display:flex;flex-direction:column;font-family:var(--dsw-font-family,inherit);transition:width .26s cubic-bezier(.3,1.15,.4,1) .22s}`,
    // 收拢时序：离开时宽度过渡延迟 .22s——信息面板先滑出（.24s），悬浮条主体再收拢
    // （用户要求：收拢第一步先收起详情信息框）；进入（hover/focus）无延迟即时展开。
    `[data-dsh-piano-keys]:hover,[data-dsh-piano-keys]:focus-within{width:200px;transition-delay:0s}`,
    `html[${ACTIVE_ATTR}] [data-dsh-piano-keys]{display:none!important}`,
    `.pk-strip{flex:1;min-height:0;max-height:calc(60vh - 60px);overflow-y:auto;overflow-x:hidden;display:flex;flex-direction:column;gap:5px;padding:8px 4px;scrollbar-width:none;outline:none}`,
    `.pk-strip::-webkit-scrollbar{display:none}`,
    // 收拢态：短横条（胶囊线）；overflow:hidden 使 label 文字被高度裁剪（来源=胶囊）；
    // ::before 延伸命中区（±4px，点击/悬浮无死区）。
    `.pk-key{position:relative;flex:none;height:4px;min-height:4px;border-radius:99px;border:none;cursor:pointer;padding:0;margin:0 4px;background:var(--dsw-alias-border-l2,#d7dae0);color:var(--dsw-alias-label-primary,#222);overflow:hidden;transition:height .22s ease,padding .22s ease,margin .22s ease,border-radius .22s ease,background .14s ease,border-color .14s ease,box-shadow .18s ease;outline:none;min-width:0}`,
    `.pk-key::before{content:'';position:absolute;left:0;right:0;top:-4px;bottom:-4px}`,
    `.pk-key:hover{background:var(--dsw-alias-brand-primary,#4a7dff)}`,
    `.pk-key:focus-visible{outline:2px solid var(--dsw-alias-brand-primary,#4a7dff);outline-offset:-1px}`,
    `.pk-keyActive{background:var(--dsw-alias-brand-primary,#4a7dff)}`,
    `.pk-keyFocus{background:var(--dsw-alias-brand-primary,#4a7dff)}`,
    // 展开态（悬浮/聚焦）：条目变文字卡片；label 常驻（缩略态被条目高度裁剪），
    // 展开时随高度过渡露出文字（来源=胶囊内部，目标=卡片全文）。
    `[data-dsh-piano-keys]:hover .pk-key,[data-dsh-piano-keys]:focus-within .pk-key{display:flex;align-items:center;gap:6px;height:auto;min-height:28px;border-radius:10px;border:1px solid var(--dsw-alias-border-l2,#e4e6eb);padding:5px 8px;margin:0;background:color-mix(in srgb,var(--dsw-alias-bg-base,#fff) 80%,transparent);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);box-shadow:0 1px 3px rgba(0,0,0,.07)}`,
    `[data-dsh-piano-keys]:hover .pk-key:hover,[data-dsh-piano-keys]:focus-within .pk-key:hover{background:color-mix(in srgb,var(--dsw-alias-bg-base,#fff) 96%,transparent);border-color:var(--dsw-alias-brand-primary,#4a7dff)}`,
    `[data-dsh-piano-keys]:hover .pk-keyActive,[data-dsh-piano-keys]:focus-within .pk-keyActive{border-color:var(--dsw-alias-brand-primary,#4a7dff);background:color-mix(in srgb,var(--dsw-alias-brand-primary,#4a7dff) 10%,var(--dsw-alias-bg-base,#fff))}`,
    `.pk-label{flex:1;min-width:0;font-size:12px;line-height:18px;max-height:18px;color:var(--dsw-alias-label-primary,#222);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;user-select:none;opacity:0;transition:opacity .18s ease .06s}`,
    `[data-dsh-piano-keys]:hover .pk-label,[data-dsh-piano-keys]:focus-within .pk-label{opacity:1}`,
    // 轮次序号：缩略态折叠（宽度 0 + 透明），展开态从左侧展开露出（来源=左缘）。
    `.pk-turnNo{flex:none;width:0;min-width:0;overflow:hidden;opacity:0;text-align:left;font-size:9.5px;line-height:16px;font-weight:600;color:var(--dsw-alias-label-tertiary,#999);font-family:ui-monospace,Consolas,monospace;user-select:none;white-space:nowrap;transition:width .22s ease,opacity .16s ease .04s}`,
    `[data-dsh-piano-keys]:hover .pk-turnNo,[data-dsh-piano-keys]:focus-within .pk-turnNo{width:28px;min-width:28px;opacity:1}`,
    // hover 条目：在【该条目右侧】展开信息面板（.pk-detail）——absolute 相对悬浮条容器，
    // 坐标按条目位置换算为容器内偏移（注意：容器有 transform:translateY(-50%)，fixed 子元素
    // 会被 transform 祖先劫持成相对容器定位——用视口坐标会双重偏移，实测踩坑）。
    `[data-dsh-piano-keys]:hover .pk-key:hover,[data-dsh-piano-keys]:focus-within .pk-key.pk-keyFocus{position:relative;z-index:2;box-shadow:0 4px 16px rgba(0,0,0,.18)}`,
    // 展开时序：详情框延迟 .28s 再滑入——等悬浮条展开动画完成、条目就位后，
    // 位置才准确（第一次展开时条目仍在变形，立即计算会错位，实测踩坑）；
    // 隐藏则立即（无延迟）。
    `.pk-detail{position:absolute;left:0;top:0;width:264px;max-height:calc(60vh - 40px);display:flex;flex-direction:column;gap:6px;background:color-mix(in srgb,var(--dsw-alias-bg-base,#fff) 76%,transparent);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);border:1px solid var(--dsw-alias-border-l2,#e4e6eb);border-radius:12px;box-shadow:0 8px 28px rgba(0,0,0,.18);padding:10px 12px;z-index:6;overflow:hidden;opacity:1;transform:translateX(0);transition:opacity .18s ease .28s,transform .24s cubic-bezier(.25,1.1,.4,1) .28s,visibility .24s .28s}`,
    `.pk-detail.hidden{opacity:0;transform:translateX(14px);visibility:hidden;pointer-events:none;transition:opacity .18s ease,transform .24s cubic-bezier(.25,1.1,.4,1),visibility .24s}`,
    `.pk-detailHead{flex:none;font-size:10.5px;font-weight:700;color:var(--dsw-alias-label-secondary,#666);font-family:ui-monospace,Consolas,monospace;letter-spacing:.2px}`,
    // 面板内容随条目切换：新内容从右轻滑入（key 变化重新挂载触发 animation）。
    `.pk-detailBody{min-height:0;font-size:12.5px;line-height:1.6;color:var(--dsw-alias-label-primary,#222);white-space:pre-wrap;word-break:break-word;overflow-y:auto;max-height:320px;animation:pkSlideIn .22s ease}`,
    `@keyframes pkSlideIn{from{opacity:0;transform:translateX(10px)}to{opacity:1;transform:translateX(0)}}`,
    // 跳转状态提示条（悬浮条下方，与悬浮条等宽）：文字在条宽内换行增高显示完整
    // 文案（不加宽），从下方淡入/淡出（来源=悬浮条底缘）；毛玻璃。
    `.pk-status{position:absolute;left:0;right:0;top:calc(100% + 4px);padding:7px 10px;border-radius:8px;background:color-mix(in srgb,var(--dsw-alias-bg-base,#fff) 82%,transparent);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);border:1px solid var(--dsw-alias-border-l2,#e4e6eb);font-size:11px;line-height:1.5;color:var(--dsw-alias-label-secondary,#666);box-shadow:0 4px 14px rgba(0,0,0,.12);z-index:6;text-align:center;white-space:normal;word-break:break-word;opacity:1;transform:translateY(0);transition:opacity .18s ease,transform .22s ease,visibility .22s}`,
    `.pk-status.hidden{opacity:0;transform:translateY(8px);visibility:hidden;pointer-events:none}`,
    `.pk-status.warn{color:#d97706;border-color:rgba(217,119,6,.4)}`,
    // 展开态显示悬浮条细滚动条（缩略态保持无滚动条）。
    `[data-dsh-piano-keys]:hover .pk-strip,[data-dsh-piano-keys]:focus-within .pk-strip{scrollbar-width:thin;scrollbar-color:var(--dsw-alias-border-l2,#d7dae0) transparent}`,
    `[data-dsh-piano-keys]:hover .pk-strip::-webkit-scrollbar,[data-dsh-piano-keys]:focus-within .pk-strip::-webkit-scrollbar{width:6px;display:block}`,
    `[data-dsh-piano-keys]:hover .pk-strip::-webkit-scrollbar-thumb{background:var(--dsw-alias-border-l2,#d7dae0);border-radius:3px}`,
    // 头部：从上方滑入（来源=悬浮条顶缘）——max-height/padding/opacity/transform 过渡，
    // 不占缩略态布局。内容「标题 + ▲▼ 按钮组（并排右上）」。
    `.pk-head{display:flex;flex:none;align-items:center;gap:4px;padding:0 6px;color:var(--dsw-alias-label-secondary,#666);font-size:10px;line-height:1.2;border-bottom:1px solid var(--dsw-alias-border-l2,#e5e5e5);max-height:0;overflow:hidden;opacity:0;transform:translateY(-6px);transition:max-height .24s ease,padding .24s ease,opacity .18s ease,transform .24s ease}`,
    `[data-dsh-piano-keys]:hover .pk-head,[data-dsh-piano-keys]:focus-within .pk-head{max-height:30px;padding-top:5px;padding-bottom:5px;opacity:1;transform:translateY(0)}`,
    `.pk-headLabel{flex:1;min-width:0;font-size:10.5px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}`,
    `.pk-navGroup{flex:none;display:flex;gap:3px}`,
    `.pk-navBtn{flex:none;width:20px;height:20px;border:1px solid var(--dsw-alias-border-l2,#ddd);background:var(--dsw-alias-bg-layer-1,#f5f5f5);color:var(--dsw-alias-label-primary,#222);border-radius:6px;cursor:pointer;font-size:9px;line-height:1;padding:0;transition:border-color .14s ease,color .14s ease}`,
    `.pk-navBtn:hover:not(:disabled){border-color:var(--dsw-alias-brand-primary,#4a7dff);color:var(--dsw-alias-brand-primary,#4a7dff)}`,
    `.pk-navBtn:disabled{opacity:.35;cursor:default}`,
    `@keyframes sfPianoPulse{0%,100%{opacity:.35}50%{opacity:1}}`,
  ].join('\n')

  // ── API ─────────────────────────────────────────────────────────────
  function api(method, params, signal) {
    return fetch('/api/session-flow', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(Object.assign({ method }, params || {})),
      signal,
    }).then((r) => r.json())
  }

  // ── 迷你 Markdown 渲染（LLM 摘要用）────────────────────────────────
  // 摘要里的 **加粗** / *斜体* / `行内代码` / 列表 / 标题若按纯文本渲染会
  // 原样显示星号；这里做最小解析成 React 元素（不引入 marked 依赖）。
  // 输出为元素数组；无任何匹配时返回 null 由调用方按纯文本兜底。
  function renderSummaryMd(text) {
    const src = String(text || '')
    if (!src) return null
    const out = []
    const lines = src.split(/\r?\n/)
    let i = 0
    let listBuf = null // { ordered, items: [] }
    const flushList = () => {
      if (listBuf) {
        out.push(h(listBuf.ordered ? 'ol' : 'ul', { style: { margin: '2px 0 2px 18px', padding: 0 } },
          listBuf.items.map((it, k) => h('li', { key: k, style: { margin: '1px 0' } }, it))))
        listBuf = null
      }
    }
    while (i < lines.length) {
      const line = lines[i]
      const trimmed = line.trim()
      // 空行：结束当前段落/列表。
      if (!trimmed) { flushList(); i++; continue }
      // 列表项：- / * / 1. 开头（宽松匹配）。
      const liMatch = trimmed.match(/^([-*]|\d+[.)])\s+(.*)$/)
      if (liMatch) {
        if (!listBuf || listBuf.ordered !== /^\d/.test(liMatch[1])) {
          flushList()
          listBuf = { ordered: /^\d/.test(liMatch[1]), items: [] }
        }
        listBuf.items.push(inlineMd(liMatch[2]))
        i++
        continue
      }
      flushList()
      // 标题：## / ### 开头。
      const hd = trimmed.match(/^(#{1,4})\s+(.*)$/)
      if (hd) {
        out.push(h('div', { style: { fontWeight: 700, margin: '3px 0 1px' } }, inlineMd(hd[2])))
        i++
        continue
      }
      // 普通段落行（连续非空行合并为一段）。
      const para = []
      while (i < lines.length && lines[i].trim()) { para.push(lines[i]); i++ }
      out.push(h('div', { style: { margin: '1px 0' } }, inlineMd(para.join('\n'))))
    }
    flushList()
    return out.length > 0 ? out : null
  }
  // 行内样式：**加粗**、*斜体*、`行内代码`；按 token 切分后逐段转元素。
  function inlineMd(str) {
    const tokens = String(str).split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g).filter((t) => t !== '')
    if (tokens.length <= 1) return str
    return tokens.map((t, k) => {
      if (/^\*\*[^*]+\*\*$/.test(t)) return h('strong', { key: k }, t.slice(2, -2))
      if (/^\*[^*]+\*$/.test(t)) return h('em', { key: k }, t.slice(1, -1))
      if (/^`[^`]+`$/.test(t)) return h('code', { key: k, style: { fontFamily: 'monospace', background: 'rgba(127,127,127,.15)', borderRadius: 3, padding: '0 3px' } }, t.slice(1, -1))
      return t
    })
  }

  // ── 格式化工具 ──────────────────────────────────────────────────────
  function fmtTime(ms) {
    if (ms === null || ms === undefined) return '—'
    const d = new Date(ms)
    const pad = (n) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
  }

  function fmtDuration(ms) {
    if (ms === null || ms === undefined) return '—'
    const s = Math.max(0, Math.floor(ms / 1000))
    if (s < 60) return s + 's'
    const m = Math.floor(s / 60)
    if (m < 60) return m + 'm ' + (s % 60) + 's'
    const hh = Math.floor(m / 60)
    return hh + 'h ' + (m % 60) + 'm'
  }

  function fmtSize(bytes) {
    if (bytes === null || bytes === undefined) return '—'
    if (bytes < 1024) return bytes + ' B'
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KiB'
    return (bytes / 1024 / 1024).toFixed(1) + ' MiB'
  }

  // ── M8a 会话重命名：行内编辑（总览卡片 / 详情页标题复用）─────────────
  // props: { initial, onSave: (title) => Promise, onCancel, placeholder }
  // 保存成功（ok truthy / 无返回）由父组件退出编辑态；失败（reject / ok===false）留在编辑态显示错误。
  function RenameInline(props) {
    const [value, setValue] = useState(props.initial || '')
    const [saving, setSaving] = useState(false)
    const [err, setErr] = useState('')
    const inputRef = useRef(null)
    useEffect(() => {
      const el = inputRef.current
      if (el) { el.focus(); el.select() }
    }, [])
    const commit = () => {
      if (saving) return
      const v = value.trim()
      if (v === String(props.initial || '').trim()) { props.onCancel(); return }
      setSaving(true)
      setErr('')
      Promise.resolve(props.onSave(v)).then((ok) => {
        if (ok === false) setSaving(false)
      }).catch((e) => {
        setSaving(false)
        setErr(String(e && e.message || e))
      })
    }
    return h('span', { className: 'sf-renameWrap' },
      h('input', {
        ref: inputRef,
        className: 'sf-renameInput',
        value,
        placeholder: props.placeholder || STR.renamePlaceholder,
        disabled: saving,
        onInput: (e) => setValue(e.target.value),
        onKeyDown: (e) => {
          if (e.key === 'Enter') commit()
          else if (e.key === 'Escape') { e.stopPropagation(); props.onCancel() }
        },
        onBlur: commit,
        onClick: (e) => e.stopPropagation(),
      }),
      err && h('span', { className: 'sf-renameErr' }, err),
    )
  }

  // ── 总览页 ──────────────────────────────────────────────────────────
  // props: { onOpen: (session) => void, onClose: () => void }
  function SessionFlowOverview(props) {
    const [state, setState] = useState({ phase: 'loading', error: null, data: null })
    const [query, setQuery] = useState('')
    const [wsFilter, setWsFilter] = useState('')
    const [sort, setSort] = useState('recent') // 默认：最近运行（最后活动时间）
    const [showEmpty, setShowEmpty] = useState(false) // 默认隐藏空会话
    const [showIssues, setShowIssues] = useState(false) // 问题速览：只看有错误记录的会话
    // 缓存管理面板。
    const [cacheOpen, setCacheOpen] = useState(false)
    const [cacheInfo, setCacheInfo] = useState(null)
    const [cacheBusy, setCacheBusy] = useState(false)
    const [cacheMsg, setCacheMsg] = useState('')
    // 方向 A：跨会话全文检索（防抖 500ms；AbortController 取消；结果区渲染）。
    const [fullText, setFullText] = useState(null) // {phase:'searching'|'done'|'error', query, results, scanned, total, hasMore, error}
    const fullTextAbort = useRef(null)
    const fullTextTimer = useRef(null)
    // M8a：当前编辑重命名的会话 id（null = 无编辑态）。
    const [renamingId, setRenamingId] = useState(null)
    // M8a：保存自定义标题 → 更新本地列表数据（userTitle 覆盖显示，不整页重刷）。
    const saveRename = (sid, title) => {
      return api('rename', { sessionId: sid, title }).then((json) => {
        if (json && json.ok) {
          setState((prev) => {
            if (!prev || !prev.data) return prev
            return {
              ...prev,
              data: {
                ...prev.data,
                workspaces: (prev.data.workspaces || []).map((g) => ({
                  ...g,
                  sessions: (g.sessions || []).map((s) => (s.id === sid ? { ...s, userTitle: json.userTitle } : s)),
                })),
              },
            }
          })
          setRenamingId(null)
          return true
        }
        throw new Error((json && json.error) || STR.renameFail)
      })
    }
    useEffect(() => () => {
      if (fullTextTimer.current) clearTimeout(fullTextTimer.current)
      if (fullTextAbort.current) fullTextAbort.current.abort()
    }, [])
    useEffect(() => {
      const q = query.trim()
      const isStructured = /^(tool|file|path|err|error):/i.test(q)
      if (fullTextTimer.current) clearTimeout(fullTextTimer.current)
      if (fullTextAbort.current) { fullTextAbort.current.abort(); fullTextAbort.current = null }
      // 结构化前缀走元数据筛选（已有）；自由文本 ≥2 字符才触发全文检索。
      if (q.length < 2 || isStructured) { setFullText(null); return }
      fullTextTimer.current = setTimeout(() => {
        const ctrl = new AbortController()
        fullTextAbort.current = ctrl
        setFullText({ phase: 'searching', query: q, results: null, scanned: 0, total: 0, hasMore: false, error: '' })
        api('searchAll', { query: q, workspace: wsFilter || undefined }, ctrl.signal).then((json) => {
          if (json && json.ok) {
            setFullText({ phase: 'done', query: q, results: json.results || [], scanned: json.scanned || 0, total: json.total || 0, hasMore: json.hasMore === true, error: '' })
          } else {
            setFullText((p) => p && p.query === q ? { phase: 'error', query: q, results: null, scanned: 0, total: 0, hasMore: false, error: (json && json.error) || STR.fullTextFail } : p)
          }
        }).catch((e) => {
          if (e && e.name === 'AbortError') return
          setFullText((p) => p && p.query === q ? { phase: 'error', query: q, results: null, scanned: 0, total: 0, hasMore: false, error: String(e && e.message || e) } : p)
        })
      }, 500)
    }, [query, wsFilter])
    // 命中跳转：localStorage 桥（会话流标签页读取后执行会话内检索定位）+ 原生打开会话。
    const openFullTextHit = (hit) => {
      try {
        // 预写目标会话的 chat store view='session-flow'：会话打开时（store 按会话重建并
        // rehydrate localStorage）自动激活「会话流」标签页，而非停在默认 Chat 标签。
        const storeKey = 'dsh.conversation.chat.' + hit.sessionId
        let st = {}
        try { const raw = localStorage.getItem(storeKey); if (raw) st = JSON.parse(raw) } catch (e) {}
        st.view = 'session-flow'
        localStorage.setItem(storeKey, JSON.stringify(st))
        localStorage.setItem(PENDING_SEARCH_KEY, JSON.stringify({ sessionId: hit.sessionId, query: query.trim() }))
      } catch (e) {}
      try { props.sessions.open(hit.sessionId) } catch (e) { console.warn('[dsh-session-flow] open failed', hit.sessionId, e) }
      // 关闭工作台（中栏交还给会话），用户直接看到目标会话的会话流标签页——
      // 否则工作台仍覆盖中栏，需手动点侧边栏才可见（实测踩坑）。
      try { if (props.onClose) props.onClose() } catch (e) {}
    }
    const fmtBytes = (b) => {
      if (b === null || b === undefined) return '—'
      if (b < 1024) return b + ' B'
      if (b < 1024 * 1024) return (b / 1024).toFixed(1) + ' KiB'
      return (b / 1024 / 1024).toFixed(1) + ' MiB'
    }
    const loadCacheInfo = () => {
      api('cacheInfo').then((json) => {
        if (json && json.ok) setCacheInfo(json)
      }).catch(() => {})
    }
    // 打开缓存面板时默认自动刷新一次，避免首次进入数据为空。
    useEffect(() => {
      if (cacheOpen) loadCacheInfo()
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [cacheOpen])
    const cleanCache = (what) => {
      setCacheBusy(true)
      setCacheMsg('')
      api('cacheClean', { what }).then((json) => {
        if (json && json.ok) {
          setCacheMsg(STR.cacheDone + ': ' + json.removed + ' 个文件 / ' + fmtBytes(json.bytes))
          loadCacheInfo()
        } else {
          setCacheMsg((json && json.error) || 'failed')
        }
      }).catch((e) => setCacheMsg(String(e))).finally(() => setCacheBusy(false))
    }

    // 空会话判断：优先用索引标记，兼容旧缓存按内容指标兜底。
    const isSessionEmpty = (s) =>
      s.empty === true ||
      (!(s.userMessages || 0) && !(s.toolCalls || 0) && !(s.turns || 0))

    // 工作区显示名：与左侧栏一致只留最后一级目录；完整路径放 title（悬浮显示）。
    // 注意：必须在 useMemo 之前定义（const 的 TDZ——useMemo 回调先于其初始化执行会报错）。
    const wsLabelOf = (g) => g.label || g.name
    const wsCwdOf = (g) => g.cwd || null

    const load = () => {
      setState({ phase: 'loading', error: null, data: null })
      api('list').then((json) => {
        if (json && json.ok) setState({ phase: 'ready', error: null, data: json })
        else setState({ phase: 'error', error: (json && json.error) || 'list failed', data: null })
      }).catch((e) => setState({ phase: 'error', error: String(e), data: null }))
    }
    useEffect(() => { load() }, [])

    const rescan = () => {
      setState({ phase: 'loading', error: null, data: null })
      api('rescan', { force: true }).then((json) => {
        if (json && json.ok) setState({ phase: 'ready', error: null, data: json })
        else setState({ phase: 'error', error: (json && json.error) || 'rescan failed', data: null })
      }).catch((e) => setState({ phase: 'error', error: String(e), data: null }))
    }

    const rows = useMemo(() => {
      const ws = (state.data && state.data.workspaces) || []
      const q = query.trim().toLowerCase()
      // M5c 结构化检索前缀：tool: / file: / path: / err: / error:
      const st = /^(tool|file|path|err|error):(.*)$/.exec(q)
      const stKind = st ? st[1].toLowerCase() : null
      const stVal = st ? st[2].trim().toLowerCase() : ''
      const out = []
      for (const group of ws) {
        for (const s of group.sessions) {
          if (wsFilter !== '' && wsFilter !== group.name) continue
          // 子代理会话：不从总览混入，从详情页「血缘」树进入。
          if (s.parentSession) continue
          if (!showEmpty && isSessionEmpty(s)) continue // 默认隐藏空会话
          if (showIssues && !(s.toolErrors > 0)) continue // 问题速览：只看有错误记录的会话
          if (q !== '') {
            if (st) {
              // 结构化：按工具名 / 文件路径 / 错误信号精确检索。
              if (stKind === 'tool') {
                if (!(s.toolNames || []).some((n) => n.toLowerCase().includes(stVal))) continue
              } else if (stKind === 'file' || stKind === 'path') {
                if (!(s.artifactPaths || []).some((p) => p.toLowerCase().includes(stVal))) continue
              } else {
                if (!(s.toolErrors > 0)) continue
              }
            } else {
              // 自由文本：标题/工作区/ID/cwd + 工具名 + 文件路径宽松匹配。
              const hay = String(s.title || '') + ' ' + group.name + ' ' + String(s.id || '') + ' ' + String(s.cwd || '') +
                ' ' + (s.toolNames || []).join(' ') + ' ' + (s.artifactPaths || []).join(' ')
              if (!hay.toLowerCase().includes(q)) continue
            }
          }
          const now = Date.now()
          const running = s.lastEventTime !== null && s.lastEventTime !== undefined && (now - s.lastEventTime) < ACTIVE_WINDOW_MS
          out.push({ ...s, workspace: group.name, workspaceLabel: wsLabelOf(group), workspaceCwd: wsCwdOf(group), running, isEmpty: isSessionEmpty(s) })
        }
      }
      // 排序：除「最早创建」外均按降序。默认「最近运行」= 最后活动时间（lastEventTime）。
      const key = (r) => {
        if (sort === 'recent') return r.lastEventTime || 0
        if (sort === 'newest') return r.createdAt || 0
        if (sort === 'oldest') return r.createdAt || 0
        if (sort === 'tools') return r.toolCalls || 0
        if (sort === 'longest') return (r.lastEventTime || 0) - (r.createdAt || 0)
        return 0
      }
      const ascending = sort === 'oldest'
      out.sort((a, b) => (ascending ? key(a) - key(b) : key(b) - key(a)))
      return out
    }, [state.data, query, wsFilter, sort, showEmpty, showIssues])

    // M5b 档案统计：聚合工具出现热度与问题会话数，跟随选中的工作区（wsFilter）变化。
    const stats = useMemo(() => {
      const toolAgg = new Map()
      let issues = 0
      let roots = 0
      for (const g of (state.data && state.data.workspaces) || []) {
        if (wsFilter !== '' && wsFilter !== g.name) continue // 统计范围 = 当前选中的工作区
        for (const s of g.sessions) {
          if (s.parentSession) continue
          roots++
          if (s.toolErrors > 0) issues++
          for (const n of s.toolNames || []) toolAgg.set(n, (toolAgg.get(n) || 0) + 1)
        }
      }
      const topTools = [...toolAgg.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6)
      return { topTools, issues, roots }
    }, [state.data, wsFilter])

    const wsNames = ((state.data && state.data.workspaces) || []).map((g) => g.name)
    // 各工作区的会话计数（含空会话，反映磁盘全貌）。
    const wsCounts = new Map(((state.data && state.data.workspaces) || []).map((g) => [g.name, g.sessionCount]))
    const totalCount = ((state.data && state.data.workspaces) || []).reduce((a, g) => a + g.sessionCount, 0)

    const FOLDER_ICON = `<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M1.5 4.5a1 1 0 0 1 1-1h3.6l1.5 1.8h5.9a1 1 0 0 1 1 1v5.2a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1z"/></svg>`
    const FILTER_ICON = `<svg viewBox="0 0 16 16" width="11" height="11" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" aria-hidden="true"><path d="M2.5 4.5h11M4.5 8h7M6.5 11.5h3"/></svg>`

    return h('div', { className: 'sf-view' },
      h('div', { className: 'sf-viewHeader' },
        h('h2', { className: 'sf-viewTitle' }, STR.title),
        h('input', {
          className: 'sf-input', style: { flex: '1 1 200px', minWidth: 160 },
          placeholder: STR.search, value: query,
          onChange: (e) => setQuery(e.target.value),
        }),
        h('select', { className: 'sf-input', value: sort, onChange: (e) => setSort(e.target.value) },
          h('option', { value: 'recent' }, STR.sortRecent),
          h('option', { value: 'newest' }, STR.sortNewest),
          h('option', { value: 'oldest' }, STR.sortOldest),
          h('option', { value: 'tools' }, STR.sortTools),
          h('option', { value: 'longest' }, STR.sortLongest),
        ),
        h('label', { className: 'sf-muted', style: { display: 'inline-flex', alignItems: 'center', gap: 4, cursor: 'pointer', whiteSpace: 'nowrap' } },
          h('input', { type: 'checkbox', checked: showEmpty, onChange: (e) => setShowEmpty(e.target.checked) }),
          STR.showEmpty,
        ),
        h('button', { className: 'sf-btn', onClick: rescan, disabled: state.phase === 'loading' },
          state.phase === 'loading' ? STR.scanning : STR.rescan),
        h('button', { className: 'sf-btn' + (cacheOpen ? ' sf-btnActive' : ''), onClick: () => setCacheOpen(!cacheOpen) }, STR.cache),
        h('button', { className: 'sf-btn', onClick: props.onClose }, '✕ ' + STR.close),
      ),
      // 方向 A：跨会话全文检索结果区（防抖触发；与元数据筛选结果分区展示）。
      fullText && h('div', { className: 'sf-fulltext' },
        h('div', { className: 'sf-fulltextHead' },
          h('span', { className: 'sf-fulltextTitle' }, STR.fullText + '「' + fullText.query + '」'),
          fullText.phase === 'searching' && h('span', { className: 'sf-muted' }, STR.fullTextSearching),
          fullText.phase === 'done' && fullText.hasMore && h('span', { className: 'sf-muted' },
            STR.fullTextPartial.replace('{N}', String(fullText.scanned)).replace('{M}', String(fullText.total))),
        ),
        fullText.phase === 'error' && h('div', { className: 'sf-hint', style: { color: '#d43b3b' } }, STR.fullTextFail + ': ' + fullText.error),
        fullText.phase === 'done' && fullText.results.length === 0 && h('div', { className: 'sf-hint' }, STR.fullTextNone),
        fullText.phase === 'done' && fullText.results.map((hit) =>
          h('div', { key: hit.sessionId, className: 'sf-fulltextHit', onClick: () => openFullTextHit(hit) },
            h('div', { className: 'sf-fulltextHitTitle' },
              h('span', { className: 'sf-fulltextName' }, hit.userTitle || hit.title),
              h('span', { className: 'sf-fulltextCount' }, hit.matchCount),
            ),
            h('div', { className: 'sf-muted', style: { marginTop: 2 } },
              (hit.matches[0] ? hit.matches[0].preview : '') + ' · ' + hit.workspace),
          ),
        ),
      ),
      // 缓存管理面板：仅本插件缓存，查看体积 + 分类清理（清理后自动重建，无需重启）。
      cacheOpen && h('div', { className: 'sf-cachePanel' },
        h('div', { className: 'sf-muted', style: { flex: 'none' } }, STR.cacheHint),
        h('div', { className: 'sf-cacheRow' },
          h('span', { className: 'sf-cacheLabel' }, STR.cacheTotal),
          h('span', { className: 'sf-cacheValue' }, cacheInfo ? fmtBytes(cacheInfo.totalBytes) : '…'),
          h('button', { className: 'sf-btn', style: { marginLeft: 'auto' }, onClick: loadCacheInfo, disabled: cacheBusy }, '↻'),
        ),
        h('div', { className: 'sf-cacheRow' },
          h('span', { className: 'sf-cacheLabel' }, STR.cacheIndex + ' (' + (cacheInfo ? cacheInfo.indexFiles.length : '…') + ')'),
          h('span', { className: 'sf-cacheValue' }, cacheInfo ? fmtBytes(cacheInfo.indexBytes) : ''),
        ),
        h('div', { className: 'sf-cacheRow' },
          h('span', { className: 'sf-cacheLabel' }, STR.cacheTimeline + ' (' + (cacheInfo ? cacheInfo.timelineFiles.length : '…') + ')'),
          h('span', { className: 'sf-cacheValue' }, cacheInfo
            ? fmtBytes(cacheInfo.timelineBytes) + ' / ' + STR.cacheLimit + ' ' + fmtBytes(cacheInfo.timelineLimit)
            : ''),
          h('button', { className: 'sf-btn', style: { marginLeft: 'auto' }, onClick: () => cleanCache('timeline'), disabled: cacheBusy }, STR.cleanTimeline),
          h('button', { className: 'sf-btn sf-btnDanger', onClick: () => cleanCache('all'), disabled: cacheBusy }, STR.cleanAll),
        ),
        cacheMsg && h('div', { className: 'sf-muted' }, cacheMsg),
        (!cacheInfo || (cacheInfo.totalBytes === 0)) && h('div', { className: 'sf-muted' }, STR.cacheEmpty),
      ),
      // 工作区筛选 tabs：独立一行，醒目可见，点击切换；只显示末级目录名，悬浮显示完整路径。
      h('div', { className: 'sf-wsTabs' },
        h('button', { className: 'sf-wsTab', 'data-active': wsFilter === '' ? 'true' : undefined, onClick: () => setWsFilter('') },
          h('span', { className: 'sf-wsTabName' }, STR.allWorkspaces),
          h('span', { className: 'sf-wsTabCount' }, totalCount),
        ),
        ((state.data && state.data.workspaces) || []).map((g) =>
          h('button', {
            key: g.name, className: 'sf-wsTab', title: g.cwd || g.name,
            'data-active': wsFilter === g.name ? 'true' : undefined,
            onClick: () => setWsFilter(g.name),
          },
            h('span', { className: 'sf-wsTabName' }, wsLabelOf(g)),
            h('span', { className: 'sf-wsTabCount' }, wsCounts.get(g.name) || 0),
          )),
      ),
      // M5b 档案统计条：工具使用热度 + 问题会话速览。
      state.phase === 'ready' && h('div', { className: 'sf-statsBar' },
        h('span', { className: 'sf-statsLabel' }, STR.toolTop),
        stats.topTools.map(([name, cnt]) =>
          h('span', { key: name, className: 'sf-statChip', title: name + ' · ' + cnt + ' 个会话' },
            h('span', {}, name),
            h('span', { className: 'sf-statCount' }, cnt),
          )),
        h('button', {
          className: 'sf-statChip' + (showIssues ? ' active' : ' clickable'),
          title: STR.issuesHint,
          onClick: () => setShowIssues(!showIssues),
        },
          h('span', {}, '⚠ ' + STR.issues),
          h('span', { className: 'sf-statCount err' }, stats.issues),
        ),
      ),
      state.phase === 'loading' && h('div', { className: 'sf-hint' }, STR.scanning),
      state.phase === 'error' && h('div', { className: 'sf-hint', style: { color: '#d43b3b' } }, STR.loadFailed + ': ' + String(state.error)),
      state.phase === 'ready' && h('div', { className: 'sf-body' },
        rows.length === 0 && h('div', { className: 'sf-hint' }, STR.noMatch),
        rows.map((s) =>
          h('div', {
            key: s.id, className: 'sf-card', title: s.id,
            onClick: () => { props.onOpen(s, query) },
          },
            // 工作区行：只显示末级目录名（与左侧栏一致），悬浮显示完整路径；点击即筛选到该工作区。
            h('div', {
              className: 'sf-cardWs', title: s.workspaceCwd || s.workspace,
              onClick: (e) => { e.stopPropagation(); setWsFilter(s.workspace) },
            },
              h('span', { className: 'sf-cardWsIcon', dangerouslySetInnerHTML: { __html: FOLDER_ICON } }),
              h('span', { className: 'sf-cardWsName' }, s.workspaceLabel || s.workspace),
              h('span', { className: 'sf-cardWsFilter', dangerouslySetInnerHTML: { __html: FILTER_ICON } }),
            ),
            h('div', { className: 'sf-cardTitle' },
              renamingId === s.id
                ? h(RenameInline, {
                    initial: s.userTitle || s.title || '',
                    onSave: (t) => saveRename(s.id, t),
                    onCancel: () => setRenamingId(null),
                  })
                : h('span', { className: 'sf-cardText', style: { overflow: 'hidden', textOverflow: 'ellipsis' } },
                    s.userTitle || s.title || STR.unknownTitle,
                    s.userTitle && h('span', { className: 'sf-origTitle', title: s.title || STR.unknownTitle },
                      STR.origTitle + ': ' + (s.title || STR.unknownTitle)),
                    h('button', {
                      className: 'sf-renameBtn', title: STR.rename,
                      onClick: (e) => { e.stopPropagation(); setRenamingId(s.id) },
                    }, '✎'),
                  ),
              s.isEmpty && h('span', { className: 'sf-badge sf-badgeEnd' }, STR.emptySession),
              s.running ? h('span', { className: 'sf-badge sf-badgeRun' }, STR.running) : h('span', { className: 'sf-badge sf-badgeEnd' }, STR.ended),
              s.delegationDepth > 0 && h('span', { className: 'sf-badge sf-badgeSub' }, STR.subagent + ' · d' + s.delegationDepth),
              s.toolErrors > 0 && h('span', { className: 'sf-badge sf-badgeErr' }, STR.errors + ': ' + s.toolErrors),
            ),
            // 候选 B：最近结论（主行）+ 首个任务（小字）；无值不渲染；hover 悬浮全文。
            s.lastConclusion && h('div', { className: 'sf-cardConclusion', title: s.lastConclusion },
              h('span', { className: 'sf-cardTag' }, STR.conclusion),
              h('span', { className: 'sf-cardConclusionText' }, s.lastConclusion),
            ),
            s.firstTask && h('div', { className: 'sf-cardTask', title: s.firstTask },
              h('span', { className: 'sf-cardTag' }, STR.task),
              h('span', { className: 'sf-cardTaskText' }, s.firstTask),
            ),
            h('div', { className: 'sf-muted' },
              h('span', {}, fmtTime(s.createdAt)),
              h('span', { style: { marginLeft: 8 } }, STR.duration + ' ' + fmtDuration(s.lastEventTime - s.createdAt)),
            ),
            h('div', { className: 'sf-statsRow sf-muted' },
              h('span', {}, STR.turns + ' ' + (s.turns || 0)),
              h('span', {}, STR.steps + ' ' + (s.steps || 0)),
              h('span', {}, STR.tools + ' ' + (s.toolCalls || 0)),
              h('span', {}, STR.msgs + ' ' + ((s.userMessages || 0) + (s.assistantMessages || 0))),
              h('span', {}, STR.records + ' ' + (s.recordCount || 0)),
              h('span', {}, STR.size + ' ' + fmtSize(s.sizeBytes)),
            ),
            h('div', { className: 'sf-mono sf-muted', style: { marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } },
              s.cwd || s.id),
          )),
      ),
    )
  }

  // ── 折叠时间线渲染（详情页 / 血缘子代理详情 共用）──────────────────
  // props: { turns, collapsed: Set, toggle: (key) => void, onOpenSubagent?: (childId) => void, hideHead?: boolean }
  // 渐进披露：回合/用户发言/最终结论默认可见（行数 clamp），工具默认折叠；真实时间序。
  function TimelineTurns(props) {
    const { turns, collapsed, toggle, onOpenSubagent, hideHead, liveActive, activeTurn } = props
    const turnList = turns || []
    return turnList.map((t, tIdx) => {
      const tKey = 'turn-' + t.turn
      const tCollapsed = collapsed.has(tKey)
      const isActive = activeTurn === t.turn // 当前选中回合（点击定位后高亮）
      const tc = t.steps.reduce((a, s) => a + s.toolCalls.length, 0)
      const te = t.steps.reduce((a, s) => a + s.toolCalls.filter((c) => c.isError).length, 0)
      // 结论标记：该回合时间序中最后一条含正文的助手消息。
      const assistantItems = (t.items || []).filter((i) => i.kind === 'assistant' && i.hasText)
      const finalSeq = assistantItems.length > 0 ? assistantItems[assistantItems.length - 1].seq : null
      // 运行中回合判定（实时模式且会话活跃时）：最后一个回合，或含未完成工具调用
      // （resultTime === null，工具仍在执行）的回合 → 高亮 + 底部动态生成标志。
      const hasUnfinishedTool = (t.steps || []).some((s) => (s.toolCalls || []).some((c) => c.resultTime === null))
      const isLiveTurn = liveActive === true && (tIdx === turnList.length - 1 || hasUnfinishedTool)
      const turnCls = 'sf-turn' + (isLiveTurn ? ' sf-turnLive' : '') + (isActive ? ' sf-turnSelected' : '')
      return h('div', { key: tKey, id: 'sf-turn-' + t.turn, className: turnCls },
        !hideHead && h('div', { className: 'sf-turnHead' + (isLiveTurn ? ' sf-turnHeadLive' : ''), onClick: () => { toggle(tKey); setActiveTurn && setActiveTurn(t.turn) } },
          h('span', { style: { fontWeight: 600 } }, STR.turns + ' ' + t.turn),
          isLiveTurn && h('span', { className: 'sf-badge sf-badgeRun' }, STR.liveTurn),
          h('span', { className: 'sf-muted' }, STR.tools + ' ' + tc + (te > 0 ? ' · ' + STR.errors + ' ' + te : '')),
          h('span', { className: 'sf-muted' }, fmtTime(t.startTime) + (t.endTime ? ' → ' + fmtTime(t.endTime) : '')),
          h('span', { className: 'sf-muted', style: { marginLeft: 'auto' } }, tCollapsed ? STR.expanded : STR.collapsed),
        ),
        !tCollapsed && h('div', { className: 'sf-turnBody' },
          // 按真实时间序渲染（items 由 host 按事件 seq 交织生成）：
          // 用户发言 → 助手思考/回复 → 工具调用 … 完全遵循发生顺序。
          (t.items || []).map((it) => {
            if (it.kind === 'user') {
              const uKey = 'msg-' + it.seq
              const open = !collapsed.has(uKey)
              return h('div', { key: uKey, id: 'sf-msg-' + it.seq, className: 'sf-msg sf-msgUser' },
                h('div', { className: 'sf-msgRole' }, STR.user),
                // 用户发言：核心内容默认可见，超过 5 行折叠（点击展开/收起）。
                h('div', { className: 'sf-msgText' + (open ? ' sf-open' : ''), onClick: () => toggle(uKey), title: open ? STR.collapsed : STR.expanded }, it.preview),
                h('button', { className: 'sf-msgToggle', onClick: () => toggle(uKey) }, open ? STR.collapsed : STR.expanded),
              )
            }
            if (it.kind === 'inject') {
              // 智能体/插件注入的信息：灰色标记，不进「用户发言」大纲。
              const uKey = 'msg-' + it.seq
              const open = !collapsed.has(uKey)
              return h('div', { key: uKey, id: 'sf-msg-' + it.seq, className: 'sf-msg sf-msgInject' },
                h('div', { className: 'sf-msgRole' },
                  STR.user,
                  h('span', { className: 'sf-injectBadge' }, STR.injected + ' · ' + (it.sourceKind || '?')),
                ),
                h('div', { className: 'sf-msgTextInject' + (open ? ' sf-open' : ''), onClick: () => toggle(uKey), title: open ? STR.collapsed : STR.expanded }, it.preview),
                h('button', { className: 'sf-msgToggle', onClick: () => toggle(uKey) }, open ? STR.collapsed : STR.expanded),
              )
            }
            if (it.kind === 'assistant') {
              const aKey = 'msg-' + it.seq
              const thinkKey = 'think-' + it.seq
              const open = !collapsed.has(aKey)
              const thinkOpen = !collapsed.has(thinkKey)
              const isFinal = it.seq === finalSeq
              return h('div', { key: aKey, className: 'sf-msg sf-msgAssistant' },
                h('div', { className: 'sf-msgRole' },
                  STR.assistant,
                  isFinal && h('span', { className: 'sf-badge sf-badgeRun', style: { marginLeft: 8 } }, STR.conclusion),
                ),
                // 思考内容：默认只显示 2 行，点击展开/收起。
                it.hasThinking && h('div', { className: 'sf-thinking' + (thinkOpen ? ' sf-open' : ''), onClick: () => toggle(thinkKey), title: thinkOpen ? STR.collapsed : STR.expanded },
                  h('span', { className: 'sf-thinkingLabel' }, STR.thinking),
                  it.thinkingPreview,
                ),
                // 正文（最终结论）：核心内容默认可见，超过 5 行折叠。
                it.hasText && h('div', { className: 'sf-msgText' + (open ? ' sf-open' : ''), onClick: () => toggle(aKey), title: open ? STR.collapsed : STR.expanded }, it.preview),
                (it.hasThinking || it.hasText) && h('button', { className: 'sf-msgToggle', onClick: () => toggle(aKey) }, open ? STR.collapsed : STR.expanded),
              )
            }
            if (it.kind === 'step') {
              const s = t.steps.find((x) => x.step === it.step)
              return h('div', { key: 'step-' + it.seq, className: 'sf-step' },
                h('div', { className: 'sf-stepHead' },
                  h('span', {}, STR.step + ' ' + it.step),
                  s && h('span', {}, s.toolCalls.length + ' ' + STR.tools),
                  s && s.endTime !== null && h('span', {}, fmtDuration(s.endTime - s.startTime)),
                ),
              )
            }
            if (it.kind === 'tool') {
              const c = it.call
              const cKey = 'tool-' + c.callId
              const open = !collapsed.has(cKey)
              const status = c.isError === true ? 'err' : (c.resultTime === null ? 'run' : 'ok')
              return h('div', {
                key: cKey, id: 'sf-tc-' + c.callId, className: 'sf-tool',
              },
                h('div', { className: 'sf-toolHead', onClick: () => toggle(cKey) },
                  h('span', { className: 'sf-toolStatus ' + status }),
                  h('span', { className: 'sf-toolName' }, c.name),
                  h('span', { className: 'sf-muted' }, c.durationMs !== null ? fmtDuration(c.durationMs) : (c.resultTime === null ? '…' : '—')),
                  c.isError === true && h('span', { className: 'sf-badge sf-badgeErr' }, STR.errors),
                  // 子代理工具：一键跳转查看该子代理的实际执行内容。
                  c.childSessionId && typeof onOpenSubagent === 'function' && h('button', {
                    className: 'sf-btn', style: { padding: '1px 8px', fontSize: 11, flex: 'none' },
                    onClick: (e) => { e.stopPropagation(); onOpenSubagent(c.childSessionId) },
                  }, STR.viewSubagent),
                  // 参数预览：代码标识符样式（等宽+底色+单行省略），与导出一致。
                  h('span', { className: 'sf-toolArgPrev', title: c.argumentsText || c.argumentsPreview },
                    c.argumentsPreview),
                  h('span', { className: 'sf-muted' }, open ? STR.collapsed : STR.expanded),
                ),
                open && h('div', { className: 'sf-toolBody' },
                  h('div', { className: 'sf-preLabel' }, STR.args + ' · json'),
                  h('pre', { className: 'sf-pre' }, c.argumentsText || '—'),
                  c.resultTime !== null && h('div', { className: 'sf-preLabel' }, STR.result + (c.isError ? ' · error' : ' · text')),
                  c.resultTime !== null && h('pre', { className: 'sf-pre' + (c.isError ? ' err' : '') },
                    c.resultText || '（空）'),
                  (c.artifacts || []).length > 0 && h('div', { className: 'sf-preLabel' }, STR.artifacts),
                  (c.artifacts || []).length > 0 && h('div', {},
                    c.artifacts.map((p) => h('span', { key: p, className: 'sf-chip', title: p }, p))),
                ),
              )
            }
            return null
          }),
          // 运行中回合底部动态标志：AI 生成/任务执行中的提示（三点跳动省略号）。
          isLiveTurn && !tCollapsed && h('div', { className: 'sf-liveTyping', 'aria-label': STR.liveGenerating },
            h('span', { className: 'sf-liveDots' },
              h('span', {}), h('span', {}), h('span', {}),
            ),
            h('span', { className: 'sf-muted' }, STR.liveGenerating),
          ),
        ),
      )
    })
  }

  // ── 回合摘要列表（秒开 + 默认折叠）────────────────────────────────
  // props: { sessionId, lightTurns, collapsed: Set, toggle, ensureTurn, turnItems, onOpenSubagent }
  // 每个回合默认折叠，只展示「用户发言 + 最终结论」摘要；展开时才按需加载完整时间线。
  function TurnList(props) {
    const { sessionId, lightTurns, collapsed, toggle, ensureTurn, turnItems, onOpenSubagent, activeTurn, onSelectTurn } = props
    return (lightTurns || []).map((lt) => {
      const tKey = 'turn-' + lt.turn
      const isCollapsed = collapsed.has(tKey)
      const full = turnItems.get(lt.turn)
      const isActive = activeTurn === lt.turn
      const onToggle = () => {
        const expanding = isCollapsed
        toggle(tKey)
        if (expanding) ensureTurn(lt.turn) // 展开时按需加载完整时间线
        if (typeof onSelectTurn === 'function') onSelectTurn(lt.turn)
      }
      return h('div', { key: tKey, id: 'sf-turn-' + lt.turn, className: 'sf-turn' + (isActive ? ' sf-turnSelected' : ''), 'data-loaded': full ? 'true' : undefined },
        h('div', { className: 'sf-turnHead', onClick: onToggle },
          h('span', { style: { fontWeight: 600 } }, STR.turns + ' ' + lt.turn),
          h('span', { className: 'sf-muted' }, STR.tools + ' ' + lt.toolCount + (lt.errorCount > 0 ? ' · ' + STR.errors + ' ' + lt.errorCount : '')),
          h('span', { className: 'sf-muted' }, fmtTime(lt.startTime) + (lt.endTime ? ' → ' + fmtTime(lt.endTime) : '')),
          h('span', { className: 'sf-muted', style: { marginLeft: 'auto' } }, isCollapsed ? STR.expanded : STR.collapsed),
        ),
        // 折叠时展示摘要：用户发言 + 最终结论。
        h('div', { className: 'sf-turnSummary', onClick: onToggle },
          lt.userMessages.length > 0 && h('div', { className: 'sf-turnSummaryRow' },
            h('span', { className: 'sf-turnSummaryTag user' }, STR.user),
            h('span', { className: 'sf-turnSummaryText' }, lt.userMessages[lt.userMessages.length - 1].preview),
          ),
          lt.conclusionPreview && h('div', { className: 'sf-turnSummaryRow' },
            h('span', { className: 'sf-turnSummaryTag ok' }, STR.conclusion),
            h('span', { className: 'sf-turnSummaryText' }, lt.conclusionPreview),
          ),
        ),
        !isCollapsed && h('div', { className: 'sf-turnBody' },
          full
            ? h(TimelineTurns, { turns: [full], collapsed, toggle, hideHead: true, onOpenSubagent })
            : h('div', { className: 'sf-hint' }, STR.detailLoading),
        ),
      )
    })
  }

  // ── 血缘树视图（M4）───────────────────────────────────────────────
  // props: { sessionId, connection, onBack }
  // 数据双通道：离线档案树（parentSession 链接，host lineage 方法）+ 运行时实时树
  // （subagents.list 递归，在线子代理）。节点详情：离线 get 优先，回退运行时
  // subagents.history → host derive 桥接 → 复用 TimelineTurns 折叠渲染。
  function LineageView(props) {
    const { sessionId, connection, initialSelectId } = props
    const [offline, setOffline] = useState(null)
    const [live, setLive] = useState(null)
    const [liveState, setLiveState] = useState('none') // none/loading/ready
    const [selected, setSelected] = useState(null)     // { id, label, parentId, mode }
    const [detail, setDetail] = useState(null)         // { phase, timeline?, counts?, session? }
    const [collapsed, setCollapsed] = useState(() => new Set())
    const collapsedInit = useRef(false)
    const selectHandled = useRef(false)

    // 工具行「查看子代理」直达：树就绪后自动选中指定子代理并加载详情。
    useEffect(() => {
      if (!initialSelectId || selectHandled.current) return
      if (selected !== null && selected.id === initialSelectId) { selectHandled.current = true; return }
      const ready = offline !== null || liveState === 'ready'
      if (!ready) return
      const findIn = (nodes) => {
        for (const n of nodes || []) {
          if (n.id === initialSelectId) return n
          const hit = findIn(n.children)
          if (hit) return hit
        }
        return null
      }
      let node = null
      if (liveState === 'ready') node = findIn(live) || null
      if (!node && offline && offline.focus) node = findIn(offline.focus.children) || null
      if (node) {
        selectHandled.current = true
        selectNode({ ...node, parentId: node.parentId, mode: node.mode })
      }
    }, [initialSelectId, offline, live, liveState, selected])

    useEffect(() => {
      let alive = true
      api('lineage', { sessionId }).then((json) => {
        if (alive && json && json.ok) setOffline(json)
      }).catch(() => {})
      if (connection !== undefined) {
        setLiveState('loading')
        const buildLiveTree = async (parentId) => {
          const resp = await connection.api.subagents.list({ parentSessionId: parentId })
          if (!resp || !resp.result || !resp.result.ok) return []
          const entries = (resp.result.value && resp.result.value.entries || []).filter((e) => e.kind === 'child')
          const nodes = []
          for (const e of entries) {
            const children = e.hasChildren ? await buildLiveTree(e.id) : []
            nodes.push({ id: e.id, label: e.label || null, mode: e.mode, activity: e.activity, parentId, children })
          }
          return nodes
        }
        buildLiveTree(sessionId).then((nodes) => {
          if (alive) { setLive(nodes); setLiveState('ready') }
        }).catch(() => { if (alive) setLiveState('none') })
      }
      return () => { alive = false }
    }, [sessionId])

    // 默认折叠：选中子代理详情就绪后所有回合折叠（只显示摘要）。
    useEffect(() => {
      if (detail && detail.phase === 'ready' && !collapsedInit.current) {
        collapsedInit.current = true
        const all = new Set()
        for (const lt of detail.lightTurns || []) all.add('turn-' + lt.turn)
        setCollapsed(all)
      }
    }, [detail])

    // 展开回合时按需加载完整时间线（getTurn，与详情页同一缓存）。
    const [turnItems, setTurnItems] = useState(() => new Map())
    const loadingTurns = useRef(new Set())
    const ensureTurn = async (turnNo) => {
      const sid = selected !== null ? selected.id : null
      if (!sid || turnItems.has(turnNo) || loadingTurns.current.has(turnNo)) return
      loadingTurns.current.add(turnNo)
      try {
        const json = await api('getTurn', { sessionId: sid, turn: turnNo })
        if (json && json.ok && json.turn) {
          setTurnItems((prev) => new Map(prev).set(turnNo, json.turn))
        }
      } catch (e) {
        console.warn('[dsh-session-flow] getTurn failed', turnNo, e)
      } finally {
        loadingTurns.current.delete(turnNo)
      }
    }

    const toggle = (key) => {
      setCollapsed((prev) => {
        const next = new Set(prev)
        if (next.has(key)) next.delete(key)
        else next.add(key)
        return next
      })
    }

    const selectNode = async (node) => {
      setSelected(node)
      collapsedInit.current = false
      setCollapsed(new Set())
      setTurnItems(new Map())
      setDetail({ phase: 'loading' })
      // 1) 离线档案优先（light：回合摘要 + 工具统计）
      try {
        const arch = await api('get', { sessionId: node.id })
        if (arch && arch.ok) {
          setDetail({ phase: 'ready', lightTurns: arch.lightTurns, toolStats: arch.toolStats, counts: arch.counts, session: arch.session })
          return
        }
      } catch (e) {}
      // 2) 运行时 history 桥接（在线子代理）→ host derive 得 light 结构
      if (connection !== undefined && node.parentId !== undefined) {
        try {
          const resp = await connection.api.subagents.history({
            parentSessionId: node.parentId,
            childSessionId: node.id,
            mode: node.mode,
            maxMessages: 120,
          })
          if (resp && resp.result && resp.result.ok && resp.result.value && Array.isArray(resp.result.value.events)) {
            const events = resp.result.value.events.map((entry) => entry.event)
            const derived = await api('derive', { events })
            if (derived && derived.ok) {
              // derive 返回完整 timeline——转成 light 结构
              const turns = (derived.timeline && derived.timeline.turns) || []
              const lightTurns = turns.map((t) => {
                const toolCount = t.steps.reduce((a, s) => a + s.toolCalls.length, 0)
                const errorCount = t.steps.reduce((a, s) => a + s.toolCalls.filter((c) => c.isError).length, 0)
                const finals = t.assistantMessages.filter((a) => a.hasText)
                return {
                  turn: t.turn, startTime: t.startTime, endTime: t.endTime, toolCount, errorCount,
                  userMessages: t.userMessages.map((u) => ({ seq: u.seq, preview: u.preview })),
                  conclusionPreview: finals.length > 0 ? finals[finals.length - 1].preview : '',
                }
              })
              setDetail({ phase: 'ready', lightTurns, counts: derived.counts, session: derived.session })
              return
            }
          }
        } catch (e) {}
      }
      setDetail({ phase: 'empty' })
    }

    // 树渲染（递归行）。
    const renderNode = (node, depth, isLive) => {
      const active = selected !== null && selected.id === node.id
      const hasChildren = (node.children && node.children.length > 0)
      // M8a：自定义标题优先（离线节点 host 已透传 userTitle；live 节点无此字段）。
      const label = node.userTitle || node.label || node.title || node.id
      const meta = isLive
        ? ((node.mode === 'continuable' ? STR.modeContinuable : STR.modeOneShot) + ' · ' + (node.activity === 'running' ? STR.running : STR.ended))
        : ((node.toolCalls || 0) + ' ' + STR.tools + (node.toolErrors ? ' · ' + node.toolErrors + ' ' + STR.errors : ''))
      return h('div', { key: node.id },
        h('div', {
          className: 'sf-treeRow', 'data-active': active ? 'true' : undefined,
          title: node.id,
          onClick: () => selectNode({ ...node, parentId: node.parentId, mode: node.mode }),
        },
          h('span', { className: 'sf-treeIndent', style: { width: 14 * depth } }),
          hasChildren && h('span', { className: 'sf-treeCaret' }, '▾'),
          isLive && h('span', { className: 'sf-liveDot ' + (node.activity === 'running' ? 'running' : 'inactive') }),
          h('span', { className: 'sf-treeLabel' }, String(label).slice(0, 40)),
          h('span', { className: 'sf-treeMeta', style: { marginLeft: 'auto' } }, meta),
        ),
        hasChildren && node.children.map((c) => renderNode(c, depth + 1, isLive)),
      )
    }

    const offlineChildren = offline && offline.focus ? offline.focus.children || [] : []
    const hasOffline = offlineChildren.length > 0
    const hasLive = liveState === 'ready' && live !== null && live.length > 0
    const hasAny = hasOffline || hasLive

    return h('div', { className: 'sf-view' },
      h('div', { className: 'sf-viewHeader' },
        h('button', { className: 'sf-btn', onClick: props.onBack }, '← ' + STR.back),
        h('h2', { className: 'sf-viewTitle' }, STR.lineage),
      ),
      h('div', { className: 'sf-detailBody' },
        // 左：血缘树
        h('div', { className: 'sf-tree' },
          h('div', { className: 'sf-groupTitle' }, STR.liveTree + (liveState === 'loading' ? '…' : '')),
          !hasLive && liveState !== 'loading' && h('div', { className: 'sf-hint' }, STR.noLineage),
          hasLive && live.map((n) => renderNode(n, 0, true)),
          h('div', { className: 'sf-groupTitle', style: { marginTop: 10 } }, STR.offlineTree),
          !hasOffline && h('div', { className: 'sf-hint' }, STR.noLineage),
          hasOffline && offlineChildren.map((n) => renderNode(n, 0, false)),
        ),
        // 右：选中节点详情
        h('div', { className: 'sf-treeDetail' },
          selected === null && h('div', { className: 'sf-hint' }, STR.noDetail),
          detail && detail.phase === 'loading' && h('div', { className: 'sf-hint' }, STR.loadDetail),
          detail && detail.phase === 'empty' && h('div', { className: 'sf-hint' }, STR.noDetail),
          detail && detail.phase === 'ready' && h('div', { className: 'sf-muted', style: { flex: 'none' } },
            STR.subagentDetail + ' · ' + String(selected.label || selected.id).slice(0, 60) +
            (detail.counts ? ' · ' + (detail.counts['tool/call'] || 0) + ' ' + STR.tools : ''),
          ),
          detail && detail.phase === 'ready' && h(TurnList, {
            sessionId: selected.id,
            lightTurns: detail.lightTurns || [],
            collapsed,
            toggle,
            ensureTurn,
            turnItems,
          }),
        ),
      ),
    )
  }

  // ── 详情页（M3 折叠时间线）─────────────────────────────────────────
  // props: { session (总览卡片数据), workspace, sessions (runtime, 跳转用), onBack }
  // 交互：信息流默认全部折叠（回合/消息/工具），右侧为用户发言大纲（点击展开回合并定位）。
  function SessionFlowDetail(props) {
    const { session } = props
    const [state, setState] = useState({ phase: 'loading', error: null, data: null })
    // 折叠状态：键集合，has(key) = 折叠。turn-N / tool-<callId> / msg-<seq>
    const [collapsed, setCollapsed] = useState(() => new Set())
    const collapsedInit = useRef(false)
    // M8a：标题重命名（编辑态 + 保存后的显示覆盖，优先于 session.userTitle）。
    const [renaming, setRenaming] = useState(false)
    const [titleOverride, setTitleOverride] = useState(null)
    const saveRename = (title) => {
      return api('rename', { sessionId: session.id, title }).then((json) => {
        if (json && json.ok) {
          setTitleOverride(json.userTitle) // null = 清除恢复原名
          setRenaming(false)
          return true
        }
        throw new Error((json && json.error) || STR.renameFail)
      })
    }

    useEffect(() => {
      // 空会话（新建后未对话）：不请求详情，直接显示占位提示。
      const isEmpty = session.empty === true ||
        (!(session.userMessages || 0) && !(session.toolCalls || 0) && !(session.turns || 0))
      if (isEmpty) {
        setState({ phase: 'empty', error: null, data: null })
        return
      }
      let alive = true
      api('get', { sessionId: session.id }).then((json) => {
        if (!alive) return
        if (json && json.ok) setState({ phase: 'ready', error: null, data: json })
        else setState({ phase: 'error', error: (json && json.error) || 'get failed', data: null })
      }).catch((e) => {
        if (alive) setState({ phase: 'error', error: String(e), data: null })
      })
      return () => { alive = false }
    }, [session.id])

    // 默认折叠：所有回合折叠，只展示「用户发言 + 结论」摘要；展开才按需加载。
    useEffect(() => {
      if (state.phase !== 'ready' || collapsedInit.current) return
      collapsedInit.current = true
      const all = new Set()
      for (const lt of state.data.lightTurns || []) all.add('turn-' + lt.turn)
      setCollapsed(all)
    }, [state.phase])

    const toggle = (key) => {
      setCollapsed((prev) => {
        const next = new Set(prev)
        if (next.has(key)) next.delete(key)
        else next.add(key)
        return next
      })
    }
    // 当前选中回合（正文区/右侧区点击定位后高亮，便于知道正在看哪个回合）。
    const [activeTurn, setActiveTurn] = useState(null)
    const selectTurn = (turnNo) => setActiveTurn(turnNo)
    const expandAll = () => {
      // 全部展开：展开所有回合并逐个按需加载。
      setCollapsed(new Set())
      for (const lt of lightTurns) ensureTurn(lt.turn)
    }
    const collapseAll = () => {
      const all = new Set()
      for (const lt of lightTurns) all.add('turn-' + lt.turn)
      // 已加载回合内的消息/思考/工具也折叠。
      for (const full of turnItems.values()) {
        for (const u of full.userMessages || []) all.add('msg-' + u.seq)
        for (const a of full.assistantMessages || []) {
          all.add('msg-' + a.seq)
          if (a.hasThinking) all.add('think-' + a.seq)
        }
        for (const s of full.steps || []) {
          for (const c of s.toolCalls) all.add('tool-' + c.callId)
        }
      }
      setCollapsed(all)
    }

    const jumpNative = () => {
      try {
        props.sessions.open(session.id)
        // 打开原生会话后收起会话流视图，交还中栏给对话界面。
        props.onClose()
      } catch (error) {
        console.warn('[dsh-session-flow] cannot open session', session.id, error)
      }
    }

    // 右侧大纲：点击用户发言 → 展开所在回合（按需加载）→ 滚动定位到「回合开头」。
    const scrollToMsg = (turnNo, seq) => {
      setActiveTurn(turnNo)
      setCollapsed((prev) => {
        const next = new Set(prev)
        next.delete('turn-' + turnNo)
        return next
      })
      ensureTurn(turnNo)
      setTimeout(() => {
        const turnEl = document.getElementById('sf-turn-' + turnNo)
        if (turnEl) {
          turnEl.scrollIntoView({ behavior: 'smooth', block: 'start' })
          return
        }
        const el = document.getElementById('sf-msg-' + seq)
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }, 80)
    }

    const data = state.data
    // 轻量时间线：回合摘要（默认折叠，秒开）。
    const lightTurns = (data && data.lightTurns) || []
    // 会话内工具统计（来自 host 服务端聚合，避免前端全量扫描）。
    const toolStats = (data && data.toolStats) || []
    // 展开回合时的完整时间线按需加载。
    const [turnItems, setTurnItems] = useState(() => new Map())
    const loadingTurns = useRef(new Set())
    const ensureTurn = async (turnNo) => {
      if (turnItems.has(turnNo) || loadingTurns.current.has(turnNo)) return
      loadingTurns.current.add(turnNo)
      try {
        const json = await api('getTurn', { sessionId: session.id, turn: turnNo })
        if (json && json.ok && json.turn) {
          setTurnItems((prev) => new Map(prev).set(turnNo, json.turn))
        }
      } catch (e) {
        console.warn('[dsh-session-flow] getTurn failed', turnNo, e)
      } finally {
        loadingTurns.current.delete(turnNo)
      }
    }
    // 统计条展开态与定位游标。
    const [statsExpanded, setStatsExpanded] = useState(false)
    const toolCursor = useRef(new Map())

    // ── M6 实时通道：connection.api.sessions.history → host derive → 完整折叠视图 ──
    // 与 M4 子代理桥同一数据源形态（events 数组）；轮询刷新仅实时模式激活时进行。
    const [liveOn, setLiveOn] = useState(false)
    const [liveState, setLiveState] = useState({ phase: 'idle', error: null, timeline: null, eventCount: 0, lastActive: null })
    const liveTimer = useRef(null)
    // 已见过的实时回合号：刷新时只折叠「新出现的回合」，已展开的回合保持用户状态
    // （此前误把所有不在折叠集合中的回合加入集合 = 每次刷新全部收拢）。
    const liveSeenTurns = useRef(new Set())
    const fetchLive = useRef(async () => {})
    fetchLive.current = async () => {
      const conn = props.connection
      if (conn === undefined || conn.api === undefined || conn.api.sessions === undefined) {
        setLiveState((s) => ({ ...s, phase: 'error', error: STR.liveUnavailable }))
        return
      }
      setLiveState((s) => ({ ...s, phase: 'loading' }))
      try {
        // 会话地址未知时走普通 sessions 通道（当前会话）；若连接层要求显式地址则回退。
        const resp = await conn.api.sessions.history({
          sessionId: session.id,
          mode: 'full',
          maxMessages: 400,
        })
        const val = resp && resp.result && resp.result.value
        if (val === undefined || !Array.isArray(val.events)) {
          setLiveState((s) => ({ ...s, phase: 'error', error: STR.liveFail }))
          return
        }
        const events = val.events.map((entry) => (entry && entry.event) || entry)
        const derived = await api('derive', { events })
        if (!derived || !derived.ok) {
          setLiveState((s) => ({ ...s, phase: 'error', error: (derived && derived.error) || STR.liveFail }))
          return
        }
        const tl = (derived.timeline && derived.timeline.turns) || []
        // 实时视图只保留「最近 3 个历史回合 + 当前运行回合」（若有），数量恒定，
        // 不随 history 窗口大小变化——新回合出现时最旧的被挤出。
        const LIVE_MAX_HISTORY_TURNS = 3
        const liveRunning = derived.running === true
        const keepCount = tl.length > LIVE_MAX_HISTORY_TURNS + (liveRunning ? 1 : 0)
          ? LIVE_MAX_HISTORY_TURNS + (liveRunning ? 1 : 0)
          : tl.length
        const displayTl = keepCount > 0 ? tl.slice(-keepCount) : tl
        setLiveState({
          phase: 'ready',
          error: null,
          timeline: displayTl,
          eventCount: events.length,
          lastActive: derived.session && derived.session.lastEventTime != null ? derived.session.lastEventTime : null,
          // 运行中 = 事件结构信号（未闭合回合/步骤/工具调用或流式中间态），
          // 不依赖时间戳：输出间隔长（模型思考/长工具执行）时不会误判停止。
          running: liveRunning,
        })
        // 只把「新出现的回合」并入折叠集合（默认折叠）；已展开的回合不被收拢。
        const newTurns = displayTl.filter((t) => !liveSeenTurns.current.has(t.turn))
        for (const t of displayTl) liveSeenTurns.current.add(t.turn)
        if (newTurns.length > 0) {
          setCollapsed((prev) => {
            const next = new Set(prev)
            for (const t of newTurns) next.add('turn-' + t.turn)
            return next
          })
        }
      } catch (e) {
        setLiveState((s) => ({ ...s, phase: 'error', error: STR.liveFail + ': ' + String(e && e.message || e) }))
      }
    }
    const enterLive = () => {
      setLiveOn(true)
      liveSeenTurns.current.clear() // 重进实时：全新视图，首轮全部折叠
      fetchLive.current()
      if (liveTimer.current === null) {
        liveTimer.current = setInterval(() => { fetchLive.current() }, 3000)
      }
    }
    const exitLive = () => {
      setLiveOn(false)
      liveSeenTurns.current.clear()
      setLiveState({ phase: 'idle', error: null, timeline: null, eventCount: 0, lastActive: null, running: false })
      if (liveTimer.current !== null) { clearInterval(liveTimer.current); liveTimer.current = null }
    }
    useEffect(() => () => { if (liveTimer.current !== null) clearInterval(liveTimer.current) }, [])
    // 右侧导航：标签（用户发言/工具/错误/检索）+ 工具展开态。
    const [navTab, setNavTab] = useState(props.initialSearchQuery ? 'search' : 'users')
    const [expandedTools, setExpandedTools] = useState(() => new Set())
    const errorCalls = toolStats.flatMap((e) => e.errorCalls)
    // 会话内检索（M5c 方案C）：检索词（总览自动带入）+ 匹配位置列表。
    const [searchQuery, setSearchQuery] = useState(props.initialSearchQuery || '')
    const [searchMatches, setSearchMatches] = useState(null) // null = 尚未检索
    useEffect(() => {
      const q = searchQuery.trim()
      if (!q) { setSearchMatches(null); return }
      let alive = true
      api('searchIn', { sessionId: session.id, query: q }).then((json) => {
        if (alive && json && json.ok) setSearchMatches(json.matches || [])
      }).catch(() => {})
      return () => { alive = false }
    }, [searchQuery, session.id])

    // 跳转到检索命中位置：展开回合（按需加载）→ 滚动定位 → 闪烁高亮。
    const jumpToMatch = (m) => {
      const turn = m.turn
      setActiveTurn(turn)
      setCollapsed((prev) => {
        const next = new Set(prev)
        next.delete('turn-' + turn)
        return next
      })
      ensureTurn(turn)
      setTimeout(() => {
        let el = null
        if (m.callId) el = document.getElementById('sf-tc-' + m.callId)
        else if (m.seq !== undefined) el = document.getElementById('sf-msg-' + m.seq)
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' })
          el.classList.add('sf-flash')
          setTimeout(() => el.classList.remove('sf-flash'), 1600)
        }
      }, 120)
    }

    // ── M7 遗留 L1：跨视图 inspect 握手 ──────────────────────────────
    // chat 视图工具调用行「Inspect」按钮写入共享 store（{callId}），会话流标签
    // 作为 conversation.view 占用者收到 owner props：inspect/onInspectDone。
    // 消费：toolStats 里定位该 callId 所属回合 → 展开回合（按需加载）→ 滚动定位
    // → 闪烁高亮 → onInspectDone() 清除（参照 ui-trajectory 的 inspect 消费方式）。
    // 时序处理：inspect 可能在数据未就绪时到达（依赖 phase 重跑）；liveOn/血缘视图
    // 时先退出再定位；同一 callId 只处理一次（inspectHandled ref，store 清除后重置）。
    const inspectHandled = useRef(null)
    const jumpToCall = (turn, callId) => {
      setActiveTurn(turn)
      setCollapsed((prev) => {
        const next = new Set(prev)
        next.delete('turn-' + turn)
        return next
      })
      ensureTurn(turn)
      setTimeout(() => {
        const el = document.getElementById('sf-tc-' + callId)
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' })
          el.classList.add('sf-flash')
          setTimeout(() => el.classList.remove('sf-flash'), 1600)
        }
      }, 120)
    }
    const applyInspect = (callId) => {
      if (!callId) return
      let turn = null
      for (const t of toolStats) {
        const c = (t.calls || []).find((x) => x.callId === callId)
        if (c) { turn = c.turn; break }
      }
      if (turn === null) {
        // toolStats 未命中（理论上不应发生）：searchIn 按 callId 全文兜底。
        api('searchIn', { sessionId: session.id, query: callId }).then((json) => {
          const m = json && json.ok ? (json.matches || []).find((x) => x.callId === callId) : null
          if (m && typeof m.turn === 'number') jumpToCall(m.turn, callId)
          if (props.onInspectDone) props.onInspectDone()
        }).catch(() => { if (props.onInspectDone) props.onInspectDone() })
        return
      }
      jumpToCall(turn, callId)
      if (props.onInspectDone) props.onInspectDone()
    }
    useEffect(() => {
      // store 清除（inspect → null）后重置防重标记，允许同一 callId 再次检视。
      if (!props.inspect || !props.inspect.callId) { inspectHandled.current = null; return }
      if (state.phase !== 'ready') return
      if (inspectHandled.current === props.inspect.callId) return
      inspectHandled.current = props.inspect.callId
      if (liveOn) exitLive()
      if (view === 'lineage') setView('timeline')
      applyInspect(props.inspect.callId)
    }, [props.inspect, state.phase])

    // 定位工具/错误调用：展开所在回合（按需加载）→ 滚动到调用行；同一种再次点击循环。
    const locateCall = (list, cursorKey) => {
      if (!list || list.length === 0) return
      const idx = (toolCursor.current.get(cursorKey) || 0) % list.length
      toolCursor.current.set(cursorKey, idx + 1)
      const { callId, turn } = list[idx]
      setActiveTurn(turn)
      setCollapsed((prev) => {
        const next = new Set(prev)
        next.delete('turn-' + turn)
        return next
      })
      ensureTurn(turn)
      setTimeout(() => {
        const el = document.getElementById('sf-tc-' + callId)
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }, 80)
    }
    const jumpToTool = (name) => {
      const e = toolStats.find((x) => x.name === name)
      if (e) locateCall(e.calls, 'tool:' + name)
    }
    const jumpToError = () => {
      const errs = toolStats.flatMap((e) => e.errorCalls)
      locateCall(errs, 'error')
    }

    // 用户发言大纲（以用户发言为导航节点，来自 light 摘要）。
    const userTurns = []
    for (const lt of lightTurns) {
      for (const u of lt.userMessages || []) userTurns.push({ turn: lt.turn, seq: u.seq, preview: u.preview })
    }
    const sessionInfo = data ? data.session : session
    const running = sessionInfo.lastEventTime !== null && sessionInfo.lastEventTime !== undefined &&
      (Date.now() - sessionInfo.lastEventTime) < ACTIVE_WINDOW_MS
    // 视图切换：时间线详情 ⇄ 血缘树。pendingSelect：工具行「查看子代理」直达选中。
    const [view, setView] = useState('timeline')
    const [pendingSelect, setPendingSelect] = useState(null)
    // M5 摘要：规则摘要前端实时组装；LLM 摘要走 host summarize（索引缓存）。
    const [llmSummary, setLlmSummary] = useState(null)
    const [llmStale, setLlmStale] = useState(false)
    const [llmBusy, setLlmBusy] = useState(false)
    const [llmErr, setLlmErr] = useState('')
    useEffect(() => {
      // get 响应里带索引中已缓存的 LLM 摘要 + 过期标记（生成后有新对话）。
      if (state.phase === 'ready' && data) {
        if (data.summary) setLlmSummary(data.summary)
        setLlmStale(data.summaryStale === true)
      }
    }, [state.phase])
    const genLlmSummary = () => {
      setLlmBusy(true)
      setLlmErr('')
      api('summarize', { sessionId: session.id, mode: 'llm' }).then((json) => {
        if (json && json.ok) { setLlmSummary(json.summary); setLlmStale(false) }
        else setLlmErr(STR.llmFail + ': ' + ((json && json.error) || 'unknown'))
      }).catch((e) => setLlmErr(STR.llmFail + ': ' + String(e))).finally(() => setLlmBusy(false))
    }
    // M5d 导出：host 生成分卷 Markdown 并打包 ZIP（base64）→ Blob 下载。
    // 超大会话拆为「概览 + 时间线分卷」，避免单文件过大导致打不开。
    const [exporting, setExporting] = useState(false)
    const exportSessionMd = () => {
      if (exporting) return
      setExporting(true)
      api('exportMd', { sessionId: session.id }).then((json) => {
        if (!json || !json.ok) { alert(STR.exportFail + ': ' + ((json && json.error) || 'unknown')); return }
        // base64 → Uint8Array → Blob（application/zip）。
        const bin = atob(json.base64)
        const bytes = new Uint8Array(bin.length)
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
        const blob = new Blob([bytes], { type: 'application/zip' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = json.filename || ('session-' + session.id + '.zip')
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        setTimeout(() => URL.revokeObjectURL(url), 10000)
      }).catch((e) => alert(STR.exportFail + ': ' + String(e))).finally(() => setExporting(false))
    }
    // 规则摘要（零请求，从 get 响应组装）：任务数 = 含用户消息的回合数；
    // 「首个任务」= 第一个回合的用户消息；「最近结论」= 最后一个有结论的回合。
    const ruleTaskCount = lightTurns.filter((lt) => lt.userMessages && lt.userMessages.length > 0).length
    const ruleGoal = (() => {
      for (const lt of lightTurns) {
        if (lt.userMessages && lt.userMessages.length > 0) return String(lt.userMessages[0].preview).slice(0, 150)
      }
      return ''
    })()
    const ruleConclusion = (() => {
      for (let i = lightTurns.length - 1; i >= 0; i--) {
        if (lightTurns[i].conclusionPreview) return String(lightTurns[i].conclusionPreview).slice(0, 220)
      }
      return ''
    })()
    const ruleTools = toolStats.slice(0, 6).map((t) => t.name + '·' + t.count).join('  ')

    if (view === 'lineage') {
      return h(LineageView, {
        sessionId: session.id,
        connection: props.connection,
        initialSelectId: pendingSelect,
        onBack: () => setView('timeline'),
      })
    }

    const openSubagent = (childId) => {
      setPendingSelect(childId)
      setView('lineage')
    }

    return h('div', { className: 'sf-view' },
      h('div', { className: 'sf-viewHeader' },
        h('button', { className: 'sf-btn', onClick: props.onBack }, '← ' + (props.backLabel || STR.back)),
        h('h2', { className: 'sf-viewTitle', style: { flex: '1 1 auto', overflow: 'hidden', textOverflow: 'ellipsis' } },
          renaming
            ? h(RenameInline, {
                initial: titleOverride || session.userTitle || session.title || '',
                onSave: saveRename,
                onCancel: () => setRenaming(false),
              })
            : h('span', { style: { display: 'inline-flex', alignItems: 'center', minWidth: 0 } },
                h('span', { style: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }, title: (titleOverride || session.userTitle) ? session.title || STR.unknownTitle : undefined },
                  titleOverride || session.userTitle || session.title || STR.unknownTitle),
                h('button', {
                  className: 'sf-renameBtn', title: STR.rename,
                  onClick: () => setRenaming(true),
                }, '✎'),
              ),
        ),
        running ? h('span', { className: 'sf-badge sf-badgeRun' }, STR.running) : h('span', { className: 'sf-badge sf-badgeEnd' }, STR.ended),
        session.delegationDepth > 0 && h('span', { className: 'sf-badge sf-badgeSub' }, STR.subagent),
        h('button', { className: 'sf-btn', onClick: () => { setPendingSelect(null); setView('lineage') } }, STR.lineage),
        // M12：并入右栏（仅工作台详情页；嵌入标签页不显示——避免右栏与标签页重复）。
        !props.embedded && h('button', {
          className: 'sf-btn',
          onClick: () => { if (dockBridge.controller) dockBridge.controller.open() },
          title: STR.dockHint,
        }, STR.dock),
        // M6 实时通道：进行中会话可实时查看（sessions.history → derive → 折叠视图）。
        props.connection !== undefined && h('button', {
          className: 'sf-btn' + (liveOn ? ' sf-btnActive' : ''),
          onClick: liveOn ? exitLive : enterLive,
          disabled: liveOn && liveState.phase === 'loading',
        }, liveOn ? STR.liveActive + ' ✕' : STR.live),
        h('button', { className: 'sf-btn', onClick: exportSessionMd, disabled: exporting }, exporting ? STR.exporting : STR.exportMd),
        // 嵌入原生会话页模式：无「跳转原生会话」（本页即原生会话页）。
        !props.embedded && h('button', { className: 'sf-btn', onClick: jumpNative }, STR.jumpNative),
        h('button', { className: 'sf-btn', onClick: expandAll }, STR.expandAll),
        h('button', { className: 'sf-btn', onClick: collapseAll }, STR.collapseAll),
      ),
      state.phase === 'loading' && h('div', { className: 'sf-hint' }, STR.detailLoading),
      state.phase === 'error' && h('div', { className: 'sf-hint', style: { color: '#d43b3b' } }, STR.detailFailed + ': ' + String(state.error)),
      state.phase === 'empty' && h('div', { className: 'sf-hint' }, STR.emptyHint),
      state.phase === 'ready' && h('div', { className: 'sf-detailBody' },
        // 左侧时间线
        h('div', { className: 'sf-timeline' },
          h('div', { className: 'sf-muted', style: { flex: 'none' }, title: data.workspaceCwd || data.workspace },
            (data.workspaceLabel || data.workspace || '') + ' · ' + fmtTime(sessionInfo.createdAt) +
            ' · ' + STR.duration + ' ' + fmtDuration((sessionInfo.lastEventTime || 0) - (sessionInfo.createdAt || 0)) +
            ' · ' + (sessionInfo.recordCount || 0) + ' ' + STR.records,
          ),
          // 详情页统计条：本会话工具分布概览，可展开；点击联动右侧导航对应标签。
          toolStats.length > 0 && h('div', { className: 'sf-statsBar', style: { flex: 'none' } },
            h('span', { className: 'sf-statsLabel' }, STR.toolTop),
            (statsExpanded ? toolStats : toolStats.slice(0, 5)).map((t) =>
              h('button', {
                key: t.name, className: 'sf-statChip clickable',
                title: t.name + ' · ' + t.count + ' 次' + (t.errors > 0 ? ' · ' + t.errors + ' 错误' : ''),
                onClick: () => { setNavTab('tools'); setExpandedTools((prev) => new Set(prev).add(t.name)) },
              },
                h('span', {}, t.name),
                h('span', { className: 'sf-statCount' + (t.errors > 0 ? ' err' : '') }, t.count),
              )),
            toolStats.length > 5 && h('button', {
              className: 'sf-statChip clickable',
              onClick: () => setStatsExpanded(!statsExpanded),
            }, statsExpanded ? STR.collapsed : STR.expanded + ' (' + toolStats.length + ')'),
            sessionInfo.toolErrors > 0 && h('button', {
              className: 'sf-statChip clickable', title: STR.issuesHint,
              onClick: () => setNavTab('errors'),
            },
              h('span', {}, '⚠ ' + STR.errors),
              h('span', { className: 'sf-statCount err' }, sessionInfo.toolErrors),
            ),
          ),
          // M5 会话摘要卡：规则摘要实时组装 + LLM 摘要（DSH 模型通道，索引缓存）。
          (ruleGoal || ruleConclusion || ruleTools) && h('div', { className: 'sf-summaryCard' },
            h('div', { className: 'sf-summaryHead' },
              h('span', { className: 'sf-summaryTitle' }, STR.summary),
              h('span', { className: 'sf-badge sf-badgeEnd' }, STR.summaryRuleTag),
            ),
            ruleTaskCount > 0 && h('div', { className: 'sf-summaryRow' },
              h('span', { className: 'sf-turnSummaryTag' }, STR.summaryTaskCount),
              h('span', { className: 'sf-turnSummaryText' }, ruleTaskCount),
            ),
            ruleGoal && h('div', { className: 'sf-summaryRow' },
              h('span', { className: 'sf-turnSummaryTag user' }, STR.summaryGoal),
              h('span', { className: 'sf-turnSummaryText' }, ruleGoal),
            ),
            ruleConclusion && h('div', { className: 'sf-summaryRow' },
              h('span', { className: 'sf-turnSummaryTag ok' }, STR.summaryConclusion + (running ? STR.summaryProvisional : '')),
              h('span', { className: 'sf-turnSummaryText' }, ruleConclusion),
            ),
            ruleTools && h('div', { className: 'sf-summaryRow' },
              h('span', { className: 'sf-turnSummaryTag' }, STR.summaryTools),
              h('span', { className: 'sf-turnSummaryText' }, ruleTools),
            ),
            llmSummary && h('div', { className: 'sf-summaryRow', style: { marginTop: 4, alignItems: 'flex-start' } },
              h('span', { className: 'sf-turnSummaryTag', style: { background: 'rgba(140,110,255,.14)', color: '#8b5cf6' } }, STR.summaryLlmTag),
              // LLM 摘要完整显示（不 clamp），支持迷你 Markdown（粗体/斜体/代码/列表/标题）。
              h('div', { className: 'sf-summaryFull' }, renderSummaryMd(llmSummary) || llmSummary),
            ),
            llmSummary && llmStale && h('div', {
              className: 'sf-summaryStale',
              onClick: genLlmSummary,
              title: STR.llmSummary,
            }, STR.summaryStale),
            llmErr && h('div', { className: 'sf-muted', style: { color: '#d43b3b' } }, llmErr),
            h('button', {
              className: 'sf-btn', style: { alignSelf: 'flex-start', marginTop: 6 },
              onClick: genLlmSummary, disabled: llmBusy,
            }, llmBusy ? STR.llmGenerating : (llmSummary ? STR.llmSummary + ' ↻' : STR.llmSummary)),
          ),
          // M6 实时模式：sessions.history → derive 的完整折叠时间线（轮询刷新）。
          liveOn && h('div', { className: 'sf-liveBar', style: { flex: 'none' } },
            h('span', { className: 'sf-badge sf-badgeRun', style: { flex: 'none' } }, STR.liveActive),
            h('span', { className: 'sf-liveText' },
              h('span', { className: 'sf-muted', style: { flex: 'none' } }, (liveState.eventCount || 0) + ' ' + STR.liveEvents),
              liveState.lastActive && h('span', { className: 'sf-muted', style: { flex: 'none' } }, STR.liveLastActive + ' ' + fmtTime(liveState.lastActive)),
              liveState.phase === 'loading' && h('span', { className: 'sf-muted', style: { flex: 'none' } }, STR.liveRefreshing),
            ),
            h('button', { className: 'sf-btn sf-liveExitBtn', onClick: exitLive }, STR.liveExit),
          ),
          liveOn && liveState.phase === 'error' && h('div', { className: 'sf-hint', style: { color: '#d43b3b' } }, liveState.error),
          liveOn && liveState.phase === 'loading' && liveState.timeline === null && h('div', { className: 'sf-hint' }, STR.liveLoading),
          liveOn && liveState.timeline !== null && h(TimelineTurns, {
            // 保留回合头（默认折叠可点击展开）：hideHead=true 时折叠回合既无内容
            // 也无展开入口，实时时间线会整片空白。
            // liveActive：事件结构信号判定运行中（未闭合回合/步骤/工具或流式中间态），
            // 与输出节奏无关——思考/长工具执行期间保持高亮，会话结束立即熄灭。
            turns: liveState.timeline, collapsed, toggle, onOpenSubagent: openSubagent,
            liveActive: liveState.running === true,
            activeTurn, setActiveTurn,
          }),
          !liveOn && lightTurns.length === 0 && h('div', { className: 'sf-hint' }, STR.noTimeline),
          !liveOn && h(TurnList, { sessionId: session.id, lightTurns, collapsed, toggle, ensureTurn, turnItems, onOpenSubagent: openSubagent, activeTurn, onSelectTurn: selectTurn }),
        ),
        // 右侧：四标签导航（用户发言 / 工具 / 错误 / 检索），点击条目定位到时间线对应位置。
        h('div', { className: 'sf-artifacts' },
          h('div', { className: 'sf-navTabs', style: { flex: 'none' } },
            h('button', { className: 'sf-navTab' + (navTab === 'users' ? ' active' : ''), title: STR.userNav, onClick: () => setNavTab('users') },
              h('span', { className: 'sf-navIcon', dangerouslySetInnerHTML: { __html: NAV_ICON_USER } }),
              h('span', { className: 'sf-navTabCount' }, userTurns.length)),
            h('button', { className: 'sf-navTab' + (navTab === 'tools' ? ' active' : ''), title: STR.tools, onClick: () => setNavTab('tools') },
              h('span', { className: 'sf-navIcon', dangerouslySetInnerHTML: { __html: NAV_ICON_TOOL } }),
              h('span', { className: 'sf-navTabCount' }, toolStats.length)),
            h('button', { className: 'sf-navTab' + (navTab === 'errors' ? ' active' : ''), title: STR.errors, onClick: () => setNavTab('errors') },
              h('span', { className: 'sf-navIcon', dangerouslySetInnerHTML: { __html: NAV_ICON_ERR } }),
              h('span', { className: 'sf-navTabCount err' }, errorCalls.length)),
            h('button', { className: 'sf-navTab' + (navTab === 'search' ? ' active' : ''), title: STR.searchTab, onClick: () => setNavTab('search') },
              h('span', { className: 'sf-navIcon', dangerouslySetInnerHTML: { __html: NAV_ICON_SEARCH } }),
              h('span', { className: 'sf-navTabCount' + (searchMatches && searchMatches.length > 0 ? ' err' : '') }, searchMatches ? searchMatches.length : 0)),
          ),
          navTab === 'search' && h('div', { className: 'sf-navBody' },
            h('input', {
              className: 'sf-input', style: { flex: 'none', width: 'calc(100% - 4px)', boxSizing: 'border-box', marginBottom: 6 },
              placeholder: STR.searchInPlaceholder, value: searchQuery,
              onChange: (e) => setSearchQuery(e.target.value),
            }),
            searchMatches !== null && h('div', { className: 'sf-hint', style: { flex: 'none' } },
              STR.matches + ' ' + searchMatches.length),
            searchMatches !== null && searchMatches.length === 0 && h('div', { className: 'sf-hint' }, STR.noMatches),
            (searchMatches || []).map((m, i) => {
              const kindLabel = m.kind === 'tool' || m.kind === 'error' ? m.name
                : m.kind === 'user' ? STR.user
                  : m.kind === 'thinking' ? STR.thinking : STR.assistant
              return h('div', {
                key: (m.callId || 's' + m.seq), className: 'sf-navItem' + (activeTurn === m.turn ? ' sf-navItemSel' : ''),
                title: 'T' + m.turn + ' · ' + kindLabel,
                onClick: () => jumpToMatch(m),
              },
                h('span', { className: 'sf-navIndex', style: m.kind === 'error' ? { color: '#d43b3b' } : undefined }, '#' + (i + 1)),
                h('span', { className: 'sf-navKind ' + m.kind }, kindLabel),
                h('span', { className: 'sf-navText' }, m.preview || ''),
                h('span', { className: 'sf-navTurn' }, 'T' + m.turn),
              )
            }),
          ),
          navTab === 'users' && h('div', { className: 'sf-navBody' },
            userTurns.length === 0 && h('div', { className: 'sf-hint' }, STR.noUserNav),
            userTurns.map((u, i) =>
              h('div', {
                key: u.seq, className: 'sf-navItem' + (activeTurn === u.turn ? ' sf-navItemSel' : ''), title: STR.turns + ' ' + u.turn,
                onClick: () => scrollToMsg(u.turn, u.seq),
              },
                h('span', { className: 'sf-navIndex' }, '#' + (i + 1)),
                h('span', { className: 'sf-navText' }, u.preview),
                h('span', { className: 'sf-navTurn' }, 'T' + u.turn),
              ),
            ),
          ),
          navTab === 'tools' && h('div', { className: 'sf-navBody' },
            toolStats.length === 0 && h('div', { className: 'sf-hint' }, STR.noTimeline),
            toolStats.map((t) => {
              const open = expandedTools.has(t.name)
              return h('div', { key: t.name, className: 'sf-navToolGroup' },
                h('div', {
                  className: 'sf-navToolHead', title: t.name + ' · ' + t.count + ' 次',
                  onClick: () => setExpandedTools((prev) => {
                    const next = new Set(prev)
                    if (next.has(t.name)) next.delete(t.name)
                    else next.add(t.name)
                    return next
                  }),
                },
                  h('span', { className: 'sf-treeCaret' }, open ? '▾' : '▸'),
                  h('span', { className: 'sf-navToolName' }, t.name),
                  h('span', { className: 'sf-navTurn' }, t.count + ' ' + STR.tools),
                  t.errors > 0 && h('span', { className: 'sf-badge sf-badgeErr' }, t.errors),
                ),
                open && t.calls.map((c, i) =>
                  h('div', {
                    key: c.callId, className: 'sf-navItem' + (activeTurn === c.turn ? ' sf-navItemSel' : ''),
                    title: 'T' + c.turn + ' · ' + t.name,
                    onClick: () => locateCall([c], 'toolcall:' + c.callId),
                  },
                    h('span', { className: 'sf-navIndex' }, '#' + (i + 1)),
                    h('span', { className: 'sf-navText' }, c.preview || '（无参数）'),
                    h('span', { className: 'sf-navTurn' }, 'T' + c.turn),
                  ),
                ),
              )
            }),
          ),
          navTab === 'errors' && h('div', { className: 'sf-navBody' },
            errorCalls.length === 0 && h('div', { className: 'sf-hint' }, STR.noDetail),
            errorCalls.map((c, i) =>
              h('div', {
                key: c.callId, className: 'sf-navItem' + (activeTurn === c.turn ? ' sf-navItemSel' : ''), style: { borderColor: 'rgba(230,80,80,.35)' },
                title: 'T' + c.turn + ' · 错误调用',
                onClick: () => locateCall([c], 'err:' + c.callId),
              },
                h('span', { className: 'sf-navIndex', style: { color: '#d43b3b' } }, '#' + (i + 1)),
                h('span', { className: 'sf-navText' }, c.preview || '（无参数）'),
                h('span', { className: 'sf-navTurn' }, 'T' + c.turn),
              ),
            ),
          ),
        ),
      ),
    )
  }

  // ── 二期：嵌入原生会话页（conversation.view 槽位标签页）────────────
  // 槽位环为会话作用域：每个原生会话页内一个「会话流」标签页，框架按
  // key={sessionId} 重挂载，天然跟随当前会话切换。组件收到的框架标准
  // props：sessionId + useSession（会话快照）；数据源与一期详情页一致
  // （host get/getTurn/searchIn/summarize/exportMd/lineage + 实时通道）。
  // 先取 host get 的轻量元信息（标题/计数，用于详情页空会话判定），
  // 再复用 SessionFlowDetail 完整详情视图（摘要/统计/折叠时间线/四标签导航）。
  // 嵌入模式差异：返回按钮 →「打开完整工作台」（唤起侧边栏工作台）；
  // 隐藏「跳转原生会话」（本页即原生会话页）；onClose 无操作。
  function SessionFlowTab(props) {
    const { sessionId } = props
    const [meta, setMeta] = useState(null) // {id, title, userMessages, toolCalls, turns}
    const [loadErr, setLoadErr] = useState('')
    // M7 遗留 L2：档案未命中（会话尚未落盘）时进入实时兜底视图，而非纯报错。
    const [liveFallback, setLiveFallback] = useState(false)
    const [retryKey, setRetryKey] = useState(0) // 「重试档案视图」触发重新 get
    // 方向 A：全文检索命中跳转——读取 pendingSearch 桥（总览命中点击写入），
    // 匹配当前会话则把检索词带入详情页（initialSearchQuery → 自动执行会话内 searchIn）。
    const [pendingQuery, setPendingQuery] = useState('')
    useEffect(() => {
      if (!sessionId) return
      try {
        const raw = localStorage.getItem(PENDING_SEARCH_KEY)
        if (!raw) return
        const p = JSON.parse(raw)
        if (p && p.sessionId === sessionId && p.query) {
          localStorage.removeItem(PENDING_SEARCH_KEY)
          setPendingQuery(p.query)
        }
      } catch (e) {}
    }, [sessionId])

    useEffect(() => {
      let alive = true
      setMeta(null)
      setLoadErr('')
      setLiveFallback(false)
      if (!sessionId) return undefined
      const conn = props.connection
      const canLive = conn !== undefined && conn.api !== undefined && conn.api.sessions !== undefined
      const toFallback = () => { if (alive && canLive) setLiveFallback(true) }
      api('get', { sessionId }).then((json) => {
        if (!alive) return
        if (json && json.ok) {
          const counts = json.counts || {}
          const t = json.title
          setMeta({
            id: sessionId,
            // entry.parsed.title 是 {title, source} 对象（已知陷阱），取 .title。
            title: t && typeof t === 'object' ? String(t.title || '') : String(t || ''),
            // M8a：自定义标题覆盖显示（userTitle || title）。
            userTitle: json.userTitle || null,
            userMessages: counts['user/message'] || 0,
            toolCalls: counts['tool/call'] || 0,
            turns: counts['turn/start'] || 0,
          })
        } else {
          if (canLive) setLiveFallback(true)
          else setLoadErr((json && json.error) || STR.detailFailed)
        }
      }).catch((e) => {
        if (!alive) return
        if (canLive) setLiveFallback(true)
        else setLoadErr(String(e && e.message || e))
      })
      return () => { alive = false }
    }, [sessionId, retryKey])

    if (liveFallback) {
      return h(SessionFlowLiveFallback, {
        sessionId,
        connection: props.connection,
        onRetry: () => setRetryKey((k) => k + 1),
      })
    }
    if (loadErr) {
      return h('div', { className: 'sf-view' },
        h('div', { className: 'sf-hint', style: { color: '#d43b3b' } }, STR.detailFailed + ': ' + loadErr))
    }
    if (meta === null) {
      return h('div', { className: 'sf-view' }, h('div', { className: 'sf-hint' }, STR.detailLoading))
    }
    return h(SessionFlowDetail, {
      session: meta,
      sessions: props.sessions,
      connection: props.connection,
      onBack: props.onOpenWorkbench,
      backLabel: STR.openWorkbench,
      embedded: true,
      onClose: () => {},
      initialSearchQuery: pendingQuery,
      // M7 遗留 L1：透传跨视图 inspect 握手（chat Inspect 按钮 → 会话流定位）。
      inspect: props.inspect,
      onInspectDone: props.onInspectDone,
    })
  }

  // ── M7 遗留 L2：会话未落盘时的实时兜底视图 ────────────────────────
  // 档案通道未命中（host get 404）时，用实时通道（sessions.history → derive）
  // 渲染折叠时间线 + 3s 轮询，并保留「重试档案视图」入口。逻辑与 SessionFlowDetail
  // 内实时通道同构（结构信号运行判定 / 只折叠新回合 / 不传 hideHead），自包含实现。
  function SessionFlowLiveFallback(props) {
    const { sessionId, connection } = props
    const [state, setState] = useState({ phase: 'loading', error: null, timeline: null, eventCount: 0, running: false })
    const [collapsed, setCollapsed] = useState(() => new Set())
    const [activeTurn, setActiveTurn] = useState(null)
    const liveSeenTurns = useRef(new Set())
    const timer = useRef(null)

    const fetchLive = useRef(async () => {})
    fetchLive.current = async () => {
      if (connection === undefined || connection.api === undefined || connection.api.sessions === undefined) {
        setState((s) => ({ ...s, phase: 'error', error: STR.liveUnavailable }))
        return
      }
      setState((s) => ({ ...s, phase: s.timeline === null ? 'loading' : 'ready' }))
      try {
        const resp = await connection.api.sessions.history({ sessionId, mode: 'full', maxMessages: 400 })
        const val = resp && resp.result && resp.result.value
        if (val === undefined || !Array.isArray(val.events)) {
          setState((s) => ({ ...s, phase: 'error', error: STR.liveFail }))
          return
        }
        const events = val.events.map((entry) => (entry && entry.event) || entry)
        const derived = await api('derive', { events })
        if (!derived || !derived.ok) {
          setState((s) => ({ ...s, phase: 'error', error: (derived && derived.error) || STR.liveFail }))
          return
        }
        const tl = (derived.timeline && derived.timeline.turns) || []
        setState({
          phase: 'ready', error: null, timeline: tl, eventCount: events.length,
          running: derived.running === true,
        })
        // 只折叠新出现的回合（默认折叠），已展开的保持用户状态（M6 经验）。
        const newTurns = tl.filter((t) => !liveSeenTurns.current.has(t.turn))
        for (const t of tl) liveSeenTurns.current.add(t.turn)
        if (newTurns.length > 0) {
          setCollapsed((prev) => {
            const next = new Set(prev)
            for (const t of newTurns) next.add('turn-' + t.turn)
            return next
          })
        }
      } catch (e) {
        setState((s) => ({ ...s, phase: 'error', error: STR.liveFail + ': ' + String(e && e.message || e) }))
      }
    }

    useEffect(() => {
      liveSeenTurns.current.clear()
      fetchLive.current()
      if (timer.current === null) timer.current = setInterval(() => { fetchLive.current() }, 3000)
      return () => { if (timer.current !== null) { clearInterval(timer.current); timer.current = null } }
    }, [sessionId])

    const toggle = (key) => {
      setCollapsed((prev) => {
        const next = new Set(prev)
        if (next.has(key)) next.delete(key)
        else next.add(key)
        return next
      })
    }

    return h('div', { className: 'sf-view' },
      h('div', { className: 'sf-viewHeader' },
        h('span', { className: 'sf-badge sf-badgeRun', style: { flex: 'none' } }, STR.liveActive),
        h('span', { className: 'sf-liveText' }, STR.liveFallbackHint),
        h('button', { className: 'sf-btn sf-liveExitBtn', onClick: props.onRetry }, STR.retryArchive),
      ),
      state.phase === 'loading' && h('div', { className: 'sf-hint' }, STR.liveLoading),
      state.phase === 'error' && h('div', { className: 'sf-hint', style: { color: '#d43b3b' } }, state.error),
      state.phase === 'ready' && state.timeline !== null && state.timeline.length === 0 && h('div', { className: 'sf-hint' }, STR.noTimeline),
      state.phase === 'ready' && state.timeline !== null && state.timeline.length > 0 && h(TimelineTurns, {
        // 不传 hideHead：折叠回合需保留展开入口（M6 经验）。
        turns: state.timeline, collapsed, toggle,
        liveActive: state.running === true,
        activeTurn, setActiveTurn,
      }),
    )
  }

  // ── 主视图（总览 ⇄ 详情）───────────────────────────────────────────
  function SessionFlowView(props) {
    const [detail, setDetail] = useState(null) // { session, searchQuery }

    return detail === null
      ? h(SessionFlowOverview, {
          // M5c 方案C：总览检索词随会话带入详情页，自动执行会话内检索。
          onOpen: (session, searchQuery) => setDetail({ session, searchQuery }),
          onClose: props.onClose,
          sessions: props.sessions,
        })
      : h(SessionFlowDetail, {
          session: detail.session,
          initialSearchQuery: detail.searchQuery || '',
          sessions: props.sessions,
          connection: props.connection,
          onBack: () => setDetail(null),
          onClose: props.onClose,
        })
  }

  // ── M11：钢琴键会话快切（会话页左侧常驻竖条）─────────────────────
  // 数据：ctx.sessions.list（ObservableSnapshot 订阅）→ 过滤（排除 subagent、隐藏 blank）
  // → 排序（updatedAt 降序，收藏置顶）→ 分组（连续 cwd 同段，段间黑白交替）。
  // 点击 sessions.open(id) 切换；会话切换由框架重挂载会话组件（M7 已验证）。
  // 错误角标：挂载时拉一次 host list 索引（toolErrors 映射）。
  // 预览卡：hover 200ms 防抖 → host get 单个会话（缓存秒回）→ fixed 浮层（不裁剪）。
  // 交互：滚轮/箭头滚动窗口（默认 15 键，兼容大量会话）、键盘 ↑↓/Enter、
  // 收藏星标（localStorage）、右键「在会话流中打开」（工作台唤起）。
  const PIANO_FAVS_KEY = 'dsh.sessionFlow.pianoFavs' // 预留（收藏键 v2 迁移用；当前轮次导航不使用）
  const PENDING_SEARCH_KEY = 'dsh.sessionFlow.pendingSearch' // 方向 A：全文命中跳转桥
  // M12：并入右栏状态桥——挂 window 全局共享（跨 factory 实例/热重载稳定；
  // 曾用模块闭包 const dockState，热重载后新 apply 闭包访问不到 → ReferenceError 踩坑）。
  const dockBridge = (typeof window !== 'undefined' && window.__dshSessionFlowDock__) ||
    (typeof window !== 'undefined'
      ? (window.__dshSessionFlowDock__ = { open: false, listeners: new Set(), controller: null })
      : { open: false, listeners: new Set(), controller: null })
  const PIANO_WINDOW = 15

  // 定位目标：会话内容区。注意必须选**滚动容器** scrollBody（data-conversation-scroll）：
  // viewArea 在滚动场景下 rect 是「内容全尺寸」（如 y=-25687, h=26823），用它定位会把
  // 竖条甩到视口外（实测踩坑）。scrollBody 才有正确的视口内矩形。
  // 优先级：scrollBody（滚动容器）→ viewArea（仅无 scrollBody 时兜底）。
  function pianoViewArea() {
    const col = document.querySelector(CONVERSATION_SELECTOR)
    if (col === null) return undefined
    const body = col.querySelector('[data-conversation-scroll]')
    if (body instanceof Element) return body
    const area = col.querySelector('[class*=viewArea]')
    if (area instanceof Element) return area
    return undefined
  }

  // ── M11：本会话轮次导航（会话页左侧常驻悬浮条目条，v3）──────────
  // 范围：只显示【当前会话】的对话轮次（用户消息），不跨会话/不跨工作区。
  // 数据：官方消息行锚点 DOM 驱动（data-time-hover-root，dsh-navbar 同款机制，
  // 零 RPC 实时）：用户行 = 无 data-turn-tail + 含 [class*=bubble]。
  // 轮次 → 结论预览：按顺序索引映射 host get 的 lightTurns（用户消息摊平）。
  // 交互：点击滚动定位该轮、active 跟随视口第一条、窗口裁剪 + 滚轮/▲▼、
  // 键盘 ↑↓/Enter、hover 预览卡（该轮用户消息 + 结论）、右键唤起会话流工作台。
  // 样式：DeepSeek 网页版右侧悬浮消息导航风格（圆角卡片 + 单行截断文字），移到左侧。
  function TurnKeys(props) {
    const { sessions, onOpenWorkbench } = props
    const [entries, setEntries] = useState([]) // [{turn, seq, preview}] host 全量用户轮次
    const [activeIdx, setActiveIdx] = useState(-1)
    const [winOffset, setWinOffset] = useState(0)
    const [kbGlobal, setKbGlobal] = useState(null)
    const [detailIdx, setDetailIdx] = useState(null) // 右侧信息面板显示的条目索引
    const detailTimer = useRef(null)
    const rootRef = useRef(null) // 悬浮条根容器（面板定位换算基准）
    const [jumpFail, setJumpFail] = useState(false) // 未加载轮次提示
    const [, force] = useState(0)

    // 定位自管理：垂直居中悬浮于会话内容区（scrollBody 矩形中心 + translateY(-50%)）。
    const [pos, setPos] = useState(null) // {left, top(区中心)}
    useEffect(() => {
      const compute = () => {
        const area = pianoViewArea()
        if (area === undefined) { setPos(null); return }
        const r = area.getBoundingClientRect()
        if (r.width === 0 && r.height === 0) return
        const seat = area.querySelector('[data-composer-seat]')
        const seatH = seat ? seat.getBoundingClientRect().height : 0
        setPos({ left: r.left, top: r.top + Math.max(0, r.height - seatH) / 2 })
      }
      compute()
      window.addEventListener('resize', compute)
      const iv = setInterval(compute, 2000)
      return () => { window.removeEventListener('resize', compute); clearInterval(iv) }
    }, [])

    // 订阅会话列表变化：切换会话（current 变化）→ 重渲染刷新条目。
    useEffect(() => {
      if (sessions && sessions.list && typeof sessions.list.subscribe === 'function') {
        return sessions.list.subscribe(() => force((n) => n + 1))
      }
      return undefined
    }, [sessions])

    // 默认定位到【最新一轮】：首次拿到条目后窗口初始 offset 指向末尾
    // （此前默认从最旧开始，看最新轮次需翻页——已修正）。之后用户手动
    // 翻页/新消息到达都不再重置（不打断用户当前窗口位置）。
    const initTailDone = useRef(false)
    useEffect(() => {
      if (initTailDone.current || entries.length <= WINDOW) return
      initTailDone.current = true
      setWinOffset(entries.length - WINDOW)
    }, [entries])

    // 当前会话 id（仅取 current，不展示跨会话列表）。
    const currentId = (() => {
      try {
        const s = sessions && sessions.list && typeof sessions.list.getSnapshot === 'function' ? sessions.list.getSnapshot() : null
        return s && s.current ? s.current : null
      } catch (e) { return null }
    })()

    // 条目数据：host get lightTurns 全量用户轮次（含往期，不受 DOM 虚拟列表窗口限制）。
    // 轮询降载（PERF-ANALYSIS §4.1）：大会话 get 每轮 ~383ms（缓存 JSON.parse）——
    // 观察消息流 DOM 变化（新消息/流式渲染）→ 立即刷新并切高频（3s）；
    // 空闲时低频兜底（15s），避免常驻高频轮询空转。
    useEffect(() => {
      if (!currentId) { setEntries([]); return undefined }
      let alive = true
      // 切换会话后重置「已定位」标记，下次加载重新定位到新会话末尾。
      initTailDone.current = false
      const refresh = () => {
        api('get', { sessionId: currentId }).then((json) => {
          if (!alive || !json || !json.ok) return
          const flat = []
          for (const lt of json.lightTurns || []) {
            for (const u of lt.userMessages || []) {
              flat.push({ turn: lt.turn, seq: u.seq, preview: u.preview })
            }
          }
          // 防御：同一 seq 只保留一条（避免同一条消息重复渲染 = 「最后一条显示两次」）。
          const seen = new Set()
          const dedup = flat.filter((e) => {
            if (seen.has(e.seq)) return false
            seen.add(e.seq)
            return true
          })
          setEntries((prev) => {
            if (prev.length === dedup.length && prev.length > 0 && prev[prev.length - 1].seq === dedup[dedup.length - 1].seq) return prev
            return dedup
          })
        }).catch(() => {})
      }
      const ACTIVE_MS = 3000
      const IDLE_MS = 15000
      let iv = null
      const schedule = (delay) => {
        if (iv) clearInterval(iv)
        iv = setInterval(refresh, delay)
      }
      // DOM 变化（新消息/流式渲染）：立即刷新 + 切高频；1s 节流防虚拟列表滚动刷屏。
      let flowObs = null
      let lastDomRefresh = 0
      const onDomChange = () => {
        if (!alive) return
        const now = Date.now()
        if (now - lastDomRefresh < 1000) return
        lastDomRefresh = now
        refresh()
        schedule(ACTIVE_MS)
      }
      const flowEl = document.querySelector('[data-chat-flow=""]') || document.querySelector('[data-focus-flow=""]')
      if (flowEl) {
        flowObs = new MutationObserver(onDomChange)
        flowObs.observe(flowEl, { childList: true, subtree: true })
      }
      refresh()
      schedule(IDLE_MS)
      return () => { alive = false; if (iv) clearInterval(iv); if (flowObs) flowObs.disconnect() }
    }, [currentId])

    // DOM 行工具：官方消息行锚点（dsh-navbar 同款）。
    const domRows = () => [...document.querySelectorAll('[data-time-hover-root]')]
      .filter((r) => !r.hasAttribute('data-pending-steering'))
      .filter((r) => !r.hasAttribute('data-turn-tail') && r.querySelector('[class*=bubble]') !== null)
    const textOf = (row) => {
      const b = row.querySelector('[class*=bubble]')
      return b ? String(b.textContent || '').replace(/\s+/g, ' ').trim() : ''
    }
    // 归一化：剥离 markdown 标记（**加粗**/行内代码/链接/符号），使 host 原始
    // preview 与 DOM 渲染后的 textContent 可比（否则 startsWith 永远失败 →
    // 近轮次误判「未找到」+ 加载循环误匹配其他轮次，实测踩坑）。
    const norm = (s) => String(s || '')
      .replace(/`{1,3}[^`]*`{1,3}/g, ' ')
      .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/[*_#>|~-]{1,3}/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
    // 条目 → DOM 行匹配：preview 归一化截断前缀与行文本归一化后 includes 比较。
    const findRow = (entry) => {
      const core = norm(String(entry.preview || '').replace(/…+$/u, '')).slice(0, 50)
      if (!core) return null // 无文字内容（纯图片/文件消息）无法文本定位
      for (const row of domRows()) {
        const t = norm(textOf(row))
        if (t && t.includes(core.slice(0, 30))) return row
      }
      return null
    }

    // 点击定位：先查该轮次是否已加载（DOM 中能否匹配到对应行）——
    // 已加载 → 平滑滚动定位；未加载 → 只提示、不跳转（自动加载循环会让消息流
    // 乱滚/跳错位置，实测踩坑；用户需先在会话区向上滚动加载历史再点击）。
    const open = (entry) => {
      const row = findRow(entry)
      if (row) { row.scrollIntoView({ behavior: 'smooth', block: 'start' }); return }
      setJumpFail(true)
      setTimeout(() => setJumpFail(false), 2600)
    }

    // active：视口内第一条 DOM 用户行 → 文本匹配条目索引高亮（阅读位置跟随）。
    useEffect(() => {
      const compute = () => {
        if (entries.length === 0) { setActiveIdx(-1); return }
        const rows = domRows()
        let target = null
        let bestTop = Number.POSITIVE_INFINITY
        for (const row of rows) {
          const top = row.getBoundingClientRect().top
          if (top >= 0 && top < bestTop) { bestTop = top; target = row }
        }
        if (!target) { setActiveIdx(entries.length - 1); return }
        const t = norm(textOf(target))
        const idx = entries.findIndex((e) => {
          const core = norm(String(e.preview || '').replace(/…+$/u, '')).slice(0, 50)
          return core && t.includes(core.slice(0, 30))
        })
        setActiveIdx(idx)
      }
      compute()
      const iv = setInterval(compute, 800)
      return () => clearInterval(iv)
    }, [entries])

    const WINDOW = 12
    const hidden = entries.length < 2
    const windowed = entries.slice(winOffset, winOffset + WINDOW)
    const canUp = winOffset > 0
    const canDown = winOffset + WINDOW < entries.length

    // 悬浮条滚轮/▲▼：只翻悬浮条自身窗口，绝不影响会话区滚动（用户明确要求）。
    const onKeyDown = (e) => {
      if (entries.length === 0) return
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault()
        const dir = e.key === 'ArrowDown' ? 1 : -1
        setKbGlobal((prev) => {
          const base = prev === null ? (dir > 0 ? -1 : entries.length) : prev
          return Math.max(0, Math.min(entries.length - 1, base + dir))
        })
      } else if (e.key === 'Enter' && kbGlobal !== null && entries[kbGlobal]) {
        e.preventDefault()
        open(entries[kbGlobal])
      }
    }
    useEffect(() => {
      if (kbGlobal === null) return
      if (kbGlobal < winOffset) setWinOffset(kbGlobal)
      else if (kbGlobal >= winOffset + WINDOW) setWinOffset(kbGlobal - WINDOW + 1)
    }, [kbGlobal])

    // 滚轮翻页：React onWheel 是被动监听器（passive: true），内部 preventDefault
    // 无效并刷屏告警（实测踩坑）——改原生 addEventListener('wheel', {passive:false})。
    const stripRef = useRef(null)
    useEffect(() => {
      const el = stripRef.current
      if (el === null) return undefined
      const onNativeWheel = (e) => {
        e.preventDefault()
        e.stopPropagation()
        if (e.deltaY > 0) setWinOffset((o) => Math.min(Math.max(0, entries.length - WINDOW), o + 1))
        else setWinOffset((o) => Math.max(0, o - 1))
      }
      el.addEventListener('wheel', onNativeWheel, { passive: false })
      return () => el.removeEventListener('wheel', onNativeWheel)
    }, [entries.length])

    // 右侧信息面板：hover 条目/键盘聚焦时弹出该轮信息（保留弹出面板、移除原生
    // tooltip——tooltip 与面板重复且视觉凌乱）；鼠标在条目与面板间移动 150ms 宽限。
    const showDetail = (idx) => {
      if (detailTimer.current) clearTimeout(detailTimer.current)
      setDetailIdx(idx)
    }
    const hideDetail = () => {
      if (detailTimer.current) clearTimeout(detailTimer.current)
      detailTimer.current = setTimeout(() => setDetailIdx(null), 150)
    }
    useEffect(() => () => { if (detailTimer.current) clearTimeout(detailTimer.current) }, [])
    // 键盘聚焦跟随显示面板。
    useEffect(() => {
      if (kbGlobal !== null && entries[kbGlobal]) showDetail(kbGlobal)
    }, [kbGlobal])

    const rootStyle = pos === null ? { display: 'none' } : {
      left: pos.left + 'px',
      top: pos.top + 'px',
      transform: 'translateY(-50%)',
      display: hidden ? 'none' : undefined,
    }

    const detailEntry = detailIdx !== null ? entries[detailIdx] : null
    // 面板位置：absolute 相对悬浮条容器（容器有 translateY(-50%) transform，fixed
    // 会退化为相对容器——必须按容器内偏移计算）。条目 = strip 直接子元素，
    // 索引 = detailIdx - winOffset；越界修正按视口坐标换算回容器内。
    let detailPos = null
    const rootRect = rootRef.current ? rootRef.current.getBoundingClientRect() : null
    if (detailEntry && rootRect) {
      const el = stripRef.current ? stripRef.current.children[detailIdx - winOffset] : null
      if (el instanceof Element) {
        const r = el.getBoundingClientRect()
        const topV = Math.min(r.top, Math.max(4, window.innerHeight - 320))
        detailPos = { left: r.right - rootRect.left + 8, top: topV - rootRect.top }
      }
    }

    return h('div', { 'data-dsh-piano-keys': '', ref: rootRef, style: rootStyle },
      h('div', { className: 'pk-head' },
        h('span', { className: 'pk-headLabel' }, STR.pianoTitle),
        h('div', { className: 'pk-navGroup' },
          h('button', { className: 'pk-navBtn', disabled: !canUp, onClick: () => setWinOffset((o) => Math.max(0, o - 1)), title: STR.expanded }, '▲'),
          h('button', { className: 'pk-navBtn', disabled: !canDown, onClick: () => setWinOffset((o) => Math.min(Math.max(0, entries.length - WINDOW), o + 1)), title: STR.collapsed }, '▼'),
        ),
      ),
      h('div', { className: 'pk-strip', ref: stripRef, tabIndex: 0, onKeyDown, onMouseDown: (e) => { if (e.target === e.currentTarget) e.preventDefault() }, 'aria-label': STR.pianoTitle },
        windowed.map((entry, idx) => {
          const gi = winOffset + idx
          const act = activeIdx === gi
          return h('button', {
            key: 'turn-' + gi + '-' + entry.seq,
            type: 'button',
            className: 'pk-key' + (act ? ' pk-keyActive' : '') + (kbGlobal === gi ? ' pk-keyFocus' : ''),
            // 点击后主动失焦：避免 button 焦点让 :focus-within 常驻展开
            // （鼠标移开后悬浮条收不拢，箭头「残留」——实测踩坑）。
            onClick: (e) => { open(entry); e.currentTarget.blur() },
            onMouseEnter: () => showDetail(gi),
            onMouseLeave: hideDetail,
            onContextMenu: (e) => {
              e.preventDefault()
              if (onOpenWorkbench) onOpenWorkbench()
            },
          },
            // 轮次序号：展开态常驻【最左侧】独立模块（与文本模块分离，互不侵占）。
            h('span', { className: 'pk-turnNo' }, 'T' + entry.turn),
            h('span', { className: 'pk-label' }, entry.preview || '（空）'),
          )
        }),
      ),
      // 信息面板：跟随 hover 条目右侧展开（fixed，位置由 detailPos 控制）；
      // 常驻渲染 + hidden 类做滑入/滑出；内容 key 变化触发 pkSlideIn。
      h('div', { className: 'pk-detail' + (detailEntry ? '' : ' hidden'), style: detailPos, onMouseEnter: () => showDetail(detailIdx), onMouseLeave: hideDetail },
        detailEntry && h('div', { key: 'h' + detailEntry.turn, className: 'pk-detailHead' }, 'T' + detailEntry.turn + ' · ' + STR.user),
        detailEntry && h('div', { key: 'b' + detailEntry.turn, className: 'pk-detailBody' }, detailEntry.preview || '（空）'),
      ),
      // 跳转状态提示：常驻渲染 + hidden 类（从下方淡入/淡出）；未加载轮次提示。
      h('div', { className: 'pk-status' + (jumpFail ? '' : ' hidden') + (jumpFail ? ' warn' : '') },
        jumpFail ? STR.pianoJumpFail : '',
      ),
    )
  }

  // ── M12：详情并入右侧栏（details 槽位轻量视图）────────────────────
  // 随会话自动切换（槽位 session 作用域 key 重挂载）；数据复用 host get/getTurn；
  // 回合列表直接复用 TurnList（展开 → TimelineTurns 完整渲染）。
  function DetailsDockView(props) {
    const { sessionId, connection, onExit } = props
    const [state, setState] = useState({ phase: 'loading', error: null, data: null })
    const [collapsed, setCollapsed] = useState(() => new Set())
    const collapsedInit = useRef(false)
    const [turnItems, setTurnItems] = useState(() => new Map())
    const loadingTurns = useRef(new Set())

    useEffect(() => {
      let alive = true
      setState({ phase: 'loading', error: null, data: null })
      setTurnItems(new Map())
      collapsedInit.current = false
      if (!sessionId) { setState({ phase: 'empty', error: null, data: null }); return }
      api('get', { sessionId }).then((json) => {
        if (!alive) return
        if (json && json.ok) {
          setState({ phase: 'ready', error: null, data: json })
        } else {
          setState({ phase: 'error', error: (json && json.error) || 'get failed', data: null })
        }
      }).catch((e) => { if (alive) setState({ phase: 'error', error: String(e), data: null }) })
      return () => { alive = false }
    }, [sessionId])

    useEffect(() => {
      if (state.phase !== 'ready' || collapsedInit.current) return
      collapsedInit.current = true
      const all = new Set()
      for (const lt of state.data.lightTurns || []) all.add('turn-' + lt.turn)
      setCollapsed(all)
    }, [state.phase])

    const toggle = (key) => {
      setCollapsed((prev) => {
        const next = new Set(prev)
        if (next.has(key)) next.delete(key)
        else next.add(key)
        return next
      })
    }
    const ensureTurn = async (turnNo) => {
      if (turnItems.has(turnNo) || loadingTurns.current.has(turnNo)) return
      loadingTurns.current.add(turnNo)
      try {
        const json = await api('getTurn', { sessionId, turn: turnNo })
        if (json && json.ok && json.turn) {
          setTurnItems((prev) => new Map(prev).set(turnNo, json.turn))
        }
      } catch (e) {
        console.warn('[dsh-session-flow] getTurn failed', turnNo, e)
      } finally {
        loadingTurns.current.delete(turnNo)
      }
    }

    const data = state.data
    const lightTurns = (data && data.lightTurns) || []
    const toolStats = (data && data.toolStats) || []
    // 规则摘要（与详情页同口径，精简版）。
    const ruleTaskCount = lightTurns.filter((lt) => lt.userMessages && lt.userMessages.length > 0).length
    const ruleGoal = (() => {
      for (const lt of lightTurns) {
        if (lt.userMessages && lt.userMessages.length > 0) return String(lt.userMessages[0].preview).slice(0, 150)
      }
      return ''
    })()
    const ruleConclusion = (() => {
      for (let i = lightTurns.length - 1; i >= 0; i--) {
        if (lightTurns[i].conclusionPreview) return String(lightTurns[i].conclusionPreview).slice(0, 220)
      }
      return ''
    })()
    const ruleTools = toolStats.slice(0, 6).map((t) => t.name + '·' + t.count).join('  ')

    return h('div', { className: 'dk-root' },
      h('div', { className: 'dk-head' },
        h('span', { className: 'dk-title' }, STR.dockHint),
        h('button', { className: 'dk-btn', onClick: onExit }, STR.dockExit),
      ),
      h('div', { className: 'dk-body' },
        state.phase === 'loading' && h('div', { className: 'sf-hint' }, STR.detailLoading),
        state.phase === 'empty' && h('div', { className: 'sf-hint' }, STR.dockEmpty),
        state.phase === 'error' && h('div', { className: 'sf-hint', style: { color: '#d43b3b' } }, STR.detailFailed + ': ' + String(state.error)),
        state.phase === 'ready' && h('div', { className: 'dk-summary' },
          ruleTaskCount > 0 && h('div', { className: 'dk-summaryRow' },
            h('span', { className: 'dk-summaryTag' }, STR.summaryTaskCount),
            h('span', { className: 'dk-summaryText' }, ruleTaskCount),
          ),
          ruleGoal && h('div', { className: 'dk-summaryRow' },
            h('span', { className: 'dk-summaryTag' }, STR.summaryGoal),
            h('span', { className: 'dk-summaryText' }, ruleGoal),
          ),
          ruleConclusion && h('div', { className: 'dk-summaryRow' },
            h('span', { className: 'dk-summaryTag' }, STR.summaryConclusion),
            h('span', { className: 'dk-summaryText' }, ruleConclusion),
          ),
          ruleTools && h('div', { className: 'dk-summaryRow' },
            h('span', { className: 'dk-summaryTag' }, STR.summaryTools),
            h('span', { className: 'dk-summaryText' }, ruleTools),
          ),
          data.summary && h('div', { className: 'dk-summaryFull' }, data.summary),
        ),
        state.phase === 'ready' && lightTurns.length === 0 && h('div', { className: 'sf-hint' }, STR.noTimeline),
        state.phase === 'ready' && h(TurnList, {
          sessionId,
          lightTurns,
          collapsed,
          toggle,
          ensureTurn,
          turnItems,
        }),
      ),
    )
  }

  // ── M11：钢琴键竖条挂载（DOM 注入 + 自愈）────────────────────────
  // 容器挂 document.body（dsh-navbar 同款模式）：完全脱离会话区布局树，
  // 不干扰 conversation 的 flex/grid 布局；fixed 定位由组件自管理。
  // MutationObserver 自愈：容器丢失（布局重建）时自动恢复。
  function mountPianoKeys(controller, sessions, connection) {
    let root = undefined
    let container = undefined
    let waitObserver = null

    // M11×视图：轮次条只在「对话」tab（ChatView）激活时显示——官方 viewArea
    // 只渲染激活视图（only: active.id），轨迹/Plan图/会话流 tab 下 ChatView 卸载，
    // `[data-chat-flow]` 随之消失（会话流标签页有自己的 sf-view，不冲突）。
    const syncChatVisibility = () => {
      if (container === undefined) return
      const chatFlow = document.querySelector('[data-chat-flow]')
      container.style.display = chatFlow !== null ? '' : 'none'
    }

    const ensure = () => {
      if (container !== undefined) {
        if (container.isConnected) return
        if (root) { try { root.unmount() } catch (e) {} root = undefined }
        container = undefined
      }
      container = document.createElement('div')
      document.body.appendChild(container)
      try {
        root = createRoot(container)
        root.render(h(TurnKeys, {
          sessions,
          connection,
          onOpenWorkbench: () => controller.open(),
        }))
        syncChatVisibility()
      } catch (e) {
        console.error('[dsh-session-flow:piano] render failed:', e)
        if (root) { try { root.unmount() } catch (e2) {} root = undefined }
        if (container) { container.remove(); container = undefined }
      }
    }

    waitObserver = new MutationObserver(() => { ensure(); syncChatVisibility() })
    waitObserver.observe(document.body, { childList: true, subtree: true })
    ensure()

    return () => {
      waitObserver.disconnect()
      if (root) { try { root.unmount() } catch (e) {} root = undefined }
      if (container) { container.remove(); container = undefined }
    }
  }

  // ── 侧边栏入口（DOM 级注入 + 自愈）────────────────────────────────
  const ICON = `<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2.5 3.5h11M2.5 8h11M2.5 12.5h7"/></svg>`
  function sidebarRoot() {
    const column = document.querySelector('[data-pane="sidebar"], [class*="sidebarCol"]')
    if (column === null) return undefined
    const logoOwner = column.querySelector('[class*="logoRow"]')?.parentElement
    return logoOwner ?? (column.firstElementChild)
  }

  function newSessionButton(root) {
    const nested = root.querySelector('button[class*="newSession"]')
    if (nested !== null) return nested
    for (const child of root.children) {
      if (child.tagName === 'BUTTON') return child
    }
    return undefined
  }

  function createEntry(controller) {
    const entry = document.createElement('button')
    entry.type = 'button'
    entry.dataset.dshSessionFlowEntry = ''
    entry.className = 'sf-entry'
    entry.setAttribute('aria-label', STR.entry)
    entry.innerHTML = `<span class="sf-entryIcon">${ICON}</span><span class="sf-entryLabel">${STR.entry}</span>`
    entry.addEventListener('click', () => { controller.toggle() })
    return entry
  }

  function placeEntry(root, entry) {
    const button = newSessionButton(root)
    if (button === undefined) return false
    if (entry.parentElement !== root) {
      const row = button.closest('[class*="logoRow"]')
      const base = (row !== null && row.parentElement === root) ? row : button
      const family = Array.from(root.children).filter(
        (el) => el instanceof HTMLElement && el.matches('[data-dsh-taskboard-entry], [data-dsh-ssh-entry], [data-dsh-session-flow-entry]'),
      )
      // 固定插到家族块末尾：taskboard/ssh 各自把「自己」插到家族最前，
      // 互相抢占会让相对顺序随加载/自愈时序漂移；我们把位置钉在末尾，
      // 任何时序下都稳定排在最后（顺序：任务看板 → SSH → 会话流）。
      const last = family.length > 0 ? family[family.length - 1] : base
      root.insertBefore(entry, last.nextElementSibling)
    }
    return true
  }

  function mountSidebarEntry(controller) {
    const entry = createEntry(controller)
    let root = undefined
    let placed = false
    let rootObserver = null
    let waitObserver = null

    const tryPlace = () => {
      if (root !== undefined && !root.isConnected) {
        if (rootObserver) rootObserver.disconnect()
        root = undefined
        placed = false
      }
      if (placed) {
        if (document.body.contains(entry)) return
        if (rootObserver) rootObserver.disconnect()
        root = undefined
        placed = false
      }
      root = root || sidebarRoot()
      if (root === undefined) return
      placed = placeEntry(root, entry)
      if (placed && rootObserver === null) {
        rootObserver = new MutationObserver(() => {
          if (root === undefined || !root.isConnected) {
            placed = false
            tryPlace()
            return
          }
          if (!root.contains(entry)) placed = placeEntry(root, entry)
        })
        rootObserver.observe(root, { childList: true, subtree: true })
      }
    }

    waitObserver = new MutationObserver(() => { tryPlace() })
    waitObserver.observe(document.body, { childList: true, subtree: true })

    const syncActive = () => {
      if (controller.getSnapshot().open) entry.dataset.active = 'true'
      else delete entry.dataset.active
    }
    const unsubscribe = controller.subscribe(syncActive)
    syncActive()
    tryPlace()

    return () => {
      if (waitObserver) waitObserver.disconnect()
      if (rootObserver) rootObserver.disconnect()
      unsubscribe()
      entry.remove()
    }
  }

  // ── 中栏全页视图（DOM 级接管，参照 task-board board-mount）────────
  function mountBoard(controller, sessions, connection) {
    let root = undefined
    let container = undefined
    let waitObserver = null

    const ensure = () => {
      if (container !== undefined) return
      const column = document.querySelector(CONVERSATION_SELECTOR)
      if (column === null) return
      container = document.createElement('div')
      container.dataset.dshSessionFlowView = ''
      // 注意：容器不加任何会设置 display 的 class，可见性完全由
      // [data-dsh-session-flow-view] 属性规则控制（见 STYLE 注释）。
      column.appendChild(container)
      root = createRoot(container)
      root.render(h(SessionFlowView, { sessions, connection, onClose: () => controller.close() }))
    }

    waitObserver = new MutationObserver(() => { ensure() })
    waitObserver.observe(document.body, { childList: true, subtree: true })

    const applyActive = () => {
      if (controller.getSnapshot().open) {
        for (const attr of OTHER_ACTIVE_ATTRS) document.documentElement.removeAttribute(attr)
        document.documentElement.setAttribute(ACTIVE_ATTR, '')
        document.dispatchEvent(new CustomEvent(ACTIVATE_EVENT, { detail: PANEL_NAME }))
      } else {
        document.documentElement.removeAttribute(ACTIVE_ATTR)
      }
    }
    const unsubscribe = controller.subscribe(applyActive)
    applyActive()
    ensure()

    return () => {
      waitObserver.disconnect()
      unsubscribe()
      document.documentElement.removeAttribute(ACTIVE_ATTR)
      if (root) { root.unmount(); root = undefined }
      if (container) { container.remove(); container = undefined }
    }
  }

  // ── 插件体 ─────────────────────────────────────────────────────────
  const inject = ['sessions', 'connection', 'slots', 'layout']

  function apply(ctx) {
    try {
      // 注入样式（幂等）。
      if (!document.getElementById('dsh-session-flow-style')) {
        const style = document.createElement('style')
        style.id = 'dsh-session-flow-style'
        style.textContent = STYLE
        document.head.appendChild(style)
      }

      const sessions = ctx.get('sessions')
      const connection = ctx.get('connection')

      const state = { open: false, listeners: new Set() }
      const controller = {
        getSnapshot: () => ({ open: state.open }),
        subscribe: (fn) => {
          state.listeners.add(fn)
          return () => state.listeners.delete(fn)
        },
        toggle: () => {
          state.open = !state.open
          for (const fn of state.listeners) fn()
        },
        close: () => {
          if (state.open) {
            state.open = false
            for (const fn of state.listeners) fn()
          }
        },
        open: () => {
          // 二期：嵌入标签页「打开完整工作台」→ 唤起侧边栏工作台。
          if (!state.open) {
            state.open = true
            for (const fn of state.listeners) fn()
          }
        },
      }

      const onActivate = (event) => {
        if (event.detail !== PANEL_NAME && state.open) controller.close()
      }
      document.addEventListener(ACTIVATE_EVENT, onActivate)

      // 二期：嵌入原生会话页 —— conversation.view 槽位环（会话作用域标签页）。
      // 参照 ui-trajectory(order 10) / plan-graph(order 20) 的注册模式：
      // slots.inject 自带生命周期（插件卸载自动移除标签页），无需手动清理。
      // label 支持字符串或惰性求值函数；order 越大越靠后（对话/轨迹/Plan图 之后）。
      const slots = ctx.get('slots')
      if (slots !== undefined && typeof slots.inject === 'function' && typeof slots.register === 'function') {
        try {
          slots.inject('conversation.view', () => slots.register({
            name: 'conversation.view',
            id: 'session-flow',
            order: 30,
            label: STR.entry,
          }, (props) => h(SessionFlowTab, {
            sessionId: props ? props.sessionId : undefined,
            sessions,
            connection,
            onOpenWorkbench: () => controller.open(),
          })))
        } catch (error) {
          console.error('[dsh-session-flow] conversation.view registration failed:', error)
        }
      }

      // M12：详情并入右侧栏 —— details 槽位动态占用（priority -1 低于官方 tool-details）。
      // 并入开启时注册 + **打开官方 details 列（layout.openDetails——列默认宽度 0 不可见，
      // plan-graph 同款；曾漏开列导致「无响应」，实测踩坑）**；退出/卸载注销 + closeDetails。
      // 官方在会话切换时自动 closeDetails（无法阻止）——并入期间：
      //  ① html 打 data-dsh-dock-active 标记 → CSS 禁用 grid 列宽过渡（切换无「关→开」动画）；
      //  ② 高频守护（150ms）快速重开列 → 视觉上右栏内容直接刷新为新会话。
      const layout = ctx.get('layout')
      let detailsRegistration = null
      let detailsGuard = null
      const setDockActive = (on) => {
        try {
          if (on) document.documentElement.setAttribute('data-dsh-dock-active', '')
          else document.documentElement.removeAttribute('data-dsh-dock-active')
        } catch (e) {}
      }

      // M12×aionui 兼容层：官方 details 把手按 3 轨模型定位（left = frameWidth - details，
      // 假设 details 是最后一轨）；aionui-panel 把 frame grid 扩为 5 轨
      // （sidebar|center|details|preview|explorer）后，真实边界左移 preview+explorer px，
      // 把手却停在旧位置（悬浮于预览列上方，见 docs/02-design/LAYOUT-COEXIST.md）。
      // dock 激活期间按实际轨宽重算把手位置：三方写 frame style → MutationObserver；
      // 纯缩放（grid 字符串不变）→ ResizeObserver。3 轨时公式退化为官方原值，无副作用。
      const parseGridTracksCompat = (input) => {
        const tracks = []
        let depth = 0
        let current = ''
        for (const ch of String(input)) {
          if (ch === '(') depth += 1
          if (ch === ')') depth = Math.max(0, depth - 1)
          if (ch === ' ' && depth === 0) {
            if (current !== '') { tracks.push(current); current = '' }
            continue
          }
          current += ch
        }
        if (current !== '') tracks.push(current)
        return tracks
      }
      const detailsHandleCompat = {
        frame: null,
        observer: null,
        sizeObserver: null,
        start() {
          if (this.observer !== null) return
          const frame = document.querySelector('[data-dsh-frame]') ||
            (document.querySelector('[class*="sidebarCol"]') || {}).parentElement || null
          if (frame === null) return
          this.frame = frame
          this.observer = new MutationObserver(() => this.apply())
          this.observer.observe(frame, { attributes: true, attributeFilter: ['style'] })
          this.sizeObserver = new ResizeObserver(() => this.apply())
          this.sizeObserver.observe(frame)
          this.apply()
        },
        stop() {
          if (this.observer !== null) { this.observer.disconnect(); this.observer = null }
          if (this.sizeObserver !== null) { this.sizeObserver.disconnect(); this.sizeObserver = null }
          this.frame = null
        },
        apply() {
          const frame = this.frame
          if (frame === null) return
          const tracks = parseGridTracksCompat(frame.style.gridTemplateColumns)
          if (tracks.length < 3) return
          const trackPx = (t) => {
            const m = /^(-?[\d.]+)px$/.exec(String(t).trim())
            return m === null ? 0 : Number(m[1])
          }
          const details = trackPx(tracks[2])
          const preview = tracks.length >= 4 ? trackPx(tracks[3]) : 0
          const explorer = tracks.length >= 5 ? trackPx(tracks[4]) : 0
          const handle = frame.querySelector('[data-side="details"]')
          if (handle === null) return
          handle.style.left = `${Math.round(frame.getBoundingClientRect().width - details - preview - explorer)}px`
        },
      }
      const ensureColumn = () => {
        if (dockBridge.open && layout !== undefined && typeof layout.openDetails === 'function') {
          try { layout.openDetails() } catch (e) {}
        }
      }
      const syncDetails = () => {
        if (dockBridge.open && detailsRegistration === null && slots !== undefined && typeof slots.inject === 'function') {
          try {
            detailsRegistration = slots.inject('details', () => slots.register({
              name: 'details',
              priority: -1,
            }, (props) => h(DetailsDockView, {
              sessionId: props ? props.sessionId : undefined,
              connection,
              onExit: () => dockBridge.controller.close(),
            })))
            setDockActive(true)
            ensureColumn()
          } catch (error) {
            console.error('[dsh-session-flow] details dock registration failed:', error)
            detailsRegistration = null
          }
        } else if (!dockBridge.open && detailsRegistration !== null) {
          try { detailsRegistration() } catch (e) {}
          detailsRegistration = null
          setDockActive(false)
          if (layout !== undefined && typeof layout.closeDetails === 'function') {
            try { layout.closeDetails() } catch (e) {}
          }
        }
      }
      dockBridge.controller = {
        getSnapshot: () => ({ open: dockBridge.open }),
        subscribe: (fn) => {
          dockBridge.listeners.add(fn)
          return () => dockBridge.listeners.delete(fn)
        },
        open: () => {
          if (!dockBridge.open) {
            dockBridge.open = true
            syncDetails()
            detailsHandleCompat.start()
            // 会话切换时官方会自动 closeDetails —— 高频守护快速重开（无动画，内容直接刷新）。
            if (detailsGuard === null) {
              detailsGuard = setInterval(() => { ensureColumn() }, 150)
            }
            for (const fn of dockBridge.listeners) fn()
          }
        },
        close: () => {
          if (dockBridge.open) {
            dockBridge.open = false
            syncDetails()
            detailsHandleCompat.stop()
            if (detailsGuard !== null) { clearInterval(detailsGuard); detailsGuard = null }
            for (const fn of dockBridge.listeners) fn()
          }
        },
      }
      syncDetails()

      // 点击侧边栏会话/工作区行 → 交还中栏给会话。
      const onClickSidebarRow = (event) => {
        if (!state.open) return
        const target = event.target
        if (target === null || !(target instanceof Element)) return
        if (target.closest(SIDEBAR_ROW_SELECTOR) !== null) controller.close()
      }
      document.addEventListener('click', onClickSidebarRow, true)

      // 视图激活期间的滚动护栏：底层会话的自动跟随滚动（流式输出时持续触发）
      // 会把挂载在窗格内的绝对定位视图顶出视口（“top 栏逐渐上抬被半遮住”）。
      // 捕获阶段监听所有 scroll 事件，把会话流视图子树之外的任何滚动容器复位到 0
      // （会话流打开时底层内容本来就不可见，复位无副作用）。
      const onAnyScroll = (event) => {
        if (!state.open) return
        const target = event.target
        if (target === document) {
          const se = document.scrollingElement
          if (se !== null && se.scrollTop !== 0) se.scrollTop = 0
          return
        }
        if (!(target instanceof Element)) return
        const viewEl = document.querySelector(VIEW_SELECTOR)
        if (viewEl !== null && viewEl.contains(target)) return
        if (target.scrollTop !== 0) target.scrollTop = 0
      }
      document.addEventListener('scroll', onAnyScroll, true)

      const disposers = []
      try {
        disposers.push(mountSidebarEntry(controller))
        disposers.push(mountBoard(controller, sessions, connection))
        // M11：钢琴键会话快切（会话页左侧常驻竖条）；挂载失败不影响其他功能。
        disposers.push(mountPianoKeys(controller, sessions, connection))
      } catch (error) {
        console.error('[dsh-session-flow] mount failed:', error)
      }

      const teardown = () => {
        // M12：卸载时注销 details 槽位占用（恢复官方 tool-details）+ 关列 + 清守护 + 移除标记。
        if (detailsRegistration) {
          try { detailsRegistration() } catch (e) {}
          detailsRegistration = null
        }
        if (detailsGuard !== null) { clearInterval(detailsGuard); detailsGuard = null }
        setDockActive(false)
        detailsHandleCompat.stop()
        if (layout !== undefined && typeof layout.closeDetails === 'function') {
          try { layout.closeDetails() } catch (e) {}
        }
        dockBridge.open = false
        document.removeEventListener(ACTIVATE_EVENT, onActivate)
        document.removeEventListener('click', onClickSidebarRow, true)
        document.removeEventListener('scroll', onAnyScroll, true)
        for (const dispose of disposers.splice(0)) dispose()
      }
      if (typeof ctx.effect === 'function') ctx.effect(() => teardown)
      else window.addEventListener('beforeunload', teardown)
    } catch (error) {
      console.error('[dsh-session-flow] apply failed:', error)
    }
  }

  module.exports = { inject, apply }
  // 必须返回 module.exports：client-modules 的 materialize 直接用 factory 的
  // 返回值作为插件导出（不 return 会导致加载器拿到 undefined → boot 失败）。
  return module.exports;
}})
