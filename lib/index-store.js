// lib/index-store.js — 会话索引缓存：增量扫描（按 mtime+size 跳过未变文件）+ 落盘缓存。
//
// 缓存位置：<dshHome>/session-flow/index-<workspace>.json
// 格式：{ version, scannedAt, sessions: { [sessionId]: <summarizeParsed 结果> } }
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { listSessionDirs, summarizeSessionFile } from './archive.js'

export function dshHome() {
  return process.env.DSH_HOME || join(homedir(), '.dsh')
}

export function indexRoot(home = dshHome()) {
  // DSH_SESSION_FLOW_INDEX_DIR 可覆盖索引落盘位置（开发/测试用，生产默认 <home>/session-flow）。
  return process.env.DSH_SESSION_FLOW_INDEX_DIR || join(home, 'session-flow')
}

/** 工作区名 → 安全缓存文件名。 */
export function workspaceIndexFile(home, wsName) {
  const safe = String(wsName).replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 120)
  return join(indexRoot(home), `index-${safe}.json`)
}

/** 索引格式版本：升级时旧缓存会被自动全量重扫一次（避免字段缺失）。 */
const INDEX_VERSION = 3

export function readIndex(home, wsName) {
  try {
    const raw = JSON.parse(readFileSync(workspaceIndexFile(home, wsName), 'utf8'))
    if (raw && typeof raw === 'object' && raw.sessions && typeof raw.sessions === 'object') {
      return { version: raw.version || 1, scannedAt: raw.scannedAt || 0, sessions: raw.sessions }
    }
  } catch {}
  return { version: 1, scannedAt: 0, sessions: {} }
}

export function writeIndex(home, wsName, index) {
  const dir = indexRoot(home)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  const file = workspaceIndexFile(home, wsName)
  const tmp = `${file}.tmp`
  writeFileSync(tmp, JSON.stringify(index, null, 2))
  renameSync(tmp, file)
}

/**
 * 增量扫描一个工作区的会话索引。
 * @param {string} home - dsh home 目录。
 * @param {string} wsName - 工作区目录名（sessions/ 下的目录名）。
 * @param {{ force?: boolean }} options - force 时忽略缓存全量重扫。
 * @returns {{ index, scanned, skipped, removed }}
 */
export function scanWorkspaceIndex(home, wsName, options = {}) {
  const index = readIndex(home, wsName)
  // 索引格式升级：旧版本缓存缺新字段（如 toolNames），必须全量重扫一次。
  const force = Boolean(options && options.force) || index.version < INDEX_VERSION
  let scanned = 0
  let skipped = 0
  const removed = []
  const seen = new Set()

  const dirs = listSessionDirs(join(home, 'sessions', wsName))
  for (const entry of dirs) {
    seen.add(entry.id)
    const cached = index.sessions[entry.id]
    if (!force && cached && cached.fileMtimeMs === entry.mtimeMs && cached.sizeBytes === entry.sizeBytes) {
      skipped++
      continue
    }
    try {
      const { summary } = summarizeSessionFile(entry.file, { mtimeMs: entry.mtimeMs, sizeBytes: entry.sizeBytes })
      // 保留旧索引中的 LLM 摘要及其生成基线（会话有新对话时由
      // summaryLastEventTime 与当前 lastEventTime 对比判定过期）：
      // 解析结果整体覆盖会丢掉已落盘的摘要，导致「无新对话也需重新生成」。
      index.sessions[entry.id] = {
        ...summary,
        summary: (cached && cached.summary) || null,
        summaryLastEventTime: (cached && cached.summaryLastEventTime) || null,
      }
      scanned++
    } catch (error) {
      // 单个会话解析失败不阻塞整个工作区（torn 文件等）：保留旧缓存并记录错误。
      const reason = String(error && error.message || error)
      index.sessions[entry.id] = {
        id: entry.id,
        fileMtimeMs: entry.mtimeMs,
        sizeBytes: entry.sizeBytes,
        parseError: reason,
        recordCount: cached && cached.recordCount || 0,
        ...(cached || {}),
        fileMtimeMs: entry.mtimeMs,
        sizeBytes: entry.sizeBytes,
        parseError: reason,
      }
    }
  }
  for (const id of Object.keys(index.sessions)) {
    if (!seen.has(id)) {
      delete index.sessions[id]
      removed.push(id)
    }
  }
  index.scannedAt = Date.now()
  index.version = INDEX_VERSION
  writeIndex(home, wsName, index)
  return { index, scanned, skipped, removed }
}

/** 按会话 id 在所有工作区中定位存档（返回 { workspace, dir, file } 或 null）。 */
export function findWorkspaceOfSession(home, sessionId) {
  const root = join(home, 'sessions')
  if (!existsSync(root)) return null
  for (const wsName of readdirSync(root)) {
    const wsDir = join(root, wsName)
    try { if (!statSync(wsDir).isDirectory()) continue } catch { continue }
    const dir = join(wsDir, sessionId)
    const zstd = join(dir, 'session.jsonl.zstd')
    if (existsSync(zstd)) return { workspace: wsName, dir, file: zstd }
    const plain = join(dir, 'session.jsonl')
    if (existsSync(plain)) return { workspace: wsName, dir, file: plain }
  }
  return null
}
