// 表情库：偷表情（严格判定 + 尺寸兜底 + MD5 去重 + 每小时限额）→ 收藏到 QQ → 视觉模型起备注；
// 发送时按备注 / 标签模糊匹配。本地库：~/.dsh/plugins-data/halobot/stickers/

import { createHash } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync, mkdirSync, unlinkSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { dataDir, readJson, writeJson } from '../core/store.js'
import { imageSize, mimeOf, stickerSizeOk } from '../chat/inbound.js'
import { segmentBytes, fetchImage } from '../core/net.js'
import { askModel, canSeeImages } from '../core/llm.js'

const dir = () => dataDir('stickers')
const indexFile = () => join(dir(), 'index.json')
const ext = (mime) => ({ 'image/png': 'png', 'image/gif': 'gif', 'image/webp': 'webp' })[mime] || 'jpg'

export const DEFAULT_TAGS = ['开心', '卖萌', '生气', '委屈', '无语', '嘲讽', '疑惑', '早晚安', '震惊', '尴尬', '加油', '害羞', '谢谢', '对不起']

export function loadLibrary() {
  return readJson(indexFile(), () => ({ items: [] }))
}

function saveLibrary(lib) {
  writeJson(indexFile(), lib)
}

export function stickerPath(item) {
  return join(dir(), item.file)
}

/** 模糊匹配：备注 / 标签里包含关键词得分高；完全找不到返回 null。 */
export function matchSticker(items, query) {
  const q = String(query || '').trim()
  if (!q || !items.length) return null
  let best = null
  let bestScore = 0
  for (const it of items) {
    const hay = [it.name || '', ...(it.tags || [])]
    let s = 0
    for (const h of hay) {
      if (!h) continue
      if (h === q) s = Math.max(s, 10)
      else if (h.includes(q) || q.includes(h)) s = Math.max(s, 6)
      else {
        const common = [...q].filter((c) => h.includes(c)).length
        if (common >= 2) s = Math.max(s, common / Math.max(q.length, 1) * 4)
      }
    }
    if (s > bestScore || (s === bestScore && s > 0 && Math.random() < 0.5)) {
      best = it
      bestScore = s
    }
  }
  return bestScore >= 1.5 ? best : null
}

/** 自动配表情：先按回复里的词匹配，匹配不到随机挑一张。 */
export function pickForReply(items, replyText) {
  if (!items.length) return null
  const words = DEFAULT_TAGS.concat(items.flatMap((i) => i.tags || []))
  for (const w of words) {
    if (w && String(replyText).includes(w)) {
      const m = matchSticker(items, w)
      if (m) return m
    }
  }
  return items[Math.floor(Math.random() * items.length)]
}

/** 超过上限时该清掉哪张：只看偷来的，最少被发过的里最老的那张。 */
export function pickEvict(items) {
  // 主人加的、从 QQ 收藏导进来的不清（那些本来就在机器人号的收藏里）
  const pool = items.filter((i) => !['manual', 'panel', 'qq', 'tool'].includes(i.from))
  if (!pool.length) return null
  return pool.slice().sort((a, b) => (a.uses || 0) - (b.uses || 0) || (a.lastUsed || a.at || 0) - (b.lastUsed || b.at || 0))[0]
}

export function createStickerStore({ dsh, getConfig, onebot, log }) {
  const recent = [] // 每小时限额

  async function caption(buf, mime, hint) {
    try {
      // 模型看不了图就别硬发：会报错，名字也起不出来
      if ((await canSeeImages(dsh, getConfig())) === false) {
        log.debug('模型不支持看图，跳过表情起名')
        return { name: '', tags: [] }
      }
      const text = await askModel(dsh, { budget: 'stickers',
        cfg: getConfig(),
        system: '你给表情包起名字。只输出一行：不超过 12 个字的中文备注，描述这个表情表达的情绪或内容（例如「委屈巴巴的小猫」「得意地叉腰」）。然后空格，再写 1~3 个标签，从这些里挑：' + DEFAULT_TAGS.join('、') + '。格式：备注 #标签1 #标签2',
        text: hint ? `QQ 给的描述是「${hint}」。请看图起名。` : '请看图起名。',
        images: [{ data: buf.toString('base64'), mediaType: mime }],
        // ⚠ 别给太小：模型会先思考，120 这种上限会被思考吃光，正文是空的（实测踩过）
        maxTokens: 1000,
        temperature: 0.2,
      })
      if (!text) log.warn('看图起名：模型没给出文字')
      const line = text.split(/\r?\n/).map((s) => s.trim()).find(Boolean) || ''
      const tags = [...line.matchAll(/#\s*([^\s#]+)/g)].map((m) => m[1]).filter((t) => t.length <= 6).slice(0, 3)
      const name = line.replace(/#\s*[^\s#]+/g, '').replace(/[「」"'“”]/g, '').trim().slice(0, 12)
      return { name, tags }
    } catch (error) {
      log.warn('看图起名失败：', error.message)
      return { name: '', tags: [] }
    }
  }

  /** 收一张表情。seg 必须已经过 isStickerSegment 严格判定。 */
  async function collect(seg, from) {
    const cfg = getConfig().stickers
    if (!cfg.enabled || !cfg.collect) return { ok: false, reason: '偷表情关着' }
    const now = Date.now()
    while (recent.length && now - recent[0] > 3600_000) recent.shift()
    if (recent.length >= cfg.maxPerHour) return { ok: false, reason: '这小时收够了' }
    const d = seg.data || {}
    let buf
    try {
      buf = await segmentBytes(seg, onebot, { maxBytes: 1.5 * 1024 * 1024 })
    } catch (error) {
      return { ok: false, reason: '下载失败：' + error.message }
    }
    const { width, height } = imageSize(buf)
    if (!stickerSizeOk({ width, height, bytes: buf.length })) return { ok: false, reason: `尺寸不像表情（${width}x${height}，${Math.round(buf.length / 1024)}KB）` }
    const md5 = createHash('md5').update(buf).digest('hex')
    const lib = loadLibrary()
    if (lib.items.some((i) => i.md5 === md5)) return { ok: false, reason: '已经有了' }
    const mime = mimeOf(buf)
    mkdirSync(dir(), { recursive: true })
    const file = `collected-${md5}.${ext(mime)}`
    writeFileSync(join(dir(), file), buf)
    const item = { md5, file, name: '', tags: [], from, at: now, width, height, bytes: buf.length, emojiId: '', summary: String(d.summary || '').replace(/[[\]]/g, '') }
    // 商城表情（QQ 表情商店里的）：存下来的只是一张预览图，原样发回去才会按商城表情播放动画（#31）
    const marketId = String(d.emoji_id ?? d.emojiId ?? '').trim()
    if (marketId) item.market = { emojiId: marketId, packageId: Number(d.emoji_package_id ?? d.emojiPackageId ?? 0) || 0, key: String(d.key ?? '') }
    recent.push(now)
    // 收藏到 QQ
    if (!getConfig().dryRun) {
      try {
        const r = await onebot.call('add_custom_face', { file: 'base64://' + buf.toString('base64') })
        item.emojiId = String(r?.emoji_id || '')
      } catch (error) {
        log.warn('收藏到 QQ 失败（本地已留档）：', error.message)
      }
    }
    lib.items.push(item)
    saveLibrary(lib)
    log.info(`收了一张表情 ${md5.slice(0, 8)}（${width}x${height}）`)
    await trim()
    // 后台起备注，写回 QQ 和本地
    if (getConfig().stickers.caption) {
      caption(buf, mime, item.summary).then(async ({ name, tags }) => {
        const l = loadLibrary()
        const it = l.items.find((i) => i.md5 === md5)
        if (!it) return
        it.name = name || item.summary || '表情'
        it.tags = tags.length ? tags : it.tags
        saveLibrary(l)
        if (it.emojiId && it.name) {
          try { await onebot.call('modify_custom_face', { emoji_id: it.emojiId, desc: it.name.slice(0, 20) }) } catch (error) { log.warn('写回 QQ 备注失败：', error.message) }
        }
        log.info(`表情 ${md5.slice(0, 8)} 起名「${it.name}」${it.tags.length ? ' #' + it.tags.join(' #') : ''}`)
      }).catch((error) => log.warn('表情起名收尾出错：', error.message))
    }
    return { ok: true, item }
  }

  /** 手动添加（工具 / 面板上传）。 */
  async function addFromBuffer(buf, { name = '', tags = [], from = 'manual', toQQ = true } = {}) {
    const md5 = createHash('md5').update(buf).digest('hex')
    const lib = loadLibrary()
    const exist = lib.items.find((i) => i.md5 === md5)
    if (exist) return { ok: true, item: exist, existed: true }
    const mime = mimeOf(buf)
    if (!mime.startsWith('image/')) return { ok: false, reason: '不是图片' }
    mkdirSync(dir(), { recursive: true })
    const file = `manual-${md5}.${ext(mime)}`
    writeFileSync(join(dir(), file), buf)
    const { width, height } = imageSize(buf)
    const item = { md5, file, name: String(name).slice(0, 12), tags, from, at: Date.now(), width, height, bytes: buf.length, emojiId: '' }
    if (toQQ && !getConfig().dryRun) {
      try {
        const r = await onebot.call('add_custom_face', { file: 'base64://' + buf.toString('base64') })
        item.emojiId = String(r?.emoji_id || '')
        if (item.emojiId && item.name) await onebot.call('modify_custom_face', { emoji_id: item.emojiId, desc: item.name })
      } catch (error) {
        log.warn('收藏到 QQ 失败（本地已留档）：', error.message)
      }
    }
    lib.items.push(item)
    saveLibrary(lib)
    return { ok: true, item }
  }

  /** 表情库超过上限就清掉最少用的（QQ 收藏表情有数量上限，满了就收不进去了）。 */
  async function trim() {
    const max = getConfig().stickers.maxLibrary
    for (let guard = 0; guard < 20; guard++) {
      const items = loadLibrary().items
      if (items.length <= max) return
      const out = pickEvict(items)
      if (!out) return
      log.info(`表情库满了（上限 ${max}），清掉一张不常用的：${out.name || out.md5.slice(0, 8)}`)
      await remove(out.md5)
    }
  }

  /** 发出去一次：记下来，常用的不会被清掉。 */
  function markUsed(md5) {
    const lib = loadLibrary()
    const it = lib.items.find((i) => i.md5 === md5)
    if (!it) return
    it.uses = (it.uses || 0) + 1
    it.lastUsed = Date.now()
    saveLibrary(lib)
  }

  async function remove(md5, { fromQQ = true } = {}) {
    const lib = loadLibrary()
    const it = lib.items.find((i) => i.md5 === md5)
    if (!it) return { ok: false, reason: '没有这张' }
    if (fromQQ && it.emojiId) {
      try { await onebot.call('delete_custom_face', { emoji_id: it.emojiId }) } catch (error) { log.warn('从 QQ 收藏里删除失败：', error.message) }
    }
    try { unlinkSync(join(dir(), it.file)) } catch (error) {}
    lib.items = lib.items.filter((i) => i.md5 !== md5)
    saveLibrary(lib)
    return { ok: true }
  }

  function rename(md5, name, tags) {
    const lib = loadLibrary()
    const it = lib.items.find((i) => i.md5 === md5)
    if (!it) return { ok: false }
    if (name !== undefined) it.name = String(name).trim().slice(0, 12)
    if (tags !== undefined) it.tags = [...new Set((Array.isArray(tags) ? tags : []).map((t) => String(t).replace(/^#/, '').trim().slice(0, 8)).filter(Boolean))].slice(0, 5)
    saveLibrary(lib)
    if (it.emojiId && !getConfig().dryRun) onebot.call('modify_custom_face', { emoji_id: it.emojiId, desc: it.name }).catch(() => {})
    return { ok: true, item: it }
  }

  /** 发表情用的消息段：商城表情按商城表情原样发（带 emoji_id，网关会认回成 mface）；其余本地图片按表情（sub_type=1）发。 */
  function segmentFor(item) {
    if (item.market?.emojiId) return { type: 'image', data: { emoji_id: item.market.emojiId, emoji_package_id: item.market.packageId, key: item.market.key, summary: `[${item.name || '表情'}]` } }
    const p = stickerPath(item)
    if (!existsSync(p)) return null
    return { type: 'image', data: { file: 'base64://' + readFileSync(p).toString('base64'), sub_type: 1, summary: `[${item.name || '表情'}]` } }
  }

  /**
   * 把机器人号 QQ「我喜欢的」里已有的表情导进表情库（fetch_custom_face）。已经有的跳过；
   * 不再往 QQ 收藏里加一遍。开了「看图起名」就在后台一张张起名。
   */
  let importing = null
  async function importFromQQ({ limit = getConfig().stickers.maxLibrary } = {}) {
    if (importing) return importing
    importing = (async () => {
      let urls
      try {
        const r = await onebot.call('fetch_custom_face', { count: Math.max(1, Math.min(500, Number(limit) || 300)) }, { timeoutMs: 30000 })
        urls = (Array.isArray(r) ? r : r?.data || []).map((x) => (typeof x === 'string' ? x : x?.url || '')).filter(Boolean)
      } catch (error) {
        return { ok: false, message: '读不到机器人号的 QQ 收藏表情：' + error.message }
      }
      let added = 0
      let existed = 0
      let failed = 0
      const named = []
      for (const url of urls) {
        let buf
        try { buf = await fetchImage(url, { maxBytes: 5 * 1024 * 1024 }) } catch (error) { failed++; continue }
        const md5 = createHash('md5').update(buf).digest('hex')
        if (loadLibrary().items.some((i) => i.md5 === md5)) { existed++; continue }
        const r = await addFromBuffer(buf, { from: 'qq', toQQ: false })
        if (r.ok && !r.existed) { added++; named.push({ md5, buf }) } else failed++
      }
      log.info(`从 QQ 收藏导入表情：新加 ${added} 张，已有 ${existed} 张${failed ? `，${failed} 张下不来` : ''}`)
      // 后台起名（一张张来，别一下子打满模型）
      if (named.length && getConfig().stickers.caption) {
        ;(async () => {
          for (const { md5, buf } of named) {
            const { name, tags } = await caption(buf, mimeOf(buf), '')
            const l = loadLibrary()
            const it = l.items.find((i) => i.md5 === md5)
            if (!it || it.name) continue
            it.name = name || '表情'
            if (tags.length) it.tags = tags
            saveLibrary(l)
          }
        })().catch((error) => log.warn('给导入的表情起名出错：', error.message))
      }
      return { ok: true, added, existed, failed, total: urls.length, message: urls.length ? `QQ 收藏里有 ${urls.length} 张：新导入 ${added} 张，已经有 ${existed} 张${failed ? `，${failed} 张下载失败` : ''}${added && getConfig().stickers.caption ? '。名字在后台慢慢起' : ''}` : 'QQ 收藏里没有表情' }
    })().finally(() => { importing = null })
    return importing
  }

  /**
   * 按图重新起名 / 打标：表情和标签对不上时，让模型重新看一眼。
   * all=true 时按 offset 分批，避免一次把模型打满；返回这一批还剩多少张没做。
   */
  async function recaption({ md5 = '', all = false, offset = 0, limit = 8 } = {}) {
    if ((await canSeeImages(dsh, getConfig())) === false) return { ok: false, message: '现在这个模型看不了图，改不了名字' }
    const lib = loadLibrary()
    const targets = md5 ? lib.items.filter((i) => i.md5 === md5) : lib.items.slice()
    const from = md5 ? 0 : Math.max(0, Number(offset) || 0)
    const todo = targets.slice(from, from + Math.max(1, Math.min(30, Number(limit) || 8)))
    let done = 0
    for (const it of todo) {
      const file = stickerPath(it)
      if (!existsSync(file)) continue
      let buf
      try { buf = readFileSync(file) } catch (error) { continue }
      const { name, tags } = await caption(buf, mimeOf(buf), it.summary || '')
      if (!name && !tags.length) continue
      const l = loadLibrary()
      const cur = l.items.find((x) => x.md5 === it.md5)
      if (!cur) continue
      if (name) cur.name = String(name).slice(0, 12)
      if (tags.length) cur.tags = [...new Set(tags)].slice(0, 5)
      saveLibrary(l)
      done++
    }
    const left = md5 ? 0 : Math.max(0, targets.length - from - todo.length)
    log.info(`重新打标：这一批改了 ${done} 张${left ? `，还剩 ${left} 张` : '，全做完了'}`)
    return { ok: true, done, left, message: left ? `改了 ${done} 张，还剩 ${left} 张` : `改了 ${done} 张，全部更新完` }
  }

  /** 从本机文件夹批量导入图片（png/jpg/gif/webp），名字 / 标签在后台慢慢起。 */
  async function importFromDir(dirPath) {
    const p = String(dirPath || '').trim()
    if (!p) return { ok: false, message: '要填一个文件夹路径' }
    let names
    try { names = readdirSync(p) } catch (error) { return { ok: false, message: '读不了这个文件夹：' + error.message } }
    const list = names.filter((n) => /\.(png|jpe?g|gif|webp)$/i.test(n)).slice(0, 300)
    if (!list.length) return { ok: false, message: '这个文件夹里没有 png / jpg / gif / webp 图片' }
    let added = 0
    let existed = 0
    let failed = 0
    const fresh = []
    for (const n of list) {
      try {
        const buf = readFileSync(join(p, n))
        if (!buf.length || buf.length > 5 * 1024 * 1024) { failed++; continue }
        const r = await addFromBuffer(buf, { from: 'panel', name: '', tags: [], toQQ: false })
        if (r.ok && !r.existed) { added++; fresh.push({ md5: r.item?.md5 || r.md5, buf }) } else if (r.existed) existed++
        else failed++
      } catch (error) { failed++ }
    }
    log.info(`从文件夹导入表情：${p} → 新加 ${added} 张，已有 ${existed} 张，失败 ${failed} 张`)
    if (fresh.length && getConfig().stickers.caption) {
      ;(async () => {
        for (const { md5, buf } of fresh) {
          const { name, tags } = await caption(buf, mimeOf(buf), '')
          const l = loadLibrary()
          const it = l.items.find((i) => i.md5 === md5)
          if (!it || it.name) continue
          it.name = name || '表情'
          if (tags.length) it.tags = tags
          saveLibrary(l)
        }
      })().catch((error) => log.warn('给文件夹导入的表情起名出错：', error.message))
    }
    return { ok: true, added, existed, failed, message: `文件夹里 ${list.length} 张图：新导入 ${added} 张，已经有 ${existed} 张${failed ? `，${failed} 张没成功` : ''}${added && getConfig().stickers.caption ? '。名字在后台慢慢起' : ''}` }
  }

  /** 库里出现最多的标签（给提示词用，让她别瞎编名字）。 */
  const popularTags = (limit = 12) => {
    const count = new Map()
    for (const it of loadLibrary().items) for (const t of it.tags || []) {
      const k = String(t || '').trim()
      if (k) count.set(k, (count.get(k) || 0) + 1)
    }
    return [...count.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, limit).map((x) => x[0])
  }
  return { importFromQQ, importFromDir, recaption, collect, addFromBuffer, remove, rename, segmentFor, markUsed, trim, popularTags, library: loadLibrary, match: (q) => matchSticker(loadLibrary().items, q), pickForReply: (t) => pickForReply(loadLibrary().items, t) }
}
