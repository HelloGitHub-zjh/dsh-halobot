// 模型用量：今天花了多少 token、缓存命中多少、大概多少钱——面板概览那张卡的数据源。
//
// 两个来源，缺一不可：
//   1. QQ 会话本身就是真实的 DSH 会话，它的 tokenUsage 投影里有累计的
//      {未命中输入 / 缓存读 / 缓存写 / 输出}。每次采样拿「当前累计 − 上次累计」当增量累加，
//      所以跨日、重启都不用重算基线，也不会把历史算进今天。
//   2. 面板自己的后台小任务（整理记忆、判断心情、给表情起备注、B 站看图……）不进会话，
//      由 core/llm.js 在流结束时把 usage 报过来，单独记一笔。
//
// 计价分时段：北京时间周一至周五 9:00–12:00、14:00–18:00 算高峰，其余（含周末、法定节假日全天）
// 算空闲。所以今天的 token 分成「高峰 / 空闲」两桶记，单价也分两套；
// 采样时按那一刻的时段入桶（聊天 token 每 10–60 秒采一次，边界上最多差一个采样周期）。

import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { dataDir, dshHome, readJson, writeJson } from '../core/store.js'

const KEEP_DAYS = 31 // 留一个月的按天历史（概览上的小趋势图只看最近 7 天）
const SAMPLE_CACHE_MS = 10_000
const WRITE_GAP_MS = 15_000

// 高峰窗口（北京时间，含左不含右）：9:00–12:00、14:00–18:00
const PEAK_WINDOWS = [[9 * 60, 12 * 60], [14 * 60, 18 * 60]]

/** 本地时区的 YYYY-MM-DD（用 toISOString 会按 UTC 切日，东八区早上 8 点才换天，不对）。 */
export function dayKey(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

// 2026 年放假安排：国办发明电〔2025〕7 号（中国政府网 2025-11-04）。
// 元旦 1/1–1/3、春节 2/15–2/23、清明 4/4–4/6、劳动节 5/1–5/5、端午 6/19–6/21、中秋 9/25–9/27、国庆 10/1–10/7。
// 跨年后官方会再发新一年的通知，届时用配置 usage.holidays 补，不用等插件更新。
const HOLIDAYS = new Set(
  [
    ['2026-01-01', '2026-01-03'],
    ['2026-02-15', '2026-02-23'],
    ['2026-04-04', '2026-04-06'],
    ['2026-05-01', '2026-05-05'],
    ['2026-06-19', '2026-06-21'],
    ['2026-09-25', '2026-09-27'],
    ['2026-10-01', '2026-10-07'],
  ].flatMap(([a, b]) => {
    const out = []
    const d = new Date(a + 'T00:00:00')
    const end = new Date(b + 'T00:00:00')
    while (d <= end) {
      out.push(dayKey(d))
      d.setDate(d.getDate() + 1)
    }
    return out
  }),
)

const bjFormat = new Intl.DateTimeFormat('en-US', {
  timeZone: 'Asia/Shanghai',
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', weekday: 'short', hour12: false,
})

/** 北京时间的日期 / 分钟数 / 星期（不看本机时区，机器设在国外也不会算错）。 */
function beijing(d = new Date()) {
  const p = {}
  for (const part of bjFormat.formatToParts(d)) p[part.type] = part.value
  const minutes = (Number(p.hour) % 24) * 60 + Number(p.minute)
  return { date: `${p.year}-${p.month}-${p.day}`, minutes, weekday: p.weekday }
}

const inWindow = (minutes) => PEAK_WINDOWS.some(([a, b]) => minutes >= a && minutes < b)

/**
 * 这一刻算不算高峰。
 * 规则：周末、法定节假日全天算空闲；周一至周五 9–12、14–18 算高峰。
 * （调休补班的周末官方算工作日，这里按「周末即空闲」处理；想让它们算高峰就加进 usage.workdays。）
 */
export function isPeak(d = new Date(), holidays = HOLIDAYS, workdays = null) {
  const b = beijing(d)
  if (workdays && workdays.has(b.date)) return inWindow(b.minutes)
  if (b.weekday === 'Sat' || b.weekday === 'Sun') return false
  if (holidays.has(b.date)) return false
  return inWindow(b.minutes)
}

/** 北京时间的某个时刻（北京固定 UTC+8，不受本机时区影响）。 */
const bjInstant = (y, m, d, h, mi) => Date.UTC(y, m - 1, d, h - 8, mi)
const pad2 = (n) => String(n).padStart(2, '0')

/**
 * 当前这段高峰/空闲什么时候结束——只在真正的分界点上找（9:00 / 12:00 / 14:00 / 18:00），
 * 所以显示的是「到 12:00」「到 明天 09:00」这种整点，不是取整到某个采样时刻。
 */
function boundaryAt(now, holidays, workdays) {
  const want = isPeak(now, holidays, workdays)
  const [y, m, d] = beijing(now).date.split('-').map(Number)
  const base = Date.UTC(y, m - 1, d)
  const instants = []
  for (let i = 0; i <= 8; i++) {
    const day = new Date(base + i * 86400000)
    const yy = day.getUTCFullYear()
    const mm = day.getUTCMonth() + 1
    const dd = day.getUTCDate()
    const key = `${yy}-${pad2(mm)}-${pad2(dd)}`
    const wd = day.getUTCDay()
    const workday = (workdays && workdays.has(key)) || (!holidays.has(key) && wd >= 1 && wd <= 5)
    if (!workday) continue
    for (const [h, mi] of [[9, 0], [12, 0], [14, 0], [18, 0]]) instants.push(bjInstant(yy, mm, dd, h, mi))
  }
  instants.sort((a, b) => a - b)
  const t = now.getTime()
  for (const ms of instants) {
    if (ms <= t) continue
    if (isPeak(new Date(ms), holidays, workdays) !== want) return new Date(ms)
  }
  return null
}

function labelAt(now, at) {
  if (!at) return ''
  const a = beijing(at)
  const t = beijing(now)
  const hhmm = `${pad2(Math.floor(a.minutes / 60))}:${pad2(a.minutes % 60)}`
  if (a.date === t.date) return hhmm
  const [y, m, d] = a.date.split('-').map(Number)
  const next = new Date(Date.UTC(...(t.date.split('-').map(Number).map((v, i) => (i === 1 ? v - 1 : v)))))
  next.setUTCDate(next.getUTCDate() + 1)
  if (a.date === `${next.getUTCFullYear()}-${pad2(next.getUTCMonth() + 1)}-${pad2(next.getUTCDate())}`) return `明天 ${hhmm}`
  const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay()
  return `${['周日', '周一', '周二', '周三', '周四', '周五', '周六'][wd]} ${hhmm}`
}

const empty = () => ({ uncachedInputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 })
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0)
const sum = (a, b) => ({
  uncachedInputTokens: num(a.uncachedInputTokens) + num(b.uncachedInputTokens),
  outputTokens: num(a.outputTokens) + num(b.outputTokens),
  cacheReadTokens: num(a.cacheReadTokens) + num(b.cacheReadTokens),
  cacheWriteTokens: num(a.cacheWriteTokens) + num(b.cacheWriteTokens),
})
const zero = (b) => !num(b.uncachedInputTokens) && !num(b.outputTokens) && !num(b.cacheReadTokens) && !num(b.cacheWriteTokens)

/** 从累计里减掉上次的；会话被 /reset、被归档时累计会变小，减出负数就按 0 算（别让今天的数变负）。 */
const delta = (now, before) => ({
  uncachedInputTokens: Math.max(0, num(now.uncachedInputTokens) - num(before.uncachedInputTokens)),
  outputTokens: Math.max(0, num(now.outputTokens) - num(before.outputTokens)),
  cacheReadTokens: Math.max(0, num(now.cacheReadTokens) - num(before.cacheReadTokens)),
  cacheWriteTokens: Math.max(0, num(now.cacheWriteTokens) - num(before.cacheWriteTokens)),
})

const billedInput = (b) => num(b.uncachedInputTokens) + num(b.cacheReadTokens) + num(b.cacheWriteTokens)
const totalTokens = (b) => billedInput(b) + num(b.outputTokens)
const hitRate = (b) => {
  const billed = billedInput(b)
  return billed > 0 ? num(b.cacheReadTokens) / billed : null
}

/** 一个时段的桶：{ peak: {...}, idle: {...} } */
const split = () => ({ peak: empty(), idle: empty() })
const combined = (s) => sum((s && s.peak) || empty(), (s && s.idle) || empty())
/** 兼容更早的账（只有一份桶、没分时段）。 */
const asSplit = (s) => (s && s.peak ? s : { peak: empty(), idle: s || empty() })

export function createUsage({ dsh, log, getConfig, sessions }) {
  const file = () => dataDir('usage.json')

  let state = {
    v: 2,
    day: dayKey(),
    today: { chat: split(), background: split(), calls: 0 },
    last: {}, // sessionId → 上次看到的累计（增量法用）
    days: {}, // 'YYYY-MM-DD' → { chat: split(), background: split(), calls }
  }
  let dirty = false
  let wroteAt = 0
  let sampledAt = 0
  let cached = null
  let seenChats = 0

  const load = () => {
    const j = readJson(file(), null)
    if (!j || typeof j !== 'object') return
    // v1 只按天记、不分时段；那是当天的临时账，直接重来，别做过期迁移。
    if (j.v !== 2) {
      log.debug('用量账本版本变了（v' + String(j.v) + '），重新记账')
      return
    }
    if (j.today && j.today.chat && j.today.background && j.today.chat.peak && j.today.background.peak) state.today = j.today
    if (j.last && typeof j.last === 'object') state.last = j.last
    if (j.days && typeof j.days === 'object') state.days = j.days
    if (typeof j.day === 'string') state.day = j.day
    if (typeof state.today.calls !== 'number') state.today.calls = 0
  }
  load()

  function save(force = false) {
    if (!dirty) return
    const now = Date.now()
    if (!force && now - wroteAt < WRITE_GAP_MS) return
    try {
      writeJson(file(), state)
      wroteAt = now
      dirty = false
    } catch (error) {
      log.debug('用量落盘失败：', error.message)
    }
  }

  /** 换天了：把昨天的数归档进 days，今天的清零；last 保留（累计不会因为换天变小）。 */
  function rollDay() {
    const k = dayKey()
    if (state.day === k) return false
    state.days[state.day] = { ...state.today, at: Date.now() }
    const keys = Object.keys(state.days).sort()
    for (const old of keys.slice(0, Math.max(0, keys.length - KEEP_DAYS))) delete state.days[old]
    state.day = k
    state.today = { chat: split(), background: split(), calls: 0 }
    dirty = true
    return true
  }

  /** 读一条会话的累计用量：活着的会话读投影（最准），不在内存里的读投影缓存。都没有就返回 null。 */
  function totalsOf(sessionId) {
    try {
      const agents = dsh.agents || dsh.get('agents')
      const agent = agents && typeof agents.get === 'function' ? agents.get(sessionId) || agents.get('session-' + sessionId) : null
      if (agent && agent.session) {
        const sp = dsh.get('sessionProjections')
        if (sp && typeof sp.stateOf === 'function') {
          const v = sp.stateOf(agent.session, 'tokenUsage')
          if (v && v.totals) return v.totals
        }
      }
    } catch (error) {}
    try {
      const f = join(dshHome(), 'storages', 'session_projcache', 'sessions', String(sessionId) + '.json')
      if (!existsSync(f)) return null
      const rec = readJson(f, null)
      const cell = rec && rec.record && rec.record.rows && rec.record.rows.tokenUsage
      const val = cell && (cell.val || cell)
      if (val && val.totals) return val.totals
    } catch (error) {}
    return null
  }

  /** 现在有哪些 QQ 会话（chatId → {sessionId,title,createdAt}）。 */
  function chatRows() {
    let map = {}
    try {
      map = (typeof sessions === 'function' ? sessions() : null) || {}
    } catch (error) {}
    const rows = []
    for (const [chatId, entry] of Object.entries(map)) {
      if (!entry || !entry.sessionId) continue
      rows.push({ chatId, sessionId: String(entry.sessionId), title: entry.title || chatId, createdAt: num(entry.createdAt) })
    }
    return rows
  }

  function calendar() {
    const cfg = getConfig() || {}
    const u = cfg.usage || {}
    const extra = Array.isArray(u.holidays) ? u.holidays.filter(Boolean) : []
    const work = Array.isArray(u.workdays) ? u.workdays.filter(Boolean) : []
    return {
      holidays: extra.length ? new Set([...HOLIDAYS, ...extra.map(String)]) : HOLIDAYS,
      workdays: work.length ? new Set(work.map(String)) : null,
    }
  }

  /**
   * 采样一次：把每条会话的增量记到今天的对应时段。
   * 第一次见到的会话：今天建的（createdAt 是今天）就把累计全算今天；老会话只从这一刻开始记，
   * 免得刚装上面板就跳出「今天 5100 万 token」。
   */
  function sample() {
    const now = Date.now()
    if (cached && now - sampledAt < SAMPLE_CACHE_MS) return cached
    sampledAt = now
    rollDay()
    const { holidays, workdays } = calendar()
    const slot = isPeak(new Date(now), holidays, workdays) ? 'peak' : 'idle'
    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)
    const rows = chatRows()
    seenChats = rows.length
    for (const row of rows) {
      const totals = totalsOf(row.sessionId)
      if (!totals) continue
      const before = state.last[row.sessionId]
      if (!before) {
        const bornToday = row.createdAt >= todayStart.getTime()
        state.last[row.sessionId] = bornToday ? empty() : { ...totals }
        dirty = true
      }
      const d = delta(totals, state.last[row.sessionId])
      state.last[row.sessionId] = { ...totals }
      if (!zero(d)) {
        state.today.chat[slot] = sum(state.today.chat[slot], d)
        dirty = true
      }
    }
    save()
    cached = buildSummary()
    return cached
  }

  /** 后台小任务的一次调用（llm.js 报过来的，字段是 DSH 的 usage：inputTokens 已经是未命中部分）。 */
  function bump(usage) {
    if (!usage) return
    rollDay()
    const { holidays, workdays } = calendar()
    const slot = isPeak(new Date(), holidays, workdays) ? 'peak' : 'idle'
    const d = {
      uncachedInputTokens: num(usage.inputTokens),
      outputTokens: num(usage.outputTokens),
      cacheReadTokens: num(usage.cacheReadTokens),
      cacheWriteTokens: num(usage.cacheWriteTokens),
    }
    if (zero(d)) return
    state.today.background[slot] = sum(state.today.background[slot], d)
    state.today.calls += 1
    dirty = true
    cached = null // 下次取的时候重新算
    save()
  }

  /** 单价（元 / 百万 token）：高峰、空闲各一套；都没填就算不了钱。空闲没填时按高峰价兜底。 */
  function prices() {
    const cfg = getConfig() || {}
    const p = (cfg.usage && cfg.usage.prices) || {}
    const norm = (x) => ({ miss: num(x && x.miss), hit: num(x && x.hit), out: num(x && x.out) })
    const peak = norm(p.peak)
    const idle = norm(p.idle)
    if (peak.miss + peak.hit + peak.out === 0 && idle.miss + idle.hit + idle.out === 0) return null
    const idleEmpty = idle.miss + idle.hit + idle.out === 0
    return { peak, idle: idleEmpty ? { ...peak } : idle }
  }

  function money(buckets, p) {
    if (!p) return null
    return (num(buckets.uncachedInputTokens) * p.miss + (num(buckets.cacheReadTokens) + num(buckets.cacheWriteTokens)) * p.hit + num(buckets.outputTokens) * p.out) / 1e6
  }

  function costOf(chatSplit, bgSplit, p) {
    if (!p) return null
    const c = asSplit(chatSplit)
    const b = asSplit(bgSplit)
    return money(sum(c.peak, b.peak), p.peak) + money(sum(c.idle, b.idle), p.idle)
  }

  function buildSummary() {
    rollDay()
    const now = new Date()
    const { holidays, workdays } = calendar()
    const p = prices()
    const chatSplit = state.today.chat
    const bgSplit = state.today.background
    const total = sum(combined(chatSplit), combined(bgSplit))
    const peakBuckets = sum(chatSplit.peak, bgSplit.peak)
    const idleBuckets = sum(chatSplit.idle, bgSplit.idle)

    const history = []
    for (const day of Object.keys(state.days).sort().slice(-7)) {
      const d = state.days[day]
      const chat = asSplit(d.chat)
      const bg = asSplit(d.background)
      const all = sum(combined(chat), combined(bg))
      history.push({ day, tokens: totalTokens(all), cost: costOf(chat, bg, p), cacheHit: hitRate(all), peak: totalTokens(chat.peak) + totalTokens(bg.peak) })
    }
    history.push({ day: state.day, tokens: totalTokens(total), cost: costOf(chatSplit, bgSplit, p), cacheHit: hitRate(total), peak: totalTokens(peakBuckets) })

    return {
      ok: true,
      day: state.day,
      updatedAt: Date.now(),
      chat: combined(chatSplit),
      background: combined(bgSplit),
      total,
      periods: {
        peak: { tokens: totalTokens(peakBuckets), cost: money(peakBuckets, p && p.peak) },
        idle: { tokens: totalTokens(idleBuckets), cost: money(idleBuckets, p && p.idle) },
      },
      now: isPeak(now, holidays, workdays) ? 'peak' : 'idle',
      nowUntil: labelAt(now, boundaryAt(now, holidays, workdays)),
      calls: num(state.today.calls),
      sessions: seenChats,
      cacheHit: hitRate(total),
      priced: Boolean(p),
      cost: costOf(chatSplit, bgSplit, p),
      history,
    }
  }

  function summary() {
    return sample()
  }

  /** 每条会话到目前为止的累计 token（面板「统计 / 会话」用；采样后才齐）。 */
  function chatTotals() {
    sample()
    const out = {}
    for (const [sid, t] of Object.entries(state.last || {})) out[sid] = { ...t }
    return out
  }

  return { sample, summary, bump, chatTotals, save: () => save(true), dayKey }
}
