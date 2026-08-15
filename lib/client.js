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
    search: '搜索标题/工具/文件… 支持 tool: pwsh · file: src · err:', allWorkspaces: '全部工作区',
    sortRecent: '最近运行', sortNewest: '最近创建', sortOldest: '最早创建', sortTools: '工具最多', sortLongest: '耗时最长',
    noMatch: '没有匹配的会话', noData: '暂无会话数据',
    running: '进行中', ended: '已结束', subagent: '子代理',
    turns: '回合', steps: '步骤', tools: '工具', errors: '错误', msgs: '消息',
    duration: '耗时', created: '创建', size: '大小', records: '记录',
    jumpFailed: '无法跳转（会话不在当前列表）', unknownTitle: '（未命名会话）',
    loadFailed: '加载失败',
    back: '返回', close: '关闭', jumpNative: '跳转原生会话', expandAll: '全部展开', collapseAll: '全部折叠',
    exportMd: '导出报告 (ZIP)', exporting: '导出中…', exportFail: '导出失败',
    live: '实时', liveActive: '实时 · 进行中', liveExit: '退出实时', liveLoading: '实时加载…',
    liveFail: '实时不可用', liveUnavailable: '（实时通道不可用：连接不可用）',
    liveEvents: '事件', liveRefreshing: '刷新…', liveLastActive: '最后活动',
    liveTurn: '运行中', liveGenerating: '正在生成…',
    detailLoading: '正在解析会话…', noTimeline: '无可展示的时间线', artifacts: '产物',
    noArtifacts: '（未提取到产物路径）', user: '用户', assistant: '助手', step: '步骤',
    args: '参数', result: '结果', thinking: '思考', expanded: '展开', collapsed: '收起',
    detailFailed: '会话详情加载失败', showEmpty: '显示空会话', emptySession: '空会话',
    emptyHint: '此会话已创建但尚未开始对话', userNav: '用户发言', noUserNav: '（无用户发言）',
    conclusion: '结论', injected: '注入', lineage: '血缘', noLineage: '（无子代理血缘信息）',
    liveTree: '运行时血缘', offlineTree: '档案血缘', modeOneShot: '一次性', modeContinuable: '可续',
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
    search: 'Search title / tools / files… use tool: · file: · err:', allWorkspaces: 'All workspaces',
    sortRecent: 'Recently run', sortNewest: 'Recently created', sortOldest: 'Oldest first', sortTools: 'Most tools', sortLongest: 'Longest',
    noMatch: 'No matching sessions', noData: 'No session data yet',
    running: 'Running', ended: 'Ended', subagent: 'subagent',
    turns: 'turns', steps: 'steps', tools: 'tools', errors: 'errors', msgs: 'msgs',
    duration: 'duration', created: 'created', size: 'size', records: 'records',
    jumpFailed: 'Cannot open (session not in live list)', unknownTitle: '(untitled session)',
    loadFailed: 'Load failed',
    back: 'Back', close: 'Close', jumpNative: 'Open in native view', expandAll: 'Expand all', collapseAll: 'Collapse all',
    exportMd: 'Export report (ZIP)', exporting: 'Exporting…', exportFail: 'Export failed',
    live: 'Live', liveActive: 'Live · running', liveExit: 'Exit live', liveLoading: 'Loading live…',
    liveFail: 'Live unavailable', liveUnavailable: '(live channel unavailable: no connection)',
    liveEvents: 'events', liveRefreshing: 'refreshing…', liveLastActive: 'last active',
    liveTurn: 'Running', liveGenerating: 'Generating…',
    detailLoading: 'Parsing session…', noTimeline: 'No timeline to show', artifacts: 'Artifacts',
    noArtifacts: '(no artifact paths extracted)', user: 'User', assistant: 'Assistant', step: 'Step',
    args: 'Args', result: 'Result', thinking: 'Thinking', expanded: 'Expanded', collapsed: 'Collapsed',
    detailFailed: 'Failed to load session detail', showEmpty: 'Show empty sessions', emptySession: 'Empty',
    emptyHint: 'This session was created but has no conversation yet', userNav: 'User turns', noUserNav: '(no user turns)',
    conclusion: 'Conclusion', injected: 'Injected', lineage: 'Lineage', noLineage: '(no subagent lineage)',
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
  ].join('\n')

  // ── API ─────────────────────────────────────────────────────────────
  function api(method, params) {
    return fetch('/api/session-flow', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(Object.assign({ method }, params || {})),
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
              h('span', { className: 'sf-cardText', style: { overflow: 'hidden', textOverflow: 'ellipsis' } }, s.title || STR.unknownTitle),
              s.isEmpty && h('span', { className: 'sf-badge sf-badgeEnd' }, STR.emptySession),
              s.running ? h('span', { className: 'sf-badge sf-badgeRun' }, STR.running) : h('span', { className: 'sf-badge sf-badgeEnd' }, STR.ended),
              s.delegationDepth > 0 && h('span', { className: 'sf-badge sf-badgeSub' }, STR.subagent + ' · d' + s.delegationDepth),
              s.toolErrors > 0 && h('span', { className: 'sf-badge sf-badgeErr' }, STR.errors + ': ' + s.toolErrors),
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
      const label = node.label || node.id
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
        h('button', { className: 'sf-btn', onClick: props.onBack }, '← ' + STR.back),
        h('h2', { className: 'sf-viewTitle', style: { flex: '1 1 auto', overflow: 'hidden', textOverflow: 'ellipsis' } },
          session.title || STR.unknownTitle),
        running ? h('span', { className: 'sf-badge sf-badgeRun' }, STR.running) : h('span', { className: 'sf-badge sf-badgeEnd' }, STR.ended),
        session.delegationDepth > 0 && h('span', { className: 'sf-badge sf-badgeSub' }, STR.subagent),
        h('button', { className: 'sf-btn', onClick: () => { setPendingSelect(null); setView('lineage') } }, STR.lineage),
        // M6 实时通道：进行中会话可实时查看（sessions.history → derive → 折叠视图）。
        props.connection !== undefined && h('button', {
          className: 'sf-btn' + (liveOn ? ' sf-btnActive' : ''),
          onClick: liveOn ? exitLive : enterLive,
          disabled: liveOn && liveState.phase === 'loading',
        }, liveOn ? STR.liveActive + ' ✕' : STR.live),
        h('button', { className: 'sf-btn', onClick: exportSessionMd, disabled: exporting }, exporting ? STR.exporting : STR.exportMd),
        h('button', { className: 'sf-btn', onClick: jumpNative }, STR.jumpNative),
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

  // ── 主视图（总览 ⇄ 详情）───────────────────────────────────────────
  function SessionFlowView(props) {
    const [detail, setDetail] = useState(null) // { session, searchQuery }

    return detail === null
      ? h(SessionFlowOverview, {
          // M5c 方案C：总览检索词随会话带入详情页，自动执行会话内检索。
          onOpen: (session, searchQuery) => setDetail({ session, searchQuery }),
          onClose: props.onClose,
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
  const inject = ['sessions', 'connection']

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
      }

      const onActivate = (event) => {
        if (event.detail !== PANEL_NAME && state.open) controller.close()
      }
      document.addEventListener(ACTIVATE_EVENT, onActivate)

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
      } catch (error) {
        console.error('[dsh-session-flow] mount failed:', error)
      }

      const teardown = () => {
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
