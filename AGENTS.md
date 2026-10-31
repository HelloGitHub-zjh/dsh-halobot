# 维护约定

## 每次改功能，文档要一起改

- `README.md`：功能概述、面板一览（页签要有对应）、数据目录清单、安装命令里的 tag 版本。
- `CHANGELOG.md`：在最上面加新版本小节，写清「以前怎样 / 现在怎样」，别只写「优化了 xxx」。
- `docs/USER-MANUAL.md`：会影响用户操作的步骤、能看数据的新页面、出问题时去哪儿看。
- `package.json`：功能有变化就升版本号（minor 升一位）。
- 界面上出现的文案（开关说明、提示语）要和文档里的说法一致。

## 改完先自检

- `node --check` 所有改过的 js 文件。
- 宿主半边涉及新路由 / 新配置项时，用独立脚本跑一遍读写（`DSH_HOME` / `HALOBOT_DATA_DIR` 指到临时目录，别碰真实数据）。
- 面板前半边改了组件，可以切片 + 桩渲染做冒烟（放 `/tmp`，不要提交）。
- 往桌面 profile 同步时**不要只 `cp` 到 `node_modules`**：`~/.dsh/profiles/desktop/package.json` 里 `dsh-halobot` 是按 tag 钉住的，DSH 启动会按声明重装，手工复制的内容会被还原（曾经出现安装版本从 3.3.0 变回 3.0.0）。
  正确做法：改代码 → 自检 → 提交 → 打 tag → 把 profile 里那条改成新 tag（`github:HelloGitHub-zjh/dsh-halobot#vX.Y.Z`）→ 在 profile 目录用 DSH 自带的 node/pnpm 跑 `pnpm install`，然后重启。
  只是想临时看效果时，`dsh plugin --profile desktop add file:/绝对路径/dsh-halobot` 也可以。
- 桌面版没有 HMR，改完要重启 DSH 才生效——记得提醒用户。
- 改名字 / 改枚举值时，除了代码还要查数据目录里**已经持久化**的旧值（`sessions.json` 的 preset、`config.json` 的唤醒词等），对不上时要么写映射、要么改数据，否则会悄悄新建会话/丢上下文。

## 提交

- 拆得越碎越好是错的：按用户的节奏，等他说提交时把这一轮改动做成**一个** commit。
- 提交信息用中文，标题一行讲清范围，正文列条目（功能 / 修复 / 文档）。
- 提交后按用户要求打 tag（`vX.Y.Z`）并 push；tag 和 README 里的安装版本要对应。
