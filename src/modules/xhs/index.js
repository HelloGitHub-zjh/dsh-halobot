// 内置模块：刷小红书。专用浏览器里登录一次；定时自己刷首页 / 搜索、点赞、评论，好玩的分享给主人，
// 并把「学到的东西」沉淀成记忆和知识库（面板「小红书 → 学到了什么」能看）。
// 浏览 / 点赞 / 评论 / 分享各有权限（面板「权限」页），默认仅主人。

import { createXhs } from '../../xhs/duty.js'
import { defineTool, str } from '../../tools/tools.js'
import { profileToolVisible, profilePermits } from '../../chat/access.js'

export default {
  id: 'xhs',
  name: '刷小红书',
  version: '1.0.0',
  description: '专用浏览器刷小红书：看首页和搜索、点赞、评论，好玩的分享给主人；还会把帖子里的知识记下来（xhs_browse / xhs_recent / xhs_learn）',
  tab: 'xhs',
  files: ['xhs/duty.js', 'xhs/site.js', 'core/cdp.js'],
  setup(api) {
    const { hub } = api.core
    const xhs = createXhs({ getConfig: api.config, hub, memory: api.lazy('memory'), log: api.log })
    api.every(60_000, () => xhs.tick(), '刷小红书')

    api.tool(({ chat, sessionId }) => {
      const cfg = api.config()
      if (!cfg.xhs.enabled || chat.kind === 'system') return []
      const guarded = (key, run) => async (args) => {
        const c = api.config()
        if (!c.xhs.enabled) return { ok: false, message: '小红书没打开' }
        const p = profilePermits(c, key, chat, hub.turnSendersAllOwner(sessionId))
        if (!p.ok) return p
        return run(args)
      }
      const tools = []
      if (profileToolVisible(cfg, 'xhsBrowse', chat)) {
        tools.push(defineTool({
          name: 'xhs_browse',
          description: '现在去刷一会儿小红书。只是开始刷：要几分钟，刷完系统会告诉你看了什么、学到了什么，在那之前别说已经刷完。',
          properties: {},
          execute: guarded('xhsBrowse', async () => xhs.run({ force: true })),
        }))
        tools.push(defineTool({
          name: 'xhs_recent',
          description: '查最近刷过的小红书帖子。有人问刚才刷了什么时用；没有记录就如实说。',
          properties: {},
          execute: guarded('xhsBrowse', async () => {
            const rows = (xhs.state().history || []).filter((x) => x.kind === 'see' || x.kind === 'learn').slice(0, 10)
            return { ok: true, message: rows.length ? rows.map((x) => `${x.kind === 'learn' ? '学到' : '看了'}：${x.take || x.title || x.id}`).join('\n') : '最近没刷', rows }
          }),
        }))
        tools.push(defineTool({
          name: 'xhs_learn',
          description: '查她从小红书学到的东西（按话题）。有人问「你最近学了什么」「你知道 X 吗」时用。',
          properties: { topic: str('话题，可留空') },
          execute: guarded('xhsBrowse', async ({ topic }) => {
            const kw = String(topic || '').trim()
            const list = (xhs.state().topics || []).filter((t) => !kw || t.name.includes(kw) || kw.includes(t.name))
            return { ok: true, message: list.length ? list.map((t) => `${t.name}（${t.count} 篇）：${t.summary}`).join('\n') : '还没学到什么', topics: list }
          }),
        }))
      }
      return tools
    })

    api.route('/xhs/state', async () => ({ ok: true, ...xhs.state() }))
    api.route('/xhs/login', async () => {
      try {
        const acc = await xhs.login()
        return acc ? { ok: true, account: acc, message: `已登录：${acc.nickname}` } : { ok: false, message: '还没登录：浏览器窗口已打开，用小红书 App 扫码后再点一次' }
      } catch (error) {
        return { ok: false, message: `打不开浏览器：${error.message}` }
      }
    })
    api.route('/xhs/run', async () => xhs.run({ force: true }))
    api.route('/xhs/review', async () => xhs.review({ force: true }))
    return xhs
  },
}
