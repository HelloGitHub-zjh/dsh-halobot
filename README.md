# 哈洛 · Halobot

> **住在 QQ 里的 AI 伙伴**，一个 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（DSH）插件。
> 她有自己的 QQ 号、人格、心情和长期记忆，会看会听会说，也会自己发日记、逛空间、刷帖、找你搭话。

```
QQ ⇄ SnowLuma（OneBot v11）⇄ Halobot 插件 ⇄ DSH 会话（自带 preset + 人格）
```

- **入口**：DSH 左侧栏里的「Halobot」面板，共 5 组、22 个页签，概览上还有一张模型用量卡（token / 缓存命中率 / 分时段花费）。
- **数据**：一切都在 `~/.dsh/plugins-data/halobot/`，卸载插件也不会删。
- **本体**：每个 QQ 私聊 / 群对应一个 DSH 会话，放在侧栏的「Halobot · QQ」工作区，可以点开看她想了什么、调了什么工具、直接插话。

## 关于这个仓库

这是一个**个人维护的独立分支**，基线是 [accomplish07zrh-eng/dsh-aurabot-qq](https://github.com/accomplish07zrh-eng/dsh-aurabot-qq) 的 1.1.24（MIT 许可），已整体改名为 Halobot / 哈洛：

| 项目 | 现在的名字 |
| --- | --- |
| 包名 | `dsh-halobot` |
| 插件实例 id / 面板 id | `halobot` |
| HTTP 接口前缀 | `/halobot/api` |
| 数据目录 | `~/.dsh/plugins-data/halobot/` |
| agent preset | `halobot-private` / `halobot-private-long` / `halobot-social` |
| 人格文件 | `personas/halobot.md` |

和上游没有同步关系：上游的更新不会自动进来，需要时挑单个提交移植，并记在 [CHANGELOG.md](CHANGELOG.md)。

## 她能做什么

- **聊天**：私聊、群聊，被 @ 或叫名字才回；群聊有插话概率、冷却、时段、每小时上限，多个群可以分别设策略。回复不按行拆条，由插件按长度决定一条还是两条；你连发时她会等你说完，说到一半被打断会停下留到下一轮；她问完一句没人接，过一会儿会自己补一句催（私聊，按语气判断算不算在问，可关）。
- **表达**：edge-tts / CosyVoice / GPT-SoVITS / 任意 HTTP 接口发语音，收发 QQ 表情包（能从聊天里把别人的表情偷进库、从文件夹批量导入，标签可以手动改，也可以让模型按图重打标；她自己想发表情的概率可调；回复里写到 QQ 小黄脸时会自动发成系统表情，夹带的概率可调），会看图，会画图（智谱 BigModel / 自定义接口，自定义接口可以自己填请求体；生图页能填 Key、选模型和尺寸，还有「试画一张」当场验证）。
- **记忆**：长期记忆（BM25 + 遗忘曲线，带类型和有效期）、每天定时整理出人物小档案 / 相处经验 / 说话方式，还会每天写一段「这一天的印象」；能翻聊天原文、能手动增删、能导出导入；面板里有人物卡片墙，后台调用次数可以在面板里设上限。
- **情绪**：心情值按半衰期自然回落，聊得好会变好，也能用模型判断情绪（默认只抽 25% 的轮次问模型，另有冷却和变化阈值，不开也只按关键词打分）；面板「心情」页能看近 7 天的平均值曲线。
- **社交**：主动搭话（和「目的引擎」互斥，同一时间只跑一套）、QQ 空间写日记 / 逛空间回评论、B 站发评论、抖音私信、小黑盒看帖发帖。
- **创作**：用她自己（或你指定的）音色翻唱，需要本地 Applio + RVC 环境。
- **管理**：权限分级（主人 / 白名单 / 陌生人）、群管、联系人、危险命令确认、模块热插拔、完整备份迁移（可定时自动备份）。
- **看清楚**：概览一张卡看今天的 token、缓存命中率和分时段花费；「统计」页看近 7 / 30 天每天收发了多少、每个 QQ 会话用了多少 token；「日志」页能按模块筛、按关键词搜、整天下载。

## 安装

```bash
# 从 GitHub 装（推荐，认准 tag）
dsh plugin --profile desktop add github:HelloGitHub-zjh/dsh-halobot#v3.10.0

# 或者 clone 下来本地装
git clone git@github.com:HelloGitHub-zjh/dsh-halobot.git
dsh plugin --profile desktop add file:/绝对路径/dsh-halobot
```

装完检查 `~/.dsh/profiles/desktop/package.json`：`dependencies` 里有 `dsh-halobot`，`dsh.profile.bundles` 里有 `dsh-halobot`，然后重启 DSH。

- **升级**：`dsh plugin --profile desktop add github:HelloGitHub-zjh/dsh-halobot#v3.x.x` 后重启。
- **卸载**：`dsh plugin --profile desktop remove dsh-halobot`。数据目录不会删。
- **本地改代码后**：`~/.dsh/profiles/desktop/package.json` 里这条是按 tag 钉住的，DSH 启动会按声明重装，直接把文件 `cp` 到 `node_modules` 会在下次启动被还原。要么走上面的发版流程（打 tag → 改 tag → `pnpm install`），要么临时用 `dsh plugin --profile desktop add file:/绝对路径/dsh-halobot`。

## 第一次用（大约 10 分钟）

1. **连接**：装好 SnowLuma（OneBot v11）并用机器人小号登录，把它的 WebSocket 地址、token、机器人 QQ、主人 QQ 填进面板「系统 → 连接」。
2. **模型**：面板「系统 → 模型」选一个能干活的模型（能看图、能调工具的更好）。
3. **开总开关**：面板「概览」把总开关打开、试运行关掉，QQ 里私聊她一句试试。
4. **人格**：「人设 → 人格」可以改她叫什么、什么性格，保存即生效。

详细的小白版步骤见 [docs/USER-MANUAL.md](docs/USER-MANUAL.md)。

## 面板一览

| 分组 | 页签 |
| --- | --- |
| 概览 | 概览（状态条 + 今日各项计数 + 模型用量卡：今天 token / 缓存命中率 / 分时段花费 + 快捷操作）、统计（近 7 / 30 天逐日收发、每天明细、按会话的 token 表格） |
| 人设 | 人格、聊天、会话管理（每条 QQ 会话一条 DSH 会话，可单独重新开始）、主动搭话、心情、记忆 |
| 表达 | 语音、表情包、生图、翻唱 |
| 平台 | 空间日记、B站、抖音、小黑盒 |
| 系统 | 连接（含一键自检）、模型（含分时段单价）、权限、本地接口、扩展、备份迁移（含自动备份）、日志（搜索 / 下载） |

会一直变长的列表（刷过什么、记忆、日记、日志文件、会话、按会话、心情历史）都做成了分页表格，一页 10 条；长文字默认截断，鼠标移上去看全文。

模块没启用的页签会自动隐藏。

## 数据与备份

所有数据都在 `~/.dsh/plugins-data/halobot/`：

```
config.json          设置（含网关 token、API Key，别外发）
personas/            人格卡
memories.json        长期记忆 + 人物小档案 + 相处经验 + 说话方式
chatlog/             聊天流水（按天，JSONL）
chatlog-archive/     整理过的流水归档（默认留 60 天）
stats.json           每天收发计数（留 30 天，含按会话的当天计数）
usage.json           模型用量账本（今天的高峰 / 空闲 token、后台调用次数、近 7 天）
diary.json mood.json qzone-social.json speakup.json   各模块的状态
stickers/            表情库（index.json + 图片）
local/               本地接口脚本（tts.mjs / asr.mjs / song.mjs）
backups/             导入前的备份 + 自动备份（auto-时间.json，按份数轮转）
logs/                运行日志
```

面板「系统 → **备份迁移**」可以把上面任意几项打包成一个 JSON 文件导出，换机器时再导回去；导入前会先把现有文件备份到 `backups/import-<时间>/`，出问题能退回去。包里含 API Key 和网关 token，**别发给别人**。

「备份迁移」里还能打开**自动备份**：按间隔（最短 1 小时）把整份数据打包进 `backups/`，只留最近几份，可在列表里直接恢复或删除。数据体积大的话间隔别设太短。

## 用量与花费

概览的「模型用量」卡按**北京时间**分两套单价记账：周一至周五 9:00–12:00、14:00–18:00 是**高峰**，其余时间（含周末、中国法定节假日全天）是**空闲**。默认单价就是官方价目（元 / 百万 token）：

| | 输入（缓存未命中） | 输入（缓存命中） | 输出 |
| --- | --- | --- | --- |
| 空闲时段 | 1 | 0.02 | 4 |
| 高峰时段 | 2 | 0.04 | 8 |

单价在面板「系统 → 模型」最下面分两组填。内置了 2026 年的放假安排；跨年的假、或者官方调休补班的周末，可以在配置里用 `usage.holidays` / `usage.workdays`（`YYYY-MM-DD` 数组）补。没填单价时只显示 token，不显示钱。

缓存命中率用 DSH 自己的口径：缓存读 ÷（未命中 + 缓存读 + 缓存写），和 DSH 会话里看到的数字一致。后台小任务（整理记忆、判断心情、表情备注、B 站看图……）花的 token 也算在里面，会计入「后台调用 N 次」。

## 本地接口（自己接 TTS / ASR / 翻唱）

在数据目录 `local/` 下放脚本，面板「系统 → 本地接口」打开对应开关即可，改完保存自动热加载：

- `tts.mjs`：`export default async ({ text, outDir, log }) => 音频文件路径`
- `asr.mjs`：`export default async ({ file, log }) => 文本`
- `song.mjs`：`export default async ({ text, voice, outDir, log }) => 音频文件路径`

失败会抛错，插件自动回退内置实现。接口说明见 `local/README-本地接口.md`。

## 扩展模块

内置模块都在 `src/modules/`，每个都能关、能替换：

- 复制一份到数据目录 `modules/<id>/`，导出同名函数就会覆盖内置模块；
- 面板「系统 → 扩展」能看到全部模块、它们的接口和当前状态；
- 自己写的模块保存即生效（有快照和热加载），升级插件不会覆盖。

接口文档：[src/modules/API.md](src/modules/API.md)。

## 目录结构

```
src/host.js            插件入口（宿主半边：路由、preset、网关、定时任务）
src/chat/              会话、消息收发、群策略、权限
src/features/          记忆、表情库、备份、空间、搭话、用量记账等重活
src/modules/           17 个可插拔模块
src/persona/           人格卡加载与提示词注入
src/core/              配置、存储、日志、模型调用、模块沙箱
client/client.js       面板前半边（React，单文件）
personas/halobot.md    默认人格
docs/USER-MANUAL.md    小白使用手册
extensions/            可选扩展（如贴吧阅读器）
```

## 安全提醒

- 机器人一定用**小号**。SnowLuma 这类非官方客户端有被腾讯限制或封号的风险，主号别当机器人。
- 陌生人默认没有任何本地工具权限；群聊里她也没有操作电脑的能力，只有主人私聊 + 权限「完整」时才可以用。
- 面板里的 API Key、网关 token、导出的备份包都属于敏感信息。

## 许可

MIT，见 [LICENSE](LICENSE)。基于 Aurabot 1.1.24 修改，原作者版权与修改声明都保留在 LICENSE 里。
