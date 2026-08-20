// lib/host.js — dsh-session-flow 宿主半：注册 /api/session-flow 路由。
//
// 提供方法（POST JSON，body.method）：
//   workspaces                → 工作区列表（含会话数）
//   list    { workspace? }    → 会话索引列表（增量扫描后返回；可带 workspace 限定）
//   rescan  { workspace?, force? } → 强制/增量重扫，返回最新索引
//   get     { sessionId }     → 轻量详情（回合摘要 + 工具统计，秒开）
//   getTurn { sessionId, turn } → 展开回合时按需取完整时间线
//   searchIn { sessionId, query } → 会话内全文检索（匹配位置列表）
//   searchAll { query, workspace? } → 跨会话全文检索（最近 20 会话/总 5s 预算/取消支持）
//   stats                     → 环境信息（dsh home、索引目录、各工作区缓存状态）
//
// 依赖 cordis 服务：webServer（HTTP 载体）；settings（插件设置命名空间，软依赖）。
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFile } from 'node:fs'
import { join } from 'node:path'
import { deflateRawSync } from 'node:zlib'
import z from 'schemastery'
import { decodeFile, listSessionDirs, listWorkspaces, looksLikePath, parseSession, summarizeParsed } from './archive.js'
import { deriveTimeline } from './timeline.js'
import {
  dshHome,
  findWorkspaceOfSession,
  indexRoot,
  readIndex,
  scanWorkspaceIndex,
  workspaceIndexFile,
  writeIndex,
} from './index-store.js'
import { applyRename, MAX_RENAME_LENGTH, saveRenames, userTitleOf } from './renames.js'

export const name = 'dsh-session-flow'

/** 硬依赖：HTTP 载体；LLM 服务用于 M5 摘要（LLM 模式，缺失时降级报错）。 */
export const inject = ['webServer', 'llm']

/**
 * 全程均匀采样（摘要信息源用）：回合多时若只取「最近 N 个」，长会话的早期
 * 任务会全部丢失，摘要会变成「最近几轮」的总结。按首/中/尾均匀抽取覆盖
 * 整个会话，并保证最后一个（任务）回合在内。
 * @param {Array} turns - 已过滤为「任务回合」的列表（每项有 turn 号）。
 * @param {number} k - 最多采样数。
 * @returns {Array} 采样结果（保持原顺序，去重）。
 */
export function sampleTurns(turns, k) {
  if (turns.length <= k) return turns
  const out = []
  for (let i = 0; i < k; i++) {
    const idx = Math.round((i * (turns.length - 1)) / (k - 1))
    if (!out.includes(turns[idx])) out.push(turns[idx])
  }
  return out
}

function readBody(req) {
  return new Promise((resolve) => {
    let raw = ''
    req.on('data', (chunk) => { raw += chunk })
    req.on('end', () => {
      try { resolve(JSON.parse(raw || '{}')) } catch { resolve({}) }
    })
    req.on('error', () => resolve({}))
  })
}

function sendJson(res, status, obj) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
  res.end(JSON.stringify(obj))
}

// ── 卡死监控（stall-monitor）：健康分类 ─────────────────────────────
// 「进行中但长时间无输出」≠ 卡死（模型长思考/长工具执行都静默）。
// 分类只看结构事实：运行中 + 无流式 chunk + 无未闭合工具 + 静默超阈值 → 疑似卡死。
// 阈值可在设置页配置（settings 命名空间 session-flow / stallThresholdMin，分钟）；
// STALL_THRESHOLD_MS 保留为默认值（verify 引用）。
export const STALL_THRESHOLD_MS = 3 * 60 * 1000
export const HEALTH_ACTIVE_WINDOW_MS = 60 * 1000

// ── 插件设置（settings 命名空间 'session-flow'）────────────────────
// 默认值必须与 client.js 的 SETTINGS_DEFAULTS 完全一致（无用户设置时行为零变化）。
export const SETTINGS_DEFAULTS = {
  pianoWindow: 12,        // 轮次悬浮条可见行数
  pianoWheelSpeed: 0.012, // 滚轮灵敏度（行/px）
  pianoSnapMs: 170,       // 静止吸附延迟（ms）
  livePollMs: 3000,       // 实时轮询间隔（ms）
  liveFollowPx: 40,       // 实时吸底阈值（px）
  liveHistoryTurns: 3,    // 详情页实时模式保留的历史回合数
  stallThresholdMin: 3,   // 疑似卡死阈值（分钟）
}

/** schemastery schema：settings 服务 resolve 时调用 schema(merged)，并需要 toJSON()（describe 用）。 */
const SETTINGS_SCHEMA = z.object({
  pianoWindow: z.number().step(1).min(6).max(18).default(SETTINGS_DEFAULTS.pianoWindow),
  pianoWheelSpeed: z.number().min(0.005).max(0.03).default(SETTINGS_DEFAULTS.pianoWheelSpeed),
  pianoSnapMs: z.number().step(1).min(100).max(400).default(SETTINGS_DEFAULTS.pianoSnapMs),
  livePollMs: z.number().step(1).min(1500).max(10000).default(SETTINGS_DEFAULTS.livePollMs),
  liveFollowPx: z.number().step(1).min(20).max(120).default(SETTINGS_DEFAULTS.liveFollowPx),
  liveHistoryTurns: z.number().step(1).min(0).max(10).default(SETTINGS_DEFAULTS.liveHistoryTurns),
  stallThresholdMin: z.number().step(1).min(1).max(10).default(SETTINGS_DEFAULTS.stallThresholdMin),
})

/** 解析后的当前设置值（base + user 层）；host 侧消费点（卡死阈值）从这里读。 */
const liveSettings = { ...SETTINGS_DEFAULTS }

/**
 * 注册 settings 命名空间（软依赖：宿主无 settings 服务时跳过，行为回退默认值）。
 * 模式参照 aionui-panel installSettingsSection：ctx.inject(['settings'], ...) +
 * scope.watch 同步当前值。客户端经 settingsScope 直接读写（pet 同款），无需额外路由。
 */
function installSettings(ctx) {
  try {
    if (typeof ctx.inject !== 'function') return
    ctx.inject(['settings'], (sctx) => {
      try {
        const scope = sctx.settings.register('session-flow', SETTINGS_SCHEMA, { base: SETTINGS_DEFAULTS })
        const sync = () => {
          const value = scope.get()
          if (value && typeof value === 'object') Object.assign(liveSettings, SETTINGS_DEFAULTS, value)
        }
        sync()
        scope.watch(sync)
      } catch (error) {
        console.error('[dsh-session-flow] settings registration failed:', error)
      }
    })
  } catch (error) {
    console.error('[dsh-session-flow] settings service unavailable:', error)
  }
}

/**
 * 健康分类（纯函数，verify 可测）。
 * @param {{running:boolean,lastEventTime:number|null,openTool:boolean,inflight:boolean}} facts
 * @param {number} now - 调用方时间戳（client 传 Date.now()，避免 host/client 时钟偏差语义混乱）。
 * @param {number} [stallMs] - 卡死阈值（缺省 STALL_THRESHOLD_MS；设置页 stallThresholdMin 下发）。
 * @returns {{kind:'active'|'tool-wait'|'quiet'|'stalled'|'ended'|'unknown', idleMs:number|null}}
 */
export function classifyHealth(facts, now, stallMs = STALL_THRESHOLD_MS) {
  if (!facts || typeof facts !== 'object') return { kind: 'unknown', idleMs: null }
  const idleMs = typeof facts.lastEventTime === 'number' ? Math.max(0, now - facts.lastEventTime) : null
  if (facts.running !== true) return { kind: 'ended', idleMs }
  // 有流式中间态或 60s 内有事件 → 确实在跑。
  if (facts.inflight === true || (idleMs !== null && idleMs < HEALTH_ACTIVE_WINDOW_MS)) return { kind: 'active', idleMs }
  // 有未闭合工具调用 → 静默是工具在执行（长跑命令正常），不算卡死。
  if (facts.openTool === true) return { kind: 'tool-wait', idleMs }
  if (idleMs === null) return { kind: 'unknown', idleMs }
  if (idleMs >= stallMs) return { kind: 'stalled', idleMs }
  return { kind: 'quiet', idleMs }
}

/**
 * 对齐官方重命名（官方 rename 为 log-backed session/title user 事件，同一数据源）。
 * 显示优先级：档案 user 源标题（官方唯一真源）> renames.json 遗留 overlay（自然淘汰）。
 */
function effectiveUserTitle(home, entry, sessionId) {
  if (entry && entry.titleSource === 'user' && typeof entry.title === 'string' && entry.title !== '') {
    return entry.title
  }
  return userTitleOf(home, sessionId)
}

/** 汇总输出视图（去掉 counts 细节，浏览器更轻）。 */
function sessionView(summary) {
  if (!summary) return summary
  const { counts, ...rest } = summary
  return rest
}

// ── 时间线派生缓存（秒开关键，双通道）──────────────────────────────
// 1) 内存 LRU：同会话反复打开/展开秒回。
// 2) 磁盘持久化（<indexRoot>/timeline/<sessionId>.json）：web 重启或换会话后
//    免去 zstd 解码（实测解码 777ms 是主要瓶颈，磁盘命中仅 JSON.parse ~150ms）。
// 缓存条目预计算 lightTurns / toolStats / summary，get 零遍历直接拼装。
// 按 文件 mtime+size 判定失效。
const timelineCache = new Map() // file -> { mtimeMs, sizeBytes, parsed, turns, lightTurns, toolStats, summary }
const TIMELINE_CACHE_MAX = 24

function diskCacheFile(home, sessionId) {
  return join(indexRoot(home), 'timeline', String(sessionId).replace(/[^A-Za-z0-9._-]/g, '_') + '.json')
}

function memoCache(file, entry) {
  if (timelineCache.size >= TIMELINE_CACHE_MAX) timelineCache.delete(timelineCache.keys().next().value)
  timelineCache.set(file, entry)
  return entry
}

function cachedSession(home, sessionId, file, mtimeMs, sizeBytes) {
  const hit = timelineCache.get(file)
  if (hit && hit.mtimeMs === mtimeMs && hit.sizeBytes === sizeBytes) return hit
  // 磁盘缓存命中（重启/换会话后免解码）
  const cacheFile = diskCacheFile(home, sessionId)
  try {
    const disk = JSON.parse(readFileSync(cacheFile, 'utf8'))
    if (disk && disk.mtimeMs === mtimeMs && disk.sizeBytes === sizeBytes && Array.isArray(disk.turns)) {
      return memoCache(file, {
        mtimeMs, sizeBytes,
        parsed: { header: disk.header || null, title: disk.title || null, events: [] },
        turns: disk.turns,
        lightTurns: disk.lightTurns || disk.turns.map(lightTurnOf),
        toolStats: disk.toolStats || toolStatsOf(disk.turns),
        summary: disk.summary || null,
      })
    }
  } catch {}
  // 全量计算（解码 + 解析 + 派生 + 预计算摘要视图）
  const parsed = parseSession(decodeFile(file))
  const turns = deriveTimeline(parsed).turns
  const summary = summarizeParsed(parsed)
  const entry = memoCache(file, {
    mtimeMs, sizeBytes, parsed, turns, summary,
    lightTurns: turns.map(lightTurnOf),
    toolStats: toolStatsOf(turns),
  })
  // 异步写盘（不阻塞响应），随后修剪超限缓存。
  try {
    const dir = join(indexRoot(home), 'timeline')
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    writeFile(cacheFile, JSON.stringify({
      mtimeMs, sizeBytes,
      header: parsed.header, title: parsed.title, summary,
      lightTurns: entry.lightTurns, toolStats: entry.toolStats,
      turns,
    }), () => pruneTimelineCache(home))
  } catch {}
  return entry
}

/** 时间线缓存总大小上限：会话很多时防止缓存目录无限膨胀。 */
const TIMELINE_CACHE_MAX_BYTES = 512 * 1024 * 1024 // 512 MiB
/** 超过上限后修剪到的水位（保留 75%，删最旧）。 */
const TIMELINE_CACHE_TRIM_RATIO = 0.75

/** 修剪时间线缓存：总大小超限时按 mtime 从旧到新删除，直到回到水位线。 */
function pruneTimelineCache(home) {
  const td = join(indexRoot(home), 'timeline')
  let files = []
  try {
    files = readdirSync(td)
      .filter((f) => f.endsWith('.json'))
      .map((f) => {
        const p = join(td, f)
        let st
        try { st = statSync(p) } catch { return null }
        return { p, size: st.size, mtime: st.mtimeMs }
      })
      .filter(Boolean)
  } catch { return }
  const total = files.reduce((a, f) => a + f.size, 0)
  if (total <= TIMELINE_CACHE_MAX_BYTES) return
  files.sort((a, b) => a.mtime - b.mtime)
  const target = TIMELINE_CACHE_MAX_BYTES * TIMELINE_CACHE_TRIM_RATIO
  let removed = 0
  for (const f of files) {
    if (total - removed <= target) break
    try { rmSync(f.p); removed += f.size } catch {}
  }
}

/** 回合级摘要（light）：用户发言/结论预览 + 工具统计，供详情页秒开。 */
function lightTurnOf(t) {
  const toolCount = t.steps.reduce((a, s) => a + s.toolCalls.length, 0)
  const errorCount = t.steps.reduce((a, s) => a + s.toolCalls.filter((c) => c.isError).length, 0)
  const finals = t.assistantMessages.filter((a) => a.hasText)
  return {
    turn: t.turn,
    startTime: t.startTime,
    endTime: t.endTime,
    toolCount,
    errorCount,
    userMessages: t.userMessages.map((u) => ({ seq: u.seq, preview: u.preview })),
    conclusionPreview: finals.length > 0 ? finals[finals.length - 1].preview : '',
    hasThinking: t.assistantMessages.some((a) => a.hasThinking),
  }
}

/**
 * M5d：渲染会话为可读 Markdown 报告（导出/归档/分享）。
 * 为避免单文件过大（超大会话全文可达数 MB，部分编辑器/查看器打不开），
 * 拆分为多个文档：
 *   00-概览.md          —— 头部元信息 + LLM/规则摘要 + 产物清单 + 工具统计
 *   01-时间线-回合1-25.md —— 按目标体积滚动分卷的逐回合时间线
 *   02-时间线-回合26-50.md —— ...
 * 最后打包为 ZIP（deflate + CRC32，手写实现，无外部依赖）下载。
 * 时间序由 turn.items 驱动，与详情页一致。
 */

// 单卷目标体积（字节，UTF-8 文本）；超过则开新卷。
const EXPORT_CHUNK_TARGET = 700 * 1024
// 单块围栏内容上限（防单次工具输出爆卷）。
const FENCE_MAX = 4000

/** 普通文本转义（防破坏 Markdown 结构）——用于引用块内文本。
 * 含 `<`：用户消息里可能出现 `<file>`、`<details>` 等文本，不转义会被当 HTML 标签。 */
function mdEsc(s) {
  return String(s || '').replace(/([\\`*_{}[\]()#+\-.!<>|~])/g, '\\$1')
}

/**
 * 助手正文转义：正文是模型输出的 Markdown 片段，需保留 Markdown 语义
 * （粗体/列表/链接），但**禁止裸 HTML**——模型可能讨论 `<details>`、
 * `<file>` 等标签，裸 `<` 会被渲染器当 HTML 解析，吞掉/错乱文档结构
 * （如正文里的 `<details>` 会真的折叠后续内容，`</details>` 显示为孤立文本）。
 * 做法：逐行状态机——围栏代码块（```…```）与行内代码（`…`）内的 `<` 本就
 * 安全（代码区不解析 HTML），原样保留；其余普通文本转义 `<` → `&lt;`
 * （渲染为字面 `<`，不触发 HTML）。逐行处理可应对不配对的反引号
 * （模型演示 ```` 语法时不会误判、不会吞掉后续内容）。
 */
export function mdBodyEsc(text) { const lines = String(text || '').split('\n')
  const out = []
  let inFence = false
  let fenceMark = ''
  let inIndent = false // 4 空格缩进代码块（Markdown 规范同样不解析 HTML）
  for (const line of lines) {
    const fm = /^(`{3,})/.exec(line)
    if (fm) {
      const mark = fm[1]
      if (!inFence) {
        inFence = true
        fenceMark = mark
        out.push(line)
      } else if (line.trim() === fenceMark) {
        inFence = false
        out.push(line)
      } else {
        out.push(line) // 不同长度围栏：视为普通行（不配对场景）
      }
      continue
    }
    if (inFence) { out.push(line); continue }
    // 缩进代码块：连续 ≥4 空格前缀的行原样保留；空行结束。
    if (/^ {4,}/.test(line) || (inIndent && line.trim() === '')) {
      inIndent = /^ {4,}/.test(line) || line.trim() === ''
      out.push(line)
      continue
    }
    inIndent = false
    // 普通行：行内代码保护，其余 `<` 转义。
    out.push(line.replace(/`[^`\n]*`|(<)/g, (m, lt) => (lt !== undefined ? '&lt;' : m)))
  }
  return out.join('\n')
}

/** 行内代码内容：只处理反引号，不做其余转义（代码里 `\-`、`\.` 很丑且无意义）。 */
function mdCode(s) {
  return '`' + String(s || '').replace(/`/g, '\\`') + '`'
}

/** 围栏代码块：多行/结构化内容（工具参数、结果、思考）用代码块而非行内代码；
 * 内容原样保留（不转义），可选语言标注；自动加长围栏防逃逸、单块截断防爆。 */
function mdFence(text, lang) {
  let t = String(text || '').replace(/\n+$/, '').replace(/\r\n/g, '\n')
  let truncated = false
  if (t.length > FENCE_MAX) { t = t.slice(0, FENCE_MAX); truncated = true }
  let f = '```'
  while (t.includes(f)) f += '`'
  const body = t + (truncated ? '\n…（已截断，全文见会话档案）' : '')
  return f + (lang || '') + '\n' + body + '\n' + f
}

/** 时间戳格式化（YYYY-MM-DD HH:mm:ss）。 */
function mdTime(ms) {
  if (ms === null || ms === undefined) return '—'
  const d = new Date(ms)
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

/** 时长格式化（秒/分/时）。 */
function mdDur(ms) {
  if (ms === null || ms === undefined) return ''
  const s = Math.max(0, Math.floor(ms / 1000))
  if (s < 60) return `（${s}s）`
  const m = Math.floor(s / 60)
  if (m < 60) return `（${m}m ${s % 60}s）`
  return `（${Math.floor(m / 60)}h ${m % 60}m）`
}

/** 概览文档：元信息表 + 摘要 + 产物清单 + 工具统计。不含时间线。 */
function renderOverviewMd({ entry, sum, found, title, llmText, chunkCount }) {
  const out = []
  const active = typeof sum.lastEventTime === 'number' && (Date.now() - sum.lastEventTime) < 15 * 60 * 1000
  out.push(`# 会话报告${title ? '：' + mdEsc(title) : ''}`)
  out.push('')
  out.push('| 字段 | 值 |')
  out.push('| --- | --- |')
  out.push(`| 会话 ID | ${mdCode(sessionIdOf(sum))} |`)
  out.push(`| 工作区 | ${mdCode(found.workspace)} |`)
  out.push(`| 状态 | ${active ? '🟢 进行中' : '🔚 已结束'} |`)
  out.push(`| 创建 | ${mdTime(sum.createdAt)} |`)
  out.push(`| 最后活动 | ${mdTime(sum.lastEventTime)} |`)
  out.push(`| 回合 | ${sum.turns || 0} |`)
  out.push(`| 工具调用 | ${sum.toolCalls || 0}（错误 ${sum.toolErrors || 0}） |`)
  out.push(`| 消息 | 用户 ${sum.userMessages || 0} / 助手 ${sum.assistantMessages || 0} |`)
  if (sum.delegationDepth > 0) out.push(`| 子代理深度 | ${sum.delegationDepth} |`)
  if (sum.lastError) out.push(`| 最后错误 | 回合事件 seq ${sum.lastError.seq} @ ${mdTime(sum.lastError.time)} |`)
  out.push('')

  out.push('## 摘要')
  out.push('')
  if (llmText) {
    out.push('### LLM 摘要')
    out.push('')
    // 摘要也是模型输出：转义裸 < 防 HTML 标签污染（同助手正文策略）。
    out.push(mdBodyEsc(llmText.trim()))
    out.push('')
  }
  const taskTurns = entry.lightTurns.filter((lt) => lt.userMessages && lt.userMessages.length > 0)
  const firstTask = (() => {
    for (const lt of taskTurns) {
      if (lt.userMessages && lt.userMessages.length > 0) return String(lt.userMessages[0].preview).slice(0, 300)
    }
    return ''
  })()
  const lastConclusion = (() => {
    for (let i = entry.lightTurns.length - 1; i >= 0; i--) {
      if (entry.lightTurns[i].conclusionPreview) return String(entry.lightTurns[i].conclusionPreview).slice(0, 500)
    }
    return ''
  })()
  const topTools = entry.toolStats.slice(0, 8).map((t) => `${t.name}(${t.count})`).join('、')
  out.push('### 规则摘要')
  out.push('')
  if (taskTurns.length > 0) out.push(`- 任务数：${taskTurns.length}`)
  if (firstTask) out.push(`- 首个任务：${mdEsc(firstTask)}`)
  if (lastConclusion) out.push(`- 最近结论${active ? '（可能仅为当前进展）' : ''}：${mdEsc(lastConclusion)}`)
  if (topTools) out.push(`- 主要工具：${mdEsc(topTools)}`)
  out.push('')

  // 工具调用统计（全部，非 Top8）。
  if (entry.toolStats.length > 0) {
    out.push('## 工具统计')
    out.push('')
    out.push('| 工具 | 调用 | 错误 |')
    out.push('| --- | --- | --- |')
    for (const t of entry.toolStats) {
      out.push(`| ${mdCode(t.name)} | ${t.count} | ${t.errors > 0 ? t.errors : '—'} |`)
    }
    out.push('')
  }

  const EXPORT_PATH_RE = /^[A-Za-z]:[\\/]|^[\\/]|^\.{1,2}[\\/]|^~[\\/]/
  const artifactList = (sum.artifactPaths || []).filter((p) =>
    looksLikePath(p) && !p.includes('|') && (EXPORT_PATH_RE.test(p) || /^[\w.-]+(\.[A-Za-z0-9]{1,6})$/.test(p)))
  if (artifactList.length > 0) {
    out.push('## 产物清单')
    out.push('')
    for (const p of artifactList) out.push(`- ${mdCode(p)}`)
    out.push('')
  }

  // 分卷指引。
  out.push('## 文档结构')
  out.push('')
  out.push(`本报告由 ${chunkCount + 1} 个文件组成：\`00-概览.md\`（本文件）+ ${chunkCount} 个时间线分卷（按体积自动拆分，避免单文件过大）。`)
  out.push('')
  return out.join('\n')
}

/** 单回合时间线渲染（供分卷）。返回该回合的 Markdown 文本。 */
function renderTurnMd(t, fmt, fmtDur, toolIdxRef) {
  const out = []
  out.push(`### 回合 ${t.turn}${t.startTime ? ' · ' + fmt(t.startTime) : ''}${t.endTime ? ' → ' + fmt(t.endTime) + fmtDur(t.endTime - t.startTime) : ''}`)
  out.push('')
  for (const it of t.items || []) {
    if (it.kind === 'user') {
      out.push('> 💬 **用户**')
      out.push('>')
      for (const line of String(it.text || '').split('\n')) out.push('> ' + mdEsc(line))
      out.push('')
    } else if (it.kind === 'inject') {
      out.push(`> 📥 **注入**${it.sourceKind ? '（' + mdEsc(it.sourceKind) + '）' : ''}`)
      out.push('>')
      for (const line of String(it.text || '').split('\n')) out.push('> ' + mdEsc(line))
      out.push('')
    } else if (it.kind === 'assistant') {
      if (it.text) {
        out.push('🤖 **助手**')
        out.push('')
        // 助手正文保留 Markdown 语义（粗体/列表/链接），但转义裸 `<`
        // 防 HTML 标签污染（模型可能在正文里讨论 `<details>` 等标签）。
        out.push(mdBodyEsc(it.text.trim()))
        out.push('')
      }
      if (it.thinking) {
        out.push('<details>')
        out.push('<summary>🧠 思考过程</summary>')
        out.push('')
        out.push(mdFence(it.thinking, ''))
        out.push('')
        out.push('</details>')
        out.push('')
      }
    } else if (it.kind === 'tool') {
      toolIdxRef.n++
      const c = it.call || {}
      const dur = c.durationMs !== null && c.durationMs !== undefined ? `（${(c.durationMs / 1000).toFixed(1)}s）` : ''
      const errMark = c.isError ? ' ⚠️ **错误**' : ''
      out.push(`${toolIdxRef.n}. 🛠️ ${mdCode(c.name)}${dur}${errMark}`)
      if (c.argumentsText || c.argumentsPreview) {
        out.push('')
        out.push('   **参数：**')
        out.push('')
        out.push(mdFence(c.argumentsText || c.argumentsPreview, 'json'))
        out.push('')
      }
      if (c.resultText) {
        out.push('   **结果：**')
        out.push('')
        out.push(mdFence(c.resultText, c.isError ? '' : 'text'))
        out.push('')
      } else if (c.resultTime !== null && c.resultTime !== undefined) {
        out.push('')
        out.push('   **结果：**（空）')
        out.push('')
      }
      if (c.childSessionId) out.push(`   - 子代理：${mdCode(c.childSessionId)}`)
    }
  }
  out.push('---')
  out.push('')
  return out.join('\n')
}

/** 按目标体积滚动分卷：返回 [{ title, body }]，每卷 body ≤ 目标（单回合超限时单独成卷）。 */
function chunkTurns(turns, targetBytes) {
  const chunks = []
  let cur = []
  let curBytes = 0
  const fmt = mdTime
  for (const t of turns) {
    const toolIdxRef = { n: 0 }
    const text = renderTurnMd(t, fmt, mdDur, toolIdxRef)
    const bytes = Buffer.byteLength(text, 'utf8')
    // 单回合超过整卷目标：单独成卷（不能再拆，回合是原子单元）。
    if (bytes >= targetBytes) {
      if (cur.length > 0) { chunks.push(cur); cur = []; curBytes = 0 }
      chunks.push([{ turn: t.turn, text }])
      continue
    }
    if (cur.length > 0 && curBytes + bytes > targetBytes) {
      chunks.push(cur)
      cur = []
      curBytes = 0
    }
    cur.push({ turn: t.turn, text })
    curBytes += bytes
  }
  if (cur.length > 0) chunks.push(cur)
  return chunks.map((items, i) => {
    const first = items[0].turn
    const last = items[items.length - 1].turn
    const title = first === last ? `回合${first}` : `回合${first}-${last}`
    const body = items.map((x) => x.text).join('\n')
    return { title, body }
  })
}

/**
 * 手写 ZIP（deflate + CRC32，无外部依赖）。
 * @param {Array<{name: string, data: Buffer}>} files
 * @returns {Buffer} ZIP 文件（含 UTF-8 文件名标志）。
 */
export function buildZip(files) {
  const localParts = []
  const centralParts = []
  let offset = 0
  const crcTable = (() => {
    const table = new Int32Array(256)
    for (let n = 0; n < 256; n++) {
      let c = n
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
      table[n] = c
    }
    return table
  })()
  const crc32 = (buf) => {
    let c = 0xffffffff
    for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
    return (c ^ 0xffffffff) >>> 0
  }
  const dosTime = (d) => ((d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1)) & 0xffff
  const dosDate = (d) => (((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()) & 0xffff
  const now = new Date()

  for (const file of files) {
    const nameBuf = Buffer.from(file.name, 'utf8')
    const data = file.data
    const crc = crc32(data)
    const compressed = deflateRawSync(data, { level: 6 })
    const csize = compressed.length
    const usize = data.length
    const time = dosTime(now)
    const date = dosDate(now)
    // Local file header
    const lh = Buffer.alloc(30)
    lh.writeUInt32LE(0x04034b50, 0) // signature
    lh.writeUInt16LE(20, 4) // version needed
    lh.writeUInt16LE(0x0800, 6) // flags: UTF-8 names
    lh.writeUInt16LE(8, 8) // method: deflate
    lh.writeUInt16LE(time, 10)
    lh.writeUInt16LE(date, 12)
    lh.writeUInt32LE(crc, 14)
    lh.writeUInt32LE(csize, 18)
    lh.writeUInt32LE(usize, 22)
    lh.writeUInt16LE(nameBuf.length, 26)
    lh.writeUInt16LE(0, 28) // extra len
    localParts.push(lh, nameBuf, compressed)
    // Central directory entry
    const ch = Buffer.alloc(46)
    ch.writeUInt32LE(0x02014b50, 0) // signature
    ch.writeUInt16LE(0x031e, 4) // version made by (3=unix, 0x1e=30)
    ch.writeUInt16LE(20, 6) // version needed
    ch.writeUInt16LE(0x0800, 8)
    ch.writeUInt16LE(8, 10)
    ch.writeUInt16LE(time, 12)
    ch.writeUInt16LE(date, 14)
    ch.writeUInt32LE(crc, 16)
    ch.writeUInt32LE(csize, 20)
    ch.writeUInt32LE(usize, 24)
    ch.writeUInt16LE(nameBuf.length, 28)
    ch.writeUInt16LE(0, 30) // extra
    ch.writeUInt16LE(0, 32) // comment
    ch.writeUInt16LE(0, 34) // disk
    ch.writeUInt16LE(0, 36) // internal attrs
    ch.writeUInt32LE(0, 38) // external attrs
    ch.writeUInt32LE(offset, 42) // local header offset
    centralParts.push(ch, nameBuf)
    offset += lh.length + nameBuf.length + csize
  }
  const central = Buffer.concat(centralParts)
  const eocd = Buffer.alloc(22)
  eocd.writeUInt32LE(0x06054b50, 0) // signature
  eocd.writeUInt16LE(0, 4) // disk
  eocd.writeUInt16LE(0, 6) // cd start disk
  eocd.writeUInt16LE(files.length, 8)
  eocd.writeUInt16LE(files.length, 10)
  eocd.writeUInt32LE(central.length, 12)
  eocd.writeUInt32LE(offset, 16)
  eocd.writeUInt16LE(0, 20) // comment len
  return Buffer.concat([...localParts, central, eocd])
}

/** 会话 ID（summarizeParsed 结果里的 id 字段）。 */
function sessionIdOf(sum) {
  return sum && sum.id ? sum.id : 'unknown'
}

/** 会话内工具统计聚合（右侧导航数据源，服务端聚合避免前端全量扫描）。 */
function toolStatsOf(turns) {  const agg = new Map()
  for (const t of turns) {
    for (const step of t.steps) {
      for (const c of step.toolCalls) {
        let e = agg.get(c.name)
        if (!e) { e = { name: c.name, count: 0, errors: 0, calls: [], errorCalls: [] }; agg.set(c.name, e) }
        e.count++
        const pos = { callId: c.callId, turn: t.turn, preview: c.argumentsPreview || '' }
        if (c.isError === true) { e.errors++; e.errorCalls.push(pos) }
        e.calls.push(pos)
      }
    }
  }
  return [...agg.values()].sort((a, b) => b.count - a.count)
}

/**
 * 工作区显示名与完整路径（与左侧栏一致：只显示最后一级目录，悬浮显示全路径）。
 * 优先从会话的 cwd 派生（真实路径，可靠）；cwd 缺失时回退解析编码目录名
 * （如 "--C-path-proj--" → 去首尾 "--" → "C-path-proj" → 取末段 "proj"）。
 */
function workspaceLabelOf(wsName, sessions) {
  const withCwd = sessions.find((s) => typeof s.cwd === 'string' && s.cwd.length > 0)
  if (withCwd && withCwd.cwd) {
    const base = String(withCwd.cwd).replace(/[\\/]+$/, '').split(/[\\/]/).pop()
    if (base && base.length > 0) return { label: base, cwd: withCwd.cwd }
  }
  const decoded = String(wsName).replace(/^--|--$/g, '')
  const last = decoded.split('-').filter(Boolean).pop()
  return { label: last || wsName, cwd: null }
}

export function apply(ctx) {
  const webServer = ctx.get('webServer')
  if (webServer === undefined) {
    console.error('[dsh-session-flow] webServer service unavailable at apply; route not registered')
    return
  }

  // 插件设置命名空间（软依赖；卡死阈值等 host 侧参数经 liveSettings 下发）。
  installSettings(ctx)

  webServer.register({
    kind: 'exact',
    path: '/api/session-flow',
    handler: async (req, res) => {
      try {
        const body = await readBody(req)
        const method = String(body.method || '')
        const home = dshHome()

        if (method === 'workspaces') {
          const workspaces = listWorkspaces(home).map((ws) => {
            const index = readIndex(home, ws.name)
            const sessions = Object.values(index.sessions)
            const meta = workspaceLabelOf(ws.name, sessions)
            return {
              name: ws.name,
              label: meta.label,
              cwd: meta.cwd,
              sessionCount: ws.sessionCount,
              indexFile: workspaceIndexFile(home, ws.name),
            }
          })
          return sendJson(res, 200, { ok: true, home, workspaces })
        }

        if (method === 'list' || method === 'rescan') {
          const requested = typeof body.workspace === 'string' && body.workspace ? body.workspace : null
          const force = method === 'rescan' && body.force === true
          const workspaces = []
          let scanned = 0
          let skipped = 0
          const removed = []
          for (const ws of listWorkspaces(home)) {
            if (requested !== null && ws.name !== requested) continue
            const result = scanWorkspaceIndex(home, ws.name, { force })
            const sessions = Object.values(result.index.sessions)
              .map((s) => ({ ...sessionView(s), userTitle: effectiveUserTitle(home, s, s.id) }))
              .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
            const meta = workspaceLabelOf(ws.name, sessions)
            workspaces.push({
              name: ws.name,
              label: meta.label,
              cwd: meta.cwd,
              sessionCount: sessions.length,
              scannedAt: result.index.scannedAt,
              sessions,
            })
            scanned += result.scanned
            skipped += result.skipped
            removed.push(...result.removed)
          }
          return sendJson(res, 200, {
            ok: true,
            method,
            scanned,
            skipped,
            removed,
            scannedAt: Date.now(),
            workspaces,
          })
        }

        if (method === 'rename') {
          // M8a 会话重命名：私有 userTitle 显示层覆盖（不动原始存档）。
          // 空标题 = 清除恢复原名；超长 400；会话不存在 404；落盘失败回滚 + 500。
          const sessionId = String(body.sessionId || '')
          if (!sessionId) return sendJson(res, 400, { ok: false, error: 'sessionId required' })
          const found = findWorkspaceOfSession(home, sessionId)
          if (found === null) return sendJson(res, 404, { ok: false, error: `session ${sessionId} not found in archives` })
          const raw = typeof body.title === 'string' ? body.title : ''
          const trimmed = raw.trim()
          if (trimmed.length > MAX_RENAME_LENGTH) {
            return sendJson(res, 400, { ok: false, error: `title too long (max ${MAX_RENAME_LENGTH} chars)` })
          }
          const previous = userTitleOf(home, sessionId)
          const userTitle = applyRename(home, sessionId, trimmed)
          if (!saveRenames(home)) {
            applyRename(home, sessionId, previous || '')
            return sendJson(res, 500, { ok: false, error: 'failed to persist renames.json' })
          }
          return sendJson(res, 200, { ok: true, userTitle })
        }

        if (method === 'get') {
          // 轻量详情（秒开）：只返回回合摘要 + 工具统计；完整时间线由 getTurn 按需取。
          const sessionId = String(body.sessionId || '')
          if (!sessionId) return sendJson(res, 400, { ok: false, error: 'sessionId required' })
          const found = findWorkspaceOfSession(home, sessionId)
          if (found === null) return sendJson(res, 404, { ok: false, error: `session ${sessionId} not found in archives` })
          let st
          try { st = statSync(found.file) } catch { st = null }
          const entry = cachedSession(home, sessionId, found.file, st ? st.mtimeMs : 0, st ? st.size : 0)
          // 预计算摘要（内存/磁盘缓存都有），get 零遍历。
          const sum = entry.summary || summarizeParsed(entry.parsed)
          if (st) {
            sum.fileMtimeMs = st.mtimeMs
            sum.sizeBytes = st.size
          }
          const counts = Object.fromEntries(
            Object.entries(sum.counts || {}).filter(([k]) =>
              ['tool/call', 'tool/result', 'user/message', 'assistant/message', 'turn/start', 'step/start', 'step/end'].includes(k)),
          )
          const wsMeta = workspaceLabelOf(found.workspace, [sum])
          // 索引中已缓存的 LLM 摘要（若生成过）+ 过期判定：
          // 生成基线（生成摘要时的最后事件时间）若早于当前最后事件时间，
          // 说明生成后又有新对话，摘要可能不准，前端据此提示可重新生成。
          let storedSummary = null
          let summaryStale = false
          try {
            const index = readIndex(home, found.workspace)
            const s = index.sessions[sessionId]
            if (s && s.summary) {
              storedSummary = s.summary
              const base = s.summaryLastEventTime
              const cur = entry.summary ? entry.summary.lastEventTime : null
              summaryStale = typeof base === 'number' && typeof cur === 'number' && cur > base
            }
          } catch {}
          return sendJson(res, 200, {
            ok: true,
            workspace: found.workspace,
            workspaceLabel: wsMeta.label,
            workspaceCwd: wsMeta.cwd,
            session: sessionView(sum),
            userTitle: effectiveUserTitle(home, sum, sessionId),
            counts,
            lightTurns: entry.lightTurns,
            toolStats: entry.toolStats,
            title: entry.parsed.title,
            header: entry.parsed.header,
            summary: storedSummary,
            summaryStale,
          })
        }

        if (method === 'summarize') {
          // M5 摘要引擎（LLM 模式）：走 DSH 自身模型通道（ctx.llm）。
          // 规则摘要由前端从 get 响应的 lightTurns/toolStats 实时组装（零请求）。
          const sessionId = String(body.sessionId || '')
          if (!sessionId) return sendJson(res, 400, { ok: false, error: 'sessionId required' })
          const found = findWorkspaceOfSession(home, sessionId)
          if (found === null) return sendJson(res, 404, { ok: false, error: `session ${sessionId} not found in archives` })
          const llm = ctx.get('llm')
          if (llm === undefined) return sendJson(res, 501, { ok: false, error: 'llm service unavailable (LLM 摘要不可用，规则摘要仍可用)' })
          let st
          try { st = statSync(found.file) } catch { st = null }
          const entry = cachedSession(home, sessionId, found.file, st ? st.mtimeMs : 0, st ? st.size : 0)

          // 解析 provider/model：调用方传入优先，否则从已注册提供商兜底取第一个可用模型。
          let provider = String(body.provider || '')
          let model = String(body.model || '')
          if (!provider || !model) {
            const providers = llm.listProviders()
            for (const p of providers) {
              try {
                const models = await llm.listModels(p.id)
                if (models.length > 0) { provider = p.id; model = models[0].id; break }
              } catch {}
            }
          }
          if (!provider || !model) return sendJson(res, 502, { ok: false, error: 'no usable model' })

          // 组装摘要输入（多任务会话信息源）：一次会话可能包含多个相互独立的
          // 任务，最后一条回复可能只是当前进展而非最终结论。因此以「回合」为
          // 任务单元，逐回合枚举「任务（该回合最后一条用户消息）→ 结果（该
          // 回合最后结论）」，并携带会话状态（进行中/已结束）让模型按实际情况
          // 概括，而不是只取首条目标 + 末条结论。
          const ACTIVE_WINDOW_MS = 15 * 60 * 1000 // 与 client 端一致：15 分钟内活跃视为进行中
          const SUMMARY_MAX_TURNS = 8 // 最多枚举回合数（控制 token 预算）
          const lastEventTime = entry.summary ? entry.summary.lastEventTime : null
          const isRunning = typeof lastEventTime === 'number' && (Date.now() - lastEventTime) < ACTIVE_WINDOW_MS
          const totalToolCalls = entry.toolStats.reduce((a, t) => a + t.count, 0)
          const totalErrors = entry.summary ? entry.summary.toolErrors || 0 : 0
          // 全程均匀采样：若只取「最近 N 个回合」，长会话的早期任务会全部丢失，
          // 摘要会变成「最近几轮」的总结（用户反馈确认）。改为按首/中/尾均匀
          // 抽取，覆盖整个会话，并保证最后一个回合在内（其结论代表当前进展，
          // 由「会话状态」标注兜底）。
          // 先取「有用户消息的任务回合」再均匀采样：注入/续写回合不代表独立任务，
          // 直接采样会浪费名额；同时保证最后一个任务回合在内。
          const taskTurns = entry.lightTurns.filter((lt) => lt.userMessages && lt.userMessages.length > 0)
          const sampled = sampleTurns(taskTurns, SUMMARY_MAX_TURNS)
          const sampledLabels = sampled.map((lt) => `回合 ${lt.turn}`).join('、')
          const turnLines = sampled.map((lt) => {
            const task = String(lt.userMessages[lt.userMessages.length - 1].preview).slice(0, 200)
            const result = lt.conclusionPreview ? String(lt.conclusionPreview).slice(0, 300) : '（无明确结果）'
            const stats = '工具 ' + (lt.toolCount || 0) + ' 次' + ((lt.errorCount || 0) > 0 ? '，错误 ' + lt.errorCount + ' 处' : '')
            return `回合 ${lt.turn}：任务「${task}」→ 结果「${result}」（${stats}）`
          }).join('\n')
          const topTools = entry.toolStats.slice(0, 8).map((t) => `${t.name}(${t.count})`).join('、')
          const prompt =
            '请为以下 DSH 智能体会话生成一段简洁中文摘要（250 字以内）。注意：一次会话可能包含多个相互独立的任务，最后一条回复可能只是当前进展而非最终结论，请按实际情况逐任务概括。\n\n' +
            '会话概况：\n' +
            '回合数：' + entry.lightTurns.length + '（任务回合 ' + taskTurns.length + ' 个' + (sampled.length < taskTurns.length ? `，以下均匀采样 ${sampled.length} 个：${sampledLabels}，覆盖首/中/尾` : '，以下全部列出') + '）\n' +
            '工具调用：' + totalToolCalls + ' 次，错误：' + totalErrors + ' 处\n' +
            '主要工具：' + (topTools || '（无）') + '\n' +
            '会话状态：' + (isRunning ? '进行中（最后一条回复可能只是当前进展）' : '已结束') + '\n\n' +
            '各回合任务与结果：\n' + (turnLines || '（无回合数据）') + '\n\n' +
            '请输出：1) 本次会话包含哪些任务及各自目标；2) 各任务的结果与状态（完成/进行中/失败）；3) 遗留问题或未完成事项。\n摘要：'

          let text = ''
          let reasoning = ''
          try {
            const chunks = llm.stream({
              provider,
              model,
              system: '你是会话档案员，擅长把一次智能体工作会话总结成简明摘要。会话可能包含多个独立任务，请逐任务概括，不要臆造单一目标。',
              messages: [{ role: 'user', content: [{ type: 'text', text: prompt }] }],
              maxTokens: 2000,
              temperature: 0.3,
            })
            for await (const chunk of chunks) {
              if (chunk.type === 'text-delta') text += chunk.text
              if (chunk.type === 'reasoning-delta') reasoning += chunk.text
              if (chunk.type === 'finish') {
                // DSH 协议：finish.reason 是对象 { kind: 'stop'|'max-tokens'|'error'|'aborted', failure? }。
                // 兼容字符串形式（'stop'/'error'）与对象形式，失败时透传 failure 详情。
                const reason = chunk.reason
                const kind = typeof reason === 'string' ? reason : reason && reason.kind
                if (kind === 'error' || kind === 'aborted') {
                  const failure = (reason && reason.failure) || {}
                  const detail = String(failure.message || '')
                  const code = String(failure.code || '')
                  throw new Error(`llm stream finished with ${kind}` + (detail || code ? ': ' + detail + (code && !detail.includes(code) ? ' (' + code + ')' : '') : ''))
                }
              }
            }
          } catch (e) {
            return sendJson(res, 500, { ok: false, error: 'LLM 摘要生成失败: ' + String(e && e.message || e) })
          }
          text = text.trim()
          if (!text) {
            // reasoner 类模型可能只输出思考过程（无正文结论）：以思考收尾句兜底，
            // 并明确标注来源，避免「摘要为空」误报。
            reasoning = reasoning.trim()
            if (reasoning) {
              const lines = reasoning.split(/\n+/).map((s) => s.trim()).filter(Boolean)
              text = lines.slice(-3).join(' ') // 思考的最后几句通常包含结论
              text = text.slice(0, 600)
            }
          }
          if (!text) return sendJson(res, 500, { ok: false, error: 'LLM 摘要生成为空（模型未输出任何内容）' })

          // 摘要写回索引缓存（下次 get 直接带出；无新对话时可直接复用）。
          // 同时记录生成基线 = 生成摘要时会话的最后事件时间，供 get 对比
          // 判定「此后是否有新对话」（有则摘要可能过时，前端提示重新生成）。
          try {
            const index = readIndex(home, found.workspace)
            if (index.sessions[sessionId]) {
              index.sessions[sessionId].summary = text
              index.sessions[sessionId].summaryLastEventTime = entry.summary ? entry.summary.lastEventTime : null
              writeIndex(home, found.workspace, index)
            }
          } catch (e) {
            console.error('[dsh-session-flow] summary writeback failed:', e)
          }
          return sendJson(res, 200, { ok: true, mode: 'llm', provider, model, summary: text })
        }

        if (method === 'exportMd') {
          // M5d 导出可读 Markdown 报告（ZIP 分卷）：超大会话单文件可达数 MB，
          // 部分查看器打不开——拆为「概览 + 时间线分卷」并打包 ZIP 下载。
          // 概览：元信息 + 摘要 + 工具统计 + 产物清单；时间线按目标体积滚动分卷。
          const sessionId = String(body.sessionId || '')
          if (!sessionId) return sendJson(res, 400, { ok: false, error: 'sessionId required' })
          const found = findWorkspaceOfSession(home, sessionId)
          if (found === null) return sendJson(res, 404, { ok: false, error: `session ${sessionId} not found in archives` })
          let st
          try { st = statSync(found.file) } catch { st = null }
          const entry = cachedSession(home, sessionId, found.file, st ? st.mtimeMs : 0, st ? st.size : 0)
          const sum = entry.summary || summarizeParsed(entry.parsed)
          // 索引中的 LLM 摘要（若有）。
          let llmText = null
          try {
            const index = readIndex(home, found.workspace)
            llmText = (index.sessions[sessionId] && index.sessions[sessionId].summary) || null
          } catch {}
          const title = entry.parsed.title && entry.parsed.title.title !== undefined ? entry.parsed.title.title : null
          // 分卷时间线。
          const chunks = chunkTurns(entry.turns, EXPORT_CHUNK_TARGET)
          // 概览（含分卷指引）。
          const overview = renderOverviewMd({ entry, sum, found, title, llmText, chunkCount: chunks.length })
          // 文件名用自定义标题优先（档案 user 源标题 = 官方真源优先；renames.json 遗留回退）。
          const parsedTitle = entry.parsed.title
          const archiveUserTitle = parsedTitle && parsedTitle.source && parsedTitle.source.kind === 'user'
            ? parsedTitle.title : null
          const rawTitle = archiveUserTitle || userTitleOf(home, sessionId) || title || sessionId
          const safeTitle = String(rawTitle).replace(/[\\/:*?"<>|\r\n]/g, '_').slice(0, 60)
          // 组装 ZIP 文件清单：概览 + 时间线分卷（00-概览.md / 01-时间线-回合X-Y.md …）。
          const zipFiles = [{ name: '00-概览.md', data: Buffer.from(overview, 'utf8') }]
          chunks.forEach((c, i) => {
            const n = String(i + 1).padStart(2, '0')
            const body = `# 会话报告${title ? '：' + mdEsc(title) : ''} · 时间线 ${c.title}\n\n> 本文件为分卷 ${i + 1}/${chunks.length}（按体积自动拆分，避免单文件过大）。概览与其余分卷见同目录。\n\n` + c.body
            zipFiles.push({ name: `${n}-时间线-${c.title}.md`, data: Buffer.from(body, 'utf8') })
          })
          const zip = buildZip(zipFiles)
          const base64 = zip.toString('base64')
          return sendJson(res, 200, {
            ok: true,
            filename: `会话报告-${safeTitle}.zip`,
            sizeBytes: zip.length,
            uncompressedBytes: zipFiles.reduce((a, f) => a + f.data.length, 0),
            fileCount: zipFiles.length,
            files: zipFiles.map((f) => ({ name: f.name, bytes: f.data.length })),
            base64,
          })
        }

        if (method === 'getTurn') {
          // 展开回合时按需取完整时间线（复用派生缓存，秒开后的展开也是快的）。
          const sessionId = String(body.sessionId || '')
          const turnNo = Number(body.turn)
          if (!sessionId || !Number.isInteger(turnNo)) return sendJson(res, 400, { ok: false, error: 'sessionId and turn required' })
          const found = findWorkspaceOfSession(home, sessionId)
          if (found === null) return sendJson(res, 404, { ok: false, error: `session ${sessionId} not found in archives` })
          let st
          try { st = statSync(found.file) } catch { st = null }
          const entry = cachedSession(home, sessionId, found.file, st ? st.mtimeMs : 0, st ? st.size : 0)
          const turn = entry.turns.find((t) => t.turn === turnNo)
          if (turn === undefined) return sendJson(res, 404, { ok: false, error: `turn ${turnNo} not found` })
          return sendJson(res, 200, { ok: true, turn })
        }

        if (method === 'lineage') {
          // M4 血缘树（离线通道）：基于会话头的 parentSession 链接构建「以目标会话为根的后代树」。
          // 子代理存档可能不在磁盘（实时通道在 client 端用 subagents API），这里返回离线可见的部分。
          const sessionId = String(body.sessionId || '')
          if (!sessionId) return sendJson(res, 400, { ok: false, error: 'sessionId required' })
          const all = {}
          for (const ws of listWorkspaces(home)) {
            const index = readIndex(home, ws.name)
            for (const [id, s] of Object.entries(index.sessions)) all[id] = s
          }
          const focus = all[sessionId]
          if (focus === undefined) return sendJson(res, 404, { ok: false, error: `session ${sessionId} not indexed` })
          const childrenOf = new Map()
          for (const s of Object.values(all)) {
            if (s.parentSession && all[s.parentSession]) {
              if (!childrenOf.has(s.parentSession)) childrenOf.set(s.parentSession, [])
              childrenOf.get(s.parentSession).push(s)
            }
          }
          const buildNode = (s) => ({
            id: s.id,
            title: s.title || null,
            userTitle: effectiveUserTitle(home, s, s.id),
            delegationDepth: s.delegationDepth || 0,
            createdAt: s.createdAt || null,
            lastEventTime: s.lastEventTime || null,
            toolCalls: s.toolCalls || 0,
            toolErrors: s.toolErrors || 0,
            turns: s.turns || 0,
            empty: s.empty === true,
            children: (childrenOf.get(s.id) || []).map(buildNode),
          })
          return sendJson(res, 200, {
            ok: true,
            focus: buildNode(focus),
          })
        }

        if (method === 'derive') {
          // M4 桥接：运行时子代理会话的事件（来自 subagents.history，不在磁盘存档）
          // 由 host 端用同一套 timeline 管线派生，前端直接渲染折叠视图。
          const events = Array.isArray(body.events) ? body.events : null
          if (events === null || events.length === 0) return sendJson(res, 400, { ok: false, error: 'events required' })
          const parsed = { header: null, title: null, events }
          const summary = summarizeParsed(parsed)
          const timeline = deriveTimeline(parsed)
          const counts = Object.fromEntries(
            Object.entries(summary.counts || {}).filter(([k]) =>
              ['tool/call', 'tool/result', 'user/message', 'assistant/message', 'turn/start', 'step/start', 'step/end'].includes(k)),
          )
          // M6 运行中判定（结构信号，不依赖时间戳）：事件流里存在未闭合的回合/步骤/
          // 工具调用（start 未配 end），或最后事件是流式中间态（assistant/chunk 等），
          // 说明会话仍在运行——即使输出间隔长（模型思考/工具执行中）也不会误判停止。
          let openTurns = 0
          let openSteps = 0
          let openTools = 0
          let lastType = null
          for (const ev of events) {
            lastType = ev && ev.type
            switch (lastType) {
              case 'turn/start': openTurns++; break
              case 'turn/end': openTurns = Math.max(0, openTurns - 1); break
              case 'step/start': openSteps++; break
              case 'step/end': openSteps = Math.max(0, openSteps - 1); break
              case 'tool/call': openTools++; break
              case 'tool/result': openTools = Math.max(0, openTools - 1); break
            }
          }
          const STREAM_MID_TYPES = new Set(['assistant/chunk', 'assistant/message', 'tool/call', 'step/start', 'turn/start', 'user/message', 'request/header'])
          const running = openTurns > 0 || openSteps > 0 || openTools > 0 || STREAM_MID_TYPES.has(lastType)
          // 卡死监控：健康事实 + 分类。assumeRunning：总览探测以官方 sessions.list 的
          // running 为准（tail 窗口可能不含 turn/start，结构信号会漏判），此时结构信号只供
          // openTool/inflight 事实；now 由 client 传入（缺省 host 本地时间）。
          const now = typeof body.now === 'number' ? body.now : Date.now()
          const effectiveRunning = running || body.assumeRunning === true
          const healthFacts = {
            running: effectiveRunning,
            lastEventTime: summary.lastEventTime !== undefined ? summary.lastEventTime : null,
            lastEventType: lastType,
            openTool: openTools > 0,
            inflight: lastType === 'assistant/chunk',
          }
          return sendJson(res, 200, {
            ok: true,
            session: sessionView(summary),
            counts,
            timeline,
            running,
            health: { ...healthFacts, ...classifyHealth(healthFacts, now, liveSettings.stallThresholdMin * 60000) },
          })
        }

        if (method === 'searchIn') {
          // M5c 方案C：会话内全文检索 → 返回所有匹配位置（turn + callId/seq + 命中片段）。
          // 匹配域：工具名/参数、工具结果文本、用户发言、助手思考与正文；支持结构化前缀。
          const sessionId = String(body.sessionId || '')
          const query = String(body.query || '')
          if (!sessionId || !query.trim()) return sendJson(res, 400, { ok: false, error: 'sessionId and query required' })
          const found = findWorkspaceOfSession(home, sessionId)
          if (found === null) return sendJson(res, 404, { ok: false, error: `session ${sessionId} not found in archives` })
          let st
          try { st = statSync(found.file) } catch { st = null }
          const { turns } = cachedSession(home, sessionId, found.file, st ? st.mtimeMs : 0, st ? st.size : 0)

          const q = query.trim().toLowerCase()
          const stMatch = /^(tool|file|path|err|error):(.*)$/.exec(q)
          const stKind = stMatch ? stMatch[1].toLowerCase() : null
          const stVal = stMatch ? stMatch[2].trim().toLowerCase() : ''

          const matches = []
          const hit = (m) => { if (matches.length < 200) matches.push(m) }
          const snippet = (text, needle) => {
            const t = String(text || '')
            const i = t.toLowerCase().indexOf(needle)
            if (i < 0) return t.slice(0, 100)
            const start = Math.max(0, i - 30)
            return (start > 0 ? '…' : '') + t.slice(start, i + needle.length + 60) + (i + needle.length + 60 < t.length ? '…' : '')
          }

          for (const t of turns) {
            // 用户发言 / 助手思考与正文：仅自由文本检索时参与（结构化前缀只针对工具域）。
            if (!stMatch) {
              for (const u of t.userMessages) {
                if (u.text.toLowerCase().includes(q)) {
                  hit({ kind: 'user', turn: t.turn, seq: u.seq, preview: snippet(u.text, q) })
                }
              }
              for (const a of t.assistantMessages) {
                if (a.hasThinking && a.thinking.toLowerCase().includes(q)) {
                  hit({ kind: 'thinking', turn: t.turn, seq: a.seq, preview: snippet(a.thinking, q) })
                }
                if (a.hasText && a.text.toLowerCase().includes(q)) {
                  hit({ kind: 'assistant', turn: t.turn, seq: a.seq, preview: snippet(a.text, q) })
                }
              }
            }
            // 工具调用：结构化（tool/file/err）+ 自由文本（名称/参数/结果）。
            for (const s of t.steps) {
              for (const c of s.toolCalls) {
                const argsLower = c.argumentsText.toLowerCase()
                const resLower = c.resultText.toLowerCase()
                let matched = false
                if (stKind === 'tool') matched = c.name.toLowerCase().includes(stVal) || argsLower.includes(stVal)
                else if (stKind === 'file' || stKind === 'path') matched = argsLower.includes(stVal) || resLower.includes(stVal)
                else if (stKind === 'err' || stKind === 'error') matched = c.isError === true
                else matched = c.name.toLowerCase().includes(q) || argsLower.includes(q) || resLower.includes(q)
                if (matched) {
                  const inArgs = stKind === 'tool' ? (c.name.toLowerCase().includes(stVal) || argsLower.includes(stVal))
                    : stKind === 'file' || stKind === 'path' ? argsLower.includes(stVal)
                      : argsLower.includes(q)
                  hit({
                    kind: c.isError === true ? 'error' : 'tool',
                    turn: t.turn, callId: c.callId,
                    name: c.name,
                    preview: snippet(inArgs ? c.argumentsText : c.resultText, stVal || q) || c.resultPreview,
                  })
                }
              }
            }
          }
          return sendJson(res, 200, { ok: true, query, count: matches.length, matches })
        }

        if (method === 'searchAll') {
          // 方向 A：跨会话全文检索（内容级召回，复用 searchIn 的扫描语义）。
          // 约束（PERF-ANALYSIS §2A）：按 lastEventTime（文件 mtime）取最近 SEARCH_MAX_SESSIONS
          // 个会话；超大文件跳过；总时间预算 SEARCH_TIME_BUDGET_MS，超时返回已扫部分 + hasMore；
          // 请求中止（req aborted）即停；搜索词 ≥2 字符；workspace 可选过滤。
          // 每会话：cachedSession（缓存优先）→ 自由文本扫描（用户/助手/思考/工具名/参数/结果）
          // → matchCount 全量统计（排序依据）+ 返回前 SEARCH_MATCHES_PER_SESSION 条命中。
          const query = String(body.query || '').trim()
          if (query.length < 2) return sendJson(res, 400, { ok: false, error: 'query must be at least 2 characters' })
          const q = query.toLowerCase()
          const wsFilter = body.workspace ? String(body.workspace) : ''
          const SEARCH_MAX_SESSIONS = 20
          const SEARCH_MATCHES_PER_SESSION = 5
          const SEARCH_TIME_BUDGET_MS = 5000
          const SEARCH_MAX_FILE_MB = 50

          // 枚举会话（mtime 降序 = 最近活动优先）。
          const candidates = []
          for (const ws of listWorkspaces(home)) {
            if (wsFilter && ws.name !== wsFilter) continue
            for (const s of listSessionDirs(ws.dir)) {
              candidates.push({ id: s.id, file: s.file, mtimeMs: s.mtimeMs, sizeBytes: s.sizeBytes, workspace: ws.name })
            }
          }
          candidates.sort((a, b) => b.mtimeMs - a.mtimeMs)
          const selected = candidates.slice(0, SEARCH_MAX_SESSIONS)

          const started = Date.now()
          const results = []
          let scanned = 0
          let aborted = false
          req.on('aborted', () => { aborted = true })

          for (const c of selected) {
            if (aborted) break
            if (Date.now() - started > SEARCH_TIME_BUDGET_MS) break
            // 超大文件跳过（异常会话，避免单会话拖垮总预算）。
            if (c.sizeBytes > SEARCH_MAX_FILE_MB * 1024 * 1024) continue
            let turns
            try {
              const entry = cachedSession(home, c.id, c.file, c.mtimeMs, c.sizeBytes)
              turns = entry.turns
            } catch {
              continue
            }
            if (!Array.isArray(turns) || turns.length === 0) continue
            scanned++
            const matches = []
            const snippet = (text, needle) => {
              const t = String(text || '')
              const i = t.toLowerCase().indexOf(needle)
              if (i < 0) return t.slice(0, 100)
              const start = Math.max(0, i - 30)
              return (start > 0 ? '…' : '') + t.slice(start, i + needle.length + 60) + (i + needle.length + 60 < t.length ? '…' : '')
            }
            for (const t of turns) {
              for (const u of t.userMessages) {
                if (u.text.toLowerCase().includes(q)) {
                  matches.push({ kind: 'user', turn: t.turn, seq: u.seq, preview: snippet(u.text, q) })
                }
              }
              for (const a of t.assistantMessages) {
                if (a.hasThinking && a.thinking.toLowerCase().includes(q)) {
                  matches.push({ kind: 'thinking', turn: t.turn, seq: a.seq, preview: snippet(a.thinking, q) })
                }
                if (a.hasText && a.text.toLowerCase().includes(q)) {
                  matches.push({ kind: 'assistant', turn: t.turn, seq: a.seq, preview: snippet(a.text, q) })
                }
              }
              for (const s of t.steps) {
                for (const call of s.toolCalls) {
                  const argsLower = call.argumentsText.toLowerCase()
                  const resLower = call.resultText.toLowerCase()
                  if (call.name.toLowerCase().includes(q) || argsLower.includes(q) || resLower.includes(q)) {
                    const inArgs = argsLower.includes(q)
                    matches.push({
                      kind: call.isError === true ? 'error' : 'tool',
                      turn: t.turn, callId: call.callId, name: call.name,
                      preview: snippet(inArgs ? call.argumentsText : call.resultText, q) || call.resultPreview,
                    })
                  }
                }
              }
            }
            if (matches.length === 0) continue
            // 标题：索引优先（{title, source} 对象取 .title），无索引时用会话 id。
            let title = c.id
            let entry = null
            try {
              const index = readIndex(home, c.workspace)
              entry = (index.sessions && index.sessions[c.id]) || null
              if (entry && entry.title) {
                title = typeof entry.title === 'object' ? String(entry.title.title || c.id) : String(entry.title)
              }
            } catch {}
            results.push({
              sessionId: c.id,
              workspace: c.workspace,
              title,
              userTitle: effectiveUserTitle(home, entry, c.id),
              matchCount: matches.length,
              matches: matches.slice(0, SEARCH_MATCHES_PER_SESSION),
            })
          }
          results.sort((a, b) => b.matchCount - a.matchCount)
          const hasMore = scanned < selected.length && !aborted
          return sendJson(res, 200, {
            ok: true,
            query,
            scanned,
            total: selected.length,
            hasMore,
            results,
          })
        }

        if (method === 'cacheInfo') {
          // 缓存管理：统计索引与时间线缓存的体积/数量。
          const root = indexRoot(home)
          const info = { root, indexFiles: [], timelineFiles: [], indexBytes: 0, timelineBytes: 0, totalBytes: 0 }
          try {
            for (const f of readdirSync(root)) {
              if (!f.startsWith('index-') || !f.endsWith('.json')) continue
              const p = join(root, f)
              const st = statSync(p)
              info.indexFiles.push({ name: f, bytes: st.size, mtimeMs: st.mtimeMs })
              info.indexBytes += st.size
            }
          } catch {}
          try {
            const td = join(root, 'timeline')
            for (const f of readdirSync(td)) {
              if (!f.endsWith('.json')) continue
              const p = join(td, f)
              const st = statSync(p)
              info.timelineFiles.push({ name: f, bytes: st.size, mtimeMs: st.mtimeMs })
              info.timelineBytes += st.size
            }
          } catch {}
          info.totalBytes = info.indexBytes + info.timelineBytes
          info.timelineLimit = TIMELINE_CACHE_MAX_BYTES
          return sendJson(res, 200, { ok: true, ...info })
        }

        if (method === 'cacheClean') {
          // 清理缓存：what = all | index | timeline；失败不中断，逐个删除。
          const what = String(body.what || 'all')
          const root = indexRoot(home)
          let removed = 0
          let bytes = 0
          const targets = []
          try {
            for (const f of readdirSync(root)) {
              if (what === 'timeline') break
              if (f.startsWith('index-') && f.endsWith('.json')) targets.push(join(root, f))
            }
          } catch {}
          if (what !== 'index') {
            try {
              const td = join(root, 'timeline')
              for (const f of readdirSync(td)) {
                if (f.endsWith('.json')) targets.push(join(td, f))
              }
            } catch {}
          }
          for (const p of targets) {
            try {
              const st = statSync(p)
              rmSync(p)
              removed++
              bytes += st.size
            } catch {}
          }
          // 内存派生缓存同步失效（避免清理后仍从内存返回旧数据）。
          if (what !== 'index') timelineCache.clear()
          return sendJson(res, 200, { ok: true, what, removed, bytes })
        }

        if (method === 'stats') {
          const workspaces = []
          for (const ws of listWorkspaces(home)) {
            const index = readIndex(home, ws.name)
            const cacheFile = workspaceIndexFile(home, ws.name)
            let cacheSize = null
            let cacheMtime = null
            try {
              const st = statSync(cacheFile)
              cacheSize = st.size
              cacheMtime = st.mtimeMs
            } catch {}
            workspaces.push({ name: ws.name, sessionCount: ws.sessionCount, indexedCount: Object.keys(index.sessions).length, scannedAt: index.scannedAt, cacheSize, cacheMtime })
          }
          return sendJson(res, 200, {
            ok: true,
            home,
            indexRoot: indexRoot(home),
            node: process.version,
            workspaces,
          })
        }

        return sendJson(res, 400, { ok: false, error: `unknown method: ${method}` })
      } catch (error) {
        sendJson(res, 500, { ok: false, error: String(error && error.message || error) })
      }
    },
  })

  console.log('[dsh-session-flow] host half up: /api/session-flow (workspaces/list/rescan/get/stats)')
}
