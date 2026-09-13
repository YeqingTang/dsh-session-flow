// src/styles.js — 样式与矢量图标数据块（SETTINGS_STYLE / NAV_ICON_* / STYLE）。
import { VIEW_SELECTOR, ACTIVE_ATTR } from './shared.js'
// 由 lib/client.js 拆出（2026-09-13，客户端源码模块化；适配发布审查的单文件体积上限）。
// 构建链：npm run build:client（esbuild 打包压缩为 lib/client.js，factory 契约不变）。
// ⚠️ 本文件是源码，不直接运行——运行时只加载 lib/client.js 产物；改动后必须重新构建。

  const SETTINGS_STYLE = [
    `.sfset-root{padding:4px 2px;display:flex;flex-direction:column;max-width:560px}`,
    `.sfset-desc{margin:0 0 10px;font-size:13px;line-height:1.5;color:var(--dsw-alias-label-tertiary)}`,
    `.sfset-groupTitle{margin:14px 0 4px;font-size:13px;font-weight:600;line-height:1.5;color:var(--dsw-alias-label-primary);border-bottom:1px solid var(--dsw-alias-border-l2);padding-bottom:4px}`,
    `.sfset-row{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:10px 0}`,
    `.sfset-meta{min-width:0;flex:1}`,
    `.sfset-label{font-size:13px;font-weight:500;line-height:1.5;color:var(--dsw-alias-label-primary);display:flex;align-items:center;gap:8px}`,
    `.sfset-overridden{white-space:nowrap;background:var(--dsw-alias-bg-module-platform);color:var(--dsw-alias-label-secondary);border-radius:999px;padding:1px 8px;font-size:11px;font-weight:500;line-height:17px}`,
    `.sfset-hint{font-size:12px;line-height:1.5;color:var(--dsw-alias-label-tertiary);margin-top:2px}`,
    `.sfset-controls{flex:none;display:flex;align-items:center;gap:8px}`,
    `.sfset-input{width:110px;height:34px;box-sizing:border-box;padding:0 12px;font:inherit;font-size:13px;line-height:1.5;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:var(--dsw-alias-bg-layer-3);color:var(--dsw-alias-label-primary)}`,
    `.sfset-row.sfset-invalid .sfset-input{border-color:var(--dsw-alias-label-error)}`,
    `.sfset-reset{font:inherit;font-size:12px;line-height:1.5;color:var(--dsw-alias-label-secondary);cursor:pointer;background:0 0;border:none;padding:0}`,
    `.sfset-reset:hover:not(:disabled){color:var(--dsw-alias-label-primary)}`,
    `.sfset-footer{display:flex;align-items:center;gap:8px;margin-top:16px;border-top:1px solid var(--dsw-alias-border-l2);padding-top:12px}`,
    `.sfset-save{appearance:none;font:inherit;font-size:13px;line-height:1.5;cursor:pointer;border:1px solid #0000;border-radius:8px;padding:5px 14px;background:var(--dsw-alias-label-primary);color:var(--dsw-alias-bg-layer-3)}`,
    `.sfset-save:disabled{opacity:.4;cursor:default}`,
    `.sfset-discard{appearance:none;font:inherit;font-size:13px;line-height:1.5;cursor:pointer;border-radius:8px;padding:5px 14px;border:1px solid var(--dsw-alias-border-l2);background:0 0;color:var(--dsw-alias-label-secondary)}`,
    `.sfset-discard:hover:not(:disabled){color:var(--dsw-alias-label-primary);border-color:var(--dsw-alias-label-dimmed)}`,
    `.sfset-discard:disabled{opacity:.4;cursor:default}`,
    `.sfset-error{font-size:12px;line-height:1.5;color:var(--dsw-alias-label-error)}`,
    `.sfset-check{width:16px;height:16px;accent-color:var(--dsw-alias-label-primary);cursor:pointer}`,
    `.sfset-unavailable{font-size:13px;line-height:1.5;color:var(--dsw-alias-state-warn-primary)}`,
  ].join('\n')

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
    `[class*=centerCol]{position:relative}`,
    `.sf-rail-conclusion{margin-top:8px;padding-top:8px;border-top:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.25));font-size:12px;line-height:1.5;color:var(--dsw-alias-label-primary,#222)}`,
    `.sf-turnMeta{display:flex;flex-wrap:wrap;gap:3px 10px;font-size:11px;font-weight:600;color:var(--dsw-alias-label-secondary,#555)}`,
    `.sf-turnMetaChip{display:inline-flex;align-items:center;gap:3px}`,
    `.sf-turnMetaChip.err{color:var(--dsw-alias-label-error,#d43b3b)}`,
    `.sf-ico{display:inline-flex}`,
    `.sf-rail-conclusionTools{margin-top:3px;font-size:11px;color:var(--dsw-alias-label-tertiary,#999);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}`,
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
    // T2 修复：flex:1 1 0（flex-basis 用绝对 0 长度，非 flex:1 的 0% 百分比）。
    // 根因（诊断数据 d47b82bf 实测）：官方 viewArea 是 min-height:auto（聊天视图靠它
    // 撑开内容 + 粘性输入框，不可全局强改）；flex:1 的 0% 基准在父级高度不定时被
    // Chrome 按 content 处理 → .sf-view 假设尺寸=内容高 → viewArea 内容下限被顶高 →
    // 溢出 scrollBody → 整块滚动。基准用绝对 0 → 假设尺寸=0 → viewArea 下限=0 →
    // 回到 flex 分配空间，两列各自内部滚动。工作台模式父容器非 flex，flex 无效无害。
    `.sf-view{box-sizing:border-box;background:var(--dsw-alias-bg-base,#fff);min-width:0;height:100%;flex:1 1 0;min-height:0;color:var(--dsw-alias-label-primary,#222);font-family:var(--dsw-font-family,inherit);flex-direction:column;gap:10px;padding:14px 16px 16px;display:flex;overflow:hidden}`,
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
    // 卡死监控徽标：疑似卡死（红，呼吸动画引起注意）/ 工具执行中·静默中（黄）。
    `.sf-badgeStall{background:rgba(230,80,80,.16);color:#d43b3b;animation:sfBadgePulse 2.8s ease-in-out infinite}`,
    `.sf-badgeWait{background:rgba(220,170,40,.15);color:#a87b00}`,
    // 会话页头部健康芯片（官方 header.actions 槽位，模式标识右侧）。
    // 钢琴键同款语言：收拢态 = 彩色短胶囊条（语义色保留：绿/黄/红，卡死带呼吸脉冲）；
    // 悬浮/聚焦展开为毛玻璃文字标签（backdrop-filter + color-mix，与 pk-key 展开态同构）。
    `.sf-healthChip{display:inline-flex;align-items:center;gap:6px;height:20px;padding:0 3px;margin-left:2px;border:none;border-radius:99px;background:transparent;cursor:pointer;font-family:inherit;overflow:hidden;outline:none;transition:padding .22s ease,background .18s ease,border-color .18s ease,box-shadow .18s ease}`,
    `.sf-healthChip .sf-hcBar{flex:none;width:4px;height:16px;border-radius:99px;transition:width .22s ease,height .22s ease}`,
    `.sf-healthChip .sf-hcLabel{font-size:11px;line-height:16px;white-space:nowrap;max-width:0;opacity:0;overflow:hidden;user-select:none;transition:max-width .24s ease,opacity .16s ease .05s}`,
    // 展开态：毛玻璃底（blur 10px）+ 同色系淡 tint 背景（状态色 14% 透明混入 72% 基底色），
    // 边框带 40% 状态色呼应；tint 淡雅、毛玻璃质感保留。
    `.sf-healthChip:hover,.sf-healthChip:focus-visible{padding:3px 9px;border:1px solid var(--dsw-alias-border-l2,#e4e6eb);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);box-shadow:0 1px 3px rgba(0,0,0,.07)}`,
    `.sf-healthChip.hc-active:hover,.sf-healthChip.hc-active:focus-visible{background:color-mix(in srgb,var(--dsw-alias-bg-base,#fff) 72%,rgba(28,158,90,.14));border-color:color-mix(in srgb,var(--dsw-alias-border-l2,#e4e6eb) 60%,#1c9e5a)}`,
    `.sf-healthChip.hc-wait:hover,.sf-healthChip.hc-wait:focus-visible{background:color-mix(in srgb,var(--dsw-alias-bg-base,#fff) 72%,rgba(217,165,20,.14));border-color:color-mix(in srgb,var(--dsw-alias-border-l2,#e4e6eb) 60%,#d9a514)}`,
    `.sf-healthChip.hc-stall:hover,.sf-healthChip.hc-stall:focus-visible{background:color-mix(in srgb,var(--dsw-alias-bg-base,#fff) 72%,rgba(212,59,59,.14));border-color:color-mix(in srgb,var(--dsw-alias-border-l2,#e4e6eb) 60%,#d43b3b)}`,
    `.sf-healthChip:hover .sf-hcBar,.sf-healthChip:focus-visible .sf-hcBar{width:6px;height:6px;border-radius:99px}`,
    `.sf-healthChip:hover .sf-hcLabel,.sf-healthChip:focus-visible .sf-hcLabel{max-width:200px;opacity:1}`,
    `.sf-healthChip.hc-active .sf-hcBar{background:#1c9e5a}`,
    `.sf-healthChip.hc-active .sf-hcLabel{color:#1c9e5a}`,
    `.sf-healthChip.hc-wait .sf-hcBar{background:#d9a514}`,
    `.sf-healthChip.hc-wait .sf-hcLabel{color:#a87b00}`,
    `.sf-healthChip.hc-stall .sf-hcBar{background:#d43b3b;animation:sfBadgePulse 2.8s ease-in-out infinite}`,
    `.sf-healthChip.hc-stall .sf-hcLabel{color:#d43b3b}`,
    `.sf-healthChip.hc-idle .sf-hcBar{background:var(--dsw-alias-label-tertiary,#b8bcc4);opacity:.55}`,
    `.sf-healthChip.hc-idle .sf-hcLabel{color:var(--dsw-alias-label-tertiary,#999)}`,
    `.sf-healthChip.hc-idle:hover,.sf-healthChip.hc-idle:focus-visible{background:color-mix(in srgb,var(--dsw-alias-bg-base,#fff) 72%,rgba(128,128,128,.12));border-color:color-mix(in srgb,var(--dsw-alias-border-l2,#e4e6eb) 60%,#9aa0a8)}`,
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
    // 头部布局：标题+按钮**聚左**，spacer 吃掉右侧余量——彻底规避右上角
    // dsh-better-sidebar toggleCluster（视口级常驻浮钮，压过官方 details 列右缘，
    // 实测「退出并入」被压）。按钮不再进右上角浮动图标区，任何第三方浮钮都压不到。
    `.dk-root{box-sizing:border-box;height:100%;min-height:0;display:flex;flex-direction:column;gap:8px;padding:10px 12px;overflow:hidden;color:var(--dsw-alias-label-primary,#222);font-family:var(--dsw-font-family,inherit)}`,
    `.dk-head{flex:none;display:flex;align-items:center;flex-wrap:wrap;gap:8px;min-width:0}`,
    `.dk-title{flex:none;min-width:0;font-size:13px;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:40%}`,
    `.dk-headSpacer{flex:1 1 auto;min-width:0;align-self:stretch;pointer-events:none}`,
    `.dk-btn{flex:none;border:1px solid var(--dsw-alias-border-l2,#ddd);background:var(--dsw-alias-bg-layer-1,#f5f5f5);color:var(--dsw-alias-label-primary,#222);border-radius:7px;padding:3px 9px;font-size:11px;cursor:pointer;white-space:nowrap}`,
    `.dk-btn:hover{border-color:var(--dsw-alias-brand-primary,#4a7dff);color:var(--dsw-alias-brand-primary,#4a7dff)}`,
    // T6：dock 实时开关激活态（绿色语义，与详情页 sf-liveBar 同色系）。
    `.dk-btn.dk-btnLive{border-color:rgba(28,158,90,.5);background:rgba(28,158,90,.08);color:#1c9e5a;font-weight:600}`,
    `.dk-body{flex:1;min-height:0;overflow:auto;display:flex;flex-direction:column;gap:6px}`,
    `.dk-summary{border:1px solid var(--dsw-alias-border-l2,#e4e6eb);border-radius:10px;padding:8px 10px;background:var(--dsw-alias-bg-layer-1,#f8f9fa);flex:none;display:flex;flex-direction:column;gap:4px}`,
    `.dk-summaryRow{display:flex;gap:6px;font-size:11.5px;line-height:1.5;color:var(--dsw-alias-label-secondary,#666);min-width:0}`,
    `.dk-summaryTag{flex:none;border-radius:5px;padding:0 5px;font-size:10px;line-height:16px;font-weight:700;background:rgba(90,140,255,.12);color:#4a7dff}`,
    `.dk-summaryText{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}`,
    `.dk-summaryFull{font-size:12px;line-height:1.6;color:var(--dsw-alias-label-primary,#222);white-space:pre-wrap;word-break:break-word;max-height:140px;overflow:auto}`,
    // T8-B 钉住提示条：琥珀色警示（直播会话 ≠ 当前会话）。
    `.dk-pinBar{flex:none;display:flex;align-items:center;gap:8px;padding:5px 8px;border:1px solid rgba(224,150,63,.45);background:rgba(224,150,63,.08);border-radius:8px}`,
    `.dk-pinText{flex:1;min-width:0;font-size:12px;color:#c07a2a}`,
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
    `[data-dsh-piano-keys]{position:fixed;left:0;top:50%;width:32px;max-height:60vh;z-index:15;display:flex;flex-direction:column;padding:0 0 8px;font-family:var(--dsw-font-family,inherit);transition:width .26s cubic-bezier(.3,1.15,.4,1)}`,
    // 收拢时序（T4）：宽度与条目高度（.pk-key .22s）**同时起跑**——用户要求纵向横向
    // 同时收拢（此前宽度延迟 .22s 造成「先纵后横」两段式）；详情信息框仍先行立即
    // 滑出（.pk-detail.hidden 无延迟），不参与纵向节奏。进入（hover/focus）同态：
    // 无延迟即时展开，收拢=展开的倒放。
    // 收拢锁（collapse-lock）：pointerleave 后 300ms 内抑制 :hover 展开（focus-within 不受影响）。
    // 日志实锤的几何自反馈回路：展开态越界 → 整条收拢（几何瞬变）→ 收拢后的胶囊条
    // 「弹到」静止鼠标下方 → 合成 mouseenter → :hover 重新展开 → 再越界……每 300-500ms
    // 一个来回（「横条反复出现消失」）。锁窗内 :hover 不展开，回路断开；真实驻留 300ms
    // 后正常展开（顺带构成驻留去抖：快速掠过不再闪开）。
    `[data-dsh-piano-keys]:not([data-collapse-lock]):hover,[data-dsh-piano-keys]:focus-within{width:200px;transition-delay:0s}`,
    `html[${ACTIVE_ATTR}] [data-dsh-piano-keys]{display:none!important}`,
    // T5：strip 高度 JS 显式管理（setStripHeight：可见行数 × 实测行距 + 上下内边距
    // 16 − 间隙 5；收拢/展开键高动画期间 RO 逐帧跟随）——clipper 是 absolute 脱流，
    // strip 不能再靠内容撑高（实测塌缩整条消失）。**必须 flex:1 1 auto**（basis:auto
    // 时 height 属性才是弹性基准；flex:1 = basis 0% 会架空 JS height——实测踩坑）。
    // shrink 保留配合 60vh 硬上限压缩。裁剪面=pk-clip（absolute inset:0 = strip
    // 【内容盒】）：CSS overflow 裁剪在内边距盒——上下缓冲键各露 3px 进内边距带
    // （「上面会话的下边框露出一点点」实测踩坑）；clipper 把可见区收到恰好 12 行。
    // 垂直呼吸全部移出 strip：标题行下边距 8 + 根容器下内边距 8（均静止件）；
    // strip 零 padding——绝对定位 clipper 的 inset:0 解析的是【padding box】而非
    // 内容盒，padding 留在 strip 上不参与裁剪、键却从 y=0 起排画进 padding 带
    // （顶键贴死标题行、底部框线被裁——实测踩坑）。strip 高度=纯内容 rows×pitch−5。
    `.pk-strip{flex:1 1 auto;min-height:0;max-height:calc(60vh - 60px);position:relative;outline:none}`,
    `.pk-clip{position:absolute;inset:0;overflow:hidden}`,
    // 键挂 pk-list 上；transform 由 JS 逐帧驱动（rAF 追逐 scrollPos + 实测行距，
    // renderStart 离散跳变时同步重设——CSS transition 会把内容重排的跳变也做成
    // 动画，每滚一行顿一次，实测踩坑）。
    // 垂直内边距在 strip（静止件）不在 list（移动件）：padding 挂移动件会随
    // transform 平移，键从 y=8 起排 → 缓冲键底边 +3px 露出裁剪线（实测踩坑）。
    `.pk-list{display:flex;flex-direction:column;gap:5px;padding:0 4px;will-change:transform}`,
    // 收拢态：短横条（胶囊线）；overflow:hidden 使 label 文字被高度裁剪（来源=胶囊）；
    // ::before 延伸命中区（±4px，点击/悬浮无死区）。
    // T4 二阶段：box-sizing:border-box + 确定高度（4px↔30px）——原展开态 height:auto
    // 不可插值（日志实锤：全程无 height 过渡事件），高度在两态间瞬移 120↔408px，
    // 收拢条边缘 hover 进出即整条几何反复跳变（用户实测「闪烁抽搐」）。
    `.pk-key{position:relative;flex:none;box-sizing:border-box;height:4px;min-height:4px;border-radius:99px;border:none;cursor:pointer;padding:0;margin:0 4px;background:var(--dsw-alias-border-l2,#d7dae0);color:var(--dsw-alias-label-primary,#222);overflow:hidden;transition:height .22s ease,padding .22s ease,margin .22s ease,border-radius .22s ease,background .14s ease,border-color .14s ease,box-shadow .18s ease;outline:none;min-width:0}`,
    `.pk-key::before{content:'';position:absolute;left:0;right:0;top:-4px;bottom:-4px}`,
    // 热区填满死区（三日志轮实锤症状一）：strip 上下内边距 8px 只有 ::before ±4px 覆盖，
    // 标题行/首键之间残留 4px 死区——鼠标停进去 key[0] 高亮+详情面板熄灭，跨出又点亮，
    // 窄带内反复横跳=「横条出现消失」。首/末键 ::before 精确补到 strip 边缘（-8px），
    // 带内任意位置都算 hover 该键，高亮/面板稳定常驻；键间隙 5px 由相邻 ±4px 互叠已全覆盖。
    `.pk-key:first-child::before{top:-8px}`,
    `.pk-key:last-child::before{bottom:-8px}`,
    `.pk-key:hover{background:var(--dsw-alias-brand-primary,#4a7dff)}`,
    `.pk-key:focus-visible{outline:2px solid var(--dsw-alias-brand-primary,#4a7dff);outline-offset:-1px}`,
    `.pk-keyActive{background:var(--dsw-alias-brand-primary,#4a7dff)}`,
    `.pk-keyFocus{background:var(--dsw-alias-brand-primary,#4a7dff)}`,
    // 展开态（悬浮/聚焦）：条目变文字卡片；label 常驻（缩略态被条目高度裁剪），
    // 展开时随高度过渡露出文字（来源=胶囊内部，目标=卡片全文）。
    // T4 二阶段：height:auto → height:30px（label 18 + padding 10 + border 2 = 原自然
    // 高度，最终几何不变）——确定长度可插值，与收拢态 4px 平滑互转（倒放对称）。
    `[data-dsh-piano-keys]:not([data-collapse-lock]):hover .pk-key,[data-dsh-piano-keys]:focus-within .pk-key{display:flex;align-items:center;gap:6px;height:30px;min-height:30px;border-radius:10px;border:1px solid var(--dsw-alias-border-l2,#e4e6eb);padding:5px 8px;margin:0;background:color-mix(in srgb,var(--dsw-alias-bg-base,#fff) 80%,transparent);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);box-shadow:0 1px 3px rgba(0,0,0,.07)}`,
    // 热区链（四日志轮定位症状一）：head↔gap↔首键 必须连续同态，否则边界 1px 晃动
    // 即反复点亮/熄灭首键高亮（横条出现消失）。gap 由首键 ::before 覆盖（上文），
    // head 由下行选择器链到首键：hover 标题行 ≡ hover 第一个键。
    `[data-dsh-piano-keys]:not([data-collapse-lock]):hover .pk-key:hover,[data-dsh-piano-keys]:focus-within .pk-key:hover,[data-dsh-piano-keys]:not([data-collapse-lock]):hover .pk-head:hover ~ .pk-strip .pk-key:first-child{background:color-mix(in srgb,var(--dsw-alias-bg-base,#fff) 96%,transparent);border-color:var(--dsw-alias-brand-primary,#4a7dff)}`,
    `[data-dsh-piano-keys]:not([data-collapse-lock]):hover .pk-keyActive,[data-dsh-piano-keys]:focus-within .pk-keyActive{border-color:var(--dsw-alias-brand-primary,#4a7dff);background:color-mix(in srgb,var(--dsw-alias-brand-primary,#4a7dff) 10%,var(--dsw-alias-bg-base,#fff))}`,
    `.pk-label{flex:1;min-width:0;font-size:12px;line-height:18px;max-height:18px;color:var(--dsw-alias-label-primary,#222);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;user-select:none;opacity:0;transition:opacity .18s ease .06s}`,
    `[data-dsh-piano-keys]:not([data-collapse-lock]):hover .pk-label,[data-dsh-piano-keys]:focus-within .pk-label{opacity:1}`,
    // 轮次序号：缩略态折叠（宽度 0 + 透明），展开态从左侧展开露出（来源=左缘）。
    `.pk-turnNo{flex:none;width:0;min-width:0;overflow:hidden;opacity:0;text-align:left;font-size:9.5px;line-height:16px;font-weight:600;color:var(--dsw-alias-label-tertiary,#999);font-family:ui-monospace,Consolas,monospace;user-select:none;white-space:nowrap;transition:width .22s ease,opacity .16s ease .04s}`,
    `[data-dsh-piano-keys]:not([data-collapse-lock]):hover .pk-turnNo,[data-dsh-piano-keys]:focus-within .pk-turnNo{width:28px;min-width:28px;opacity:1}`,
    // hover 条目：在【该条目右侧】展开信息面板（.pk-detail）——absolute 相对悬浮条容器，
    // 坐标按条目位置换算为容器内偏移（注意：容器有 transform:translateY(-50%)，fixed 子元素
    // 会被 transform 祖先劫持成相对容器定位——用视口坐标会双重偏移，实测踩坑）。
    `[data-dsh-piano-keys]:not([data-collapse-lock]):hover .pk-key:hover,[data-dsh-piano-keys]:focus-within .pk-key.pk-keyFocus,[data-dsh-piano-keys]:not([data-collapse-lock]):hover .pk-head:hover ~ .pk-strip .pk-key:first-child{position:relative;z-index:2;box-shadow:0 4px 16px rgba(0,0,0,.18)}`,
    // 展开时序：详情框延迟 .28s 再滑入——等悬浮条展开动画完成、条目就位后，
    // 位置才准确（第一次展开时条目仍在变形，立即计算会错位，实测踩坑）；
    // 隐藏则立即（无延迟）。
    `.pk-detail{position:absolute;left:0;top:0;width:264px;max-height:calc(60vh - 40px);display:flex;flex-direction:column;gap:6px;background:color-mix(in srgb,var(--dsw-alias-bg-base,#fff) 76%,transparent);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);border:1px solid var(--dsw-alias-border-l2,#e4e6eb);border-radius:12px;box-shadow:0 8px 28px rgba(0,0,0,.18);padding:10px 12px;z-index:6;overflow:hidden;opacity:1;transform:translateX(0);transition:opacity .18s ease .28s,transform .24s cubic-bezier(.25,1.1,.4,1) .28s,visibility .24s .28s}`,
    `.pk-detail.hidden{opacity:0;transform:translateX(14px);visibility:hidden;pointer-events:none;transition:opacity .18s ease,transform .24s cubic-bezier(.25,1.1,.4,1),visibility .24s}`,
    `.pk-detailHead{flex:none;font-size:10.5px;font-weight:700;color:var(--dsw-alias-label-secondary,#666);font-family:ui-monospace,Consolas,monospace;letter-spacing:.2px}`,
    `.pk-detailMeta{flex:none;margin:3px 0 2px}`,
    // 面板内容随条目切换：新内容从右轻滑入（key 变化重新挂载触发 animation）。
    `.pk-detailBody{min-height:0;font-size:12.5px;line-height:1.6;color:var(--dsw-alias-label-primary,#222);white-space:pre-wrap;word-break:break-word;overflow-y:auto;max-height:320px;animation:pkSlideIn .22s ease}`,
    `@keyframes pkSlideIn{from{opacity:0;transform:translateX(10px)}to{opacity:1;transform:translateX(0)}}`,
    // 跳转状态提示条（悬浮条下方，与悬浮条等宽）：文字在条宽内换行增高显示完整
    // 文案（不加宽），从下方淡入/淡出（来源=悬浮条底缘）；毛玻璃。
    `.pk-status{position:absolute;left:0;right:0;top:calc(100% + 4px);padding:7px 10px;border-radius:8px;background:color-mix(in srgb,var(--dsw-alias-bg-base,#fff) 82%,transparent);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);border:1px solid var(--dsw-alias-border-l2,#e4e6eb);font-size:11px;line-height:1.5;color:var(--dsw-alias-label-secondary,#666);box-shadow:0 4px 14px rgba(0,0,0,.12);z-index:6;text-align:center;white-space:normal;word-break:break-word;opacity:1;transform:translateY(0);transition:opacity .18s ease,transform .22s ease,visibility .22s}`,
    `.pk-status.hidden{opacity:0;transform:translateY(8px);visibility:hidden;pointer-events:none}`,
    `.pk-status.warn{color:#d97706;border-color:rgba(217,119,6,.4)}`,
    // 头部：从上方滑入（来源=悬浮条顶缘）——max-height/padding/opacity/transform 过渡，
    // 不占缩略态布局。内容「标题 + ▲▼ 按钮组（并排右上）」。
    `.pk-head{display:flex;flex:none;align-items:center;gap:4px;padding:0 6px;margin-bottom:8px;color:var(--dsw-alias-label-secondary,#666);font-size:10px;line-height:1.2;border-bottom:1px solid var(--dsw-alias-border-l2,#e5e5e5);max-height:0;overflow:hidden;opacity:0;transform:translateY(-6px);transition:max-height .24s ease,padding .24s ease,opacity .18s ease,transform .24s ease}`,
    `[data-dsh-piano-keys]:not([data-collapse-lock]):hover .pk-head,[data-dsh-piano-keys]:focus-within .pk-head{max-height:30px;padding-top:5px;padding-bottom:5px;opacity:1;transform:translateY(0)}`,
    `.pk-headLabel{flex:1;min-width:0;font-size:10.5px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}`,
    `.pk-navGroup{flex:none;display:flex;gap:3px}`,
    `.pk-navBtn{flex:none;width:20px;height:20px;border:1px solid var(--dsw-alias-border-l2,#ddd);background:var(--dsw-alias-bg-layer-1,#f5f5f5);color:var(--dsw-alias-label-primary,#222);border-radius:6px;cursor:pointer;font-size:9px;line-height:1;padding:0;transition:border-color .14s ease,color .14s ease}`,
    `.pk-navBtn:hover:not(:disabled){border-color:var(--dsw-alias-brand-primary,#4a7dff);color:var(--dsw-alias-brand-primary,#4a7dff)}`,
    `.pk-navBtn:disabled{opacity:.35;cursor:default}`,
    `@keyframes sfPianoPulse{0%,100%{opacity:.35}50%{opacity:1}}`,
  ].join('\n')

export { SETTINGS_STYLE, NAV_ICON_USER, NAV_ICON_TOOL, NAV_ICON_ERR, NAV_ICON_SEARCH, STYLE }
