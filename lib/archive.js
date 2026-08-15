// lib/archive.js — 会话存档核心：扫描 / 解码 / 解析 / 统计。
//
// 数据来源：~/.dsh/sessions/<workspace>/session-<uuid>/session.jsonl.zstd
// （zstd 压缩的多帧 JSONL；compression: none 时为明文 session.jsonl）。
//
// 解码使用 Node 内置 node:zlib 的 zstd 支持（Node >= 22.19），零第三方依赖；
// 帧扫描算法借鉴自 @deepseek-ai/dsh-session-persistence-jsonl (MIT)。
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { zstdDecompressSync } from 'node:zlib'

const ZSTD_MAGIC = 4247762216 // 0xFD2FB528 little-endian

// ── 路径提取（M5c 内容级检索的索引基础）──────────────────────────
const PATH_KEY_RE = /^(file|path|dir|directory|local|remote|target|source|destination|workdir|remotePath|localPath|file_path|output)(Path|Dir|File)?$/i

/** 字符串是否像文件路径（防噪：排除命令文本/通配符/超长串）。 */
export function looksLikePath(value) {
  if (value.length < 2 || value.length > 200) return false
  if (value.includes('*') || value.includes('?')) return false
  if (/^[A-Za-z]:[\\/]/.test(value)) return true // 盘符绝对路径
  if (/^[\\/]|^\.{1,2}[\\/]|^~[\\/]/.test(value)) return true // 根/相对/家目录
  if (value.includes(' ')) return false // 含空格基本是命令文本
  if (value.includes('\\') || value.includes('/')) return true
  if (/^[\w.-]+(\.[A-Za-z0-9]{1,6})$/.test(value)) return true // 裸文件名带扩展名
  return false
}

/** 从工具调用参数 JSON 里提取疑似文件路径（启发式，防噪：只收字符串值）。 */
export function extractPaths(name, argumentsText) {
  const out = new Set()
  if (!argumentsText) return out
  let args
  try { args = JSON.parse(argumentsText) } catch { return out }
  const walk = (value, key) => {
    if (typeof value === 'string' && value.length > 0 && value.length < 512) {
      if ((key !== undefined && PATH_KEY_RE.test(key)) || looksLikePath(value)) {
        if (out.size < 40) out.add(value)
      }
    } else if (Array.isArray(value)) {
      for (const item of value) walk(item, key)
    } else if (value !== null && typeof value === 'object') {
      for (const [k, v] of Object.entries(value)) walk(v, k)
    }
  }
  walk(args, undefined)
  return out
}

/** 定位完整 zstd 帧范围（不解码 block），来自 dsh-session-persistence-jsonl (MIT)。 */
export function scanZstdFrames(buffer) {
  const frames = []
  let offset = 0
  while (offset < buffer.length) {
    const start = offset
    if (buffer.length - offset < 4) return { frames, tornStart: start }
    if (buffer.readUInt32LE(offset) !== ZSTD_MAGIC) throw new Error(`corrupt Zstandard session log: invalid frame magic at byte ${offset}`)
    offset += 4
    if (offset === buffer.length) return { frames, tornStart: start }
    const descriptor = buffer.readUInt8(offset)
    offset += 1
    if ((descriptor & 24) !== 0) throw new Error(`corrupt Zstandard session log: reserved frame-header bit at byte ${offset - 1}`)
    const contentSizeFlag = descriptor >>> 6
    const singleSegment = (descriptor & 32) !== 0
    const checksum = (descriptor & 4) !== 0
    const dictionaryFlag = descriptor & 3
    const dictionaryBytes = dictionaryFlag === 3 ? 4 : dictionaryFlag
    const contentSizeBytes = contentSizeFlag === 0 ? (singleSegment ? 1 : 0) : 1 << contentSizeFlag
    const remainingHeaderBytes = (singleSegment ? 0 : 1) + dictionaryBytes + contentSizeBytes
    if (buffer.length - offset < remainingHeaderBytes) return { frames, tornStart: start }
    offset += remainingHeaderBytes
    for (;;) {
      if (buffer.length - offset < 3) return { frames, tornStart: start }
      const blockHeader = buffer.readUIntLE(offset, 3)
      offset += 3
      const lastBlock = (blockHeader & 1) !== 0
      const blockType = blockHeader >>> 1 & 3
      const blockSize = blockHeader >>> 3
      if (blockType === 3) throw new Error('corrupt Zstandard session log: reserved block type')
      const payloadBytes = blockType === 1 ? 1 : blockSize
      if (buffer.length - offset < payloadBytes) return { frames, tornStart: start }
      offset += payloadBytes
      if (lastBlock) break
    }
    if (checksum) {
      if (buffer.length - offset < 4) return { frames, tornStart: start }
      offset += 4
    }
    frames.push({ start, end: offset })
  }
  return { frames }
}

/** 解码一个会话文件（zstd 多帧或明文），返回 JSONL 全文。 */
export function decodeFile(file) {
  if (file.endsWith('.zstd')) {
    const buffer = readFileSync(file)
    const { frames } = scanZstdFrames(buffer)
    if (frames.length === 0) throw new Error(`empty or header-less Zstandard session log: ${file}`)
    return frames.map((fr) => zstdDecompressSync(buffer.subarray(fr.start, fr.end))).join('')
  }
  return readFileSync(file, 'utf8')
}

/** 解析 JSONL 全文 → { header, title, events }；events 保持文件顺序（== seq 顺序）。 */
export function parseSession(plaintext) {
  const events = []
  let header = null
  let title = null
  for (const line of plaintext.split('\n')) {
    const t = line.trim()
    if (t.length === 0) continue
    let rec
    try { rec = JSON.parse(t) } catch { continue }
    if (rec === null || typeof rec !== 'object') continue
    if (rec.type === 'session') { header = rec; continue }
    if (rec.type === 'session/title') { title = rec.data; continue }
    events.push({
      seq: typeof rec.seq === 'number' ? rec.seq : events.length,
      time: typeof rec.time === 'number' ? rec.time : 0,
      type: String(rec.type || 'unknown'),
      data: rec.data === undefined ? null : rec.data,
      surfaceOp: rec.surfaceOp === undefined ? null : rec.surfaceOp,
    })
  }
  return { header, title, events }
}

const isErrorBlock = (block) =>
  block !== null && typeof block === 'object' && block.type === 'tool-result' && block.isError === true

/** 从解析结果派生会话摘要（索引用，纯规则统计）。 */
export function summarizeParsed({ header, title, events }) {
  const counts = {}
  let lastTime = null
  let lastType = null
  let lastSeq = -1
  let toolCalls = 0
  let toolErrors = 0
  let userMessages = 0
  let assistantMessages = 0
  let turns = 0
  let steps = 0
  let todos = 0
  let lastError = null
  const toolNames = new Set()
  const artifactPaths = new Set()
  for (const ev of events) {
    counts[ev.type] = (counts[ev.type] || 0) + 1
    if (ev.seq > lastSeq) lastSeq = ev.seq
    if (ev.time !== null && ev.time !== undefined && (lastTime === null || ev.time > lastTime)) {
      lastTime = ev.time
      lastType = ev.type
    }
    switch (ev.type) {
      case 'tool/call':
        toolCalls++
        if (ev.data && typeof ev.data.name === 'string' && ev.data.name.length > 0) toolNames.add(ev.data.name)
        // M5c：从参数提取路径进索引（跨会话检索「哪个会话动过 X」）。
        for (const p of extractPaths(ev.data && ev.data.name, ev.data && ev.data.arguments)) {
          if (artifactPaths.size < 60) artifactPaths.add(p)
        }
        break
      case 'tool/result':
        if (Array.isArray(ev.data && ev.data.message && ev.data.message.content) &&
            ev.data.message.content.some(isErrorBlock)) {
          toolErrors++
          lastError = { seq: ev.seq, time: ev.time }
        }
        break
      case 'user/message': userMessages++; break
      case 'assistant/message': assistantMessages++; break
      case 'turn/start': turns++; break
      case 'step/start': steps++; break
      case 'todo/write': todos++; break
      default: break
    }
  }
  return {
    id: header && header.id !== undefined ? header.id : null,
    version: header && header.version !== undefined ? header.version : null,
    createdAt: header && header.createdAt !== undefined ? header.createdAt : null,
    cwd: header && header.cwd !== undefined ? header.cwd : null,
    agentPreset: header && header.agentPreset !== undefined ? header.agentPreset : null,
    parentSession: header && header.parentSession !== undefined ? header.parentSession : null,
    delegationDepth: header && header.delegationDepth !== undefined ? header.delegationDepth : 0,
    title: title && title.title !== undefined ? title.title : null,
    titleSource: title && title.source && title.source.kind !== undefined ? title.source.kind : null,
    recordCount: events.length,
    lastSeq,
    counts,
    toolCalls,
    toolErrors,
    userMessages,
    assistantMessages,
    turns,
    steps,
    todos,
    lastEventTime: lastTime,
    lastEventType: lastType,
    lastError,
    // 去重工具名列表（M5b 档案统计 / M5c 内容检索的索引基础）。
    toolNames: [...toolNames].sort(),
    // 去重路径列表（M5c 文件检索索引，上限 60 条）。
    artifactPaths: [...artifactPaths],
    // 空会话：新建后未发生任何实质对话（无用户消息、无工具调用、无回合）。
    empty: userMessages === 0 && toolCalls === 0 && turns === 0,
  }
}

/** 定位一个会话目录里的存档文件（优先 zstd，回退明文）。 */
export function sessionFileOf(sessionDir) {
  const zstd = join(sessionDir, 'session.jsonl.zstd')
  if (existsSync(zstd)) return zstd
  const plain = join(sessionDir, 'session.jsonl')
  if (existsSync(plain)) return plain
  return null
}

/** 会话目录判定：`session-<uuid>`（根会话）或裸 UUID（子代理会话，落盘时目录名 = 子代理 ID）。 */
export function isSessionDirName(name) {
  return name.startsWith('session-') ||
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(name)
}

/** 列出 ~/.dsh/sessions 下的工作区目录。 */
export function listWorkspaces(home) {
  const root = join(home, 'sessions')
  if (!existsSync(root)) return []
  const out = []
  for (const name of readdirSync(root)) {
    const dir = join(root, name)
    let st
    try { st = statSync(dir) } catch { continue }
    if (!st.isDirectory()) continue
    let sessionCount = 0
    try {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        if (e.isDirectory() && isSessionDirName(e.name)) sessionCount++
      }
    } catch {}
    out.push({ name, dir, sessionCount })
  }
  out.sort((a, b) => a.name.localeCompare(b.name))
  return out
}

/** 列出工作区内所有会话目录（含存档文件路径与 stat）。 */
export function listSessionDirs(wsDir) {
  if (!existsSync(wsDir)) return []
  const out = []
  for (const entry of readdirSync(wsDir, { withFileTypes: true })) {
    if (!entry.isDirectory() || !isSessionDirName(entry.name)) continue
    const dir = join(wsDir, entry.name)
    const file = sessionFileOf(dir)
    if (file === null) continue
    let st
    try { st = statSync(file) } catch { continue }
    out.push({ id: entry.name, dir, file, mtimeMs: st.mtimeMs, sizeBytes: st.size })
  }
  out.sort((a, b) => a.id.localeCompare(b.id))
  return out
}

/** 解码 + 解析 + 统计一个会话文件，附加文件元信息。 */
export function summarizeSessionFile(file, meta = {}) {
  const parsed = parseSession(decodeFile(file))
  const summary = summarizeParsed(parsed)
  summary.fileMtimeMs = meta.mtimeMs !== undefined ? meta.mtimeMs : null
  summary.sizeBytes = meta.sizeBytes !== undefined ? meta.sizeBytes : null
  return { summary, parsed }
}
