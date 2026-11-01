// Halobot · 网页半边：侧栏「自动化任务」下面的「Halobot」入口 + 整页面板（顶部标签切换功能）。
// 只读写宿主半边的 /halobot/api/* 接口，不直接碰会话和 QQ。
// 视觉：沿用 DSH 的主题变量（--dsw-alias-*），浅色 / 深色自动跟随；点缀用哈洛的深蓝、海蓝、白。

window.__ModuleLoader__.load({
  id: 'dsh-halobot',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports
    const React = require('react')
    const { useState, useEffect, useRef, useCallback, useMemo, Fragment } = React
    const h = React.createElement
    const inject = ['slots']
    const PANEL_ID = 'halobot'
    const API = '/halobot/api'

    // ---------------- 小工具 ----------------
    const get = (p) => fetch(API + p, { cache: 'no-store' }).then((r) => r.json()).catch((e) => ({ ok: false, message: '连不上插件：' + e.message }))
    const post = (p, body) =>
      fetch(API + p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body || {}) })
        .then((r) => r.json())
        .catch((e) => ({ ok: false, message: '连不上插件：' + e.message }))
    const clone = (o) => JSON.parse(JSON.stringify(o))
    const setPath = (obj, path, value) => {
      const next = clone(obj)
      let cur = next
      const ks = path.split('.')
      for (let i = 0; i < ks.length - 1; i++) cur = cur[ks[i]] = cur[ks[i]] || {}
      cur[ks[ks.length - 1]] = value
      return next
    }
    const getPath = (obj, path) => path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj)
    const pct = (v) => Math.round((Number(v) || 0) * 100)
    const cx = (...a) => a.filter(Boolean).join(' ')
    // 音调存的是 '+20Hz' 这种字符串，滑条要数字；合法范围 ±80Hz（再往上 edge-tts 服务端会夹）
    const pitchNum = (s) => {
      const m = /^([+-]?\d+)Hz$/i.exec(String(s || ''))
      return m ? Math.max(-80, Math.min(80, Number(m[1]))) : 0
    }
    const pitchText = (n) => (n < 0 ? '-' : '+') + Math.abs(n) + 'Hz'
    const pitchLabel = (n) => (n === 0 ? '正常（+0Hz）' : (n > 0 ? '+' : '') + n + ' Hz')
    const timeAgo = (t) => {
      if (!t) return '—'
      const s = Math.round((Date.now() - t) / 1000)
      if (s < 60) return '刚刚'
      if (s < 3600) return Math.floor(s / 60) + ' 分钟前'
      if (s < 86400) return Math.floor(s / 3600) + ' 小时前'
      return new Date(t).toLocaleDateString()
    }

    // ---------------- 样式（只注入一次） ----------------
    const CSS = `
.ab-root{--ab-deep:#1d3b6f;--ab-sea:#3d7fd6;--ab-sky:#7fb3ee;--ab-foam:rgba(61,127,214,.10);--ab-foam-2:rgba(61,127,214,.18);
  --ab-text:var(--dsw-alias-label-primary,#1f2328);--ab-sub:var(--dsw-alias-label-secondary,#57606a);--ab-dim:var(--dsw-alias-label-tertiary,#8b949e);
  --ab-bg:var(--dsw-alias-bg-base,#fff);--ab-card:var(--dsw-alias-bg-layer-1,#fff);--ab-card-2:var(--dsw-alias-bg-layer-2,#f6f8fa);
  --ab-line:var(--dsw-alias-border-l1,rgba(0,0,0,.08));--ab-line-2:var(--dsw-alias-border-l2,rgba(0,0,0,.12));
  --ab-ok:var(--dsw-alias-state-success-primary,#1a7f37);--ab-warn:var(--dsw-alias-state-warn-primary,#bf8700);--ab-err:var(--dsw-alias-state-error-primary,#cf222e);
  --ab-hover:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.04));
  height:100%;overflow:auto;background:var(--ab-bg);color:var(--ab-text);font-size:13px;line-height:1.6;
  padding:var(--dsh-frame-top-clearance,24px) 0 40px;box-sizing:border-box;font-family:var(--dsh-font-family-ui,inherit)}
body[data-ds-dark-theme] .ab-root,.ab-root.ab-dark{--ab-deep:#9cc4f5;--ab-sea:#6aa6ef;--ab-sky:#a9cdf7;--ab-foam:rgba(106,166,239,.12);--ab-foam-2:rgba(106,166,239,.22)}
.ab-wrap{max-width:1040px;margin:0 auto;padding:0 28px}
.ab-hero{display:flex;align-items:center;gap:18px;padding:18px 20px;border-radius:16px;border:1px solid var(--ab-line);
  background:linear-gradient(120deg,var(--ab-foam-2),var(--ab-foam) 45%,transparent 80%),var(--ab-card);position:relative;overflow:hidden}
.ab-hero:after{content:"";position:absolute;right:-40px;bottom:-60px;width:220px;height:220px;border-radius:50%;background:radial-gradient(circle,var(--ab-foam-2),transparent 70%);pointer-events:none}
.ab-avatar{width:72px;height:72px;border-radius:50%;object-fit:cover;object-position:50% 18%;background:#fff;border:3px solid var(--ab-card);box-shadow:0 0 0 2px var(--ab-sea);flex:none}
.ab-hero h1{margin:0;font-size:20px;font-weight:650;letter-spacing:.5px;color:var(--ab-text)}
.ab-hero .ab-sub{color:var(--ab-sub);margin-top:2px}
.ab-hero-main{flex:1;min-width:0;position:relative;z-index:1}
.ab-hero-side{display:flex;flex-direction:column;gap:8px;align-items:flex-end;position:relative;z-index:1}
.ab-pills{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}
.ab-pill{display:inline-flex;align-items:center;gap:6px;padding:2px 10px;border-radius:999px;font-size:12px;background:var(--ab-card-2);border:1px solid var(--ab-line);color:var(--ab-sub)}
.ab-dot{width:7px;height:7px;border-radius:50%;background:var(--ab-dim)}
.ab-dot.ok{background:var(--ab-ok)}.ab-dot.warn{background:var(--ab-warn)}.ab-dot.err{background:var(--ab-err)}
.ab-nav{position:sticky;top:0;z-index:5;margin:var(--dsh-frame-top-clearance,24px) 0 16px;border:1px solid var(--ab-line);border-radius:14px;background:var(--ab-card);background:color-mix(in srgb,var(--ab-card) 88%,transparent);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);box-shadow:0 1px 2px rgba(0,0,0,.03)}
.ab-nav:before{content:"";position:absolute;left:-28px;right:-28px;bottom:calc(100% + 1px);height:var(--dsh-frame-top-clearance,24px);background:var(--ab-bg);pointer-events:none}
.ab-nav-top{display:flex;align-items:center;gap:6px;padding:6px}
.ab-nav-groups{display:flex;gap:2px;flex:1;min-width:0;overflow-x:auto;scrollbar-width:none}
.ab-nav-groups::-webkit-scrollbar,.ab-nav-sub::-webkit-scrollbar{display:none}
.ab-grp{flex:none;position:relative;display:inline-flex;align-items:center;gap:7px;height:34px;padding:0 14px;border:0;border-radius:10px;background:transparent;color:var(--ab-sub);font:inherit;font-size:13px;cursor:pointer;transition:background .15s,color .15s}
.ab-grp svg{width:16px;height:16px;fill:none;stroke:currentColor;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round;flex:none}
.ab-grp:hover{background:var(--ab-hover);color:var(--ab-text)}
.ab-grp.on{background:var(--ab-foam-2);color:var(--ab-deep);font-weight:600}
.ab-grp .dirty{position:absolute;top:6px;right:6px;width:6px;height:6px;border-radius:50%;background:var(--ab-warn)}
.ab-find-btn{flex:none;display:inline-flex;align-items:center;gap:6px;height:30px;padding:0 8px 0 10px;border:1px solid var(--ab-line);border-radius:9px;background:var(--ab-card-2);color:var(--ab-dim);font:inherit;font-size:12px;cursor:pointer;transition:color .15s,border-color .15s}
.ab-find-btn:hover{color:var(--ab-text);border-color:var(--ab-line-2)}
.ab-find-btn svg{width:14px;height:14px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round}
.ab-nav-sub{display:flex;gap:2px;padding:0 8px;border-top:1px solid var(--ab-line);overflow-x:auto;scrollbar-width:none}
.ab-tab{flex:none;position:relative;border:0;background:transparent;color:var(--ab-sub);padding:9px 12px 10px;font:inherit;font-size:13px;cursor:pointer;white-space:nowrap;display:inline-flex;align-items:center;gap:6px;transition:color .15s}
.ab-tab:hover{color:var(--ab-text)}
.ab-tab:after{content:"";position:absolute;left:12px;right:12px;bottom:-1px;height:2px;border-radius:2px;background:transparent;transition:background .15s}
.ab-tab.on{color:var(--ab-deep);font-weight:600}
.ab-tab.on:after{background:var(--ab-sea)}
.ab-tab .ab-dot{width:6px;height:6px}
.ab-finder{position:absolute;right:6px;top:calc(100% + 6px);width:340px;max-width:calc(100% - 12px);padding:8px;border:1px solid var(--ab-line-2);border-radius:12px;background:var(--ab-card);box-shadow:0 14px 36px rgba(0,0,0,.16);z-index:20}
.ab-finder .ab-input{width:100%}
.ab-finder-list{margin-top:6px;max-height:300px;overflow:auto;display:flex;flex-direction:column;gap:1px}
.ab-finder-item{display:flex;align-items:center;gap:8px;width:100%;text-align:left;border:0;background:transparent;border-radius:8px;padding:7px 10px;font:inherit;font-size:13px;color:var(--ab-text);cursor:pointer}
.ab-finder-item small{margin-left:auto;color:var(--ab-dim);font-size:11.5px}
.ab-finder-item.on,.ab-finder-item:hover{background:var(--ab-foam)}
.ab-finder-empty{padding:12px 10px;color:var(--ab-dim);font-size:12px}
@media (max-width:640px){.ab-grp{padding:0 10px;gap:5px}.ab-find-btn .t,.ab-find-btn .ab-kbd{display:none}.ab-finder{left:6px;right:6px;width:auto;max-width:none}}
.ab-grid{display:grid;gap:12px;grid-template-columns:minmax(0,1fr)}
.ab-grid>*{min-width:0}
.ab-g2{grid-template-columns:repeat(auto-fit,minmax(min(300px,100%),1fr))}
.ab-g4{grid-template-columns:repeat(auto-fit,minmax(min(150px,100%),1fr))}
.ab-card{background:var(--ab-card);border:1px solid var(--ab-line);border-radius:14px;padding:16px 18px;min-width:0}
.ab-card h3{margin:0 0 4px;font-size:14px;font-weight:620;display:flex;align-items:center;gap:8px}
.ab-card .ab-desc{color:var(--ab-sub);font-size:12.5px;margin:0 0 12px}
.ab-stat{padding:14px 16px}
.ab-stat .n{font-size:24px;font-weight:650;color:var(--ab-deep);font-variant-numeric:tabular-nums}
.ab-stat .l{color:var(--ab-sub);font-size:12px}
/* 概览「今天」那一条小指标：不用卡片，一行紧凑排开 */
.ab-metrics{display:grid;grid-template-columns:repeat(auto-fit,minmax(96px,1fr));gap:10px 12px}
.ab-metric .n{font-size:20px;font-weight:650;line-height:1.35;color:var(--ab-deep);font-variant-numeric:tabular-nums}
.ab-metric .l{color:var(--ab-sub);font-size:12px}
.ab-row{display:flex;align-items:flex-start;gap:16px;padding:10px 0;border-top:1px solid var(--ab-line)}
.ab-row:first-of-type{border-top:0}
.ab-row .ab-label{flex:0 0 180px;padding-top:5px}
.ab-row .ab-label b{display:block;font-weight:560}
.ab-row .ab-label small{display:block;color:var(--ab-dim);font-size:11.5px;line-height:1.45;margin-top:2px}
.ab-row .ab-ctl{flex:1;min-width:0;display:flex;align-items:center;gap:8px;flex-wrap:wrap}
@media (max-width:640px){.ab-row{flex-direction:column;gap:6px}.ab-row .ab-label{flex:none}.ab-wrap{padding:0 14px}.ab-hero{flex-wrap:wrap}.ab-hero-side{align-items:flex-start}}
.ab-input,.ab-select,.ab-textarea{border:1px solid var(--ab-line-2);border-radius:8px;padding:6px 10px;background:var(--ab-card);color:var(--ab-text);font:inherit;outline:none;min-width:0;box-sizing:border-box}
.ab-input:focus,.ab-select:focus,.ab-textarea:focus{border-color:var(--ab-sea);box-shadow:0 0 0 3px var(--ab-foam-2)}
.ab-input{width:240px;max-width:100%}.ab-input.sm{width:90px}.ab-input.wide{width:100%}
.ab-textarea{width:100%;min-height:90px;resize:vertical;line-height:1.55;font-family:var(--dsh-font-family-code,ui-monospace,monospace);font-size:12.5px}
.ab-btn{border:1px solid var(--ab-line-2);background:var(--ab-card);color:var(--ab-text);padding:6px 14px;border-radius:8px;font:inherit;cursor:pointer;display:inline-flex;align-items:center;gap:6px;white-space:nowrap}
.ab-btn:hover{background:var(--ab-hover)}
.ab-btn:disabled{opacity:.5;cursor:default}
.ab-btn.primary{background:var(--ab-sea);border-color:var(--ab-sea);color:#fff}
.ab-btn.primary:hover{filter:brightness(1.07)}
.ab-btn.danger{color:var(--ab-err)}
.ab-btn.ghost{border-color:transparent;background:transparent;color:var(--ab-sub)}
.ab-btn.sm{padding:3px 10px;font-size:12px}
.ab-switch{position:relative;width:38px;height:22px;border-radius:999px;background:var(--ab-line-2);border:0;cursor:pointer;flex:none;transition:background .15s}
.ab-switch:after{content:"";position:absolute;top:3px;left:3px;width:16px;height:16px;border-radius:50%;background:#fff;box-shadow:0 1px 2px rgba(0,0,0,.2);transition:left .15s}
.ab-switch.on{background:var(--ab-sea)}.ab-switch.on:after{left:19px}
.ab-switch-row{display:flex;align-items:center;gap:10px}
.ab-seg{display:inline-flex;border:1px solid var(--ab-line-2);border-radius:9px;overflow:hidden}
.ab-seg button{border:0;background:transparent;padding:6px 14px;font:inherit;color:var(--ab-sub);cursor:pointer;border-left:1px solid var(--ab-line)}
.ab-seg button:first-child{border-left:0}
.ab-seg button.on{background:var(--ab-foam-2);color:var(--ab-deep);font-weight:600}
.ab-seg.off{opacity:.45}
.ab-seg.off button{cursor:not-allowed}
.ab-note{padding:10px 12px;border-radius:10px;background:var(--ab-foam);color:var(--ab-text);font-size:12.5px;border:1px solid var(--ab-foam-2)}
.ab-note.warn{background:rgba(191,135,0,.08);border-color:rgba(191,135,0,.25)}
.ab-note.err{background:rgba(207,34,46,.07);border-color:rgba(207,34,46,.25)}
.ab-steps{counter-reset:s;display:flex;flex-direction:column;gap:10px}
.ab-step{display:flex;gap:12px;align-items:flex-start}
.ab-step:before{counter-increment:s;content:counter(s);flex:none;width:22px;height:22px;border-radius:50%;background:var(--ab-foam-2);color:var(--ab-deep);font-weight:650;display:flex;align-items:center;justify-content:center;font-size:12px}
.ab-step.done:before{content:"✓";background:var(--ab-ok);color:#fff}
.ab-step > div{flex:1;min-width:0}
.ab-kv{display:grid;grid-template-columns:auto 1fr;gap:6px 14px;font-size:12.5px}
.ab-kv span:nth-child(odd){color:var(--ab-sub)}
.ab-stickers{display:grid;grid-template-columns:repeat(auto-fill,minmax(112px,1fr));gap:10px}
.ab-shots{display:grid;grid-template-columns:repeat(auto-fill,minmax(168px,1fr));gap:10px}
.ab-shot{border:1px solid var(--ab-line);border-radius:12px;padding:6px;background:var(--ab-card);display:flex;flex-direction:column;gap:6px;position:relative}
.ab-shot img{width:100%;aspect-ratio:16/9;object-fit:cover;border-radius:8px;background:var(--ab-card-2);display:block}
.ab-shot .cap{font-size:11px;color:var(--ab-dim);line-height:1.35;max-height:2.7em;overflow:hidden}
.ab-shot .x{position:absolute;top:10px;right:10px;opacity:0;transition:opacity .15s}
.ab-shot:hover .x{opacity:1}
.ab-sticker{border:1px solid var(--ab-line);border-radius:12px;padding:8px;background:var(--ab-card);display:flex;flex-direction:column;gap:6px;position:relative}
.ab-sticker img{width:100%;aspect-ratio:1;object-fit:contain;border-radius:8px;background:var(--ab-card-2)}
.ab-sticker .nm,.ab-sticker .tg{border:1px dashed transparent;background:transparent;text-align:center;width:100%;outline:none;padding:2px 4px;border-radius:6px;box-sizing:border-box}
.ab-sticker .nm{font-size:12px;color:var(--ab-text)}
.ab-sticker .tg{font-size:11px;color:var(--ab-dim);min-height:16px}
.ab-sticker:hover .nm,.ab-sticker:hover .tg{border-color:var(--ab-line)}
.ab-sticker .nm:focus,.ab-sticker .tg:focus{background:var(--ab-card-2);border-style:solid;border-color:var(--ab-line)}
.ab-sticker .x{position:absolute;top:4px;right:4px;opacity:0;transition:opacity .15s}
.ab-sticker .rc{position:absolute;top:4px;left:4px;opacity:0;transition:opacity .15s}
.ab-sticker:hover .rc{opacity:1}
.ab-busy{display:inline-flex;align-items:center;gap:6px;font-size:12px;color:var(--ab-sub)}
.ab-sticker:hover .x{opacity:1}
.ab-list{display:flex;flex-direction:column}
.ab-li{display:flex;gap:12px;align-items:flex-start;padding:10px 0;border-top:1px solid var(--ab-line)}
.ab-li:first-child{border-top:0}
.ab-li .meta{color:var(--ab-dim);font-size:11.5px;white-space:nowrap}
.ab-li .body{flex:1;min-width:0;white-space:pre-wrap;word-break:break-word}
.ab-logs{font-family:var(--dsh-font-family-code,ui-monospace,monospace);font-size:12px;max-height:520px;overflow:auto;border-radius:10px;background:var(--ab-card-2);padding:8px 0}
.ab-log{display:flex;gap:10px;padding:2px 12px;align-items:baseline}
.ab-log:hover{background:var(--ab-hover)}
.ab-log .t{color:var(--ab-dim);flex:none}
.ab-log .a{flex:none;color:var(--ab-sea);min-width:62px}
.ab-log .m{flex:1;min-width:0;white-space:pre-wrap;word-break:break-word}
.ab-log.warn .m{color:var(--ab-warn)}.ab-log.error .m{color:var(--ab-err)}.ab-log.debug .m{color:var(--ab-dim)}
.ab-persona{display:grid;grid-template-columns:240px 1fr;gap:12px}
@media (max-width:760px){.ab-persona{grid-template-columns:1fr}}
.ab-plist{display:flex;flex-direction:column;gap:6px}
.ab-pitem{text-align:left;border:1px solid var(--ab-line);background:var(--ab-card);border-radius:10px;padding:10px 12px;cursor:pointer;color:var(--ab-text);font:inherit}
.ab-pitem:hover{border-color:var(--ab-line-2)}
.ab-pitem.on{border-color:var(--ab-sea);box-shadow:0 0 0 3px var(--ab-foam)}
.ab-pitem .nm{font-weight:600;display:flex;align-items:center;gap:6px}
.ab-pitem .tg{color:var(--ab-dim);font-size:11.5px;margin-top:2px}
.ab-badge{font-size:10.5px;padding:0 6px;border-radius:999px;background:var(--ab-sea);color:#fff;font-weight:500}
.ab-psecs{display:flex;flex-direction:column;gap:10px;margin-top:12px}
.ab-psec{--c:var(--ab-sea);position:relative;overflow:hidden;border:1px solid var(--ab-line);border-radius:14px;background:var(--ab-card);background:radial-gradient(120% 140% at 0 0,color-mix(in srgb,var(--c) 7%,transparent),transparent 46%),var(--ab-card);transition:border-color .2s,box-shadow .2s}
.ab-psec:before{content:"";position:absolute;left:0;top:14px;bottom:14px;width:3px;border-radius:0 3px 3px 0;background:var(--c);background:linear-gradient(180deg,var(--c),color-mix(in srgb,var(--c) 18%,transparent))}
.ab-psec:hover{border-color:color-mix(in srgb,var(--c) 22%,var(--ab-line))}
.ab-psec:focus-within{border-color:var(--c);border-color:color-mix(in srgb,var(--c) 38%,var(--ab-line));box-shadow:0 0 0 3px var(--ab-foam);box-shadow:0 0 0 4px color-mix(in srgb,var(--c) 8%,transparent),0 6px 18px -10px color-mix(in srgb,var(--c) 45%,transparent)}
.ab-psec-head{display:flex;align-items:center;gap:4px;padding:10px 8px 0 18px}
.ab-psec-head:before{content:"";flex:none;width:6px;height:6px;border-radius:50%;background:var(--c);margin-right:8px;opacity:.9}
.ab-psec-title{flex:1;min-width:0;border:0;background:transparent;font:inherit;font-weight:600;font-size:13.5px;letter-spacing:.02em;color:var(--ab-text);color:color-mix(in srgb,var(--c) 42%,var(--ab-text));padding:4px 0;outline:none}
.ab-psec-title::placeholder{color:var(--ab-dim);font-weight:400}
.ab-psec-fixed{flex:1;min-width:0;font-weight:620;font-size:13.5px;padding:4px 0}
.ab-psec-fixed small{font-weight:400;color:var(--ab-dim);margin-left:8px;font-size:11.5px}
.ab-psec-n{font-size:11px;color:var(--ab-dim);font-variant-numeric:tabular-nums;margin-right:4px}
.ab-psec-act{display:flex;align-items:center;gap:2px;opacity:.5;transition:opacity .12s}
.ab-psec:hover .ab-psec-act,.ab-psec:focus-within .ab-psec-act{opacity:1}
.ab-ibtn{width:26px;height:26px;display:inline-flex;align-items:center;justify-content:center;border:0;border-radius:7px;background:transparent;color:var(--ab-sub);cursor:pointer;padding:0}
.ab-ibtn svg{width:14px;height:14px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
.ab-ibtn:hover{background:var(--ab-hover);color:var(--ab-text)}
.ab-ibtn.danger:hover{color:var(--ab-err)}
.ab-ibtn:disabled{opacity:.3;cursor:default;background:transparent}
.ab-aibtn{display:inline-flex;align-items:center;gap:5px;height:26px;padding:0 10px;margin-left:2px;border:0;border-radius:7px;background:var(--ab-foam);color:var(--ab-deep);font:inherit;font-size:12px;cursor:pointer;transition:background .12s}
.ab-aibtn:hover,.ab-aibtn.on{background:var(--ab-foam-2)}
.ab-psec .ab-aibtn{background:transparent;color:var(--ab-sub);opacity:.5;transition:opacity .12s,background .12s,color .12s}
.ab-psec:hover .ab-aibtn,.ab-psec:focus-within .ab-aibtn{opacity:1}
.ab-psec .ab-aibtn:hover,.ab-psec .ab-aibtn:disabled{background:color-mix(in srgb,var(--c) 10%,transparent);color:color-mix(in srgb,var(--c) 65%,var(--ab-text));opacity:1}
.ab-aibtn svg{width:13px;height:13px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
.ab-psec textarea{display:block;width:100%;box-sizing:border-box;border:0;background:transparent;resize:vertical;outline:none;padding:6px 16px 12px 30px;font:inherit;font-size:13px;line-height:1.75;color:var(--ab-text)}
.ab-psec textarea::placeholder{color:var(--ab-dim)}
.ab-psec.cmp{border-color:var(--c);border-color:color-mix(in srgb,var(--c) 45%,var(--ab-line));box-shadow:0 0 0 3px var(--ab-foam);box-shadow:0 0 0 4px color-mix(in srgb,var(--c) 10%,transparent)}
.ab-chip.on{border-style:solid;border-color:var(--ab-sea);background:var(--ab-foam-2);color:var(--ab-deep);font-weight:600}
.ab-chip .n{margin-left:6px;font-size:11px;color:var(--ab-dim);font-weight:400}
.ab-tf-who{margin-top:8px;font-size:12px;color:var(--ab-sub);line-height:1.6}
.ab-psec.cmp textarea{cursor:default}
.ab-compare{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:0 12px 12px;padding:8px 8px 8px 12px;border-radius:10px;background:var(--ab-foam)}
.ab-compare-tag{font-size:11.5px;font-weight:600;color:var(--ab-deep);padding:1px 8px;border-radius:999px;background:var(--ab-card);border:1px solid var(--ab-foam-2)}
.ab-psec-add{display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-top:12px}
.ab-chip{border:1px dashed var(--ab-line-2);background:transparent;color:var(--ab-sub);border-radius:999px;padding:3px 12px;font:inherit;font-size:12px;cursor:pointer;transition:border-color .12s,color .12s,background .12s}
.ab-chip:hover{border-color:var(--ab-sea);color:var(--ab-deep);background:var(--ab-foam)}
.ab-chip.solid{border-style:solid}
.ab-mood{height:10px;border-radius:999px;background:var(--ab-card-2);overflow:hidden;border:1px solid var(--ab-line)}
.ab-mood > i{display:block;height:100%;border-radius:999px;background:linear-gradient(90deg,var(--ab-sky),var(--ab-sea))}
.ab-savebar{position:sticky;bottom:12px;margin-top:16px;display:flex;align-items:center;gap:12px;padding:10px 14px;border-radius:12px;background:var(--ab-card);border:1px solid var(--ab-sea);box-shadow:0 6px 24px rgba(0,0,0,.12);z-index:6}
.ab-savebar .msg{flex:1;color:var(--ab-deep);font-weight:560}
.ab-toast{position:fixed;left:50%;bottom:28px;transform:translateX(-50%);padding:9px 16px;border-radius:10px;background:var(--dsw-alias-toast-bg,#1f2328);color:var(--dsw-alias-toast-label,#fff);font-size:13px;z-index:50;box-shadow:0 6px 24px rgba(0,0,0,.2);max-width:80vw}
.ab-empty{padding:28px 12px;text-align:center;color:var(--ab-dim)}
.ab-empty .big{font-size:28px;margin-bottom:4px}
.ab-table{width:100%;border-collapse:collapse;font-size:12.5px}
.ab-table th{text-align:left;color:var(--ab-sub);font-weight:500;padding:6px 8px;border-bottom:1px solid var(--ab-line)}
.ab-table td{padding:6px 8px;border-bottom:1px solid var(--ab-line)}
.ab-flex{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.ab-spacer{flex:1}
.ab-muted{color:var(--ab-sub)}
.ab-small{font-size:12px}
.ab-section-title{font-size:12px;font-weight:600;color:var(--ab-dim);letter-spacing:.06em;margin:18px 2px 8px}
.ab-sel{position:relative;display:inline-block;min-width:200px;max-width:100%}
.ab-sel-btn{width:100%;display:flex;align-items:center;gap:8px;border:1px solid var(--ab-line-2);border-radius:9px;padding:6px 10px;background:var(--ab-card);color:var(--ab-text);font:inherit;cursor:pointer;text-align:left}
.ab-sel-btn:hover{border-color:var(--ab-sky)}
.ab-sel-btn:focus-visible,.ab-sel.open .ab-sel-btn{outline:none;border-color:var(--ab-sea);box-shadow:0 0 0 3px var(--ab-foam-2)}
.ab-sel-btn .v{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ab-sel-btn .chev{flex:none;color:var(--ab-dim);transition:transform .15s}
.ab-sel.open .chev{transform:rotate(180deg)}
.ab-sel-pop{position:absolute;z-index:40;top:calc(100% + 6px);left:0;min-width:100%;max-height:300px;overflow:auto;padding:5px;border-radius:12px;background:var(--ab-card);border:1px solid var(--ab-line-2);box-shadow:0 12px 32px rgba(0,0,0,.16);animation:abPop .12s ease-out}
@keyframes abPop{from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:none}}
.ab-sel-opt{display:flex;align-items:flex-start;gap:8px;padding:7px 10px;border-radius:8px;cursor:pointer;color:var(--ab-text);white-space:nowrap}
.ab-sel-opt .ck{width:14px;flex:none;color:var(--ab-sea);font-weight:700}
.ab-sel-opt .tx{flex:1;min-width:0}
.ab-sel-opt .ds{display:block;font-size:11.5px;color:var(--ab-dim);margin-top:1px;white-space:normal}
.ab-sel-opt.act{background:var(--ab-hover)}
.ab-sel-opt.on{background:var(--ab-foam);color:var(--ab-deep);font-weight:560}
.ab-sel-group{font-size:11px;color:var(--ab-dim);padding:6px 10px 2px;letter-spacing:.04em}
.ab-choices{display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:8px;width:100%}
.ab-choice{border:1px solid var(--ab-line-2);border-radius:12px;padding:10px 12px;background:var(--ab-card);cursor:pointer;text-align:left;font:inherit;color:var(--ab-text);transition:border-color .12s,box-shadow .12s}
.ab-choice:hover{border-color:var(--ab-sky)}
.ab-choice.on{border-color:var(--ab-sea);box-shadow:0 0 0 3px var(--ab-foam);background:linear-gradient(var(--ab-foam),var(--ab-foam)),var(--ab-card)}
.ab-choice b{display:flex;align-items:center;gap:6px;font-weight:600}
.ab-choice small{display:block;color:var(--ab-dim);font-size:11.5px;margin-top:3px;line-height:1.45}
.ab-tab .dirty{width:6px;height:6px;border-radius:50%;background:var(--ab-warn)}
.ab-toast.ok{background:var(--ab-ok);color:#fff}.ab-toast.err{background:var(--ab-err);color:#fff}
.ab-kbd{font-family:var(--dsh-font-family-code,monospace);font-size:11px;padding:0 5px;border:1px solid var(--ab-line-2);border-radius:5px;color:var(--ab-dim)}
.ab-spin{display:inline-block;width:12px;height:12px;border:2px solid currentColor;border-right-color:transparent;border-radius:50%;animation:abSpin .7s linear infinite;vertical-align:-2px}
@keyframes abSpin{to{transform:rotate(360deg)}}
.ab-drop{border:2px dashed var(--ab-line-2);border-radius:12px;padding:22px 16px;text-align:center;color:var(--ab-sub);cursor:pointer;transition:border-color .15s,background .15s}
.ab-drop:hover,.ab-drop:focus-visible{border-color:var(--ab-sky);outline:none}
.ab-drop.over{border-color:var(--ab-sea);background:var(--ab-foam);color:var(--ab-deep)}
.ab-avatar-btn{position:relative;padding:0;border:0;background:none;cursor:pointer;border-radius:50%;flex:none}
.ab-avatar-btn .ab-avatar-tip{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;border-radius:50%;background:rgba(15,40,80,.45);color:#fff;font-size:12px;opacity:0;transition:opacity .15s}
.ab-avatar-btn:hover .ab-avatar-tip,.ab-avatar-btn:focus-visible .ab-avatar-tip{opacity:1}
.ab-wiz-bar{display:flex;gap:6px;margin-top:12px}
.ab-wiz-bar .seg{flex:1;border:0;background:transparent;padding:0;cursor:default;text-align:left;font:inherit;color:var(--ab-dim)}
.ab-wiz-bar .seg:before{content:"";display:block;height:4px;border-radius:999px;background:var(--ab-line-2);margin-bottom:6px}
.ab-wiz-bar .seg.done{cursor:pointer;color:var(--ab-sub)}.ab-wiz-bar .seg.done:before{background:var(--ab-sky)}
.ab-wiz-bar .seg.on{color:var(--ab-deep);font-weight:600}.ab-wiz-bar .seg.on:before{background:var(--ab-sea)}
.ab-wiz-bar .seg span{font-size:11.5px}
@media (max-width:640px){.ab-wiz-bar .seg span{display:none}}
.ab-range{display:flex;align-items:center;gap:10px;min-width:240px}
.ab-range input[type=range]{flex:1;accent-color:var(--ab-sea)}
.ab-range .val{min-width:48px;text-align:right;font-variant-numeric:tabular-nums;color:var(--ab-deep);font-weight:600}
/* ---------- 美化 ---------- */
.ab-root{--ab-shadow:0 1px 2px rgba(15,40,80,.04),0 4px 16px rgba(15,40,80,.05);--ab-radius:16px}
body[data-ds-dark-theme] .ab-root,.ab-root.ab-dark{--ab-shadow:0 1px 2px rgba(0,0,0,.3),0 6px 20px rgba(0,0,0,.25)}
.ab-hero{padding:20px 22px;border-radius:20px;box-shadow:var(--ab-shadow);background:
  radial-gradient(120% 140% at 0% 0%,var(--ab-foam-2),transparent 55%),
  linear-gradient(120deg,var(--ab-foam),transparent 70%),var(--ab-card)}
.ab-hero:before{content:"";position:absolute;left:0;right:0;bottom:-1px;height:46px;pointer-events:none;opacity:.55;
  background:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1200 60' preserveAspectRatio='none'%3E%3Cpath d='M0 30c150-26 300 26 450 0s300-26 450 0 225 18 300 8v22H0z' fill='%233d7fd6' fill-opacity='.10'/%3E%3Cpath d='M0 42c180-20 330 18 520 2s340-16 480 2 150 8 200 4v10H0z' fill='%233d7fd6' fill-opacity='.08'/%3E%3C/svg%3E") bottom/100% 100% no-repeat}
.ab-hero h1{font-size:22px}
.ab-pill{background:var(--ab-card);box-shadow:0 1px 1px rgba(15,40,80,.04)}
.ab-grid{gap:14px}
.ab-card{border-radius:var(--ab-radius);padding:18px 20px;box-shadow:var(--ab-shadow);transition:box-shadow .15s}
.ab-card h3{font-size:15px;font-weight:650;color:var(--ab-text)}
.ab-card h3:before{content:"";width:4px;height:15px;border-radius:2px;background:linear-gradient(var(--ab-sky),var(--ab-sea));flex:none}
.ab-card .ab-desc{margin:4px 0 14px;line-height:1.65}
.ab-stat{position:relative;overflow:hidden;padding:16px 18px;background:linear-gradient(150deg,var(--ab-foam),transparent 60%),var(--ab-card)}
.ab-stat .ic{position:absolute;right:14px;top:12px;font-size:22px;opacity:.9}
.ab-stat .n{font-size:28px;line-height:1.2}
.ab-row{padding:12px 0;gap:20px}
.ab-row .ab-label{flex:0 0 200px}
.ab-row .ab-label small{max-width:200px}
.ab-range{max-width:440px}
.ab-range .val{min-width:0;padding:1px 9px;border-radius:999px;background:var(--ab-foam);font-size:12px;white-space:nowrap}
.ab-range input[type=range]{height:4px}
.ab-input,.ab-select,.ab-textarea,.ab-sel-btn{border-radius:10px;transition:border-color .12s,box-shadow .12s}
.ab-input:hover,.ab-textarea:hover{border-color:var(--ab-sky)}
.ab-textarea{font-family:inherit;font-size:13px}
.ab-btn{border-radius:10px;transition:background .12s,border-color .12s,box-shadow .12s,filter .12s}
.ab-btn:focus-visible,.ab-tab:focus-visible,.ab-switch:focus-visible,.ab-choice:focus-visible,.ab-grp:focus-visible,.ab-find-btn:focus-visible,.ab-ibtn:focus-visible,.ab-aibtn:focus-visible,.ab-chip:focus-visible{outline:none;box-shadow:0 0 0 3px var(--ab-foam-2)}
.ab-btn.primary{box-shadow:0 2px 8px color-mix(in srgb,var(--ab-sea) 30%,transparent)}
.ab-btn.danger:hover{background:rgba(207,34,46,.07);border-color:rgba(207,34,46,.3)}
.ab-switch{width:40px;height:23px}.ab-switch:after{width:17px;height:17px}.ab-switch.on:after{left:20px}
.ab-note{border-radius:12px;padding:11px 14px;line-height:1.6}
.ab-choice{border-radius:14px;padding:12px 14px}
.ab-choice.on b{color:var(--ab-deep)}
.ab-li{padding:11px 4px;border-radius:8px}
.ab-li:hover{background:var(--ab-hover)}
.ab-sticker{border-radius:14px;transition:transform .12s,box-shadow .12s}
.ab-sticker:hover{transform:translateY(-2px);box-shadow:var(--ab-shadow)}
.ab-pitem{border-radius:12px;transition:border-color .12s,box-shadow .12s}
.ab-mood{height:12px}
.ab-mood > i{background:linear-gradient(90deg,#9ad0ff,var(--ab-sea) 60%,#7a6cf0)}
.ab-logs{border-radius:12px;border:1px solid var(--ab-line)}
.ab-savebar{border-radius:14px;backdrop-filter:blur(8px)}
.ab-table th{font-size:12px;letter-spacing:.02em}
.ab-table tr:hover td{background:var(--ab-hover)}
.ab-pager{display:flex;align-items:center;justify-content:flex-end;gap:8px;margin-top:10px}
.ab-clip{display:inline-block;max-width:320px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;vertical-align:bottom}
.ab-checks{display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:8px}
.ab-check{display:flex;align-items:center;gap:8px;padding:8px 12px;border-radius:12px;border:1px solid var(--ab-line);background:var(--ab-card-2);color:var(--ab-sub);font-size:12.5px}
.ab-check i{font-style:normal;width:18px;height:18px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;background:var(--ab-line-2);color:#fff;flex:none}
.ab-check.done{color:var(--ab-text);border-color:color-mix(in srgb,var(--ab-ok) 30%,transparent);background:color-mix(in srgb,var(--ab-ok) 7%,var(--ab-card))}
.ab-check.done i{background:var(--ab-ok)}
.ab-drop{border-radius:14px;background:var(--ab-card-2)}
.ab-drives{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px}
.ab-drive{display:flex;flex-direction:column;align-items:flex-start;gap:2px;text-align:left;padding:9px 12px;border-radius:12px;border:1px solid var(--ab-line-2);background:var(--ab-card);color:var(--ab-text);font:inherit;cursor:pointer;transition:border-color .12s,box-shadow .12s}
.ab-drive:hover{border-color:var(--ab-sky)}
.ab-drive.on{border-color:var(--ab-sea);box-shadow:0 0 0 3px var(--ab-foam);background:linear-gradient(var(--ab-foam),var(--ab-foam)),var(--ab-card)}
.ab-drive b{font-weight:600}.ab-drive small{color:var(--ab-dim);font-size:11.5px;word-break:break-all}
.ab-drive .bar{display:block;width:100%;height:4px;border-radius:999px;background:var(--ab-card-2);overflow:hidden;margin-top:4px}
.ab-drive .bar i{display:block;height:100%;background:var(--ab-sky)}
.ab-drive.low .bar i{background:var(--ab-warn)}
.ab-install{margin-top:12px;padding:14px 16px;border-radius:14px;border:1px solid var(--ab-foam-2);background:var(--ab-foam)}
.ab-install-steps{display:flex;gap:6px}
.ab-install-steps .st{flex:1;min-width:0;display:flex;flex-direction:column;align-items:center;gap:4px;font-size:11.5px;color:var(--ab-dim);text-align:center;position:relative}
.ab-install-steps .st:before{content:"";position:absolute;top:11px;left:-50%;right:50%;height:2px;background:var(--ab-line-2);z-index:0}
.ab-install-steps .st:first-child:before{display:none}
.ab-install-steps .st.done:before,.ab-install-steps .st.on:before{background:var(--ab-sea)}
.ab-install-steps .st i{position:relative;z-index:1;font-style:normal;width:22px;height:22px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;background:var(--ab-card);border:2px solid var(--ab-line-2);color:var(--ab-dim)}
.ab-install-steps .st.done i{background:var(--ab-sea);border-color:var(--ab-sea);color:#fff}
.ab-install-steps .st.on i{border-color:var(--ab-sea);color:var(--ab-sea);box-shadow:0 0 0 4px var(--ab-foam-2)}
.ab-install-steps .st.on{color:var(--ab-deep);font-weight:600}
.ab-install-steps .st span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:100%}
.ab-install-dl{display:flex;flex-wrap:wrap;gap:10px 24px;align-items:center;margin-top:10px}
.ab-install-dl small{display:block;color:var(--ab-dim);font-size:11px}
.ab-install-dl b{font-size:18px;font-variant-numeric:tabular-nums}
@media (max-width:640px){.ab-install-steps .st span{display:none}}
@media (max-width:640px){.ab-row .ab-label{flex:none}.ab-row .ab-label small{max-width:none}}
@media (prefers-reduced-motion:reduce){.ab-root *{transition:none!important;animation:none!important}}
.ab-badge.dim{background:var(--ab-card-2);color:var(--ab-sub);border:1px solid var(--ab-line)}
.ab-badge.warn{background:rgba(191,135,0,.14);color:#9a6700;border:1px solid rgba(191,135,0,.3)}
.ab-badge.err{background:rgba(207,34,46,.1);color:var(--ab-err);border:1px solid rgba(207,34,46,.3)}
.ab-badge.mine{background:var(--ab-deep)}
.ab-mod{display:flex;gap:12px;align-items:flex-start;padding:12px 0;border-top:1px solid var(--ab-line)}
.ab-mod:first-child{border-top:0}
.ab-mod .main{flex:1;min-width:0}
.ab-mod .nm{display:flex;flex-wrap:wrap;align-items:center;gap:6px;font-weight:600}
.ab-mod .nm code{font-weight:400;font-size:11.5px;color:var(--ab-dim)}
.ab-mod .ds{color:var(--ab-sub);font-size:12.5px;margin-top:2px}
.ab-mod .what{color:var(--ab-dim);font-size:11.5px;margin-top:4px;word-break:break-word}
.ab-mod .acts{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}
.ab-mod .side{display:flex;flex-direction:column;align-items:flex-end;gap:6px}
.ab-code{font-family:ui-monospace,Consolas,monospace;font-size:11.5px;background:var(--ab-card-2);border:1px solid var(--ab-line);border-radius:8px;padding:8px 10px;white-space:pre-wrap;word-break:break-all;margin:6px 0 0}
`
    function useStyle() {
      useEffect(() => {
        if (document.getElementById('halobot-style')) return
        const el = document.createElement('style')
        el.id = 'halobot-style'
        el.textContent = CSS
        document.head.appendChild(el)
      }, [])
    }

    // ---------------- 图标 ----------------
    function WhaleIcon({ size }) {
      const s = size || 16
      return h('svg', { width: s, height: s, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true },
        h('path', { d: 'M3 13c0 3.6 3.3 6 8 6 4.6 0 8.2-2.7 8.7-6.6.1-.8.8-1.4 1.6-1.4H22c-.3-1.6-1.6-2.6-3-2.6-1.8 0-3 1.2-3.6 2.6H9c-3.4 0-6 .4-6 2Z' }),
        h('path', { d: 'M7.5 3.5c.8.9.9 2.3.2 3.3M10.5 3.5c-.8.9-.9 2.3-.2 3.3M9 6.8V9' }),
        h('circle', { cx: 7.3, cy: 13.3, r: 0.6, fill: 'currentColor' }),
      )
    }

    // ---------------- 基础控件 ----------------
    function Switch({ on, onChange, disabled, title }) {
      return h('button', { type: 'button', className: cx('ab-switch', on && 'on'), onClick: () => !disabled && onChange(!on), disabled, title, role: 'switch', 'aria-checked': !!on })
    }
    function Row({ label, hint, children }) {
      return h('div', { className: 'ab-row' }, h('div', { className: 'ab-label' }, h('b', null, label), hint ? h('small', null, hint) : null), h('div', { className: 'ab-ctl' }, children))
    }
    function Card({ title, desc, icon, right, children, className }) {
      return h('div', { className: cx('ab-card', className) },
        title ? h('div', { className: 'ab-flex', style: { marginBottom: desc ? 0 : 10 } }, h('h3', null, icon || null, title), h('div', { className: 'ab-spacer' }), right || null) : null,
        desc ? h('p', { className: 'ab-desc' }, desc) : null,
        children)
    }
    function Btn({ kind, small, onClick, disabled, children, title }) {
      const [busy, setBusy] = useState(false)
      return h('button', {
        type: 'button', title, className: cx('ab-btn', kind, small && 'sm'), disabled: disabled || busy,
        onClick: async () => { if (!onClick) return; setBusy(true); try { await onClick() } finally { setBusy(false) } },
      }, busy ? [h('i', { key: 's', className: 'ab-spin' }), ' 处理中'] : children)
    }

    /** 自定义下拉：替代系统自带的蓝白 select。options: [{value, label, desc?, group?}] */
    function Select({ value, options, onChange, placeholder, width }) {
      const [open, setOpen] = useState(false)
      const [act, setAct] = useState(-1)
      const ref = useRef(null)
      const cur = options.find((o) => o.value === value)
      useEffect(() => {
        if (!open) return
        const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
        document.addEventListener('mousedown', close)
        return () => document.removeEventListener('mousedown', close)
      }, [open])
      const pick = (o) => { onChange(o.value); setOpen(false) }
      const openAt = () => { setOpen(true); setAct(Math.max(0, options.indexOf(cur))) }
      const onKey = (e) => {
        if (e.key === 'Escape') { setOpen(false); return }
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          e.preventDefault()
          if (!open) return openAt()
          setAct((i) => (i + (e.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length)
        }
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          if (open && options[act]) pick(options[act])
          else openAt()
        }
      }
      let lastGroup = null
      const items = []
      options.forEach((o, i) => {
        if (o.group && o.group !== lastGroup) items.push(h('div', { key: 'g' + i, className: 'ab-sel-group' }, o.group))
        lastGroup = o.group || lastGroup
        items.push(h('div', { key: 'o' + i, role: 'option', 'aria-selected': o.value === value, className: cx('ab-sel-opt', o.value === value && 'on', i === act && 'act'), onMouseEnter: () => setAct(i), onMouseDown: (e) => { e.preventDefault(); pick(o) } },
          h('span', { className: 'ck' }, o.value === value ? '✓' : ''),
          h('span', { className: 'tx' }, o.label, o.desc ? h('span', { className: 'ds' }, o.desc) : null)))
      })
      return h('div', { className: cx('ab-sel', open && 'open'), ref, style: width ? { minWidth: width } : null },
        h('button', { type: 'button', className: 'ab-sel-btn', onClick: () => (open ? setOpen(false) : openAt()), onKeyDown: onKey, 'aria-haspopup': 'listbox', 'aria-expanded': open },
          h('span', { className: 'v' }, cur ? cur.label : h('span', { className: 'ab-muted' }, placeholder || '请选择')),
          h('svg', { className: 'chev', width: 12, height: 12, viewBox: '0 0 12 12', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8 }, h('path', { d: 'M3 4.5 6 7.5 9 4.5' }))),
        open ? h('div', { className: 'ab-sel-pop', role: 'listbox' }, items) : null)
    }

    /** 卡片式单选：选项少、需要解释时用。 */
    function Choices({ value, options, onChange }) {
      return h('div', { className: 'ab-choices', role: 'radiogroup' }, options.map((o) => h('button', { key: o.value, type: 'button', role: 'radio', 'aria-checked': o.value === value, className: cx('ab-choice', o.value === value && 'on'), onClick: () => onChange(o.value) },
        h('b', null, o.icon || null, o.label), o.desc ? h('small', null, o.desc) : null)))
    }

    /** 滑块 + 数值，比纯数字框直观。 */
    function Range({ value, min, max, step, onChange, fmt }) {
      return h('div', { className: 'ab-range' },
        h('input', { type: 'range', min, max, step: step || 1, value: value ?? min, onChange: (e) => onChange(Number(e.target.value)) }),
        h('span', { className: 'val' }, fmt ? fmt(value) : value))
    }
    function Seg({ value, options, onChange, disabled }) {
      return h('div', { className: 'ab-seg' + (disabled ? ' off' : '') }, options.map((o) => h('button', { key: o.value, type: 'button', className: value === o.value ? 'on' : '', disabled: !!disabled, onClick: () => { if (!disabled) onChange(o.value) } }, o.label)))
    }
    function Empty({ icon, text }) {
      return h('div', { className: 'ab-empty' }, h('div', { className: 'big' }, icon || '🐋'), text)
    }

    /** 一行一个的列表框：输入时保留原文（含正在敲的空行），只把解析结果交给草稿。 */
    function ListArea({ value, onChange, placeholder, numbers }) {
      const parse = (t) => t.split(numbers ? /[\n,，;；\s]+/ : /[\n,，;；]+/).map((s) => s.trim()).filter(Boolean)
      const [text, setText] = useState(value.join('\n'))
      // 外面改了（保存、撤销、重新载入）而且和框里内容对不上时才覆盖
      useEffect(() => { if (parse(text).join('\n') !== value.join('\n')) setText(value.join('\n')) }, [value.join('\n')])
      return h('textarea', { className: 'ab-textarea', style: { minHeight: 60 }, placeholder, value: text,
        onChange: (e) => { setText(e.target.value); onChange(parse(e.target.value)) },
        onBlur: () => setText(parse(text).join('\n')) })
    }

    // 绑定到草稿配置的控件
    function useField(draft, setDraft) {
      return {
        sw: (path, extra) => h(Switch, { on: !!getPath(draft, path), onChange: (v) => setDraft(setPath(draft, path, v)), ...(extra || {}) }),
        text: (path, props) => h('input', { className: cx('ab-input', props && props.size), value: getPath(draft, path) ?? '', placeholder: props && props.placeholder, type: (props && props.type) || 'text', onChange: (e) => setDraft(setPath(draft, path, e.target.value)) }),
        area: (path, props) => h('textarea', {
          className: 'ab-input',
          rows: (props && props.rows) || 4,
          style: { width: '100%', resize: 'vertical', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 12, lineHeight: 1.5 },
          value: getPath(draft, path) ?? '',
          placeholder: props && props.placeholder,
          onChange: (e) => setDraft(setPath(draft, path, e.target.value)),
        }),
        num: (path, props) => h('input', { className: 'ab-input sm', type: 'number', min: props && props.min, max: props && props.max, step: (props && props.step) || 1, value: getPath(draft, path) ?? '', onChange: (e) => setDraft(setPath(draft, path, e.target.value === '' ? '' : Number(e.target.value))) }),
        percent: (path) => h(Range, { min: 0, max: 100, value: pct(getPath(draft, path)), onChange: (v) => setDraft(setPath(draft, path, v / 100)), fmt: (v) => v + '%' }),
        range: (path, min, max, step, fmt) => h(Range, { min, max, step, value: getPath(draft, path), onChange: (v) => setDraft(setPath(draft, path, v)), fmt }),
        list: (path, props) => h(ListArea, { value: getPath(draft, path) || [], placeholder: props && props.placeholder, numbers: props && props.numbers, onChange: (v) => setDraft(setPath(draft, path, v)) }),
        select: (path, options, props) => h(Select, { value: getPath(draft, path) ?? '', options, onChange: (v) => setDraft(setPath(draft, path, v)), ...(props || {}) }),
        choices: (path, options) => h(Choices, { value: getPath(draft, path), options, onChange: (v) => setDraft(setPath(draft, path, v)) }),
      }
    }

    // ---------------- 标签页 ----------------
    const TABS = [
      { id: 'overview', label: '概览' },
      { id: 'stats', label: '统计' },
      { id: 'connect', label: '连接' },
      { id: 'persona', label: '人格' },
      { id: 'access', label: '权限' },
      { id: 'group', label: '聊天', flag: 'group' },
      { id: 'sessions', label: '会话' },
      { id: 'model', label: '模型' },
      { id: 'voice', label: '语音', flag: 'voice.enabled' },
      { id: 'stickers', label: '表情包', flag: 'stickers.enabled' },
      { id: 'imagegen', label: '生图', flag: 'imageGen.enabled' },
      { id: 'diary', label: '空间日记', flag: 'diary.enabled' },
      { id: 'speakup', label: '主动搭话', flag: 'speakUp.enabled' },
      { id: 'mood', label: '心情', flag: 'mood.enabled' },
      { id: 'memory', label: '记忆', flag: 'memory.enabled' },
      { id: 'song', label: '翻唱', flag: 'song.enabled' },
      { id: 'bili', label: 'B站', flag: 'bili.enabled' },
      { id: 'douyin', label: '抖音', flag: 'douyin.enabled' },
      { id: 'heybox', label: '小黑盒', flag: 'heybox.enabled' },
      { id: 'local', label: '本地接口' },
      { id: 'modules', label: '扩展' },
      { id: 'backup', label: '备份迁移' },
      { id: 'logs', label: '日志' },
    ]
    // 内置标签页属于哪个模块：模块都没在跑就不显示这一页
    const TAB_MODS = { voice: ['voice'], stickers: ['stickers'], imagegen: ['imagegen'], diary: ['diary', 'qzone-social'], speakup: ['speakup', 'purpose'], mood: ['mood'], memory: ['memory'], song: ['song'], bili: ['bili'], douyin: ['douyin'], heybox: ['heybox'] }
    const modOn = (st, id) => (st.modules || []).some((m) => m.id === id && m.running)

    // 两层导航：上面一排是分组，下面一排是这组里的页面；每组记住上次看的那页，Alt+K 查找功能
    // （分组导航的思路来自社区贡献的「导航布局」扩展，这里改成面板自己实现）
    const NAV_GROUPS = [
      { id: 'home', label: '概览', icon: 'M3 10.5 12 3l9 7.5M5.5 9v11.5h13V9M10 20.5v-6h4v6', tabs: ['overview', 'stats'] },
      { id: 'self', label: '人设', icon: 'M12 12.5a4.25 4.25 0 1 0 0-8.5 4.25 4.25 0 0 0 0 8.5zM4.5 20.5c.9-3.6 3.9-5.5 7.5-5.5s6.6 1.9 7.5 5.5', tabs: ['persona', 'group', 'sessions', 'speakup', 'mood', 'memory'] },
      { id: 'express', label: '表达', icon: 'M20.5 11.5a8 8 0 0 1-11.7 7.1L4 20l1.4-4.4A8 8 0 1 1 20.5 11.5zM9 13.2s1.1 1.5 3 1.5 3-1.5 3-1.5M9.5 9.6h.01M14.5 9.6h.01', tabs: ['voice', 'stickers', 'imagegen', 'song'] },
      { id: 'platform', label: '平台', icon: 'M3.5 6.5h17v11h-17zM10.5 9.8v4.4l3.8-2.2z', tabs: ['diary', 'bili', 'douyin', 'heybox'] },
      { id: 'system', label: '系统', icon: 'M4 7h9M17 7h3M4 12h3M11 12h9M4 17h11M19 17h1M15 5v4M9 10v4M17 15v4', tabs: ['connect', 'model', 'access', 'local', 'modules', 'backup', 'logs'] },
    ]
    // 自己写的模块：名字像逛平台的放「平台」，其余放「系统」（排在「日志」前面）
    const PLATFORM_EXT = /逛|刷|B站|抖音|小红书|闲鱼|淘宝|微博|知乎|贴吧|快手|触站|小黑盒/
    const navGroupOf = (t) => NAV_GROUPS.find((g) => g.tabs.includes(t.id)) || (t.ext && PLATFORM_EXT.test(t.label) ? NAV_GROUPS[3] : NAV_GROUPS[4])
    const navOrder = (g, t) => { const i = g.tabs.indexOf(t.id); return i >= 0 ? i : g.tabs.length - (g.tabs.includes('logs') ? 1.5 : 0) }
    const NAV_ALIAS = {
      overview: '首页 状态', stats: '统计 趋势 报表 用量 消息量 每天 30天', sessions: '会话 对话 聊天记录 重置 管理员', connect: 'qq 网关 snowluma onebot 登录 工作区', persona: '人设 性格 设定 头像', access: '主人 白名单 权限 群管 改资料',
      group: '群聊 插话 合并', model: 'ai 大模型 视觉 思考强度', voice: '语音 tts 说话 音色 edge', stickers: '表情 小黄脸 gif 商城表情',
      imagegen: '画图 图片', diary: '空间 说说 日记', speakup: '搭话 主动', mood: '心情 情绪 状态 好坏', memory: '记忆 回忆 长期记忆 卡片墙 相处经验 说话方式 档案 整理', song: '唱歌 翻唱 rvc 点歌',
      bili: 'b站 bilibili 视频', douyin: '抖音 短视频 私信', local: '本地 接口 sd sovits', modules: '扩展 模块 插件', backup: '备份 导出 导入 迁移 搬家 换设备 数据 zip', logs: '日志 报错',
    }
    const navIcon = (d) => h('svg', { viewBox: '0 0 24 24', 'aria-hidden': true }, h('path', { d }))

    function NavBar({ tabs, cur, go, mark, dirtyOf, subRef }) {
      const [last, setLast] = useState(() => { try { return JSON.parse(localStorage.getItem('halobot.navlast') || '{}') || {} } catch (e) { return {} } })
      const [find, setFind] = useState(null) // null = 没开；字符串 = 正在搜的字
      const [hi, setHi] = useState(0)
      const box = useRef(null)
      const groups = NAV_GROUPS
        .map((g) => ({ ...g, list: tabs.filter((t) => navGroupOf(t).id === g.id).sort((a, b) => navOrder(g, a) - navOrder(g, b)) }))
        .filter((g) => g.list.length)
      const curGroup = groups.find((g) => g.list.some((t) => t.id === cur.id)) || groups[0]
      // 记住每组最后看的那页：点分组时回到那页
      useEffect(() => {
        if (!curGroup || last[curGroup.id] === cur.id) return
        const next = { ...last, [curGroup.id]: cur.id }
        setLast(next)
        try { localStorage.setItem('halobot.navlast', JSON.stringify(next)) } catch (e) {}
      }, [cur.id])
      const openGroup = (g) => go((g.list.find((t) => t.id === last[g.id]) || g.list[0]).id)
      const toggleFind = () => { setFind((f) => (f === null ? '' : null)); setHi(0) }
      useEffect(() => {
        const onKey = (e) => {
          if (e.altKey && !e.ctrlKey && !e.metaKey && e.key.toLowerCase() === 'k') { e.preventDefault(); toggleFind() }
          else if (e.key === 'Escape') setFind(null)
        }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
      }, [])
      // 点到查找框外面就收起
      useEffect(() => {
        if (find === null) return
        const onDown = (e) => { if (box.current && !box.current.contains(e.target)) setFind(null) }
        document.addEventListener('mousedown', onDown)
        return () => document.removeEventListener('mousedown', onDown)
      }, [find === null])
      const q = (find || '').trim().toLowerCase()
      const hits = find === null ? [] : groups.flatMap((g) => g.list.map((t) => ({ t, g })))
        .filter(({ t, g }) => !q || [t.label, g.label, NAV_ALIAS[t.id] || '', t.id].join(' ').toLowerCase().includes(q))
      const pick = (t) => { setFind(null); go(t.id) }
      const tabBtn = (t) => h('button', { key: t.id, type: 'button', role: 'tab', 'aria-selected': cur.id === t.id, className: cx('ab-tab', cur.id === t.id && 'on'), onClick: () => go(t.id) }, t.label, mark(t))
      return h('nav', { className: 'ab-nav', ref: box, 'aria-label': 'Halobot 功能' },
        h('div', { className: 'ab-nav-top' },
          h('div', { className: 'ab-nav-groups', role: 'tablist', 'aria-label': '功能分组' }, groups.map((g) => h('button', {
            key: g.id, type: 'button', role: 'tab', 'aria-selected': g.id === curGroup.id, className: cx('ab-grp', g.id === curGroup.id && 'on'),
            title: g.list.map((t) => t.label).join(' · '), onClick: () => openGroup(g),
          }, navIcon(g.icon), h('span', null, g.label), g.list.some((t) => dirtyOf(t.id)) ? h('i', { className: 'dirty', title: '这组里有没保存的改动' }) : null))),
          h('button', { type: 'button', className: 'ab-find-btn', 'aria-expanded': find !== null, title: '查找功能（Alt+K）', onClick: toggleFind },
            navIcon('M11 4.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13zM20 20l-4.2-4.2'), h('span', { className: 't' }, '查找'), h('span', { className: 'ab-kbd' }, 'Alt K'))),
        curGroup && curGroup.list.length > 1 ? h('div', { className: 'ab-nav-sub', role: 'tablist', 'aria-label': curGroup.label, ref: subRef }, curGroup.list.map(tabBtn)) : null,
        find !== null ? h('div', { className: 'ab-finder' },
          h('input', {
            className: 'ab-input', autoFocus: true, placeholder: '找功能：语音、抖音、白名单…', value: find,
            onChange: (e) => { setFind(e.target.value); setHi(0) },
            onKeyDown: (e) => {
              if (e.key === 'ArrowDown') { e.preventDefault(); setHi(Math.min(hi + 1, hits.length - 1)) }
              else if (e.key === 'ArrowUp') { e.preventDefault(); setHi(Math.max(hi - 1, 0)) }
              else if (e.key === 'Enter' && hits[hi]) { e.preventDefault(); pick(hits[hi].t) }
            },
          }),
          h('div', { className: 'ab-finder-list', role: 'listbox' }, hits.length
            ? hits.map(({ t, g }, i) => h('button', { key: t.id, type: 'button', role: 'option', 'aria-selected': i === hi, className: cx('ab-finder-item', i === hi && 'on'), onMouseEnter: () => setHi(i), onClick: () => pick(t) }, t.label, h('small', null, g.label)))
            : h('div', { className: 'ab-finder-empty' }, '没找到，换个说法试试：语音、抖音、白名单'))) : null)
    }
    function ModOff({ name }) {
      return h(Card, { title: name }, h('div', { className: 'ab-muted ab-small' }, '「' + name + '」模块关着，这部分用不了。要用的话去「扩展」页把它打开。'))
    }
    /** 一个标签页出错时只坏这一页：显示原因和「回到概览」，不会整个面板白屏（也不会因为记住了这一页而一直白）。 */
    class TabBoundary extends React.Component {
      constructor(p) { super(p); this.state = { error: null } }
      static getDerivedStateFromError(error) { return { error } }
      componentDidCatch(error) { try { localStorage.setItem('halobot.tab', 'overview') } catch (e) {} }
      render() {
        if (!this.state.error) return this.props.children
        return h(Card, { title: '这一页出错了' },
          h('div', { className: 'ab-note err' }, String((this.state.error && this.state.error.message) || this.state.error)),
          h('div', { className: 'ab-small ab-muted', style: { margin: '8px 0' } }, '别的页面不受影响。把这段报错截图发给作者就行。'),
          h('div', { className: 'ab-flex' },
            h(Btn, { small: true, kind: 'primary', onClick: () => this.props.onHome && this.props.onHome() }, '回到概览'),
            h(Btn, { small: true, kind: 'ghost', onClick: () => this.setState({ error: null }) }, '再试一次')))
      }
    }
    const copy = (text, toast, msg) => { try { navigator.clipboard.writeText(text); if (msg) toast(msg, 'ok') } catch (e) { toast('复制失败，手动选中复制吧', 'err') } }

    /** 更新提示：GitHub 上有新版本时给更新命令；刚更新完显示一次这次更新了什么。 */
    function UpdateNotes({ st, toast }) {
      const [upd, setUpd] = useState(null)
      const [notes, setNotes] = useState(null)
      useEffect(() => {
        get('/update/check').then(setUpd).catch(() => {})
        let seen = null
        try { seen = localStorage.getItem('halobot.seenVersion') } catch (e) {}
        if (seen && seen !== st.version) get('/changelog').then((r) => r.notes && setNotes(r.notes))
        // 第一次打开（新安装）不弹更新说明，直接记下当前版本
        else if (!seen) { try { localStorage.setItem('halobot.seenVersion', st.version) } catch (e) {} }
      }, [st.version])
      const dismiss = () => { try { localStorage.setItem('halobot.seenVersion', st.version) } catch (e) {} setNotes(null) }
      return h(Fragment, null,
        notes ? h('div', { className: 'ab-note' },
          h('div', { className: 'ab-flex' }, h('b', null, '已更新到 v' + st.version), h('div', { className: 'ab-spacer' }), h(Btn, { small: true, kind: 'ghost', onClick: dismiss }, '知道了')),
          h('div', { style: { whiteSpace: 'pre-wrap', marginTop: 6 } }, notes)) : null,
        upd && upd.newer ? h('div', { className: 'ab-note warn' },
          h('div', null, h('b', null, '有新版本 v' + upd.latest), '（现在是 v' + upd.current + '）。在 PowerShell 里运行下面这行，然后重启 DSH；设置、人格、记忆都会保留。'),
          h('div', { className: 'ab-flex', style: { marginTop: 6 } },
            h('code', { style: { flex: '1 1 300px', fontSize: 11.5, wordBreak: 'break-all' } }, upd.command),
            h(Btn, { small: true, onClick: () => { try { navigator.clipboard.writeText(upd.command); toast('复制好了', 'ok') } catch (e) { toast('复制失败，手动选中复制吧', 'err') } } }, '复制'))) : null)
    }

    function Overview({ st, toast, go }) {
      const cfg = st.config
      const s = st.stats || {}
      const conn = st.onebot.state === 'connected'
      const quick = (p, body) => async () => { const r = await post(p, body); toast(r.message || (r.ok ? '好了' : '没成功')) }
      return h('div', { className: 'ab-grid' },
        h(UpdateNotes, { st, toast }),
        !cfg.enabled ? h('div', { className: 'ab-note warn' }, '总开关是关着的：哈洛现在不会收也不会发任何 QQ 消息。准备好了就在右上角打开。') : null,
        cfg.enabled && cfg.dryRun ? h('div', { className: 'ab-note' }, '现在是试运行：她会照常思考回复，但只写进日志，不会真的发到 QQ。确认没问题后在右上角关掉「试运行」。') : null,
        cfg.enabled && !conn ? h('div', { className: 'ab-note err' }, '还没连上 QQ 网关' + (st.onebot.problem ? '：' + st.onebot.problem + '。' : '。去「连接」标签看看 SnowLuma 有没有装好、启动没有。') + ' ', h('a', { href: '#', onClick: (e) => { e.preventDefault(); go('connect') } }, '去连接 →')) : null,
        h('div', { className: 'ab-pills', style: { marginTop: 0 } },
          h('span', { className: 'ab-pill' }, h('i', { className: 'ab-dot ' + (cfg.enabled ? 'ok' : 'err') }), cfg.enabled ? '运行中' : '已关闭'),
          h('span', { className: 'ab-pill' }, h('i', { className: 'ab-dot ' + (cfg.dryRun ? 'warn' : 'ok') }), cfg.dryRun ? '试运行（不发消息）' : '真实发送'),
          h('span', { className: 'ab-pill' }, h('i', { className: 'ab-dot ' + (conn ? 'ok' : 'err') }), conn ? 'QQ 已连接' : 'QQ 未连接'),
          h('span', { className: 'ab-pill' }, '人格 · ' + ((st.personas.find((x) => x.id === cfg.persona.current) || {}).name || cfg.persona.current)),
        ),
        h(Card, { title: '今天', desc: '收到、发出和各项能力的当日计数，每天 0 点清零。' },
          h('div', { className: 'ab-metrics' },
            [['收到', s.received], ['发出', s.sent], ['语音条', s.voice], ['表情包', s.stickers], ['生图', s.image], ['翻唱', s.song], ['语音识别', s.asr]]
              .map(([l, n]) => h('div', { key: l, className: 'ab-metric' }, h('div', { className: 'n' }, n || 0), h('div', { className: 'l' }, l)))),
        ),
        h(UsageCard, { st }),
        h('div', { className: 'ab-grid ab-g2' },
          h(Card, { title: '她现在', desc: '心情会随聊天起伏，过一阵子慢慢回到平常。' },
            h('div', { className: 'ab-flex', style: { marginBottom: 8 } }, h('b', null, st.mood.label), h('span', { className: 'ab-muted' }, st.mood.value + ' / 100')),
            h('div', { className: 'ab-mood' }, h('i', { style: { width: Math.max(4, st.mood.value) + '%' } })),
            h('div', { className: 'ab-kv', style: { marginTop: 14 } },
              h('span', null, '表情库'), h('span', null, st.stickers.count + ' 张'),
              h('span', null, '下一篇日记'), h('span', null, cfg.diary.enabled ? (st.diary.next || '今天写完了') : '没开'),
              h('span', null, '人格'), h('span', null, (st.personas.find((p) => p.id === cfg.persona.current) || {}).name || cfg.persona.current),
              h('span', null, 'QQ 会话'), h('span', null, Object.keys(st.sessions || {}).filter((k) => !k.startsWith('system:')).length + ' 个（在侧栏「Halobot · QQ」工作区里）'),
            ),
          ),
          h(Card, { title: '快捷操作', desc: '试一试她是不是活着。这些操作会真的发到 QQ（试运行时只写日志）。' },
            h('div', { className: 'ab-flex' },
              h(Btn, { kind: 'primary', onClick: quick('/test-send') }, '给主人发一条自测'),
              h(Btn, { onClick: quick('/speakup/fire') }, '让她现在来找你'),
              h(Btn, { onClick: quick('/diary/run', { visibility: 'self' }) }, '写一篇日记（仅自己可见）'),
            ),
            h('p', { className: 'ab-muted ab-small', style: { marginTop: 12, marginBottom: 0 } }, '想看她和每个人聊了什么、调了什么工具：点 DSH 侧栏「Halobot · QQ」工作区里对应的会话，也可以直接在会话里插话。'),
            h('div', { className: 'ab-flex', style: { marginTop: 10 } },
              h(Btn, { small: true, kind: 'ghost', onClick: async () => { if (!confirm('把现在所有 QQ 会话归档、让她从头开始聊？（旧会话在侧栏的归档里还能找到）')) return; const r = await post('/sessions/reset'); toast(r.message) } }, '重新开始所有 QQ 会话')),
          ),
        ),
        h(RecentLogs, { go }),
      )
    }

    /**
     * 概览上的「模型用量」卡：今天到底烧了多少 token、缓存命中多少、按分时段单价大概多少钱。
     * 数字来自 host /state 的 usage：QQ 会话的 tokenUsage 增量 + 面板后台任务自己报的 usage，
     * 按采样那一刻是高峰还是空闲分别记，所以能看出高峰时段占了多少。
     */
    function UsageCard({ st }) {
      const u = st.usage
      if (!u || u.ok === false) return null
      const n = (v) => { const x = Number(v); return Number.isFinite(x) ? x : 0 }
      const tok = (v) => {
        const x = n(v)
        if (x >= 1e8) return (x / 1e8).toFixed(2) + ' 亿'
        if (x >= 1e4) return (x / 1e4).toFixed(1) + ' 万'
        return String(Math.round(x))
      }
      const yuan = (v) => {
        if (v === null || v === undefined) return '—'
        const txt = v.toFixed(Math.abs(v) >= 1 ? 2 : 3).replace(/0+$/, '').replace(/\.$/, '')
        return '¥' + (txt === '' ? '0' : txt)
      }
      const t = u.total || {}
      const per = u.periods || {}
      const peak = per.peak || {}
      const idle = per.idle || {}
      const hit = typeof u.cacheHit === 'number' ? (u.cacheHit * 100).toFixed(1) + '%' : '—'
      const isPeakNow = u.now === 'peak'
      const nowText = (isPeakNow ? '高峰时段' : '空闲时段') + (u.nowUntil ? ' · 到 ' + u.nowUntil : '')
      const cells = [
        ['输入（未命中）', tok(t.uncachedInputTokens), '按未命中单价'],
        ['缓存命中', tok(t.cacheReadTokens), '按命中单价，便宜很多'],
        ['输出', tok(t.outputTokens), '她写出来的部分'],
        ['缓存命中率', hit, '命中 ÷ 计费输入'],
      ]
      const hist = (u.history || []).slice(-7)
      const peakMax = Math.max(1, ...hist.map((b) => n(b.tokens)))
      return h(Card, {
        title: '模型用量 · 今天',
        desc: 'QQ 会话的真实 token 用量（含面板后台任务），按高峰 / 空闲分时段计价；数字每天 0 点清零，历史留着画趋势。',
        right: h('div', { className: 'ab-flex', style: { gap: 8 } },
          h('span', { className: 'ab-pill' }, h('i', { className: 'ab-dot ' + (isPeakNow ? 'warn' : 'ok') }), nowText),
          h('span', { className: 'ab-muted ab-small' }, u.day || '')),
      },
        h('div', { className: 'ab-grid ab-g4' },
          cells.map(([l, v, sub]) => h('div', { key: l, style: { padding: '6px 0' } },
            h('div', { className: 'ab-muted ab-small' }, l),
            h('div', { style: { fontSize: 21, fontWeight: 650, lineHeight: 1.5, fontVariantNumeric: 'tabular-nums' } }, v),
            h('div', { className: 'ab-muted ab-small' }, sub)))),
        h('div', { className: 'ab-flex', style: { marginTop: 4, gap: 14, flexWrap: 'wrap' } },
          h('span', { className: 'ab-small' }, '估算花费 ', h('b', null, u.priced ? yuan(u.cost) : '—'),
            u.priced ? null : h('span', { className: 'ab-muted' }, '（在「模型」页填单价后显示）')),
          h('span', { className: 'ab-muted ab-small' }, '合计 ' + tok(t.uncachedInputTokens) + ' 未命中 + ' + tok(t.cacheReadTokens) + ' 命中 + ' + tok(t.outputTokens) + ' 输出'),
          u.calls ? h('span', { className: 'ab-muted ab-small' }, '后台调用 ' + u.calls + ' 次') : null,
          u.sessions ? h('span', { className: 'ab-muted ab-small' }, u.sessions + ' 条会话') : null),
        h('div', { className: 'ab-kv', style: { marginTop: 12 } },
          h('span', null, '高峰时段'), h('span', null, tok(peak.tokens) + ' token' + (peak.cost === null || peak.cost === undefined ? '' : ' · ' + yuan(peak.cost))),
          h('span', null, '空闲时段'), h('span', null, tok(idle.tokens) + ' token' + (idle.cost === null || idle.cost === undefined ? '' : ' · ' + yuan(idle.cost))),
        ),
        hist.length > 1 ? h('div', null,
          h('div', { className: 'ab-muted ab-small', style: { marginTop: 14 } }, '近 7 天 · 深色是高峰时段，浅色是空闲时段'),
          h('div', { style: { display: 'flex', alignItems: 'flex-end', gap: 6, height: 56, marginTop: 6 } },
            hist.map((b) => {
              const tot = n(b.tokens)
              const pk = Math.min(tot, n(b.peak))
              return h('div', { key: b.day, title: b.day + '：' + tok(tot) + ' token，其中高峰 ' + tok(pk), style: { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', gap: 4, height: '100%' } },
                h('i', { style: { display: 'block', width: '100%', maxWidth: 28, borderRadius: '3px 3px 0 0', background: 'var(--ab-sea)', opacity: 0.28, height: Math.round(30 * Math.max(0, tot - pk) / peakMax) + 'px' } }),
                h('i', { style: { display: 'block', width: '100%', maxWidth: 28, borderRadius: '0 0 3px 3px', background: 'var(--ab-sea)', opacity: b.day === u.day ? 1 : 0.62, height: Math.max(pk > 0 ? 2 : 0, Math.round(30 * pk / peakMax)) + 'px' } }),
                h('span', { className: 'ab-muted', style: { fontSize: 10, lineHeight: 1 } }, String(b.day).slice(5)))
            }),
          )) : null,
      )
    }

    function RecentLogs({ go }) {
      const [items, setItems] = useState(null)
      useEffect(() => {
        let alive = true
        const load = () => { if (document.hidden) return; get('/logs?limit=8&level=info').then((r) => alive && setItems(r.entries || [])) }
        load()
        const t = setInterval(load, 5000)
        return () => { alive = false; clearInterval(t) }
      }, [])
      return h(Card, { title: '最近动态', right: h(Btn, { kind: 'ghost', small: true, onClick: () => go('logs') }, '全部日志 →') },
        items === null ? h(Empty, { icon: '⏳', text: '加载中…' }) : items.length === 0 ? h(Empty, { text: '还没有动静' }) :
          h('div', { className: 'ab-logs', style: { maxHeight: 240 } }, items.slice().reverse().map((e, i) => h(LogLine, { key: i, e }))))
    }

    function LogLine({ e }) {
      return h('div', { className: cx('ab-log', e.level) }, h('span', { className: 't' }, e.time), h('span', { className: 'a' }, e.area), h('span', { className: 'm' }, e.text))
    }

    /** 控制台密码状态：插件自动管理；登不上时给「重置为自动密码」。 */
    function SnowLumaAuth({ running, toast, onChange }) {
      const [s, setS] = useState(null)
      const load = () => get('/snowluma/login-check').then(setS)
      useEffect(() => { if (running) load() }, [running])
      if (!running) return h('span', { className: 'ab-muted ab-small' }, '启动后插件会自动管理控制台密码，你不用设置。')
      if (!s) return h('span', { className: 'ab-muted ab-small' }, h('i', { className: 'ab-spin' }), ' 检查中…')
      if (s.ok) return h(PasswordPeek, { toast, auto: s.passwordAuto })
      return h('div', null,
        h('div', { className: 'ab-small', style: { color: 'var(--ab-warn)' } }, '插件登不上 SnowLuma 控制台：' + (s.message || '') + '。多半是之前手动设过密码。'),
        h('div', { style: { marginTop: 6 } }, h(Btn, { small: true, kind: 'primary', onClick: async () => {
          if (!confirm('会先停掉 SnowLuma、清掉它的旧控制台密码，再用插件生成的新密码重新启动。机器人号需要稍后重新接入。继续吗？')) return
          const r = await post('/snowluma/reset-password'); toast(r.message); load(); onChange && onChange()
        } }, '重置为自动密码')))
    }

    /** 控制台密码：插件登得上时显示状态，能看一眼、复制（打开 SnowLuma 自己的控制台要用）。 */
    function PasswordPeek({ toast, auto }) {
      const [pw, setPw] = useState('')
      const peek = async () => { const r = await get('/snowluma/password'); setPw(r.password || '（还没有）') }
      return h('div', { className: 'ab-flex' },
        h('span', { className: 'ab-small', style: { color: 'var(--ab-ok)' } }, auto ? '✓ 控制台密码由插件自动管理' : '✓ 用的是你设的控制台密码'),
        pw ? h('code', { className: 'ab-small' }, pw) : null,
        h(Btn, { small: true, kind: 'ghost', onClick: () => (pw ? setPw('') : peek()) }, pw ? '隐藏' : '显示密码'),
        h(Btn, { small: true, kind: 'ghost', onClick: async () => { const r = await get('/snowluma/password'); copy(r.password || '', toast, '密码复制好了，打开 SnowLuma 控制台时粘贴') } }, '复制密码'))
    }

    /** 在面板里阅读并同意 SnowLuma 的用户协议和隐私说明（必须由用户本人勾选、点击）。 */
    function Agreement({ running, toast, onChange }) {
      const [a, setA] = useState(null)
      const [tab, setTab] = useState(0)
      const [agree, setAgree] = useState(false)
      const load = () => get('/snowluma/agreements').then(setA)
      useEffect(() => { if (running) load() }, [running])
      if (!running) return h('span', { className: 'ab-muted ab-small' }, '先启动 SnowLuma。')
      if (!a) return h('span', { className: 'ab-muted ab-small' }, h('i', { className: 'ab-spin' }), ' 读取协议…')
      if (!a.ok) return h('span', { className: 'ab-small', style: { color: 'var(--ab-warn)' } }, '读不到协议：' + a.message)
      if (!a.consentRequired) return h('span', { className: 'ab-small', style: { color: 'var(--ab-ok)' } }, '✓ 已同意 SnowLuma 的用户协议和隐私说明（版本 ' + a.version + '）')
      const doc = a.documents[tab] || a.documents[0]
      return h('div', { style: { width: '100%' } },
        h('div', { className: 'ab-seg', style: { marginBottom: 8 } }, a.documents.map((d, i) => h('button', { key: d.id, type: 'button', className: i === tab ? 'on' : '', onClick: () => setTab(i) }, d.title.split('/')[0].trim()))),
        doc ? h('div', { className: 'ab-logs', style: { maxHeight: 260, padding: '12px 14px', fontFamily: 'inherit', fontSize: 12.5, lineHeight: 1.7, whiteSpace: 'pre-wrap' } }, doc.text) : null,
        h('label', { className: 'ab-flex', style: { marginTop: 10, cursor: 'pointer' } },
          h('input', { type: 'checkbox', checked: agree, onChange: (e) => setAgree(e.target.checked), style: { accentColor: 'var(--ab-sea)', width: 16, height: 16 } }),
          h('span', null, '我已阅读并同意以上 SnowLuma 用户协议和隐私说明')),
        h('div', { className: 'ab-flex', style: { marginTop: 8 } },
          h(Btn, { kind: 'primary', small: true, disabled: !agree, onClick: async () => { const r = await post('/snowluma/consent', { version: a.version, agree: true }); toast(r.ok ? '已同意' : r.message, r.ok ? 'ok' : 'err'); load(); onChange && onChange() } }, '同意'),
          h('span', { className: 'ab-muted ab-small' }, 'SnowLuma 是独立的第三方项目，仅限个人非商业使用；使用非官方 QQ 工具有账号风险，请用小号。')))
    }

    /** 用什么接 QQ：插件帮你管 SnowLuma，或接你已有的 OneBot v11 机器人。 */
    function GatewayChoice({ draft, setDraft }) {
      return h(Choices, { value: draft.gateway || 'snowluma', onChange: (v) => setDraft(setPath(draft, 'gateway', v)), options: [
        { value: 'snowluma', label: '用 SnowLuma（Windows，推荐）', desc: '插件帮你启动、接入机器人号、断线重连' },
        { value: 'onebot', label: '接我已有的 OneBot 机器人', desc: 'NapCat、LLOneBot、Lagrange、Docker 里的 SnowLuma 等任何 OneBot v11 实现；Linux / Docker 部署选这个' },
      ] })
    }

    /** 已有 OneBot 机器人的地址和令牌。 */
    function OneBotFields({ draft, f }) {
      return h(Fragment, null,
        h(Row, { label: 'WebSocket 地址', hint: '正向 WebSocket（OneBot v11），收消息靠它，必填。DSH 在 Docker 里的话，要填 DSH 容器能访问到的地址' }, f.text('snowluma.wsUrl', { size: 'wide', placeholder: 'ws://127.0.0.1:3001' })),
        h(Row, { label: 'WebSocket 令牌', hint: '对方设了 access_token 就填，没设留空' }, f.text('snowluma.wsToken', { type: 'password', placeholder: draft.snowluma.wsTokenSet ? '已保存' : '没有就留空' })),
        h(Row, { label: 'HTTP 地址', hint: '可选。填了就用 HTTP 调接口，不填就都走 WebSocket' }, f.text('snowluma.httpUrl', { size: 'wide', placeholder: 'http://127.0.0.1:3000' })),
        h(Row, { label: 'HTTP 令牌' }, f.text('snowluma.httpToken', { type: 'password', placeholder: draft.snowluma.httpTokenSet ? '已保存' : '没有就留空' })))
    }

    /** 一键自检：开关、网关、登录号、最近收消息……哪一环断了直接说。 */
    function SelfCheck({ toast }) {
      const [data, setData] = useState(null)
      const [busy, setBusy] = useState(false)
      const run = async () => {
        setBusy(true)
        try {
          const r = await get('/connect/selfcheck')
          if (r.ok) setData(r)
          else { setData({ ok: false, checks: [], at: Date.now(), summary: '自检没跑成', error: r.message || '未知错误' }); toast(r.message || '自检没跑成', 'err') }
        } catch (error) {
          setData({ ok: false, checks: [], at: Date.now(), summary: '自检没跑成', error: error.message || String(error) })
          toast(error.message || '自检没跑成', 'err')
        }
        setBusy(false)
      }
      useEffect(() => { run() }, [])
      const checks = (data && data.checks) || []
      const rows = checks.map((c) => h('div', { key: c.id, className: 'ab-row', style: { alignItems: 'flex-start', padding: '7px 0', borderTop: '1px solid var(--ab-line)' } },
        h('i', { className: cx('ab-dot', c.ok ? 'ok' : c.level === 'warn' ? 'warn' : 'err'), style: { marginTop: 5 } }),
        h('div', { style: { flex: 1 } },
          h('b', null, c.label),
          h('span', { className: 'ab-muted ab-small' }, '　' + c.detail),
          c.hint ? h('div', { className: 'ab-small', style: { color: 'var(--ab-warn)' } }, '→ ' + c.hint) : null)))
      return h(Card, {
        title: '自检',
        desc: '点一下，把「能不能连上 QQ」的每一环都过一遍：开关、网关、登录号、最近有没有收到消息。',
        right: h('div', { className: 'ab-flex' },
          data ? h('span', { className: 'ab-muted ab-small' }, data.summary) : null,
          h(Btn, { small: true, kind: 'primary', disabled: busy, onClick: run }, busy ? '检查中…' : '重新自检')),
      }, !data ? h(Empty, { icon: '⏳', text: '正在检查…' })
        : data.error ? h(Empty, { icon: '⚠️', text: '自检没跑成：' + data.error })
        : h('div', null, rows,
          h('div', { className: 'ab-muted ab-small', style: { marginTop: 8 } }, '检查时间：' + new Date(data.at || Date.now()).toLocaleTimeString())))
    }

    function Connect({ st, draft, setDraft, toast, reload, openWizard }) {
      const f = useField(draft, setDraft)
      const sl = st.snowluma
      const [procs, setProcs] = useState(null)
      const conn = st.onebot.state === 'connected'
      const loadProcs = async () => { const r = await get('/snowluma/processes'); setProcs(r.list || []); if (!r.ok) toast(r.message) }
      const act = (p) => async () => { const r = await post(p); toast(r.message || (r.ok ? '好了' : '没成功')); reload() }
      const login = st.onebot.login
      const external = draft.gateway === 'onebot'
      const testBtns = h('div', { className: 'ab-flex', style: { marginTop: 8 } },
        h(Btn, { small: true, onClick: async () => { const r = await get('/onebot/test'); toast(r.message) } }, '测试连接'),
        h(Btn, { small: true, onClick: async () => { const r = await post('/onebot/reconnect'); toast(r.message, r.ok ? 'ok' : 'err'); reload() } }, '重新连接'))
      return h('div', { className: 'ab-grid' },
        h(SelfCheck, { toast }),
        h(Card, { title: '用什么接 QQ', right: openWizard ? h(Btn, { small: true, kind: 'ghost', onClick: openWizard }, '重新走一遍设置向导') : null }, h(GatewayChoice, { draft, setDraft })),
        external ? h(Card, { title: '接上 QQ（已有的 OneBot 机器人）', desc: '让你的 OneBot 服务登录机器人号 ' + (draft.botQQ || '') + '，把它的正向 WebSocket 地址填在这里，保存后插件就会去连。插件只连接，不会启动或注入任何东西；连上后会先核对登录的是不是机器人号，不是就断开。' },
          h(OneBotFields, { draft, f }),
          h(Row, { label: '机器人 QQ 号' }, f.text('botQQ')),
          testBtns) :
        h(Card, { title: '接上 QQ（SnowLuma）', desc: 'SnowLuma 是让机器人号上线的 QQ 网关。按协议规定它需要你自己下载、解压并同意它的用户协议；控制台密码、启动、接入、断线重连都交给 Halobot。',
          },
          h('div', { className: 'ab-steps' },
            h('div', { className: cx('ab-step', sl.installed && 'done') }, h('div', null,
              h('b', null, '下载 SnowLuma'), h('div', { className: 'ab-muted ab-small' }, '打开官方发布页，下载 Windows 完整版（名字类似 SnowLuma-v2.x.x-win-x64.zip，不带 lite）。'),
              h('div', { style: { marginTop: 6 } }, h(Btn, { small: true, onClick: () => window.open(sl.downloadPage, '_blank') }, '打开下载页 ↗')))),
            h('div', { className: cx('ab-step', sl.installed && 'done') }, h('div', null,
              h('b', null, '解压到一个纯英文的目录'), h('div', { className: 'ab-muted ab-small' }, '推荐 C:\\Halobot\\snowluma。解压后这个目录里应该直接能看到 index.mjs 和 node.exe。'),
              h('div', { className: 'ab-flex', style: { marginTop: 6 } }, f.text('snowluma.dir', { size: 'wide', placeholder: 'C:\\Halobot\\snowluma' })),
              !sl.installed && sl.reason ? h('div', { className: 'ab-small', style: { color: 'var(--ab-warn)', marginTop: 4 } }, sl.reason) : sl.installed ? h('div', { className: 'ab-small', style: { color: 'var(--ab-ok)', marginTop: 4 } }, '找到了 SnowLuma v' + sl.version) : null)),
            h('div', { className: cx('ab-step', sl.running && 'done') }, h('div', null,
              h('b', null, '启动'), h('div', { className: 'ab-muted ab-small' }, '后台运行，不弹窗口；以后会跟着 DSH 自动启动。'),
              h('div', { className: 'ab-flex', style: { marginTop: 6 } },
                h(Btn, { small: true, kind: 'primary', disabled: !sl.installed || sl.running, onClick: act('/snowluma/start') }, sl.running ? '已在运行' : '启动'),
                sl.owns ? h(Btn, { small: true, kind: 'danger', onClick: act('/snowluma/stop') }, '停止') : null),
              h('div', { style: { marginTop: 6 } }, h(SnowLumaAuth, { running: sl.running, toast, onChange: reload })))),
            h('div', { className: cx('ab-step', sl.consented && 'done') }, h('div', null,
              h('b', null, '阅读并同意 SnowLuma 的用户协议'), h('div', { className: 'ab-muted ab-small', style: { marginBottom: 6 } }, '同意之前 SnowLuma 不会工作。'),
              h(Agreement, { running: sl.running, toast, onChange: reload }))),
            h('div', { className: cx('ab-step', conn && login && login.uin === draft.botQQ && 'done') }, h('div', null,
              h('b', null, '登录机器人号并接入'), h('div', { className: 'ab-muted ab-small' }, '在电脑上另开一个 QQ 登录机器人号 ' + draft.botQQ + '（可以最小化），然后点「接入机器人号」。'),
              h('div', { className: 'ab-flex', style: { marginTop: 6 } },
                h(Btn, { small: true, kind: 'primary', disabled: !sl.running, onClick: act('/snowluma/attach') }, '接入机器人号'),
                h(Btn, { small: true, disabled: !sl.running, onClick: loadProcs }, '看看有哪些 QQ 进程'),
                h(Btn, { small: true, onClick: async () => { const r = await get('/onebot/test'); toast(r.message) } }, '测试连接')),
              sl.lastAttach && sl.lastAttach.at ? h('div', { className: 'ab-small', style: { marginTop: 4, color: sl.lastAttach.ok ? 'var(--ab-ok)' : 'var(--ab-warn)' } }, timeAgo(sl.lastAttach.at) + '：' + sl.lastAttach.message) : null)),
          ),
          procs ? h('div', { style: { marginTop: 14 } }, procs.length === 0 ? h('div', { className: 'ab-muted' }, '没找到 QQ 进程。') :
            h('div', { style: { overflowX: 'auto' } }, h('table', { className: 'ab-table' }, h('thead', null, h('tr', null, ['进程', '登录的号', '昵称', '状态', ''].map((x) => h('th', { key: x }, x)))),
              h('tbody', null, procs.map((p) => h('tr', { key: p.pid },
                h('td', null, p.pid), h('td', null, p.uin || '识别不出'), h('td', null, p.nickname || '—'),
                h('td', null, p.injected ? (p.connected ? '已接入' : '已注入，连接中') : '未接入'),
                h('td', null, p.isBot ? h('span', { className: 'ab-badge' }, '机器人号') : h('span', { className: 'ab-muted ab-small' }, '不会碰')))))))) : null,
        ),
        h(Card, { title: 'QQ 会话放在哪', desc: '每个 QQ 私聊 / 群都是 DSH 里「Halobot · QQ」工作区下的一个会话，她在会话里读写文件也在这个文件夹。改了以后新开的会话放到新位置；已有的会话还在原来的地方，想全部挪过去就在「概览」点「重新开始所有 QQ 会话」。' },
          h(Row, { label: '工作区文件夹', hint: '填完整路径（比如 D:\\Halobot\\qq-chats）；留空 = 默认位置' }, f.text('workspaceDir', { size: 'wide', placeholder: st.workspaceDir || '' })),
          h('div', { className: 'ab-muted ab-small' }, '现在用的：' + (st.workspaceDir || '—'))),
        h(Card, { title: '连接状态' },
          h('div', { className: 'ab-kv' },
            h('span', null, 'QQ 网关'), h('span', null, h('span', { className: 'ab-flex' }, h('i', { className: cx('ab-dot', conn ? 'ok' : st.onebot.state === 'connecting' ? 'warn' : 'err') }), { connected: '已连上', connecting: '连接中', disconnected: '断开了，正在重连', stopped: '没启动（总开关关着）', unconfigured: '还没配置' }[st.onebot.state] || st.onebot.state)),
            h('span', null, '登录的号'), h('span', null, login ? login.nickname + '（' + login.uin + '）' + (login.uin !== draft.botQQ ? ' ⚠ 不是机器人号！' : '') : '—'),
            h('span', null, 'HTTP'), h('span', null, st.onebot.endpoint.httpUrl || '—'),
            h('span', null, 'WebSocket'), h('span', null, st.onebot.endpoint.wsUrl || '—'),
          ),
          !conn && st.onebot.problem ? h('div', { className: 'ab-note warn', style: { marginTop: 10 } }, st.onebot.problem) : null,
          h('div', { className: 'ab-flex', style: { marginTop: 10 } }, h(Btn, { small: true, onClick: async () => { const r = await post('/onebot/reconnect'); toast(r.message, r.ok ? 'ok' : 'err'); reload() } }, '重新连接')),
        ),
        external ? null : h(Card, { title: '高级', desc: '一般不用动：地址和令牌会自动从 SnowLuma 的配置里读。' },
          h(Row, { label: '机器人 QQ 号' }, f.text('botQQ')),
          h(Row, { label: '控制台端口' }, f.num('snowluma.webuiPort', { min: 1, max: 65535 })),
          h(Row, { label: '控制台密码', hint: '默认由插件自动生成，上面「显示密码」能看到。想自己定一个就填在这里，保存后会真的改到 SnowLuma 上（至少 10 位，要有大小写字母和符号，不能有空格）' }, f.text('snowluma.webuiPassword', { type: 'password', placeholder: draft.snowluma.webuiPasswordSet ? (draft.snowluma.passwordAuto ? '自动管理中（不改就留空）' : '已保存（不改就留空）') : '留空 = 自动' })),
          h(Row, { label: 'SnowLuma 自己的控制台', hint: '一般用不到，想看它的原始界面时用' }, h(Btn, { small: true, disabled: !sl.running, onClick: () => window.open(sl.webui, '_blank') }, '打开 ↗')),
          h(Row, { label: '随 DSH 自动启动 SnowLuma' }, f.sw('snowluma.autoStart')),
          h(Row, { label: '自动接入机器人号', hint: '断线后自动重新接入，只接机器人号。' }, f.sw('snowluma.autoAttach')),
          h(Row, { label: '手动 HTTP 地址', hint: '留空 = 自动' }, f.text('snowluma.httpUrl', { placeholder: 'http://127.0.0.1:3000' })),
          h(Row, { label: '手动 WS 地址', hint: '留空 = 自动' }, f.text('snowluma.wsUrl', { placeholder: 'ws://127.0.0.1:3001' })),
          h(Row, { label: '手动 HTTP 令牌' }, f.text('snowluma.httpToken', { type: 'password', placeholder: draft.snowluma.httpTokenSet ? '已保存' : '留空 = 自动' })),
          h(Row, { label: '手动 WS 令牌' }, f.text('snowluma.wsToken', { type: 'password', placeholder: draft.snowluma.wsTokenSet ? '已保存' : '留空 = 自动' })),
        ),
      )
    }

    /** 选一张图片当头像（最多 5MB）。 */
    async function pickAvatar(toast, reload) {
      const inp = document.createElement('input')
      inp.type = 'file'
      inp.accept = 'image/png,image/jpeg,image/gif,image/webp'
      const file = await new Promise((res) => { inp.onchange = () => res(inp.files && inp.files[0]); inp.click() })
      if (!file) return
      if (file.size > 5 * 1024 * 1024) return toast('图片太大了，最多 5MB', 'err')
      const data = await new Promise((res) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.readAsDataURL(file) })
      const r = await post('/avatar/upload', { data })
      toast(r.message, r.ok ? 'ok' : 'err')
      reload()
    }
    const avatarSrc = (st) => API + '/avatar?v=' + ((st.avatar && st.avatar.at) || 0)

    function AvatarCard({ st, toast, reload }) {
      const custom = st.avatar && st.avatar.custom
      return h('div', { className: 'ab-card', style: { marginTop: 12, padding: 14 } },
        h('div', { className: 'ab-flex', style: { alignItems: 'center', gap: 12 } },
          h('img', { src: avatarSrc(st), alt: '头像', style: { width: 56, height: 56, borderRadius: '50%', objectFit: 'cover', objectPosition: '50% 18%', border: '2px solid var(--ab-line)' } }),
          h('div', null, h('b', null, '头像'), h('div', { className: 'ab-muted ab-small' }, custom ? '用的是你上传的图片' : '默认的哈洛'))),
        h('div', { className: 'ab-flex', style: { marginTop: 10, flexWrap: 'wrap' } },
          h(Btn, { small: true, kind: 'primary', onClick: () => pickAvatar(toast, reload) }, '换一张'),
          custom ? h(Btn, { small: true, kind: 'ghost', onClick: async () => { const r = await post('/avatar/reset'); toast(r.message, 'ok'); reload() } }, '恢复默认') : null,
          h(Btn, { small: true, kind: 'ghost', onClick: async () => { if (!confirm('把这张图设成机器人号的 QQ 头像？')) return; const r = await post('/avatar/sync-qq'); toast(r.message, r.ok ? 'ok' : 'err') } }, '同步成 QQ 头像')),
        h('div', { className: 'ab-muted ab-small', style: { marginTop: 6 } }, '这是面板里显示的头像；点「同步成 QQ 头像」才会改机器人号在 QQ 上的头像。'))
    }

    // 人格按【标题】分节：面板里拆开逐节编辑，保存时按原来的写法拼回一整段（文件格式不变）
    const PSEC_HEAD = /^【([^】\n]{1,30})】\s*$/
    const PSEC_SUGGEST = ['你的样子', '性格', '打字习惯', '情绪是活的', '你的生活', '和主人的关系', '绝对禁止']
    // 每节一个颜色（跟着这一节走，挪位置颜色不变）。低饱和的雾色系，相邻的冷暖交替，深浅两种主题下都不刺眼：
    // 青瓷、雾紫、琥珀、雾蓝、藕粉、苔绿、黛蓝、赭石、橄榄、紫藤
    const PSEC_COLORS = ['#4f9a8c', '#8a7bc0', '#c08a4a', '#5f8fc7', '#c47a90', '#6f9f68', '#5c6fae', '#b9775a', '#8d9450', '#a173b5']
    let psecSeq = 0
    const psec = (title, text) => ({ k: ++psecSeq, title, text })
    const splitPersona = (body) => {
      const out = [psec(null, '')]
      let cur = out[0]
      let buf = []
      const flush = () => { cur.text = buf.join('\n').replace(/^\n+/, '').replace(/\s+$/, ''); buf = [] }
      for (const line of String(body || '').replace(/\r\n/g, '\n').split('\n')) {
        // 复制粘贴来的人设常带看不见的零宽字符（行首一个 U+200B），认标题时不算它
        const m = PSEC_HEAD.exec(line.replace(/[​-‍﻿]/g, '').trim())
        if (m) { flush(); cur = psec(m[1].trim(), ''); out.push(cur) } else buf.push(line)
      }
      flush()
      return out
    }
    const joinPersona = (secs) => secs
      .map((s) => (s.title === null ? s.text.trim() : '【' + (s.title.trim() || '未命名') + '】\n' + s.text.replace(/\s+$/, '')))
      .filter(Boolean).join('\n\n')
    const autoRows = (text) => Math.min(22, Math.max(3, String(text || '').split('\n').length + 1))

    /** 一节设定：标题、正文、上下移、删除、AI 润色。润色后原版和润色版只显示一个，按钮来回切，选定一个另一个就丢掉。 */
    function PersonaSection({ sec, lead, first, last, onChange, onMove, onDelete, onPolish, pending, onPick, onFlip }) {
      const showing = pending ? (pending.view === 'new' ? pending.text : sec.text) : sec.text
      const color = lead ? 'var(--ab-sea)' : PSEC_COLORS[sec.k % PSEC_COLORS.length]
      return h('div', { className: cx('ab-psec', lead && 'lead', pending && 'cmp'), style: { '--c': color } },
        h('div', { className: 'ab-psec-head' },
          lead
            ? h('div', { className: 'ab-psec-fixed' }, '开场', h('small', null, '她是谁，一两段话'))
            : h('input', { className: 'ab-psec-title', value: sec.title, placeholder: '这一节叫什么', maxLength: 30, onChange: (e) => onChange({ title: e.target.value.replace(/[【】\n]/g, '') }) }),
          h('span', { className: 'ab-psec-n' }, showing.length + ' 字'),
          h('div', { className: 'ab-psec-act' },
            lead ? null : h('button', { type: 'button', className: 'ab-ibtn', title: '往上移', disabled: first || !!pending, onClick: () => onMove(-1) }, navIcon('M12 19V5M6 11l6-6 6 6')),
            lead ? null : h('button', { type: 'button', className: 'ab-ibtn', title: '往下移', disabled: last || !!pending, onClick: () => onMove(1) }, navIcon('M12 5v14M6 13l6 6 6-6')),
            lead ? null : h('button', { type: 'button', className: 'ab-ibtn danger', title: '删掉这一节', disabled: !!pending, onClick: onDelete }, navIcon('M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12'))),
          pending
            ? null
            : h(AiButton, { onClick: onPolish, empty: !sec.text.trim() })),
        h('textarea', {
          value: showing, rows: autoRows(showing), readOnly: !!pending,
          placeholder: lead ? '你是「…」，一个真实存在的人，正在用手机 QQ 和对面聊天。' : '- 一条一行，短句就好',
          onChange: (e) => onChange({ text: e.target.value }),
        }),
        pending ? h('div', { className: 'ab-compare' },
          h('span', { className: 'ab-compare-tag' }, pending.view === 'new' ? 'AI 润色版' : '原版'),
          h('span', { className: 'ab-muted ab-small' }, pending.view === 'new' ? '和原版比：' + (pending.text.length - sec.text.length >= 0 ? '多 ' : '少 ') + Math.abs(pending.text.length - sec.text.length) + ' 字' : '还没改过的样子'),
          h('div', { className: 'ab-spacer' }),
          h('button', { type: 'button', className: 'ab-chip solid', onClick: onFlip }, pending.view === 'new' ? '看原版' : '看润色版'),
          h(Btn, { small: true, kind: 'primary', onClick: () => onPick(pending.view) }, pending.view === 'new' ? '用润色版' : '保留原版')) : null)
    }
    function AiButton({ onClick, empty }) {
      const [busy, setBusy] = useState(false)
      return h('button', {
        type: 'button', className: 'ab-aibtn', disabled: busy, title: empty ? '让 AI 按这一节的标题先写一版' : '让 AI 把这一节改得更具体、更像真人',
        onClick: async () => { setBusy(true); try { await onClick() } finally { setBusy(false) } },
      },
      busy ? h('i', { className: 'ab-spin' }) : navIcon('M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8zM19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z'),
      h('span', null, busy ? '润色中' : empty ? 'AI 写一版' : 'AI 润色'))
    }

    function Persona({ st, toast, reload }) {
      const [list, setList] = useState(st.personas)
      const [current, setCurrent] = useState(st.config.persona.current)
      const [sel, setSel] = useState(st.config.persona.current)
      const [edit, setEdit] = useState(null) // { id, name, tags, secs }
      const [dirty, setDirty] = useState(false)
      const [pending, setPending] = useState({}) // 节的 k → { text, view: 'new' | 'old' } AI 润色还没选定的
      const [whole, setWhole] = useState(() => { try { return localStorage.getItem('halobot.persona.whole') === '1' } catch (e) { return false } })
      const load = async (id) => {
        const r = await get('/persona/get?id=' + encodeURIComponent(id))
        if (r.ok) { setEdit({ id: r.persona.id, name: r.persona.name, tags: (r.persona.tags || []).join('，'), secs: splitPersona(r.persona.body) }); setDirty(false); setPending({}) }
      }
      useEffect(() => { load(sel) }, [sel])
      const refresh = async () => { const r = await get('/personas'); if (r.ok) { setList(r.list); setCurrent(r.current) } }
      const body = edit ? joinPersona(edit.secs) : ''
      const waiting = Object.keys(pending).length
      const save = async () => {
        const r = await post('/persona/save', { id: edit.id, name: edit.name, tags: edit.tags.split(/[,，\s]+/).filter(Boolean), body })
        toast(r.message || (r.ok ? '保存好了' : '没保存成功'))
        if (r.ok) { setDirty(false); refresh() }
      }
      const patch = (p) => { setEdit({ ...edit, ...p }); setDirty(true) }
      const setSecs = (secs) => patch({ secs })
      const updSec = (k, p) => setSecs(edit.secs.map((s) => (s.k === k ? { ...s, ...p } : s)))
      const moveSec = (i, d) => { const n = edit.secs.slice(); const [x] = n.splice(i, 1); n.splice(i + d, 0, x); setSecs(n) }
      const delSec = (s) => { if (s.text.trim() && !confirm('删掉「' + (s.title || '未命名') + '」这一节？')) return; setSecs(edit.secs.filter((x) => x.k !== s.k)) }
      const addSec = (title) => setSecs([...edit.secs, psec(title, '')])
      const polish = async (s) => {
        const r = await post('/persona/polish', { name: edit.name, title: s.title === null ? '' : s.title, text: s.text, others: edit.secs.filter((x) => x.k !== s.k).map((x) => (x.title === null ? '开场' : x.title)) })
        if (!r.ok) { toast(r.message || '润色没成功', 'err'); return }
        if (!s.text.trim()) { updSec(s.k, { text: r.text }); toast('写好了，不满意就接着改', 'ok'); return }
        setPending({ ...pending, [s.k]: { text: r.text, view: 'new' } })
      }
      const pick = (s, view) => {
        const next = { ...pending }
        delete next[s.k]
        setPending(next)
        if (view === 'new') updSec(s.k, { text: pending[s.k].text })
      }
      const flip = (s) => setPending({ ...pending, [s.k]: { ...pending[s.k], view: pending[s.k].view === 'new' ? 'old' : 'new' } })
      const setMode = (w) => { if (w && waiting) { toast('先把 AI 润色的那几节选定一版', 'err'); return } setWhole(w); try { localStorage.setItem('halobot.persona.whole', w ? '1' : '0') } catch (e) {} }
      const titles = edit ? edit.secs.map((s) => s.title) : []
      const suggest = PSEC_SUGGEST.filter((t) => !titles.includes(t))
      return h('div', { className: 'ab-persona' },
        h('div', { className: 'ab-plist' },
          list.map((p) => h('button', { key: p.id, type: 'button', className: cx('ab-pitem', sel === p.id && 'on'), onClick: () => setSel(p.id) },
            h('div', { className: 'nm' }, p.name, p.id === current ? h('span', { className: 'ab-badge' }, '正在用') : null),
            h('div', { className: 'tg' }, (p.tags || []).join(' · ') || p.id + ' · ' + p.chars + ' 字'))),
          h(Btn, { kind: 'ghost', onClick: () => { const id = 'persona-' + Date.now().toString(36); setEdit({ id, name: '新人格', tags: '', secs: splitPersona('你是……\n\n【打字习惯】\n- 短句、口语，一次只说一两句。') }); setSel(id); setDirty(true); setPending({}) } }, '＋ 新建人格'),
          h(AvatarCard, { st, toast, reload }),
        ),
        edit ? h(Card, { title: '编辑人格', desc: '人格写在系统提示词的最前面，按节写更好改。保存后，哈洛下一轮回复起就按新的来。',
          right: h('div', { className: 'ab-flex' },
            edit.id !== current ? h(Btn, { small: true, onClick: async () => { const r = await post('/persona/use', { id: edit.id }); toast(r.message); refresh(); reload() } }, '设为当前') : null,
            edit.id !== current ? h(Btn, { small: true, kind: 'danger', onClick: async () => { if (!confirm('删掉这个人格？')) return; const r = await post('/persona/delete', { id: edit.id }); if (r.ok) { setList(r.list); setSel(current) } else toast(r.message) } }, '删除') : null) },
          h(Row, { label: '名字' }, h('input', { className: 'ab-input', value: edit.name, onChange: (e) => patch({ name: e.target.value }) })),
          h(Row, { label: '标签', hint: '用逗号隔开' }, h('input', { className: 'ab-input', value: edit.tags, onChange: (e) => patch({ tags: e.target.value }) })),
          h('div', { className: 'ab-flex', style: { marginTop: 14 } },
            h(Seg, { value: whole ? 'whole' : 'secs', onChange: (v) => setMode(v === 'whole'), options: [{ value: 'secs', label: '分节' }, { value: 'whole', label: '整段' }] }),
            h('div', { className: 'ab-spacer' }),
            h('span', { className: 'ab-muted ab-small' }, (edit.secs.length - 1) + ' 节 · ' + body.length + ' 字')),
          whole
            ? h('textarea', { className: 'ab-textarea', style: { minHeight: 380, marginTop: 12 }, value: body, onChange: (e) => setSecs(splitPersona(e.target.value)) })
            : h('div', { className: 'ab-psecs' },
              edit.secs.map((s, i) => h(PersonaSection, {
                key: s.k, sec: s, lead: s.title === null, first: i <= 1, last: i === edit.secs.length - 1, pending: pending[s.k],
                onChange: (p) => updSec(s.k, p), onMove: (d) => moveSec(i, d), onDelete: () => delSec(s),
                onPolish: () => polish(s), onPick: (v) => pick(s, v), onFlip: () => flip(s),
              })),
              h('div', { className: 'ab-psec-add' },
                h('span', { className: 'ab-muted ab-small' }, '加一节：'),
                suggest.map((t) => h('button', { key: t, type: 'button', className: 'ab-chip', onClick: () => addSec(t) }, t)),
                h('button', { type: 'button', className: 'ab-chip solid', onClick: () => addSec('') }, '＋ 自己起名'))),
          h('div', { className: 'ab-flex', style: { marginTop: 14 } },
            waiting ? h('span', { className: 'ab-muted ab-small' }, '还有 ' + waiting + ' 节 AI 润色没选定，选好再保存') : null,
            h('div', { className: 'ab-spacer' }),
            h(Btn, { kind: 'primary', disabled: !dirty || !!waiting, onClick: save }, dirty ? '保存人格' : '已保存')),
        ) : h(Card, null, h(Empty, { icon: '⏳', text: '加载中…' })),
      )
    }

    function Access({ draft, setDraft }) {
      const f = useField(draft, setDraft)
      return h('div', { className: 'ab-grid' },
        h(Card, { title: '主人', desc: '主人的 QQ 号。群管、点歌、电脑上的操作只听主人的。' },
          h(Row, { label: '主人 QQ 号' }, f.text('ownerQQ')),
          h(Row, { label: '她怎么称呼你' }, f.text('ownerName', { placeholder: '主人' })),
          h(Row, { label: '主人私聊的权限', hint: '群聊永远没有电脑操作权限，这里管不到群。' },
            h('div', { style: { width: '100%' } },
              h(Choices, { value: draft.ownerLevel, onChange: (v) => setDraft(setPath(draft, 'ownerLevel', v)), options: [
                { value: 'full', label: '完整', desc: '私聊里让她用电脑做事（查文件、跑命令、上网查）也能做' },
                { value: 'social', label: '受限', desc: '只有发表情、发说说这类 QQ 工具，碰不到电脑' },
                { value: 'chat', label: '纯聊天', desc: '什么工具都没有，只聊天' },
              ] }),
              h('div', { className: 'ab-muted ab-small', style: { marginTop: 8 } }, '切换后会给主人私聊换一个新的 DSH 会话（旧的还在侧栏里）。'))),
          h(Row, { label: '长任务模式', hint: '只在「完整」权限下生效。打开后她能把命令放到后台跑、跑完自动回来告诉你，也能设定时任务；工具多一点，回话会稍慢。切换后同样换新会话。' },
            h(Choices, { value: draft.longTasks ? 'on' : 'off', onChange: (v) => setDraft(setPath(draft, 'longTasks', v === 'on')), options: [
              { value: 'off', label: '关', desc: '维持现在的速度（默认）' },
              { value: 'on', label: '开', desc: '挂上后台任务（jobs）+ 定时任务（schedule）' },
            ] })),
        ),
        h(ProfilePerms, { draft, setDraft }),
        h(Card, { title: '白名单', desc: '只有名单里的人和群，她才会理。一行一个号码。' },
          h(Row, { label: '私聊白名单', hint: '主人默认就在里面。' }, f.list('allow.private', { placeholder: '每行一个 QQ 号', numbers: true })),
          h(Row, { label: '群白名单', hint: '把机器人拉进群后，把群号加到这里。' }, f.list('allow.groups', { placeholder: '每行一个群号', numbers: true })),
        ),
        h(GroupRoles, null),
        h(CommandList, null),
      )
    }

    /** 改资料类操作的权限：关 / 仅主人私聊 / 所有人。 */
    function ProfilePerms({ draft, setDraft }) {
      const perms = draft.profilePerms || {}
      const opts = [
        { value: 'off', label: '关', desc: '谁说都不改' },
        { value: 'owner', label: '仅主人私聊', desc: '只有你私聊让她改才改（默认）' },
        { value: 'all', label: '所有人', desc: '白名单里的人、群里的人都能让她改' },
      ]
      const row = (key, label, hint) => h(Row, { label, hint },
        h(Choices, { value: perms[key] || 'owner', onChange: (v) => setDraft(setPath(draft, 'profilePerms.' + key, v)), options: opts }))
      return h(Card, { title: '改资料与名单', desc: '她能不能听人的话改自己的 QQ 昵称、签名、头像和 B 站签名，处理好友申请、改白名单，以及抖音上的浏览、点赞、评论、分享。改 QQ 资料要 SnowLuma 支持（set_qq_profile / set_self_longnick / set_qq_avatar）。抖音各项默认仅主人，要放开自己在这里开。' },
        row('qqNickname', 'QQ 昵称'),
        row('qqSignature', 'QQ 个性签名'),
        row('qqAvatar', 'QQ 头像', '只用网址图片，或「刚才发的那张图」。'),
        row('biliSign', 'B 站签名', '要先在 B 站页登录并打开 B 站。'),
        row('biliAvatar', 'B 站头像', '要先在 B 站页登录并打开 B 站。图片网址或刚才发的图，最大 2MB。'),
        row('qqFriendRequest', '处理好友申请', '让她通过 / 拒绝别人加她为好友的申请。她自己主动加别人暂不支持（SnowLuma 没有这个接口）。'),
        row('whitelist', '改白名单', '让她把 QQ 号 / 群号加进或移出下面的白名单。主人不会被移出。开成「所有人」前请想清楚。'),
        row('douyinBrowse', '刷抖音 / 看视频', '让她去刷推荐（douyin_browse）、点开别人发来的抖音链接（douyin_watch）。定时自己刷不受这项限制。'),
        row('douyinLike', '抖音点赞', '有人让她给某个视频点赞；关掉后她自己刷的时候也不点赞。'),
        row('douyinComment', '抖音评论', '有人让她去某个视频下评论；关掉后她自己刷的时候也不评论。'),
        row('douyinShareOwner', '分享抖音给主人', '刷到好玩的视频在 QQ 私聊里发给你（她的话 + 链接）。'),
        row('douyinDm', '主动发抖音私信', '主人明确让她给某个人发私信时（主页链接或抖音号）；列表里没有会话会从对方主页发起。默认仅主人私聊。'),
        row('heyboxBrowse', '逛小黑盒 / 看帖子', '让她翻信息流（heybox_feed）、读帖子正文和热评（heybox_watch）、看热榜和搜帖子（heybox_hot / heybox_search / heybox_topics）。定时自己逛不受这项限制。'),
        row('heyboxLike', '小黑盒点赞', '有人让她给某个帖子点赞；关掉后她自己逛的时候也不点赞。'),
        row('heyboxComment', '小黑盒评论', '有人让她去某个帖子下评论；关掉后她自己逛的时候也不评论。'),
        row('heyboxPost', '小黑盒发帖 / 删帖', '让她发帖（heybox_post，文章模式可带图）和删自己发的帖（heybox_delete）。发帖会用你的账号公开发布，默认仅主人私聊。'),
      )
    }

    /** QQ 里的主人命令一览。 */
    function CommandList() {
      const [list, setList] = useState([])
      useEffect(() => { get('/commands').then((r) => setList(r.list || [])) }, [])
      return h(Card, { title: 'QQ 命令', desc: '主人在 QQ 里（私聊或白名单群）直接发这些命令就能管她，别人发了不算。总开关关着时也能用。' },
        h('div', { style: { overflowX: 'auto' } }, h('table', { className: 'ab-table' }, h('tbody', null, list.map((c) => h('tr', { key: c.name },
          h('td', { style: { whiteSpace: 'nowrap' } }, h('code', null, '/' + c.name), c.aliases.length ? h('div', { className: 'ab-muted ab-small' }, c.aliases.map((a) => '/' + a).join(' ')) : null),
          h('td', null, c.desc)))))))
    }

    /** 她在每个白名单群里的身份：群主 / 管理员才能禁言踢人。 */
    function GroupRoles() {
      const [list, setList] = useState(null)
      const load = () => { setList(null); get('/groups/roles').then((r) => setList(r.list || [])) }
      useEffect(load, [])
      return h(Card, { title: '群管权限', desc: '她在群里是群主或管理员时，主人才能让她禁言、踢人、发公告；改专属头衔要群主。按已保存的群白名单查。',
        right: h(Btn, { small: true, kind: 'ghost', onClick: load }, '刷新') },
        !list ? h('div', { className: 'ab-muted ab-small' }, h('i', { className: 'ab-spin' }), ' 查询中…')
          : list.length === 0 ? h('div', { className: 'ab-muted ab-small' }, '群白名单是空的。')
          : h('div', { style: { overflowX: 'auto' } }, h('table', { className: 'ab-table' },
            h('thead', null, h('tr', null, ['群', '她的身份', '群管'].map((x) => h('th', { key: x }, x)))),
            h('tbody', null, list.map((g) => h('tr', { key: g.groupId },
              h('td', null, (g.name && g.name !== g.groupId ? g.name + ' ' : '') + '(' + g.groupId + ')'),
              h('td', null, g.label),
              h('td', null, g.canManage ? h('span', { className: 'ab-badge' }, '可以') : h('span', { className: 'ab-muted ab-small' }, '不行'))))))))
    }

    /** 按群头衔不理：勾选的群里，专属头衔是某个词的成员（别的机器人）她不理。头衔可以从群里现有的里面点一个。 */
    function TitleFilter({ draft, setDraft }) {
      const tf = draft.titleFilter || { enabled: true, groups: [], title: '哈洛' }
      const [info, setInfo] = useState(null) // { groups, titles, failed, message } 拉过才有 titles
      const [busy, setBusy] = useState(false)
      const set = (p) => setDraft(setPath(draft, 'titleFilter', { ...tf, ...p }))
      const pull = async () => {
        setBusy(true)
        const r = await get('/groups/titles')
        setBusy(false)
        if (r.ok) setInfo(r)
        else setInfo({ groups: [], titles: [], message: r.message || '没拉到' })
      }
      useEffect(() => { pull() }, [])
      const groups = (draft.allow.groups || []).map(String)
      const nameOf = (gid) => { const g = ((info && info.groups) || []).find((x) => x.groupId === gid); return g && g.name && g.name !== gid ? g.name : '' }
      const on = (gid) => tf.groups.includes(gid)
      const hit = info && info.titles ? info.titles.find((t) => t.title === tf.title.trim()) : null
      return h(Card, { title: '按头衔不理（防机器人互聊）', right: h(Switch, { on: tf.enabled, onChange: (v) => set({ enabled: v }) }),
        desc: '同一个群里有别的机器人时，给它们挂上同一个专属头衔（比如「哈洛」），她在勾选的群里就不理它们：说话、@ 她、戳她都不回，免得机器人之间互相接话停不下来。只认专属头衔，昵称和群名片不算；私聊不受影响。' },
        h(Row, { label: '要不理的头衔', hint: '一字不差才算。下面列出白名单群里现有的头衔，点一个就填进来。' },
          h('div', { style: { width: '100%' } },
            h('div', { className: 'ab-flex' },
              h('input', { className: 'ab-input', value: tf.title, maxLength: 30, placeholder: '哈洛', onChange: (e) => set({ title: e.target.value }) }),
              h(Btn, { small: true, onClick: pull, disabled: busy }, busy ? '拉取中…' : '从群里拉取头衔')),
            info && info.titles ? h('div', { className: 'ab-psec-add', style: { marginTop: 10 } },
              info.titles.length
                ? info.titles.slice(0, 30).map((t) => h('button', { key: t.title, type: 'button', className: cx('ab-chip', t.title === tf.title.trim() && 'on'), title: t.members.map((m) => m.name).join('、'), onClick: () => set({ title: t.title }) }, t.title, h('span', { className: 'n' }, t.count + ' 人')))
                : h('span', { className: 'ab-muted ab-small' }, groups.length ? '这些群里还没有人挂专属头衔。' : '群白名单是空的，先在「权限」页加群。')) : null,
            hit ? h('div', { className: 'ab-tf-who' }, '挂着「' + hit.title + '」的：' + hit.members.map((m) => m.name + '（' + m.id + '）').join('、') + (hit.count > hit.members.length ? ' 等 ' + hit.count + ' 人' : '')) : null,
            info && info.message ? h('div', { className: 'ab-muted ab-small', style: { marginTop: 6 } }, info.message) : null)),
        h(Row, { label: '在哪些群生效', hint: '没勾的群照常回。只列白名单里的群。' },
          groups.length
            ? h('div', { className: 'ab-flex' }, groups.map((gid) => h('button', { key: gid, type: 'button', className: cx('ab-chip', on(gid) && 'on'), onClick: () => set({ groups: on(gid) ? tf.groups.filter((x) => x !== gid) : [...tf.groups, gid] }) },
              (on(gid) ? '✓ ' : '') + (nameOf(gid) || '群'), h('span', { className: 'n' }, gid))))
            : h('span', { className: 'ab-muted ab-small' }, '群白名单是空的。')),
        h('div', { className: 'ab-muted ab-small', style: { marginTop: 6 } }, '查不到某人的头衔时（网关抽风），那条先不回，过几秒再查；成员改了头衔一分钟内生效。'))
    }

    /** 主人私聊里问起群里的事：把最近群聊流水补进当轮上下文（默认关）。 */
    function OwnerBrief({ draft, setDraft }) {
      const f = useField(draft, setDraft)
      const ob = draft.group.ownerBrief || { enabled: false, lines: 12, groups: [] }
      const groups = (draft.allow.groups || []).map(String)
      const [info, setInfo] = useState(null)
      useEffect(() => { get('/groups/titles').then((r) => { if (r.ok) setInfo(r) }).catch(() => {}) }, [])
      const nameOf = (gid) => {
        const g = ((info && info.groups) || []).find((x) => x.groupId === gid)
        return g && g.name && g.name !== gid ? g.name : ''
      }
      const on = (gid) => (ob.groups || []).includes(gid)
      const toggle = (gid) => setDraft(setPath(draft, 'group.ownerBrief.groups', on(gid) ? (ob.groups || []).filter((x) => x !== gid) : [...(ob.groups || []), gid]))
      return h(Card, { title: '主人私聊：群聊摘要', right: f.sw('group.ownerBrief.enabled'),
        desc: '主人在私聊里问起群里的事时，把最近 24 小时的群聊流水当成「她自己的见闻」补进这一轮上下文。只在「主人私聊 + 这句话提到群相关」时触发，不常驻、不写进记忆；默认关。开启前先在「权限」页把群加进白名单。' },
        h(Row, { label: '每个群给几条', hint: '越少越省上下文；最多 30 条' }, f.range('group.ownerBrief.lines', 1, 30, 1, (v) => v + ' 条')),
        h(Row, { label: '只取哪些群', hint: '没勾 = 所有白名单群；只列白名单里的群' },
          groups.length
            ? h('div', { className: 'ab-flex' }, groups.map((gid) => h('button', { key: gid, type: 'button', className: cx('ab-chip', on(gid) && 'on'), onClick: () => toggle(gid) },
              (on(gid) ? '✓ ' : '') + (nameOf(gid) || '群'), h('span', { className: 'n' }, gid))))
            : h('span', { className: 'ab-muted ab-small' }, '群白名单是空的，先在「权限」页加群。')),
        h('div', { className: 'ab-muted ab-small', style: { marginTop: 6 } }, '她只会当成自己最近在群里看到的，不会把群聊原文说成是主人发的。'))
    }

    function Group({ draft, setDraft }) {
      const f = useField(draft, setDraft)
      const overrides = draft.group.overrides || {}
      const [newGid, setNewGid] = useState('')
      return h('div', { className: 'ab-grid' },
        h(Card, { title: '连发合并', right: f.sw('merge.enabled'), desc: '人常常一口气发好几句。打开后她会等对方说完再一起回，而不是一句一回。' },
          h(Row, { label: '对方停顿多久算说完' }, f.range('merge.waitSec', 0.5, 10, 0.5, (v) => v + ' 秒')),
          h(Row, { label: '最多等多久', hint: '对方一直在发也最多等这么久' }, f.range('merge.maxSec', 2, 30, 1, (v) => v + ' 秒')),
          h(Row, { label: '群里停顿多久算一段', hint: '群里大家你一句我一句，多等一会儿把一段话攒齐再回；她回上一段的时候，新消息也会先攒着' }, f.range('merge.groupWaitSec', 1, 20, 1, (v) => v + ' 秒')),
          h(Row, { label: '群里最多等多久' }, f.range('merge.groupMaxSec', 3, 60, 1, (v) => v + ' 秒')),
        ),
        h(Card, { title: '回复分几条', desc: '真人不按行数说话。她写完一整段，由插件按内容长短决定发成几条。' },
          h(Row, { label: '怎么拆', hint: '自然：短的一句就够，超过下面字数才拆成两条、再长拆三条；一条：整轮只发一条；按行：以前那样，模型换一行就发一条' },
            f.choices('reply.split', [
              { value: 'natural', label: '自然（推荐）', desc: '按长度和句子自动决定，通常一条' },
              { value: 'one', label: '一条', desc: '整轮只发一条，长就长点' },
              { value: 'line', label: '按行', desc: '恢复以前的行为：一行一条，容易刷屏' },
            ])),
          draft.reply.split === 'natural' ? h(Row, { label: '一条最多几个字', hint: '这段以内一定只发一条。调小＝更容易拆成两条，调大＝更爱一口气说完' },
            f.num('reply.oneMax', { min: 12, max: 120 }), h('span', { className: 'ab-muted' }, '字')) : null,
          draft.reply.split === 'natural' ? h(Row, { label: '超过就拆的概率', hint: '默认 100%：超过上面字数就一定拆。调低就有的拆、有的整段发，更像随手打字（不是每条都一个样）' },
            f.percent('reply.chance')) : null,
        ),
        h(Card, { title: '她问完没人回', right: f.sw('followUp.enabled'), desc: '她问完一句、你一直没接的时候，过一会儿补一句很短的催一下（像真人说的「人呢」「说嘛」）。只在问句后触发，你一回话就停。' },
          h(Row, { label: '等多久补一句', hint: '她问完之后这么多秒还没人回，就补一句；别调太短，不然像催命' }, f.range('followUp.waitSec', 15, 300, 5, (v) => v + ' 秒')),
          h(Row, { label: '最多补几次', hint: '0 = 不补（等于关掉）。补完还是不回，她就不追了' }, f.num('followUp.maxTimes', { min: 0, max: 5 }), h('span', { className: 'ab-muted' }, '次')),
          h(Row, { label: '算不算在问', hint: '她很少写问号，所以按语气判断：严格＝明显在等回答才催；宽松＝带点疑问语气也算' },
            f.choices('followUp.mode', [
              { value: 'strict', label: '严格（推荐）', desc: '明显在等回答才补' },
              { value: 'loose', label: '宽松', desc: '带疑问语气也补，会更主动' },
            ])),
        ),
        h(TitleFilter, { draft, setDraft }),
        h(OwnerBrief, { draft, setDraft }),
        h(Card, { title: '发文件', right: f.sw('files.enabled'), desc: '打开后，你在私聊里可以让她把本机文件当文件发到 QQ，也能按你说的发给白名单里的人或群。她只能发 QQ 工作区和下面目录里的文件；单个文件有大小上限；发过什么会记在日志里。' },
          h(Row, { label: '单个文件最大' }, f.num('files.maxMB', { min: 1, max: 2048 }), h('span', { className: 'ab-muted' }, ' MB')),
          h(Row, { label: '额外允许的目录', hint: '一行一个完整路径。QQ 工作区里的文件一直允许，不用写；留空 = 只能发工作区里的' }, f.list('files.dirs', { placeholder: 'D:\\Halobot\\要发的文件' })),
        ),
                h(Card, { title: '危险命令确认', right: f.sw('security.dangerConfirm'), desc: '打开后，她在私聊里要执行终端危险命令（删根目录、格式化、关机、下载后直接执行等）之前，会先发 QQ 私聊问你；你回复「确认」才执行，回复「取消」或 60 秒没回就拦下。默认关。只拦真正致命的命令，普通删除/构建/改文件不受影响。' }),
h(Card, { title: '群里什么时候必回', desc: '被 @、有人引用回复她的消息、或者提到下面这些名字时，她一定会回。' },
          h(Row, { label: '唤醒词', hint: '一行一个' }, f.list('group.wakeWords', { placeholder: '哈洛\n洛洛\nHalo' })),
        ),
        h(Card, { title: '安全刹车', desc: '只防失控（比如和别的机器人聊停不下来）：她在一个群里短时间说太多就歇一会儿，主人 @ 她除外。平时碰不到。' },
          h(Row, { label: '最多说几次' }, f.range('group.burstMax', 1, 20, 1, (v) => v + ' 次'), h('span', { className: 'ab-muted' }, '/'), f.range('group.burstWindowSec', 30, 600, 30, (v) => Math.round(v / 6) / 10 + ' 分钟')),
        ),
        h(Card, { title: '群里插话', desc: '没人叫她的时候，她也可能自然地插一句；她看完群里在聊什么，也可以决定不说话。' },
          h(Row, { label: '插话概率', hint: '每条普通消息触发插话的机会' }, f.percent('group.interjectChance')),
          h(Row, { label: '冷却', hint: '两次插话至少隔多久' }, f.range('group.cooldownSec', 0, 600, 10, (v) => v + ' 秒')),
          h(Row, { label: '每小时最多插话' }, f.range('group.maxPerHour', 0, 30, 1, (v) => v + ' 次')),
          h(Row, { label: '她感兴趣的话题', hint: '群里在聊这些（或她记得相关的事）时更容易插话；一行一个' }, f.list('group.interests', { placeholder: '白米饭\n游戏\n追剧' })),
          h(Row, { label: '话题相关度门槛', hint: '和她关系不大的话题就不插话；拉到 0 = 不看话题、纯随机' }, f.range('group.minRelevance', 0, 1, 0.05, (v) => (v === 0 ? '不看话题' : Math.round(v * 100) + '%'))),
          h('div', { className: 'ab-note', style: { marginTop: 8 } }, '她被叫到或插上话以后算「加入了话题」：话题还和她相关、她 3 分钟内说过话，就会接着聊下去（每次看完群里新说的一段再回），不受冷却和每小时上限限制；话题跑偏或者她选择不说话就退出。'),
          h(Row, { label: '群冷清时不插话', hint: '最近几分钟内消息少于这个数就不插' }, f.num('group.minRecentMessages', { min: 0 }), h('span', { className: 'ab-muted' }, '条 / '), f.num('group.activeWindowSec', { min: 30 }), h('span', { className: 'ab-muted' }, '秒')),
          h(Row, { label: '静默时段', hint: '这段时间不插话（被叫到还是会回）' },
            h('input', { className: 'ab-input sm', type: 'number', min: 0, max: 23, value: draft.group.quietHours[0], onChange: (e) => setDraft(setPath(draft, 'group.quietHours', [Number(e.target.value), draft.group.quietHours[1]])) }),
            h('span', { className: 'ab-muted' }, '点 到'),
            h('input', { className: 'ab-input sm', type: 'number', min: 0, max: 23, value: draft.group.quietHours[1], onChange: (e) => setDraft(setPath(draft, 'group.quietHours', [draft.group.quietHours[0], Number(e.target.value)])) }),
            h('span', { className: 'ab-muted' }, '点')),
        ),
        h(Card, { title: '按群单独设置', desc: '某个群想让她更安静或更活跃，在这里单独设插话概率。' },
          Object.keys(overrides).length === 0 ? h('div', { className: 'ab-muted', style: { marginBottom: 10 } }, '还没有单独设置的群。') :
            Object.entries(overrides).map(([gid, o]) => h(Row, { key: gid, label: '群 ' + gid },
              h('input', { className: 'ab-input sm', type: 'number', min: 0, max: 100, value: pct(o.interjectChance ?? draft.group.interjectChance), onChange: (e) => setDraft(setPath(draft, 'group.overrides', { ...overrides, [gid]: { ...o, interjectChance: Number(e.target.value) / 100 } })) }),
              h('span', { className: 'ab-muted' }, '% 插话'),
              h(Btn, { small: true, kind: 'ghost', onClick: () => { const n = { ...overrides }; delete n[gid]; setDraft(setPath(draft, 'group.overrides', n)) } }, '移除'))),
          h('div', { className: 'ab-flex' }, h('input', { className: 'ab-input', placeholder: '群号', value: newGid, onChange: (e) => setNewGid(e.target.value.replace(/\D/g, '')) }),
            h(Btn, { small: true, disabled: !newGid, onClick: () => { setDraft(setPath(draft, 'group.overrides', { ...overrides, [newGid]: { interjectChance: draft.group.interjectChance } })); setNewGid('') } }, '添加')),
        ),
      )
    }

    /** 按聊天选模型：私聊默认 / 群聊默认两个下拉，单个 QQ / 群的例外放在默认收起的小列表里。 */
    function ChatModels({ draft, setDraft, list }) {
      const cm = draft.chatModels || { privateDefault: {}, groupDefault: {}, privates: {}, groups: {} }
      const [open, setOpen] = useState(false)
      const [add, setAdd] = useState({ kind: 'private', id: '', sel: '' })
      const key = (m) => m.provider + '::' + m.model
      const val = (s) => (s && s.provider && s.model ? s.provider + '::' + s.model : '')
      const toSel = (v) => { const [p, ...m] = v.split('::'); return v ? { provider: p, model: m.join('::'), reasoningEffort: '' } : { provider: '', model: '', reasoningEffort: '' } }
      const base = [{ value: '', label: '跟随全局模型', desc: '上面「聊天用的模型」' }].concat((list || []).map((m) => ({ value: key(m), label: m.name, desc: m.provider, group: m.provider })))
      const optsFor = (v) => (v && !base.some((o) => o.value === v) ? base.concat([{ value: v, label: v.split('::').slice(1).join('::'), desc: '（DSH 里没找到）' }]) : base)
      const setCm = (patch) => setDraft(setPath(draft, 'chatModels', { ...cm, ...patch }))
      const rows = [['private', cm.privates || {}], ['group', cm.groups || {}]].flatMap(([kind, m]) => Object.entries(m).map(([id, sel]) => ({ kind, id, sel })))
      const label = (sel) => { const v = val(sel); const hit = (list || []).find((m) => key(m) === v); return hit ? hit.name : sel.model }
      const addRow = () => {
        if (!add.id || !add.sel) return
        const field = add.kind === 'private' ? 'privates' : 'groups'
        setCm({ [field]: { ...(cm[field] || {}), [add.id]: toSel(add.sel) } })
        setAdd({ ...add, id: '' })
      }
      const remove = (kind, id) => { const field = kind === 'private' ? 'privates' : 'groups'; const n = { ...(cm[field] || {}) }; delete n[id]; setCm({ [field]: n }) }
      return h(Card, { title: '按聊天选模型', desc: '顺序：这个私聊 > 这个群 > 所有私聊 / 所有群的默认 > 上面的全局模型。没选的一级就用下一级；选的模型在 DSH 里找不到时也自动退回。只有你能在这里改，聊天里的人换不了。换了之后从那个聊天的下一条消息起生效。' },
        h(Row, { label: '私聊默认模型' }, h(Select, { value: val(cm.privateDefault), width: 280, options: optsFor(val(cm.privateDefault)), onChange: (v) => setCm({ privateDefault: toSel(v) }) })),
        h(Row, { label: '群聊默认模型' }, h(Select, { value: val(cm.groupDefault), width: 280, options: optsFor(val(cm.groupDefault)), onChange: (v) => setCm({ groupDefault: toSel(v) }) })),
        h('div', { style: { marginTop: 8 } }, h(Btn, { small: true, kind: 'ghost', onClick: () => setOpen(!open) }, (open ? '收起' : '展开') + '单个 QQ / 群的例外（' + rows.length + '）')),
        open ? h('div', { style: { marginTop: 8 } },
          rows.length === 0 ? h('div', { className: 'ab-muted', style: { marginBottom: 10 } }, '还没有单独设置的 QQ 或群。') :
            rows.map((r) => h(Row, { key: r.kind + r.id, label: (r.kind === 'private' ? '私聊 ' : '群 ') + r.id }, h('span', { className: 'ab-muted' }, label(r.sel)), h(Btn, { small: true, kind: 'ghost', onClick: () => remove(r.kind, r.id) }, '移除'))),
          h('div', { className: 'ab-flex' },
            h(Seg, { value: add.kind, onChange: (v) => setAdd({ ...add, kind: v }), options: [{ value: 'private', label: '私聊' }, { value: 'group', label: '群' }] }),
            h('input', { className: 'ab-input', placeholder: add.kind === 'private' ? 'QQ 号' : '群号', value: add.id, onChange: (e) => setAdd({ ...add, id: e.target.value.replace(/\D/g, '') }) }),
            h(Select, { value: add.sel, width: 220, options: base.filter((o) => o.value), placeholder: '选模型', onChange: (v) => setAdd({ ...add, sel: v }) }),
            h(Btn, { small: true, disabled: !add.id || !add.sel, onClick: addRow }, '添加'))) : null)
    }

    function Model({ draft, setDraft, toast }) {
      const f = useField(draft, setDraft)
      const [list, setList] = useState(null)
      const [ping, setPing] = useState({})
      useEffect(() => { get('/models').then((r) => setList(r.list || [])) }, [])
      const key = (m) => m.provider + '::' + m.model
      const cur = draft.model.provider && draft.model.model ? draft.model.provider + '::' + draft.model.model : ''
      const curModel = cur && list ? list.find((m) => key(m) === cur) : null
      // reasoning === null 表示 DSH 明确说这个模型不支持思考强度（本地 Ollama 之类）
      const noReasoning = Boolean(curModel && curModel.reasoning === null)
      // 视觉能力：自动时把 DSH 的声明显示出来，主人一眼能看出会不会降级
      const autoVision = curModel ? curModel.vision : undefined
      const visionHint = draft.model.vision === 'on'
        ? '强制当「能看图」；模型其实看不了的话，带图的那一轮会报错'
        : draft.model.vision === 'off'
          ? '强制当「看不懂」：收到图片只给一行文字提示，不会把图塞给模型'
          : autoVision === true
            ? '自动：DSH 说这个模型支持看图'
            : autoVision === false
              ? '自动：DSH 说这个模型看不了图，会自动降级成文字提示'
              : '自动：DSH 没声明，默认照发；真看不了就手动选「不支持」'
      const test = async (m) => {
        setPing({ ...ping, [key(m)]: '测速中…' })
        const r = await post('/model/ping', { provider: m.provider, model: m.model })
        setPing((p) => ({ ...p, [key(m)]: r.ok ? (r.ms / 1000).toFixed(1) + ' 秒' : '失败：' + (r.message || '') }))
      }
      return h('div', { className: 'ab-grid' },
        h(Card, { title: '聊天用的模型', desc: '新建的 QQ 会话按这里的设置来；已有会话也可以在 DSH 里点开单独切换。聊天对速度很敏感，可以先点「测速」挑个快的。' },
          h(Row, { label: '思考强度', hint: noReasoning ? '这个模型不支持思考强度，会自动忽略' : '聊天建议「低」，回得快' }, h(Seg, { value: draft.model.reasoningEffort || 'low', disabled: noReasoning, onChange: (v) => setDraft(setPath(draft, 'model.reasoningEffort', v)), options: [{ value: 'low', label: '低' }, { value: 'high', label: '高' }, { value: 'max', label: '最高' }] })),
          h(Row, { label: '视觉能力', hint: visionHint }, h(Seg, {
            value: draft.model.vision || 'auto',
            onChange: (v) => setDraft(setPath(draft, 'model.vision', v)),
            options: [{ value: 'auto', label: '自动' }, { value: 'on', label: '支持' }, { value: 'off', label: '不支持' }],
          })),
          h(Row, { label: '模型' },
            h(Select, {
              value: cur, width: 280,
              options: [{ value: '', label: '跟随 DSH 默认', desc: '和你在 DSH 里平时用的一样' }].concat((list || []).map((m) => ({ value: key(m), label: m.name, desc: m.provider, group: m.provider }))),
              onChange: (v) => { const [p, ...m] = v.split('::'); setDraft(setPath(setPath(draft, 'model.provider', v ? p : ''), 'model.model', v ? m.join('::') : '')) },
            }),
            cur ? h(Btn, { small: true, onClick: () => test({ provider: draft.model.provider, model: draft.model.model }) }, '测速') : null,
            cur && ping[cur] ? h('span', { className: 'ab-muted ab-small' }, ping[cur]) : null),
        ),
        h(ChatModels, { draft, setDraft, list }),
        h(Card, { title: '可用的模型', desc: '点「测速」会真的问一次模型（花一点点额度），看它回一句话要多久。' },
          list === null ? h(Empty, { icon: '⏳', text: '加载中…' }) : list.length === 0 ? h(Empty, { text: 'DSH 没有列出模型' }) :
            h('div', { style: { overflowX: 'auto' } }, h('table', { className: 'ab-table' }, h('tbody', null, list.map((m) => h('tr', { key: key(m) },
              h('td', null, m.name), h('td', { className: 'ab-muted' }, m.provider),
              h('td', null, ping[key(m)] || ''),
              h('td', { style: { textAlign: 'right' } }, h(Btn, { small: true, kind: 'ghost', onClick: () => test(m) }, '测速'), h(Btn, { small: true, kind: 'ghost', onClick: () => { setDraft(setPath(setPath(draft, 'model.provider', m.provider), 'model.model', m.model)); toast('选好了，记得保存') } }, '用这个'))))))),
        ),
        h(Card, { title: 'Token 单价（算花费）', desc: 'DSH 本身没有价目表，概览卡里的「估算花费」要在这里填了单价才会算。按模型官网的「元 / 百万 token」填；留 0 就只显示 token、不显示钱。' },
          h('div', { className: 'ab-small', style: { margin: '12px 0 2px', fontWeight: 600 } }, '高峰时段（周一至周五 9:00–12:00、14:00–18:00，北京时间）'),
          h(Row, { label: '输入（没命中缓存）', hint: '通常是最贵的一档' }, f.num('usage.prices.peak.miss', { min: 0, step: 0.01 }), h('span', { className: 'ab-muted' }, ' 元 / 百万 token')),
          h(Row, { label: '输入（命中缓存）', hint: '命中缓存的输入单价，一般便宜一个数量级' }, f.num('usage.prices.peak.hit', { min: 0, step: 0.001 }), h('span', { className: 'ab-muted' }, ' 元 / 百万 token')),
          h(Row, { label: '输出' }, f.num('usage.prices.peak.out', { min: 0, step: 0.01 }), h('span', { className: 'ab-muted' }, ' 元 / 百万 token')),
          h('div', { className: 'ab-small', style: { margin: '16px 0 2px', fontWeight: 600 } }, '空闲时段（其余时间，含周末与法定节假日全天）'),
          h(Row, { label: '输入（没命中缓存）' }, f.num('usage.prices.idle.miss', { min: 0, step: 0.01 }), h('span', { className: 'ab-muted' }, ' 元 / 百万 token')),
          h(Row, { label: '输入（命中缓存）' }, f.num('usage.prices.idle.hit', { min: 0, step: 0.001 }), h('span', { className: 'ab-muted' }, ' 元 / 百万 token')),
          h(Row, { label: '输出' }, f.num('usage.prices.idle.out', { min: 0, step: 0.01 }), h('span', { className: 'ab-muted' }, ' 元 / 百万 token')),
          h('div', { className: 'ab-muted ab-small' }, '默认值就是 DeepSeek 官方价目（高峰 2 / 0.04 / 8，空闲 1 / 0.02 / 4），按官网调整即可。填好保存后，概览卡按采样那一刻的时段分别计价；周末和法定节假日全天按空闲算，官方调休补班的周末也默认按空闲算（想按高峰算可在配置 usage.workdays 里补日期）。'),
        ),
      )
    }

    /** 语音条变声：用「翻唱」页导入的 RVC 音色模型（TTS 后接一层 RVC）。 */
    function VoiceSongModel({ draft, setDraft }) {
      const [s, setS] = useState(null)
      const f = useField(draft, setDraft)
      useEffect(() => { get('/voice/song-voices').then(setS).catch(() => setS({ ok: false, voices: [], message: '没查到翻唱音色' })) }, [])
      const voices = (s && s.voices) || []
      return h(Card, { title: '语音条变声（用翻唱音色）', desc: '把她说话的声音也换成「翻唱」页导入的 RVC 音色模型：先 TTS 念出来，再用同一个音色变声。默认不变声，直接用 TTS 原声；变声失败会自动回退原声，不影响发送。' },
        h(Row, { label: '翻唱音色', hint: s && s.available === false ? (s.message || '翻唱环境还没装好，装好并导入音色后才能选') : '只列「翻唱」页导入过的 .pth 音色（带 index 的会标出来）' },
          f.select('voice.songVoice', [{ value: '', label: '不变声（TTS 原声）' }, ...voices.map((v) => ({ value: v.id, label: v.id + (v.hasIndex ? '（有 index）' : '') }))], { width: 280 })),
        h(Row, { label: '变调', hint: '模型是男声训练的、想变成女声一般 +12；不确定就 0' },
          f.num('voice.songPitch', { min: -24, max: 24 }), h('span', { className: 'ab-muted' }, ' 半音')),
        h('div', { className: 'ab-muted ab-small' }, !s ? '正在查翻唱音色…' : (s.available ? '变声要跑一次 RVC，会比普通语音慢几秒；单次变声失败会自动用原声。' : (s.message || '翻唱环境还没装好（面板「翻唱」页一键安装、导入音色后才能给语音条变声）')))) 
    }

    function Voice({ st, draft, setDraft, toast, reload }) {
      const f = useField(draft, setDraft)
      const [txt, setTxt] = useState('晚安啦，今天也辛苦了，明天见～')
      const [src, setSrc] = useState('')
      return h('div', { className: 'ab-grid' },
        h(Card, { title: '说话（文字转语音）', right: f.sw('voice.enabled'), desc: '回复里写了 <voice>…</voice> 的部分会变成 QQ 语音条；对方明确要语音时一定发语音；短回复也有一定概率整条变语音。' },
          h('div', { style: { margin: '4px 0 12px' } }, f.choices('voice.engine', [
            { value: 'auto', label: '自动', desc: 'edge-tts 优先，不行用 Windows 语音' },
            { value: 'edge', label: '微软 edge-tts', desc: st.voice.edgeInstalled ? '在线，音色自然（已装好）' : '在线，音色自然（还没装）' },
            { value: 'cosyvoice', label: '本地 CosyVoice', desc: '自己部署的 CosyVoice 服务，可克隆音色' },
            { value: 'gptsovits', label: '本地 GPT-SoVITS', desc: 'GPT-SoVITS api_v2，用参考音频定音色' },
            { value: 'http', label: '其他 HTTP 接口', desc: '任意返回音频的地址' },
            { value: 'windows', label: 'Windows 自带', desc: '离线可用，机械感重一些' },
          ])),
          ['auto', 'edge'].includes(draft.voice.engine) ? [
            !st.voice.edgeInstalled ? h(Row, { key: 'i', label: 'edge-tts', hint: '装在插件自己的 Python 环境里，不影响系统' }, h(Btn, { small: true, onClick: async () => { toast('正在安装，可能要一两分钟…'); const r = await post('/voice/install'); toast(r.message); reload() } }, '安装 edge-tts')) : null,
            h(Row, { key: 'v', label: '音色' }, f.select('voice.voice', [
              { value: 'zh-CN-XiaoyiNeural', label: '晓伊', desc: '活泼女声', group: '普通话' }, { value: 'zh-CN-XiaoxiaoNeural', label: '晓晓', desc: '温柔女声', group: '普通话' },
              { value: 'zh-CN-YunxiNeural', label: '云希', desc: '少年男声', group: '普通话' },
              { value: 'zh-CN-liaoning-XiaobeiNeural', label: '晓北', desc: '东北女声', group: '方言' }, { value: 'zh-CN-shaanxi-XiaoniNeural', label: '晓妮', desc: '陕西女声', group: '方言' },
              { value: 'zh-TW-HsiaoChenNeural', label: '曉臻', desc: '台湾女声', group: '方言' }], { width: 220 })),
            h(Row, { key: 'r', label: '语速' }, f.select('voice.rate', [{ value: '-20%', label: '慢一点' }, { value: '-10%', label: '稍慢' }, { value: '+0%', label: '正常' }, { value: '+10%', label: '稍快' }, { value: '+20%', label: '快一点' }], { width: 140 })),
            h(Row, { key: 'p', label: '音调', hint: '拖动调整，±80Hz 为上限（实测再往上 edge-tts 会静默夹住）；只对 edge-tts 有效' },
              h(Range, {
                min: -80,
                max: 80,
                step: 10,
                value: pitchNum(draft.voice.pitch),
                fmt: pitchLabel,
                onChange: (v) => setDraft(setPath(draft, 'voice.pitch', pitchText(v))),
              })),
          ] : null,
          draft.voice.engine === 'cosyvoice' ? [
            h(Row, { key: 'u', label: '服务地址', hint: 'CosyVoice 自带 runtime/python/fastapi/server.py' }, f.text('voice.cosyvoice.url', { size: 'wide', placeholder: 'http://127.0.0.1:50000' })),
            h(Row, { key: 'm', label: '模式' }, f.select('voice.cosyvoice.mode', [{ value: 'sft', label: '预置音色（sft）' }, { value: 'instruct', label: '带语气指令（instruct）' }], { width: 220 })),
            h(Row, { key: 's', label: '音色 ID', hint: '例如 中文女、中文男' }, f.text('voice.cosyvoice.spkId')),
            draft.voice.cosyvoice.mode === 'instruct' ? h(Row, { key: 'i', label: '语气指令', hint: '例如：用甜美撒娇的语气说' }, f.text('voice.cosyvoice.instruct', { size: 'wide' })) : null,
            h(Row, { key: 'r', label: '采样率', hint: 'CosyVoice 1 是 22050，CosyVoice 2 是 24000' }, f.select('voice.cosyvoice.sampleRate', [{ value: 22050, label: '22050 Hz' }, { value: 24000, label: '24000 Hz' }], { width: 160 })),
          ] : null,
          draft.voice.engine === 'gptsovits' ? [
            h(Row, { key: 'u', label: '服务地址', hint: 'GPT-SoVITS 的 api_v2.py' }, f.text('voice.gptsovits.url', { size: 'wide', placeholder: 'http://127.0.0.1:9880' })),
            h(Row, { key: 'a', label: '参考音频路径', hint: '服务那台电脑上的路径' }, f.text('voice.gptsovits.refAudio', { size: 'wide' })),
            h(Row, { key: 'p', label: '参考音频的文字' }, f.text('voice.gptsovits.promptText', { size: 'wide' })),
          ] : null,
          draft.voice.engine === 'http' ? h(Row, { label: '地址模板', hint: '{text} 会换成要念的话，返回 wav/mp3' }, f.text('voice.http.urlTemplate', { size: 'wide', placeholder: 'http://127.0.0.1:8000/tts?text={text}' })) : null,
          h(Row, { label: '短回复变语音的概率' }, f.percent('voice.autoChance')),
          h(Row, { label: '多短算短回复' }, f.range('voice.autoMaxChars', 10, 200, 5, (v) => v + ' 字')),
          h(Row, { label: '试听', hint: '先保存设置再试听' },
            h('input', { className: 'ab-input', value: txt, onChange: (e) => setTxt(e.target.value) }),
            h(Btn, { small: true, onClick: async () => { const r = await post('/voice/test', { text: txt }); if (r.ok) setSrc('data:' + r.mime + ';base64,' + r.data); else toast(r.message) } }, '生成'),
            src ? h('audio', { src, controls: true, autoPlay: true, style: { height: 32 } }) : null),
        ),
        h(VoiceSongModel, { draft, setDraft }),
        h(Card, { title: '听语音（语音转文字）', right: f.sw('voice.asr'), desc: '别人发来的语音会先转成文字再交给她：优先用 QQ 自带的转文字，不行再用 DSH 自带的语音识别（要在 DSH「插件」里开启「语音输入」）。' },
          h(AsrStatus, { toast })),
      )
    }

    function AsrStatus({ toast }) {
      const [s, setS] = useState(null)
      const load = () => get('/voice/asr-status').then(setS)
      useEffect(() => { load(); const t = setInterval(load, 5000); return () => clearInterval(t) }, [])
      const phase = s && s.enabled ? ({ ready: '已就绪', standby: '已就绪（休眠中）', idle: '还没下载模型', preparing: '正在下载模型…', downloading: '正在下载模型…', failed: '下载失败' }[s.phase] || s.phase) : null
      return h('div', { className: 'ab-flex' },
        h('span', { className: 'ab-pill' }, h('i', { className: cx('ab-dot', s && s.enabled && ['ready', 'standby'].includes(s.phase) ? 'ok' : s && s.enabled ? 'warn' : '') }), s === null ? '查询中…' : s.enabled ? 'DSH 识别：' + phase : 'DSH 识别：没开启（DSH「插件」→「语音输入」）'),
        s && s.enabled && !['ready', 'standby'].includes(s.phase) ? h(Btn, { small: true, onClick: async () => { const r = await post('/voice/asr-prepare'); toast(r.message); load() } }, '下载识别模型') : null,
        s && s.enabled && ['ready', 'standby'].includes(s.phase) ? h(Btn, { small: true, onClick: async () => { toast('正在测试…'); const r = await post('/voice/asr-test', { text: '今天想吃白米饭' }); toast(r.ok ? '念的是「' + r.said + '」，听成了「' + r.heard + '」' : r.message) } }, '测试一下') : null)
    }

    function Stickers({ draft, setDraft, toast }) {
      const f = useField(draft, setDraft)
      const [items, setItems] = useState(null)
      const fileRef = useRef(null)
      const load = () => get('/stickers').then((r) => setItems(r.items || []))
      useEffect(() => { load() }, [])
      const [newName, setNewName] = useState('')
      const [dirPath, setDirPath] = useState('')
      const [busy, setBusy] = useState('')
      /** 让模型把每张图重新看一遍，重起名字和标签（表情和标签对不上时用）。 */
      const recaptionAll = async () => {
        if (!items || !items.length) return toast('表情库还是空的', 'err')
        if (!confirm(`让模型重新看一遍这 ${items.length} 张表情，覆盖现在的名字和标签？`)) return
        let offset = 0
        let total = 0
        setBusy('正在重新打标…')
        for (let guard = 0; guard < 60; guard++) {
          const r = await post('/sticker/recaption', { all: true, offset, limit: 6 })
          if (!r.ok) { toast(r.message || '没成功', 'err'); break }
          total += r.done || 0
          setBusy(`重新打标：已改 ${total} 张${r.left ? `，还剩 ${r.left} 张…` : ''}`)
          load()
          if (!r.left) { toast(`重新打标完成，改了 ${total} 张`, 'ok'); break }
          offset += 6
        }
        setBusy('')
        load()
      }
      /** 从本机文件夹批量导入图片（名字 / 标签在后台慢慢起，过后点刷新看）。 */
      const importDir = async () => {
        const path = dirPath.trim()
        if (!path) return toast('先填一个文件夹路径', 'err')
        setBusy('正在导入…')
        const r = await post('/sticker/import-dir', { path })
        setBusy('')
        toast(r.message || (r.ok ? '导入完成' : '没导进来'), r.ok ? 'ok' : 'err')
        load()
      }
      // DSH 是 Electron，不支持 prompt() 弹框：名字在页面上填（不填就自动看图起名）
      const upload = async (files) => {
        const list = [...(files || [])]
        if (!list.length) return
        let ok = 0
        const errs = []
        for (const file of list) {
          if (file.size > 5 * 1024 * 1024) { errs.push(file.name + ' 超过 5MB'); continue }
          try {
            const data = await new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = () => rej(new Error('读不了这个文件')); fr.readAsDataURL(file) })
            const r = await post('/sticker/upload', { data, name: list.length === 1 ? newName.trim().slice(0, 12) : '' })
            if (r.ok) ok++
            else errs.push(file.name + '：' + (r.reason || r.message || '没加成功'))
          } catch (e) {
            errs.push(file.name + '：' + e.message)
          }
        }
        setNewName('')
        toast(errs.length ? (ok ? `加好 ${ok} 张；` : '') + errs.join('；') : `加好了 ${ok} 张`, errs.length ? 'err' : 'ok')
        load()
      }
      return h('div', { className: 'ab-grid' },
        h(Card, { title: '表情包', right: f.sw('stickers.enabled'), desc: '回复里写 <sticker:名字> 就会发对应的表情；也会按概率自动配一张。' },
          h(Row, { label: '回复里写表情的发出去概率', hint: '她主动写 <sticker:名字> 时，按这个概率真的发；调低就不那么爱发表情了。心情好的时候会再高一点' }, f.percent('stickers.inlineChance')),
          h(Row, { label: '自动配表情的概率' }, f.percent('stickers.autoChance')),
          h(Row, { label: '夹 QQ 小黄脸', hint: '回复里能夹 QQ 自带的系统表情（/捂脸 /斜眼笑 这种），和文字在同一条消息里' }, f.sw('stickers.faces')),
          draft?.stickers?.faces !== false ? h(Row, { label: '文字里夹小黄脸发出去的概率', hint: '写在句子中间的 QQ 小黄脸（<face:名字>，也包括她把小黄脸误写成 <sticker:…> 转过来的）：按这个概率真的发，没中的只是这张脸不发，文字照发' }, f.percent('stickers.faceChance')) : null,
          h(Row, { label: '偷表情', hint: '别人发的表情包会被收藏（普通照片不收）。' }, f.sw('stickers.collect'), h('span', { className: 'ab-muted' }, '从群里'), f.sw('stickers.fromGroups'), h('span', { className: 'ab-muted' }, '从私聊'), f.sw('stickers.fromPrivate')),
          draft.stickers.collect ? h(Row, { label: '怎么偷', hint: '「她挑」只递给她看，喜欢才收；「只听主人的」只在主人私聊 / 这一轮只有主人时她才可自己收，有别人在场要主人发话' },
            f.choices('stickers.collectMode', [
              { value: 'auto', label: '全都偷', desc: '看到就收，不用她同意（默认，保持原行为）' },
              { value: 'ask', label: '她挑', desc: '先记着，给她一句轻提示，喜欢才凭编号收' },
              { value: 'owner', label: '只听主人的', desc: '只有主人私聊 / 只有主人时她才可自己收；别人在场要主人发话' },
            ])) : null,
          h(Row, { label: '每小时最多收' }, f.num('stickers.maxPerHour', { min: 0 }), h('span', { className: 'ab-muted' }, '张')),
          h(Row, { label: '表情库最多存', hint: 'QQ 收藏表情有数量上限，满了就收不进去了。超过这个数会自动清掉最少用的偷来的表情（你自己加的不会动）' }, f.num('stickers.maxLibrary', { min: 20, max: 2000 }), h('span', { className: 'ab-muted' }, '张')),
          h(Row, { label: '看图起名', hint: '收下后让模型看图起个 12 字以内的备注' }, f.sw('stickers.caption')),
        ),
        h(Card, { title: '表情库' + (items ? '（' + items.length + ' 张）' : ''), right: h('div', { className: 'ab-flex' },
          h('input', { ref: fileRef, type: 'file', accept: 'image/*', multiple: true, style: { display: 'none' }, onChange: (e) => { upload(e.target.files); e.target.value = '' } }),
          h('input', { className: 'ab-input sm', style: { width: 140 }, placeholder: '名字（可不填）', value: newName, onChange: (e) => setNewName(e.target.value) }),
          h(Btn, { small: true, onClick: () => fileRef.current && fileRef.current.click() }, '＋ 上传'),
          h(Btn, { small: true, title: '把机器人号 QQ「我喜欢的」里已有的表情导进来', onClick: async () => { toast('正在从 QQ 收藏导入…'); const r = await post('/sticker/import-qq'); toast(r.message, r.ok === false ? 'err' : 'ok'); load() } }, '从 QQ 收藏导入'),
          h(Btn, { small: true, title: '让模型重新看一遍所有表情，重起名字和标签', onClick: recaptionAll }, '按图重新打标'),
          h(Btn, { small: true, kind: 'ghost', onClick: load }, '刷新')) },
          h('div', { className: 'ab-flex', style: { gap: 8, marginBottom: 10, flexWrap: 'wrap', alignItems: 'center' } },
            h('input', { className: 'ab-input sm', style: { width: 260 }, placeholder: '文件夹路径，例如 /Users/你/表情', value: dirPath, onChange: (e) => setDirPath(e.target.value) }),
            h(Btn, { small: true, onClick: importDir }, '从文件夹导入'),
            busy ? h('span', { className: 'ab-busy' }, '⏳ ' + busy) : null,
            h('span', { className: 'ab-muted ab-small' }, '导入的图会自动起名字，标签可以在下面每张表情的输入框里改。')),
          items === null ? h(Empty, { icon: '⏳', text: '加载中…' }) : items.length === 0 ? h(Empty, { icon: '🐳', text: '表情库还是空的。别人在群里发表情包，她会自己收；也可以点右上角上传，或者「从 QQ 收藏导入」机器人号已经收藏的表情。' }) :
            h('div', { className: 'ab-stickers' }, items.map((it) => h(StickerCell, { key: it.md5, it, onChanged: load, toast }))),
        ),
      )
    }

    /**
     * 一张表情：名字 / 标签都能直接改（离开输入框就保存）。
     * 左上角 ⟳ 让模型重新看这张图重起名字（表情和标签对不上时用）。
     */
    function StickerCell({ it, onChanged, toast }) {
      const tagText = (it.tags || []).join(' ')
      const [name, setName] = useState(it.name || '')
      const [tags, setTags] = useState(tagText)
      const [busy, setBusy] = useState(false)
      useEffect(() => {
        setName(it.name || '')
        setTags((it.tags || []).join(' '))
      }, [it.md5, it.name, tagText])
      const save = async (body, label) => {
        const r = await post('/sticker/rename', { md5: it.md5, ...body })
        toast(r.ok ? label + '改好了' : '没改成：' + (r.message || '找不到这张表情'), r.ok ? 'ok' : 'err')
        if (r.ok) onChanged()
      }
      const redo = async () => {
        setBusy(true)
        const r = await post('/sticker/recaption', { md5: it.md5 })
        setBusy(false)
        toast(r.ok ? '重新认好了' : (r.message || '没认出来'), r.ok ? 'ok' : 'err')
        if (r.ok) onChanged()
      }
      return h('div', { className: 'ab-sticker' },
        h('img', { src: API + '/sticker/image?md5=' + it.md5, alt: it.name || '表情', loading: 'lazy' }),
        h('button', { type: 'button', className: 'ab-btn sm ghost rc', title: '让模型重新看这张图，重起名字和标签', disabled: busy, onClick: redo }, busy ? '…' : '⟳'),
        h('input', { className: 'nm', value: name, placeholder: '未命名（点这里改）', title: '名字 / 备注，最多 12 字', maxLength: 12, onChange: (e) => setName(e.target.value),
          onBlur: () => { if (name !== (it.name || '')) save({ name }, '名字') } }),
        h('input', { className: 'tg', value: tags, placeholder: '也可以自己写，空格隔开', title: '标签，空格或逗号隔开，最多 5 个', onChange: (e) => setTags(e.target.value),
          onBlur: () => { if (tags.trim() !== tagText) save({ tags: tags.split(/[\s,，、#]+/).map((x) => x.trim()).filter(Boolean).slice(0, 5) }, '标签') } }),
        h('button', { type: 'button', className: 'ab-btn sm danger x', title: '删除', onClick: async () => { if (!confirm('删掉这张表情？（QQ 收藏里也会删）')) return; await post('/sticker/delete', { md5: it.md5 }); onChanged() } }, '✕'),
      )
    }

    // 和 QQ 空间自身的可见范围一致（ugc_right 1/4/16/64/128）
    const AUDIENCE_OPTIONS = [
      { value: 'all', label: '所有人可见' },
      { value: 'friends', label: '好友可见' },
      { value: 'selected', label: '部分好友可见' },
      { value: 'excluded', label: '部分好友不可见' },
      { value: 'self', label: '仅自己可见' },
    ]
    const AUDIENCE_LABEL = Object.fromEntries(AUDIENCE_OPTIONS.map((o) => [o.value, o.label]))

    /** 可见范围：固定范围存进配置；部分好友再配一份 QQ 名单。 */
    function DiaryAudience({ draft, setDraft, toast }) {
      const mode = draft.diary.visibility
      const partial = mode === 'selected' || mode === 'excluded'
      const [friends, setFriends] = useState(null)
      const [query, setQuery] = useState('')
      const qqText = draft.diary.audienceQQs || ''
      const selected = Array.from(new Set(String(qqText).split(/[\s,，;；]+/).filter(Boolean)))
      const setList = (list) => setDraft(setPath(draft, 'diary.audienceQQs', Array.from(new Set(list)).join('\n')))
      const toggle = (qq) => setList(selected.includes(qq) ? selected.filter((q) => q !== qq) : [...selected, qq])
      return h('div', null,
        h(Row, { label: '谁能看', hint: '和 QQ 空间的可见范围一致' },
          h(Select, { value: mode, options: AUDIENCE_OPTIONS, width: 170, onChange: (v) => setDraft(setPath(draft, 'diary.visibility', v)) })),
        partial ? h('div', { style: { marginTop: 10 } },
          h('div', { className: 'ab-flex', style: { gap: 8, marginBottom: 8 } },
            h(Btn, { small: true, kind: 'ghost', onClick: async () => { try { const r = await get('/diary/friends'); if (!r.ok) return toast(r.message || '读取好友失败'); setFriends(r.friends) } catch (e) { toast(e.message) } } }, '从好友列表选择'),
            h('span', { className: 'ab-muted ab-small' }, '已选 ' + selected.length + ' 人，只对之后发的说说生效')),
          friends ? h('div', { style: { marginBottom: 8 } },
            h('input', { className: 'ab-input', placeholder: '搜索昵称或 QQ 号', value: query, onChange: (e) => setQuery(e.target.value) }),
            h('div', { style: { maxHeight: 220, overflow: 'auto', marginTop: 6 } },
              friends.filter((f) => (f.name + f.qq).toLowerCase().includes(query.toLowerCase())).map((f) =>
                h('label', { key: f.qq, style: { display: 'block', padding: '4px 2px' } },
                  h('input', { type: 'checkbox', checked: selected.includes(f.qq), onChange: () => toggle(f.qq) }),
                  ' ' + (f.name || '（无备注）') + '（' + f.qq + '）')))) : null,
          h('textarea', {
            className: 'ab-textarea', style: { minHeight: 64 }, placeholder: '也可以直接填 QQ 号，一行一个',
            value: qqText, onChange: (e) => setDraft(setPath(draft, 'diary.audienceQQs', e.target.value)),
          }),
          h('div', { className: 'ab-small ab-muted', style: { marginTop: 6 } }, mode === 'selected' ? '名单为空时不会发布，也不会退回公开。' : '这些好友看不到之后的说说。')) : null,
      )
    }

    function Diary({ st, draft, setDraft, toast }) {
      const f = useField(draft, setDraft)
      const [data, setData] = useState(null)
      const pgd = usePager((data && data.items) || [])
      const on = modOn(st, 'diary')
      const load = () => (on ? get('/diary/history').then((r) => { setData(r); if (r.warning) toast(r.warning) }).catch((e) => toast('日记状态刷新失败：' + e.message)) : null)
      useEffect(() => { load() }, [on])
      const social = modOn(st, 'qzone-social') ? h(QzoneSocial, { draft, setDraft, toast }) : h(ModOff, { name: '空间互动' })
      if (!on) return h('div', { className: 'ab-grid' }, h(ModOff, { name: '空间日记' }), social)
      return h('div', { className: 'ab-grid' },
        h(Card, { title: '空间日记', right: f.sw('diary.enabled'), desc: '她每天会在 QQ 空间发几条说说，用自己的口吻写。写日记那一轮不会发到聊天里。' },
          h(Row, { label: '每天写几次' }, f.num('diary.timesPerDay', { min: 0, max: 6 })),
          h(Row, { label: '时间段', hint: '在这段时间里随机挑时间' }, f.text('diary.windowStart', { size: 'sm' }), h('span', { className: 'ab-muted' }, '到'), f.text('diary.windowEnd', { size: 'sm' })),
          h(Row, { label: '两篇至少隔' }, f.num('diary.minGapMinutes', { min: 0 }), h('span', { className: 'ab-muted' }, '分钟')),
          h(Row, { label: '字数' }, f.num('diary.minChars', { min: 10 }), h('span', { className: 'ab-muted' }, '到'), f.num('diary.maxChars', { min: 20 }), h('span', { className: 'ab-muted' }, '字')),
          h(Row, { label: '参考当天聊天', hint: '开着：写说说时会看当天在 QQ 上聊过的事；关着：完全不看聊天记录，想到什么写什么（默认关，说说更像她自己发的）' }, f.sw('diary.useChatLog')),
          h(Row, { label: '日记配图', hint: '开着时每篇会从「今天她画的图 / 今天收的表情包」里挑一张配上去；没有合适的就只发文字' }, f.sw('diary.attachImage')),
          h(DiaryAudience, { draft, setDraft, toast }),
        ),
        h(Card, { title: '写过的日记', right: h('div', { className: 'ab-flex' },
          data && data.next ? h('span', { className: 'ab-muted ab-small' }, '下一篇大约 ' + data.next) : null,
          h(Btn, { small: true, kind: 'ghost', title: '刷新空间状态', onClick: load }, h('svg', { width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, 'aria-hidden': true }, h('path', { d: 'M20 7v5h-5M4 17v-5h5M6.1 7a7 7 0 0 1 11.6-1L20 9M4 15l2.3 3A7 7 0 0 0 17.9 17' }))),
          h(Btn, { small: true, kind: 'primary', onClick: async () => { toast('她在写了…'); try { const r = await post('/diary/run', {}); toast(r.ok ? (r.dryRun ? '写好了（试运行，没真发）' : '发出去了') : r.message) } catch (e) { toast(e.message) } finally { await load() } } }, '现在写一篇')) },
          !data ? h(Empty, { icon: '⏳', text: '加载中…' }) : !data.items || data.items.length === 0 ? h(Empty, { icon: '📔', text: '还没写过日记。' }) :
            h('div', null,
              h('div', { style: { overflowX: 'auto' } },
                h('table', { className: 'ab-table' },
                  h('thead', null, h('tr', null, ['时间', '状态', '内容', ''].map((x) => h('th', { key: x }, x)))),
                  h('tbody', null, pgd.rows.map((d, i) => h('tr', { key: i },
                    h('td', { className: 'ab-small ab-muted', style: { whiteSpace: 'nowrap' } }, new Date(d.at).toLocaleString()),
                    h('td', { className: 'ab-small', style: { whiteSpace: 'nowrap' } }, d.deletedAt ? '已从空间删除' : d.dryRun ? '试运行' : d.ok ? (AUDIENCE_LABEL[d.visibility] || '已发布') : '失败'),
                    h('td', null,
                      h(Clip, { text: d.text, n: 42, max: 460 }),
                      d.error ? h('div', { className: 'ab-small', style: { color: 'var(--ab-err)' } }, d.error) : null),
                    h('td', null, d.tid && !d.deletedAt ? h(Btn, { small: true, kind: 'ghost', onClick: async () => { if (!confirm('从 QQ 空间删除这条说说？')) return; try { const r = await post('/qzone/delete', { tid: d.tid }); toast(r.message) } catch (e) { toast(e.message) } finally { await load() } } }, '从空间删除') : null)))))),
              h(Pager, { page: pgd.page, total: pgd.total, setPage: pgd.setPage, count: pgd.count })),
        ),
        social,
      )
    }

    const SOCIAL_KIND = { reply: '回复评论', comment: '评论', like: '点赞' }

    /** 空间互动：回复自己说说下的评论、逛好友动态。 */
    function QzoneSocial({ draft, setDraft, toast }) {
      const f = useField(draft, setDraft)
      const [s, setS] = useState(null)
      const load = () => get('/qzone/social/state').then(setS)
      useEffect(() => { load() }, [])
      return h(Card, { title: '空间互动', right: f.sw('qzoneSocial.enabled'), desc: '她会定期逛 QQ 空间：有人评论她的说说就回一句；刷到好友的说说，偶尔点个赞、评一句（你的说说她更爱评）。评论按她的人格现写；试运行时只记日志不发。' },
        h(Row, { label: '回复自己说说下的评论' }, f.sw('qzoneSocial.replyOwn')),
        h(Row, { label: '评论好友的说说' }, f.sw('qzoneSocial.commentFriends')),
        h(Row, { label: '顺手点赞' }, f.sw('qzoneSocial.like')),
        h(Row, { label: '好友说说互动概率', hint: '每条说说只判断一次' }, f.percent('qzoneSocial.friendChance')),
        h(Row, { label: '你的说说互动概率' }, f.percent('qzoneSocial.ownerChance')),
        h(Row, { label: '每天最多评论', hint: '点赞不算' }, f.range('qzoneSocial.maxPerDay', 0, 30, 1, (v) => v + ' 条')),
        h(Row, { label: '多久逛一次', hint: '只在「主动搭话」里设的醒着时间内' }, f.range('qzoneSocial.intervalMin', 10, 240, 10, (v) => v + ' 分钟')),
        h('div', { className: 'ab-flex', style: { marginTop: 10 } },
          h('span', { className: 'ab-muted ab-small' }, s ? '今天评论了 ' + s.count + ' 条' + (s.lastRun ? '，上次逛是 ' + timeAgo(s.lastRun) : '') : ''),
          h('div', { className: 'ab-spacer' }),
          h(Btn, { small: true, onClick: async () => { toast('她去逛空间了…'); const r = await post('/qzone/social/run'); toast(r.message, r.ok ? 'ok' : 'err'); load() } }, '现在逛一次')),
        s && s.history && s.history.length ? h('div', { className: 'ab-list', style: { marginTop: 10 } }, s.history.map((x, i) => h('div', { key: i, className: 'ab-li' },
          h('div', { className: 'meta' }, timeAgo(x.at), h('br'), SOCIAL_KIND[x.kind] || x.kind),
          h('div', { className: 'body' }, h('b', null, x.who), x.post ? h('span', { className: 'ab-muted' }, ' 的「' + x.post + '」') : null, x.text ? h('div', null, x.text) : null)))) : null,
      )
    }

    function SpeakUp({ st, draft, setDraft, toast }) {
      const f = useField(draft, setDraft)
      return h('div', { className: 'ab-grid' },
        h(Card, { title: '主动搭话', right: f.sw('speakUp.enabled'), desc: '只在和你的私聊里：你一阵子没理她，她会主动来找你说一句——每次由头不一样（分享小事、接着上次的话题、想起你的事、按时间问候……），内容是她现想的，不是模板。群里不会这样。它和下面的「目的引擎」互斥：保存时开着这个，就会把目的引擎关掉。' },
          h(Row, { label: '追问', hint: '她问了你一句、你 15~40 分钟没回，偶尔轻轻追一句（「人呢」之类），每句最多追一次' }, f.sw('speakUp.nudge')),
          h(Row, { label: '多久没聊才找你' }, f.num('speakUp.idleMinutes', { min: 5 }), h('span', { className: 'ab-muted' }, '分钟')),
          h(Row, { label: '两次之间隔', hint: '在这个范围里随机' }, f.num('speakUp.minIntervalMinutes', { min: 5 }), h('span', { className: 'ab-muted' }, '到'), f.num('speakUp.maxIntervalMinutes', { min: 5 }), h('span', { className: 'ab-muted' }, '分钟')),
          h(Row, { label: '每天最多' }, f.num('speakUp.maxPerDay', { min: 0 }), h('span', { className: 'ab-muted' }, '次')),
          h(Row, { label: '她醒着的时间', hint: '这段时间外不打扰你' }, f.num('speakUp.awakeFrom', { min: 0, max: 23 }), h('span', { className: 'ab-muted' }, '点到'), f.num('speakUp.awakeTo', { min: 1, max: 24 }), h('span', { className: 'ab-muted' }, '点')),
          h('div', { className: 'ab-flex', style: { marginTop: 10 } },
            h('span', { className: 'ab-muted ab-small' }, '今天已经找过你 ' + (st.speakUp.count || 0) + ' 次'),
            h('div', { className: 'ab-spacer' }),
            h(Btn, { small: true, onClick: async () => { const r = await post('/speakup/fire'); toast(r.message) } }, '现在就让她来找我')),
        ),
        h(PurposeStatus, { st, toast }),
      )
    }

    // 「目的机制」状态卡：链路计数、驱力条、目标假设、载体与节奏。数据走 /panel/purpose/* 代理（模块缺新接口时降级提示）。
    const DRIVE_LABELS = { play: '玩', learn: '学', install: '装', connect: '连', care: '陪', share: '分', identity: '我', create: '创', consume: '收' }
    const GOAL_OWNER_LABELS = { self: '自己', owner: '主人', member: '群友', media: '媒体' }
    const PACING_PRESETS = [{ value: 'conservative', label: '保守' }, { value: 'default', label: '默认' }, { value: 'active', label: '活跃' }]
    function PurposeStatus({ toast }) {
      const [d, setD] = useState(null)
      const [awakeFrom, setAwakeFrom] = useState('')
      const [awakeTo, setAwakeTo] = useState('')
      const [maxN, setMaxN] = useState('')
      const [busy, setBusy] = useState('')
      const [preview, setPreview] = useState(null)
      const load = () => get('/panel/purpose/status').then((r) => {
        if (!r.ok) return
        setD(r)
        setAwakeFrom((v) => (v === '' && r.purpose.awakeFrom != null) ? String(r.purpose.awakeFrom) : v)
        setAwakeTo((v) => (v === '' && r.purpose.awakeTo != null) ? String(r.purpose.awakeTo) : v)
        setMaxN((n) => (n === '' && r.purpose.dailyMax != null) ? String(r.purpose.dailyMax) : n)
      })
      useEffect(() => { load(); const t = setInterval(load, 10000); return () => { clearInterval(t) } }, [])
      const p = d && d.purpose
      if (!p) return null
      const s = p.status || {}
      const drives = Object.entries(s.drives || {}).sort((a, b) => (b[1] || 0) - (a[1] || 0)).slice(0, 5)
      const goals = (s.goals || []).slice(0, 3)
      const chain = [
        ['素材', s.materialCount], ['观察', s.observationCount], ['目标假设', s.goalCount], ['候选', s.candidateCount], ['今日', (s.countToday ?? p.count) + '/' + (s.dailyMax ?? p.dailyMax ?? '?')],
      ]
      const save = (patch) => async () => {
        const turningOn = patch.enabled === true
        setBusy(patch.__k || 'save'); delete patch.__k
        try {
          const r = await post('/panel/purpose/config', patch)
          if (!r.ok) toast(r.message || '没成功', 'err')
          else {
            setD(r)
            if (turningOn && r.exclusive === 'speakUp') toast('保存好了，已把「主动搭话」关掉', 'ok')
            else toast('保存好了', 'ok')
          }
        } catch (e) { toast(e.message) } finally { setBusy('') }
      }
      return h(Card, { title: '目的引擎（实验）', desc: '可选的新引擎，默认关：她会自己从聊天和记忆里找「想跟你说的事」——攒素材 → 记观察 → 立目标假设 → 挑一个候选，到点了才来找你。它和上方「主动搭话」互斥：开了这个，保存时会自动把「主动搭话」的总开关关掉，同一时间只会有一套在跑。' },
        !p.available ? h('div', { className: 'ab-note' }, '目的引擎模块没在跑。到面板「扩展」页看看模块状态。') : null,
        h(Row, { label: '启用目的引擎', hint: '默认关。这是「主动搭话」的替代引擎；两个都开时会自动关掉「主动搭话」，不会重复打扰' },
          h(Switch, { on: p.enabled, disabled: !p.available, onChange: save({ enabled: !p.enabled, __k: 'enabled' }) })),
        p.enabled ? h('div', { className: 'ab-flex', style: { gap: 8, flexWrap: 'wrap', margin: '4px 0 10px' } },
          chain.map(([l, n]) => h('div', { key: l, className: 'ab-card', style: { flex: '1 1 90px', padding: '8px 10px' } },
            h('div', { className: 'ab-muted ab-small' }, l), h('b', null, n == null ? '—' : n)))) : null,
        p.enabled && drives.length ? h(Row, { label: '驱力', hint: '越高越想说这类话题' },
          h('div', { style: { flex: 1, minWidth: 180 } }, drives.map(([k, v]) => h('div', { key: k, className: 'ab-flex', style: { marginBottom: 3 } },
            h('span', { className: 'ab-small', style: { width: 28 } }, DRIVE_LABELS[k] || k),
            h('div', { className: 'ab-mood', style: { flex: 1 } }, h('i', { style: { width: Math.round((v || 0) * 100) + '%' } })),
            h('span', { className: 'ab-muted ab-small', style: { width: 34, textAlign: 'right' } }, Math.round((v || 0) * 100) + '%'))))) : null,
        p.enabled && goals.length ? h('div', { className: 'ab-list', style: { margin: '8px 0' } }, goals.map((g, i) => h('div', { key: g.id || i, className: 'ab-li' },
          h('div', { className: 'meta' }, (g.ownerLabel || GOAL_OWNER_LABELS[g.owner] || g.owner || '?') + ' · 置信 ' + Math.round((g.confidence || 0) * 100) + '% · 风险 ' + Math.round((g.risk || 0) * 100) + '%' + (g.status ? ' · ' + g.status : '')),
          h('div', { className: 'body' }, g.intent || g.object || '（没写意图）')))) : null,
        p.enabled && (s.nextFireText || s.lastOutcome) ? h(Row, { label: '下次 / 上轮', hint: '上轮结果：' + (s.lastOutcome || '—') + (s.lastPurpose ? '（' + s.lastPurpose + '）' : '') }, h('span', { className: 'ab-muted ab-small' }, s.nextFireText || '待排')) : null,
        h(Row, { label: '节奏预设' },
          h(Select, { value: p.pacing, options: PACING_PRESETS, onChange: (v) => save({ pacing: v, __k: 'pacing' })() })),
        h(Row, { label: '安静时段', hint: '由「醒着时间」推算：' + p.quietStart + ' 到 ' + p.quietEnd + ' 不打扰。醒着时间在上方「主动搭话」卡里改' },
          h('span', { className: 'ab-muted ab-small' }, '醒着 ' + p.awakeFrom + ' 点到 ' + p.awakeTo + ' 点（安静 ' + p.quietStart + '~' + p.quietEnd + '）')),
        h(Row, { label: '每日上限' },
          h('input', { className: 'ab-input sm', type: 'number', min: 0, value: maxN, onChange: (e) => setMaxN(e.target.value) }),
          h('span', { className: 'ab-muted' }, '次/天'),
          h(Btn, { small: true, disabled: busy === 'save', onClick: () => {
            const patch = { __k: 'save' }
            const af = Number(awakeFrom); const at = Number(awakeTo)
            if (Number.isFinite(af) && Number.isFinite(at) && af >= 0 && at <= 24) { patch.awakeFrom = af; patch.awakeTo = at }
            if (maxN !== '' && Number.isFinite(Number(maxN))) patch.maxPerDay = Number(maxN)
            save(patch)()
          } }, '应用')),
        h('div', { className: 'ab-flex', style: { marginTop: 10 } },
          h(Btn, { small: true, disabled: !p.available || !p.enabled, onClick: async () => { setBusy('preview'); setPreview(null); try { const r = await post('/panel/purpose/preview'); setPreview(r); if (!r.ok) toast(r.message || '没成功', 'err') } catch (e) { toast(e.message) } finally { setBusy('') } } }, busy === 'preview' ? '预览中…' : '预览这一轮（零副作用）'),
          h(Btn, { small: true, kind: 'primary', disabled: !p.available || !p.enabled, onClick: async () => { setBusy('run'); try { const r = await post('/panel/purpose/run'); toast(r.ok ? '发出去了，去 QQ 看看' : (r.message || '没成功'), r.ok ? 'ok' : 'err') } catch (e) { toast(e.message) } finally { setBusy('') } } }, busy === 'run' ? '在试…' : '立即试一次')),
        preview && preview.ok && preview.result ? h('div', { className: 'ab-note', style: { marginTop: 8 } },
          (() => {
            const r = preview.result
            const head = r.selected && r.selected.text ? '这轮会想说：「' + r.selected.text + '」' : '这轮没选出目的（素材还不够，或都试过了）'
            const cand = (r.candidates || []).slice(0, 3).map((c) => '· ' + (c.text || c.action || c.need) + '（置信 ' + Math.round((c.confidence || 0) * 100) + '%）').join('\n')
            return h('div', { style: { whiteSpace: 'pre-wrap' } },
              head,
              cand ? '\n候选：\n' + cand : '',
              r.stats ? '\n素材 ' + (r.stats.selected ?? r.stats.total ?? '?') + ' 条，驱力 top：' + Object.entries(r.drives || {}).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k]) => DRIVE_LABELS[k] || k).join('、') : '')
          })()) : null,
      )
    }

    const SOURCE = { tool: '她自己记的', auto: '每日整理', diary: '空间日记', panel: '你加的', event: '她的经历', import: '导入的' }
    /** 心情页：她此刻的心情、怎么衰减、被什么影响。 */
    function MoodPage({ st, draft, setDraft, toast }) {
      const f = useField(draft, setDraft)
      const pgh = usePager(st.mood.history || [])
      const moodCard = !modOn(st, 'mood') ? h(ModOff, { name: '心情' }) : h(Card, { title: '心情', right: f.sw('mood.enabled'), desc: '被夸、被哄、被凶都会影响她的心情（对她说的话、主人的话影响更大），过一阵子慢慢回到平常。心情好时她话多、更爱发表情和语音、回得快、群里更爱插话；心情差时话少、回得慢、少发表情，还会带点小脾气。' },
          h('div', { className: 'ab-flex', style: { marginBottom: 8 } }, h('b', null, st.mood.label), h('span', { className: 'ab-muted' }, st.mood.value + ' / 100'), st.mood.reason ? h('span', { className: 'ab-muted ab-small' }, '· 因为' + st.mood.reason) : null),
          h('div', { className: 'ab-mood' }, h('i', { style: { width: Math.max(4, st.mood.value) + '%' } })),
          st.mood.series && st.mood.series.some((x) => x.avg != null) ? h('div', { style: { marginTop: 12 } },
            h('div', { className: 'ab-muted ab-small' }, '近 7 天平均（每 10 分钟记一次，60 是平常）'),
            h('div', { style: { display: 'flex', alignItems: 'flex-end', gap: 6, height: 64, marginTop: 6 } },
              st.mood.series.map((x) => h('div', {
                key: x.day,
                title: x.avg == null ? x.day + ' 没有记录' : x.day + ' 平均 ' + x.avg + '（' + x.min + '–' + x.max + '，' + x.n + ' 次）',
                style: { flex: '1 1 0', display: 'flex', alignItems: 'flex-end', minWidth: 0 },
              }, h('i', {
                style: {
                  width: '100%',
                  height: Math.max(3, Math.round(64 * (x.avg == null ? 60 : x.avg) / 100)) + 'px',
                  borderRadius: 4,
                  background: x.avg == null ? 'var(--ab-line)' : x.avg >= 70 ? 'var(--ab-ok)' : x.avg >= 50 ? 'var(--ab-sea)' : 'var(--ab-warn)',
                  opacity: x.avg == null ? 0.5 : 0.85,
                },
              })))),
            h('div', { style: { display: 'flex', gap: 6, marginTop: 4 } },
              st.mood.series.map((x) => h('div', { key: x.day, className: 'ab-muted ab-small', style: { flex: '1 1 0', textAlign: 'center', minWidth: 0 } }, String(x.day).slice(5))))) : null,
          h('div', { style: { marginTop: 10 } },
            h(Row, { label: '多久回到平常', hint: '半衰期' }, f.range('mood.halfLifeHours', 0.5, 24, 0.5, (v) => v + ' 小时')),
            h(Row, { label: '用模型判断心情', hint: '开着：抽中的轮次问一次模型（能分清开玩笑和真骂），没抽中的轮次仍按关键词打分；关着：只按关键词' }, f.sw('mood.judge')),
            draft?.mood?.judge ? h('div', {},
              h(Row, { label: '判定概率', hint: '不是每轮都问模型，只有抽中的轮次才花这一次' }, f.percent('mood.judgeChance')),
              h(Row, { label: '最短间隔', hint: '两次模型判定至少隔多久' }, h('div', { className: 'ab-row' }, f.num('mood.judgeCooldownSec', { min: 0, max: 900, step: 10 }), h('span', { className: 'ab-muted ab-small' }, ' 秒'))),
              h(Row, { label: '变化阈值', hint: '模型给的变化小于这个数就不算，免得心情抖来抖去' }, f.num('mood.judgeMinDelta', { min: 1, max: 15 }))) : null),
          (st.mood.history || []).length ? h('div', null,
            h('div', { style: { marginTop: 10, overflowX: 'auto' } },
              h('table', { className: 'ab-table' },
                h('thead', null, h('tr', null, ['时间', '变化', '因为'].map((x) => h('th', { key: x }, x)))),
                h('tbody', null, pgh.rows.map((x, i) => h('tr', { key: i },
                  h('td', { className: 'ab-small ab-muted', style: { whiteSpace: 'nowrap' } }, timeAgo(x.at)),
                  h('td', { className: 'ab-small', style: { whiteSpace: 'nowrap' } }, (x.to >= x.from ? '↑ ' : '↓ ') + x.from + ' → ' + x.to),
                  h('td', null, h(Clip, { text: x.reason, n: 60, max: 460 }))))))),
            h(Pager, { page: pgh.page, total: pgh.total, setPage: pgh.setPage, count: pgh.count })) : null,
        )
      return h('div', { className: 'ab-grid' }, moodCard)
    }

    /** 记忆页：人物卡片墙、小档案、相处经验、说话方式、记忆库、召回日志。 */
    function MemoryPage({ st, draft, setDraft, toast }) {
      const f = useField(draft, setDraft)
      const [mem, setMem] = useState(null)
      const [stats, setStats] = useState(null)
      const [q, setQ] = useState('')
      const [ins, setIns] = useState(null)
      const [adding, setAdding] = useState({ text: '', aboutName: '', importance: 0.6 })
      const load = (query) => get('/memories?q=' + encodeURIComponent(query ?? q)).then((r) => { setMem(r.items || []); setStats(r.stats || null) })
      const [styles, setStyles] = useState({})
      const loadIns = () => get('/insights').then((r) => { setIns(r.items || []); setStyles(r.styles || {}) })
      const times = draft.memory.consolidateTimes || []
      const setTime = (i, v) => { const t = times.slice(); t[i] = v; setDraft(setPath(draft, 'memory.consolidateTimes', t)) }
      const addTime = () => { const t = times.slice(); t.push('12:00'); setDraft(setPath(draft, 'memory.consolidateTimes', t.slice(0, 4))) }
      const delTime = (i) => { const t = times.filter((_, k) => k !== i); setDraft(setPath(draft, 'memory.consolidateTimes', t.length ? t : ['04:00'])) }
      const memOn = modOn(st, 'memory')
      useEffect(() => { if (memOn) { load(''); loadIns() } }, [memOn])
      useEffect(() => { if (!memOn) return; const t = setTimeout(() => load(q), 250); return () => clearTimeout(t) }, [q])
      const pgi = usePager(ins || [])
      const pgm = usePager(mem || [])
      const last = st.memory && st.memory.lastConsolidate
      if (!memOn) return h('div', { className: 'ab-grid' }, h(ModOff, { name: '记忆' }))
      return h('div', { className: 'ab-grid' },
        h(PeopleWall, { toast }),
        h(ProfilesCard, { toast }),
        h(Card, { title: '相处经验', desc: '她对每个人（和每个群）总结出来的相处之道：概括的、不琐碎的，比如「他累的时候不想多聊」。每次整理记忆时她会回顾一次，越来越懂你。聊天时只带上对当前这个人的那份。' },
          ins === null ? h(Empty, { icon: '⏳', text: '加载中…' }) : ins.length === 0 ? h(Empty, { icon: '🌱', text: '还没有总结出经验。多聊几天，整理记忆时她会慢慢总结。' }) :
            h('div', null,
              h('div', { style: { overflowX: 'auto' } },
                h('table', { className: 'ab-table' },
                  h('thead', null, h('tr', null, ['谁', '条数', '相处经验', ''].map((x) => h('th', { key: x }, x)))),
                  h('tbody', null, pgi.rows.map((p) => h(InsightCard, { key: p.key, p, toast, onSaved: loadIns, style: styles[p.key] || [] }))))),
              h(Pager, { page: pgi.page, total: pgi.total, setPage: pgi.setPage, count: pgi.count }))),
        h(Card, { title: '说话方式', desc: '聊久了潜移默化学到的：每个人的说话习惯（她会自然地贴近一点），和她自己慢慢养成的说法。不会变成另一个人，只是越来越像「你们的」哈洛。' },
          h(StyleEditor, { k: 'self', label: '她自己养成的说法', list: styles.self || [], toast, onSaved: loadIns }),
          Object.keys(styles).filter((k) => k !== 'self').length === 0 ? h('div', { className: 'ab-muted ab-small' }, '还没学到别人的说话习惯。整理记忆时会跟着相处经验一起总结（显示在上面每个人的相处经验下面）。') : null),
        h(Card, { title: '记忆库', right: f.sw('memory.enabled'), desc: '长期记忆：她聊天时自己记的、每天从聊天里整理出来的、写过的空间日记、你手动加的。每一轮回复前，她会按对方正在说的话翻出最相关的几条。' },
          h('div', { className: 'ab-grid ab-g4', style: { marginBottom: 12 } },
            h('div', { className: 'ab-card ab-stat' }, h('div', { className: 'n' }, stats ? stats.count : '–'), h('div', { className: 'l' }, '条长期记忆')),
            h('div', { className: 'ab-card ab-stat' }, h('div', { className: 'n' }, stats ? stats.auto : '–'), h('div', { className: 'l' }, '条来自每日整理' + (stats && stats.outdated ? '（另有 ' + stats.outdated + ' 条已过时）' : ''))),
            h('div', { className: 'ab-card ab-stat' }, h('div', { className: 'n', style: { fontSize: 16, paddingTop: 6 } }, last ? new Date(last.at).toLocaleString() : '还没整理过'), h('div', { className: 'l' }, '上次整理'))),
          h(Row, { label: '每天自动整理 ' + times.length + ' 次', hint: '把临时记忆（聊天流水）提炼成长期记忆、相处经验和说话方式；每次只处理上次整理之后的新聊天，整理完的流水会挪进归档（保留 60 天，她还能翻）；各会话自己的上下文不受影响。最多 4 个时间点' },
            f.sw('memory.dailyConsolidate'), h('span', { className: 'ab-muted' }, '每天'),
            times.map((t, i) => h('span', { key: i, className: 'ab-flex', style: { gap: 4, alignItems: 'center' } },
              i ? h('span', { className: 'ab-muted' }, '和') : null,
              h('input', { className: 'ab-input sm', type: 'time', value: t, onChange: (e) => setTime(i, e.target.value) }),
              times.length > 1 ? h('button', { type: 'button', className: 'ab-btn sm ghost', title: '去掉这个时间点', onClick: () => delTime(i) }, '×') : null)),
            times.length < 4 ? h(Btn, { small: true, kind: 'ghost', onClick: addTime }, '＋ 加一次') : null,
            h(Btn, { small: true, onClick: async () => { toast('正在整理，可能要一两分钟…'); const r = await post('/memory/extract', {}); toast(r.message); load(); loadIns() } }, '现在整理一次')),
          h(Row, { label: '每轮最多想起几条' }, f.range('memory.recallCount', 0, 12, 1, (v) => v + ' 条')),
          h('div', { className: 'ab-section-title' }, '手动加一条'),
          h('div', { className: 'ab-flex' },
            h('input', { className: 'ab-input', style: { flex: '2 1 260px' }, placeholder: '要她记住的事，例如：主人不吃香菜', value: adding.text, onChange: (e) => setAdding({ ...adding, text: e.target.value }) }),
            h('input', { className: 'ab-input', style: { flex: '1 1 120px' }, placeholder: '关于谁（可选）', value: adding.aboutName, onChange: (e) => setAdding({ ...adding, aboutName: e.target.value }) }),
            h(Select, { value: adding.importance, width: 120, onChange: (v) => setAdding({ ...adding, importance: v }), options: [{ value: 0.3, label: '随口一提' }, { value: 0.6, label: '比较重要' }, { value: 0.9, label: '非常重要' }] }),
            h(Btn, { small: true, kind: 'primary', disabled: !adding.text.trim(), onClick: async () => { const r = await post('/memory/add', adding); toast(r.ok ? '记住了' : r.message); setAdding({ text: '', aboutName: '', importance: 0.6 }); load() } }, '记住')),
          h('div', { className: 'ab-section-title' }, '翻一翻'),
          h('input', { className: 'ab-input wide', placeholder: '搜索记忆，例如：白米饭、游戏、约定…', value: q, onChange: (e) => setQ(e.target.value) }),
          mem === null ? h(Empty, { icon: '⏳', text: '加载中…' }) : mem.length === 0 ? h(Empty, { icon: '🫧', text: q ? '没找到相关的记忆' : '还没有记住什么。' }) :
            h('div', { style: { marginTop: 8 } },
              h('div', { style: { overflowX: 'auto' } },
                h('table', { className: 'ab-table' },
                  h('thead', null, h('tr', null, ['时间', '来源', '内容', ''].map((x) => h('th', { key: x }, x)))),
                  h('tbody', null, pgm.rows.map((m) => h(MemoryRow, { key: m.id, m, onChanged: () => load(), toast }))))),
              h(Pager, { page: pgm.page, total: pgm.total, setPage: pgm.setPage, count: pgm.count }))),
        h(RecallLog, null),
        h(MemoryImport, { toast, onDone: () => load() }),
      )
    }

    /** 人物卡片墙：她认识的每个人一张卡——小档案、记得多少条、相处经验、说过多少句话。 */
    // 卡片墙的「多人效果」示例数据（只在面板上看布局用，不写盘、不参与聊天）
    const PEOPLE_SAMPLE = [
      { qq: '875354659', name: 'α', owner: true, where: ['私聊', '空间'], text: '小郑，主人，自称是哈洛的主人。爱听她唱歌，喜欢白饭。', at: Date.now() - 3600e3, memories: 3, insights: 1, styles: 1, tags: ['白饭', '唱歌'], messages: 84, lastSay: Date.now() - 600e3 },
      { qq: '2822321760', name: 'Aurora✨', where: ['群「摸鱼大队」'], text: '群里最活跃的一个，喜欢猫和颜文字，常在半夜冒头。', at: Date.now() - 86400e3, memories: 6, insights: 2, styles: 1, tags: ['猫', '夜猫子', '颜文字'], messages: 132, lastSay: Date.now() - 5 * 3600e3 },
      { qq: '2113929217', name: '小满的同学', where: ['群「摸鱼大队」'], text: '在读高三，最近在准备考试，压力有点大。', at: Date.now() - 2 * 86400e3, memories: 4, insights: 0, styles: 0, tags: ['考试', '高三'], messages: 27, lastSay: Date.now() - 30 * 3600e3 },
      { qq: '1234567890', name: '胖橘', where: ['私聊'], text: '话少，喜欢发图，问过她 B 站的事。', at: Date.now() - 5 * 86400e3, memories: 3, insights: 0, styles: 0, tags: ['发图', 'B站'], messages: 9, lastSay: Date.now() - 4 * 86400e3 },
      { qq: '987654321', name: '阿姨', where: ['群「家里的群」'], text: '主人的妈妈，会问吃饭了没，语气很温和。', at: Date.now() - 6 * 86400e3, memories: 5, insights: 1, styles: 0, tags: ['家人', '关心'], messages: 41, lastSay: Date.now() - 2 * 86400e3 },
      { qq: '1122334455', name: '路人甲', where: ['群「摸鱼大队」'], text: '', at: 0, memories: 3, insights: 0, styles: 0, tags: [], messages: 12, lastSay: Date.now() - 7 * 86400e3 },
    ]

    function PeopleWall({ toast }) {
      const [list, setList] = useState(null)
      const [busy, setBusy] = useState('')
      const [demo, setDemo] = useState(false)
      const load = () => get('/memory/people').then((r) => setList(r.list || [])).catch(() => setList([]))
      useEffect(() => { load() }, [])
      const rebuild = async (qq) => {
        setBusy(qq)
        const r = await post('/profiles/rebuild', { qq })
        setBusy('')
        toast(r.message, r.ok ? 'ok' : 'err')
        load()
      }
      const chip = (label, n) => h('span', { key: label, className: 'ab-chip solid' }, label, h('span', { className: 'n' }, n))
      const shown = demo ? PEOPLE_SAMPLE : (list || [])
      return h(Card, { title: '人物卡片墙', desc: '她认识的每个人一张卡：TA 是谁、关系、她记得多少条、相处出多少经验、跟 TA 说过多少句话。按「关于 TA 记得多少」排序；卡片上的小档案和下面「人物小档案」是同一份，这里可以直接重写。', right: h('span', { className: 'ab-flex', style: { gap: 6 } },
          h(Btn, { small: true, kind: 'ghost', onClick: () => setDemo(!demo) }, demo ? '看真实数据' : '看多人效果'),
          h(Btn, { small: true, kind: 'ghost', onClick: load }, '刷新')) },
        demo ? h('div', { className: 'ab-note', style: { marginBottom: 10 } }, '示例数据：只是让你看看人多的时候怎么排，图上这 5 个人不在你的记忆库里。') : null,
        list === null ? h(Empty, { icon: '⏳', text: '加载中…' }) : shown.length === 0 ? h(Empty, { icon: '🌱', text: '还没有认识的人——关于某个人记住 3 条以上的事以后，这里就会多一张卡。' }) :
          h('div', { className: 'ab-grid ab-g2' }, shown.map((p) => h('div', { key: p.qq, className: 'ab-card', style: { padding: 14, display: 'flex', flexDirection: 'column', gap: 10 } },
            h('div', { className: 'ab-flex', style: { gap: 10, alignItems: 'center' } },
              h('div', { style: { width: 38, height: 38, borderRadius: '50%', background: 'linear-gradient(140deg,var(--ab-foam-2),var(--ab-sea))', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 650, flex: '0 0 auto' } }, String(p.name || '?').slice(0, 1)),
              h('div', { style: { minWidth: 0, flex: 1 } },
                h('div', { className: 'ab-flex', style: { gap: 6, alignItems: 'center' } },
                  h('b', null, p.name),
                  p.owner ? h('span', { className: 'ab-badge' }, '主人') : null),
                h('div', { className: 'ab-small ab-muted' }, p.qq + (p.where && p.where.length ? ' · ' + p.where.join('、') : '')))),
            h('div', { style: { fontSize: 13, lineHeight: 1.6, minHeight: 44, color: p.text ? 'inherit' : 'var(--ab-muted)' } },
              p.text || '还没有小档案（关于 TA 的记忆到 3 条以后会写出来）。',
              p.text && p.at ? h('div', { className: 'ab-small ab-muted', style: { marginTop: 4 } }, '档案更新于 ' + timeAgo(p.at)) : null),
            h('div', { className: 'ab-flex', style: { gap: 6, flexWrap: 'wrap' } },
              chip('记忆 ', p.memories),
              chip('相处经验 ', p.insights),
              chip('说话方式 ', p.styles),
              p.tags && p.tags.length ? h('span', { className: 'ab-small ab-muted' }, p.tags.join('、')) : null),
            h('div', { className: 'ab-flex', style: { justifyContent: 'space-between', alignItems: 'center', marginTop: 'auto' } },
              h('span', { className: 'ab-small ab-muted' }, p.messages ? '说了 ' + p.messages + ' 句 · 最后 ' + timeAgo(p.lastSay) : '还没在流水里说过话'),
              h(Btn, { small: true, kind: 'ghost', disabled: busy === p.qq || p.memories < 3, onClick: () => rebuild(p.qq) }, busy === p.qq ? '重写中…' : '重写档案'))))))
    }

    /** 人物小档案：她对每个人的一小段印象，聊天时常驻；整理记忆时按新记忆重写，也可以手改。 */
    function ProfilesCard({ toast }) {
      const [list, setList] = useState(null)
      const load = () => get('/profiles').then((r) => setList(r.list || []))
      useEffect(() => { load() }, [])
      const pgp = usePager(list || [])
      return h(Card, { title: '人物小档案', desc: '她对每个人的印象：是谁、什么关系、喜好、最近在忙什么。和谁聊天就带上谁的那份（群里带上正在说话的几个人），不用等对方提到关键词她才想起来。每次整理记忆时，记忆有变化的人会按新记忆重写；你也可以直接改。' },
        list === null ? h(Empty, { icon: '⏳', text: '加载中…' }) : list.length === 0 ? h(Empty, { icon: '🌱', text: '还没有。关于一个人记住 3 条以上的事后，整理记忆时会写出来。' }) :
          h('div', null,
            h('div', { style: { overflowX: 'auto' } },
              h('table', { className: 'ab-table' },
                h('thead', null, h('tr', null, ['人', '小档案', '更新于', ''].map((x) => h('th', { key: x }, x)))),
                h('tbody', null, pgp.rows.map((p) => h(ProfileRow, { key: p.qq, p, toast, onChanged: load }))))),
            h(Pager, { page: pgp.page, total: pgp.total, setPage: pgp.setPage, count: pgp.count })))
    }

    function ProfileRow({ p, toast, onChanged }) {
      const [edit, setEdit] = useState(false)
      const [text, setText] = useState(p.text)
      const [busy, setBusy] = useState(false)
      useEffect(() => { setText(p.text) }, [p.text])
      return h('tr', null,
        h('td', { style: { whiteSpace: 'nowrap' } },
          h('b', null, p.name || p.qq),
          h('div', { className: 'ab-small ab-muted' }, p.qq)),
        h('td', null, edit
          ? h('textarea', { className: 'ab-input', rows: 3, style: { width: '100%', fontFamily: 'inherit' }, value: text, onChange: (e) => setText(e.target.value) })
          : h(Clip, { text: p.text, n: 60, max: 520 })),
        h('td', { className: 'ab-small ab-muted', style: { whiteSpace: 'nowrap' } }, timeAgo(p.at)),
        h('td', { style: { whiteSpace: 'nowrap' } }, edit
          ? h('span', { className: 'ab-flex', style: { gap: 4 } },
            h(Btn, { small: true, kind: 'primary', disabled: text === p.text, onClick: async () => { const r = await post('/profiles/save', { qq: p.qq, text }); toast(r.message, 'ok'); setEdit(false); onChanged() } }, '保存'),
            h(Btn, { small: true, kind: 'ghost', onClick: () => { setEdit(false); setText(p.text) } }, '取消'))
          : h('span', { className: 'ab-flex', style: { gap: 4 } },
            h(Btn, { small: true, kind: 'ghost', onClick: () => setEdit(true) }, '改'),
            h(Btn, { small: true, kind: 'ghost', disabled: busy, onClick: async () => { setBusy(true); const r = await post('/profiles/rebuild', { qq: p.qq }); setBusy(false); toast(r.message, r.ok ? 'ok' : 'err'); onChanged() } }, busy ? '重写中…' : '按记忆重写'))))
    }

    /** 最近几轮她想起了什么、因为哪些词想起来的。 */
    function RecallLog() {
      const [list, setList] = useState(null)
      const load = () => get('/memory/recalls').then((r) => setList(r.list || []))
      useEffect(() => { load() }, [])
      const pgr = usePager(list || [])
      return h(Card, { title: '最近想起了什么', desc: '每次回复前她会按对方说的话翻记忆。这里能看到最近几次想起了哪几条、是因为哪几个词想起来的；想不起来的那次也会列出来。', right: h(Btn, { small: true, kind: 'ghost', onClick: load }, '刷新') },
        !list ? h(Empty, { icon: '⏳', text: '加载中…' }) : list.length === 0 ? h(Empty, { icon: '🫧', text: '还没有记录（重启后从头记）。' }) :
          h('div', null,
            h('div', { style: { overflowX: 'auto' } },
              h('table', { className: 'ab-table' },
                h('thead', null, h('tr', null, ['时间', '会话', '对方说', '想起了什么'].map((x) => h('th', { key: x }, x)))),
                h('tbody', null, pgr.rows.map((r, i) => h('tr', { key: i },
                  h('td', { className: 'ab-small ab-muted', style: { whiteSpace: 'nowrap' } }, timeAgo(r.at)),
                  h('td', { className: 'ab-small', style: { whiteSpace: 'nowrap' } }, String(r.where || '').replace(/^private:/, '私聊 ').replace(/^group:/, '群 ')),
                  h('td', null, h(Clip, { text: r.query, n: 32, max: 260 })),
                  h('td', null, r.hits && r.hits.length
                    ? h(Clip, { text: r.hits.map((x) => x.text).join('；'), n: 46, max: 520 })
                    : h('span', { className: 'ab-muted' }, '这次什么都没想起来'))))))),
            h(Pager, { page: pgr.page, total: pgr.total, setPage: pgr.setPage, count: pgr.count })))
    }

    /** 导入旧档案：粘贴或上传文字，模型挑出值得记的，勾选后存进记忆库。 */
    function MemoryImport({ toast, onDone }) {
      const [text, setText] = useState('')
      const [busy, setBusy] = useState(false)
      const [cands, setCands] = useState(null)
      const [pick, setPick] = useState({})
      const readFile = () => {
        const inp = document.createElement('input')
        inp.type = 'file'
        inp.accept = '.txt,.md,.markdown,.json'
        inp.onchange = () => { const f = inp.files && inp.files[0]; if (!f) return; const fr = new FileReader(); fr.onload = () => setText(String(fr.result || '').slice(0, 30000)); fr.readAsText(f) }
        inp.click()
      }
      const scan = async () => {
        setBusy(true); setCands(null)
        const r = await post('/memory/import', { text })
        setBusy(false)
        if (!r.ok) return toast(r.message, 'err')
        setCands(r.list); setPick(Object.fromEntries(r.list.map((_, i) => [i, true])))
      }
      const commit = async () => {
        const items = cands.filter((_, i) => pick[i])
        const r = await post('/memory/import/commit', { items })
        toast(r.message, 'ok'); setCands(null); setText(''); onDone()
      }
      return h(Card, { title: '导入旧档案', desc: '以前写过的设定、聊天笔记、别的机器人的记忆文件（txt / md），贴进来或者上传。她会挑出值得记的，你勾选以后再存进记忆库；和已有记忆重复的会自动去掉。' },
        h('textarea', { className: 'ab-textarea', style: { minHeight: 110 }, placeholder: '把旧档案的文字粘贴到这里（最多 3 万字）', value: text, onChange: (e) => setText(e.target.value) }),
        h('div', { className: 'ab-flex', style: { marginTop: 8 } },
          h(Btn, { small: true, onClick: readFile }, '选择文件'),
          h(Btn, { small: true, kind: 'primary', disabled: busy || !text.trim(), onClick: scan }, busy ? h(Fragment, null, h('i', { className: 'ab-spin' }), ' 正在挑…') : '挑出值得记的'),
          h('span', { className: 'ab-muted ab-small' }, text ? text.length + ' 字' : '')),
        cands ? (cands.length === 0 ? h('div', { className: 'ab-muted', style: { marginTop: 10 } }, '没挑出新的可记的东西（或者都已经记过了）。') :
          h('div', { style: { marginTop: 10 } },
            h('div', { className: 'ab-list' }, cands.map((c, i) => h('label', { key: i, className: 'ab-li', style: { cursor: 'pointer' } },
              h('input', { type: 'checkbox', checked: !!pick[i], onChange: (e) => setPick({ ...pick, [i]: e.target.checked }), style: { accentColor: 'var(--ab-sea)', marginTop: 3 } }),
              h('div', { className: 'body' }, c.aboutName ? h('b', null, '[' + c.aboutName + '] ') : null, c.text, c.importance >= 0.8 ? ' ★' : '')))),
            h('div', { className: 'ab-flex', style: { marginTop: 8 } },
              h(Btn, { small: true, kind: 'primary', onClick: commit, disabled: !Object.values(pick).some(Boolean) }, '存进记忆库（' + Object.values(pick).filter(Boolean).length + ' 条）'),
              h(Btn, { small: true, kind: 'ghost', onClick: () => setCands(null) }, '取消')))) : null)
    }

    function StyleEditor({ k, label, list, toast, onSaved }) {
      const [text, setText] = useState(list.join('\n'))
      useEffect(() => setText(list.join('\n')), [list.join('\n')])
      const changed = text !== list.join('\n')
      return h('div', { style: { marginTop: 8 } },
        h('div', { className: 'ab-flex', style: { marginBottom: 4 } }, h('span', { className: 'ab-small', style: { color: 'var(--ab-sub)' } }, label), h('div', { className: 'ab-spacer' }),
          changed ? h(Btn, { small: true, kind: 'primary', onClick: async () => { const r = await post('/style/save', { key: k, list: text.split('\n') }); toast(r.message, 'ok'); onSaved() } }, '保存') : null),
        h('textarea', { className: 'ab-textarea', style: { minHeight: 50, fontFamily: 'inherit' }, value: text, onChange: (e) => setText(e.target.value), placeholder: '一行一条，例如：消息很短，常一句话分几条发' }))
    }

    function InsightCard({ p, toast, onSaved, style }) {
      const [edit, setEdit] = useState(false)
      const [open, setOpen] = useState(false)
      const [text, setText] = useState(p.list.map((x) => x.text).join('\n'))
      const changed = text !== p.list.map((x) => x.text).join('\n')
      const who = p.key.startsWith('group:') ? '群 ' + p.key.slice(6) : (p.name ? p.name + '（' + p.key.slice(3) + '）' : p.key.slice(3))
      const joined = p.list.map((x) => x.text).join('；')
      return h('tr', null,
        h('td', { style: { whiteSpace: 'nowrap' } }, who),
        h('td', { className: 'ab-small ab-muted', style: { whiteSpace: 'nowrap' } }, p.list.length + ' 条' + ((style && style.length) ? ' · 说法 ' + style.length + ' 条' : '')),
        h('td', null,
          edit
            ? h('textarea', { className: 'ab-textarea', style: { minHeight: 64, fontFamily: 'inherit', width: '100%' }, value: text, onChange: (e) => setText(e.target.value), placeholder: '一行一条经验' })
            : h(Clip, { text: joined, n: 70, max: 560 }),
          open ? h(StyleEditor, { k: p.key, label: '说话方式', list: style || [], toast, onSaved }) : null),
        h('td', { style: { whiteSpace: 'nowrap' } },
          h('span', { className: 'ab-flex', style: { gap: 4, flexDirection: 'column', alignItems: 'flex-start' } },
            edit
              ? h(Fragment, null,
                h(Btn, { small: true, kind: 'primary', disabled: !changed, onClick: async () => { const r = await post('/insights/save', { key: p.key, list: text.split('\n') }); toast(r.message, 'ok'); setEdit(false); onSaved() } }, '保存'),
                h(Btn, { small: true, kind: 'ghost', onClick: () => { setEdit(false); setText(p.list.map((x) => x.text).join('\n')) } }, '取消'))
              : h(Btn, { small: true, kind: 'ghost', onClick: () => setEdit(true) }, '改'),
            h(Btn, { small: true, kind: 'ghost', onClick: () => setOpen(!open) }, open ? '收起说法' : '说话方式'))))
    }

    function MemoryRow({ m, onChanged, toast }) {
      const [edit, setEdit] = useState(false)
      const [text, setText] = useState(m.text)
      if (m.invalidAt) {
        return h('tr', { style: { opacity: 0.62 } },
          h('td', { className: 'ab-small ab-muted', style: { whiteSpace: 'nowrap' } }, timeAgo(m.invalidAt)),
          h('td', { className: 'ab-small' }, h('span', { className: 'ab-pill', style: { padding: '0 6px', fontSize: 11 } }, '已过时')),
          h('td', null,
            h('s', null, (m.aboutName ? '[' + m.aboutName + '] ' : '') + m.text),
            m.supersededText ? h('div', { className: 'ab-muted ab-small' }, '→ 现在是：' + m.supersededText) : null),
          h('td', { style: { whiteSpace: 'nowrap' } },
            h(Btn, { small: true, kind: 'ghost', onClick: async () => { await post('/memory/restore', { id: m.id }); toast('恢复了', 'ok'); onChanged() } }, '恢复'),
            h(Btn, { small: true, kind: 'ghost', onClick: async () => { await post('/memory/delete', { id: m.id }); onChanged() } }, '删掉')))
      }
      return h('tr', null,
        h('td', { className: 'ab-small ab-muted', style: { whiteSpace: 'nowrap' } }, timeAgo(m.at)),
        h('td', { className: 'ab-small', style: { whiteSpace: 'nowrap' } }, h('span', { className: 'ab-pill', style: { padding: '0 6px', fontSize: 11 } }, SOURCE[m.source] || '记忆')),
        h('td', null, edit
          ? h('input', { className: 'ab-input', style: { width: '100%' }, value: text, onChange: (e) => setText(e.target.value), onKeyDown: async (e) => { if (e.key === 'Enter') { await post('/memory/update', { id: m.id, text }); setEdit(false); toast('改好了', 'ok'); onChanged() } if (e.key === 'Escape') setEdit(false) } })
          : h(Fragment, null,
            m.aboutName ? h('b', null, '[' + m.aboutName + '] ') : null,
            h(Clip, { text: m.text, n: 70, max: 620 }),
            m.importance >= 0.8 ? h('span', { title: '很重要' }, ' ★') : null)),
        h('td', { style: { whiteSpace: 'nowrap' } },
          h(Btn, { small: true, kind: 'ghost', onClick: () => setEdit(!edit) }, edit ? '取消' : '改'),
          h(Btn, { small: true, kind: 'ghost', onClick: async () => { await post('/memory/delete', { id: m.id }); onChanged() } }, '忘掉')))
    }

    /** 导入音色：把 .zip / .pth / .index 拖进来或点选，自动识别；下面列出已有的音色，可以删。 */
    function VoiceImport({ s, toast, onChange }) {
      const [over, setOver] = useState(false)
      const [busy, setBusy] = useState('')
      const upload = async (files) => {
        for (const file of [...files]) {
          if (!/\.(zip|pth|index|ckpt)$/i.test(file.name)) { toast('「' + file.name + '」不是 .zip / .pth / .index / .ckpt', 'err'); continue }
          setBusy('正在导入「' + file.name + '」（' + Math.round(file.size / 1024 / 1024) + 'MB）…')
          const r = await fetch(API + '/song/import?name=' + encodeURIComponent(file.name), { method: 'POST', body: file })
            .then((x) => x.json()).catch((e) => ({ ok: false, message: '上传失败：' + e.message }))
          toast(r.message, r.ok ? 'ok' : 'err')
        }
        setBusy('')
        onChange()
      }
      const pick = () => {
        const inp = document.createElement('input')
        inp.type = 'file'
        inp.multiple = true
        inp.accept = '.zip,.pth,.index,.ckpt'
        inp.onchange = () => inp.files && upload(inp.files)
        inp.click()
      }
      return h(Card, { title: '音色模型', desc: '插件不自带音色。把你有权使用的 RVC 模型导进来：.pth（可以带 .index），或者装着它们的 zip。只存在本机。自己训练的是 so-vits-svc 之类别的模型、或者想用自己的推理参数？去「本地接口」页接「翻唱换声」。' },
        h('div', {
          className: 'ab-drop' + (over ? ' over' : ''), role: 'button', tabIndex: 0,
          onClick: pick, onKeyDown: (e) => (e.key === 'Enter' || e.key === ' ') && pick(),
          onDragOver: (e) => { e.preventDefault(); setOver(true) }, onDragLeave: () => setOver(false),
          onDrop: (e) => { e.preventDefault(); setOver(false); upload(e.dataTransfer.files) },
        }, busy ? h('span', null, h('i', { className: 'ab-spin' }), ' ' + busy) : h('span', null, '把 .zip / .pth / .index 拖到这里，或者点击选择文件')),
        // 分离模型自动下载不动时：给几个地址，用浏览器或下载工具下好，拖进上面这个框
        s.parts && !s.parts.separatorModel && (s.separatorLinks || []).length ? h('div', { className: 'ab-note', style: { marginTop: 10 } },
          h('b', null, '人声分离模型下不动？'), ' 安装时会自动试好几个源（断了能接着下，太慢会换源）。实在不行，用浏览器或下载工具下好下面任一个（约 640 MB，是同一个文件），拖进上面这个框就行，插件会核对文件对不对：',
          (s.separatorLinks || []).map((u) => h('div', { key: u, className: 'ab-flex', style: { marginTop: 4 } },
            h('code', { className: 'ab-small', style: { wordBreak: 'break-all', flex: 1 } }, u),
            h(Btn, { small: true, kind: 'ghost', onClick: () => { navigator.clipboard.writeText(u); toast('复制了', 'ok') } }, '复制')))) : null,
        s.voices.length && !s.enabled ? h('div', { className: 'ab-note warn', style: { marginTop: 10 } }, '音色导入好了，但翻唱开关还没开（这一页最上面），打开并保存后她才会唱。') : null,
        s.voices.length === 0 ? h('div', { className: 'ab-muted ab-small', style: { marginTop: 8 } }, '还没有音色。') :
          h('div', { className: 'ab-list', style: { marginTop: 10 } }, s.voices.map((v) => h('div', { key: v.id, className: 'ab-li' },
            h('div', { className: 'body' }, h('b', null, v.id), v.hasIndex ? h('span', { className: 'ab-muted ab-small' }, ' · 带 index') : null),
            h(Btn, { small: true, kind: 'ghost', onClick: async () => { if (!confirm('删掉音色「' + v.id + '」？')) return; const r = await post('/song/voice/delete', { id: v.id }); toast(r.message, r.ok ? 'ok' : 'err'); onChange() } }, '删除')))))
    }

    const fmtBytes = (n) => (n >= 1024 ** 3 ? (n / 1024 ** 3).toFixed(2) + ' GB' : (n / 1024 ** 2).toFixed(n >= 100 * 1024 ** 2 ? 0 : 1) + ' MB')
    const fmtDur = (ms) => { const sec = Math.max(0, Math.round(ms / 1000)); return sec >= 60 ? Math.floor(sec / 60) + ' 分 ' + (sec % 60) + ' 秒' : sec + ' 秒' }

    /** 装到哪里：列出每个盘和剩余空间，点一下选；也可以自己填路径。 */
    function RootPicker({ draft, setDraft, s }) {
      const val = draft.song.root || ''
      const cur = val || s.defaultRoot
      const [drives, setDrives] = useState([])
      const [chk, setChk] = useState(null)
      useEffect(() => { get('/song/drives').then((r) => setDrives(r.list || [])) }, [])
      useEffect(() => {
        const t = setTimeout(() => get('/song/root/check?path=' + encodeURIComponent(cur)).then(setChk), 300)
        return () => clearTimeout(t)
      }, [cur])
      const pick = (root) => setDraft(setPath(draft, 'song.root', root === s.defaultRoot ? '' : root))
      return h('div', { style: { width: '100%' } },
        h('div', { className: 'ab-drives' },
          h('button', { type: 'button', className: cx('ab-drive', !val && 'on'), onClick: () => pick(s.defaultRoot) }, h('b', null, '默认位置'), h('small', null, s.defaultRoot)),
          drives.map((d) => h('button', { key: d.drive, type: 'button', className: cx('ab-drive', val.toLowerCase() === d.root.toLowerCase() && 'on', d.freeGB < 10 && 'low'), onClick: () => pick(d.root) },
            h('b', null, d.drive + ' 盘'), h('small', null, '剩 ' + d.freeGB + ' GB / 共 ' + Math.round(d.totalGB) + ' GB'),
            h('span', { className: 'bar' }, h('i', { style: { width: Math.round((1 - d.freeGB / d.totalGB) * 100) + '%' } }))))),
        h('input', { className: 'ab-input wide', style: { marginTop: 8 }, value: val, placeholder: '或者自己填路径，留空 = 默认位置（' + s.defaultRoot + '）', onChange: (e) => setDraft(setPath(draft, 'song.root', e.target.value)) }),
        chk ? h('div', { className: 'ab-small', style: { marginTop: 4, color: !chk.ok || chk.warn ? 'var(--ab-warn)' : 'var(--ab-sub)' } },
          !chk.ok ? chk.message : ['装在 ' + cur, chk.freeGB !== null ? '这个盘还剩 ' + chk.freeGB + ' GB' : '', chk.warn].filter(Boolean).join('；')) : null,
        val && val !== s.root && s.voices.length ? h('div', { className: 'ab-muted ab-small', style: { marginTop: 2 } }, '换位置后，已导入的音色要重新导入（或把原来的 models 文件夹搬过去）') : null)
    }

    /** 安装进度：步骤条 + 当前这一步的用时、预计、下载量和网速，一看就知道没卡住。 */
    function InstallProgress({ inst }) {
      const pr = inst.progress
      const now = Date.now()
      const steps = inst.steps || []
      return h('div', { className: 'ab-install' },
        h('div', { className: 'ab-install-steps' }, steps.map((name, i) => h('div', { key: i, className: cx('st', i < inst.stepIndex && 'done', i === inst.stepIndex && 'on'), title: name },
          h('i', null, i < inst.stepIndex ? '✓' : i + 1), h('span', null, name.replace(/（.*?）/g, ''))))),
        h('div', { className: 'ab-flex', style: { marginTop: 12 } }, h('i', { className: 'ab-spin' }), h('b', null, '第 ' + (inst.stepIndex + 1) + ' / ' + steps.length + ' 步：' + inst.step), h('div', { className: 'ab-spacer' }),
          h('span', { className: 'ab-muted ab-small' }, '这一步 ' + fmtDur(now - inst.stepAt) + ' · 总共 ' + fmtDur(now - inst.startedAt))),
        inst.stepHint ? h('div', { className: 'ab-muted ab-small', style: { marginTop: 2 } }, '预计：' + inst.stepHint) : null,
        pr && pr.kind === 'download' ? h('div', { className: 'ab-install-dl' },
          h('div', null, h('small', null, '已下载'), h('b', null, fmtBytes(pr.done))),
          h('div', null, h('small', null, '当前网速'), h('b', { style: { color: pr.speed < 20 * 1024 ? 'var(--ab-warn)' : undefined } }, fmtBytes(pr.speed) + '/s')),
          pr.speed < 20 * 1024 ? h('div', { className: 'ab-small', style: { color: 'var(--ab-warn)', flex: '1 1 220px' } }, '很慢的话：打开「用国内镜像下载」后重新点安装（已下好的不会重下），或者开着代理') : null) : null,
        pr && pr.kind === 'file' && pr.total ? h('div', { style: { marginTop: 10 } },
          h('div', { className: 'ab-flex ab-small' }, h('span', null, pr.name), h('div', { className: 'ab-spacer' }), h('span', null, fmtBytes(pr.done) + ' / ' + fmtBytes(pr.total) + '（' + Math.round((pr.done / pr.total) * 100) + '%）')),
          h('div', { className: 'ab-mood', style: { marginTop: 4 } }, h('i', { style: { width: Math.round((pr.done / pr.total) * 100) + '%' } }))) : null)
    }

    const SONG_PARTS = [['python', 'Python 环境'], ['applio', 'Applio（RVC 推理引擎）'], ['separator', '人声分离'], ['ffmpeg', 'ffmpeg（混音）'], ['weights', '预训练文件（音高、音色特征）'], ['separatorModel', '人声分离模型']]

    function Song({ st, draft, setDraft, toast }) {
      const f = useField(draft, setDraft)
      const [s, setS] = useState(st.song)
      const [q, setQ] = useState('')
      const [found, setFound] = useState(null)
      const [pitch, setPitch] = useState(0)
      const [acct, setAcct] = useState(null)
      const load = () => get('/song/status').then((r) => r.ok && setS(r))
      // 安装中 / 正在唱的时候每 3 秒刷新一次进度
      useEffect(() => {
        load()
        const busy = s && (s.install.running || s.current || s.queue.length)
        if (!busy) return
        const t = setInterval(load, 3000)
        return () => clearInterval(t)
      }, [s && s.install.running, s && Boolean(s.current), s && s.queue.length])
      if (!s) return h(Empty, { icon: '⏳', text: '加载中…' })
      const search = async () => { if (!q.trim()) return; setFound(null); const r = await get('/song/search?q=' + encodeURIComponent(q)); setFound(r.list || []); if (!r.ok) toast(r.message, 'err') }
      const sing = async (song) => { const r = await post('/song/request', { songId: song.id, song: song.name, pitch }); toast(r.message, r.ok ? 'ok' : 'err'); load() }
      const voices = s.voices.map((v) => ({ value: v.id, label: v.id, desc: v.hasIndex ? '带 .index' : '' }))
      return h('div', { className: 'ab-grid' },
        h(Card, { title: '翻唱', right: f.sw('song.enabled'), desc: '让她用自己的声音唱歌：点歌 → 从网易云下载 → 分离人声和伴奏 → 用 RVC 换成她的声音 → 混音 → 发语音条。主人在 QQ 里说「唱首歌」，或者发 /sing 歌名 都行。' },
          h('div', { className: cx('ab-note', s.ready ? '' : 'warn') }, s.message),
          h('div', { className: 'ab-checks', style: { marginTop: 12 } },
            SONG_PARTS.map(([k, label]) => h('div', { key: k, className: cx('ab-check', s.parts[k] && 'done') }, h('i', null, s.parts[k] ? '✓' : '·'), label)),
            h('div', { className: cx('ab-check', s.voices.length && 'done'), title: s.voices.map((v) => v.id).join('、') }, h('i', null, s.voices.length ? '✓' : '·'), s.voices.length ? '音色模型 ×' + s.voices.length : '音色模型（在下面导入）')),
          s.install.running ? null : h('div', { style: { marginTop: 12 } },
            h(Row, { label: '装到哪里', hint: '装完约 8 GB，音色模型也放这里。改了要先保存设置再点安装' }, h(RootPicker, { draft, setDraft, s })),
            h(Row, { label: '下载源', hint: '自动：安装前先测一下，官方源慢就用国内镜像（阿里云 / 南京大学 / npmmirror）' },
              h(Select, { value: draft.song.pypiMirror || 'auto', width: 220, onChange: (v) => setDraft(setPath(draft, 'song.pypiMirror', v)), options: [{ value: 'auto', label: '自动（推荐）' }, { value: 'cn', label: '一直用国内镜像' }, { value: 'off', label: '只用官方源' }] }))),
          h('div', { className: 'ab-flex', style: { marginTop: 12 } },
            h(Btn, { kind: 'primary', small: true, disabled: s.install.running || (draft.song.root || '') !== (st.config.song.root || ''), onClick: async () => { const r = await post('/song/install'); toast(r.message); setTimeout(load, 800) } },
              s.install.running ? h(Fragment, null, h('i', { className: 'ab-spin' }), ' 正在安装…') : Object.values(s.parts).every(Boolean) ? '重新检查 / 修复安装' : '一键安装'),
            h('span', { className: 'ab-muted ab-small' }, (draft.song.root || '') !== (st.config.song.root || '') ? '安装位置改了，先保存设置' : '需要 NVIDIA 显卡；装在 ' + s.root)),
          s.install.running ? h(InstallProgress, { inst: s.install }) : null,
          s.install.ok === true && !s.install.running ? h('div', { className: 'ab-note', style: { marginTop: 8 } }, '✓ ' + s.install.message) : null,
          s.install.log.length ? h('details', { style: { marginTop: 8 } }, h('summary', { className: 'ab-muted ab-small', style: { cursor: 'pointer' } }, '详细日志'),
            h('div', { className: 'ab-logs', style: { maxHeight: 180, marginTop: 6, padding: '8px 12px', whiteSpace: 'pre-wrap' } }, s.install.log.slice(-20).join('\n'))) : null,
          s.install.ok === false && !s.install.running ? h('div', { className: 'ab-note err', style: { marginTop: 8 } },
            h('div', null, s.install.message),
            h('div', { className: 'ab-flex', style: { marginTop: 8 } },
              h(Btn, { small: true, kind: 'primary', onClick: async () => { const r = await post('/song/install'); toast(r.message); setTimeout(load, 800) } }, '再试一次'),
              h(Btn, { small: true, onClick: () => { try { navigator.clipboard.writeText(['Halobot ' + st.version + ' 翻唱安装失败', s.install.message, '', s.install.error || '', '', ...(s.install.log || []).slice(-30)].join('\n')); toast('报错复制好了，发给作者就行', 'ok') } catch (e) { toast('复制失败，展开「详细日志」手动复制吧', 'err') } } }, '复制报错'),
              h('span', { className: 'ab-muted ab-small' }, '已经下好的部分不会重下'))) : null,
        ),
        h(VoiceImport, { s, toast, onChange: load }),
        h(Card, { title: '声音', desc: '用哪个音色唱、默认变调和语音条的长度。' },
          h(Row, { label: '音色' }, voices.length ? h(Select, { value: draft.song.voice || (voices[0] && voices[0].value), options: voices, onChange: (v) => setDraft(setPath(draft, 'song.voice', v)) }) : h('span', { className: 'ab-muted' }, '还没有模型')),
          h(Row, { label: '默认变调', hint: '她自己点歌时会按原唱男声 / 女声定，这里是你在面板里试唱时的默认值' }, f.range('song.pitch', -12, 12, 1, (v) => (v > 0 ? '+' : '') + v + ' 半音')),
          h(Row, { label: '语音条最长', hint: '歌比这个长就截一段' }, f.range('song.maxVoiceSec', 30, 300, 10, (v) => v + ' 秒')),
          h(Row, { label: '截哪一段' }, f.choices('song.clipStart', [{ value: 'auto', label: '副歌附近', desc: '从全曲大约 30% 的地方开始' }, { value: 'head', label: '从头开始' }])),
          h(Row, { label: '人声音量' }, f.range('song.vocalVolume', 0.2, 2, 0.05, (v) => Math.round(v * 100) + '%')),
          h(Row, { label: '伴奏音量' }, f.range('song.instVolume', 0.1, 2, 0.05, (v) => Math.round(v * 100) + '%')),
          h(Row, { label: '只有主人能点歌' }, f.sw('song.ownerOnly')),
        ),
        h(Card, { title: '网易云', desc: '不登录也能唱免费歌；会员歌、版权歌要填网易云的 Cookie。' },
          h(Row, { label: 'Cookie（MUSIC_U）', hint: '电脑浏览器登录 music.163.com → F12 → 应用 / 存储 → Cookie → 复制 MUSIC_U 的值。只存在本机，不显示' },
            f.text('song.neteaseCookie', { type: 'password', size: 'wide', placeholder: draft.song.neteaseCookieSet ? '已保存（不改就留空）' : '没有就留空' })),
          h('div', { className: 'ab-flex', style: { marginTop: 6 } },
            h(Btn, { small: true, onClick: async () => { const r = await get('/song/account'); setAcct(r) } }, '检查登录'),
            acct ? h('span', { className: 'ab-small', style: { color: acct.ok ? 'var(--ab-ok)' : 'var(--ab-warn)' } }, acct.ok ? '已登录：' + acct.nickname + (acct.vip ? '（会员）' : '（不是会员，只能下免费歌）') : acct.message) : null),
        ),
        h(Card, { title: '试唱', desc: '搜一首歌让她唱，做好会发到你的 QQ 私聊。' },
          h('div', { className: 'ab-flex' },
            h('input', { className: 'ab-input', style: { flex: '1 1 260px' }, placeholder: '歌名，可以带歌手：小幸运 田馥甄', value: q, onChange: (e) => setQ(e.target.value), onKeyDown: (e) => e.key === 'Enter' && search() }),
            h(Btn, { small: true, onClick: search, disabled: !q.trim() }, '搜索'),
            h('span', { className: 'ab-muted ab-small' }, '变调'),
            h('input', { className: 'ab-input sm', type: 'number', min: -24, max: 24, value: pitch, onChange: (e) => setPitch(Number(e.target.value) || 0) })),
          found === null ? null : found.length === 0 ? h('div', { className: 'ab-muted', style: { marginTop: 8 } }, '没搜到') :
            h('div', { style: { overflowX: 'auto' } }, h('table', { className: 'ab-table', style: { marginTop: 10 } }, h('tbody', null, found.map((x) => h('tr', { key: x.id },
              h('td', null, x.name, x.vip ? h('span', { className: 'ab-badge', style: { marginLeft: 6 } }, '会员') : null),
              h('td', { className: 'ab-muted' }, x.artists),
              h('td', { className: 'ab-muted' }, Math.floor(x.durationSec / 60) + ':' + String(x.durationSec % 60).padStart(2, '0')),
              h('td', null, h(Btn, { small: true, kind: 'primary', disabled: !s.ready || !draft.song.enabled, onClick: () => sing(x) }, '唱给我听'))))))),
          !draft.song.enabled ? h('div', { className: 'ab-muted ab-small', style: { marginTop: 8 } }, '先打开上面的「翻唱」开关并保存。') : null,
          s.current ? h('div', { className: 'ab-note', style: { marginTop: 10 } }, h('i', { className: 'ab-spin' }), ' 正在唱「' + s.current.title + '」：' + s.current.stage + (s.queue.length ? '（后面还有 ' + s.queue.length + ' 首）' : '')) : null,
          s.history.length ? h('div', { className: 'ab-list', style: { marginTop: 10 } }, s.history.map((x, i) => h('div', { key: i, className: 'ab-li' },
            h('div', { className: 'meta' }, timeAgo(x.at)),
            h('div', { className: 'body' }, (x.ok ? '✓ ' : '✗ ') + x.title + (x.voice ? ' · ' + x.voice + (x.pitch ? ' ' + (x.pitch > 0 ? '+' : '') + x.pitch : '') : ''), h('div', { className: 'ab-muted ab-small' }, x.message))))) : null,
        ),
      )
    }

/** B 站 Cookie：SESSDATA 和 bili_jct 分两个框填（前缀已经写好），可以显示 / 隐藏；粘整串也行，会自动拆开。 */
    function BiliCookie({ draft, setDraft }) {
      const [show, setShow] = useState(false)
      const b = draft.bili
      const field = (key, prefix, setKey, hintKey, ph) => h('div', { className: 'ab-flex', style: { flexWrap: 'nowrap', marginBottom: 6 } },
        h('code', { className: 'ab-small', style: { minWidth: 82, textAlign: 'right' } }, prefix),
        h('input', {
          className: 'ab-input wide', type: show ? 'text' : 'password', autoComplete: 'off', spellCheck: false, value: b[key] || '',
          placeholder: b[setKey] ? '已保存（结尾 ' + (b[hintKey] || '…') + '），不改就留空' : ph,
          onChange: (e) => setDraft(setPath(draft, 'bili.' + key, e.target.value.trim())),
        }))
      return h(Row, { label: 'B 站 Cookie', hint: '电脑浏览器登录 bilibili.com → F12 → 「应用」（Application）→ Cookie → bilibili.com，分别复制 SESSDATA 和 bili_jct 这两行的「值」。也可以直接粘整串 Cookie，会自动拆开。只存在本机；不填也能看视频，但看不到 AI 字幕、不能评论和回复。建议用小号' },
        h('div', { style: { flex: 1 } },
          field('sessdata', 'SESSDATA=', 'sessdataSet', 'sessdataHint', '粘贴 SESSDATA 的值'),
          field('biliJct', 'bili_jct=', 'biliJctSet', 'biliJctHint', '粘贴 bili_jct 的值'),
          h('div', { className: 'ab-flex' },
            h(Btn, { small: true, onClick: () => setShow(!show) }, show ? '隐藏' : '显示'),
            b.sessdataSet || b.biliJctSet ? h(Btn, { small: true, kind: 'ghost', onClick: () => { if (confirm('清空保存的 B 站 Cookie？')) setDraft(setPath(setPath(setPath(draft, 'bili.sessdata', null), 'bili.biliJct', null), 'bili.cookie', null)) } }, '清空') : null,
            h('span', { className: 'ab-muted ab-small' }, '「显示」看的是正在填的内容；保存过的出于安全不回传，只显示结尾几位'))))
    }

/** 本地接口：数据目录 local/ 里的脚本接管语音合成、生图、翻唱换声、语音识别。 */
    function LocalApi({ draft, setDraft, toast }) {
      const f = useField(draft, setDraft)
      const [st, setSt] = useState(null)
      const [busy, setBusy] = useState('')
      const [img, setImg] = useState('')
      const load = () => get('/local/status').then(setSt)
      useEffect(() => { load() }, [])
      const act = async (path, slot, label) => { setBusy(slot + label); const r = await post(path, { slot }); setBusy(''); toast(r.message, r.ok ? 'ok' : 'err'); if (r.image) setImg(r.image); load() }
      return h('div', { className: 'ab-grid' },
        h(Card, { title: '本地接口', desc: '想用自己电脑上的模型或服务（GPT-SoVITS 语音、SD WebUI / ComfyUI 画图、自己训练的 so-vits-svc 音色、本地语音识别……）？在这里生成一个脚本模板，照注释改，或者点「复制给 DSH 的话」粘给 DSH，让它帮你改。脚本放在插件数据目录的 local 文件夹里，插件升级不会覆盖；改完保存就生效，不用重启。每一项要打开开关才会用，出错时语音和识别会自动退回内置方式。' },
          h('div', { className: 'ab-flex' },
            h('code', { className: 'ab-small', style: { wordBreak: 'break-all', flex: 1 } }, st ? st.dir : '…'),
            h(Btn, { small: true, onClick: () => post('/local/open').then((r) => toast(r.message)) }, '打开文件夹'))),
        !st ? h(Empty, { icon: '⏳', text: '加载中…' }) : st.list.map((x) => h(Card, { key: x.slot, title: x.title + '（' + x.file + '）', right: f.sw('local.' + x.slot) },
          h('div', { className: 'ab-flex', style: { marginBottom: 8 } },
            h('span', { className: 'ab-small', style: { color: x.active ? 'var(--ab-ok)' : 'var(--ab-muted)' } },
              x.active ? '● 正在由本地脚本接管' : !x.exists ? '还没有这个脚本' : !x.enabled ? '脚本已经有了，开关没开（用内置方式）' : '用内置方式'),
            x.last ? h('span', { className: 'ab-small', style: { color: x.last.ok ? 'var(--ab-ok)' : 'var(--ab-err)' } }, ' · 上次' + (x.last.ok ? '成功，' + x.last.message : '出错：' + x.last.message)) : null),
          h('div', { className: 'ab-flex' },
            x.exists ? null : h(Btn, { small: true, kind: 'primary', disabled: !!busy, onClick: () => act('/local/template', x.slot, 't') }, '生成模板'),
            h(Btn, { small: true, onClick: () => { navigator.clipboard.writeText(x.prompt); toast('复制好了，粘给 DSH，再把【】里那句换成你的情况', 'ok') } }, '复制给 DSH 的话'),
            x.exists && (x.slot === 'tts' || x.slot === 'image') ? h(Btn, { small: true, disabled: !!busy, onClick: () => act('/local/test', x.slot, 'x') }, busy === x.slot + 'x' ? '正在试…' : '试一下') : null),
          x.slot === 'image' && img ? h('img', { src: 'data:image/png;base64,' + img, style: { marginTop: 10, maxWidth: 240, borderRadius: 8 } }) : null)),
      )
    }

    // ---------------- 扩展：模块 ----------------
    const MOD_STATE = (m) => {
      if (m.safeSkipped) return { cls: 'dim', text: '安全模式，没加载' }
      if (!m.enabled) return { cls: 'dim', text: '关着' }
      if (m.running === 'user' && m.builtin) return { cls: 'mine', text: '用的是你的版本' }
      if (m.running === 'user') return { cls: 'mine', text: '在跑' }
      if (m.running === 'builtin' && m.fallback) return { cls: 'warn', text: '你的版本没加载成功，先用内置的' }
      if (m.running === 'builtin') return { cls: '', text: '在跑' }
      return { cls: 'err', text: m.error ? '没加载成功' : '没在跑' }
    }

    /** 一个模块一行：开关、状态、报错，能复制来改 / 用回内置的 / 重新加载。 */
    function ModuleRow({ m, draft, setModules, toast, reload }) {
      const s = MOD_STATE(m)
      const [open, setOpen] = useState(false)
      const setMod = async (patch) => {
        const r = await post('/save', { modules: { [m.id]: { ...((draft.modules || {})[m.id] || {}), ...patch } } })
        if (r.ok === false) return toast(r.message, 'err')
        toast(patch.enabled === false ? `「${m.name}」关掉了` : patch.enabled ? `「${m.name}」打开了` : '好了', 'ok')
        setModules(r.modules)
        reload()
      }
      const act = async (path, body, okMsg) => {
        const r = await post(path, body)
        toast(r.message || okMsg, r.ok === false ? 'err' : 'ok')
        if (r.list) setModules(r.list)
        if (r.prompt && r.ok) copy(r.prompt, toast)
        reload()
        return r
      }
      const what = [m.tools.length ? '工具：' + m.tools.join('、') : '', m.commands.length ? '命令：' + m.commands.map((c) => '/' + c).join(' ') : ''].filter(Boolean).join('　')
      const errs = (m.error ? [{ label: '加载', message: m.error }] : []).concat(m.errors || [])
      return h('div', { className: 'ab-mod' },
        h('div', { className: 'main' },
          h('div', { className: 'nm' }, m.name, h('code', null, m.id),
            h('span', { className: cx('ab-badge', s.cls) }, s.text),
            m.outdated ? h('span', { className: 'ab-badge warn', title: '你复制 / 替换时内置的是 ' + m.forkedFrom + '，现在是 ' + m.builtinVersion }, '内置版本更新了') : null),
          m.description ? h('div', { className: 'ds' }, m.description) : null,
          what ? h('div', { className: 'what' }, what) : null,
          errs.length ? h('div', { className: 'ab-note err', style: { marginTop: 6 } },
            h('div', { style: { cursor: 'pointer' }, onClick: () => setOpen(!open) }, (open ? '▾ ' : '▸ ') + errs.length + ' 条报错：' + String(errs[0].message).split('\n')[0].slice(0, 120)),
            open ? h('div', { className: 'ab-code' }, errs.map((e) => (e.at ? new Date(e.at).toLocaleTimeString() + ' ' : '') + (e.label || '') + '：' + e.message).join('\n\n')) : null) : null,
          h('div', { className: 'acts' },
            m.builtin && !m.hasUser ? h(Btn, { small: true, onClick: () => act('/modules/fork', { id: m.id }, '复制好了'), title: '把这个内置模块的源码复制到 modules/' + m.id + '/，改了就替换内置的' }, '复制一份来改') : null,
            m.hasUser ? h(Btn, { small: true, onClick: () => post('/modules/open?id=' + encodeURIComponent(m.id)).then((r) => toast(r.message)) }, '打开文件夹') : null,
            m.hasUser ? h(Btn, { small: true, onClick: () => get('/modules/prompt?id=' + encodeURIComponent(m.id)).then((r) => copy(r.prompt, toast, '复制好了，粘给 DSH，把【】里那句换成你想要的')) }, '复制给 DSH 的话') : null,
            m.hasUser && !m.safeSkipped ? h(Btn, { small: true, onClick: () => act('/modules/reload', { id: m.id }, '重新加载好了') }, '重新加载') : null)),
        h('div', { className: 'side' },
          h(Switch, { on: m.enabled, onChange: (v) => setMod({ enabled: v }), title: m.enabled ? '关掉这个模块' : '打开这个模块' }),
          m.builtin && m.hasUser ? h('label', { className: 'ab-small ab-muted', style: { display: 'flex', alignItems: 'center', gap: 6 } }, '用内置的', h(Switch, { on: m.useBuiltin, onChange: (v) => setMod({ useBuiltin: v }) })) : null))
    }

    /** 模拟测试：不上 QQ 试模块。发出去的只截下来看，不真发。 */
    function Simulate({ toast }) {
      const [as, setAs] = useState('owner')
      const [kind, setKind] = useState('private')
      const [text, setText] = useState('')
      const [reply, setReply] = useState('')
      const [out, setOut] = useState(null)
      const [tools, setTools] = useState([])
      const [tool, setTool] = useState('')
      const [args, setArgs] = useState('{}')
      const [tout, setTout] = useState(null)
      useEffect(() => { get('/modules/tools?as=' + as + '&kind=' + kind).then((r) => { const l = r.list || []; setTools(l); if (!l.some((t) => t.name === tool)) setTool(l[0] ? l[0].name : '') }) }, [as, kind])
      const cur = tools.find((t) => t.name === tool)
      const run = async () => { const r = await post('/modules/simulate', { as, kind, text, reply }); if (r.ok === false) return toast(r.message, 'err'); setOut(r) }
      const call = async () => {
        let a
        try { a = JSON.parse(args || '{}') } catch (e) { return toast('参数要是 JSON，比如 {"city":"北京"}', 'err') }
        const r = await post('/modules/tool', { as, kind, name: tool, args: a })
        if (r.ok === false) return toast(r.message, 'err')
        setTout(r)
      }
      const sentList = (sent) => (sent && sent.length ? h('div', { className: 'ab-code' }, sent.map((s) => '→ ' + s.chatId + '：' + s.text).join('\n')) : h('div', { className: 'ab-small ab-muted', style: { marginTop: 6 } }, '没有发出任何消息'))
      return h(Card, { title: '模拟测试', desc: '不用上 QQ 就能试模块：这里发出去的消息只截下来显示，不会真发到 QQ。（模块直接调 api.onebot 的操作，比如禁言、发空间，是真的会执行的；会改设置的内置命令不执行。）' },
        h(Row, { label: '假装是', hint: '谁在说话、在哪儿说' },
          h('div', { className: 'ab-flex' },
            h(Seg, { value: as, options: [{ value: 'owner', label: '主人' }, { value: 'other', label: '别人' }], onChange: setAs }),
            h(Seg, { value: kind, options: [{ value: 'private', label: '私聊' }, { value: 'group', label: '群聊' }], onChange: setKind }))),
        h(Row, { label: '发一条消息', hint: '看哪个模块接管、命令回什么（/开头是命令）' },
          h('input', { className: 'ab-input', value: text, placeholder: '比如：早安，或 /weather 北京', onChange: (e) => setText(e.target.value) })),
        h(Row, { label: '她的回复', hint: '可选：假设她这样回，看经过各个模块改写后最后发出去什么（可以用 ||| 分条、<voice>…</voice>）' },
          h('input', { className: 'ab-input', value: reply, placeholder: '比如：早呀|||今天也要加油', onChange: (e) => setReply(e.target.value) })),
        h('div', { className: 'ab-flex' }, h(Btn, { kind: 'primary', small: true, disabled: !text.trim() && !reply.trim(), onClick: run }, '模拟')),
        out ? h('div', { style: { marginTop: 8 } }, out.steps.map((s, i) => h('div', { key: i, className: 'ab-small' }, '· ' + s)), sentList(out.sent)) : null,
        h('div', { className: 'ab-section-title' }, '调用工具'),
        tools.length ? h('div', null,
          h(Row, { label: '工具', hint: cur ? cur.description : '' }, h(Select, { value: tool, options: tools.map((t) => ({ value: t.name, label: t.name })), onChange: (v) => { setTool(v); setArgs('{}'); setTout(null) } })),
          cur && cur.parameters && Object.keys(cur.parameters.properties || {}).length ? h('div', { className: 'ab-small ab-muted', style: { margin: '0 0 6px' } }, '参数：' + Object.entries(cur.parameters.properties).map(([k, v]) => k + (v.description ? '（' + v.description + '）' : '')).join('；')) : null,
          h('textarea', { className: 'ab-textarea', style: { minHeight: 50, fontFamily: 'ui-monospace,Consolas,monospace' }, value: args, onChange: (e) => setArgs(e.target.value) }),
          h('div', { className: 'ab-flex', style: { marginTop: 6 } }, h(Btn, { small: true, onClick: call, disabled: !tool }, '调用')),
          tout ? h('div', null, h('div', { className: 'ab-code' }, JSON.stringify(tout.result, null, 2)), sentList(tout.sent)) : null)
          : h('div', { className: 'ab-small ab-muted' }, '这个场合没有工具'))
    }

    /** 扩展页：所有模块（内置的 + 自己写的）、新建、安全模式。 */
    function Modules({ st, draft, toast, reload }) {
      const [data, setData] = useState(null)
      const [newId, setNewId] = useState('')
      const [newName, setNewName] = useState('')
      const load = () => get('/modules').then(setData)
      useEffect(() => { load() }, [])
      useEffect(() => { if (data && st.modules) setData((d) => ({ ...d, list: st.modules })) }, [JSON.stringify(st.modules)])
      const setModules = (list) => list && setData((d) => ({ ...d, list }))
      if (!data) return h(Empty, { icon: '⏳', text: '加载中…' })
      const list = data.list || []
      const builtin = list.filter((m) => m.builtin)
      const mine = list.filter((m) => !m.builtin)
      const props = { draft, setModules, toast, reload: () => { reload(); load() } }
      const create = async () => {
        const r = await post('/modules/create', { id: newId.trim(), name: newName.trim() })
        if (!r.ok) return toast(r.message, 'err')
        setNewId(''); setNewName('')
        setModules(r.list)
        copy(r.prompt, toast, '建好了，「复制给 DSH 的话」已经复制好，粘给 DSH 让它帮你写')
        reload()
      }
      return h('div', { className: 'ab-grid' },
        h(Card, { title: '扩展', desc: '她的每项本事都是一个模块：能单独关掉；能复制一份来改，改了就替换内置的；也能自己写新模块，让她学会你想要的任何事。自己写的东西放在下面这个文件夹，插件升级不会动；改完保存几秒内自动生效，不用重启。不会写代码？点「复制给 DSH 的话」，粘给 DSH，说你想要什么。' },
          h('div', { className: 'ab-flex' },
            h('code', { className: 'ab-small', style: { wordBreak: 'break-all', flex: 1 } }, data.dir),
            h(Btn, { small: true, onClick: () => post('/modules/open').then((r) => toast(r.message)) }, '打开文件夹'),
            h(Btn, { small: true, onClick: () => copy(data.prompt, toast, '复制好了，粘给 DSH，把【】里那句换成你想要的') }, '复制给 DSH 的话'),
            h(Btn, { small: true, kind: 'ghost', onClick: async () => { const r = await post('/modules/reload', {}); setModules(r.list); toast(r.message) } }, '重新检查')),
          h(Row, { label: '安全模式', hint: '打开后你写的模块一个都不加载，内置的全部恢复。出了问题先开它，看是不是你的模块引起的。' },
            h(Switch, { on: st.config.safeMode, onChange: async (v) => { const r = await post('/save', { safeMode: v }); toast(v ? '安全模式开了：只跑内置模块' : '安全模式关了', 'ok'); setModules(r.modules); reload() } })),
          st.config.safeMode ? h('div', { className: 'ab-note warn' }, '安全模式开着：你写的模块现在都没加载。') : null),
        h(Card, { title: '新建一个模块', desc: '从模板建一个能直接跑的例子（关键词自动回复 + 一个命令 + 一个工具），在它上面改。id 用小写英文，比如 weather。想改内置的本事，用下面内置模块那一行的「复制一份来改」。' },
          h('div', { className: 'ab-flex' },
            h('input', { className: 'ab-input', style: { maxWidth: 180 }, placeholder: 'id，如 weather', value: newId, onChange: (e) => setNewId(e.target.value.toLowerCase()) }),
            h('input', { className: 'ab-input', placeholder: '名字，如 查天气', value: newName, onChange: (e) => setNewName(e.target.value) }),
            h(Btn, { kind: 'primary', small: true, disabled: !newId.trim(), onClick: create }, '新建'))),
        mine.length ? h(Card, { title: '自己写的（' + mine.length + '）' }, h('div', null, mine.map((m) => h(ModuleRow, { key: m.id, m, ...props })))) : null,
        h(Card, { title: '内置模块（' + builtin.length + '）', desc: '关掉的模块：她就没有这项本事，相关的标签页也会藏起来。连接、权限、人格、聊天这些是核心，不能关。' },
          h('div', null, builtin.map((m) => h(ModuleRow, { key: m.id, m, ...props })))),
        h(Simulate, { toast }),
      )
    }

    /** 自己写的模块的面板：自动表单 + 模块自己的 panel.js。 */
    class PanelBoundary extends React.Component {
      constructor(p) { super(p); this.state = { error: null } }
      static getDerivedStateFromError(error) { return { error } }
      render() { return this.state.error ? h('div', { className: 'ab-note err' }, '这个模块的面板出错了：' + String((this.state.error && this.state.error.message) || this.state.error)) : this.props.children }
    }
    function ExtPanel({ m, settings, draftSettings, setSettings, toast, reload }) {
      const [Comp, setComp] = useState(null)
      const [err, setErr] = useState('')
      useEffect(() => {
        let alive = true
        fetch(API + '/modules/panel?id=' + encodeURIComponent(m.id) + '&t=' + Date.now(), { cache: 'no-store' }).then((r) => (r.ok ? r.text() : Promise.reject(new Error('读不到 panel.js')))).then((src) => {
          const call = (p, body) => (body === undefined ? get('/ext/' + m.id + p) : post('/ext/' + m.id + p, body))
          const ui = { Card, Btn, Switch, Row, Empty, Select, Seg, Range }
          const C = new Function('React', 'h', 'ui', 'call', src)(React, h, ui, call)
          if (typeof C !== 'function') throw new Error('panel.js 最后要 return 一个组件（函数）')
          if (alive) setComp(() => C)
        }).catch((e) => alive && setErr(e.message))
        return () => { alive = false }
      }, [m.id, m.startedAt])
      if (err) return h('div', { className: 'ab-note err' }, '面板加载失败：' + err)
      if (!Comp) return h(Empty, { icon: '⏳', text: '加载中…' })
      const save = async (patch) => { const r = await post('/save', { ext: { [m.id]: patch } }); toast(r.ok === false ? r.message : '保存好了', r.ok === false ? 'err' : 'ok'); reload() }
      return h(PanelBoundary, null, h(Comp, { settings, draftSettings, setSettings, save, toast, reload }))
    }
    function ExtPage({ st, draft, setDraft, toast, reload, mod, embedded }) {
      const m = (st.modules || []).find((x) => x.id === mod)
      const f = useField(draft, setDraft)
      if (!m) return h(Empty, { icon: '🧩', text: '这个模块没在跑了' })
      const base = 'ext.' + m.id + '.'
      const settings = { ...(m.defaults || {}), ...((st.config.ext || {})[m.id] || {}) }
      const draftSettings = { ...(m.defaults || {}), ...((draft.ext || {})[m.id] || {}) }
      const setSettings = (patch) => setDraft((previous) => ({ ...previous, ext: { ...previous.ext, [m.id]: { ...(previous.ext || {})[m.id], ...patch } } }))
      const field = (s) => {
        const p = base + s.key
        if (s.type === 'switch') return f.sw(p)
        if (s.type === 'number') return f.num(p, { min: s.min, max: s.max, step: s.step })
        if (s.type === 'select') return f.select(p, (s.options || []).map((o) => (typeof o === 'string' ? { value: o, label: o } : o)))
        if (s.type === 'textarea') return h('textarea', { className: 'ab-textarea', value: getPath(draft, p) ?? '', placeholder: s.placeholder, onChange: (e) => setDraft(setPath(draft, p, e.target.value)) })
        if (s.type === 'password') return f.text(p, { type: 'password', placeholder: getPath(draft, p + 'Set') ? '已保存（不改就留空）' : s.placeholder || '' })
        return f.text(p, { placeholder: s.placeholder })
      }
      return h('div', { className: 'ab-grid' },
        ((m.settings || []).length || (m.errors || []).length || !m.panel) ? h(Card, { title: m.name, desc: m.description, right: h('span', { className: 'ab-badge mine' }, embedded ? '扩展模块 · ' + m.id : m.id) },
          (m.settings || []).map((s) => h(Row, { key: s.key, label: s.label || s.key, hint: s.hint }, field(s))),
          (m.settings || []).length ? h('div', { className: 'ab-small ab-muted' }, '改完点下面的「保存设置」。') : null,
          (m.errors || []).length ? h('div', { className: 'ab-note err', style: { marginTop: 8 } }, '最近的报错：' + m.errors[0].message) : null) : null,
        m.panel ? h(ExtPanel, { m, settings, draftSettings, setSettings, toast, reload }) : null)
    }

    const BILI_KIND = { watch: '看了', comment: '评论', reply: '回复', share: '分享给你', shot: '发你截图', error: '没成功' }

    /** B 站：登录、定时刷、评论 / 回复、分享给主人，以及她刷过什么。 */
    function Bili({ draft, setDraft, toast }) {
      const f = useField(draft, setDraft)
      const [s, setS] = useState(null)
      const [busy, setBusy] = useState('')
      const [shots, setShots] = useState(null)
      const load = () => get('/bili/state').then(setS).catch((e) => toast(e.message, 'err'))
      const loadShots = () => get('/bili/shots').then((r) => setShots(r.items || [])).catch((e) => { setShots([]); toast(e.message, 'err') })
      useEffect(() => { load(); loadShots() }, [])
      const pg = usePager(s ? s.history : [])
      const act = (path, label) => async () => { setBusy(label); const r = await post(path); setBusy(''); toast(r.message, r.ok ? 'ok' : 'err'); load(); loadShots() }
      const acct = s && s.account
      return h('div', { className: 'ab-grid' },
        h(Card, { title: '刷 B 站', right: f.sw('bili.enabled'), desc: '她会定时去 B 站刷几个视频：从她的兴趣、记忆里你喜欢的东西和下面的关键词里挑方向去搜，读简介、字幕和热评，再按自己的性格决定评不评论、要不要私聊分享给你、记住什么。看过的、评过的都记成她的经历，聊天时会自然提起。你在 QQ 里发 B 站链接或分享卡片，她也能点进去看完再聊。' },
          h(BiliCookie, { draft, setDraft }),
          h('div', { className: 'ab-flex', style: { marginTop: 4 } },
            h(Btn, { small: true, onClick: async () => { const r = await get('/bili/account'); setS({ ...(s || {}), account: r }) } }, '检查登录'),
            acct ? h('span', { className: 'ab-small', style: { color: acct.isLogin ? 'var(--ab-ok)' : 'var(--ab-warn)' } }, acct.isLogin ? '已登录：' + acct.uname : '没登录（只能看，不能评论）') : null),
        ),
        h(Card, { title: '怎么刷', desc: '只在「主动搭话」里设的醒着时间内刷。' },
          h(Row, { label: '定时自己去刷' }, f.sw('bili.autoBrowse')),
          h(Row, { label: '多久刷一轮' }, f.range('bili.intervalHours', 1, 24, 1, (v) => v + ' 小时')),
          h(Row, { label: '每天最多刷' }, f.range('bili.maxRunsPerDay', 0, 12, 1, (v) => v + ' 轮')),
          h(Row, { label: '一轮看几个视频' }, f.range('bili.perRun', 1, 6, 1, (v) => v + ' 个')),
          h(Row, { label: '抽一个「不相干」的位置', hint: '概率；偶尔刷点和她兴趣无关的，免得整轮都是吃的、猫、睡觉' }, f.range('bili.exploreChance', 0, 1, 0.05, (v) => Math.round(v * 100) + '%')),
          h(Row, { label: '额外想看的方向', hint: '一行一个；另外还会参考她的兴趣和记忆' }, f.list('bili.keywords', { placeholder: '白米饭 做法\n猫咪\n游戏解说' })),
          h(Row, { label: '播放量门槛' }, f.num('bili.minViews', { min: 0 }), h('span', { className: 'ab-muted' }, '次以上')),
          h(Row, { label: '只看最近' }, f.num('bili.maxAgeDays', { min: 0 }), h('span', { className: 'ab-muted' }, '天内发的（0 = 不限）')),
        ),
        h(Card, { title: '看画面（抽帧 + 视觉）', desc: '默认只读标题、简介、字幕和热评。打开后用 ffmpeg 抽帧交给视觉模型，截图保存到本机，可以在 QQ 聊天里让她挑一张发送。没有 ffmpeg、模型明确不支持图片或处理失败时，自动继续文字阅读。' },
          h(Row, { label: '让她看画面', hint: '需要视觉模型 + ffmpeg；关掉就退回只看文字' }, f.sw('bili.vision')),
          h(Row, { label: '每个视频抽几帧' }, f.range('bili.visionFrames', 2, 12, 1, (v) => v + ' 帧')),
          h(Row, { label: '刷完顺手发张截图', hint: '概率；跟发一张表情包一样默认 35%，0 = 从不。截图都存在本机，你让她发她也能挑' }, f.range('bili.shotChance', 0, 1, 0.05, (v) => Math.round(v * 100) + '%')),
          h(Row, { label: '截图库最多存', hint: '超过就自动删最旧的；下面的截图库里也能一张张手动删' }, f.num('bili.shotLibrary', { min: 20, max: 2000 }), h('span', { className: 'ab-muted' }, '张')),
          h(Row, { label: 'ffmpeg 路径', hint: '留空就自己在 PATH 里找；找不到就填绝对路径' }, f.text('bili.ffmpegPath', { placeholder: 'C:\\ffmpeg\\bin\\ffmpeg.exe' })),
          s && s.vision ? h('div', { className: 'ab-small', style: { marginTop: 4, color: s.vision.ffmpeg ? 'var(--ab-ok)' : 'var(--ab-warn)' } }, (s.vision.ffmpeg ? '✓ 已找到 ffmpeg：' + s.vision.ffmpeg : '✗ 没找到 ffmpeg：抽帧会被跳过，装一个或者在上面填路径') + (s.shots ? '　·　手上存了 ' + s.shots.count + ' 张截图' : '')) : null,
        ),
        h(Card, { title: '截图库' + (shots ? '（' + shots.length + ' / ' + ((draft.bili && draft.bili.shotLibrary) || 300) + '）' : ''), right: h('div', { className: 'ab-flex' },
          h(Btn, { small: true, kind: 'ghost', onClick: loadShots }, '刷新')) },
          !shots ? h(Empty, { icon: '⏳', text: '加载中…' }) : shots.length === 0 ? h(Empty, { icon: '🎬', text: '还没有截图。打开上面的「让她看画面」刷一轮 B 站，就会开始截。' }) :
            h('div', { className: 'ab-shots' }, shots.map((it) => h(ShotCell, { key: it.file, it, onChanged: () => { loadShots(); load() }, toast }))),
        ),
        h(Card, { title: '评论、回复和分享', desc: '评论和回复要登录。试运行开着时只记日志不发。' },
          h(Row, { label: '自己发评论' }, f.sw('bili.comment'), h('span', { className: 'ab-muted' }, '每天最多'), f.num('bili.maxCommentsPerDay', { min: 0, max: 50 }), h('span', { className: 'ab-muted' }, '条')),
          h(Row, { label: '真的发出去的概率', hint: '有想说的也不一定发；0 = 只看不评，100% = 想发就发' }, f.range('bili.commentChance', 0, 1, 0.05, (v) => Math.round(v * 100) + '%')),
          h(Row, { label: '一轮最多评几条', hint: '默认 1 条，别一口气在三个视频下面都留言' }, f.num('bili.maxCommentsPerRound', { min: 1, max: 5 }), h('span', { className: 'ab-muted' }, '条')),
          h(Row, { label: '评论必须有具体内容', hint: '开着就要提到视频里的东西（人名、桥段、字幕里的词），不说「好看」「有意思」这种空话' }, f.sw('bili.anchorRequired')),
          h(Row, { label: '评论至少几个字' }, f.num('bili.commentMinChars', { min: 2, max: 60 }), h('span', { className: 'ab-muted' }, '字')),
          h(Row, { label: '回别人回她的评论' }, f.sw('bili.reply'), h('span', { className: 'ab-muted' }, '每天最多'), f.num('bili.maxRepliesPerDay', { min: 0, max: 100 }), h('span', { className: 'ab-muted' }, '条')),
          h(Row, { label: '看到好玩的分享给你', hint: '私聊发给主人，带视频链接' }, f.sw('bili.shareToOwner')),
          h(Row, { label: '顺手点赞' }, f.sw('bili.like')),
        ),
        h(Card, { title: '她刷过什么', right: h('div', { className: 'ab-flex' },
          h(Btn, { small: true, onClick: act('/bili/replies', 'replies'), disabled: !!busy }, busy === 'replies' ? '正在看…' : '看看有没有人回她'),
          h(Btn, { small: true, kind: 'primary', onClick: act('/bili/run', 'run'), disabled: !!busy }, busy === 'run' ? h(Fragment, null, h('i', { className: 'ab-spin' }), ' 正在刷…') : '现在刷一轮')) },
          s && s.pauseReason ? h('div', { className: 'ab-note warn', style: { marginBottom: 8 } }, '今天先不发评论和回复了：' + s.pauseReason + '（明天自动恢复；Cookie 过期的话重新复制一份填上）') : null,
          s ? h('div', { className: 'ab-muted ab-small', style: { marginBottom: 8 } },
            '今天自动刷了 ' + s.runs + ' 轮 · 评论 ' + s.comments + ' 条（对外可见 ' + (s.commentsVisible || 0) + '，待审 ' + (s.commentsPending || 0) + '） · 回复 ' + s.replies + ' 条' + (s.likes ? ' · 点赞 ' + s.likes + ' 个' : '') + (s.lastRun ? ' · 上次 ' + timeAgo(s.lastRun) : '') + '（手动刷不占次数）') : null,
          s && s.lastError ? h('div', { className: 'ab-small', style: { marginBottom: 8, color: 'var(--ab-warn)' } }, '最近一次失败（' + s.lastError.kind + '）：' + s.lastError.message) : null,
          !s ? h(Empty, { icon: '⏳', text: '加载中…' }) : s.history.length === 0 ? h(Empty, { icon: '📺', text: '还没刷过。点「现在刷一轮」试试。' }) :
            h('div', null,
              h('div', { style: { overflowX: 'auto' } },
                h('table', { className: 'ab-table' },
                  h('thead', null, h('tr', null, ['时间', '做了什么', '视频', '内容'].map((x) => h('th', { key: x }, x)))),
                  h('tbody', null, pg.rows.map((x, i) => h('tr', { key: i },
                    h('td', { className: 'ab-small ab-muted', style: { whiteSpace: 'nowrap' } }, timeAgo(x.at)),
                    h('td', { className: 'ab-small', style: { whiteSpace: 'nowrap' } }, BILI_KIND[x.kind] || x.kind),
                    h('td', null, x.bvid
                      ? h('a', { href: 'https://www.bilibili.com/video/' + x.bvid, target: '_blank', rel: 'noreferrer', title: x.title }, '《' + String(x.title || '').slice(0, 26) + (String(x.title || '').length > 26 ? '…' : '') + '》')
                      : h(Clip, { text: '《' + (x.title || '') + '》', n: 26 })),
                    h('td', null, h(Clip, { text: x.text, n: 46, max: 420 }))))))),
              h(Pager, { page: pg.page, total: pg.total, setPage: pg.setPage, count: pg.count })),
        ),
      )
    }

    function ShotCell({ it, onChanged, toast }) {
      const src = API + '/bili/shot/image?file=' + encodeURIComponent(it.file)
      const cap = (it.title ? '《' + it.title + '》' : '截图') + (it.clock ? '　' + it.clock : '')
      return h('div', { className: 'ab-shot' },
        h('a', { href: src, target: '_blank', rel: 'noreferrer' }, h('img', { src, alt: cap, loading: 'lazy' })),
        h('div', { className: 'cap', title: it.note || '' }, cap),
        h('button', {
          type: 'button',
          className: 'ab-btn sm danger x',
          title: '删除',
          onClick: async () => {
            if (!confirm('删掉这张截图？\n' + cap)) return
            const r = await post('/bili/shot/delete', { file: it.file })
            toast(r.message || '删掉了', r.ok ? 'ok' : 'err')
            onChanged()
          },
        }, '✕'),
      )
    }

    const DOUYIN_KIND = { watch: '看了', look: '点开看', like: '点赞', comment: '评论', share: '分享给你', dm: '回你私信', 'dry:dm': '试运行·私信', 'dry:like': '试运行·点赞', 'dry:comment': '试运行·评论', error: '没成功' }

    /** 抖音：专用浏览器扫码登录、定时刷、点赞 / 评论、在 QQ 上分享给主人，以及她刷过什么。 */
    function Douyin({ draft, setDraft, toast }) {
      const f = useField(draft, setDraft)
      const [s, setS] = useState(null)
      const [busy, setBusy] = useState('')
      const [login, setLogin] = useState(null) // 扫码进行中：{ shot, message }
      // 只读状态：打开这一页不会启动浏览器
      const load = () => get('/douyin/state').then(setS)
      useEffect(() => { load() }, [])
      const act = (path, label, body) => async () => { setBusy(label); const r = await post(path, body); setBusy(''); toast(r.message || (r.ok ? '好了' : '没成功'), r.ok ? 'ok' : 'err'); load() }
      useEffect(() => {
        if (!login) return undefined
        const t = setInterval(async () => {
          const r = await get('/douyin/login/status')
          if (r.loggedIn) { setLogin(null); toast(r.message, 'ok'); load() } else if (r.ok) setLogin(r)
        }, 2500)
        return () => clearInterval(t)
      }, [Boolean(login)])
      const startLogin = async () => {
        setBusy('login')
        const r = await post('/douyin/login')
        setBusy('')
        if (r.loggedIn) { toast(r.message, 'ok'); load() } else if (r.ok) setLogin(r)
        else toast(r.message || '打不开浏览器', 'err')
      }
      const acct = s && s.account
      const acctText = !acct || acct.unknown ? h('span', { className: 'ab-small ab-muted' }, '还没检查过') :
        h('span', { className: 'ab-small', style: { color: acct.loggedIn ? 'var(--ab-ok)' : 'var(--ab-warn)' } },
          acct.loggedIn ? '已登录：' + (acct.nickname || '') : (acct.message || acct.error || '还没登录'),
          acct.at ? h('span', { className: 'ab-muted' }, ' · ' + timeAgo(acct.at) + '查的') : null)
      const caps = (s && s.caps) || {}
      return h('div', { className: 'ab-grid' },
        h(Card, { title: '刷抖音', right: f.sw('douyin.enabled'), desc: '她用一个专用浏览器（独立的登录资料，不碰你平时用的浏览器）刷抖音：定时打开推荐，一个个点开看，读标题、分类、抖音给的内容摘要和热评，再按自己的性格决定点不点赞、评不评论（特别想让你看的会在评论里 @你）、要不要在 QQ 上分享给你、记住什么。你在 QQ 里发抖音链接，她也能点开看完再聊。浏览器窗口放在屏幕外，不抢前台。总开关默认关：先扫码登录，再打开。' },
          h(Row, { label: '抖音账号', hint: '建议用小号。扫一次码就行，登录状态存在专用浏览器里' },
            h('div', null,
              h('div', { className: 'ab-flex' },
                h(Btn, { small: true, kind: 'primary', onClick: startLogin, disabled: !!busy || !!login }, busy === 'login' ? '正在打开浏览器…' : login ? '等你扫码…' : '扫码登录'),
                h(Btn, { small: true, onClick: async () => { setBusy('check'); const r = await get('/douyin/account'); setBusy(''); setS({ ...(s || {}), account: r }) }, disabled: !!busy }, busy === 'check' ? '检查中…' : '检查登录'),
                acctText),
              login ? h('div', { style: { marginTop: 10, display: 'flex', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' } },
                login.shot ? h('img', { src: login.shot, alt: '抖音登录', style: { maxWidth: 360, width: '100%', borderRadius: 10, border: '1px solid var(--ab-line)', background: '#fff' } }) : h('div', { className: 'ab-muted ab-small' }, '二维码还没出来，稍等…'),
                h('div', { className: 'ab-small', style: { flex: 1, minWidth: 160 } },
                  h('div', null, login.message || '用抖音 App 扫码'),
                  h('div', { className: 'ab-flex', style: { marginTop: 8 } },
                    h(Btn, { small: true, onClick: act('/douyin/window', 'win', { visible: true }) }, '显示浏览器窗口'),
                    h(Btn, { small: true, onClick: () => setLogin(null) }, '先不登了')))) : null)),
          h(Row, { label: '浏览器窗口', hint: '遇到验证码、扫码后要短信验证时，挪到屏幕上处理' },
            h('div', { className: 'ab-flex' },
              h(Btn, { small: true, onClick: act('/douyin/window', 'win', { visible: true }), disabled: !!busy }, '显示浏览器窗口'),
              h(Btn, { small: true, onClick: act('/douyin/window', 'win', { visible: false }), disabled: !!busy }, '收起窗口'))),
          h(Row, { label: '浏览器路径', hint: '留空 = 自动找 Edge（找不到再找 Chrome / Chromium）' }, f.text('douyin.browserPath', { size: 'wide', placeholder: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe' })),
        ),
        h(Card, { title: '主人抖音号', desc: '填你的抖音号或主页链接，点「核对」。核对过之后，她刷到特别想让你看的视频，会在评论里真的 @你（用抖音自己的 @ 选人，按你的账号 id 认人，你会收到抖音通知；认不出你就不发，不会发假 @）。改了输入要重新核对。' },
          h(Row, { label: '你的抖音号 / 主页链接' }, f.text('douyin.owner.input', { size: 'wide', placeholder: '抖音号，或 https://www.douyin.com/user/…' })),
          h('div', { className: 'ab-flex', style: { marginTop: 4 } },
            h(Btn, { small: true, kind: 'primary', onClick: act('/douyin/confirm-owner', 'confirm', { input: ((draft.douyin || {}).owner || {}).input || '' }), disabled: !!busy }, busy === 'confirm' ? '核对中…' : '核对'),
            s && s.owner ? h('span', { className: 'ab-small', style: { color: 'var(--ab-ok)' } }, '已核对：' + s.owner.nickname) : h('span', { className: 'ab-small ab-muted' }, '还没核对（不核对就不会 @你）')),
        ),
        h(Card, { title: '抖音私信', desc: '你在抖音上私信她，她会用自己的口气回（只认上面核对过的你，别人的私信不理）。让她找视频的话，她会尝试刷一轮再私信分享给你；这条流程仍需实际环境验证。只在「主动搭话」里设的醒着时间内回。' },
          h(Row, { label: '回你的抖音私信' }, f.sw('douyin.ownerDm')),
          h(Row, { label: '多久看一次' }, f.num('douyin.dmPollMinutes', { min: 1, max: 60 }), h('span', { className: 'ab-muted' }, '分钟'), h(Btn, { small: true, onClick: act('/douyin/dms', 'dms'), disabled: !!busy }, busy === 'dms' ? '正在看…' : '现在看一次')),
        ),
        h(Card, { title: '怎么刷', desc: '只在「主动搭话」里设的醒着时间内自己刷。主人在 QQ 里让她「去刷会儿抖音」也行。' },
          h(Row, { label: '定时自己去刷' }, f.sw('douyin.autoBrowse')),
          h(Row, { label: '多久刷一轮' }, f.range('douyin.intervalHours', 1, 24, 1, (v) => v + ' 小时')),
          h(Row, { label: '每天最多刷' }, f.range('douyin.maxRunsPerDay', 0, 12, 1, (v) => v + ' 轮')),
          h(Row, { label: '一轮看几个' }, f.range('douyin.perRun', 1, 10, 1, (v) => v + ' 个')),
          h(Row, { label: '每天最多看' }, f.num('douyin.maxWatchPerDay', { min: 0, max: 200 }), h('span', { className: 'ab-muted' }, '个（含手动）')),
          h(Row, { label: '每个视频停留', hint: '真的在播放；停得越短越不像真人' }, f.num('douyin.dwellMin', { min: 3 }), h('span', { className: 'ab-muted' }, '～'), f.num('douyin.dwellMax', { min: 3 }), h('span', { className: 'ab-muted' }, '秒')),
          h(Row, { label: '分享到哪', hint: '抖音私信要先在上面核对你的抖音号；没核对或者发不出去时会改发 QQ' }, f.choices('douyin.shareTo', [
            { value: 'douyin', label: '抖音私信', desc: '在抖音里把视频分享给你（只有视频卡片）' },
            { value: 'qq', label: 'QQ 私聊', desc: '她的话 + 视频链接' },
            { value: 'both', label: '两边都发', desc: '抖音里收视频卡片，QQ 上看她说了什么' },
          ])),
          h(Row, { label: '分享给你', hint: '刷到好看的视频，分享给你的积极程度' }, f.choices('douyin.shareBias', [
            { value: 'proactive', label: '积极', desc: '好看有趣就分享' },
            { value: 'normal', label: '适中', desc: '觉得你会喜欢才分享' },
            { value: 'stingy', label: '少分享', desc: '拿不准就不发' },
          ])),
        ),
        h(Card, { title: '每天上限', desc: '刚登录的号前几天上限自动减半（新号猛点赞最容易被风控）。遇到验证码 / 操作频繁当天就停手，看还能看。试运行开着时只记日志不真点。权限在「权限」页单独设（默认仅主人）。' },
          h(Row, { label: '点赞' }, f.num('douyin.caps.like', { min: 0, max: 300 })),
          h(Row, { label: '评论' }, f.num('douyin.caps.comment', { min: 0, max: 30 })),
          h(Row, { label: '分享给你' }, f.num('douyin.caps.share', { min: 0, max: 30 })),
          h(Row, { label: '评论里 @你', hint: '也算在评论次数里' }, f.num('douyin.caps.atOwner', { min: 0, max: 30 })),
          h(Row, { label: '点赞 + 评论合计' }, f.num('douyin.gate.maxWritesPerDay', { min: 1, max: 500 })),
          h(Row, { label: '两次点赞 / 评论间隔' }, f.num('douyin.gate.minWriteGapSec', { min: 0, max: 600 }), h('span', { className: 'ab-muted' }, '秒')),
          h(Row, { label: '新号减半' }, f.num('douyin.gate.newAccountDays', { min: 0, max: 30 }), h('span', { className: 'ab-muted' }, '天')),
        ),
        h(Card, { title: '她刷过什么', right: h('div', { className: 'ab-flex' },
          h(Btn, { small: true, onClick: load }, '刷新'),
          h(Btn, { small: true, kind: 'primary', onClick: act('/douyin/run', 'run'), disabled: !!busy || Boolean(s && s.busy) }, s && s.busy ? h(Fragment, null, h('i', { className: 'ab-spin' }), ' 正在刷…') : '现在刷一轮')) },
          s && s.pauseReason ? h('div', { className: 'ab-note warn', style: { marginBottom: 8 } }, '今天先不点赞评论了：' + s.pauseReason + '。要验证的话点上面「显示浏览器窗口」处理，明天自动恢复。') : null,
          s ? h('div', { className: 'ab-muted ab-small', style: { marginBottom: 8 } },
            '今天自动刷了 ' + s.runs + ' 轮 · 看了 ' + s.watched + ' · 赞 ' + s.like + '/' + caps.like + ' · 评 ' + s.comment + '/' + caps.comment + ' · 分享 ' + s.share + '/' + caps.share + (s.atOwner ? ' · @你 ' + s.atOwner + '/' + caps.atOwner : '') +
            (s.newAccount ? '（新号，上限减半）' : '') +
            (s.lastRun ? ' · 上次 ' + timeAgo(s.lastRun) : '') +
            (s.lastSkipReason ? ' · 上次没刷成：' + s.lastSkipReason : '')) : null,
          !s ? h(Empty, { icon: '⏳', text: '加载中…' }) : s.history.length === 0 ? h(Empty, { icon: '📱', text: '还没刷过。先扫码登录、打开开关，再点「现在刷一轮」。' }) :
            h('div', { className: 'ab-list' }, s.history.map((x, i) => h('div', { key: i, className: 'ab-li' },
              h('div', { className: 'meta' }, timeAgo(x.at), h('br'), DOUYIN_KIND[x.kind] || x.kind),
              h('div', { className: 'body' },
                x.awemeId ? h('a', { href: 'https://www.douyin.com/video/' + x.awemeId, target: '_blank', rel: 'noreferrer' }, x.title || (x.author ? x.author + ' 的视频' : x.awemeId)) : null,
                x.author && x.title ? h('span', { className: 'ab-muted' }, ' · ' + x.author) : null,
                x.text ? h('div', { className: 'ab-muted' }, (x.atOwner ? '@你 ' : '') + (x.via ? '（' + x.via.map((w) => (w === 'douyin' ? '抖音私信' : 'QQ')).join(' + ') + '）' : '') + x.text) : null)))),
        ),
      )
    }


    const HEYBOX_KIND = { browse: '逛了一圈', like: '点了赞', comment: '发了评论', post: '发了帖', delete: '删了帖' }


    /** 「小黑盒」页：账号、逛法、额度、热榜预览、发帖分区与自检提醒、逛过什么。 */
    function Heybox({ draft, setDraft, toast }) {
      const f = useField(draft, setDraft)
      const [s, setS] = useState(null)
      const [busy, setBusy] = useState('')
      const [hot, setHot] = useState(null)
      const [cookieText, setCookieText] = useState('')
      const load = () => get('/heybox/state').then(setS)
      useEffect(() => { load() }, [])
      const act = (path, label, body) => async () => {
        setBusy(label)
        const r = await post(path, body)
        setBusy('')
        toast(r.message || (r.ok ? '好了' : '没成功'), r.ok === false ? 'err' : 'ok')
        load()
      }
      const checkAccount = async () => {
        setBusy('account')
        const r = await get('/heybox/account')
        setBusy('')
        toast(r.message || (r.loggedIn ? '已登录：' + (r.nickname || '') : '没登录'), r.loggedIn ? 'ok' : 'err')
        load()
      }
      const loadHot = async () => {
        setBusy('hot')
        const r = await post('/heybox/hot')
        setBusy('')
        if (r.ok === false) { toast(r.message || '拉不到热榜', 'err'); return }
        setHot(r)
        load()
      }
      const saveCookie = async () => {
        if (!cookieText.trim()) { toast('先把 Cookie 粘进来', 'err'); return }
        setBusy('cookie')
        const r = await post('/heybox/login-cookie', { cookie: cookieText })
        setBusy('')
        toast(r.message || (r.ok ? '存好了' : '没成功'), r.ok === false ? 'err' : 'ok')
        if (r.ok) setCookieText('')
        load()
      }
      const acct = s && s.account
      const acctText = !acct || !acct.checkedAt ? h('span', { className: 'ab-small ab-muted' }, '还没检查过') :
        h('span', { className: 'ab-small', style: { color: acct.loggedIn ? 'var(--ab-ok)' : 'var(--ab-warn)' } },
          acct.loggedIn ? '已登录：' + (acct.nickname || '') + (acct.heyboxId ? '（id ' + acct.heyboxId + '）' : '') : (acct.message || '还没登录'),
          acct.checkedAt ? h('span', { className: 'ab-muted' }, ' · ' + timeAgo(acct.checkedAt) + '查的') : null)
      const quota = (s && s.quota) || {}
      const left = (s && s.left) || {}
      const limits = (s && s.limits) || {}
      return h('div', { className: 'ab-grid' },
        h(Card, {
          title: '刷小黑盒', right: f.sw('heybox.enabled'),
          desc: '用你的小黑盒账号逛游戏社区：定时看信息流、读帖子正文和热评，按性格决定点不点赞、评不评论；她自己会写帖子（先看热榜找角度，再看社区高赞帖在聊什么，配图走小黑盒图床），发完把链接报给你。写操作各有权限（「权限」页，默认仅主人），每天有额度上限。',
        },
          h(Row, { label: '小黑盒账号', hint: '从浏览器登录后把整串 Cookie 粘到下面。pkey 必须有；想让它能点赞评论发帖，还要有 x_xhh_tokenid（F12 → Application → Cookies 里能复制到）' },
            h('div', null,
              h('div', { className: 'ab-flex' },
                h(Btn, { small: true, onClick: checkAccount, disabled: !!busy }, busy === 'account' ? '检查中…' : '检查登录'),
                acctText),
              h('div', { style: { marginTop: 10, display: 'flex', gap: 8, alignItems: 'flex-start', flexWrap: 'wrap' } },
                h('textarea', {
                  className: 'ab-input', rows: 3, spellCheck: false,
                  style: { flex: 1, minWidth: 260, fontFamily: 'monospace', fontSize: 12 },
                  placeholder: 'pkey=…; heybox_id=…; x_xhh_tokenid=…',
                  value: cookieText, onChange: (e) => setCookieText(e.target.value),
                }),
                h(Btn, { small: true, kind: 'primary', onClick: saveCookie, disabled: !!busy }, busy === 'cookie' ? '保存中…' : '保存 Cookie')),
              s && s.hasCookie
                ? h('div', { className: 'ab-small', style: { marginTop: 6, color: s.hasToken ? 'var(--ab-ok)' : 'var(--ab-warn)' } },
                  s.hasToken ? '✓ 有 pkey 和 x_xhh_tokenid，读写都能用' : '⚠ 只有 pkey，没有 x_xhh_tokenid：点赞 / 评论 / 发帖大概率会被拒')
                : null)),
        ),
        h(Card, {
          title: '她的逛法', desc: '只在「主动搭话」里设的醒着时间内自己逛。主人在 QQ 里让她「去逛逛小黑盒」也行。逛是只读的，不会乱点赞评论。',
        },
          h(Row, { label: '定时自己去逛' }, f.sw('heybox.autoBrowse')),
          h(Row, { label: '多久逛一圈' }, f.range('heybox.intervalHours', 1, 24, 1, (v) => v + ' 小时')),
          h(Row, { label: '一圈看几条' }, f.range('heybox.perRun', 1, 10, 1, (v) => v + ' 条')),
          h(Row, { label: '每天最多逛' }, f.range('heybox.maxRunsPerDay', 0, 12, 1, (v) => v + ' 轮')),
        ),
        h(Card, {
          title: '每天上限',
          desc: '小黑盒的帖详情和搜索接口查太勤会弹验证码（还可能连坐浏览器登录态），所以额度别设太大。搜索被挡时她会自动降级去翻信息流，不会反复硬试。',
        },
          h(Row, { label: '点赞' }, f.num('heybox.likeDaily', { min: 0, max: 60 }), h('span', { className: 'ab-muted' }, '次/天')),
          h(Row, { label: '评论' }, f.num('heybox.commentDaily', { min: 0, max: 30 }), h('span', { className: 'ab-muted' }, '条/天')),
          h(Row, { label: '发帖' }, f.num('heybox.maxPostsPerDay', { min: 0, max: 5 }), h('span', { className: 'ab-muted' }, '篇/天（建议别超过 3）')),
          h(Row, { label: '发帖风格', hint: '她写帖时按这个口吻来。也可以让她单次换：跟她说「用日记风格发一篇」' },
            f.select('heybox.postStyle', [
              { value: 'diary', label: '哈洛日记', desc: '第一人称随手记，跟空间日记一个味，120-300字' },
              { value: 'news', label: '热搜文', desc: '报道新闻体，摆具体数字，200-800字' },
              { value: 'mix', label: '哈洛热搜', desc: '用日记口吻写热搜，150-500字' },
            ], { width: 220 })),
          h(Row, { label: '发帖默认分区', hint: '文章帖必须挂分区，否则会报「请添加分区」。这三个是实测存在的' },
            f.select('heybox.defaultTopic', [
              { value: 7214, label: '盒友杂谈', desc: '最常用，什么都能聊' },
              { value: 18745, label: '数码硬件', desc: '显卡、笔记本、外设' },
              { value: 806933, label: 'AI', desc: 'AI 相关，容易涨浏览' },
            ], { width: 200 })),
          s ? h(Row, { label: '今天已经用掉', hint: '到 0 就等明天，或者手动清零（重启一次会话不会重置）' },
            h('div', { className: 'ab-flex' },
              h('span', { className: 'ab-small ab-muted' },
                '逛 ' + (quota.browse || 0) + '/' + (limits.maxRunsPerDay || 0) +
                ' · 赞 ' + (quota.like || 0) + '/' + (limits.likeDaily || 0) +
                ' · 评 ' + (quota.comment || 0) + '/' + (limits.commentDaily || 0) +
                ' · 帖 ' + (quota.post || 0) + '/' + (limits.maxPostsPerDay || 0)),
              h(Btn, { small: true, kind: 'ghost', onClick: act('/heybox/clear-quota', 'quota') }, busy === 'quota' ? '清零中…' : '清零')))
            : null,
        ),
        h(Card, {
          title: '热榜预览', right: h('div', { className: 'ab-flex' },
            h(Btn, { small: true, onClick: load }, '刷新'),
            h(Btn, { small: true, kind: 'primary', onClick: loadHot, disabled: !!busy }, busy === 'hot' ? '拉取中…' : '看热榜')),
          desc: '她写帖前会先看这个（热榜 → 搜社区 → 找具体素材）。这里只是让你看看现在有什么题，热榜里电竞和商业新闻不适合这个号。',
        },
          !hot ? h(Empty, { icon: '🔥', text: '点右上角「看热榜」，看看现在小黑盒在热议什么。' })
            : (hot.list || []).length === 0 ? h(Empty, { icon: '🔥', text: '热榜是空的，可能接口变了。' })
            : h('div', { className: 'ab-list' }, (hot.list || []).map((x, i) => h('div', { key: i, className: 'ab-li' },
              h('div', { className: 'meta' }, String(i + 1)), h('div', { className: 'body' }, x.text, x.tag ? h('span', { className: 'ab-muted' }, '  [' + x.tag + ']') : null)))),
        ),
        h(Card, {
          title: '发帖自检（她发之前自己过一遍）',
          desc: '这几条写在她的规则里，不满足就不发。你也可以照着看，她要发的帖哪条对不上就让改。',
        },
          h('div', { className: 'ab-note', style: { marginBottom: 8, whiteSpace: 'pre-line' } },
            [
              '① 先看热榜挑题（不许跳过），挑不出来就说今天没合适的，别硬凑。',
              '② 再看社区高赞帖在聊什么角度，可以借角度但用自己的话。',
              '③ 素材里必须有具体的东西：价格、销量、时长、机制名、star 增速——没具体信息就是水文。',
              '④ 标题别和正文第一行重复；不编造第一人称经历；正文 200-800 字；配图越多越好。',
              '⑤ 不碰政治、医疗法律建议、评价真人、判断价格是否合理；读一遍像不像人话（转折词堆砌就是 AI 腔）。',
            ].join('\n')),
          h('div', { className: 'ab-note warn' },
            '格式上的坑（已修在内核里）：帖子类型必须是「文章」(link_tag=11) 才能解析 HTML 并把图插在文字中间；分区 id 必须是真实存在的 7214 / 18745 / 806933，乱填会一直报「错误的帖子类型」。'),
        ),
        h(Card, {
          title: '她逛过什么', right: h('div', { className: 'ab-flex' },
            h(Btn, { small: true, onClick: load }, '刷新'),
            h(Btn, { small: true, kind: 'primary', onClick: act('/heybox/run', 'run'), disabled: !!busy }, busy === 'run' ? '正在逛…' : '现在逛一圈')),
        },
          s && s.lastSkipReason ? h('div', { className: 'ab-note warn', style: { marginBottom: 8 } }, '上次没逛成：' + s.lastSkipReason) : null,
          s ? h('div', { className: 'ab-muted ab-small', style: { marginBottom: 8 } },
            s.lastRun ? '上次逛：' + timeAgo(s.lastRun) : '还没逛过') : null,
          !s ? h(Empty, { icon: '⏳', text: '加载中…' })
            : (s.history || []).length === 0 ? h(Empty, { icon: '📭', text: '还没逛过。先填 Cookie、打开开关，再点「现在逛一圈」。' })
            : h('div', { className: 'ab-list' }, (s.history || []).map((x, i) => h('div', { key: i, className: 'ab-li' },
              h('div', { className: 'meta' }, timeAgo(x.at), h('br'), HEYBOX_KIND[x.kind] || x.kind),
              h('div', { className: 'body' },
                x.linkId ? h('a', { href: 'https://www.xiaoheihe.cn/app/bbs/link/' + x.linkId, target: '_blank', rel: 'noreferrer' }, x.title || x.linkId) : null,
                x.text ? h('div', { className: 'ab-muted' }, x.text) : null,
                x.count ? h('div', { className: 'ab-muted' }, '看了 ' + x.count + ' 条') : null)))),
        ),
      )
    }

    /** 「她的画作」：读存图目录里最近的 N 张，可以单张删除、开文件夹。 */
    function PaintGallery({ draft, setDraft, toast }) {
      const f = useField(draft, setDraft)
      const shown = Math.min(50, Math.max(1, Number(draft.imageGen && draft.imageGen.galleryShown) || 20))
      const [data, setData] = useState(null)
      const load = async () => {
        const r = await get('/image/gallery?limit=' + shown).catch(() => null)
        setData(r && r.ok ? r : { items: [], total: 0, dir: '' })
      }
      useEffect(() => { load() }, [shown])
      const del = async (file) => {
        if (!confirm('删掉这张画？\n' + file)) return
        const r = await post('/image/gallery/delete', { file }).catch(() => ({ ok: false }))
        toast(r.message || (r.ok ? '删掉了' : '删除失败'), r.ok ? 'ok' : 'err')
        load()
      }
      return h(Card, {
        title: '她的画作' + (data ? '（显示最近 ' + data.items.length + ' 张 / 共 ' + data.total + ' 张）' : ''),
        desc: '她画过的图都存在本机（不会自动删），这里只是面板里显示多少张。想看全部或者清理，点「打开文件夹」。',
        right: h('div', { className: 'ab-flex' },
          h(Btn, { small: true, kind: 'ghost', onClick: load }, '刷新'),
          h(Btn, { small: true, kind: 'ghost', onClick: () => post('/image/open-folder').then((r) => toast(r.message, r.ok ? 'ok' : 'err')).catch(() => toast('打不开文件夹', 'err')) }, '打开文件夹')),
      },
        h(Row, { label: '面板显示最近', hint: '最多 50 张；只影响面板显示，不删文件' },
          f.num('imageGen.galleryShown', { min: 1, max: 50 }), h('span', { className: 'ab-muted' }, '张')),
        data && data.dir ? h('div', { className: 'ab-muted ab-small', style: { margin: '4px 0 8px', wordBreak: 'break-all' } }, '存图目录：' + data.dir) : null,
        !data ? h(Empty, { icon: '⏳', text: '加载中…' })
          : data.items.length === 0 ? h(Empty, { icon: '🎨', text: '她还没画过图。在聊天里说「画一张……」，画好的图会出现在这里。' })
            : h('div', { className: 'ab-shots' }, data.items.map((it) => h(PaintCell, { key: it.file, it, onDelete: () => del(it.file) }))),
      )
    }

    function PaintCell({ it, onDelete }) {
      const src = API + '/image/gallery/image?file=' + encodeURIComponent(it.file)
      const cap = it.prompt ? '「' + it.prompt + '」' : '画作'
      const when = it.at ? timeAgo(it.at) : ''
      return h('div', { className: 'ab-shot' },
        h('a', { href: src, target: '_blank', rel: 'noreferrer' }, h('img', { src, alt: cap, loading: 'lazy' })),
        h('div', { className: 'cap', title: cap }, cap + (when ? '　' + when : '')),
        h('button', { type: 'button', className: 'ab-btn sm danger x', title: '删除', onClick: onDelete }, '✕'),
      )
    }

    function ImageGen({ draft, setDraft, toast }) {
      const f = useField(draft, setDraft)
      const c = draft.imageGen
      const custom = c.custom || {}
      const isCustom = c.provider === 'custom'
      const isZhipu = c.provider === 'zhipu'
      const [trying, setTrying] = useState(false)
      const [shot, setShot] = useState(null)
      const tryDraw = async () => {
        setTrying(true)
        setShot(null)
        try { setShot(await post('/image/test', {})) } catch (e) { setShot({ ok: false, message: e.message || '试画失败' }) } finally { setTrying(false) }
      }
      // 智谱的模型和尺寸：面板里选，特殊值也留着不丢
      const zpPresets = [
        { value: 'cogview-4', label: 'cogview-4', desc: '0.06 元/张，通用' },
        { value: 'glm-image', label: 'glm-image', desc: '0.1 元/张，擅长文字、海报' },
        { value: 'cogview-3-flash', label: 'cogview-3-flash', desc: '便宜、快' },
      ]
      const zpModels = c.model && !zpPresets.some((m) => m.value === c.model) ? zpPresets.concat([{ value: c.model, label: c.model, desc: '自定义模型' }]) : zpPresets
      const zpSizeOpts = [
        { value: '1024x1024', label: '1024 × 1024', desc: '方图' },
        { value: '768x1344', label: '768 × 1344', desc: '竖图 9:16' },
        { value: '864x1152', label: '864 × 1152', desc: '竖图 3:4' },
        { value: '1344x768', label: '1344 × 768', desc: '横图 16:9' },
        { value: '1152x864', label: '1152 × 864', desc: '横图 4:3' },
        { value: '1440x720', label: '1440 × 720', desc: '宽幅 2:1' },
        { value: '720x1440', label: '720 × 1440', desc: '长图 1:2' },
      ]
      const isPost = custom.method === 'POST'
      const params = Array.isArray(custom.params) ? custom.params : []
      const setParams = (next) => setDraft(setPath(draft, 'imageGen.custom.params', next))
      const setP = (i, k, v) => setParams(params.map((p, j) => (j === i ? { ...p, [k]: v } : p)))
      return h('div', { className: 'ab-grid' },
        h(Card, { title: '让她画图', right: f.sw('imageGen.enabled'), desc: '接上生图服务后，让她「画一张……」就会画好发出来。智谱 BigModel 填 Key 就能画；想接别的服务就用自定义接口。本机 SD WebUI / ComfyUI 可以在「本地接口」页接「生图」。' },
          h(Row, { label: '接口格式', hint: '智谱填 Key 就能画；自定义适合别的服务，或 pollinations 这类「GET 一个地址就出图」的接口' },
            h(Seg, {
              value: isCustom ? 'custom' : 'zhipu',
              onChange: (v) => setDraft(setPath(draft, 'imageGen.provider', v)),
              options: [{ value: 'zhipu', label: '智谱 BigModel' }, { value: 'custom', label: '自定义接口' }],
            })),
          isCustom ? h('div', null,
            h(Row, { label: '请求方式', hint: 'GET 把参数都拼在地址上；POST 放进请求体' },
              h(Seg, {
                value: isPost ? 'POST' : 'GET',
                onChange: (v) => setDraft(setPath(draft, 'imageGen.custom.method', v)),
                options: [{ value: 'GET', label: 'GET' }, { value: 'POST', label: 'POST' }],
              })),
            h(Row, { label: '接口地址', hint: '可以用 {prompt} {model} {size} {width} {height}' },
              f.text('imageGen.custom.url', { size: 'wide', placeholder: 'https://image.pollinations.ai/prompt/{prompt}' })),
            h(Row, { label: 'API Key', hint: '会以 Authorization: Bearer 发出；不需要就留空' },
              f.text('imageGen.apiKey', { type: 'password', placeholder: c.apiKeySet ? '已保存（不改就留空）' : '没有就留空' })),
            h('div', { className: 'ab-label', style: { marginTop: 12 } },
              h('b', null, isPost ? '参数（备用）' : 'URL 参数'),
              h('small', null, isPost ? '只有上面的「请求体」留空时，才用这里的参数拼成请求体' : '参数名和值都自己填；值里可以用 {prompt}')),
            params.length
              ? params.map((p, i) => h('div', { key: i, className: 'ab-flex', style: { gap: 6, marginBottom: 6 } },
                h('input', { className: 'ab-input', style: { width: 170 }, value: p.key || '', placeholder: '参数名，如 model', onChange: (e) => setP(i, 'key', e.target.value) }),
                h('input', { className: 'ab-input', style: { flex: 1 }, value: p.value || '', placeholder: '值，可以用 {prompt}', onChange: (e) => setP(i, 'value', e.target.value) }),
                h(Btn, { small: true, onClick: () => setParams(params.filter((_, j) => j !== i)) }, '删')))
              : h('div', { className: 'ab-muted ab-small', style: { marginBottom: 6 } }, '还没有参数 —— 比如 model=flux-anime、width=1080、height=1920、nologo=true'),
            h('div', { className: 'ab-flex', style: { marginBottom: 10 } },
              h(Btn, { small: true, onClick: () => setParams([...params, { key: '', value: '' }]) }, '＋ 加一个参数')),
            isPost ? h('div', { style: { marginTop: 6 } },
              h('div', { className: 'ab-label' }, h('b', null, '请求体（可选）'), h('small', null, '填了就用这段原文当 body，上面的参数表只在 GET 时拼 URL；可以用 {prompt} {model} {size} {width} {height}')),
              h('div', { style: { margin: '6px 0 4px' } },
                f.area('imageGen.custom.body', { rows: 5, placeholder: '例如：{"model":"{model}","prompt":"{prompt}","size":"{size}"}' }))) : null,
            isPost ? h(Row, { label: '请求体格式' },
              h(Seg, {
                value: custom.bodyType === 'form' ? 'form' : 'json',
                onChange: (v) => setDraft(setPath(draft, 'imageGen.custom.bodyType', v)),
                options: [{ value: 'json', label: 'JSON' }, { value: 'form', label: '表单' }],
              })) : null,
            h(Row, { label: '取值路径', hint: '接口直接回图片就留空；回 JSON 时填地址字段' },
              f.text('imageGen.custom.responsePath', { size: 'wide', placeholder: '如 data.0.url（留空自动找）' })),
          ) : isZhipu ? h('div', null,
            h(Row, { label: 'API Key', hint: '在 bigmodel.cn → API Key 里拿，只存在本机' },
              f.text('imageGen.apiKey', { type: 'password', placeholder: c.apiKeySet ? '已保存（不改就留空）' : '填智谱的 API Key' })),
            h(Row, { label: '模型', hint: 'cogview-4 通用；glm-image 更会写字、做海报；cogview-3-flash 最便宜' },
              f.select('imageGen.model', zpModels, { width: 240 })),
            h(Row, { label: '图片尺寸', hint: '智谱只认这几种；选了别的会按比例就近换' },
              f.select('imageGen.size', zpSizeOpts, { width: 220 })),
            h('div', { className: 'ab-note', style: { marginTop: 10 } },
              '接口地址固定为 https://open.bigmodel.cn/api/paas/v4/images/generations，不用填。Key 申请：bigmodel.cn/usercenter/proj-mgmt/apikeys。如果「本地接口 → 生图」也开着，会优先用本地那个脚本。'),
            h('div', { className: 'ab-flex', style: { gap: 10, marginTop: 10, alignItems: 'center' } },
              h(Btn, { small: true, disabled: trying, onClick: tryDraw }, trying ? '正在画…' : '试画一张（花一次额度）'),
              shot && !shot.ok ? h('span', { className: 'ab-small', style: { color: 'var(--ab-err)' } }, shot.message)
                : shot && shot.ok ? h('span', { className: 'ab-small', style: { color: 'var(--ab-ok)' } }, '画好了 · ' + shot.kb + ' KB · ' + (shot.ms / 1000).toFixed(1) + ' 秒') : null),
            shot && shot.dataUrl ? h('img', { src: shot.dataUrl, style: { maxWidth: 220, borderRadius: 10, marginTop: 8, border: '1px solid var(--ab-line)' } }) : null,
          ) : null,
          h(Row, { label: '默认构图', hint: isZhipu ? '聊天时她可以按需要选构图；智谱会按比例换成最接近的官方尺寸' : '聊天工具可指定本次构图。服务不支持所选尺寸时会报告失败，请换一种构图；自定义接口需使用尺寸占位符' },
            f.select('imageGen.shape', [
              { value: 'her', label: '让她选择', desc: '未指定时沿用图片尺寸' },
              { value: 'square', label: '方图 1:1（1024 × 1024）' },
              { value: 'portrait', label: '竖图 2:3（1024 × 1536）' },
              { value: 'landscape', label: '横图 3:2（1536 × 1024）' },
              { value: 'wide', label: '宽幅 16:9（1536 × 864）' },
            ], { width: 260 })),
          !isZhipu && (!c.shape || c.shape === 'her') ? h(Row, { label: '图片尺寸', hint: isCustom ? '接口地址 / 参数里可以用 {size} 或 {width}/{height}' : '未指定构图时沿用这个尺寸' },
            f.select('imageGen.size', [{ value: '1024x1024', label: '1024 × 1024', desc: '方图' }, { value: '768x1024', label: '768 × 1024', desc: '竖图' }, { value: '1024x768', label: '1024 × 768', desc: '横图' }, { value: '512x512', label: '512 × 512', desc: '小图，更快' }], { width: 200 })) : null,
          h(Row, { label: '固定风格', hint: '每次画都会加在描述前面' }, f.text('imageGen.stylePrompt', { size: 'wide', placeholder: '例如：日系二次元，柔和光线，蓝白配色' })),
          h(Row, { label: '只给主人画', hint: '关掉后群友也能让她画（会花你的额度）' }, f.sw('imageGen.ownerOnly')),
          h(Row, { label: '让她画完自己看一眼', hint: '开着才把画好的图传给她看（模型不支持看图时自动不传）；关掉就只回一句「画好了」，不传图' }, f.sw('imageGen.seeOwn')),
          isCustom ? h('div', { className: 'ab-note', style: { marginTop: 10 } }, '例子：地址填 https://image.pollinations.ai/prompt/{prompt}，再加 model=flux-anime、width=1080、height=1920、nologo=true 四个参数，GET 就会请求 …/prompt/<提示词>?model=flux-anime&width=1080&…') : null,
          !c.enabled ? h('div', { className: 'ab-note', style: { marginTop: 10 } }, '还没开启。填好接口信息、打开右上角开关并保存后，她就会多一个「画图」能力。') : null,
        ),
        h(PaintGallery, { draft, setDraft, toast }),
      )
    }

    // ---------------- 统计 ----------------
    /** token 说人话：1.2 万 / 3.4 亿。 */
    const fmtTok = (n) => {
      const v = Number(n) || 0
      return v >= 1e8 ? (v / 1e8).toFixed(2) + ' 亿' : v >= 1e4 ? (v / 1e4).toFixed(1) + ' 万' : String(Math.round(v))
    }
    const dayShort = (d) => String(d || '').slice(5)

    /** 长文本：超过 n 个字截断，鼠标悬停看全文 */
    const Clip = ({ text, n = 50, max = 320 }) => {
      const t = String(text == null ? '' : text)
      if (!t) return null
      return h('span', { className: 'ab-clip', style: { maxWidth: max }, title: t.length > n ? t : '' }, t.length > n ? t.slice(0, n) + '…' : t)
    }

    /** 表格分页：默认一页 10 条 */
    function usePager(all, size = 10) {
      const [page, setPage] = useState(0)
      const list = all || []
      const total = Math.max(1, Math.ceil(list.length / size))
      const cur = Math.min(page, total - 1)
      return { rows: list.slice(cur * size, cur * size + size), page: cur, total, setPage, count: list.length }
    }

    function Pager({ page, total, setPage, count }) {
      if (total <= 1) return null
      const b = (label, to, dis) => h('button', { type: 'button', className: 'ab-btn sm ghost', disabled: !!dis, onClick: () => setPage(to) }, label)
      return h('div', { className: 'ab-pager' },
        h('span', { className: 'ab-muted ab-small' }, '共 ' + count + ' 条'),
        b('‹ 上一页', page - 1, page <= 0),
        h('span', { className: 'ab-small' }, (page + 1) + ' / ' + total),
        b('下一页 ›', page + 1, page >= total - 1))
    }
    /** 这条 QQ 会话是什么类型。 */
    const chatKind = (c) => {
      const id = String(c.chatId || '')
      return id.startsWith('system:') ? '系统' : id.startsWith('group:') ? '群聊' : '私聊'
    }

    function Stats() {
      const [days, setDays] = useState(7)
      const [data, setData] = useState(null)
      useEffect(() => { get('/stats?days=' + days).then((r) => setData(r.ok ? r : { error: r.message || '读不到统计数据' })) }, [days])
      const rows = (data && data.days) || []
      const peak = Math.max(1, ...rows.map((d) => Math.max(d.received || 0, d.sent || 0)))
      const totals = (data && data.totals) || {}
      const chats = (data && data.chats) || []
      const pgc = usePager(chats)
      const pgd = usePager(rows.slice().reverse())
      const many = rows.length > 10
      const bar = (v, strong) => h('div', {
        style: { flex: '1 1 0', minWidth: 2, maxWidth: many ? 6 : 9, height: Math.max(2, Math.round(92 * (v || 0) / peak)), borderRadius: 2, background: 'var(--ab-sea)', opacity: strong ? 1 : 0.4 },
      })
      return h('div', { className: 'ab-grid' },
        h(Card, { title: '消息统计', desc: '按自然日（本机时区）记收到、发出多少条。数据在数据目录的 stats.json，最多留 30 天。',
          right: h(Seg, { value: String(days), onChange: (v) => setDays(Number(v)), options: [{ value: '7', label: '近 7 天' }, { value: '30', label: '近 30 天' }] }) },
          !data ? h(Empty, { icon: '⏳', text: '加载中…' }) : data.error ? h(Empty, { text: data.error }) : h('div', null,
            h('div', { className: 'ab-metrics', style: { marginBottom: 14 } },
              h('div', { className: 'ab-metric' }, h('div', { className: 'n' }, String(totals.received || 0)), h('div', { className: 'l' }, '收到')),
              h('div', { className: 'ab-metric' }, h('div', { className: 'n' }, String(totals.sent || 0)), h('div', { className: 'l' }, '发出')),
              h('div', { className: 'ab-metric' }, h('div', { className: 'n' }, String(data.active || 0)), h('div', { className: 'l' }, '有消息的天')),
              h('div', { className: 'ab-metric' }, h('div', { className: 'n' }, String(totals.stickers || 0)), h('div', { className: 'l' }, '表情'))),
            h('div', { style: { display: 'flex', alignItems: 'flex-end', gap: many ? 2 : 7, height: 120, width: '100%', overflow: 'hidden' } },
              rows.map((d, i) => h('div', { key: d.day, style: { flex: '1 1 0', minWidth: 0, height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', gap: 4 }, title: `${d.day}：收到 ${d.received} · 发出 ${d.sent} · 出错 ${d.errors}` },
                h('div', { style: { display: 'flex', alignItems: 'flex-end', justifyContent: 'center', gap: 2, height: 92, width: '100%' } }, bar(d.received, true), bar(d.sent, false)),
                h('div', { className: 'ab-muted', style: { fontSize: 10, lineHeight: '10px', whiteSpace: 'nowrap' } }, many && i % 5 !== 0 && i !== rows.length - 1 ? '' : dayShort(d.day))))),
            h('div', { className: 'ab-muted ab-small', style: { marginTop: 6 } },
              h('i', { className: 'ab-dot ok', style: { background: 'var(--ab-sea)' } }), ' 收到  ',
              h('i', { className: 'ab-dot', style: { background: 'var(--ab-sea)', opacity: 0.4 } }), ' 发出'),
            h('div', { style: { marginTop: 16 } }, pgd.rows.map((d) => h('div', { key: d.day, className: 'ab-row', style: { padding: '5px 0', borderTop: '1px solid var(--ab-line)' } },
              h('span', { style: { minWidth: 92 } }, d.day),
              h('span', { className: 'ab-muted ab-small', style: { flex: 1 } }, `收 ${d.received} · 发 ${d.sent}` + (d.stickers ? ` · 表情 ${d.stickers}` : '') + (d.voice ? ` · 语音 ${d.voice}` : '') + (d.asr ? ` · 识别 ${d.asr}` : '') + (d.song ? ` · 翻唱 ${d.song}` : '') + (d.image ? ` · 生图 ${d.image}` : '') + (d.errors ? ` · 出错 ${d.errors}` : ''))))),
            h(Pager, { page: pgd.page, total: pgd.total, setPage: pgd.setPage, count: pgd.count }),
          )),
        h(Card, { title: '按会话', desc: '今天的收发，加上这条会话至今累计的 token（含缓存部分，所以数字看着大）；还没用过模型的显示 —。' },
          !data ? h(Empty, { icon: '⏳', text: '加载中…' }) : chats.length === 0 ? h(Empty, { icon: '💬', text: '还没有任何 QQ 会话' }) :
            h('div', { style: { overflowX: 'auto' } },
              h('table', { className: 'ab-table' },
                h('thead', null, h('tr', null, ['会话', '类型', '今天（收 / 发）', '累计 token', '缓存命中', '建于'].map((x) => h('th', { key: x }, x)))),
                h('tbody', null, pgc.rows.map((c) => {
                  const t = c.tokens
                  const billed = t ? t.uncached + t.cacheRead + t.cacheWrite : 0
                  const hit = t && billed > 0 ? Math.round((t.cacheRead / billed) * 100) : null
                  const today = c.today || {}
                  return h('tr', { key: c.chatId },
                    h('td', null,
                      h('div', { style: { fontWeight: 500 } }, c.title || c.chatId),
                      h('div', { className: 'ab-muted ab-small' }, c.chatId)),
                    h('td', { className: 'ab-small' }, chatKind(c)),
                    h('td', { className: 'ab-small' }, `${today.received || 0} / ${today.sent || 0}`),
                    h('td', { className: 'ab-small' }, t ? fmtTok(billed + t.output) : h('span', { className: 'ab-muted' }, '—')),
                    h('td', { className: 'ab-small' }, hit !== null ? hit + '%' : h('span', { className: 'ab-muted' }, '—')),
                    h('td', { className: 'ab-small ab-muted' }, c.bornDay || '—'))
                })))),
              h(Pager, { page: pgc.page, total: pgc.total, setPage: pgc.setPage, count: pgc.count })))
    }

    // ---------------- 会话管理 ----------------
    /** 每条 QQ 会话对应的 DSH 会话（重置、归档都在这）。 */
    function Sessions({ toast, reload }) {
      const [data, setData] = useState(null)
      const [busy, setBusy] = useState('')
      const load = () => get('/sessions/list').then((r) => setData(r.ok ? r : { list: [], error: r.message }))
      useEffect(() => { load() }, [])
      const reset = async (c) => {
        if (!window.confirm(`让「${c.title}」重新开始？\n\n现在的会话会归档（侧栏「归档」里还能找回），下一条消息会开一个新会话。`)) return
        setBusy(c.chatId)
        const r = await post('/sessions/reset-one', { chatId: c.chatId })
        setBusy('')
        toast(r.message, r.ok ? 'ok' : 'err')
        if (r.ok) { await load(); reload && reload() }
      }
      const copy = async (text) => {
        try { await navigator.clipboard.writeText(text); toast('复制了：' + text) } catch (e) { toast('复制失败，手动选中吧：' + text) }
      }
      const list = (data && data.list) || []
      const pg = usePager(list)
      const cells = pg.rows.map((c) => {
        const t = c.tokens
        const billed = t ? t.uncached + t.cacheRead + t.cacheWrite : 0
        const used = billed + (t ? t.output : 0)
        const hit = t && billed > 0 ? Math.round((t.cacheRead / billed) * 100) : null
        const today = c.today || {}
        const n = (today.received || 0) + (today.sent || 0)
        return h('tr', { key: c.chatId },
          h('td', null,
            h('div', { style: { fontWeight: 500 } }, c.title || c.chatId),
            h('div', { className: 'ab-muted ab-small' }, c.model ? '模型 ' + String(c.model).split('::').pop() : '跟随默认模型')),
          h('td', { className: 'ab-small' }, chatKind(c)),
          h('td', { className: 'ab-small' }, n ? `收 ${today.received || 0} · 发 ${today.sent || 0}` : h('span', { className: 'ab-muted' }, '—')),
          h('td', { className: 'ab-small' }, t ? fmtTok(used) + (hit !== null ? `（命中 ${hit}%）` : '') : h('span', { className: 'ab-muted' }, '—')),
          h('td', { className: 'ab-small ab-muted' }, c.bornDay || '—'),
          h('td', { className: 'ab-small' },
            h('span', { style: { cursor: 'pointer', borderBottom: '1px dotted var(--ab-line)' }, title: '点一下复制完整会话 ID：' + c.sessionId, onClick: () => copy(c.sessionId) },
              String(c.sessionId).replace(/^session-/, '').slice(0, 8))),
          h('td', null, h(Btn, { small: true, disabled: busy === c.chatId, onClick: () => reset(c) }, busy === c.chatId ? '…' : '重新开始')))
      })
      const body = !data ? h(Empty, { icon: '⏳', text: '加载中…' })
        : data.error ? h(Empty, { text: data.error })
        : list.length === 0 ? h(Empty, { icon: '💬', text: '还没有会话 —— 有人在 QQ 上找她之后，这里会长出来' })
        : h('div', null,
          h('div', { style: { overflowX: 'auto' } },
            h('table', { className: 'ab-table' },
              h('thead', null, h('tr', null, ['会话', '类型', '今天', '累计 token', '建于', '会话 ID', ''].map((x) => h('th', { key: x }, x)))),
              h('tbody', null, cells))),
          h(Pager, { page: pg.page, total: pg.total, setPage: pg.setPage, count: pg.count }),
          h('div', { className: 'ab-small ab-muted', style: { marginTop: 10 } }, '这里只是插件的「QQ 会话」视图；DSH 里手动开的会话不在这里。要全部重来，可以在「概览 → 快捷操作」里一次归档所有 QQ 会话。'))
      return h('div', { className: 'ab-grid' },
        h(Card, {
          title: 'QQ 会话',
          desc: '每个聊过的私聊 / 群在这里对应一个独立的 DSH 会话，上下文、记忆和模型都是分开的。重新开始只影响这一个聊天。',
          right: h(Btn, { small: true, kind: 'ghost', onClick: load }, '刷新'),
        }, body))
    }

    function Logs() {
      const [items, setItems] = useState(null)
      const [areas, setAreas] = useState([])
      const [files, setFiles] = useState([])
      const [level, setLevel] = useState('info')
      const [area, setArea] = useState('')
      const [q, setQ] = useState('')
      const [auto, setAuto] = useState(true)
      // 输入框每敲一个字都请求一次太吵，停手 300ms 再查
      const [kw, setKw] = useState('')
      useEffect(() => { const t = setTimeout(() => setKw(q), 300); return () => clearTimeout(t) }, [q])
      const load = useCallback(() => get('/logs?limit=400&level=' + level + '&area=' + encodeURIComponent(area) + '&q=' + encodeURIComponent(kw)).then((r) => {
        if (!r.ok) return
        setItems(r.entries || [])
        setAreas(r.areas || [])
        setFiles(r.files || [])
      }), [level, area, kw])
      useEffect(() => { const tick = () => { if (!document.hidden) load() }; tick(); if (!auto) return; const t = setInterval(tick, 3000); return () => clearInterval(t) }, [load, auto])
      const download = async (name) => {
        const r = await get('/logs/file?name=' + encodeURIComponent(name))
        if (!r.ok) return
        const url = URL.createObjectURL(new Blob([r.text], { type: 'text/plain;charset=utf-8' }))
        const a = document.createElement('a')
        a.href = url
        a.download = name
        document.body.appendChild(a)
        a.click()
        a.remove()
        setTimeout(() => URL.revokeObjectURL(url), 5000)
      }
      const pgf = usePager(files)
      const areaOpts = [{ value: '', label: '所有模块' }].concat(areas.map((a) => ({ value: a, label: a })))
      return h('div', { className: 'ab-grid' },
        h(Card, {
          title: '日志',
          desc: '所有后台动作都在这里，令牌和密码已自动打码。完整日志按天存在数据目录的 logs/ 下，可以整天下载下来看。',
          right: h('div', { className: 'ab-flex' },
            h(Select, { value: level, onChange: setLevel, width: 100, options: [['debug', '全部'], ['info', '一般'], ['warn', '警告'], ['error', '错误']].map(([value, label]) => ({ value, label })) }),
            h(Select, { value: area, onChange: setArea, width: 130, options: areaOpts }),
            h('span', { className: 'ab-switch-row' }, h(Switch, { on: auto, onChange: setAuto }), h('span', { className: 'ab-muted ab-small' }, '自动刷新'))),
        },
          h('div', { className: 'ab-flex', style: { marginBottom: 10 } },
            h('input', { className: 'ab-input', style: { flex: 1 }, placeholder: '搜索日志内容或模块名…', value: q, onChange: (e) => setQ(e.target.value) }),
            q ? h(Btn, { small: true, kind: 'ghost', onClick: () => setQ('') }, '清空') : null),
          items === null ? h(Empty, { icon: '⏳', text: '加载中…' })
            : items.length === 0 ? h(Empty, { text: kw ? `没有包含「${kw}」的日志` : '没有符合条件的日志' })
            : h('div', { className: 'ab-logs' }, items.slice().reverse().map((e, i) => h(LogLine, { key: i, e })))),
        files.length ? h(Card, { title: '日志文件', desc: '按天一个文件，默认留 14 天。' },
          h('div', null,
            h('div', { style: { overflowX: 'auto' } },
              h('table', { className: 'ab-table' },
                h('thead', null, h('tr', null, ['文件', '大小', '时间', ''].map((x) => h('th', { key: x }, x)))),
                h('tbody', null, pgf.rows.map((f) => h('tr', { key: f.name },
                  h('td', { className: 'ab-small' }, f.name),
                  h('td', { className: 'ab-small ab-muted' }, fmtSize(f.size)),
                  h('td', { className: 'ab-small ab-muted' }, new Date(f.at).toLocaleString()),
                  h('td', null, h(Btn, { small: true, onClick: () => download(f.name) }, '下载'))))))),
            h(Pager, { page: pgf.page, total: pgf.total, setPage: pgf.setPage, count: pgf.count }))) : null)
    }

    // ---------------- 备份迁移 ----------------
    /** 字节数说成人话。 */
    const fmtSize = (n) => (n >= 1024 * 1024 ? (n / 1024 / 1024).toFixed(1) + ' MB' : n >= 1024 ? Math.round(n / 1024) + ' KB' : (n || 0) + ' B')

    /** 数据目录里的东西打成包带走，换设备时导回来。导出走浏览器下载，导入是整项替换（替换前先备份）。 */
    function Backup({ st, draft, setDraft, toast, reload }) {
      const f = useField(draft, setDraft)
      const [auto, setAuto] = useState(null)
      const [parts, setParts] = useState(null)
      const [dir, setDir] = useState('')
      const [exp, setExp] = useState({})
      const [pkg, setPkg] = useState(null)
      const [imp, setImp] = useState({})
      const [busy, setBusy] = useState('')
      const load = () => get('/backup/status').then((r) => {
        if (!r.ok) { toast(r.message || '读不到数据目录', 'err'); return setParts([]) }
        setDir(r.dir || '')
        setParts(r.parts || [])
        setExp((cur) => (Object.keys(cur).length ? cur : Object.fromEntries((r.parts || []).map((x) => [x.id, x.files > 0]))))
      })
      const loadAuto = () => get('/backup/auto').then((r) => { if (r.ok) setAuto(r) })
      useEffect(() => { load(); loadAuto() }, [])
      const runNow = async () => {
        setBusy('auto')
        const r = await post('/backup/run', {})
        setBusy('')
        toast(r.message, r.ok ? 'ok' : 'err')
        if (r.ok) setAuto(r)
      }
      const restore = async (name) => {
        if (!window.confirm('用 ' + name + ' 覆盖现在的数据？\n\n备份里有的项会被换回去，没勾选的项不动。恢复前现在的数据也会先抄一份到 backups/。')) return
        setBusy('restore')
        const r = await post('/backup/restore', { name })
        setBusy('')
        toast(r.message, r.ok ? 'ok' : 'err')
        if (r.ok) { await load(); await loadAuto(); reload && reload() }
      }
      const drop = async (name) => {
        if (!window.confirm('删掉这份备份 ' + name + '？')) return
        const r = await post('/backup/delete', { name })
        toast(r.message, r.ok ? 'ok' : 'err')
        if (r.ok) setAuto(r)
      }
      const info = (id) => (parts || []).find((p) => p.id === id) || { id, label: id, desc: '', secret: false }
      const picked = Object.keys(exp).filter((k) => exp[k])
      const total = (parts || []).filter((p) => exp[p.id]).reduce((s, p) => s + p.bytes, 0)
      const download = (name, text) => {
        const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }))
        const a = document.createElement('a')
        a.href = url; a.download = name
        document.body.appendChild(a); a.click(); a.remove()
        setTimeout(() => URL.revokeObjectURL(url), 5000)
      }
      const doExport = async () => {
        if (!picked.length) return toast('先选要带走的内容')
        setBusy('export')
        const r = await post('/backup/export', { parts: picked })
        setBusy('')
        if (!r.ok) return toast(r.message || '打包失败', 'err')
        const d = new Date()
        const two = (n) => String(n).padStart(2, '0')
        const name = 'halobot-备份-' + d.getFullYear() + two(d.getMonth() + 1) + two(d.getDate()) + '-' + two(d.getHours()) + two(d.getMinutes()) + '.json'
        download(name, JSON.stringify(r.bundle))
        toast('打包好了，浏览器正在下载', 'ok')
      }
      const pickFile = () => {
        const inp = document.createElement('input')
        inp.type = 'file'
        inp.accept = '.json,application/json'
        inp.onchange = () => {
          const f = inp.files && inp.files[0]
          if (!f) return
          const fr = new FileReader()
          fr.onload = () => {
            try {
              const bundle = JSON.parse(String(fr.result || ''))
              if (!bundle || bundle.format !== 'halobot-backup') throw new Error('这不是 Halobot 的备份文件')
              const list = Object.entries(bundle.parts || {}).map(([id, box]) => {
                const files = Object.keys((box && box.files) || {})
                let bytes = 0
                for (const k of files) {
                  const x = (box.files || {})[k] || {}
                  bytes += x.enc === 'base64' ? Math.floor(String(x.data || '').length * 0.75) : new Blob([String(x.data || '')]).size
                }
                return { id, files: files.length, bytes }
              })
              setPkg({ name: f.name, bundle, at: bundle.at || '', app: bundle.app || '', list })
              setImp(Object.fromEntries(list.map((x) => [x.id, true])))
            } catch (e) { toast('读不了这个文件：' + e.message, 'err') }
          }
          fr.readAsText(f)
        }
        inp.click()
      }
      const doImport = async () => {
        if (!pkg) return
        const ids = Object.keys(imp).filter((k) => imp[k])
        if (!ids.length) return toast('先选要导入的内容')
        if (!window.confirm('这会把备份里的内容整个替换掉你现在这几项：\n\n' + ids.map((id) => '· ' + info(id).label).join('\n') + '\n\n现在的东西会先抄一份到数据目录的 backups/ 下，导错了能捞回来。继续？')) return
        setBusy('import')
        const r = await post('/backup/import', { bundle: pkg.bundle, parts: ids })
        setBusy('')
        if (!r.ok) return toast(r.message || '导入失败', 'err')
        toast(r.message + (r.backup ? '（导入前的数据存在 ' + r.backup + '）' : ''), 'ok')
        setPkg(null)
        load()
        if (reload) reload()
      }
      const line = (id, label, desc, secret, files, bytes, checked, onCheck) => h('label', { key: id, className: 'ab-li', style: { cursor: files ? 'pointer' : 'default', opacity: files ? 1 : 0.5 } },
        h('input', { type: 'checkbox', disabled: !files, checked, onChange: (e) => onCheck(e.target.checked), style: { accentColor: 'var(--ab-sea)', marginTop: 3 } }),
        h('div', { className: 'body' },
          h('b', null, label), secret ? h('span', { className: 'ab-muted ab-small' }, '　⚠ 里面有密钥和密码') : null,
          h('div', { className: 'ab-muted ab-small' }, desc),
          h('div', { className: 'ab-muted ab-small' }, files ? files + ' 个文件 · ' + fmtSize(bytes) : '现在没有')))
      const autoList = (auto && auto.list) || []
      const pga = usePager(autoList)
      const autoRows = pga.rows.map((x) => h('tr', { key: x.name },
        h('td', { className: 'ab-small' }, h(Clip, { text: x.name, n: 34, max: 320 })),
        h('td', { className: 'ab-small ab-muted', style: { whiteSpace: 'nowrap' } }, fmtSize(x.bytes)),
        h('td', { className: 'ab-small ab-muted', style: { whiteSpace: 'nowrap' } }, new Date(x.at).toLocaleString()),
        h('td', { style: { whiteSpace: 'nowrap' } },
          h(Btn, { small: true, disabled: busy === 'restore', onClick: () => restore(x.name) }, '恢复这份'),
          h(Btn, { small: true, kind: 'ghost', onClick: () => drop(x.name) }, '删除'))))
      const autoBody = autoList.length
        ? h('div', { style: { marginTop: 10 } },
          h('div', { style: { overflowX: 'auto' } },
            h('table', { className: 'ab-table' },
              h('thead', null, h('tr', null, ['备份文件', '大小', '时间', ''].map((x) => h('th', { key: x }, x)))),
              h('tbody', null, autoRows))),
          h(Pager, { page: pga.page, total: pga.total, setPage: pga.setPage, count: pga.count }))
        : h('div', { className: 'ab-muted ab-small', style: { marginTop: 8 } }, '还没有备份。')
      const autoCard = h(Card, {
        title: '自动备份',
        desc: '开着就按间隔把整份数据（配置、记忆、表情……）打包进数据目录的 backups/，只留最近几份，不用你记得点。',
        right: f.sw('backup.auto'),
      },
        h(Row, { label: '每隔几小时' }, f.num('backup.everyHours', { min: 1, max: 720 }), h('span', { className: 'ab-muted' }, '小时备份一次（最短 1 小时）')),
        h(Row, { label: '保留几份', hint: '超出的自动删最旧的' }, f.num('backup.keep', { min: 1, max: 60 }), h('span', { className: 'ab-muted' }, '份')),
        h('div', { className: 'ab-flex', style: { marginTop: 8 } },
          h(Btn, { small: true, kind: 'primary', disabled: busy === 'auto', onClick: runNow }, busy === 'auto' ? '打包中…' : '现在备份一份'),
          auto && auto.lastAt
            ? h('span', { className: 'ab-muted ab-small' }, '上次：' + new Date(auto.lastAt).toLocaleString())
            : h('span', { className: 'ab-muted ab-small' }, '还没备份过')),
        autoBody,
        auto && auto.dir ? h('div', { className: 'ab-muted ab-small', style: { marginTop: 6 } }, '备份目录：' + auto.dir) : null)
      return h('div', { className: 'ab-grid' },
        autoCard,
        h(Card, { title: '导出：把她的东西打包带走', desc: '换设备、留个底、或者给另一台机器用。想带哪些就勾哪些，导出文件里图片和脚本都会原样装进去；到新设备上在同一页「导入」它，记性和表情就都回来了（插件本身还是得先装上）。' },
          !parts ? h(Empty, { icon: '⏳', text: '加载中…' }) : h(Fragment, null,
            h('div', { className: 'ab-list' }, parts.map((p) => line(p.id, p.label, p.desc, p.secret, p.files, p.bytes, !!exp[p.id], (v) => setExp({ ...exp, [p.id]: v })))),
            h('div', { className: 'ab-flex', style: { marginTop: 10 } },
              h(Btn, { small: true, kind: 'ghost', onClick: () => setExp(Object.fromEntries((parts || []).map((p) => [p.id, p.files > 0]))) }, '全选'),
              h(Btn, { small: true, kind: 'ghost', onClick: () => setExp({}) }, '全不选'),
              h('div', { className: 'ab-spacer' }),
              h(Btn, { small: true, kind: 'primary', disabled: busy === 'export' || !picked.length, onClick: doExport }, busy === 'export' ? '打包中…' : '导出（' + picked.length + ' 项 · ' + fmtSize(total) + '）'),
              h('span', { className: 'ab-spacer' })),
            dir ? h('div', { className: 'ab-muted ab-small', style: { marginTop: 8 } }, '数据目录：' + dir) : null)),
        h(Card, { title: '导入：把备份装回来', desc: '选一个之前导出的 JSON 文件。导入是「整项替换」：那一项现在的东西会被备份里的覆盖，备份里没有的旧文件会被删掉。导入前会自动把现在的东西抄一份到数据目录的 backups/ 下。' },
          h('div', { className: 'ab-flex' },
            h(Btn, { small: true, kind: pkg ? 'ghost' : 'primary', onClick: pickFile }, pkg ? '换一个文件' : '选择备份文件'),
            pkg ? h('span', { className: 'ab-muted ab-small' }, pkg.name + (pkg.at ? ' · ' + new Date(pkg.at).toLocaleString() : '') + (pkg.app ? ' · v' + pkg.app : '')) : null),
          pkg ? h('div', { style: { marginTop: 10 } },
            h('div', { className: 'ab-list' }, pkg.list.map((x) => line('in-' + x.id, info(x.id).label, info(x.id).desc, info(x.id).secret, x.files, x.bytes, !!imp[x.id], (v) => setImp({ ...imp, [x.id]: v })))),
            h('div', { className: 'ab-flex', style: { marginTop: 10 } },
              h('span', { className: 'ab-muted ab-small' }, '没勾的项保持现在的不动'),
              h('div', { className: 'ab-spacer' }),
              h(Btn, { small: true, kind: 'primary', disabled: busy === 'import' || !Object.values(imp).some(Boolean), onClick: doImport }, busy === 'import' ? '导入中…' : '导入所选'))) : h('div', { className: 'ab-muted ab-small', style: { marginTop: 8 } }, '还没选文件。备份文件就是上面「导出」下载的那种 JSON。')),
      )
    }

    // ---------------- 首次使用向导 ----------------
    const WIZ_STEPS = ['你们的 QQ 号', '接 QQ 网关', '启动并同意协议', '连上机器人号', '完成']

    function Wizard({ st, draft, setDraft, save, toast, reload, onClose }) {
      const [step, setStep] = useState(() => { try { return Number(localStorage.getItem('halobot.wiz') || 0) } catch (e) { return 0 } })
      const go = (i) => { setStep(i); try { localStorage.setItem('halobot.wiz', String(i)) } catch (e) {} }
      const f = useField(draft, setDraft)
      const sl = st.snowluma
      const conn = st.onebot.state === 'connected'
      const login = st.onebot.login
      const [procs, setProcs] = useState(null)
      const [live, setLive] = useState('dry')
      const qqOk = /^\d{5,11}$/.test(draft.botQQ || '') && /^\d{5,11}$/.test(draft.ownerQQ || '') && draft.botQQ !== draft.ownerQQ
      const external = draft.gateway === 'onebot'
      const verified = conn && login && String(login.uin) === String(st.config.botQQ) && !st.onebot.problem
      const canNext = [qqOk, external ? Boolean(draft.snowluma.wsUrl || st.config.snowluma.wsUrl) : sl.installed, external || (sl.running && sl.consented), verified, true][step]
      const next = async () => {
        if ((step === 0 || step === 1) && !(await save({ ...draft, enabled: true }))) return
        go(Math.min(step + 1, WIZ_STEPS.length - 1))
        reload()
      }
      const useExisting = async () => {
        const r = await post('/setup/done', { existingConnection: true })
        toast(r.message, r.ok ? 'ok' : 'err')
        if (r.ok) { try { localStorage.removeItem('halobot.wiz') } catch (e) {} reload(); onClose && onClose() }
      }
      const body = [
        // 0. QQ 号
        h('div', null,
          h('p', { className: 'ab-desc' }, '哈洛需要一个自己的 QQ 号（机器人号），还要知道谁是她的主人。'),
          h(Row, { label: '机器人 QQ 号', hint: '强烈建议用小号：非官方 QQ 工具有被限制的风险' }, f.text('botQQ', { placeholder: '例如 123456789' })),
          h(Row, { label: '你的 QQ 号（主人）', hint: '群管、操作电脑这些只听主人的' }, f.text('ownerQQ', { placeholder: '你的大号' })),
          h(Row, { label: '她怎么称呼你' }, f.text('ownerName', { placeholder: '主人' })),
          draft.botQQ && draft.ownerQQ && draft.botQQ === draft.ownerQQ ? h('div', { className: 'ab-note err' }, '机器人号和主人号不能是同一个。') : null),
        // 1. SnowLuma，或接已有的 OneBot 机器人
        external ? h('div', null,
          h(GatewayChoice, { draft, setDraft }),
          h('p', { className: 'ab-desc', style: { marginTop: 10 } }, '让你的 OneBot 服务（NapCat、LLOneBot、Lagrange、Docker 里的 SnowLuma……）登录机器人号，把它的正向 WebSocket 地址填在下面。插件只连接，不会启动或注入任何东西。'),
          h(OneBotFields, { draft, f })) :
        h('div', null,
          h(GatewayChoice, { draft, setDraft }),
          h('p', { className: 'ab-desc', style: { marginTop: 10 } }, 'SnowLuma 是让机器人号上线的 QQ 网关。它的协议不允许别的程序自动下载安装，所以这一步要你自己来（只用做一次）。'),
          h('div', { className: 'ab-steps' },
            h('div', { className: 'ab-step' }, h('div', null, h('b', null, '下载'), h('div', { className: 'ab-muted ab-small' }, '下载 Windows 完整版，文件名类似 SnowLuma-v2.x.x-win-x64.zip（不带 lite）。'),
              h('div', { style: { marginTop: 6 } }, h(Btn, { small: true, onClick: () => window.open(sl.downloadPage, '_blank') }, '打开下载页 ↗')))),
            h('div', { className: cx('ab-step', sl.installed && 'done') }, h('div', null, h('b', null, '解压到纯英文目录'), h('div', { className: 'ab-muted ab-small' }, '推荐 C:\\Halobot\\snowluma，解压后目录里能直接看到 index.mjs。'),
              h('div', { className: 'ab-flex', style: { marginTop: 6 } }, f.text('snowluma.dir', { size: 'wide', placeholder: 'C:\\Halobot\\snowluma' }), h(Btn, { small: true, onClick: async () => { await save(draft); reload() } }, '检查')),
              h('div', { className: 'ab-small', style: { marginTop: 4, color: sl.installed ? 'var(--ab-ok)' : 'var(--ab-warn)' } }, sl.installed ? '✓ 找到了 SnowLuma v' + sl.version : sl.reason))))),
        // 2. 启动 + 协议（接自己的 OneBot 时不用）
        external ? h('div', null, h('p', { className: 'ab-desc' }, '用的是你自己的 OneBot 服务，这一步不用做，直接下一步。')) :
        h('div', null,
          h('p', { className: 'ab-desc' }, '点启动后它在后台运行（不弹窗口），控制台密码由插件自动生成和保存，你不用记。'),
          h('div', { className: 'ab-flex', style: { marginBottom: 10 } },
            h(Btn, { kind: 'primary', small: true, disabled: sl.running, onClick: async () => { toast('正在启动…'); const r = await post('/snowluma/start'); toast(r.message); reload() } }, sl.running ? '✓ 已在运行' : '启动 SnowLuma'),
            h(SnowLumaAuth, { running: sl.running, toast, onChange: reload })),
          h(Agreement, { running: sl.running, toast, onChange: reload })),
        // 3. 接入
        h('div', null,
          external ? h('p', { className: 'ab-desc' }, '确认你的 OneBot 服务登录的是机器人号 ' + (st.config.botQQ || '') + '，然后点「测试连接」。插件连上后会先核对登录的号，不是机器人号就断开。') :
          h('p', { className: 'ab-desc' }, '在这台电脑上另开一个 QQ，登录机器人号 ' + (st.config.botQQ || '') + '（可以最小化）。你的大号 QQ 照常开着就行——插件只会接入机器人号，绝不碰别的号。'),
          external ? h('div', { className: 'ab-flex' },
            h(Btn, { kind: 'primary', small: true, onClick: async () => { const r = await post('/onebot/reconnect'); toast(r.message, r.ok ? 'ok' : 'err'); reload() } }, '连接'),
            h(Btn, { small: true, onClick: async () => { const r = await get('/onebot/test'); toast(r.message) } }, '测试连接')) :
          h('div', { className: 'ab-flex' },
            h(Btn, { kind: 'primary', small: true, onClick: async () => { const r = await post('/snowluma/attach'); toast(r.message); setTimeout(reload, 1500) } }, '接入机器人号'),
            h(Btn, { small: true, onClick: async () => { const r = await get('/snowluma/processes'); setProcs(r.list || []); if (!r.ok) toast(r.message) } }, '看看有哪些 QQ 进程'),
            h(Btn, { small: true, onClick: async () => { const r = await get('/onebot/test'); toast(r.message) } }, '测试连接')),
          sl.lastAttach && sl.lastAttach.at ? h('div', { className: 'ab-small', style: { marginTop: 8, color: sl.lastAttach.ok ? 'var(--ab-ok)' : 'var(--ab-warn)' } }, sl.lastAttach.message) : null,
          conn && login ? h('div', { className: 'ab-note', style: { marginTop: 10 } }, login.uin === st.config.botQQ ? '✓ 连上了：' + login.nickname + '（' + login.uin + '）' : '⚠ 连上的是 ' + login.uin + '，不是机器人号') : h('div', { className: 'ab-muted ab-small', style: { marginTop: 10 } }, '接入后需要十几秒识别登录状态，稍等一下会自动刷新。'),
          procs ? h('div', { style: { overflowX: 'auto' } }, h('table', { className: 'ab-table', style: { marginTop: 10 } }, h('tbody', null, procs.map((p) => h('tr', { key: p.pid }, h('td', null, p.pid), h('td', null, p.uin || '识别不出'), h('td', null, p.nickname || ''), h('td', null, p.isBot ? h('span', { className: 'ab-badge' }, '机器人号') : h('span', { className: 'ab-muted ab-small' }, '不会碰'))))))) : null),
        // 4. 完成
        h('div', null,
          h('p', { className: 'ab-desc' }, '都准备好了！最后选一下她怎么上线：'),
          h(Choices, { value: live, onChange: setLive, options: [
            { value: 'dry', label: '先试运行', desc: '她会照常思考，但只写进日志、不真的发出去。看几条没问题再在右上角关掉试运行' },
            { value: 'live', label: '直接上线', desc: '马上开始真的回 QQ 消息' },
          ] }),
          h('div', { className: 'ab-flex', style: { marginTop: 12 } },
            h(Btn, { small: true, onClick: async () => { await save({ ...draft, enabled: true, dryRun: false }); const r = await post('/test-send'); toast(r.message); await save({ ...draft, enabled: true, dryRun: live === 'dry' }) } }, '给我发一条自测消息'))),
      ][step]
      return h('div', { className: 'ab-card', style: { padding: '20px 22px' } },
        h('div', { className: 'ab-flex', style: { marginBottom: 6 } }, h('h3', { style: { margin: 0, fontSize: 16 } }, '设置向导'), h('span', { className: 'ab-muted ab-small' }, '第 ' + (step + 1) + ' / ' + WIZ_STEPS.length + ' 步 · ' + WIZ_STEPS[step]), h('div', { className: 'ab-spacer' }),
          st.config.setupDone && onClose ? h(Btn, { small: true, kind: 'ghost', onClick: onClose }, '关闭向导') : null),
        h('div', { className: 'ab-wiz-bar' }, WIZ_STEPS.map((s, i) => h('button', { key: s, type: 'button', className: cx('seg', i < step && 'done', i === step && 'on'), onClick: () => i <= step && go(i), title: s }, h('span', null, s)))),
        verified && !st.config.setupDone ? h('div', { className: 'ab-note', style: { marginTop: 12 } }, '机器人号已经连接并核对通过。', ' ', h(Btn, { small: true, onClick: useExisting }, '使用现有连接，进入面板')) : null,
        h('div', { style: { minHeight: 220, marginTop: 14 } }, body),
        h('div', { className: 'ab-flex', style: { marginTop: 16, borderTop: '1px solid var(--ab-line)', paddingTop: 12 } },
          step > 0 ? h(Btn, { kind: 'ghost', onClick: () => go(step - 1) }, '上一步') : null,
          h('div', { className: 'ab-spacer' }),
          step < WIZ_STEPS.length - 1
            ? h(Btn, { kind: 'primary', disabled: !canNext, onClick: next }, '下一步')
            : h(Btn, { kind: 'primary', onClick: async () => {
              if (!(await save({ ...draft, enabled: true, dryRun: live === 'dry' }))) return
              const r = await post('/setup/done'); toast(r.message, r.ok ? 'ok' : 'err')
              if (r.ok) { try { localStorage.removeItem('halobot.wiz') } catch (e) {} reload(); onClose && onClose() }
            } }, '完成，让哈洛上线')))
    }

    // ---------------- 面板主体 ----------------
    function HalobotPage() {
      useStyle()
      const [st, setSt] = useState(null)
      const [err, setErr] = useState('')
      const [draft, setDraft] = useState(null)
      const [tab, setTab] = useState(() => { try { return localStorage.getItem('halobot.tab') || 'overview' } catch (e) { return 'overview' } })
      const [toastMsg, setToastMsg] = useState(null)
      const [wizardOpen, setWizardOpen] = useState(false)
      const toastTimer = useRef(null)
      const dirtyRef = useRef(false)
      const saveRef = useRef(null)
      // kind：ok / err / 不填 = 普通
      const toast = (m, kind) => {
        const text = String(m || '')
        const k = kind || (/失败|出错|没成功|不能|读不到|连不上/.test(text) ? 'err' : '')
        setToastMsg({ text, kind: k })
        clearTimeout(toastTimer.current)
        toastTimer.current = setTimeout(() => setToastMsg(null), 3200)
      }
      // 上一次还没回来就别再发一次：慢的时候会堆请求，也让 React 白重渲染
      const busyRef = useRef(false)
      const reload = useCallback(async () => {
        if (busyRef.current) return
        busyRef.current = true
        try {
          const r = await get('/state')
          if (!r || r.ok === false) { setErr(r && r.message ? r.message : '读不到插件状态'); return }
          setErr('')
          setSt(r)
          if (!dirtyRef.current) setDraft(clone(r.config))
        } finally {
          busyRef.current = false
        }
      }, [])
      // 刷新节奏：概览 / 连接 / 日志这类要看「活」数据的页 5 秒一次，其余页 20 秒一次；
      // 页面切到后台时完全停掉（/state 一次 20 多 KB，一直拉就是 250KB/分钟）
      const slow = !(tab === 'overview' || tab === 'connect' || tab === 'logs')
      useEffect(() => {
        const tick = () => { if (!document.hidden) reload() }
        tick()
        const timer = setInterval(tick, slow ? 20000 : 5000)
        const onVis = () => { if (!document.hidden) { reload(); tick() } }
        document.addEventListener('visibilitychange', onVis)
        return () => { clearInterval(timer); document.removeEventListener('visibilitychange', onVis) }
      }, [reload, slow])
      const go = (id) => { setTab(id); try { localStorage.setItem('halobot.tab', id) } catch (e) {} }
      // 标签多、一屏放不下：滚轮横着滚，选中的标签自动滚进视野
      const tabsRef = useRef(null)
      useEffect(() => {
        const el = tabsRef.current
        if (!el) return
        const onWheel = (e) => { if (el.scrollWidth > el.clientWidth && Math.abs(e.deltaY) > Math.abs(e.deltaX)) { el.scrollLeft += e.deltaY; e.preventDefault() } }
        el.addEventListener('wheel', onWheel, { passive: false })
        return () => el.removeEventListener('wheel', onWheel)
      })
      useEffect(() => { tabsRef.current?.querySelector('.ab-tab.on')?.scrollIntoView({ block: 'nearest', inline: 'nearest' }) }, [tab])
      const dirty = useMemo(() => !!(st && draft) && JSON.stringify(draft) !== JSON.stringify(st.config), [st, draft])
      dirtyRef.current = dirty
      const setD = (d) => setDraft(d)
      const save = async (override) => {
        const body = override || draft
        const r = await post('/save', body)
        if (r.ok === false) { toast(r.message || '保存失败', 'err'); return false }
        dirtyRef.current = false
        setSt(r)
        setDraft(clone(r.config))
        toast(r.message || '保存好了', 'ok')
        return true
      }
      saveRef.current = save
      // 右上角的开关立刻生效；有没保存的改动时连同改动一起保存，不会把它们冲掉
      const quickToggle = async (path, v) => {
        await save(setPath(dirtyRef.current ? draft : clone(st.config), path, v))
      }
      // Ctrl/⌘ + S 保存
      useEffect(() => {
        const onKey = (e) => {
          if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's' && dirtyRef.current) {
            e.preventDefault()
            saveRef.current && saveRef.current()
          }
        }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
      }, [])

      if (!st || !draft) {
        return h('div', { className: 'ab-root' }, h('div', { className: 'ab-wrap' }, err ? h('div', { className: 'ab-note err' }, '面板读不到插件：', err, '。如果刚装好插件，重启一次 DSH 试试。') : h(Empty, { icon: '🐋', text: '哈洛正在游过来…' })))
      }
      const cfg = st.config
      const conn = st.onebot.state === 'connected'
      const status = !cfg.enabled ? { cls: '', text: '休息中（总开关关着）' } : !conn ? { cls: 'err', text: 'QQ 没连上' } : cfg.dryRun ? { cls: 'warn', text: '在线 · 试运行' } : { cls: 'ok', text: '在线' }
      const persona = st.personas.find((p) => p.id === cfg.persona.current)
      const props = { st, draft, setDraft: setD, toast, reload, go, openWizard: () => setWizardOpen(true) }
      const showWizard = !cfg.setupDone || wizardOpen
      // 标签页：内置的按模块在不在跑决定显示；自己写的模块有设置或面板的各占一页
      const mods = st.modules || []
      const running = (id) => { const m = mods.find((x) => x.id === id); return Boolean(m && m.running) }
      const hasUi = (m) => m.running === 'user' && !m.builtin && ((m.settings || []).length || m.panel)
      // 写了 tab 的模块嵌进那个内置标签页；没写（或写的页不存在）的单独一页
      const intoTab = (m) => Boolean(m.tab && TABS.some((t) => t.id === m.tab))
      const extTabs = mods.filter((m) => hasUi(m) && !intoTab(m)).map((m) => ({ id: 'ext:' + m.id, label: m.name, ext: m.id }))
      const tabs = TABS.filter((t) => !TAB_MODS[t.id] || TAB_MODS[t.id].some(running))
      tabs.splice(tabs.findIndex((t) => t.id === 'logs'), 0, ...extTabs)
      const curTab = tabs.find((t) => t.id === tab) || tabs[0]
      const body = curTab.ext ? ExtPage : {
        overview: Overview, stats: Stats, sessions: Sessions, connect: Connect, persona: Persona, access: Access, group: Group, model: Model, voice: Voice,
        stickers: Stickers, imagegen: ImageGen, diary: Diary, speakup: SpeakUp, mood: MoodPage, memory: MemoryPage, song: Song, bili: Bili, douyin: Douyin, heybox: Heybox, local: LocalApi, modules: Modules, backup: Backup, logs: Logs,
      }[curTab.id] || Overview
      // 哪些标签有没保存的改动
      const TAB_KEYS = { connect: ['snowluma', 'botQQ'], backup: ['backup'], access: ['ownerQQ', 'ownerName', 'ownerLevel', 'longTasks', 'profilePerms', 'allow'], group: ['group', 'merge', 'titleFilter'], model: ['model', 'chatModels'], voice: ['voice'], stickers: ['stickers'], imagegen: ['imageGen'], diary: ['diary', 'qzoneSocial'], speakup: ['speakUp'], mood: ['mood'], memory: ['memory'], song: ['song'], bili: ['bili'], douyin: ['douyin'], heybox: ['heybox'], local: ['local'] }
      const tabDirty = (id) => {
        if (!dirty) return false
        if (id.startsWith('ext:')) { const k = id.slice(4); return JSON.stringify((draft.ext || {})[k]) !== JSON.stringify((cfg.ext || {})[k]) }
        return (TAB_KEYS[id] || []).some((k) => JSON.stringify(draft[k]) !== JSON.stringify(cfg[k]))
      }
      return h('div', { className: 'ab-root' },
        h('div', { className: 'ab-wrap' },
          h('div', { className: 'ab-hero' },
            h('button', { type: 'button', className: 'ab-avatar-btn', title: '点击换头像', onClick: () => pickAvatar(toast, reload) }, h('img', { className: 'ab-avatar', src: avatarSrc(st), alt: '头像' }), h('span', { className: 'ab-avatar-tip' }, '换头像')),
            h('div', { className: 'ab-hero-main' },
              h('h1', { title: (st.onebot.login && st.onebot.login.nickname) || '' }, (persona && persona.name) || 'Halobot'),
              h('div', { className: 'ab-sub' }, 'QQ ' + cfg.botQQ + ' · ' + st.mood.label),
              h('div', { className: 'ab-pills' },
                h('span', { className: 'ab-pill' }, h('i', { className: cx('ab-dot', status.cls) }), status.text),
                h('span', { className: 'ab-pill' }, 'SnowLuma ' + (st.snowluma.installed ? (st.snowluma.running ? '运行中' : '没启动') : '未安装')),
                h('span', { className: 'ab-pill' }, 'Halobot v' + st.version))),
            h('div', { className: 'ab-hero-side' },
              h('div', { className: 'ab-switch-row' }, h('span', null, '总开关'), h(Switch, { on: cfg.enabled, onChange: (v) => quickToggle('enabled', v) })),
              h('div', { className: 'ab-switch-row' }, h('span', { className: 'ab-muted' }, '试运行'), h(Switch, { on: cfg.dryRun, onChange: (v) => quickToggle('dryRun', v), title: '开着时只写日志，不真的发到 QQ' })))),
          showWizard ? h(Wizard, { st, draft, setDraft: setD, save, toast, reload, onClose: () => setWizardOpen(false) }) : null,
          showWizard ? null : h(NavBar, {
            tabs, cur: curTab, go, dirtyOf: tabDirty, subRef: tabsRef,
            mark: (t) => {
              if (tabDirty(t.id)) return h('i', { className: 'dirty', title: '有没保存的改动' })
              if (!t.flag) return null
              const flag = t.flag === 'group' ? cfg.allow.groups.length > 0 : getPath(cfg, t.flag)
              return h('i', { className: cx('ab-dot', flag && 'ok'), title: flag ? '开着' : '关着' })
            },
          }),
          showWizard ? null : h(TabBoundary, { key: curTab.id, onHome: () => go('overview') }, h(body, { ...props, mod: curTab.ext })),
          showWizard || curTab.ext ? null : mods.filter((m) => hasUi(m) && m.tab === curTab.id).map((m) => h('div', { key: 'embed-' + m.id, style: { marginTop: 14 } }, h(ExtPage, { ...props, mod: m.id, embedded: true }))),
          dirty && !showWizard ? h('div', { className: 'ab-savebar' }, h('span', { className: 'msg' }, '有改动还没保存'),
            h('span', { className: 'ab-muted ab-small' }, h('span', { className: 'ab-kbd' }, 'Ctrl'), ' + ', h('span', { className: 'ab-kbd' }, 'S')),
            h(Btn, { kind: 'ghost', onClick: () => setDraft(clone(st.config)) }, '撤销'),
            h(Btn, { kind: 'primary', onClick: () => save() }, '保存设置')) : null,
        ),
        toastMsg ? h('div', { className: cx('ab-toast', toastMsg.kind), role: 'status' }, toastMsg.text) : null,
      )
    }

    function apply(ctx) {
      const slots = ctx.get('slots')
      if (slots === undefined) return
      // 写法同 DSH 自带的「自动化任务」（order 10）和「插件」（order 0）：排在它们后面
      slots.inject('main', () => slots.register({ name: 'main', key: PANEL_ID }, HalobotPage))
      slots.inject('sidebar.panellist', () => slots.register({ name: 'sidebar.panellist', id: PANEL_ID, order: 20, label: () => 'Halobot' }, WhaleIcon))
    }

    exports.apply = apply
    exports.inject = inject
    exports.HalobotPage = HalobotPage
    exports.WhaleIcon = WhaleIcon
    return module.exports
  },
})
