// 两个纯判断，从 hub 里抽出来方便单测：会话要不要换、本地文件能不能发。

/** @typedef {{ createdAt?: number, turns?: number }} SessionEntry */

/**
 * 这个 QQ 会话是不是用太久了。
 * 上下文只增不减（压缩又被 billion-context 关掉），只能靠轮换兜底。
 * @param {SessionEntry} entry
 * @param {{ maxDays?: number, maxTurns?: number }} [cfg]
 * @returns {{ rotate: boolean, why: string }}
 */
export function shouldRotateSession (entry, cfg = {}, now = Date.now()) {
  const maxDays = Number(cfg.maxDays) || 0
  const maxTurns = Number(cfg.maxTurns) || 0
  if (!entry) return { rotate: false, why: '' }
  const age = now - Number(entry.createdAt || 0)
  if (maxDays > 0 && age >= maxDays * 86400_000) return { rotate: true, why: `用了 ${maxDays} 天以上` }
  if (maxTurns > 0 && Number(entry.turns || 0) >= maxTurns) return { rotate: true, why: `聊满 ${maxTurns} 轮` }
  return { rotate: false, why: '' }
}

/**
 * 这是个允许外发的图片地址吗。
 * 只认 http(s) / data / base64，以及数据目录里的本地文件（表情、截图、日记配图）——
 * 否则别人诱导她写 ![](/Users/…/config.json) 就能把本机文件当图片发出去。
 */
const collapse = (p) => {
  const out = []
  for (const seg of String(p).replace(/\\/g, '/').split('/')) {
    if (!seg || seg === '.') continue
    if (seg === '..') out.pop()
    else out.push(seg)
  }
  return '/' + out.join('/')
}

export function localSendable (src, root) {
  const p = String(src || '')
  if (/^https?:\/\//i.test(p) || /^(data|base64):/i.test(p)) return true
  if (!root) return false
  const base = collapse(root).replace(/\/$/, '')
  const abs = collapse(p.startsWith('/') || /^[a-zA-Z]:[\\/]/.test(p) ? p : base + '/' + p)
  if (!abs.startsWith(base + '/')) return false
  if (/config\.json$|\.key$|secret|credential/i.test(abs)) return false
  return true
}
