// 索引记忆库：本地 JSON 存储 + 倒排索引（中文按二元字组切词，英文数字按词）+ BM25 打分，
// 再叠加「关于当前说话人」「重要程度」「新近程度」的加权。不依赖外部向量库，几千条也是毫秒级。
//
// 记忆来源：她自己调 remember 工具记的、后台从聊天里自动提炼的、主人在面板里手动加的。
// 召回时机：每一轮回复前，用「这一轮对方说的话」（太短就连上一句）检索最相关的几条，作为上下文悄悄告诉她。
//
// 借鉴的做法：
// - 遗忘曲线（MemoryBank）：记得多牢按「多久没想起 + 被想起过几天 + 重要程度」算，常聊到的忘得慢。
// - 整理时先比对旧记忆（Mem0）：新事实是新增、补充旧的，还是说明旧的过时了。
// - 过时不删（Graphiti）：旧记忆标成「已过时」，不再被想起，但留着历史、面板里能恢复。
// - 常驻的人物小档案（Letta 的 memory block）：每个人一小段印象，聊天时一直带着，不靠关键词碰运气。

import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { dataDir, readJson, writeJson } from '../core/store.js'
import { askModel } from '../core/llm.js'

// ---------------- 纯函数：切词与打分 ----------------

const STOP = new Set('的了是我你他她它们在有和就不也都很吗吧呢啊呀哦嗯这那个一上下来去说要会能着过'.split(''))

/** 切词：英文/数字整词；中文连续段拆成二元字组（单字段保留单字，去掉停用字）。 */
export function tokenize(text) {
  const out = []
  const s = String(text || '').toLowerCase()
  for (const m of s.matchAll(/[a-z0-9_]{2,}|[一-鿿]+/g)) {
    const w = m[0]
    if (/^[a-z0-9_]+$/.test(w)) { out.push(w); continue }
    if (w.length === 1) { if (!STOP.has(w)) out.push(w); continue }
    for (let i = 0; i < w.length - 1; i++) out.push(w.slice(i, i + 2))
  }
  return out
}

/** 两段文字有多像（字组 Jaccard），用于去重。 */
export function similarity(a, b) {
  const A = new Set(tokenize(a))
  const B = new Set(tokenize(b))
  if (!A.size || !B.size) return 0
  let inter = 0
  for (const t of A) if (B.has(t)) inter++
  return inter / (A.size + B.size - inter)
}

/** 建索引：返回 { docs, df, avgLen }。 */
export function buildIndex(items) {
  const df = new Map()
  const docs = items.map((it) => {
    const toks = tokenize(`${it.text} ${(it.tags || []).join(' ')} ${it.aboutName || ''}`)
    const tf = new Map()
    for (const t of toks) tf.set(t, (tf.get(t) || 0) + 1)
    for (const t of tf.keys()) df.set(t, (df.get(t) || 0) + 1)
    return { it, tf, len: toks.length || 1 }
  })
  const avgLen = docs.reduce((s, d) => s + d.len, 0) / (docs.length || 1)
  return { docs, df, avgLen, N: docs.length }
}

/**
 * 检索。
 * @param idx buildIndex() 的结果
 * @param {string} query
 * @param {{about?:string|string[], now?:number, limit?:number, minScore?:number, includeInvalid?:boolean}} [o]
 *   about：关于这些人（QQ 号）的记忆加分；群里可以传这一段里所有说话的人
 */
export function search(idx, query, o = {}) {
  const q = [...new Set(tokenize(query))]
  const now = o.now ?? Date.now()
  const aboutSet = new Set((Array.isArray(o.about) ? o.about : o.about ? [o.about] : []).map(String))
  const k1 = 1.4
  const b = 0.7
  const scored = []
  for (const d of idx.docs) {
    let s = 0
    const why = []
    for (const t of q) {
      const f = d.tf.get(t)
      if (!f) continue
      const n = idx.df.get(t) || 0
      const idf = Math.log(1 + (idx.N - n + 0.5) / (n + 0.5))
      const part = idf * (f * (k1 + 1)) / (f + k1 * (1 - b + b * d.len / idx.avgLen))
      s += part
      why.push([t, part])
    }
    const it = d.it
    if (it.invalidAt && !o.includeInvalid && !o.includeExpired) continue
    // 有效期：默认只召回还有效的；问到「以前」或显式 includeExpired 时才把失效的也拿出来
    const vf = Number(it.validFrom) || Number(it.at) || 0
    const vt = Number(it.validTo) || 0
    if (vt && vt < now && !o.includeExpired) continue
    const aboutHit = Boolean(it.about) && aboutSet.has(String(it.about))
    if (s <= 0 && !aboutHit) continue
    const importance = 0.6 + 0.8 * (Number(it.importance) || 0.5)
    let score = (s + (aboutHit ? 0.8 : 0)) * importance * (0.55 + 0.45 * retention(it, now))
    // 时间意图只加分不回淘汰：落在说的那个时间段里的记忆抬一点，其它照旧参与排序
    let inRange = false
    if (o.range) {
      // 区间重叠：一条记忆在它「成立到失效」的跨度里和问到的那段时间有交集就算命中
      const r = o.range
      const until = vt || now
      inRange = (!r.before || vf <= r.before) && (!r.from || until >= r.from)
      if (inRange) score *= Number(r.weight) || 1.35
    }
    if (o.kind && it.kind === o.kind) score *= 1.15
    // 一天的印象是概括性的，平时降权；只有问到的正是那一天，才当正经答案用
    if (it.source === 'episode' && !inRange) score *= 0.6
    scored.push({ it, score, why: why.sort((x, y) => y[1] - x[1]).slice(0, 3).map((w) => w[0]).concat(aboutHit ? ['（关于这个人）'] : []) })
  }
  scored.sort((x, y) => y.score - x.score)
  return scored.filter((x) => x.score >= (o.minScore ?? 0.35)).slice(0, o.limit ?? 6)
}

/** 「刚才」「3 小时前」「昨天」这样的说法。 */
export function agoText(at, now = Date.now()) {
  const m = Math.max(0, Math.round((now - at) / 60000))
  if (m < 30) return '刚才'
  if (m < 60 * 20) return `${Math.max(1, Math.round(m / 60))} 小时前`
  return '昨天'
}

/** 一条记忆是什么时候的：今天 / 昨天 / 3 天前 / 09-17 / 去年 03-02 / 2024-05-01。 */
export function whenText(at, now = Date.now()) {
  if (!at) return ''
  const d = new Date(at)
  const n = new Date(now)
  const day0 = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime()
  const days = Math.round((day0(n) - day0(d)) / 86400_000)
  const md = `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  if (days <= 0) return '今天'
  if (days === 1) return '昨天'
  if (days < 7) return `${days} 天前`
  if (d.getFullYear() === n.getFullYear()) return md
  if (d.getFullYear() === n.getFullYear() - 1) return '去年 ' + md
  return `${d.getFullYear()}-${md}`
}

/** 想起来的一条记忆怎么写给她：[什么时候] [关于谁] 内容。 */
export function memoryLine(it, now = Date.now()) {
  const expired = Number(it.validTo) > 0 && Number(it.validTo) < now
  return `[${whenText(it.at, now)}] ` + (it.aboutName ? `[${it.aboutName}] ` : '') + it.text + (expired ? '（以前的说法）' : '')
}

/** 记忆的类型：事实、偏好、计划、经历、关系。类型只用于检索加权和面板筛选，不影响文本。 */
export const KINDS = ['fact', 'preference', 'plan', 'event', 'relation']
export const KIND_LABEL = { fact: '事实', preference: '偏好', plan: '计划', event: '经历', relation: '关系' }

/** 没有类型时按文本猜一个（模型没给 kind 时的兜底）。 */
export function classifyKind(text) {
  const t = String(text || '')
  if (/主人|朋友|同事|同学|家人|妈妈|爸爸|哥哥|姐姐|弟弟|妹妹|老婆|老公|男朋友|女朋友|老师|老板|称呼/.test(t)) return 'relation'
  if (/喜欢|讨厌|爱吃|不爱吃|最爱|最怕|受不了|害怕|习惯了|口味|不喜欢/.test(t)) return 'preference'
  if (/约定|说好|答应|打算|计划|下次|以后要|约好|准备去/.test(t)) return 'plan'
  if (/去了|看了|吃了|玩了|今天|昨天|前天|刚刚|那次|第一次|发生/.test(t)) return 'event'
  return 'fact'
}

/** 从「昨天」「上周」「三年前」「2024 年」这些话里取一个起点时间；认不出返回 null。 */
export function parseWhen(text, now = Date.now()) {
  const t = String(text || '')
  const w = timeWindow(t, now)
  if (w && typeof w.from === 'number') return w.from
  const y = t.match(/(20\d{2})\s*年/)
  if (y) return new Date(Number(y[1]), 0, 1).getTime()
  if (/去年/.test(t)) { const d = new Date(now); return new Date(d.getFullYear() - 1, 0, 1).getTime() }
  if (/前年/.test(t)) { const d = new Date(now); return new Date(d.getFullYear() - 2, 0, 1).getTime() }
  if (/今年/.test(t)) { const d = new Date(now); return new Date(d.getFullYear(), 0, 1).getTime() }
  return null
}

/** 老数据没这些字段：读的时候补默认值，不批量改文件。 */
export function normalizeItem(m) {
  if (!m || typeof m !== 'object') return m
  if (!KINDS.includes(m.kind)) m.kind = m.source === 'diary' || m.source === 'episode' || m.source === 'event' ? 'event' : classifyKind(m.text)
  if (!Number.isFinite(Number(m.validFrom))) m.validFrom = Number(m.at) || Date.now()
  if (m.invalidAt && !m.validTo) m.validTo = Number(m.invalidAt)
  if (!Number.isFinite(Number(m.confidence))) m.confidence = Math.max(0, Math.min(1, Number(m.importance) || 0.5))
  return m
}

/** 把模型写的一天印象收拾干净：去掉包裹的引号、压成一行、限长。 */
export function cleanEpisode(text) {
  return String(text || '').replace(/\s+/g, ' ').trim().replace(/^["'「]/, '').replace(/["'」]$/, '').trim().slice(0, 160)
}

/**
 * 该不该忘掉：每日整理自动提炼出来的、不太重要、已经淡了的（见 retention），忘掉。
 * 她自己记的、你加的、经历和日记不自动忘。
 */
export function shouldForget(m, now = Date.now()) {
  // 过时的留半年（面板里能看到、能恢复），之后清掉
  if (m.invalidAt) return now - m.invalidAt > 180 * 86400_000
  // 一天的印象留半年：久了就没必要再占地方
  if (m.source === 'episode') return now - (Number(m.at) || 0) > 180 * 86400_000
  if (m.source !== 'auto') return false
  if ((Number(m.importance) || 0) >= 0.6) return false
  return retention(m, now) < 0.05
}

/**
 * 记得多牢（0~1）：R = e^(-Δt/τ)。Δt 是离上次被想起（或记下）过了多久；
 * τ 随「被想起过几天」和重要程度变长——一条普通记忆两个月没碰就淡了，隔几天就聊到一次的能记很久。
 */
export function retention(m, now = Date.now()) {
  const last = Math.max(m.at || 0, m.lastHit || 0)
  const days = Math.max(0, (now - last) / 86400_000)
  const strength = 1 + Math.min(10, Number(m.hitDays) || 0)
  const tau = 20 * strength * (0.5 + (Number(m.importance) || 0.5))
  return Math.exp(-days / tau)
}

// ---------------- 记忆库 ----------------

/** 解析「回顾」的模型输出：{insights:[], style:[]}；老格式的纯数组当作 insights。 */
export function parseReflection(out) {
  const str = (t) => String(typeof t === 'string' ? t : t?.text || '').trim()
  const obj = String(out || '').match(/\{[\s\S]*\}/)
  if (obj) {
    try {
      const j = JSON.parse(obj[0])
      if (Array.isArray(j.insights) || Array.isArray(j.style)) {
        return { insights: (j.insights || []).map(str).filter(Boolean), style: (j.style || []).map(str).filter(Boolean) }
      }
    } catch (error) {}
  }
  const arr = String(out || '').match(/\[[\s\S]*\]/)
  try {
    return { insights: arr ? JSON.parse(arr[0]).map(str).filter(Boolean) : [], style: [] }
  } catch (error) {
    return { insights: [], style: [] }
  }
}

// ---------------- 聊天记录归档：整理进长期记忆之后，原文也别丢 ----------------
// 以前整理完就把当天的流水删了（hub.deleteChatLog），提炼时漏掉的话再也找不回来，也没法翻原话。
// 现在改成搬到 chatlog-archive/：默认留 60 天，可以按关键词翻回来（面板/工具 search_history）。

export const HISTORY_KEEP_DAYS = 60

/** 读一份流水文件（JSONL），坏行跳过。 */
export function readLogLines(file) {
  try {
    return readFileSync(file, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((l) => { try { return JSON.parse(l) } catch (error) { return null } })
      .filter(Boolean)
  } catch (error) {
    return []
  }
}

/** 目录里有哪些天的流水（YYYY-MM-DD），升序。 */
export function logDaysIn(dir) {
  try {
    return readdirSync(dir).filter((n) => /^\d{4}-\d{2}-\d{2}\.jsonl$/.test(n)).map((n) => n.slice(0, 10)).sort()
  } catch (error) {
    return []
  }
}

/**
 * 字面兜底：BM25 一条都没命中时用（「猫叫什么」和「养了一只橘猫」，二元组搭不上，但单字搭得上）。
 * 按「问句里的字有几个出现在这段话里」算比例，宁可多想起一条，也别明明记得却想不起来。
 */
export function looseSearch(items, query, { limit = 10, minRatio = 0.5 } = {}) {
  const s = String(query || '').toLowerCase()
  const terms = [
    ...new Set([...s].filter((c) => /[一-鿿]/.test(c) && !STOP.has(c))),
    ...new Set(s.match(/[a-z0-9_]{2,}/g) || []),
  ]
  if (!terms.length) return []
  const out = []
  for (const it of items) {
    const text = `${it.text} ${(it.tags || []).join(' ')}`.toLowerCase()
    let n = 0
    for (const t of terms) if (text.includes(t)) n++
    if (n / terms.length >= minRatio) out.push({ it, score: n / terms.length, why: ['（字面凑得上）'] })
  }
  return out.sort((a, b) => b.score - a.score).slice(0, limit)
}

/** 伪相关反馈：从第一遍命中的记忆里捡出反复出现、又不在原问句里的词（换了个说法时补齐线索）。 */
export function expandTerms(query, hits) {
  const have = new Set(tokenize(query))
  const cnt = new Map()
  for (const h of hits.slice(0, 3)) {
    for (const t of tokenize(h.it?.text || '')) {
      if (have.has(t) || t.length < 2) continue
      cnt.set(t, (cnt.get(t) || 0) + 1)
    }
  }
  return [...cnt].filter(([, n]) => n >= 2).map(([t]) => t).slice(0, 4)
}

/**
 * 从问句里认出时间意图，返回一个时间窗（只用来「加分」，绝不因为不在窗里就排除）。
 * 支持：今天/昨天/前天/大前天/上周/这周/上个月/上上个月/前天以前/N 天前/N 周前/N 个月前。
 */
export function timeWindow(query, now = Date.now()) {
  const q = String(query || '')
  const day = 86400_000
  const startOfToday = new Date(now)
  startOfToday.setHours(0, 0, 0, 0)
  const t0 = startOfToday.getTime()
  const span = (from, before) => (from || before ? { from, before, weight: 1.35 } : null)
  if (/大前天/.test(q)) return span(t0 - 3 * day, t0 - 2 * day)
  if (/前天/.test(q)) return span(t0 - 2 * day, t0 - day)
  if (/昨天|昨晚/.test(q)) return span(t0 - day, t0)
  if (/今天|今晚|今早|刚才|刚刚/.test(q)) return span(t0, now + 1000)
  if (/上周|上个星期/.test(q)) return span(t0 - 7 * day, t0)
  if (/这周|本周/.test(q)) return span(t0 - 6 * day, now + 1000)
  if (/上个月|上月/.test(q)) return span(t0 - 31 * day, t0 - 7 * day)
  const CN_NUM = { 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 }
  const cnToNum = (raw) => {
    if (/^\d+$/.test(raw)) return Number(raw)
    if (raw.includes('十')) {
      const [a, b] = raw.split('十')
      const tens = a ? CN_NUM[a] || 1 : 1
      const ones = b ? CN_NUM[b] || 0 : 0
      return tens * 10 + ones
    }
    return CN_NUM[raw] || 0
  }
  const n = q.match(/([0-9]+|[一二两三四五六七八九十]+)\s*(天|日|周|个?星期|个?月)\s*(前|之前|以前)/)
  if (n) {
    const k = cnToNum(n[1])
    const unit = n[2]
    const len = /月/.test(unit) ? 30 * day : /周|星期/.test(unit) ? 7 * day : day
    if (k > 0 && k <= 400) return span(now - (k + 1) * len, now - (k - 1) * len)
  }
  if (/以前|之前|那次|那时候/.test(q)) return span(null, now - 30 * day)
  return null
}

export function createMemoryStore({ dsh, getConfig, hub, log }) {
  const file = () => dataDir('memories.json')
  const load = () => {
    const s = readJson(file(), () => ({ items: [] }))
    for (const m of s.items || []) normalizeItem(m)
    return s
  }
  const save = (s) => {
    writeJson(file(), s)
    cache = null
  }
  let cache = null // { stamp, idx }
  const index = () => {
    const s = load()
    const stamp = s.items.length + ':' + (s.items.at(-1)?.id || '') + ':' + (s.rev || 0)
    if (!cache || cache.stamp !== stamp) cache = { stamp, idx: buildIndex(s.items) }
    return cache.idx
  }

  // ---------- 聊天流水归档：整理完搬走而不是删掉，随时能翻原文 ----------
  const chatLogDir = () => dataDir('chatlog')
  const archiveDir = () => dataDir('chatlog-archive')

  /** 把某天的流水从 chatlog/ 搬进 chatlog-archive/（同盘 rename，中途不会丢）。 */
  function archiveChatLog(day) {
    const from = join(chatLogDir(), `${day}.jsonl`)
    if (!existsSync(from)) return false
    try {
      mkdirSync(archiveDir(), { recursive: true })
      const to = join(archiveDir(), `${day}.jsonl`)
      if (existsSync(to)) {
        // 那天已经搬过一次（后来又聊了新的）：接在后面，不覆盖
        writeFileSync(to, readFileSync(to, 'utf8') + readFileSync(from, 'utf8'))
        unlinkSync(from)
      } else {
        renameSync(from, to)
      }
      return true
    } catch (error) {
      // 搬不动就先留在原地，不能因为归档失败把原文弄丢
      log.warn('归档聊天记录失败（原文先留着）：', error.message)
      return false
    }
  }

  /** 归档只留最近 HISTORY_KEEP_DAYS 天。 */
  function pruneArchive(now = Date.now()) {
    const cutoff = dayKey(new Date(now - HISTORY_KEEP_DAYS * 86400_000))
    let n = 0
    for (const day of logDaysIn(archiveDir())) {
      if (day >= cutoff) continue
      try { unlinkSync(join(archiveDir(), `${day}.jsonl`)); n++ } catch (error) {}
    }
    if (n) log.info(`清理了 ${n} 天过期的聊天记录归档（保留 ${HISTORY_KEEP_DAYS} 天）`)
    return n
  }

  // 归档 + 还没归档的今天，合起来就是全部原话；按文件大小判缓存，聊天多了才重建索引
  let histCache = null
  function historyStamp() {
    const parts = []
    for (const dir of [archiveDir(), chatLogDir()]) {
      for (const day of logDaysIn(dir)) {
        try { parts.push(day + ':' + statSync(join(dir, `${day}.jsonl`)).size) } catch (error) {}
      }
    }
    return parts.join('|')
  }

  function history() {
    const stamp = historyStamp()
    if (histCache && histCache.stamp === stamp) return histCache
    const lines = []
    for (const dir of [archiveDir(), chatLogDir()]) {
      for (const day of logDaysIn(dir)) {
        for (const l of readLogLines(join(dir, `${day}.jsonl`))) {
          if (!l || !l.text || !l.t) continue
          lines.push({ id: `${day}-${lines.length}`, day, at: Number(l.t), chatId: String(l.chatId || ''), who: String(l.who || ''), text: String(l.text) })
        }
      }
    }
    lines.sort((a, b) => a.at - b.at)
    const shown = lines.map((l) => ({ ...l, text: `${l.who === 'bot' ? '我' : l.who || '?'}：${l.text}` }))
    histCache = { stamp, lines: shown, idx: buildIndex(shown) }
    return histCache
  }

  /**
   * 翻以前的原文（整理成记忆之前的聊天记录，默认留 60 天）。
   * @param {string} query 关键词或一句话
   * @param {{chatId?:string, days?:number, limit?:number, now?:number}} [o] days：只看最近几天
   */
  function searchHistory(query, { chatId = '', days = 0, limit = 12, now = Date.now() } = {}) {
    const q = String(query || '').trim()
    if (!q) return []
    const h = history()
    const cutoff = days ? now - days * 86400_000 : 0
    const lines = h.lines.filter((l) => (!chatId || l.chatId === chatId) && (!cutoff || l.at >= cutoff))
    if (!lines.length) return []
    const idx = !chatId && !cutoff ? h.idx : buildIndex(lines)
    const hits = search(idx, q, { limit, minScore: 0.2 })
    return hits.length
      ? hits.map((x) => ({ ...x.it, score: Number(x.score.toFixed(2)) }))
      : looseSearch(lines, q, { limit }).map((x) => ({ ...x.it, score: Number(x.score.toFixed(2)), why: x.why }))
  }

  function historyStats() {
    const h = history()
    const byDay = new Map()
    for (const l of h.lines) byDay.set(l.day, (byDay.get(l.day) || 0) + 1)
    return { days: byDay.size, lines: h.lines.length, keepDays: HISTORY_KEEP_DAYS, oldest: h.lines[0]?.day || '', newest: h.lines.at(-1)?.day || '' }
  }

  function add({ text, about = '', aboutName = '', tags = [], importance = 0.5, source = 'tool', chatId = '', day = '', kind = '', validFrom = 0, confidence = 0 }) {
    const t = String(text || '').trim().slice(0, 200)
    if (!t) return { ok: false, message: '内容是空的' }
    const s = load()
    // 去重：很像的就更新旧的（时间、重要程度取新），不重复存
    const k = KINDS.includes(kind) ? kind : classifyKind(t)
    const conf = Number.isFinite(Number(confidence)) && Number(confidence) > 0 ? Math.min(1, Number(confidence)) : Math.max(0, Math.min(1, Number(importance) || 0.5))
    const vf = Number(validFrom) > 0 ? Number(validFrom) : Date.now()
    const sameFact = (m) => !m.invalidAt && (!m.validTo || m.validTo > Date.now()) && (m.kind || 'fact') === k && similarity(m.text, t) >= 0.6 && (!about || !m.about || m.about === String(about))
    const dup = s.items.find(sameFact)
    if (dup) {
      dup.text = t.length >= dup.text.length ? t : dup.text
      dup.at = Date.now()
      dup.importance = Math.max(Number(dup.importance) || 0, Number(importance) || 0)
      s.rev = (s.rev || 0) + 1
      save(s)
      return { ok: true, message: '✓', updated: dup.id }
    }
    const item = { id: randomUUID().slice(0, 8), text: t, about: String(about || ''), aboutName: String(aboutName || ''), tags: (tags || []).slice(0, 5), importance: Math.max(0, Math.min(1, Number(importance) || 0.5)), source, chatId, at: Date.now(), hits: 0 }
    if (day) item.day = String(day)
    item.kind = k
    item.validFrom = vf
    item.confidence = conf
    s.items.push(item)
    if (s.items.length > 3000) s.items = s.items.sort((a, b) => (b.importance - a.importance) || (b.at - a.at)).slice(0, 3000)
    save(s)
    return { ok: true, message: '✓', id: item.id }
  }

  /** 导入旧档案第一步：让模型从一大段文字里挑出值得记的，返回候选（不直接存）。 */
  async function importCandidates(text) {
    const src = String(text || '').trim()
    if (!src) return []
    const chunks = []
    for (let i = 0; i < src.length && chunks.length < 6; i += 5000) chunks.push(src.slice(i, i + 5000))
    const out = []
    for (const part of chunks) {
      const r = await askModel(dsh, {
        cfg: getConfig(),
        system: '你帮一个叫「哈洛」的聊天角色从旧档案（设定、聊天笔记、以前的记忆文件）里挑出值得长期记住的事：别人的名字/称呼、喜好、身份、约定、重要经历、和她的关系。不要记她自己的人设和外貌（那些在人格里），不要记无关的说明文字。每条一句话、主语写清楚。只输出 JSON 数组，例如 [{"text":"小明喜欢吃辣","about":"小明","importance":0.6}]。',
        text: part,
        maxTokens: 2500,
        temperature: 0.2,
      })
      const m = String(r).match(/\[[\s\S]*\]/)
      try { for (const x of m ? JSON.parse(m[0]) : []) if (x && x.text) out.push({ text: String(x.text).slice(0, 200), aboutName: String(x.about || ''), importance: Math.max(0, Math.min(1, Number(x.importance) || 0.5)) }) } catch (error) {}
    }
    // 和已有记忆、彼此之间去重
    const have = load().items
    const uniq = []
    for (const c of out) if (!have.some((m) => similarity(m.text, c.text) >= 0.6) && !uniq.some((u) => similarity(u.text, c.text) >= 0.6)) uniq.push(c)
    return uniq.slice(0, 80)
  }

  /** 导入旧档案第二步：把勾选的候选存进记忆库。 */
  function importCommit(items) {
    let n = 0
    for (const c of items || []) if (add({ text: c.text, aboutName: c.aboutName || '', importance: c.importance ?? 0.5, source: 'import' }).id) n++
    return n
  }

  /** 她自己做过的事（唱了歌、在空间评论了谁……）：记成「经历」，最近一天的会常驻在上下文里。 */
  function addEvent({ text, about = '', aboutName = '', tags = [], importance = 0.45 }) {
    return add({ text, about, aboutName, tags: ['经历', ...tags], importance, source: 'event' })
  }

  /** 最近 hours 小时里她做过的事（经历 + 空间日记），新的在前。 */
  function recentEvents(hours = 24, limit = 4) {
    const since = Date.now() - hours * 3600_000
    return load().items.filter((m) => (m.source === 'event' || m.source === 'diary') && m.at >= since).sort((a, b) => b.at - a.at).slice(0, limit)
  }

  function update(id, patch) {
    const s = load()
    const m = s.items.find((x) => x.id === id)
    if (!m) return { ok: false, message: '没有这条' }
    for (const k of ['text', 'about', 'aboutName', 'tags', 'importance']) if (patch[k] !== undefined) m[k] = patch[k]
    s.rev = (s.rev || 0) + 1
    save(s)
    return { ok: true, item: m }
  }

  /** 补充或改正一条旧记忆：换成新说法，旧说法留进 history。 */
  function revise(id, text, importance) {
    const s = load()
    const m = s.items.find((x) => x.id === id)
    const t = String(text || '').trim().slice(0, 200)
    if (!m || !t) return false
    m.history = [...(m.history || []), { text: m.text, at: m.at }].slice(-3)
    m.text = t
    m.at = Date.now()
    m.importance = Math.max(Number(m.importance) || 0, Number(importance) || 0)
    s.rev = (s.rev || 0) + 1
    save(s)
    return true
  }

  /** 标成过时：不再被想起，但不删（面板里能看到被哪条取代、能恢复）。 */
  /** 旧的被新的取代：标失效时间 + 指向新条目（面板可恢复）。 */
  function supersede(id, byId = '') {
    return invalidate(id, byId)
  }

  function invalidate(id, byId = '') {
    const s = load()
    const m = s.items.find((x) => x.id === id)
    if (!m) return false
    m.invalidAt = Date.now()
    m.validTo = m.validTo || m.invalidAt
    if (byId) m.supersededBy = byId
    s.rev = (s.rev || 0) + 1
    save(s)
    return true
  }

  function restore(id) {
    const s = load()
    const m = s.items.find((x) => x.id === id)
    if (!m) return { ok: false, message: '没有这条' }
    delete m.invalidAt
    delete m.supersededBy
    s.rev = (s.rev || 0) + 1
    save(s)
    return { ok: true }
  }

  function remove(id) {
    const s = load()
    s.items = s.items.filter((m) => m.id !== id)
    s.rev = (s.rev || 0) + 1
    save(s)
    return { ok: true }
  }

  const recallLog = [] // 最近几次想起了什么（给面板看）
  /**
   * 想起相关的记忆。
   * 除了直接检索，还做两件事：
   * 1. 换个说法也能想起来：拿第一遍最像的那几条里反复出现的词再检索一遍（伪相关反馈，不额外调模型，
   *    不加延迟也不加钱——每轮多一次 LLM 调用对聊天机器人太贵了）；
   * 2. 「嗯嗯」「然后呢」这种短句：把上一句也当上下文找一遍。
   */
  // 一轮对话里可能连着想起好几条：命中计数先攒着，30 秒（可配）写一次就够，
  // 别每想起一条就把整个 memories.json 重写一遍。
  let hitQueue = new Map()
  let hitTimer = null
  function flushHits() {
    if (hitTimer) { clearTimeout(hitTimer); hitTimer = null }
    if (!hitQueue.size) return 0
    const queued = hitQueue
    hitQueue = new Map()
    const s = load()
    const today = new Date().toDateString()
    let changed = 0
    for (const [id, n] of queued) {
      const m = s.items.find((x) => x.id === id)
      if (!m) continue
      // 强度按「被想起过几天」算，同一天想起多次只算一次
      if (!m.lastHit || new Date(m.lastHit).toDateString() !== today) m.hitDays = (m.hitDays || 0) + 1
      m.hits = (m.hits || 0) + n
      m.lastHit = Date.now()
      changed++
    }
    if (changed) writeJson(file(), s)
    return changed
  }
  function stageHits(hits) {
    for (const h of hits) hitQueue.set(h.it.id, (hitQueue.get(h.it.id) || 0) + 1)
    const ms = Number(getConfig().memory?.writeDebounceMs ?? 30000)
    if (hitTimer) clearTimeout(hitTimer)
    if (ms > 0) hitTimer = setTimeout(() => { try { flushHits() } catch (error) {} }, ms)
    else flushHits()
    if (hitTimer && typeof hitTimer.unref === 'function') hitTimer.unref()
  }

  function recall(query, { about, limit, where = '', context = '', range = null, includeExpired = false } = {}) {
    const max = limit ?? (Number(getConfig().memory.recallMax) || Number(getConfig().memory.recallCount) || 6)
    const hits = search(index(), query, { about, limit: max, range, includeExpired })
    const have = new Set(hits.map((h) => h.it.id))
    const push = (h, weight, tag) => {
      if (hits.length >= max || have.has(h.it.id)) return
      have.add(h.it.id)
      hits.push({ ...h, score: h.score * weight, why: [...(h.why || []), ...(tag ? [tag] : [])] })
    }
    const extra = expandTerms(query, hits)
    if (!hits.length) {
      // 一条都没命中（换个说法差得远）：退回字面兜底，别明明记得却想不起来
      for (const h of looseSearch(load().items.filter((m) => !m.invalidAt && (includeExpired || !m.validTo || m.validTo > Date.now())), query, { limit: max })) push(h, 0.6, '')
    }
    if (extra.length && hits.length < max) {
      for (const h of search(index(), extra.join(' '), { about, limit: max, minScore: 0.3, range, includeExpired })) push(h, 0.7, '（相近的说法）')
    }
    if (context && hits.length < max) {
      for (const h of search(index(), context, { about, limit: max, minScore: 0.5, range, includeExpired })) push(h, 0.6, '（上一句）')
    }
    hits.sort((a, b) => b.score - a.score)
    recallLog.unshift({ at: Date.now(), where, query: String(query).slice(0, 120), hits: hits.map((h) => ({ id: h.it.id, text: h.it.text, score: Number(h.score.toFixed(2)), why: h.why || [] })) })
    recallLog.length = Math.min(recallLog.length, 20)
    if (hits.length) stageHits(hits)
    return hits
  }

  // ---------- 相处经验：按人（私聊按 QQ 号，群按群）归类的、概括性的「怎么和 TA 相处」，越聊越懂 ----------
  const personKey = (chat) => (chat.kind === 'group' ? `group:${chat.groupId}` : chat.userId ? `qq:${chat.userId}` : '')
  function insightsOf(key) {
    return (load().insights || {})[key] || []
  }
  function setInsights(key, list, name) {
    const s = load()
    s.insights = s.insights || {}
    s.insightNames = s.insightNames || {}
    s.insights[key] = list.slice(0, 8)
    if (name) s.insightNames[key] = name
    s.rev = (s.rev || 0) + 1
    save(s)
  }

  // ---------- 说话方式：聊久了潜移默化学到的（对方的说话习惯 + 她自己慢慢养成的说法） ----------
  function styleOf(key) {
    return (load().styles || {})[key] || []
  }
  function setStyle(key, list) {
    const s = load()
    s.styles = s.styles || {}
    s.styles[key] = list.map((t) => String(t).trim().slice(0, 40)).filter(Boolean).slice(0, key === 'self' ? 6 : 5)
    s.rev = (s.rev || 0) + 1
    save(s)
  }

  // ---------- 人物小档案：每个人一小段印象（是谁、什么关系、喜好、近况），聊天时常驻 ----------
  function profileOf(qq) {
    return (load().profiles || {})[String(qq)] || null
  }
  function setProfile(qq, text, name = '') {
    const s = load()
    s.profiles = s.profiles || {}
    const t = String(text || '').trim().slice(0, 200)
    if (t) s.profiles[String(qq)] = { text: t, name: name || s.profiles[String(qq)]?.name || '', at: Date.now() }
    else delete s.profiles[String(qq)]
    s.rev = (s.rev || 0) + 1
    save(s)
  }

  /** 人物卡片墙：把「关于某个人」的记忆、小档案、相处经验、说话方式汇成一条，面板直接画卡片。 */
  function people() {
    const s = load()
    const cfg = getConfig()
    const map = new Map()
    const get = (qq) => {
      let p = map.get(String(qq))
      if (!p) {
        p = { qq: String(qq), name: '', text: '', at: 0, memories: 0, importance: 0, tags: {}, first: 0, last: 0 }
        map.set(String(qq), p)
      }
      return p
    }
    for (const it of s.items) {
      if (!it.about || it.invalidAt) continue
      const p = get(it.about)
      p.memories++
      p.importance += Number(it.importance) || 0
      for (const t of it.tags || []) p.tags[t] = (p.tags[t] || 0) + 1
      const at = Number(it.at) || 0
      if (at) {
        p.first = p.first ? Math.min(p.first, at) : at
        p.last = Math.max(p.last, at)
      }
      if (it.aboutName) p.name = it.aboutName
    }
    for (const [qq, prof] of Object.entries(s.profiles || {})) {
      const p = get(qq)
      p.text = String(prof.text || '')
      p.at = Number(prof.at) || 0
      if (prof.name) p.name = prof.name
    }
    const out = []
    for (const p of map.values()) {
      p.tags = Object.entries(p.tags).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([t]) => t)
      p.insights = (s.insights?.['qq:' + p.qq] || []).length
      p.styles = (s.styles?.['qq:' + p.qq] || []).length
      p.owner = String(p.qq) === String(cfg.ownerQQ)
      if (!p.name) p.name = p.owner ? (cfg.ownerName || '主人') : 'QQ ' + p.qq
      p.importance = Math.round(p.importance * 100) / 100
      out.push(p)
    }
    return out.sort((a, b) => (b.importance - a.importance) || (b.last - a.last))
  }

  /** 按这个人的记忆重写小档案（记忆少于 3 条的不写）。 */
  async function buildProfile(qq) {
    const cfg = getConfig()
    const mine = load().items.filter((m) => !m.invalidAt && String(m.about) === String(qq)).sort((a, b) => a.at - b.at)
    if (mine.length < 3) return false
    const name = mine.filter((m) => m.aboutName).at(-1)?.aboutName || ''
    const old = profileOf(qq)?.text || ''
    const out = await askModel(dsh, {
      cfg,
      system: '你是「哈洛」。根据你记得的关于一个人的事，写一张给自己看的人物小档案：TA 是谁、怎么称呼、和你什么关系、性格和喜好、最近在忙什么。只写记忆里明确有的，不要推测性格、不要编，也不要写「应该」「可能」这种猜的话；旧档案和新记忆矛盾时以新记忆为准。用第三人称，一段话，100 字以内，不要标题和列表。',
      text: `${String(qq) === String(cfg.ownerQQ) ? `这是你的${cfg.ownerName || '主人'}。\n` : ''}旧档案：${old || '（还没有）'}\n\n记得的事（越往下越新）：\n${mine.slice(-40).map((m) => `- [${whenText(m.at)}] ${m.text}`).join('\n')}`,
      maxTokens: 1500,
      temperature: 0.3,
    })
    const text = String(out || '').trim().replace(/^[「"]|[」"]$/g, '')
    if (!text) throw new Error('模型没写出东西，等会儿再试')
    setProfile(qq, text, name)
    return true
  }

  /** 给系统提示词上下文用：人物小档案 + 相处经验（常驻）+ 按这一轮对方说的话检索到的记忆。 */
  function contextFor(chat, sessionId) {
    const cfg = getConfig().memory
    if (!cfg.enabled) return ''
    const parts = []
    // 对这个人（群里是正在说话的几个人）的印象，不用等关键词碰上
    const people = chat.kind === 'group' ? (hub?.speakersOf?.(sessionId) || []).slice(0, 3) : chat.userId ? [chat.userId] : []
    const profs = people.map((qq) => profileOf(qq)).filter(Boolean)
    if (profs.length) parts.push('（你对' + (chat.kind === 'group' ? '正在说话的人' : '对方') + '的印象：' + profs.map((p) => (chat.kind === 'group' && p.name ? p.name + '——' : '') + p.text).join('；') + '）')
    const ins = insightsOf(personKey(chat))
    if (ins.length) parts.push('（和' + (chat.kind === 'group' ? '这个群' : '对方') + '相处的经验，照着做就好，不用说出来：' + ins.map((x) => x.text).join('；') + '）')
    const sty = styleOf(personKey(chat))
    const self = styleOf('self')
    if (sty.length || self.length) {
      parts.push('（说话方式：' + [sty.length ? '和' + (chat.kind === 'group' ? '这个群' : '对方') + '聊久了，' + sty.join('；') : '', self.length ? '你平时不知不觉会用的说法：' + self.join('、') : ''].filter(Boolean).join('。') + '。自然带一点就好，别刻意模仿，也别变成另一个人。）')
    }
    // 最近做过的事：不用等别人提，她自己记得（比如刚给你唱过歌）
    const recent = recentEvents()
    if (recent.length) parts.push('（你最近做过的事：' + recent.map((m) => `${agoText(m.at)}${m.text}`).join('；') + '。聊到了可以自然提起。）')
    // 注意：随每条消息变化的「相关记忆」不放在这里（#79）——运行时上下文快照每轮都会追加到历史，
    // 内容一变就多一份快照；放在用户消息里（recallHint）只占当轮，不会越滚越大。
    return parts.join('\n')
  }

  // 主人私聊里问起群里的事：才临时把最近 24 小时的群聊流水当成「她自己的见闻」补进这一轮
  // （不常驻、不写进记忆；默认关，面板「聊天 → 主人私聊」里可以调每个群几条、限定只取哪些群）
  const GROUP_TALK = /(群|群聊|群里|他们|大家|那些人在聊)/

  function groupBackdrop (chat, queryText) {
    if (!chat || chat.kind !== 'private') return ''
    const all = getConfig()
    const ob = all.group && all.group.ownerBrief
    if (!ob || ob.enabled !== true) return ''
    if (!all.ownerQQ || String(chat.userId) !== String(all.ownerQQ)) return ''
    if (!GROUP_TALK.test(String(queryText || ''))) return ''
    const now = Date.now()
    const cutoff = now - 86400_000
    let rows = []
    try {
      for (const dk of [dayKey(), dayKey(new Date(cutoff))]) {
        for (const l of hub?.chatLogOf?.(dk) || []) {
          if (!l || !String(l.chatId).startsWith('group:') || !String(l.text || '').trim()) continue
          const t = Number(l.t) || 0
          if (t && t < cutoff) continue
          rows.push(l)
        }
      }
      rows.sort((a, b) => (Number(a.t) || 0) - (Number(b.t) || 0))
    } catch (error) {
      return ''
    }
    // 群白名单：配了就只取这些群（不配 = 所有群）
    const allow = new Set((ob.groups || []).map(String))
    if (allow.size) rows = rows.filter((l) => allow.has(String(l.chatId).slice(6)))
    if (!rows.length) return ''
    // 按群分组，每个群各取最后 limit 条（最多 30），整体再兜一个上限
    const limit = Math.max(1, Math.min(30, Number(ob.lines) || 12))
    const byGroup = new Map()
    for (const l of rows) {
      const gid = String(l.chatId).slice(6)
      if (!byGroup.has(gid)) byGroup.set(gid, [])
      byGroup.get(gid).push(l)
    }
    const blocks = []
    let total = 0
    for (const [gid, list] of byGroup) {
      if (total >= 120) break
      const tail = list.slice(-limit)
      total += tail.length
      const name = hub?.groupNames?.get?.(gid) || ''
      const title = name && name !== gid ? `群「${name}」（${gid}）` : `群 ${gid}`
      const body = tail.map((l) => {
        const who = l.who === 'bot' ? '我' : (l.who || '有人')
        return `${who}：${String(l.text).replace(/\s+/g, ' ').trim().slice(0, 100)}`
      }).join('\n')
      blocks.push(`【${title} · 最近 ${tail.length} 条】\n${body}`)
    }
    log.info(`主人问起群里的事：补了 ${blocks.length} 个群、共 ${total} 条最近的群聊记录`)
    // 措辞当成「她自己的见闻」，而不是「给她看的材料」——
    // 否则她会回一句「我看到了」，而不是接着聊群里那件事本身。
    return '（下面是你最近在几个群里经历过的片段，属于你自己的见闻 —— **不是主人发给你的消息**，别当成主人在跟你说话。'
      + '主人提到群里的事时，就像回忆自己白天的经历一样接着说下去，不用特意说「我看到了」「我知道了」；'
      + '群里的私事也别主动往外讲。想知道某个具体群的情况，就看你记得的那个群。）\n'
      + blocks.join('\n\n') + '\n【以上是最近群里的情况】'
  }

  /**
   * 这一轮聊到的事相关的记忆（#79）：内容随每条消息变化，所以由模块在「交给她的内容」里附上，
   * 不放进每轮都会追加的运行时上下文快照。最多 6 条、总长 ≤ 500 字（多了挤占聊天本身的篇幅）。
   */
  function recallHint(chat, queryText, prevText = '') {
    const cfg = getConfig().memory
    if (!cfg.enabled) return ''
    const q = String(queryText || '').trim()
    if (!q) return ''
    const backdrop = groupBackdrop(chat, q)
    const recent = recentEvents()
    const shown = new Set(recent.map((m) => m.id))
    const about = chat && chat.kind === 'private' ? chat.userId : undefined
    // 上一句一直当线索带着：「然后呢」「那个呢」靠它接上，说到一半换了话题也不至于断
    const ctxText = String(prevText || '').slice(-300)
    // 条数不写死：命中得多就多给两条，寒暄就少给，别硬塞
    const maxN = Math.min(20, Math.max(1, Number(cfg.recallMax) || 8))
    const minN = Math.min(maxN, Math.max(1, Number(cfg.recallMin) || 3))
    const range = cfg.timeBoost === false ? null : timeWindow(q)
    const strict = cfg.strictValid !== false
    let found = recall(q, { about, where: (chat && chat.chatId) || '', context: ctxText, limit: maxN, range, includeExpired: !strict }).filter((h) => !shown.has(h.it.id))
    // 只算「还有效的」时一条都没有：把以前的说法也翻出来，但标清楚是旧的
    if (!found.length) found = recall(q, { about, where: (chat && chat.chatId) || '', context: ctxText, limit: maxN, range, includeExpired: true, includeInvalid: true }).filter((h) => !shown.has(h.it.id))
    const strong = found.filter((h) => h.score >= 0.5).length
    const keep = Math.min(maxN, Math.max(minN, Math.ceil(strong * 1.5)))
    const hits = found.slice(0, keep)
    if (!hits.length) return backdrop
    const cap = Math.max(100, Number(cfg.recallMaxChars) || 500)
    let body = hits.map((h) => memoryLine(h.it)).join('；')
    if (body.length > cap) body = body.slice(0, cap) + '…'
    return ['（你记得这些事，方括号里是什么时候的事，聊到相关的就自然用上，别把老事当新事说，也别说「根据记忆」：' + body + '）', backdrop].filter(Boolean).join('\n')
  }

  /** 回顾：结合最近聊天和已有经验，更新这个人的相处经验（合并、提炼、最多 8 条，概括不琐碎）。 */
  async function reflect(chat, transcript) {
    const key = personKey(chat)
    if (!key) return 0
    const old = insightsOf(key)
    const oldStyle = styleOf(key)
    const who = chat.kind === 'group' ? '这个群' : '对方'
    const out = await askModel(dsh, {
      cfg: getConfig(),
      system: '你是「哈洛」，在回顾自己和' + who + '的相处。输出一个 JSON 对象 {"insights":[...],"style":[...]}。\n'
        + 'insights：「怎么相处更好」的经验。概括性的、可复用的相处之道（比如「他累的时候不想多聊，简单安慰就好」「喜欢被吐槽，不喜欢太正经」），不要记具体事件和事实细节；和已有经验重复的合并，过时或被证伪的删掉，不超过 8 条，每条不超过 30 字。\n'
        + 'style：' + who + '的说话方式，以及你和' + who + '聊天时可以自然贴近的地方（比如「消息很短，常一句话分几条发」「爱用“hhh”和“草”」「不爱用标点」「喜欢叠字」），只写说话的形式和习惯，不写内容；不超过 5 条，每条不超过 30 字。\n'
        + '只输出这个 JSON 对象。',
      text: `已有经验：\n${old.map((x) => '- ' + x.text).join('\n') || '（还没有）'}\n\n已记下的说话方式：\n${oldStyle.map((x) => '- ' + x).join('\n') || '（还没有）'}\n\n最近的聊天：\n${transcript}`,
      maxTokens: 1500,
      temperature: 0.3,
    })
    const { insights: rawIns, style: rawStyle } = parseReflection(out)
    if (rawStyle.length) setStyle(key, rawStyle)
    const arr = rawIns.map((t) => String(t).trim().slice(0, 40)).filter(Boolean).slice(0, 8)
    if (!arr.length) return 0
    const now = Date.now()
    setInsights(key, arr.map((text) => old.find((x) => x.text === text) || { id: randomUUID().slice(0, 8), text, at: now }), chat.nickname || chat.groupId || '')
    log.info(`更新了和 ${key} 相处的经验（${arr.length} 条）`)
    return arr.length
  }

  // ---------- 每日整理：临时记忆（各会话的聊天流水）→ 长期记忆 + 相处经验，整理完清空 ----------
  // 各个 DSH 会话自己的对话上下文不动；这里只处理插件记下的聊天流水。

  /** 从一段聊天里提炼长期记忆，并回顾相处经验。lines：[{who, text}] */
  async function extractLines(chatId, lines) {
    const talk = lines.filter((l) => l.text && !String(l.text).startsWith('【系统'))
    const isQzone = chatId === 'qzone'
    // 空间动态一条就可能有料；聊天至少要几句
    if (talk.filter((l) => l.who !== 'bot').length < (isQzone ? 1 : 3)) return { ok: false, message: '内容太少', added: 0, insights: 0 }
    // 带上 QQ 号，模型才能把事记到人头上（群聊、空间里说话的人很多）
    const line = (l) => (l.who === 'bot' ? '我' : l.uid ? `${l.who}(${l.uid})` : l.who) + '：' + l.text
    try {
      // 太长就分段，每段最多 80 行
      const chunks = []
      for (let i = 0; i < talk.length; i += 80) chunks.push(talk.slice(i, i + 80))
      let n = 0
      for (const part of chunks.slice(-3)) n += await extractFacts(chatId, part.map(line).join('\n'))
      log.info(`从 ${chatId} 的${isQzone ? '空间动态' : '聊天'}里提炼了 ${n} 条新记忆`)
      if (isQzone) return { ok: true, added: n, insights: 0 }
      // 顺便回顾一次相处经验（用全天的聊天，最多最近 120 行）
      let ins = 0
      try {
        const [kind, id] = chatId.split(':')
        const chat = kind === 'group' ? { kind, groupId: id, nickname: '' } : { kind: 'private', userId: id, nickname: talk.filter((l) => l.who !== 'bot').at(-1)?.who || '' }
        ins = await reflect(chat, talk.slice(-120).map((l) => `${l.who === 'bot' ? '我' : l.who}：${l.text}`).join('\n'))
      } catch (error) {
        log.warn('回顾相处经验失败：', error.message)
      }
      return { ok: true, added: n, insights: ins }
    } catch (error) {
      log.warn('提炼记忆失败：', error.message)
      return { ok: false, message: error.message, added: 0, insights: 0 }
    }
  }

  /** 这段聊天相关的旧记忆：关于在场的人的 + 和内容相关的，最多 15 条，给模型比对用。 */
  function relatedTo(chatId, transcript) {
    const ppl = new Set([...String(transcript).matchAll(/\((\d{5,})\)/g)].map((m) => m[1]))
    if (chatId.startsWith('private:')) ppl.add(chatId.slice(8))
    const items = load().items.filter((m) => !m.invalidAt && m.source !== 'event' && m.source !== 'diary')
    const out = items.filter((m) => m.about && ppl.has(String(m.about))).sort((a, b) => b.at - a.at).slice(0, 20)
    for (const h of search(index(), String(transcript).slice(-1500), { limit: 10, minScore: 0.5 })) {
      if (out.length >= 30) break
      if (!out.some((m) => m.id === h.it.id) && h.it.source !== 'event' && h.it.source !== 'diary') out.push(h.it)
    }
    return out
  }

  async function extractFacts(chatId, transcript) {
    const cfg = getConfig()
    const source = chatId === 'qzone' ? '下面是 QQ 空间里的动态（好友发的说说、别人给你的评论、你的回复）' : '下面是一段聊天'
    const related = relatedTo(chatId, transcript)
    const known = new Map(related.map((m) => [m.id, m]))
    const out = await askModel(dsh, {
      cfg,
      system: `你帮一个叫「哈洛」的聊天角色整理长期记忆。${source}，说话人后面括号里是 QQ 号。挑出以后值得记住的事实：别人的名字/称呼、喜好、讨厌的东西、身份、近况和重要经历、约定、你们之间的关系变化。不要记寒暄、日常琐事、一次性的问答；不要记哈洛自己的人设和喜好（她本来就知道），只记关于别人、以及你们之间的事。每条一句话，主语写清楚是谁。只写能从对话里核实的事，别写你的推测、感受和评价；同一个意思不要拆成好几条写；「已经记得的事」里已经有、没有新信息的，不要换个说法再写一遍。QQ 号是 ${cfg.ownerQQ} 的人是她的${cfg.ownerName || '主人'}。` +
        (related.length ? '\n每条新事实先和「已经记得的事」比一比：全新的写 "op":"add"；是对某条旧记忆的补充或更准确的说法，写 "op":"update"、"id" 填那条的编号、"text" 写合并后的完整说法；和某条旧记忆矛盾、说明那条已经过时（比如以前喜欢现在不喜欢了、换了工作、搬家了、分手了），写 "op":"outdated"、"id" 填旧的编号、"text" 写现在的新事实。拿不准是不是矛盾就当 add；已经记得、没有新信息的不要输出。' : '') +
        `每条再带三个字段：kind 是类型，只能是 fact（客观事实）/preference（喜欢讨厌、口味习惯）/plan（约定、打算）/event（发生过的经历）/relation（关系、称呼）；when 是这件事「什么时候开始」的显式说法（昨天、上周、三个月前、去年…），没有就不写；confidence 是你对这条的把握，0~1。` +
        `只输出 JSON 数组，例如 [{"op":"add","text":"小明喜欢吃辣","about":"小明","about_qq":"12345","importance":0.6,"kind":"preference","when":"上个月","confidence":0.8}]（about_qq 写这件事是关于谁的 QQ 号，不知道就不写），没有值得记的就输出 []；整段都没营养时输出 [{"op":"drop"}]。`,
      text: (related.length ? `已经记得的事：\n${related.map((m) => `#${m.id} [${whenText(m.at)}]${m.kind ? '[' + (KIND_LABEL[m.kind] || m.kind) + ']' : ''} ${m.aboutName ? '[' + m.aboutName + '] ' : ''}${m.text}${m.validTo && m.validTo < Date.now() ? '（已过时）' : ''}`).join('\n')}\n\n` : '') + transcript,
      maxTokens: 1500,
      temperature: 0.2,
    })
    const m = out.match(/\[[\s\S]*\]/)
    const arr = m ? JSON.parse(m[0]) : []
    let n = 0
    for (const x of arr.slice(0, 20)) {
      if (!x || !x.text) continue
      const xKind = KINDS.includes(String(x.kind || '')) ? String(x.kind) : classifyKind(x.text)
      const xFrom = String(x.when || '').trim() ? parseWhen(String(x.when), Date.now()) : null
      if (/^(我|哈洛)/.test(String(x.about || '')) || String(x.about || '') === '哈洛') continue
      // 关于谁：模型给了 QQ 号就用（群聊、空间里也能记到人头上），私聊默认是对方
      const qq = String(x.about_qq ?? '').replace(/\D/g, '')
      const about = qq.length >= 5 && qq !== String(cfg.botQQ) ? qq : chatId.startsWith('private:') ? chatId.slice(8) : ''
      const op = String(x.op || 'add')
      if (op === 'drop') continue
      const target = known.get(String(x.id || '').replace(/^#/, ''))
      // 补充旧的（你在面板里亲手写的不改写）
      if (op === 'update' && target && target.source !== 'panel') {
        if (revise(target.id, x.text, x.importance)) n++
        continue
      }
      // 旧的过时了：先标过时（这样新的不会被当成重复合并进去），再记新的
      if (op === 'outdated' && target) {
        supersede(target.id)
        const r = add({ text: x.text, aboutName: x.about || target.aboutName || '', about: about || target.about || '', importance: x.importance ?? target.importance ?? 0.5, source: 'auto', chatId, kind: xKind, validFrom: xFrom || 0, confidence: x.confidence })
        if (r.id || r.updated) {
          invalidate(target.id, r.id || r.updated)
          log.info(`记忆更新：「${target.text}」过时了 → 「${String(x.text).slice(0, 60)}」`)
          n++
        }
        continue
      }
      const r = add({ text: x.text, aboutName: x.about || '', about, importance: x.importance ?? 0.5, source: 'auto', chatId, kind: xKind, validFrom: xFrom || 0, confidence: x.confidence })
      if (r.ok && r.id) n++
    }
    return n
  }

  /** 一天的印象：把这一天和别人聊的事写成两三句话，以后问「那天」时能想起来。 */
  async function makeEpisode(day, spoken) {
    const cfg = getConfig()
    const s0 = load()
    if (s0.items.some((m) => m.source === 'episode' && String(m.day || '') === day)) return 0
    const out = await askModel(dsh, {
      cfg,
      system: '你是「哈洛」。下面是你这一天和别人的聊天。用你自己的口吻写两三句话，当作你对这一天的印象：今天和谁聊了些什么、气氛怎么样、有没有值得记住的事。不超过 120 字；不要分点、不要复述原话、不要写日期。只输出这几句话本身。',
      text: String(spoken).slice(0, 6000),
      maxTokens: 220,
      temperature: 0.6,
    })
    const t = cleanEpisode(out)
    if (!t) return 0
    const r = add({ text: t, importance: 0.7, source: 'episode', day })
    return r.ok ? 1 : 0
  }

  const dayKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  let busy = false

  /**
   * 整理临时记忆。
   * @param {{includeToday?:boolean}} o includeToday：连今天的也提炼（手动整理时），但今天的流水不删（写日记还要用）
   */
  async function consolidate(o = {}) {
    if (busy) return { ok: false, message: '正在整理中' }
    busy = true
    const today = dayKey()
    const startedAt = Date.now()
    let added = 0
    let insights = 0
    let days = 0
    let profiles = 0
    let episodes = 0
    try {
      for (const day of hub.chatLogDays()) {
        if (day > today || (day === today && !o.includeToday)) continue
        // 同一天整理过一部分的（比如下午那次），只处理之后新增的聊天
        const done = (load().processed || {})[day] || 0
        const all = hub.chatLogOf(day)
        const byChat = new Map()
        for (const l of all.slice(done)) {
          if (String(l.chatId).startsWith('system:')) continue
          if (!byChat.has(l.chatId)) byChat.set(l.chatId, [])
          byChat.get(l.chatId).push(l)
        }
        for (const [chatId, lines] of byChat) {
          const r = await extractLines(chatId, lines)
          added += r.added || 0
          insights += r.insights ? 1 : 0
        }
        // 一天的印象只在「已经过完的那天」写，今天的留到明天
        if (byChat.size && day < today) {
          try {
            const spoken = [...byChat.values()].flat().map((l) => `${l.who || '某人'}：${l.text || ''}`).join('\n')
            episodes += await makeEpisode(day, spoken)
          } catch (error) {
            log.warn('写一天的印象失败：', error.message)
          }
        }
        const s = load()
        s.processed = s.processed || {}
        if (day < today) {
          // 整理完不删原文：搬进 chatlog-archive/，留 60 天，随时能翻（今天的留着，写日记还要用）
          if (archiveChatLog(day)) pruneArchive()
          delete s.processed[day]
        } else {
          s.processed[day] = all.length
        }
        save(s)
        days++
      }
      if (days) await learnSelfStyle()
      // 这次记忆有变化的人，重写人物小档案（每次最多 8 个人）
      const live = load()
      const touched = [...new Set(live.items.filter((m) => m.about && (m.at >= startedAt || (m.invalidAt || 0) >= startedAt)).map((m) => String(m.about)))]
      // 还没有小档案、但已经记了不少事的人也补上（刚升级时一次补几个，按记得的多少排）
      const count = new Map()
      for (const m of live.items) if (m.about && !m.invalidAt) count.set(String(m.about), (count.get(String(m.about)) || 0) + 1)
      const missing = [...count].filter(([qq, n]) => n >= 3 && !(live.profiles || {})[qq] && !touched.includes(qq)).sort((x, y) => y[1] - x[1]).map(([qq]) => qq)
      for (const qq of [...touched, ...missing].slice(0, 8)) {
        try { if (await buildProfile(qq)) profiles++ } catch (error) { log.warn('写人物小档案失败：', error.message) }
      }
      const s = load()
      // 遗忘：不重要、很久没被想起的自动记忆清掉，记忆库不会越堆越乱
      const before = s.items.length
      s.items = s.items.filter((m) => !shouldForget(m))
      const forgot = before - s.items.length
      s.lastConsolidate = { day: today, at: Date.now(), added, insights, days, forgot, profiles, episodes }
      save(s)
      log.info(`整理临时记忆：处理了 ${days} 天，新增或更新 ${added} 条长期记忆，写了 ${episodes} 天的印象，更新了 ${insights} 份相处经验、${profiles} 份人物小档案${forgot ? `，忘掉 ${forgot} 条不重要的旧记忆` : ''}`)
      return { ok: true, added, insights, days, forgot, profiles, episodes, message: `整理好了：新增或更新 ${added} 条记忆${episodes ? `、${episodes} 天的印象` : ''}，更新 ${insights} 份相处经验、${profiles} 份人物小档案${forgot ? `，忘掉 ${forgot} 条旧的` : ''}` }
    } catch (error) {
      log.warn('整理临时记忆失败：', error.message)
      return { ok: false, message: error.message }
    } finally {
      busy = false
    }
  }

  /** 从各人的说话方式里，沉淀出几条她自己不知不觉学会的说法（很少、很淡）。 */
  async function learnSelfStyle() {
    const s = load()
    const pool = Object.entries(s.styles || {}).filter(([k]) => k !== 'self').flatMap(([, v]) => v)
    if (pool.length < 3) return
    try {
      const out = await askModel(dsh, {
        cfg: getConfig(),
        system: '你是「哈洛」。下面是你和不同的人聊天时注意到的说话习惯，以及你自己已经养成的说法。挑出你和大家聊久了、自然会被带上的说话方式（口头禅、语气词、发消息的节奏），保持你原本的性格，不超过 6 条，每条不超过 20 字。只输出 JSON 数组。',
        text: `已经养成的：\n${styleOf('self').map((x) => '- ' + x).join('\n') || '（还没有）'}\n\n大家的说话习惯：\n${pool.map((x) => '- ' + x).join('\n')}`,
        maxTokens: 800,
        temperature: 0.3,
      })
      const m = out.match(/\[[\s\S]*\]/)
      const arr = m ? JSON.parse(m[0]).map((t) => String(typeof t === 'string' ? t : t?.text || '')) : []
      if (arr.length) setStyle('self', arr)
    } catch (error) {
      log.warn('沉淀说话方式失败：', error.message)
    }
  }

  /** 每分钟调一次：一天几个整理时间点（默认 04:00 / 16:00），到点且这个点今天还没跑过就整理。 */
  async function tick() {
    try { flushHits() } catch (error) {}
    const cfg = getConfig().memory
    if (!cfg.enabled || !cfg.dailyConsolidate) {
      const cutoff = dayKey(new Date(Date.now() - 14 * 86400_000))
      for (const day of hub.chatLogDays?.() || []) if (day < cutoff) hub.deleteChatLog(day)
      return
    }
    const s = load()
    const today = dayKey()
    const now = new Date()
    const mins = now.getHours() * 60 + now.getMinutes()
    const runs = s.runs || {}
    const due = (cfg.consolidateTimes || []).filter((t) => {
      const [hh, mm] = String(t).split(':').map(Number)
      return mins >= hh * 60 + mm && runs[t] !== today
    })
    if (!due.length) return
    // 连今天到目前为止的聊天一起提炼；记着整理到第几行，下一次只处理新的
    const r = await consolidate({ includeToday: true })
    if (r.ok) {
      const s2 = load()
      s2.runs = { ...(s2.runs || {}) }
      for (const t of due) s2.runs[t] = today
      save(s2)
    }
  }

  /** 群聊话题和记忆库有多相关（0~1），给插话判断用。 */
  function topicScore(text) {
    const hits = search(index(), text, { limit: 1, minScore: 0.01 })
    return hits.length ? Math.min(1, hits[0].score / 3) : 0
  }

  return {
    recallHint,
    add, addEvent, recentEvents, update, remove, restore, recall, contextFor, consolidate, tick, topicScore, importCandidates, importCommit,
    searchHistory, archiveChatLog, pruneArchive, historyStats, supersede, flushHits,
    profiles: () => { const s = load(); return Object.entries(s.profiles || {}).map(([qq, p]) => ({ qq, ...p })).sort((a, b) => b.at - a.at) },
    setProfile, buildProfile, people,
    recalls: () => recallLog.slice(),
    styles: () => load().styles || {},
    setStyle: (key, list) => setStyle(key, (list || []).map(String)),
    lastConsolidate: () => load().lastConsolidate || null,
    insights: () => {
      const s = load()
      return Object.entries(s.insights || {}).map(([key, list]) => ({ key, name: (s.insightNames || {})[key] || '', list }))
    },
    setInsights: (key, list) => setInsights(key, list.map((x) => (typeof x === 'string' ? { id: randomUUID().slice(0, 8), text: x, at: Date.now() } : x))),
    list: (q) => {
      const items = load().items
      // 面板里过时的也列出来（排在后面），能看到被哪条取代、能恢复
      const textOf = new Map(items.map((m) => [m.id, m.text]))
      const withBy = (m) => (m.supersededBy ? { ...m, supersededText: textOf.get(m.supersededBy) || '' } : m)
      if (!q) return items.slice().sort((a, b) => (Boolean(a.invalidAt) - Boolean(b.invalidAt)) || b.at - a.at).map(withBy)
      return search(index(), q, { limit: 100, minScore: 0.01, includeInvalid: true }).map((h) => withBy({ ...h.it, score: Number(h.score.toFixed(2)) }))
    },
    stats: () => {
      const items = load().items
      const live = items.filter((m) => !m.invalidAt)
      return { count: live.length, auto: live.filter((m) => m.source === 'auto').length, events: live.filter((m) => m.source === 'event').length, outdated: items.length - live.length }
    },
  }
}
