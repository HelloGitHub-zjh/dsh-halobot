// 内置模块：记忆。她自己记下值得记的事、聊天时想起相关的、每天把聊天流水整理进长期记忆，还有每个人的小档案、相处经验、说话方式。
// 导出 createMemoryStore 的返回值：add / addEvent / recall / list / contextFor / topicScore / consolidate ……
// 别的模块（空间日记、B 站、翻唱）会往这里记她的经历；记忆模块关着时它们自己跳过。

import { createMemoryStore, memoryLine } from '../../features/memory.js'
import { defineTool, str } from '../../tools/tools.js'

export default {
  id: 'memory',
  name: '记忆',
  version: '1.0.0',
  description: '长期记忆：记事、想起、每日整理、小档案和相处经验',
  tab: 'mood',
  files: ['features/memory.js'],
  setup(api) {
    const { hub, http } = api.core
    const memory = createMemoryStore({ dsh: api.dsh, getConfig: api.config, hub, log: api.log })

    api.context(({ chat, sessionId }) => (chat.kind === 'system' ? '' : memory.contextFor(chat, sessionId)))
    // #79：随消息变化的相关记忆放在「交给她的内容」里，不放进每轮都会追加的运行时上下文快照
    api.on('prompt', (content, info) => {
      try {
        if (!info || !info.chat || info.chat.kind === 'system' || !Array.isArray(content)) return content
        const hint = memory.recallHint(info.chat, info.queryText || '', info.prevText || '')
        if (!hint) return content
        return [{ type: 'text', text: hint }, ...content]
      } catch (error) { return content }
    })
    api.every(60_000, () => memory.tick(), '整理记忆')

    api.tool(({ chat }) => {
      if (!api.config().memory.enabled || chat.kind === 'system') return []
      const current = chat.chatId
      return [
        defineTool({
          name: 'remember',
          description: '把一件值得长期记住的事记下来（对方的名字、喜好、约定、重要的事）。一条只记一件事；日常琐事不用记；记的时候安静地记，别在回复里说「我记住了」。',
          properties: {
            text: str('要记住的事，一句话，主语写清楚'),
            about: str('这件事是关于谁的（名字），可选'),
            importance: { type: 'number', description: '0~1，约定、关系、核心喜好写高一点，随口一提写低一点，不确定写 0.5' },
          },
          required: ['text'],
          execute: async ({ text, about, importance }) => memory.add({ text, aboutName: about || '', about: chat.kind === 'private' ? chat.userId : '', importance: importance ?? 0.5, source: 'tool', chatId: current }),
        }),
        defineTool({
          name: 'recall_memory',
          description: '翻一翻记忆库：想不起对方以前说过什么、喜欢什么、约过什么时用。query 写关键词或一句话。',
          properties: { query: str('想找什么') },
          required: ['query'],
          execute: async ({ query }) => {
            const hits = memory.recall(String(query || ''), { about: chat.userId, limit: 8, where: current + '（翻记忆）' })
            return hits.length ? { ok: true, message: hits.map((h) => memoryLine(h.it)).join('；') } : { ok: true, message: '没想起相关的事' }
          },
        }),
        defineTool({
          name: 'search_history',
          description: '翻聊天记录的原话（整理成记忆之前的原文，默认留 60 天）。要确认某件事「具体」是怎么说的、哪天说的、对方原话是什么，或者记忆里没有、但你们肯定聊过时用。',
          properties: {
            query: str('关键词或一句话'),
            days: { type: 'number', description: '只看最近几天，可选，不填就翻全部（最多 60 天）' },
          },
          required: ['query'],
          execute: async ({ query, days }) => {
            const hits = memory.searchHistory(String(query || ''), { days: Number(days) || 0, limit: 12 })
            if (!hits.length) return { ok: true, message: '没翻到（可能那天没聊过，或已经超过 60 天）' }
            const line = (h) => `[${h.day} ${new Date(h.at).toTimeString().slice(0, 5)}] ${h.text}`.slice(0, 300)
            return { ok: true, message: hits.map(line).join('\n') }
          },
        }),
      ]
    })

    api.route('/memories', async (req) => ({ ok: true, items: memory.list(http.query(req).q || '').slice(0, 300), stats: memory.stats() }))
    api.route('/memory/add', async (req) => {
      const b = await http.body(req)
      return memory.add({ text: b.text, aboutName: b.aboutName || '', about: b.about || '', importance: b.importance ?? 0.6, tags: b.tags || [], source: 'panel' })
    })
    api.route('/memory/update', async (req) => {
      const b = await http.body(req)
      return memory.update(b.id, b)
    })
    api.route('/memory/delete', async (req) => {
      const b = await http.body(req)
      return memory.remove(b.id)
    })
    api.route('/insights', async () => ({ ok: true, items: memory.insights(), styles: memory.styles() }))
    api.route('/memory/recalls', async () => ({ ok: true, list: memory.recalls() }))
    api.route('/memory/restore', async (req) => memory.restore((await http.body(req)).id))
    api.route('/profiles', async () => ({ ok: true, list: memory.profiles() }))
    api.route('/profiles/save', async (req) => {
      const b = await http.body(req)
      memory.setProfile(String(b.qq || ''), String(b.text || ''))
      return { ok: true, message: b.text ? '小档案已保存' : '小档案已清空' }
    })
    api.route('/profiles/rebuild', async (req) => {
      const b = await http.body(req)
      try {
        return (await memory.buildProfile(String(b.qq || ''))) ? { ok: true, message: '按记忆重写好了' } : { ok: false, message: '关于 TA 的记忆还太少（至少 3 条）' }
      } catch (error) {
        return { ok: false, message: error.message }
      }
    })
    // 人物卡片墙：记忆侧的数据 + 聊天流水里的「说了多少句、最后一次什么时候」合起来给面板
    api.route('/memory/people', async () => {
      const list = memory.people()
      const said = new Map()
      try {
        for (const day of hub.chatLogDays().slice(-30)) {
          for (const l of hub.chatLogOf(day) || []) {
            const uid = String(l.uid || '')
            if (!uid) continue
            const w = said.get(uid) || { messages: 0, lastSay: 0, where: new Set() }
            w.messages++
            w.lastSay = Math.max(w.lastSay, Number(l.t) || 0)
            const cid = String(l.chatId || '')
            w.where.add(/^private:/.test(cid) ? '私聊' : /^group:/.test(cid) ? '群' : /^qzone/.test(cid) ? '空间' : '其他')
            said.set(uid, w)
          }
        }
      } catch (error) { api.log.debug('统计人物聊天条数失败：', error.message) }
      return {
        ok: true,
        list: list.map((p) => {
          const w = said.get(p.qq)
          return { ...p, messages: w ? w.messages : 0, lastSay: w ? w.lastSay : 0, where: w ? [...w.where].slice(0, 3) : [] }
        }),
      }
    })
    api.route('/memory/import', async (req) => {
      const b = await http.body(req)
      try { return { ok: true, list: await memory.importCandidates(String(b.text || '').slice(0, 30000)) } } catch (error) { return { ok: false, message: error.message, list: [] } }
    })
    api.route('/memory/import/commit', async (req) => {
      const n = memory.importCommit((await http.body(req)).items || [])
      return { ok: true, message: `存进记忆库 ${n} 条` }
    })
    api.route('/style/save', async (req) => {
      const b = await http.body(req)
      memory.setStyle(String(b.key || ''), (b.list || []).map((t) => String(t).trim()).filter(Boolean))
      return { ok: true, message: '说话方式已保存' }
    })
    api.route('/insights/save', async (req) => {
      const b = await http.body(req)
      memory.setInsights(String(b.key || ''), (b.list || []).map((t) => String(t).trim()).filter(Boolean))
      return { ok: true, message: '相处经验已保存' }
    })
    api.route('/memory/extract', async (req) => {
      const b = await http.body(req)
      // 立即整理一次：连今天的也提炼（今天的聊天流水不删，写日记还要用）
      return memory.consolidate({ includeToday: b.includeToday !== false })
    })
    // 翻原文：整理进记忆之后的聊天记录还在 chatlog-archive/（默认 60 天）
    api.route('/memory/history', async (req) => {
      const q = http.query(req)
      return { ok: true, stats: memory.historyStats(), list: q.q ? memory.searchHistory(String(q.q), { days: Number(q.days) || 0, limit: 50 }) : [] }
    })

    return memory
  },
}
