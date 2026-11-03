// 刷小红书：定时打开首页 / 搜索，一篇篇点开看图文，读正文、话题和热评，
// 再按她的人格决定点不点赞、要不要评论、要不要分享给主人，以及**学到了什么**。
// 学到的东西分两处：一条进记忆（聊天时能想起来），一条进小红书知识库（面板能看、按话题聚合）。
// 点赞 / 评论都按笔记 id 在详情页点，点完读页面状态确认；遇到验证码当天停手。

import { dataDir, readJson, writeJson } from '../core/store.js'
import { isSilence } from '../chat/reply.js'
import { createBrowser } from '../core/cdp.js'
import { createSite, digestOf, anchorWords, anchorHit, noteLink, looksLikeAd } from './site.js'

const dayKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const between = (lo, hi) => Math.floor(lo + Math.random() * (Math.max(lo, hi) - lo + 1))
const clip = (t, max) => [...String(t ?? '').replace(/\s+/g, ' ').trim()].slice(0, max).join('')
const str = (v) => (v === null || v === undefined ? '' : String(v))
const STOP_RE = /验证|频繁|稍后再试|异常|限制|风控|登录/

/** 从模型输出里取 JSON。 */
export function pickJson(out, fallback) {
  const s = String(out || '')
  const m = s.match(/\[[\s\S]*\]/) || s.match(/\{[\s\S]*\}/)
  if (!m) return fallback
  try { return JSON.parse(m[0]) } catch (error) { return fallback }
}

/** 话题聚合：把新学到的条目并进知识库（按话题计数）。 */
export function mergeKnowledge(kb, item, now = Date.now()) {
  const next = { version: 1, topics: { ...(kb?.topics || {}) }, items: [...(kb?.items || [])] }
  for (const tag of item.tags || []) {
    const t = next.topics[tag] || { count: 0, lastAt: 0, notes: [], summary: '' }
    t.count += 1
    t.lastAt = now
    t.notes = [...new Set([item.noteId, ...(t.notes || [])])].slice(0, 12)
    if (item.take) t.summary = item.take
    next.topics[tag] = t
  }
  next.items.unshift({ at: now, ...item })
  next.items = next.items.slice(0, 400)
  return next
}

const emptyDay = () => ({ day: '', runs: 0, watched: 0, like: 0, comment: 0, share: 0 })
const emptyState = () => ({
  ...emptyDay(),
  version: 1,
  lastRun: 0, lastReview: 0, pauseDay: '', pauseReason: '',
  loginAt: 0, account: null,
  seen: [], history: [],
})

export function createXhs({ getConfig, hub, memory, log, site: injected, now = Date.now, wait } = {}) {
  const cfg = () => getConfig().xhs
  const sleep = wait || ((ms) => new Promise((r) => setTimeout(r, ms)))
  const site = injected || createSite({
    browser: createBrowser({ profileDir: dataDir('xhs', 'edge-profile'), browserPath: () => cfg().browserPath, log }),
    log,
  })
  const file = () => dataDir('xhs.json')
  const kbFile = () => dataDir('xhs-knowledge.json')
  const load = () => {
    const raw = readJson(file(), emptyState)
    const s = { ...emptyState(), ...(raw && raw.version === 1 ? raw : {}) }
    if (s.day !== dayKey(new Date(now()))) Object.assign(s, emptyDay(), { day: dayKey(new Date(now())) })
    return s
  }
  const save = (s) => writeJson(file(), s)
  const record = (s, item) => { s.history.unshift({ at: now(), ...item }); s.history = s.history.slice(0, 40) }
  const paused = (s) => s.pauseDay === dayKey(new Date(now()))
  let busy = false

  const pause = (s, why) => {
    s.pauseDay = dayKey(new Date(now()))
    s.pauseReason = why
    log?.warn?.(`小红书今天先不刷了：${why}`)
  }

  const think = (prompt) => hub.runSystemTurn('xhs', 'QQ · 刷小红书', `【刷小红书，不是聊天，这一轮不会发到聊天里】\n${prompt}`, { timeoutMs: 180000 })

  /** 今天还能写几次（点赞 / 评论 / 分享各有上限，总写入也有）。 */
  const left = (s, key) => {
    const cap = Number(cfg().caps?.[key]) || 0
    const max = Number(cfg().gate?.maxWritesPerDay) || 0
    const byCap = cap - Number(s[key] || 0)
    const byAll = max - Number(s.writes || 0)
    return Math.max(0, Math.min(byCap, byAll))
  }
  const canWrite = (s) => {
    const gap = (Number(cfg().gate?.minWriteGapSec) || 0) * 1000
    return !s.lastWriteAt || now() - s.lastWriteAt >= gap
  }

  async function login() {
    const opened = await site.ensure?.()
    if (opened && opened.ok === false) {
      log?.warn?.(`小红书浏览器没打开：${opened.message || ''}`)
      return null
    }
    // 登录要看得见窗口，不然没法扫码
    try { await site.show?.(true) } catch (error) { /* 有的窗口管理不给挪，忽略 */ }
    const acc = await site.account()
    const s = load()
    s.loginAt = acc ? now() : 0
    s.account = acc || null
    save(s)
    return acc
  }

  /** 挑关键词：面板填的 + 群兴趣 + 记忆里的事，让模型挑 2 个。 */
  async function keywords() {
    const base = [...(cfg().keywords || []), ...(getConfig().group?.interests || [])]
    let picked = base.filter(Boolean).slice(0, 2)
    try {
      const mem = (memory?.about?.(String(getConfig().ownerQQ || ''), { limit: 8 }) || []).map((m) => m.text).join('；')
      if (mem) {
        const out = await think(`她想刷小红书。她的兴趣：${base.slice(0, 10).join('、') || '（没填）'}。\n最近关于主人的事：${clip(mem, 300)}\n请挑 2 个适合搜小红书的关键词，只输出 JSON 数组，例如 ["家居收纳","梅雨季"]。`)
        const arr = pickJson(out, null)
        if (Array.isArray(arr) && arr.length) picked = arr.map((x) => clip(x, 20)).filter(Boolean).slice(0, 2)
      }
    } catch (error) {
      log?.debug?.(`小红书挑关键词失败，用面板里的：${error.message}`)
    }
    return picked.length ? picked : ['生活小技巧']
  }

  /** 一轮：挑帖 → 逐篇看 → 一次决策 → 按限额执行 → 沉淀。 */
  async function run({ force = false } = {}) {
    if (busy) return { ok: false, message: '正在刷，稍等' }
    const c = cfg()
    if (!c.enabled && !force) return { ok: false, message: '小红书还没开' }
    const s = load()
    if (paused(s)) return { ok: false, message: `今天先不刷了：${s.pauseReason}` }
    if (Number(s.runs) >= Number(c.maxRunsPerDay)) return { ok: false, message: '今天的轮数用完了' }
    busy = true
    const startedAt = now()
    try {
      const acc = await login()
      if (!acc) {
        pause(s, '小红书没登录（在面板扫码登录一次）')
        save(s)
        return { ok: false, message: '小红书没登录' }
      }
      const kws = await keywords()
      const want = Math.max(1, Number(c.perRun) || 4)
      const pool = []
      for (const kw of kws) {
        try {
          const list = await site.search(kw)
          pool.push(...list.slice(0, 6).map((x) => ({ ...x, from: kw })))
        } catch (error) { log?.warn?.(`小红书搜「${kw}」失败：${error.message}`) }
      }
      try { pool.push(...(await site.feed()).slice(0, 8).map((x) => ({ ...x, from: 'home' }))) } catch (error) { log?.warn?.(`小红书首页失败：${error.message}`) }

      const minLikes = Number(c.minLikes) || 0
      const seen = new Set(s.seen || [])
      const picked = []
      for (const item of pool) {
        if (picked.length >= want) break
        if (seen.has(item.id)) continue
        if (item.liked < minLikes) continue
        seen.add(item.id)
        picked.push(item)
      }
      log?.info?.(`小红书这轮候选 ${pool.length} 篇，按「没看过 + 点赞 ≥ ${minLikes}」挑中 ${picked.length} 篇`)
      if (!picked.length) {
        record(s, { kind: 'empty', note: '这一轮没挑到新的' })
        save(s)
        return { ok: true, watched: 0, message: '没挑到新的' }
      }

      const looked = []
      for (const item of picked) {
        try {
          const d = await site.detail(item.id, item.xsecToken)
          if (!d) { log?.warn?.(`小红书打开 ${item.id} 没拿到数据`); continue }
          looked.push({ ...d, feed: item })
          await sleep(between(Number(c.dwellMin) || 6, Number(c.dwellMax) || 25) * 1000)
        } catch (error) {
          log?.warn?.(`小红书看 ${item.id} 失败：${error.message}`)
          if (STOP_RE.test(error.message)) { pause(s, error.message); break }
        }
      }
      log?.info?.(`小红书打开成功 ${looked.length} 篇：${looked.map((x) => clip(x.note.title, 18)).join(' / ')}`)
      // 先把她「看过什么」落进记录，再谈反应——这样即使后面模型没回话，面板里也看得到她刷了什么
      for (const x of [...looked].reverse()) record(s, { kind: 'see', title: clip(x.note.title, 40), id: x.note.id || (x.feed && x.feed.id) || '' })
      save(s)
      if (!looked.length) { save(s); return { ok: false, message: '都没打开成功' } }

      const canLike = c.like !== false && left(s, 'like') > 0
      const canComment = c.comment === true && left(s, 'comment') > 0
      const canShare = c.shareToOwner !== false && left(s, 'share') > 0
      const body = looked.map((x, i) => `【${i}】\n${digestOf(x.note, x.comments)}`).join('\n\n')
      const prompt = [
        `你在刷小红书，看了 ${looked.length} 篇：`,
        body,
        '',
        '按你自己的人格给每篇一个反应，只输出 JSON 数组，元素：',
        '{ "i": 序号, "feeling": "一句心里话（可以很短，不想说话就写空的）",',
        '  "like": true/false, "take": "从这篇学到的一点（可复用的事实/方法，≤60 字；没学到就写空的）",',
        '  "tags": ["话题", "…"], "comment": "想在下面留的评论（≤40 字，必须基于这篇的具体内容，不想评就写空的）",',
        '  "share": "想发给主人的一句话（不想发就写空的）" }',
        `今天还能点赞 ${canLike ? left(s, 'like') : 0} 次、评论 ${canComment ? left(s, 'comment') : 0} 条、分享 ${canShare ? left(s, 'share') : 0} 次。`,
        '不是每篇都要有动作；拿不准就只留 feeling。',
      ].join('\n')
      let reply = ''
      try { reply = await think(prompt) } catch (error) {
        log?.warn?.(`小红书这一轮没想出来：${error.message}`)
        if (STOP_RE.test(error.message)) pause(s, error.message)
        if (/后台调用/.test(error.message)) record(s, { kind: 'budget', note: error.message })
      }
      const plan = pickJson(reply, [])
      log?.info?.(`小红书她的反应：${Array.isArray(plan) ? plan.length : 0} 条${Array.isArray(plan) && plan.length ? `（点赞 ${plan.filter((x) => x?.like).length}、评论 ${plan.filter((x) => str(x?.comment).trim()).length}、分享 ${plan.filter((x) => str(x?.share).trim()).length}、学到 ${plan.filter((x) => str(x?.take).trim()).length}）` : ''}`)
      const rows = Array.isArray(plan) ? plan : []
      if (!rows.length) record(s, { kind: 'empty', note: reply ? '这轮没给出反应' : '模型没回话' })
      let kb = readJson(kbFile(), () => ({ version: 1, topics: {}, items: [] }))

      for (const row of rows) {
        const idx = Number(row?.i)
        const item = looked[idx]
        if (!item) continue
        const { note } = item
        // 广告 / 推销 / 引流的帖子：不学、不评、不分享、也不点赞
        if (cfg().skipAds !== false && looksLikeAd(note)) {
          record(s, { kind: 'ad', id: note.id, title: note.title })
          continue
        }
        if (row.feeling && !isSilence(row.feeling)) {
          s.feeling = clip(row.feeling, 80)
          // 「看过」那行在打开时已经记过了，这里只把心里话补上去，避免一条笔记出现两行
          const seen = s.history.find((h) => h.kind === 'see' && h.id === note.id && h.at >= startedAt)
          if (seen) seen.feeling = clip(row.feeling, 80)
          else record(s, { kind: 'see', id: note.id, title: note.title, feeling: clip(row.feeling, 80) })
        }
        // 学到什么：一条进记忆，一条进知识库
        const take = clip(row.take || '', 80)
        const tags = (Array.isArray(row.tags) ? row.tags : []).map((t) => clip(t, 12)).filter(Boolean).slice(0, 4)
        if (c.learn !== false && take) {
          try {
            memory?.add?.({
              text: take,
              source: 'xhs',
              kind: 'fact',
              tags: ['小红书', ...tags],
              importance: 0.45,
              chatId: 'xhs',
            })
          } catch (error) { log?.debug?.(`小红书记忆写入失败：${error.message}`) }
          kb = mergeKnowledge(kb, { noteId: note.id, title: note.title, take, tags, link: noteLink(note.id) }, now())
          record(s, { kind: 'learn', id: note.id, title: note.title, take, tags })
        }
        // 点赞
        if (row.like && canLike && canWrite(s) && s.like < Number(cfg().caps?.like || 0)) {
          const r = await site.like().catch((error) => ({ ok: false, message: error.message }))
          if (r.ok) { s.like += 1; s.writes += 1; s.lastWriteAt = now(); record(s, { kind: 'like', id: note.id, title: note.title }) }
          else { log?.warn?.(`小红书点赞失败：${r.message}`); if (STOP_RE.test(r.message || '')) pause(s, r.message) }
        }
        // 评论（必须基于具体内容）
        const text = clip(row.comment || '', 200)
        if (text && canComment && canWrite(s) && s.comment < Number(cfg().caps?.comment || 0)) {
          const anchors = anchorWords({ title: note.title, desc: note.desc, comments: item.comments })
          if (!anchorHit(text, anchors)) {
            record(s, { kind: 'skip', id: note.id, why: '评论没提到这篇的具体内容' })
          } else {
            const r = await site.comment(text).catch((error) => ({ ok: false, message: error.message }))
            if (r.ok) {
              s.comment += 1; s.writes += 1; s.lastWriteAt = now()
              record(s, { kind: 'comment', id: note.id, title: note.title, text, confirmed: r.confirmed !== false })
            } else { log?.warn?.(`小红书评论失败：${r.message}`); if (STOP_RE.test(r.message || '')) pause(s, r.message) }
          }
        }
        // 分享给主人
        const share = clip(row.share || '', 200)
        if (share && canShare && s.share < Number(cfg().caps?.share || 0)) {
          const text2 = `${share}\n${noteLink(note.id, item.feed?.xsecToken)}`
          try {
            await hub.sendText(`private:${getConfig().ownerQQ}`, text2)
            s.share += 1
            record(s, { kind: 'share', id: note.id, title: note.title, text: share })
          } catch (error) { log?.warn?.(`小红书分享失败：${error.message}`) }
        }
      }

      s.runs += 1
      s.watched += looked.length
      s.lastRun = now()
      s.seen = [...seen].slice(-300)
      save(s)
      writeJson(kbFile(), kb)
      log?.info?.(`[xhs] 刷了一轮小红书：看了 ${looked.length} 篇，点赞 ${s.like}，评论 ${s.comment}，分享 ${s.share}`)
      return { ok: true, watched: looked.length, like: s.like, comment: s.comment, share: s.share }
    } catch (error) {
      log?.warn?.(`小红书这一轮失败：${error.message}`)
      const s2 = load()
      if (STOP_RE.test(error.message)) pause(s2, error.message)
      else record(s2, { kind: 'fail', note: clip(error.message, 120) })
      save(s2)
      return { ok: false, message: error.message }
    } finally {
      busy = false
      try {
        const home = await site.rest?.()
        log?.info?.(`小红书收尾：${home ? '已回到首页' : '回首页没成功'}`)
        if (cfg().hideAfterRun !== false) { try { await site.show?.(false) } catch (error) { /* 窗口管理器不给挪就算了 */ } }
      } catch (error) { log?.debug?.(`小红书收尾失败：${error.message}`) }
    }
  }

  /** 每周反刍：把最近学到的几条串成一段，写进记忆（默认关，面板可调频率）。 */
  async function review({ force = false } = {}) {
    const c = cfg()
    if (!c.review && !force) return { ok: false, message: '反刍没开' }
    const s = load()
    const everyMs = Math.max(1, Number(c.reviewEveryDays) || 7) * 86400_000
    if (!force && s.lastReview && now() - s.lastReview < everyMs) return { ok: false, message: '还没到反刍时间' }
    const kb = readJson(kbFile(), () => ({ version: 1, topics: {}, items: [] }))
    const items = (kb.items || []).filter((x) => x.take).slice(0, 12)
    if (items.length < 3) return { ok: false, message: '学到的东西还太少' }
    const prompt = `你最近在小红书上知道了这些：\n${items.map((x) => `- ${x.take}（${x.tags.join('、') || '杂'}）`).join('\n')}\n请用你自己的话把它们串成一小段（80~120 字），像在跟主人聊「我最近知道的事」，不要罗列、不要用「首先其次」。只输出这段话。`
    let out = ''
    try { out = clip(await think(prompt), 200) } catch (error) { return { ok: false, message: error.message } }
    if (!out || isSilence(out)) return { ok: false, message: '没想出来' }
    try {
      memory?.add?.({ text: out, source: 'xhs', kind: 'fact', tags: ['小红书', '最近知道的'], importance: 0.5, chatId: 'xhs' })
    } catch (error) { log?.debug?.(`反刍写记忆失败：${error.message}`) }
    s.lastReview = now()
    save(s)
    record(s, { kind: 'review', text: out })
    return { ok: true, text: out }
  }

  /** 每分钟看一眼：该刷就刷。 */
  async function tick() {
    const c = cfg()
    if (!c.enabled || !c.autoBrowse) return
    const s = load()
    if (paused(s)) return
    if (Number(s.runs) >= Number(c.maxRunsPerDay)) return
    const every = Math.max(1, Number(c.intervalHours) || 6) * 3600_000
    if (s.lastRun && now() - s.lastRun < every) return
    await run().catch(() => {})
  }

  function state() {
    const s = load()
    const kb = readJson(kbFile(), () => ({ version: 1, topics: {}, items: [] }))
    return {
      runs: s.runs, watched: s.watched, like: s.like, comment: s.comment, share: s.share,
      lastRun: s.lastRun, lastReview: s.lastReview,
      history: (s.history || []).slice(0, 20),
      login: s.account || null, loginAt: s.loginAt,
      paused: paused(s), pauseReason: s.pauseReason,
      knowledge: (kb.items || []).length,
      topics: Object.entries(kb.topics || {}).map(([name, t]) => ({ name, count: t.count, lastAt: t.lastAt, summary: t.summary || '' })).sort((a, b) => b.count - a.count).slice(0, 20),
    }
  }

  return { run, tick, review, state, login, load, save }
}
