# 哈洛 · Halobot

> 住在 QQ 里的 AI 伙伴，一个 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（DSH）插件。
> 她有自己的 QQ 号、人格、心情和长期记忆，会看会听会说，也会自己写日记、逛空间、刷帖、找你搭话。

```
QQ ⇄ SnowLuma（OneBot v11）⇄ Halobot 插件 ⇄ DSH 会话（自带 preset + 人格）
```

- **入口**：DSH 左侧栏的「Halobot」面板，5 组 22 个页签，概览上有模型用量卡。
- **本体**：每个 QQ 私聊 / 群对应一个 DSH 会话，放在「Halobot · QQ」工作区，能点开看她想了什么、调了什么工具、直接插话。
- **数据**：都在 `~/.dsh/plugins-data/halobot/`，卸载插件也不删。

## 她能做什么

- **聊天**：私聊、群聊（被 @ 或叫名字才回，群聊有插话概率、冷却、时段和每小时上限）。回复跟着她自己打的停顿（空格、空行）分几条发，超过上限才合并；你连发时她会等你说完，被打断会把剩下的留到下一轮。
- **表达**：edge-tts / CosyVoice / GPT-SoVITS / 任意 HTTP 接口发语音；收发 QQ 表情包（能偷、能批量导入、能让模型按图打标）；会看图、会画图（智谱 BigModel / 自定义接口）。
- **记忆**：长期记忆（BM25 + 遗忘曲线 + 有效期），每天整理人物小档案、相处经验和说话方式，会写「这一天的印象」；能手动增删、导出导入。
- **情绪与社交**：心情按半衰期回落，可用模型判断；主动搭话、空间写日记、逛空间、B 站评论、抖音私信、小红书刷帖、小黑盒看帖发帖。
- **管理**：权限分级（主人 / 白名单 / 陌生人）、危险命令确认、模块热插拔、备份迁移（可定时）；概览和统计页能看 token、缓存命中率、分时段花费。

## 安装

```bash
# 从 GitHub 装（推荐，认准 tag）
dsh plugin --profile desktop add github:HelloGitHub-zjh/dsh-halobot#v3.12.0

# 或者 clone 下来本地装
dsh plugin --profile desktop add file:/绝对路径/dsh-halobot
```

装完检查 `~/.dsh/profiles/desktop/package.json`：`dependencies` 和 `dsh.profile.bundles` 里都有 `dsh-halobot`，然后重启 DSH。

- **升级**：换 tag 重跑上面的 add，再重启。
- **卸载**：`dsh plugin --profile desktop remove dsh-halobot`，数据目录不动。
- **本地改代码**：profile 里这条是按 tag 钉住的，DSH 启动会按声明重装，直接 `cp` 进 `node_modules` 会在下次启动被还原——要么发版（打 tag → 改 tag → `pnpm install`），要么临时用 `file:` 装。

## 第一次用（约 10 分钟）

1. **连接**：装好 SnowLuma（OneBot v11）并用小号登录，把 WebSocket 地址、token、机器人 QQ、主人 QQ 填进「系统 → 连接」。
2. **模型**：「系统 → 模型」选一个能看图、能调工具的模型。
3. **开机**：「概览」打开总开关、关掉试运行，私聊她一句。
4. **人格**：「人设 → 人格」改她叫什么、什么性格，保存即生效。

小白版步骤见 [docs/USER-MANUAL.md](docs/USER-MANUAL.md)。

## 面板

| 分组 | 页签 |
| --- | --- |
| 概览 | 概览（状态 + 今日计数 + 模型用量卡）、统计（逐日收发、按会话 token） |
| 人设 | 人格、聊天、会话管理、主动搭话、心情、记忆 |
| 表达 | 语音、表情包、生图、翻唱 |
| 平台 | 空间日记、B站、抖音、小红书、小黑盒 |
| 系统 | 连接、模型、权限、本地接口、扩展、备份迁移、日志 |

长列表都是分页表格（一页 10 条），长文字截断、悬停看全文；模块没启用的页签会自动隐藏。

## 数据与备份

```
config.json           设置（含网关 token、API Key，别外发）
personas/ memories.json    人格卡、长期记忆与人物档案
chatlog/ stats.json usage.json   聊天流水、收发计数、模型用量账本
stickers/ local/      表情库、本地接口脚本
backups/ logs/        备份、运行日志
```

「系统 → 备份迁移」能把任意几项打包成一个 JSON 导出，导入前会先备份现有文件；包里含 API Key，**别发给别人**。也能开自动备份（间隔最短 1 小时，只留最近几份）。

## 用量与花费

概览的用量卡按**北京时间**分高峰 / 空闲两套单价：工作日 9:00–12:00、14:00–18:00 是高峰，其余时间（含周末和法定节假日）是空闲。默认单价（元 / 百万 token）：

| | 输入（未命中） | 输入（命中） | 输出 |
| --- | --- | --- | --- |
| 空闲 | 1 | 0.02 | 4 |
| 高峰 | 2 | 0.04 | 8 |

单价在「系统 → 模型」最下面填；跨年假期或调休可以用 `usage.holidays` / `usage.workdays` 补。后台小任务（整理记忆、判断心情等）的 token 也计入。

## 本地接口

在 `local/` 下放脚本，面板「系统 → 本地接口」打开开关，改完保存自动热加载：

```js
// tts.mjs / asr.mjs / song.mjs
export default async ({ text, outDir, log }) => 音频文件路径
```

出错就抛错，插件自动回退内置实现；说明见 `local/README-本地接口.md`。

## 扩展模块

内置模块在 `src/modules/`，复制一份到 `modules/<id>/` 导出同名函数就能覆盖内置实现，保存即生效，升级不覆盖。接口文档：[src/modules/API.md](src/modules/API.md)。

## 关于这个仓库

个人维护的独立分支，基线是 [accomplish07zrh-eng/dsh-aurabot-qq](https://github.com/accomplish07zrh-eng/dsh-aurabot-qq) 的 1.1.24（MIT），已整体改名为 Halobot / 哈洛：包名 `dsh-halobot`，面板 id `halobot`，接口前缀 `/halobot/api`，preset `halobot-private` / `halobot-private-long` / `halobot-social`，人格 `personas/halobot.md`。

和上游没有同步关系，需要的改动逐条移植并记在 [CHANGELOG.md](CHANGELOG.md)。

## 安全提醒

- 机器人一定用**小号**：SnowLuma 这类非官方客户端有被限制或封号的风险。
- 陌生人默认没有任何本地工具权限；群聊里她也没有操作电脑的能力，只有主人私聊 + 权限「完整」时才可以。
- 面板里的 API Key、网关 token、导出的备份包都算敏感信息。

## 许可

MIT，见 [LICENSE](LICENSE)。基于 Aurabot 1.1.24 修改，原作者版权与修改声明保留在 LICENSE 里。
