// 把模型的一轮回复拆成要发到 QQ 的「一条条消息」。
//
// 模型输出约定（写在人格卡里）：
//   - `|||` 分隔多条气泡
//   - `<voice>…</voice>` 包住的内容发成语音
//   - `<sticker:标签>` 发一张表情（可写 `<sticker:标签></sticker>`）
//   - `<poke>` = 戳一戳对方
//   - `<reply:编号>` 写在某句前面 = 这句以「引用回复」发出（群聊里引用提示词中带编号的那条消息）
//   - 整轮只输出 `[沉默]`（或空）= 这次不说话（群聊插话用）
// 另外顺手把模型偶尔漏出来的 Markdown、HTML 标签、行首多打的 `text` 洗掉——QQ 不渲染 Markdown。

export const SILENCE = '[沉默]'

/** 去掉 Markdown 痕迹，保留文字本身。 */
export function stripMarkdown(text) {
  return String(text || '')
    .replace(/```[a-zA-Z0-9_-]*\n?([\s\S]*?)```/g, '$1')
    .replace(/`([^`\n]+)`/g, '$1')
    .replace(/\*\*([^*\n]+)\*\*/g, '$1')
    .replace(/__([^_\n]+)__/g, '$1')
    .replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1$2')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/^\s*>\s?/gm, '')
    .replace(/\[([^\]\n]+)\]\((https?:\/\/[^)\s]+)\)/g, '$1 $2')
    .replace(/[ \t]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

const HTML_TAGS =
  'p|div|span|br|hr|b|i|u|s|del|em|strong|small|big|center|code|pre|h[1-6]|ul|ol|li|dl|dt|dd|blockquote|a|font|img|table|thead|tbody|tfoot|tr|td|th|q|cite|sub|sup|mark|section|article|header|footer|figure|figcaption'

/**
 * 洗掉模型偶尔漏出来的「标签残渣」。QQ 是纯文本，这些东西只能原样显示成乱码。
 * 见过的样子：整段被 `<p>…</p>` 包住、单独一行 `</p>`、行首多打一个 `text`、DSML 工具调用的尾巴。
 */
/**
 * 工具输出被十六进制化后模型会照抄（「E6 88 91 是我」）。清掉成串的两位十六进制，
 * 顺手收一收多余空格——宁可少一句，也别让她把乱码念出来。
 */
export function stripHexRuns(text) {
  return String(text || '')
    .replace(/(?:\b[0-9A-Fa-f]{2}\b[ \t]*){3,}/g, '')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/[ \t]+([，。！？；：、])/g, '$1')
    .trim()
}

export function stripArtifacts(text) {
  return String(text || '')
    .replace(/<br\s*\/?>/gi, '\n') // 换行标签留着当换行，别把两句话粘一起
    .replace(new RegExp(`<\\/?(?:${HTML_TAGS})(?:\\s[^>]*)?\\/?>`, 'gi'), '')
    .replace(/<\/?(?:\｜{2}|\|{2})[^>]*>/g, '') // 半截 DSML 工具调用标签
    .replace(/^\s*text[ \t]*[\n，,：:]\s*/i, '') // 行首多打的「text」
    .replace(/^\s*text(?=[\u4e00-\u9fa5])/i, '')
    // 行首冒出来的协议短号（实测「m01776b谁是你媳妇啊。」）：字母+数字混排、6~10 位、
    // 后面紧跟中文/标点/换行的，整段扔掉。正常的英文单词（hi、ok）和「3D」这类不会命中。
    .replace(/^\s*[a-z]{1,2}\d[0-9a-z]{3,8}(?=[\s\u4e00-\u9fa5，。！？!?…、；：,.]|$)/i, '')
}

/** 是不是「这次不说话」。 */
export function isSilence(text) {
  const t = String(text || '').trim()
  return t === '' || t === SILENCE || t === '［沉默］' || t === '(沉默)' || t === '（沉默）'
}

/**
 * 解析一轮回复。
 * @param {string} text 模型这一轮的最终正文
 * @returns {{silent: boolean, items: Array<{kind:'text'|'voice'|'sticker'|'image', value:string, replyTo?:string}>}}
 */
export function parseReply(text, opts = {}) {
  const raw = String(text || '').trim()
  if (isSilence(raw)) return { silent: true, items: [] }
  const items = []
  let replyTo = '' // 等着挂到下一条气泡上的「引用回复」编号
  const attach = (from) => {
    if (replyTo && items.length > from) {
      items[from].replyTo = replyTo
      replyTo = ''
    }
  }
  for (const bubble of raw.split('|||')) {
    const part = bubble.trim()
    if (!part) continue
    // 依次切出 reply / voice / sticker / markdown 图片，其余是文字
    const re = /<poke\s*\/?>|<reply:\s*(\d+)\s*>|<voice>([\s\S]*?)<\/voice>|<sticker:([^>]+?)>(?:\s*<\/sticker>)?|!\[[^\]]*\]\(\s*([^)\s]+)\s*\)/g
    let last = 0
    let m
    while ((m = re.exec(part)) !== null) {
      let from = items.length
      pushText(items, part.slice(last, m.index), opts)
      attach(from)
      from = items.length
      if (m[0].startsWith('<poke')) {
        if (!items.some((i) => i.kind === 'poke')) items.push({ kind: 'poke', value: '' })
      } else if (m[1] !== undefined) {
        replyTo = m[1]
      } else if (m[2] !== undefined) {
        const v = stripMarkdown(stripArtifacts(m[2]))
        if (v) items.push({ kind: 'voice', value: v })
      } else if (m[3] !== undefined) {
        const v = m[3].trim()
        if (v) items.push({ kind: 'sticker', value: v })
      } else if (m[4] !== undefined) {
        items.push({ kind: 'image', value: m[4] })
      }
      attach(from)
      last = re.lastIndex
    }
    const from = items.length
    pushText(items, part.slice(last), opts)
    attach(from)
  }
  // 一轮最多引用一次，多的去掉（大多数时候正常发就好）
  let quoted = false
  for (const it of items) {
    if (!it.replyTo) continue
    if (quoted) delete it.replyTo
    quoted = true
  }
  if (items.length === 0) return { silent: true, items: [] }
  return { silent: false, items: capBubbles(items, opts.max) }
}

const MAX_BUBBLES = 3
const ONE_MAX = 24 // 这段以内就一条（真人短回合一两句就是一条）

const ENDS_PUNCT = /[，。！？!?…～~,.]$/
const tidyEdge = (s) => String(s || '').replace(/^[\s，、,。.；;：:！!？?…～~]+/, '').replace(/[\s，、,]+$/, '')

/** 把模型的换行接回一句话：上一行已经有标点就直接接，否则用逗号连（像一口气说完）。 */
function joinLines(lines) {
  let out = ''
  for (const raw of lines) {
    const s = String(raw || '').trim()
    if (!s) continue
    out = !out ? s : ENDS_PUNCT.test(out) ? out + s : `${out}，${s}`
  }
  return out
}

/**
 * 按她自己打的停顿切：空格、换行、空行都算一次换气——她打几截，就发几条。
 * 实测量到的输出长这样：`\n\n\n\n哦 吃了啊 那我这白操心一场 <sticker:无语>\n\n\n吃的啥 有饭没`，
 * 以前会被并成一句再按字数硬切，拆出来的位置和她想说的节奏对不上。
 */
function modelBeats(t) {
  const out = []
  for (const piece of String(t || '').split(/\s+/)) {
    const s = tidyEdge(piece)
    if (!s) continue
    // 只有标签的一截（<sticker:…>、<poke>）不算一次换气，跟着前面那句一起发
    if (/^<[^>]+>$/.test(s) && out.length) out[out.length - 1] = `${out[out.length - 1]} ${s}`
    else out.push(s)
  }
  return out
}

/** 旧规矩（她一口气写一大段、中间没打空格时兜底）：按标点切。 */
const SPLIT_AT = /(?<=[。！？!?…～~])|\s+|(?<=[，、；])/
function beats(t) {
  const out = []
  for (const raw of String(t).split(SPLIT_AT)) {
    const w = tidyEdge(raw)
    if (!w) continue
    // 太长的一段再按逗号拆一次
    if (w.length > 45) {
      let buf = ''
      for (const seg of w.split(/(?<=[，、；])/)) {
        if (buf && buf.length + seg.length > 40) { out.push(tidyEdge(buf)); buf = '' }
        buf += seg
      }
      if (buf) out.push(tidyEdge(buf))
    } else out.push(w)
  }
  return out.filter(Boolean)
}

/** 一截短于这个长度就并进相邻那截，免得单个「哦」「行吧」这种碎气泡单独冒出来。 */
const MIN_BEAT = 4

/** 条数超了就合并相邻最短的两截（保留她原来的顺序和停顿位置）。并起来用空格隔开，读着还是一顿一顿的。 */
function packBeats(list, max) {
  const out = list.slice()
  while (out.length > Math.max(1, max)) {
    let at = 0
    let size = Infinity
    for (let i = 0; i + 1 < out.length; i++) {
      const len = out[i].length + out[i + 1].length
      if (len < size) { size = len; at = i }
    }
    out.splice(at, 2, `${out[at]} ${out[at + 1]}`)
  }
  // 条数没超，但某一截太碎：并进相邻更短的那截，不硬拆成独立气泡
  while (out.length > 1) {
    const at = out.findIndex((s) => s.length < MIN_BEAT)
    if (at < 0) break
    const prev = at > 0 ? at - 1 : -1
    const next = at + 1 < out.length ? at + 1 : -1
    const target = prev >= 0 && (next < 0 || out[prev].length <= out[next].length) ? prev : next
    const [a, b] = target < at ? [target, at] : [at, target]
    out.splice(a, 2, `${out[a]} ${out[b]}`)
  }
  return out
}

/**
 * 一段文字拆成几条气泡。
 * opts.split：'natural'（默认）按她自己打的停顿（空格、换行）拆，超过条数才合并；'one' 整轮一条；'line' 旧的按行拆。
 * 有代码块、像列表、或者很长（>240 字）就整段发。
 */
export function splitLines(text, { max = MAX_BUBBLES, split = 'natural', oneMax = ONE_MAX, chance = 1, rand = Math.random } = {}) {
  const t = String(text || '').trim()
  if (!t) return []
  if (t.includes('```') || t.length > 240) return [t]
  const lines = t.split(/\n+/).map((s) => s.trim()).filter(Boolean)
  if (split === 'line') return lines.length ? lines : [t]
  if (split === 'one') return [joinLines(lines)]
  const listy = lines.filter((l) => /^(\d+[.、)]|[-*•·])/.test(l)).length
  if (lines.length > 1 && listy >= Math.ceil(lines.length / 2)) return [t]
  const one = joinLines(lines)
  if (!one) return []
  if (one.length <= oneMax) return [one]
  // 她说几截就发几条：空格、换行、空行都是她自己打的停顿，不再按字数硬切
  let list = /<voice>|<\/voice>/i.test(t) ? [] : modelBeats(t) // 语音那段里可能有空格，整段不动
  if (list.length < 2 && one.length > oneMax * 2) list = beats(one) // 一大段没停顿：退回按标点切
  if (list.length < 2) return [one]
  if (chance < 1 && rand() > chance) return [one]
  return packBeats(list, max)
}

/** 文字气泡最多 max 条，多出来的并进最后一条（防止刷屏）。 */
function capBubbles(items, max = MAX_BUBBLES) {
  const texts = items.filter((i) => i.kind === 'text')
  if (texts.length <= max) return items
  const keep = new Set(texts.slice(0, max - 1))
  const tail = texts.slice(max - 1)
  const merged = { kind: 'text', value: tail.map((t) => t.value).join('\n') }
  const out = []
  let placed = false
  for (const it of items) {
    if (it.kind !== 'text' || keep.has(it)) out.push(it)
    else if (!placed) { out.push(merged); placed = true }
  }
  return out
}

function pushText(items, s, opts = {}) {
  const t = stripMarkdown(stripArtifacts(String(s || '').replace(/<\/?reply[^>]*>/g, ''))) // 写坏的引用标签、漏出来的 HTML/`text` 直接去掉
  if (!t || isSilence(t)) return
  for (const line of splitLines(t, opts)) if (!isSilence(line)) items.push({ kind: 'text', value: line })
}

/** 对方是不是明确要她发语音（「用语音说」「发个语音」「语音回我」……）。 */
export function wantsVoice(text) {
  const t = String(text || '')
  if (t.includes('不要语音') || t.includes('别发语音')) return false
  return /(用|发|来|给我|录)[^，。？！\n]{0,4}语音|语音[^，。？！\n]{0,4}(说|发|讲|回|念|唱)/.test(t)
}

/**
 * 发下一条之前停多久（毫秒）：按「打字速度」算——下一条越长停越久，再加一点随机抖动。
 * @param {string} [next] 下一条要发的内容
 */
export function bubbleDelay(next = '', rand = Math.random) {
  if (typeof next === 'function') { rand = next; next = '' }
  const len = String(next || '').length
  const typing = 350 + len * 110 // 大约每秒 9 个字
  return Math.round(Math.min(4500, Math.max(700, typing)) * (0.8 + rand() * 0.5))
}
