// 小红书站点适配层：数据全从页面里的 window.__INITIAL_STATE__ 读（不碰接口签名），
// 写操作（点赞 / 收藏 / 评论）用真鼠标点，点完再读页面状态确认。
// ⚠️ 小红书改版时，先看这里的 SELECTORS 和字段名：全站只在这一处维护。

import { setTimeout as sleep } from 'node:timers/promises'

export const HOME = 'https://www.xiaohongshu.com/explore'
export const noteLink = (id, token) =>
  `https://www.xiaohongshu.com/explore/${id}${token ? `?xsec_token=${encodeURIComponent(token)}&xsec_source=pc_feed` : ''}`
export const searchUrl = (kw) =>
  `https://www.xiaohongshu.com/search_result?${new URLSearchParams({ keyword: String(kw || ''), source: 'web_explore_feed' })}`

export const SELECTORS = {
  like: ['.interact-container .like-wrapper', '[class*="like-wrapper"] .like-love', '.like-wrapper'],
  collect: ['.interact-container .collect-wrapper', '[class*="collect-wrapper"]'],
  editor: ['#content-textarea', '.input-box [contenteditable="true"]', '[contenteditable="true"]'],
  submit: ['#submit', '.input-box .submit', '.input-box .btn.submit', '.submit'],
}

const str = (v) => (v === null || v === undefined ? '' : String(v))
const num = (v) => { const n = Number(String(v ?? '').replace(/[^\d.]/g, '')); return Number.isFinite(n) ? n : 0 }
const clip = (t, max) => [...str(t).replace(/\s+/g, ' ').trim()].slice(0, max).join('')
const countOf = (v) => (typeof v === 'number' ? v : num(v))

/** 一条 feed 列表项（首页 / 搜索同形）。 */
export function normalizeFeed(raw) {
  const card = raw?.noteCard || raw?.note_card || {}
  const info = card?.interactInfo || card?.interact_info || {}
  return {
    id: str(raw?.id || raw?.noteId || card?.noteId || raw?.note_id),
    xsecToken: str(raw?.xsecToken || raw?.xsec_token),
    title: clip(card?.displayTitle || card?.display_title || card?.title || '', 80),
    author: str(card?.user?.nickname || ''),
    liked: countOf(info?.likedCount ?? info?.liked_count),
    video: String(card?.type || '') === 'video',
    cover: str(card?.cover?.urlDefault || ''),
    duration: num(card?.video?.duration),
  }
}

/** 详情页 noteDetailMap[id] → 干净的笔记。 */
export function normalizeNote(detail) {
  const note = detail?.note || detail || {}
  const info = note?.interactInfo || note?.interact_info || {}
  const images = (note?.imageList || note?.image_list || []).map((x) => str(x?.urlDefault || x?.url_default || x?.url)).filter(Boolean)
  const desc = str(note?.desc)
  return {
    id: str(note?.noteId || note?.note_id || detail?.id),
    title: clip(note?.title || str(desc).split(/[\n。！？]/)[0], 120), // 视频笔记有时标题是空的，退回正文第一句
    desc,
    tags: [...desc.matchAll(/#([^#\[\]\n]{1,20})\[话题\]#/g)].map((m) => m[1]),
    type: str(note?.type || 'normal'),
    at: num(note?.time),
    ip: str(note?.ipLocation || ''),
    author: str(note?.user?.nickname || ''),
    liked: countOf(info?.likedCount ?? info?.liked_count),
    collected: countOf(info?.collectedCount ?? info?.collected_count),
    commentCount: countOf(info?.commentCount ?? info?.comment_count),
    likedByMe: Boolean(info?.liked),
    collectedByMe: Boolean(info?.collected),
    images,
    video: str(note?.type) === 'video',
  }
}

/** 首屏评论（含作者回复）。 */
export function parseComments(detail, max = 10) {
  const list = detail?.comments?.list || detail?.comments?.comments || []
  const out = []
  for (const c of list) {
    const text = clip(c?.content || '', 120)
    if (!text) continue
    out.push({ id: str(c?.id), user: str(c?.userInfo?.nickname || c?.user_info?.nickname || ''), text, like: countOf(c?.likeCount ?? c?.like_count) })
    for (const sub of c?.subComments || c?.sub_comments || []) {
      const t = clip(sub?.content || '', 120)
      if (t) out.push({ id: str(sub?.id), user: str(sub?.userInfo?.nickname || sub?.user_info?.nickname || ''), text: t, like: countOf(sub?.likeCount), reply: true })
      if (out.length >= max) break
    }
    if (out.length >= max) break
  }
  return out.slice(0, max)
}

/** 给模型看的一段：标题 / 作者 / 数据 / 正文 / 话题 / 评论。 */
export function digestOf(note, comments = []) {
  const when = note.at ? new Date(note.at).toISOString().slice(0, 10) : ''
  return [
    `《${note.title || '(无标题)'}》 作者：${note.author || '?'} · ${note.type === 'video' ? '视频' : '图文'}`,
    `点赞 ${note.liked} · 收藏 ${note.collected} · 评论 ${note.commentCount}${when ? ` · 发布 ${when}` : ''}${note.ip ? ` · ${note.ip}` : ''}`,
    (note.tags || []).length ? `话题：${(note.tags || []).join(' / ')}` : '',
    `正文：${clip(note.desc, 900)}`,
    comments.length ? `热评：\n${comments.slice(0, 8).map((c) => `- ${c.user ? c.user + '：' : ''}${c.text}（赞 ${c.like}）`).join('\n')}` : '',
  ].filter(Boolean).join('\n')
}

/** 看着像广告 / 推销 / 引流的帖子：这类不学、不评论、不分享（点赞也跳过，免得越刷越多）。 */
const AD_WORDS = /(广告|推广|赞助|合作款|品牌合作|带货|植入|商务合作|优惠券|领券|团购|拼团|秒杀|限时|包邮|折扣|下单|购买|链接在评论区|链接看评论|点进链接|加V|加vx|加微|私信我|私信领|代购|微商|招募|接单|代理|返利|佣金|小红书店铺|店铺链接|戳链接|评论区链接)/
export function looksLikeAd(note = {}) {
  const n = note || {}
  if (n.adInfo || n.promotion || n.isAd === true || n.commercial === true) return true
  const text = [n.title, n.desc, ...(n.tags || [])].filter(Boolean).join(' ')
  return AD_WORDS.test(text)
}

/** 评论里可以引用的具体词。 */
export function anchorWords({ title = '', desc = '', comments = [] }) {
  const out = new Set()
  const push = (s) => {
    for (const part of str(s).split(/[，。！？!?…；;、\s:："“”‘’()（）[\]【】]+/)) {
      const w = part.replace(/^#|\[话题\]#$/g, '').trim()
      if (w.length >= 2 && w.length <= 12) out.add(w)
    }
  }
  push(title)
  push(clip(desc, 400))
  for (const c of comments.slice(0, 8)) push(c.text)
  // 中文没空格，长词匹配不到短评论：再补 2~3 字滑窗（只留前 200 个，够用又不至于太泛）
  for (const w of [...out]) {
    for (let n = 2; n <= 3; n++) {
      for (let i = 0; i + n <= w.length; i++) out.add(w.slice(i, i + n))
    }
  }
  return [...out].slice(0, 200)
}

export const anchorHit = (text, anchors) => anchors.some((w) => str(text).includes(w))

/** 站点会话：所有动作都通过 browser（core/cdp.js）完成。 */
export function createSite({ browser, log }) {
  const read = async (expr, ms = 15000) => {
    const out = await browser.evaluate(`(() => { ${expr} })()`, ms)
    return typeof out === 'string' || typeof out === 'number' || typeof out === 'boolean' ? String(out) : ''
  }
  const json = async (expr) => {
    const raw = await read(expr)
    if (!raw) return null
    try { return JSON.parse(raw) } catch (error) { return null }
  }
  const WAIT = {
    // 只判「存在」不够：跳转后 ref 立刻就有，但里面还是空的，要等真的有内容
    home: `const s=window.__INITIAL_STATE__; const d=s&&s.feed&&s.feed.feeds; const v=d?(d.value!==undefined?d.value:d._value):null; return !!(v && v.length)`,
    search: `const s=window.__INITIAL_STATE__; const d=s&&s.search&&s.search.feeds; const v=d?(d.value!==undefined?d.value:d._value):null; return !!(v && v.length)`,
    note: `const s=window.__INITIAL_STATE__; const m=s&&s.note&&s.note.noteDetailMap; if(!m) return false; const v=m.value!==undefined?m.value:(m._value!==undefined?m._value:m); return !!(v && Object.keys(v).length)`,
  }
  async function waitState(kind, ms = 25000) {
    const deadline = Date.now() + ms
    while (Date.now() < deadline) {
      if ((await read(WAIT[kind])) === 'true') return true
      await sleep(600)
    }
    log?.warn?.(`小红书等 ${kind} 数据超时（可能没登录或被拦）`)
    return false
  }

  const UN = "const un=(x)=>{let v=x;for(let i=0;i<4&&v&&typeof v==='object'&&!Array.isArray(v);i++){if('value'in v&&v.value!==undefined)v=v.value;else if('_value'in v&&v._value!==undefined)v=v._value;else break}return v};"
  const FEEDS = {
    home: `${UN} const s=window.__INITIAL_STATE__; const f=s&&s.feed&&s.feed.feeds; if(!f) return ''; const d=un(f); return Array.isArray(d)?JSON.stringify(d):''`,
    search: `${UN} const s=window.__INITIAL_STATE__; const f=s&&s.search&&s.search.feeds; if(!f) return ''; const d=un(f); return Array.isArray(d)?JSON.stringify(d):''`,
  }
  async function feedsFrom(kind) {
    const raw = await read(FEEDS[kind])
    if (!raw) return []
    try {
      const list = JSON.parse(raw)
      return Array.isArray(list) ? list.map(normalizeFeed).filter((x) => x.id) : []
    } catch (error) {
      log?.warn?.(`小红书列表解析失败：${error.message}`)
      return []
    }
  }

  async function ensure() {
    // 先把浏览器打开 / 连上，没连上时 evaluate 会报「浏览器没连上」
    const r = await browser.open()
    if (!r || r.ok === false) return r || { ok: false, message: '浏览器没打开' }
    const url = str(await browser.evaluate('location.href').catch(() => ''))
    if (!url.includes('xiaohongshu.com')) {
      await browser.goto(HOME, 12000)
      await waitState('home')
    }
    return { ok: true }
  }

  async function account() {
    await ensure()
    const out = await json(`const s=window.__INITIAL_STATE__; const u=s&&s.user&&s.user.userInfo; const v=u&&(u.value||u._value||u); if(!v||!v.nickname) return ''; return JSON.stringify({nickname:v.nickname,userId:v.userId||v.user_id||''})`)
    return out && out.nickname ? out : null
  }

  async function feed() {
    await ensure()
    const url = str(await browser.evaluate('location.href').catch(() => ''))
    if (!/xiaohongshu\.com\/explore\/?$/.test(url)) await browser.goto(HOME, 12000)
    if (!(await waitState('home'))) return []
    return feedsFrom('home')
  }

  async function search(keyword) {
    if (!str(keyword).trim()) return []
    await browser.goto(searchUrl(keyword), 12000)
    if (!(await waitState('search'))) return []
    return feedsFrom('search')
  }

  async function detail(id, token) {
    await browser.goto(noteLink(id, token), 12000)
    if (!(await waitState('note'))) return null
    const raw = await json(`${UN} const s=window.__INITIAL_STATE__; const n=s&&s.note; const m=un(n&&n.noteDetailMap); if(!m) return ''; const k=Object.keys(m); const d=m[${JSON.stringify(String(id))}]||(k.length===1?m[k[0]]:null); return d?JSON.stringify(d):''`)
    if (!raw) return null
    return { note: normalizeNote(raw), comments: parseComments(raw, 10) }
  }

  async function press(selectors, timeout = 4000) {
    for (const sel of selectors) {
      try {
        await browser.waitFor(sel, timeout)
        await browser.press(sel)
        return true
      } catch (error) { /* 换下一个 */ }
    }
    return false
  }

  const NOTE_STATE = (key) => `const un=(x)=>{let v=x;for(let i=0;i<4&&v&&typeof v==='object'&&!Array.isArray(v);i++){if('value'in v&&v.value!==undefined)v=v.value;else if('_value'in v&&v._value!==undefined)v=v._value;else break}return v}; const s=window.__INITIAL_STATE__; const m=un(s&&s.note&&s.note.noteDetailMap); const k=m?Object.keys(m):[]; const d=m?(m[k[0]]):null; const i=d&&d.note&&d.note.interactInfo; return i?JSON.stringify({${key}:!!i.${key}}):''`

  async function like() {
    if (!(await press(SELECTORS.like))) return { ok: false, message: '页面上没找到点赞按钮' }
    await sleep(1200)
    const raw = await json(NOTE_STATE('liked'))
    return raw?.liked ? { ok: true } : { ok: false, message: '点了赞但页面没确认' }
  }

  async function collect() {
    if (!(await press(SELECTORS.collect))) return { ok: false, message: '页面上没找到收藏按钮' }
    await sleep(1000)
    const raw = await json(NOTE_STATE('collected'))
    return raw?.collected ? { ok: true } : { ok: false, message: '点了收藏但页面没确认' }
  }

  async function comment(text) {
    const body = clip(text, 200)
    if (!body) return { ok: false, message: '评论是空的' }
    let focused = false
    for (const sel of SELECTORS.editor) {
      try {
        await browser.waitFor(sel, 4000)
        await browser.press(sel)
        focused = true
        break
      } catch (error) { /* 换下一个 */ }
    }
    if (!focused) return { ok: false, message: '没找到评论输入框' }
    await sleep(300)
    await browser.type(body)
    await sleep(500)
    if (!(await press(SELECTORS.submit, 4000))) return { ok: false, message: '没找到发送按钮' }
    await sleep(2500)
    const has = await browser.evaluate(`document.body.innerText.includes(${JSON.stringify(body.slice(0, 20))})`)
    if (has === true || has === 'true') return { ok: true, confirmed: true }
    log?.info?.('小红书评论发出去了，但首屏没看到（可能要审核）')
    return { ok: true, confirmed: false, message: '发出去了，首屏还没看到，可能在审核' }
  }

  /** 收尾：回到小红书首页（不是空白页），再把窗口收起来。 */
  async function rest() {
    let back = false
    try { back = (await browser.goto(HOME, 12000)) !== false } catch (error) { /* 用下面兜底 */ }
    if (!back) {
      try { await browser.evaluate('location.href = "https://www.xiaohongshu.com/explore"') } catch (error) { /* 回不去就算了 */ }
    }
    return back
  }

  return { ensure, account, feed, search, detail, like, collect, comment, rest, show: (v) => browser.show?.(v), close: () => browser.close() }
}
