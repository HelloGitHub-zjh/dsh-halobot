// 备份迁移：把数据目录里能带走的东西打成一个 JSON 文件，换设备时再导回来。
//
// 只碰 ~/.dsh/plugins-data/halobot/ 下面的白名单条目（PARTS），别的（logs、voice-cache、
// modules-data 里各模块自己存的大件）不打包，免得备份文件又大又没用。
// 导入前会先把现在的同名文件抄一份到 backups/import-<时间>/，导错了还能捞回来。

import { existsSync, readdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { dataDir, ensureDir } from '../core/store.js'

export const BUNDLE_FORMAT = 'halobot-backup'
export const BUNDLE_VERSION = 1
/** 导入时最多收这么大的包（base64 之后会比原文件大三成左右）。 */
export const MAX_IMPORT_BYTES = 80 * 1024 * 1024

/** 能打包带走的东西。file = 数据目录下的单个文件；dir = 整个目录（会递归，最多三层）。 */
export const PARTS = [
  { id: 'config', label: '插件配置', file: 'config.json', secret: true, desc: '网关、模型、语音、各项开关……里面有 API Key 和控制台密码，别随便发给别人' },
  { id: 'memories', label: '记忆库', file: 'memories.json', desc: '长期记忆、人物小档案、相处经验、说话方式' },
  { id: 'chatlog', label: '聊天流水', dir: 'chatlog', desc: '还没整理的原始聊天。整理时会提炼成长期记忆，也能用 search_history 翻' },
  { id: 'archive', label: '聊天归档', dir: 'chatlog-archive', desc: '整理过的原文归档（保留 60 天），她可以翻出来对细节' },
  { id: 'diary', label: '空间日记', file: 'diary.json', desc: '她写过的说说日记和发表记录' },
  { id: 'mood', label: '心情', file: 'mood.json', desc: '当前心情值、最近的变化记录' },
  { id: 'speakup', label: '主动搭话', file: 'speakup.json', desc: '主动找你的时间安排和次数' },
  { id: 'qzone', label: '空间互动', file: 'qzone-social.json', desc: '逛空间、评论、回评的进度和记录' },
  { id: 'personas', label: '人格卡', dir: 'personas', desc: '人格和规则（含你自己加的人格）' },
  { id: 'stickers', label: '表情库', dir: 'stickers', desc: '表情索引和图片，原样带过去（占空间最多的就是它）' },
  { id: 'local', label: '本地接口脚本', dir: 'local', desc: 'tts.mjs 这类放在本地的脚本' },
]

const TEXT_EXT = /\.(json|jsonl|txt|md|markdown|mjs|cjs|js|yml|yaml|csv)$/i

/** 这个部分在数据目录里的文件（相对 dataDir 的路径，用 / 分隔）。 */
function filesOf(part) {
  if (part.file) return existsSync(dataDir(part.file)) ? [part.file] : []
  const root = dataDir(part.dir)
  const out = []
  const walk = (dir, pre, depth) => {
    let ents = []
    try { ents = readdirSync(dir, { withFileTypes: true }) } catch (error) { return }
    for (const e of ents) {
      if (e.name.startsWith('.')) continue
      const rel = pre ? pre + '/' + e.name : e.name
      if (e.isDirectory()) { if (depth < 3) walk(join(dir, e.name), rel, depth + 1) }
      else if (e.isFile()) out.push(part.dir + '/' + rel)
    }
  }
  walk(root, '', 1)
  return out.sort()
}

/** 面板用：每个部分现在有多大、几个文件。 */
export function backupStatus() {
  return PARTS.map((p) => {
    const files = filesOf(p)
    let bytes = 0
    for (const f of files) { try { bytes += statSync(dataDir(f)).size } catch (error) {} }
    return { id: p.id, label: p.label, desc: p.desc, secret: Boolean(p.secret), files: files.length, bytes }
  })
}

/** 打包：parts 为空 = 全选。没有文件的部分直接跳过（省得导出个空壳）。 */
export function makeBundle(parts, meta = {}) {
  const want = new Set(Array.isArray(parts) && parts.length ? parts : PARTS.map((p) => p.id))
  const box = {}
  for (const p of PARTS) {
    if (!want.has(p.id)) continue
    const files = filesOf(p)
    if (!files.length) continue
    const one = {}
    for (const f of files) {
      const buf = readFileSync(dataDir(f))
      const binary = buf.includes(0) || !TEXT_EXT.test(f)
      one[f] = binary ? { enc: 'base64', data: buf.toString('base64') } : { enc: 'utf8', data: buf.toString('utf8') }
    }
    box[p.id] = { files: one }
  }
  return { format: BUNDLE_FORMAT, version: BUNDLE_VERSION, at: new Date().toISOString(), app: meta.version || '', parts: box }
}

function safeRel(rel) {
  const r = String(rel || '').replace(/\\/g, '/')
  if (!r || r.startsWith('/') || r.split('/').some((s) => s === '..' || s === '.' || s === '')) throw new Error('备份里有奇怪的路径：' + rel)
  return r
}

function stamp(now = new Date()) {
  const p = (n) => String(n).padStart(2, '0')
  return `${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}-${p(now.getHours())}${p(now.getMinutes())}${p(now.getSeconds())}`
}

/** 检查一个包：格式对不对、里面有哪些部分。面板选文件后先拿它看看。 */
export function bundleSummary(bundle) {
  if (!bundle || typeof bundle !== 'object') throw new Error('读不出这个文件')
  if (bundle.format !== BUNDLE_FORMAT) throw new Error('这不是 Halobot 的备份文件')
  if (Number(bundle.version) > BUNDLE_VERSION) throw new Error('这个备份比现在的插件新（v' + bundle.version + '），先更新插件再导入')
  const base = new Map(PARTS.map((p) => [p.id, p]))
  const parts = []
  for (const [id, box] of Object.entries(bundle.parts || {})) {
    const p = base.get(id)
    if (!p) continue
    const files = Object.keys((box && box.files) || {})
    let bytes = 0
    for (const f of files) {
      const b = box.files[f] || {}
      bytes += b.enc === 'base64' ? Math.floor(String(b.data || '').length * 0.75) : Buffer.byteLength(String(b.data || ''), 'utf8')
    }
    parts.push({ id, label: p.label, desc: p.desc, secret: Boolean(p.secret), files: files.length, bytes })
  }
  return { at: bundle.at || '', app: bundle.app || '', parts }
}

/** 导入：先备份现在的东西，再按选择整个替换。 */
export function applyBundle(bundle, parts) {
  bundleSummary(bundle) // 校验
  const want = new Set(Array.isArray(parts) && parts.length ? parts : PARTS.map((p) => p.id))
  const dir = 'backups/import-' + stamp()
  const applied = []
  const skipped = []
  for (const p of PARTS) {
    const slot = bundle.parts && bundle.parts[p.id]
    if (!want.has(p.id) || !slot || !slot.files) { if (want.has(p.id) && !slot) skipped.push(p.id); continue }
    const files = Object.keys(slot.files).map(safeRel).filter((f) => (p.file ? f === p.file : f.startsWith(p.dir + '/')))
    if (!files.length) { skipped.push(p.id); continue }
    // 现在有的先抄一份，导错了能捞回来
    for (const f of filesOf(p)) {
      const dst = join(dataDir(dir), f)
      ensureDir(dirname(dst))
      writeFileSync(dst, readFileSync(dataDir(f)))
    }
    // 整个替换：旧的多出来的文件先删掉（备份里没有的就是不要了）
    for (const f of filesOf(p)) if (!files.includes(f)) { try { unlinkSync(dataDir(f)) } catch (error) {} }
    let bytes = 0
    for (const f of files) {
      const b = slot.files[f] || {}
      const buf = b.enc === 'base64' ? Buffer.from(String(b.data || ''), 'base64') : Buffer.from(String(b.data || ''), 'utf8')
      const abs = dataDir(f)
      ensureDir(dirname(abs))
      writeFileSync(abs, buf)
      bytes += buf.length
    }
    applied.push({ id: p.id, label: p.label, files: files.length, bytes })
  }
  return { ok: applied.length > 0, applied, skipped, backup: applied.length ? dir : '' }
}


// ---------- 自动备份：按间隔把整份数据打进 backups/，只留最近几份 ----------

const AUTO_DIR = 'backups'

/** 备份文件名：auto-2026-10-31-1830.json（本地时间，人看着方便）。 */
function stampName(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0')
  return `auto-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}.json`
}

/** 现有的自动备份（新的在前）。 */
export function listAuto() {
  try {
    return readdirSync(dataDir(AUTO_DIR))
      .filter((n) => /^auto-.*\.json$/.test(n))
      .map((n) => {
        let bytes = 0
        let at = 0
        try { const st = statSync(dataDir(AUTO_DIR, n)); bytes = st.size; at = st.mtimeMs } catch (error) {}
        return { name: n, bytes, at }
      })
      .sort((a, b) => b.at - a.at)
  } catch (error) {
    return []
  }
}

/** 写一份自动备份，然后只留最近 keep 份（最新的永远留着）。 */
export function saveAuto(bundle, keep = 7) {
  ensureDir(dataDir(AUTO_DIR))
  const name = stampName()
  writeFileSync(dataDir(AUTO_DIR, name), JSON.stringify(bundle), 'utf8')
  const max = Math.max(1, Math.min(60, Number(keep) || 7))
  const keepNames = new Set(listAuto().slice(0, max).map((f) => f.name))
  for (const f of listAuto()) if (!keepNames.has(f.name)) { try { unlinkSync(dataDir(AUTO_DIR, f.name)) } catch (error) {} }
  return { name, bytes: statSync(dataDir(AUTO_DIR, name)).size }
}

/** 读一份自动备份（只认备份目录里的 auto-*.json）。 */
export function readAuto(name) {
  const safe = String(name || '').replace(/[\\/]/g, '')
  if (!/^auto-.*\.json$/.test(safe)) return null
  try { return JSON.parse(readFileSync(dataDir(AUTO_DIR, safe), 'utf8')) } catch (error) { return null }
}

/** 删一份自动备份。 */
export function deleteAuto(name) {
  const safe = String(name || '').replace(/[\\/]/g, '')
  if (!/^auto-.*\.json$/.test(safe)) return false
  try { unlinkSync(dataDir(AUTO_DIR, safe)); return true } catch (error) { return false }
}
