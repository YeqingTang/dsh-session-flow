// lib/renames.js — M8a 会话重命名存储：<indexRoot>/renames.json
//
// 与索引/时间线缓存生命周期**解耦**（缓存管理「清理全部缓存」会重建索引，
// 重命名是用户资产不能丢——设计见 docs/02-design/RENAME.md）。
// 格式：{ version: 1, items: { [sessionId]: { title, updatedAt } } }
// 原子写（tmp + rename）+ 损坏容错（空表 + 警告，不阻塞任何接口）。
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { indexRoot } from './index-store.js'

export const RENAMES_VERSION = 1
export const MAX_RENAME_LENGTH = 120

const renames = new Map() // sessionId -> { title, updatedAt }
let loaded = false

export function renamesFile(home) {
  return join(indexRoot(home), 'renames.json')
}

/** 惰性加载：首次访问读盘；损坏 → 空表 + 警告（不抛，不阻塞）。 */
export function loadRenames(home) {
  if (loaded) return renames
  loaded = true
  try {
    if (!existsSync(renamesFile(home))) return renames
    const raw = JSON.parse(readFileSync(renamesFile(home), 'utf8'))
    if (raw && typeof raw === 'object' && raw.items && typeof raw.items === 'object') {
      for (const [id, item] of Object.entries(raw.items)) {
        if (item && typeof item.title === 'string' && item.title) {
          renames.set(id, { title: item.title, updatedAt: Number(item.updatedAt) || 0 })
        }
      }
    }
  } catch (error) {
    console.warn('[dsh-session-flow] renames.json 读取失败，按空表处理:', error && error.message)
  }
  return renames
}

/** 原子写盘；失败仅告警（内存态保留，由调用方决定是否回滚）。 */
export function saveRenames(home) {
  try {
    const dir = indexRoot(home)
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    const file = renamesFile(home)
    const tmp = `${file}.tmp`
    writeFileSync(tmp, JSON.stringify({ version: RENAMES_VERSION, items: Object.fromEntries(renames) }, null, 2))
    renameSync(tmp, file)
    return true
  } catch (error) {
    console.warn('[dsh-session-flow] renames.json 写盘失败:', error && error.message)
    return false
  }
}

/** 设置/清除自定义标题：title 为 null/空 → 清除；返回新值（string|null）。 */
export function applyRename(home, sessionId, title) {
  loadRenames(home)
  const trimmed = typeof title === 'string' ? title.trim() : ''
  if (trimmed === '') {
    renames.delete(sessionId)
  } else {
    renames.set(sessionId, { title: trimmed, updatedAt: Date.now() })
  }
  return trimmed === '' ? null : trimmed
}

/** 取自定义标题（string|null）。 */
export function userTitleOf(home, sessionId) {
  loadRenames(home)
  const item = renames.get(sessionId)
  return item && item.title ? item.title : null
}

/** 供 verify 直连测试：重置模块态。 */
export function _resetRenamesForTest() {
  renames.clear()
  loaded = false
}
