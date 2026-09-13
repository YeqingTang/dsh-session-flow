// src/shared.js — 跨模块共享的 DOM 选择器常量（client.js 逻辑与 styles.js CSS 模板串共用）。
// 由 lib/client.js 拆出（2026-09-13，客户端源码模块化；适配发布审查的单文件体积上限）。
// ⚠️ 本文件是源码，不直接运行——运行时只加载 lib/client.js 产物；改动后必须重新构建。

export const VIEW_SELECTOR = '[data-dsh-session-flow-view]'
export const ACTIVE_ATTR = 'data-dsh-session-flow-active'
