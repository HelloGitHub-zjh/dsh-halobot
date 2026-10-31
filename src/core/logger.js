// 日志：按天写文件 + 内存里留最近几百条给面板看。所有文本先脱敏。

import { appendFileSync, readFileSync, readdirSync, statSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'
import { dataDir, ensureDir } from './store.js'
import { redact } from './redact.js'

const RING = 500
const LEVELS = ['debug', 'info', 'warn', 'error']

export function createLogger({ dsh, retainDays = 14 } = {}) {
  const ring = []
  const listeners = new Set()
  const dir = () => ensureDir(dataDir('logs'))
  let lastCleanup = 0

  function cleanup() {
    const now = Date.now()
    if (now - lastCleanup < 6 * 3600_000) return
    lastCleanup = now
    try {
      for (const name of readdirSync(dir())) {
        const p = join(dir(), name)
        if (now - statSync(p).mtimeMs > retainDays * 86400_000) unlinkSync(p)
      }
    } catch (error) {}
  }

  function write(level, area, message) {
    const text = redact(message)
    const d = new Date()
    const pad = (n) => String(n).padStart(2, '0')
    const day = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
    const time = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
    const entry = { t: d.getTime(), time, level, area, text }
    ring.push(entry)
    if (ring.length > RING) ring.shift()
    try {
      appendFileSync(join(dir(), `halobot-${day}.log`), `${day} ${time} [${level}] [${area}] ${text}\n`, 'utf8')
    } catch (error) {}
    try {
      const fn = level === 'error' ? dsh?.logger?.error : level === 'warn' ? dsh?.logger?.warn : dsh?.logger?.info
      if (level !== 'debug') fn?.call(dsh.logger, `halobot[${area}]: ${text}`)
    } catch (error) {}
    for (const l of listeners) {
      try { l(entry) } catch (error) {}
    }
    cleanup()
    return entry
  }

  // 所有出现过的区域（面板块加载时会 child() 注册一遍，所以没打过日志的区域也能列出来给筛选框用）
  const areas = new Map()

  const api = {
    child(area) {
      areas.set(area, (areas.get(area) || 0) + 1)
      const c = {}
      for (const lv of LEVELS) c[lv] = (...args) => write(lv, area, args.map(fmt).join(' '))
      return c
    },
    recent(limit = 200, filter = {}) {
      const q = String(filter.q || '').trim().toLowerCase()
      const hit = (e) => (!q || e.text.toLowerCase().includes(q) || e.area.toLowerCase().includes(q))
      return ring
        .filter((e) => (!filter.level || LEVELS.indexOf(e.level) >= LEVELS.indexOf(filter.level))
          && (!filter.area || e.area === filter.area)
          && hit(e))
        .slice(-limit)
    },
    /** 筛选框里的区域清单（按名字排序）。 */
    areas() {
      return [...areas.keys()].sort()
    },
    /** 日志文件清单（新的在前），面板可以逐个下载。 */
    files() {
      try {
        return readdirSync(dir())
          .filter((n) => /\.log$/.test(n))
          .map((n) => {
            let size = 0
            let at = 0
            try { const st = statSync(join(dir(), n)); size = st.size; at = st.mtimeMs } catch (error) {}
            return { name: n, size, at }
          })
          .sort((a, b) => b.at - a.at)
      } catch (error) {
        return []
      }
    },
    /** 读一个日志文件（最多 2MB，够面板看/下载当天）。 */
    read(name) {
      const safe = String(name || '').replace(/[\\/]/g, '')
      if (!/\.log$/.test(safe)) return null
      try { return readFileSync(join(dir(), safe), 'utf8').slice(-2 * 1024 * 1024) } catch (error) { return null }
    },
    onEntry(fn) {
      listeners.add(fn)
      return () => listeners.delete(fn)
    },
  }
  return api
}

function fmt(v) {
  if (v instanceof Error) return v.message
  if (typeof v === 'string') return v
  try { return JSON.stringify(v) } catch (error) { return String(v) }
}
