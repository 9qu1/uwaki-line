// 結果画面（結果担当）
//
//   showResult(container, { kind: "line"|"feel", answers, attrs, word, playPromise })
//     playPromise は { n, pct } か null に解決する（POST /api/play の返事。pct は自分より許せる度が低い人の割合）
//   buildModel(kind, answers, word)     結果のまとめ（画面・共有画像・共有の文で共通の形）
//   renderShot(model, opts)             1画面に収まる部分（スクショ向け）。友達に見せるページ（friend.js）でも使う
//   ICONS / icon(name) / brandIcon(name)  画面で使う SVG（絵文字の代わり）
//
// 並び（CONTRACT §8-3）:
//   1画面に収まる部分 → すぐ下に共有の小さなボタン → タイプの説明 → 30問の答えとみんなの割合 → 画像を保存・共有
//   → 共有ボタン → 当てっこを作る（浮気ラインのとき）→ もう一方の診断へ → 浮気ラインと本音のズレ（両方やっていれば）
//   → 作者のほかのサイト → もう一度やる
import { SITE_NAME, SITE_SUB, END_LABEL } from "./config.js";
import { QUESTIONS, CATEGORIES, LINE_CHOICES, FEEL_CHOICES } from "./data/questions.js";
import { FEEL_TYPES } from "./data/types.js";
import { scoreLine, scoreFeel, compareLineFeel, applyWord, typeById, isAnswers } from "./engine.js";
import {
  ROOT_URL, SHORT_URL, readSaved, fetchStats, lineShareUrl, feelShareUrl, shareText, rankView,
  shareX, shareLine, copyLink, shareNative, saveImage, shareInstagram, fileName, toast, isPhone, ensureResultCss, nameUnits, AVG_NEAR,
} from "./share.js";
import { cardBlob } from "./card.js";
import { renderSister } from "./sister.js";
import { pcts } from "./stats.js"; // 割合の丸め方を統計の画面・トップとそろえる（合計100%）

/** みんなの割合を出しはじめる人数（これより少ないうちは「集計中」） */
export const STATS_MIN = 30;
/** 少数派の印（自分の答えを選んだ人がこれより少ない） */
const MINOR_PCT = 25;
/** ズレの段の下に「恋人には自分より広く許しています」を添える、相手に寛大度の大きさ */
const GENEROUS_NOTE = 25;


// ---------- 小物 ----------
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
function h(html) {
  const t = document.createElement("template");
  t.innerHTML = html.trim();
  // template の中は読みこみが止まった場所なので、このページのものとして写す（絵がすぐ読みこまれるように）
  return document.importNode(t.content, true).firstElementChild;
}
/**
 * タイプの名前を、切れ目（share.js の nameUnits）だけで折り返せるようにする
 *   切れ目の中（「スポットライト」など）は .nu（white-space: nowrap）で折り返さない。CSS は word-break: keep-all
 *   欄より長い単位があるときは fitTypeName で字を小さくする
 */
export function phraseHTML(text) {
  return nameUnits(text).map((u) => `<span class="nu">${esc(u)}</span>`).join("<wbr>");
}

/** 名前のいちばん長い切れ目の単位が欄に入るまで、字を 1px ずつ小さくする（「スポットライ／ト」のように字の途中で切れないように） */
const NAME_MIN_PX = 15;
export function fitTypeName(el) {
  if (!el || !el.isConnected) return;
  el.style.fontSize = "";
  el.classList.remove("is-tight");
  const w = el.clientWidth;
  if (!w) return;
  const units = [...el.querySelectorAll(".nu")];
  const over = () => units.some((u) => u.getBoundingClientRect().width > w + 0.5);
  let size = parseFloat(getComputedStyle(el).fontSize) || 0;
  while (over() && size > NAME_MIN_PX) {
    size -= 1;
    el.style.fontSize = `${size}px`;
  }
  if (over()) el.classList.add("is-tight"); // それでも入らないときは、字の途中で折り返してよい
}
/** 画面の幅や書体が変わったら、もう一度合わせる */
function watchTypeName(root) {
  const el = root.querySelector(".rs-type-name");
  if (!el) return;
  let raf = 0;
  const run = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => fitTypeName(el)); };
  if ("ResizeObserver" in window) {
    let lastW = -1;
    new ResizeObserver((ents) => {
      const cw = Math.round(ents[0].contentRect.width);
      if (cw !== lastW) { lastW = cw; run(); }
    }).observe(el.parentElement || el);
  }
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(run).catch(() => {});
  run();
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export const ICONS = {
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  save: '<path d="M12 3v12M7 10l5 5 5-5M4 21h16"/>',
  share: '<path d="M12 15V3M7 8l5-5 5 5"/><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/>',
  link: '<path d="M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1 1"/><path d="M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1-1"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2.5"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
  ext: '<path d="M14 4h6v6M20 4l-9 9"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
  again: '<path d="M20 11a8 8 0 1 0-2.3 5.7M20 5v6h-6"/>',
  quiz: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18.5 14.2A6.5 6.5 0 0 1 21.5 20"/>',
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.2"/>',
  stats: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>',
  down: '<path d="M6 9l6 6 6-6"/>',
};
export function icon(name, sw = 2) {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]}</svg>`;
}
let igSeq = 0;
/** X・LINE・Instagram の印（各社の形と色） */
export function brandIcon(name) {
  if (name === "x") {
    return '<svg class="brand-ic" viewBox="0 0 24 24" aria-hidden="true"><rect width="24" height="24" rx="6" fill="#000"/><path fill="#fff" transform="translate(5.2 5.2) scale(.567)" d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>';
  }
  if (name === "line") {
    return '<svg class="brand-ic" viewBox="0 0 24 24" aria-hidden="true"><rect width="24" height="24" rx="6" fill="#06C755"/><path fill="#fff" d="M12 4.7c-4.3 0-7.8 2.8-7.8 6.3 0 3.1 2.8 5.7 6.5 6.2.3.1.6.2.7.4.1.2.1.5 0 .7l-.1.7c0 .2-.2.8.7.4.9-.4 4.7-2.8 6.4-4.7 1.2-1.3 1.7-2.5 1.7-3.8 0-3.4-3.5-6.2-8.1-6.2z"/><path fill="#06C755" d="M7.3 9.2h.9v3.1h1.7v.8H7.3zM10.5 9.2h.9v3.9h-.9zM12.3 9.2h.8l1.7 2.4V9.2h.9v3.9h-.8l-1.7-2.4v2.4h-.9zM16.1 9.2h2.6v.8h-1.7v.7h1.7v.8h-1.7v.7h1.7v.8h-2.6z"/></svg>';
  }
  if (name === "instagram") {
    const id = `ig-g-${++igSeq}`;
    return `<svg class="brand-ic" viewBox="0 0 24 24" aria-hidden="true"><defs><radialGradient id="${id}" cx="28%" cy="108%" r="140%"><stop offset="0" stop-color="#FFD776"/><stop offset=".12" stop-color="#FFD776"/><stop offset=".45" stop-color="#F3563B"/><stop offset=".65" stop-color="#D62F8E"/><stop offset=".92" stop-color="#5A4FCF"/></radialGradient></defs><rect width="24" height="24" rx="6" fill="url(#${id})"/><rect x="5.2" y="5.2" width="13.6" height="13.6" rx="4" fill="none" stroke="#fff" stroke-width="1.8"/><circle cx="12" cy="12" r="3.2" fill="none" stroke="#fff" stroke-width="1.8"/><circle cx="16.3" cy="7.7" r="1.05" fill="#fff"/></svg>`;
  }
  return "";
}
export const LOGO_SVG = '<svg class="rs-logo" viewBox="0 0 64 64" aria-hidden="true"><rect width="64" height="64" rx="16" fill="#1A1826"/><rect x="9" y="28.5" width="14" height="7" rx="3.5" fill="#E5484D"/><rect x="25" y="28.5" width="14" height="7" rx="3.5" fill="#F2A516"/><rect x="41" y="28.5" width="14" height="7" rx="3.5" fill="#22A06B"/><rect x="34.5" y="15" width="9" height="34" rx="4.5" fill="#FFFFFF" stroke="#1A1826" stroke-width="3.5"/></svg>';

const CHOICES = { line: LINE_CHOICES, feel: FEEL_CHOICES };
const KEYS = { line: ["out", "moya", "safe"], feel: ["only", "friend", "anyone"] };

// ---------- 結果のまとめ ----------
/**
 * 結果のまとめ（画面・共有画像・共有の文で共通の形）
 * @returns {{kind, type, answers, word, res, rank, avg}|null}
 */
export function buildModel(kind, answers, word) {
  const res = kind === "feel" ? scoreFeel(answers) : scoreLine(answers);
  if (!res || !res.typeId) return null;
  const type = typeById(res.typeId);
  if (!type) return null;
  return { kind: kind === "feel" ? "feel" : "line", type, answers, word: word || "i", res, rank: null, avg: null };
}

/** みんなの平均（許せる度の分布 hist から） */
function avgFromHist(hist) {
  if (!Array.isArray(hist) || hist.length !== 21) return null;
  let n = 0;
  let s = 0;
  hist.forEach((c, b) => { n += c; s += c * (b === 20 ? 100 : b * 5 + 2); });
  return n >= STATS_MIN ? Math.round(s / n) : null;
}

/** タイプの絵（無いときは色の面と頭文字） */
function artHTML(type, cls = "rs-art") {
  const src = new URL(`../img/types/${type.id}.webp`, import.meta.url).href;
  const initial = [...type.name][0];
  return `<div class="${cls}" data-art>
    <span class="rs-art-ph" aria-hidden="true">${esc(initial)}<i></i></span>
    <img class="rs-art-img" src="${esc(src)}" alt="${esc(type.name)}の絵" width="240" height="240" decoding="async" hidden>
  </div>`;
}
/** 絵が読めたら出す（無いときは仮の面のまま） */
function wireArt(root) {
  root.querySelectorAll("[data-art]").forEach((box) => {
    const img = box.querySelector("img");
    const show = () => { if (img.naturalWidth) { img.hidden = false; box.classList.add("has-img"); } };
    img.addEventListener("load", show);
    if (img.complete) show();
  });
}

function trailHTML(model) {
  if (!isAnswers(model.answers)) return "";
  const keys = KEYS[model.kind];
  return `<div class="trail rs-trail" aria-hidden="true">${[...model.answers].map((c) => `<i class="is-${keys[Number(c)]}"></i>`).join("")}</div>`;
}

/** 本音ラインの6タイプの地図 */
function typeMapHTML(model) {
  const rows = [["f1", "f2"], ["f3", "f4"], ["f5", "f6"]];
  const labels = ["特別が多い", "ほどほど", "特別は少なめ"];
  let s = '<div class="rs-map" role="img" aria-label="本音ラインの6タイプのうち、あなたの場所">';
  s += '<span></span><span class="rs-map-h">相手を選ぶ</span><span class="rs-map-h">誰とでも</span>';
  rows.forEach((pair, r) => {
    s += `<span class="rs-map-r">${labels[r]}</span>`;
    for (const id of pair) {
      const t = FEEL_TYPES.find((x) => x.id === id);
      const mine = id === model.type.id;
      s += `<span class="rs-map-c${mine ? " is-mine" : ""}"${mine ? ` style="--mc:${t.color}"` : ""}><span>${phraseHTML(t.name)}</span></span>`;
    }
  });
  return s + "</div>";
}

/**
 * 1画面に収まる部分（幅 390×高さ 844 で上から下まで切れずに入る・スクショ向け）
 * @param {object} model buildModel の形（友達のページでは answers が null のこともある）
 * @param {{who?: "me"|"friend"|"type", numbers?: boolean}} opts who="type" は数字なしのタイプの紹介 numbers=false でタイプだけ（友達のページで数字が読めないとき）
 */
export function renderShot(model, { who = "me", numbers = true } = {}) {
  const t = model.type;
  const isLine = model.kind === "line";
  const r = model.res || {};
  const whoLabel = who === "friend" ? "友達のタイプは" : who === "type" ? "タイプの紹介" : "あなたのタイプは";
  const kindLabel = who === "friend" ? "友達の結果" : who === "type" ? `${isLine ? "12" : "6"}タイプのひとつ` : `${isLine ? "浮気ライン" : "本音ライン"}の結果`;
  let nums = "";
  if (numbers) {
    if (isLine) {
      const second = r.counts
        ? `<div class="stat rs-stat" data-alt><span class="stat-label">アウトにした数</span><span class="stat-val num">${r.counts[0]}<small>問</small></span></div>`
        : "";
      nums = `<div class="rs-nums">
        <div class="rs-big"><span class="bignum-label">許せる度</span>
          <p class="bignum"><span class="bignum-val num" data-score>${r.score}</span><span class="bignum-unit">点</span></p></div>
        <div class="rs-stats">
          <div class="stat rs-stat"><span class="stat-label">モヤる率</span><span class="stat-val num">${r.gray}<small>%</small></span></div>
          ${second}
          <div class="stat rs-stat" data-rank hidden><span class="stat-label" data-rank-label>ゆるさの順位</span><span class="stat-val num"><small>上位</small><span data-top></span><small>%</small></span><span class="rs-stat-sub" data-n></span></div>
        </div>
      </div>
      <div class="rs-meter">
        <div class="meter rs-mainmeter" style="--v:50" data-v="${r.score}"><div class="meter-track"></div><span class="meter-avg" hidden></span><span class="meter-mark"></span></div>
        <div class="meter-scale"><span>きびしい</span><span class="rs-avg-note" hidden>三角はみんなの平均</span><span>ゆるい</span></div>
      </div>
      ${r.cats ? `<div class="meters rs-cats">${CATEGORIES.map((c) => `<div class="meter-row"><span class="meter-name">${esc(c.short)}</span><div class="meter" style="--v:50" data-v="${r.cats[c.id]}"><div class="meter-track"></div><span class="meter-mark"></span></div><span class="meter-val num">${r.cats[c.id]}</span></div>`).join("")}</div>` : ""}`;
    } else {
      const sig = Array.isArray(r.signals) ? r.signals.length : r.n;
      nums = `<div class="rs-nums">
        <div class="rs-big"><span class="bignum-label">気になる人にだけ</span>
          <p class="bignum"><span class="bignum-val num" data-score>${r.special}</span><span class="bignum-unit">%</span></p></div>
        <div class="rs-stats">
          <div class="stat rs-stat"><span class="stat-label">ひらき度</span><span class="stat-val num">${r.open}</span></div>
          ${sig != null ? `<div class="stat rs-stat"><span class="stat-label">本気サイン</span><span class="stat-val num">${sig}<small>個</small></span></div>` : ""}
        </div>
      </div>
      <div class="rs-meter">
        <div class="meter meter--feel rs-mainmeter" style="--v:50" data-v="${r.open}"><div class="meter-track"></div><span class="meter-mark"></span></div>
        <div class="meter-scale meter-scale--feel"><span>特別な人にだけ</span><span>誰とでも</span></div>
      </div>
      ${typeMapHTML(model)}`;
    }
  } else {
    nums = `<p class="rs-nonum">${esc(t.desc)}</p>`;
  }
  const el = h(`<section class="rs-shot rs-shot--${model.kind}${numbers ? "" : " rs-shot--nonum"}" style="--tc:${esc(t.color)}" aria-label="結果のまとめ">
    <div class="rs-shot-top">
      <span class="rs-brand">${LOGO_SVG}<span class="rs-brand-text"><b>${esc(SITE_NAME)}</b>${SITE_SUB ? `<small>${esc(SITE_SUB)}</small>` : ""}</span></span>
      <span class="rs-shot-kind">${kindLabel}</span>
    </div>
    <div class="rs-hero">
      <div class="rs-hero-text">
        <span class="rs-hero-label">${whoLabel}</span>
        <h2 class="rs-type-name">${phraseHTML(t.name)}</h2>
        <p class="rs-type-catch">${esc(t.catch)}</p>
      </div>
      ${artHTML(t)}
      ${trailHTML(model)}
    </div>
    ${nums}
    <div class="rs-shot-foot"><span class="rs-url">${SHORT_URL}</span><span class="rs-foot-note">${END_LABEL}までの期間限定</span></div>
  </section>`);
  wireArt(el);
  watchTypeName(el);
  // メーターの印を動かす（最初は真ん中→本当の値）
  requestAnimationFrame(() => requestAnimationFrame(() => {
    el.querySelectorAll(".meter[data-v]").forEach((m) => m.style.setProperty("--v", m.dataset.v));
  }));
  return el;
}

/** 上位◯%（◯人中）を出す（半分より下は「きびしさ 上位◯%」） */
export function applyRank(shot, model) {
  const box = shot.querySelector("[data-rank]");
  if (!box || !model.rank || model.rank.top == null) return;
  const rv = rankView(model.rank.top);
  box.querySelector("[data-rank-label]").textContent = `${rv.label}の順位`;
  box.querySelector("[data-top]").textContent = rv.value;
  box.dataset.side = rv.side;
  box.querySelector("[data-n]").textContent = model.rank.n ? `${model.rank.n.toLocaleString("ja-JP")}人中` : "";
  box.hidden = false;
  const alt = shot.querySelector("[data-alt]");
  if (alt) alt.hidden = true;
}
/** みんなの平均の三角（自分の点と近いときは、印に隠れるので三角を出さずに「みんなの平均とほぼ同じ」と書く） */
function applyAvg(shot, model) {
  if (model.avg == null) return;
  const a = shot.querySelector(".rs-mainmeter .meter-avg");
  if (!a) return;
  const near = Math.abs(model.res.score - model.avg) <= AVG_NEAR;
  a.style.setProperty("--a", model.avg);
  a.hidden = near;
  const note = shot.querySelector(".rs-avg-note");
  if (note) {
    note.textContent = near ? "みんなの平均とほぼ同じ" : "三角はみんなの平均";
    note.classList.toggle("is-near", near);
    note.hidden = false;
  }
}

// ---------- 下の部分 ----------
function aboutHTML(model) {
  const t = model.type;
  const tipLabel = model.kind === "line" ? "恋人へのひとこと" : "好きな人へのひとこと";
  return `<section class="section rs-about stack" style="--tc:${esc(t.color)}">
    <span class="eyebrow">${model.kind === "line" ? "あなたの浮気ラインのタイプ" : "あなたの本音ラインのタイプ"}</span>
    <h2 class="h2 rs-about-name">${phraseHTML(t.name)}<span class="rs-about-catch">${esc(t.catch)}</span></h2>
    <p class="lead">${esc(t.desc)}</p>
    <div class="rs-points">
      <div class="rs-point"><span class="rs-point-label">いいところ</span><p>${esc(t.good)}</p></div>
      <div class="rs-point rs-point--tip"><span class="rs-point-label">${tipLabel}</span><p>「${esc(t.tip)}」</p></div>
    </div>
  </section>`;
}

/** 30問の自分の答えとみんなの割合 */
function answersSection(model) {
  const kind = model.kind;
  const ch = CHOICES[kind];
  const keys = KEYS[kind];
  const counts = [0, 0, 0];
  for (const c of model.answers) counts[Number(c)]++;
  const el = h(`<section class="section rs-answers stack">
    <div class="stack stack-sm">
      <span class="eyebrow">30問の答え</span>
      <h2 class="h2">あなたの答えと、みんなの割合</h2>
      <p class="small muted" data-stats-note>みんなの割合を読みこんでいます…</p>
    </div>
    <div class="chips">${ch.map((c, v) => `<span class="chip chip--${keys[v]} chip--dot">${esc(c.label)} <b class="num">${counts[v]}</b></span>`).join("")}</div>
    <div class="seg rs-filter" role="group" aria-label="答えで絞りこむ">
      <button class="seg-btn" type="button" aria-pressed="true" data-f="all">全部</button>
      ${ch.map((c, v) => `<button class="seg-btn" type="button" aria-pressed="false" data-f="${v}">${esc(kind === "line" ? c.label : ["特別", "友達", "誰でも"][v])}</button>`).join("")}
    </div>
    <div class="band-list rs-qlist"></div>
    <button class="btn btn-secondary btn-block rs-more" type="button">${icon("down")}30問ぜんぶ見る</button>
  </section>`);
  const list = el.querySelector(".rs-qlist");
  QUESTIONS.forEach((q, i) => {
    const v = Number(model.answers[i]);
    const row = h(`<div class="band-row rs-qrow" data-v="${v}" data-i="${i}">
      <p class="band-q"><span class="band-qn">Q${i + 1}</span><span>${esc(applyWord(q.text, model.word))}</span></p>
      <div class="rs-qband" hidden></div>
      <div class="band-meta"><span class="chip chip--${keys[v]} is-solid chip-sm">あなた ${esc(ch[v].label)}</span><span class="rs-minor" hidden><span class="chip chip--ink chip-sm">少数派</span></span><span class="small muted rs-qnote"></span></div>
    </div>`);
    list.append(row);
  });
  // 最初は8問だけ（ぜんぶ見るで開く）
  const LIMIT = 8;
  let expanded = false;
  let filter = "all";
  const more = el.querySelector(".rs-more");
  function apply() {
    let shown = 0;
    list.querySelectorAll(".rs-qrow").forEach((row) => {
      const hit = filter === "all" || row.dataset.v === filter;
      const on = hit && (expanded || filter !== "all" || shown < LIMIT);
      row.hidden = !on;
      if (on) shown++;
    });
    more.hidden = expanded || filter !== "all";
  }
  el.querySelectorAll(".rs-filter .seg-btn").forEach((b) => b.addEventListener("click", () => {
    filter = b.dataset.f;
    el.querySelectorAll(".rs-filter .seg-btn").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
    apply();
  }));
  more.addEventListener("click", () => { expanded = true; apply(); });
  apply();
  return el;
}

/** みんなの割合を答えの一覧に入れる */
function applyStatsToAnswers(el, model, stats) {
  const note = el.querySelector("[data-stats-note]");
  const kind = model.kind;
  const n = stats && stats.n ? stats.n[kind] || 0 : 0;
  const q = stats && stats.q ? stats.q[kind] : null;
  if (!stats || !q || n < STATS_MIN) {
    note.textContent = stats
      ? `みんなの割合は集計中です（いま${n.toLocaleString("ja-JP")}人）。${STATS_MIN}人をこえると出ます。`
      : "みんなの割合は、いまは読みこめませんでした。";
    return;
  }
  note.textContent = `${n.toLocaleString("ja-JP")}人の答えとくらべています。自分の答えを選んだ人が${MINOR_PCT}%より少ない問題に「少数派」の印。`;
  const ch = CHOICES[kind];
  const keys = KEYS[kind];
  el.querySelectorAll(".rs-qrow").forEach((row) => {
    const i = Number(row.dataset.i);
    const v = Number(row.dataset.v);
    const c = q[i] || [0, 0, 0];
    const tot = c[0] + c[1] + c[2];
    if (!tot) return;
    const pct = pcts(c);
    const band = row.querySelector(".rs-qband");
    band.className = "band rs-qband";
    band.setAttribute("role", "img");
    band.setAttribute("aria-label", ch.map((x, k) => `${x.label}${pct[k]}%`).join(" "));
    band.innerHTML = ch.map((x, k) => `<span class="band-seg band-seg--${keys[k]}${k === v ? " is-mine" : ""}" style="--w:${c[k]}"${c[k] === 0 ? " hidden" : ""}><span class="band-pct">${pct[k]}%</span></span>`).join("");
    band.hidden = false;
    if (pct[v] < MINOR_PCT) row.querySelector(".rs-minor").hidden = false;
    row.querySelector(".rs-qnote").textContent = `同じ答えは${pct[v]}%`;
  });
}

/** 画像を保存・共有（投稿用・ストーリー用・くわしい画像） */
function saveSection(ctx) {
  const el = h(`<section class="section rs-save stack" id="rs-save">
    <div class="stack stack-sm">
      <span class="eyebrow">画像で残す</span>
      <h2 class="h2">画像を保存・シェア</h2>
      <p class="small muted">${isPhone() ? "共有の画面から「画像を保存」や、インスタ・LINE に送れます。" : "PNG の画像をダウンロードします。"}</p>
    </div>
    <div class="seg rs-variant" role="group" aria-label="画像の形">
      <button class="seg-btn" type="button" aria-pressed="true" data-variant="post">投稿用</button>
      <button class="seg-btn" type="button" aria-pressed="false" data-variant="story">ストーリー用</button>
      <button class="seg-btn" type="button" aria-pressed="false" data-variant="detail">くわしい</button>
    </div>
    <div class="rs-preview" data-variant="post">
      <div class="rs-preview-frame"><span class="spinner" aria-hidden="true"></span><img class="rs-preview-img" alt="共有画像の見本" hidden></div>
      <p class="small muted rs-preview-cap"></p>
    </div>
    <button class="btn btn-primary btn-lg btn-block" type="button" data-save>${icon("save")}画像を保存・シェア</button>
  </section>`);
  const caps = {
    post: "投稿用 1080×1350。X やインスタの投稿にちょうどいい形です。",
    story: "ストーリー用 1080×1920。インスタのストーリーにそのまま貼れます。",
    detail: "くわしい画像。30問の答えを全部のせた縦長の画像です。",
  };
  let current = "post";
  const img = el.querySelector(".rs-preview-img");
  const spin = el.querySelector(".spinner");
  const cap = el.querySelector(".rs-preview-cap");
  async function show(variant) {
    current = variant;
    el.querySelector(".rs-preview").dataset.variant = variant;
    cap.textContent = caps[variant];
    img.hidden = true;
    spin.hidden = false;
    const url = await ctx.previewUrl(variant);
    if (current !== variant) return;
    spin.hidden = true;
    if (url) { img.src = url; img.hidden = false; }
    else cap.textContent = "画像を作れませんでした。もう一度押してください。";
  }
  el.querySelectorAll(".rs-variant .seg-btn").forEach((b) => b.addEventListener("click", () => {
    el.querySelectorAll(".rs-variant .seg-btn").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
    show(b.dataset.variant);
  }));
  el.querySelector("[data-save]").addEventListener("click", () => ctx.saveVariant(current));
  // 近くまで来たら見本を作る
  let started = false;
  const start = () => { if (!started) { started = true; show("post"); } };
  if ("IntersectionObserver" in window) {
    const io = new IntersectionObserver((ents) => { if (ents.some((e) => e.isIntersecting)) { io.disconnect(); start(); } }, { rootMargin: "800px 0px" });
    io.observe(el);
  } else start();
  el.refresh = () => { if (started) show(current); };
  return el;
}

/** 共有ボタン（X・LINE・Instagram・リンクをコピー） */
function shareSection(ctx) {
  const el = h(`<section class="section rs-share stack">
    <div class="stack stack-sm">
      <span class="eyebrow">友達に見せる</span>
      <h2 class="h2">結果をシェア</h2>
      <p class="small muted">リンクを開くと、あなたの結果とタイプの画像が出ます。見た人も、そのまま診断できます。</p>
    </div>
    <div class="rs-share-grid">
      <button class="btn btn-secondary rs-sbtn" type="button" data-m="x">${brandIcon("x")}X でポスト</button>
      <button class="btn btn-secondary rs-sbtn" type="button" data-m="line">${brandIcon("line")}LINE で送る</button>
      <button class="btn btn-secondary rs-sbtn" type="button" data-m="instagram">${brandIcon("instagram")}インスタ</button>
      <button class="btn btn-secondary rs-sbtn" type="button" data-m="copy">${icon("link")}リンクをコピー</button>
    </div>
    ${navigator.share && isPhone() ? `<button class="btn btn-ghost btn-block" type="button" data-m="native">${icon("share")}ほかのアプリで送る</button>` : ""}
  </section>`);
  el.querySelectorAll("[data-m]").forEach((b) => b.addEventListener("click", () => ctx.share(b.dataset.m)));
  return el;
}

/** 1画面の部分のすぐ下の、小さな共有ボタン */
function quickShare(ctx) {
  const el = h(`<div class="rs-quick" role="group" aria-label="結果をシェア">
    <button class="rs-qbtn" type="button" data-m="image"><span class="rs-qic rs-qic--ink">${icon("save")}</span><span>画像を保存</span></button>
    <button class="rs-qbtn" type="button" data-m="x"><span class="rs-qic">${brandIcon("x")}</span><span>X</span></button>
    <button class="rs-qbtn" type="button" data-m="line"><span class="rs-qic">${brandIcon("line")}</span><span>LINE</span></button>
    <button class="rs-qbtn" type="button" data-m="instagram"><span class="rs-qic">${brandIcon("instagram")}</span><span>インスタ</span></button>
    <button class="rs-qbtn" type="button" data-m="copy"><span class="rs-qic rs-qic--line">${icon("link")}</span><span>コピー</span></button>
  </div>`);
  el.querySelectorAll("[data-m]").forEach((b) => b.addEventListener("click", () => {
    if (b.dataset.m === "image") ctx.saveVariant("post");
    else ctx.share(b.dataset.m);
  }));
  return el;
}

function quizSection() {
  return h(`<section class="section rs-quiz">
    <div class="card card--ink rs-quiz-card stack">
      <span class="rs-quiz-ic">${icon("quiz")}</span>
      <p class="card-title">わたしの浮気ライン、当てられる？</p>
      <p class="card-sub">あなたの30問の答えを、友達や恋人が予想する「当てっこ」を作れます。何問当たったかで点数とランキングが出ます。</p>
      <p class="card-sub rs-quiz-note">結果のリンクや画像を先に見せると答えが分かってしまうので、当てっこは結果より先に送るのがおすすめです。</p>
      <a class="btn btn-block rs-quiz-btn" href="${ROOT_URL}q/?make=1">${icon("target")}当てっこを作る</a>
    </div>
  </section>`);
}

function otherSection(model, hasOther, hasGap) {
  const toFeel = model.kind === "line";
  const href = `${ROOT_URL}${toFeel ? "feel" : "line"}/`;
  const title = toFeel ? "本音ライン診断" : "浮気許せる度診断";
  const desc = toFeel
    ? "同じ30問を「あなたがするとしたら、相手は？」で答えます。気になる人にだけするのか、友達ともするのか。"
    : "同じ30問を「恋人がしたら？」で、アウト・モヤる・セーフに分けます。許せる度とタイプが出ます。";
  const extra = hasOther && hasGap
    ? `${toFeel ? "本音ライン" : "浮気ライン"}とのズレは、この下の「浮気ラインと本音のズレ」に出ています。`
    : hasOther ? "" : "両方やると、恋人に求めることと自分がすることの「ズレ」が分かります。";
  return h(`<section class="section rs-other stack stack-sm">
    <span class="eyebrow">もう一方の診断</span>
    <a class="entry-card${toFeel ? " entry-card--feel" : ""}" href="${href}">
      <span class="entry-title">${title}${hasOther ? "をもう一度" : "もやってみる"}</span>
      <span class="entry-desc">${esc(desc)}${extra ? `<br>${esc(extra)}` : ""}</span>
      <span class="entry-meta"><span>同じ30問・約3分</span><span class="entry-go">はじめる${icon("arrow", 2.2)}</span></span>
    </a>
  </section>`);
}

/** 浮気ラインと本音のズレ（両方やったとき） */
function gapSection(lineA, feelA, word) {
  const g = compareLineFeel(lineA, feelA);
  if (!g) return null;
  const items = g.items.filter((x) => x.d !== 0).sort((a, b) => (b.d - a.d) || (a.i - b.i));
  const sweetItems = items.filter((x) => x.d > 0);
  const kindItems = items.filter((x) => x.d < 0);
  const row = (x) => `<li class="rs-gap-item${x.d > 0 ? " is-sweet" : " is-kind"}">
      <p class="rs-gap-q"><span class="band-qn">Q${x.i + 1}</span><span>${esc(applyWord(QUESTIONS[x.i].text, word))}</span></p>
      <div class="rs-gap-pair">
        <span class="rs-gap-side"><small>恋人がしたら</small><span class="chip chip--${KEYS.line[x.j]} is-solid chip-sm">${esc(LINE_CHOICES[x.j].label)}</span></span>
        <span class="rs-gap-side"><small>自分がするなら</small><span class="chip chip--${KEYS.feel[x.f]} is-solid chip-sm">${esc(FEEL_CHOICES[x.f].label)}</span></span>
      </div>
    </li>`;
  const LIM = 6;
  // 段は自分に甘い度だけで決まる。恋人に広く許している（相手に寛大度が大きい）ときは、そのことも1行添えて数字と文を合わせる
  const kindNote = g.generous >= GENEROUS_NOTE
    ? `<p class="rs-gap-kind">${icon("info")}<span>そのかわり、恋人には自分より広く許しています（相手に寛大度 ${g.generous}）。</span></p>`
    : "";
  const el = h(`<section class="section rs-gap stack">
    <div class="stack stack-sm">
      <span class="eyebrow">2つの診断をくらべる</span>
      <h2 class="h2">浮気ラインと本音のズレ</h2>
      <p class="small muted">同じ30問で、「恋人がしたら」の答えと「自分がするなら」の答えをくらべました。</p>
    </div>
    <div class="card rs-gap-card stack">
      <span class="rs-gap-level">${esc(g.level.name)}</span>
      <p class="card-sub">${esc(g.level.desc)}</p>
      ${kindNote}
      <div class="stats-grid">
        <div class="stat"><span class="stat-label">自分に甘い度</span><span class="stat-val num">${g.sweet}</span></div>
        <div class="stat"><span class="stat-label">相手に寛大度</span><span class="stat-val num">${g.generous}</span></div>
        <div class="stat"><span class="stat-label">一致した数</span><span class="stat-val num">${g.same}<small>/30</small></span></div>
      </div>
      <div class="meter rs-gap-meter" style="--v:50" data-v="${g.sweet}"><div class="meter-track"></div><span class="meter-mark"></span></div>
      <div class="meter-scale meter-scale--plain"><span>自分に甘くない</span><span>自分に甘い</span></div>
      <p class="small muted">自分に甘い度＝恋人がしたら許せないことを、自分はもっと気軽にする度合い（アウトなのに友達や誰とでもする・モヤるなのに誰とでもする）。相手に寛大度＝自分がするより、恋人がするほうを広く許す度合い。</p>
    </div>
    ${sweetItems.length ? `<div class="stack stack-sm"><h3 class="h3">恋人には厳しく、自分には甘い行動</h3>
      <ul class="rs-gap-list" data-list="sweet">${sweetItems.map(row).join("")}</ul></div>` : `<p class="notice">${icon("info")}<span>恋人にだけ厳しい行動はありませんでした。</span></p>`}
    ${kindItems.length ? `<div class="stack stack-sm"><h3 class="h3">自分がするより、恋人には広く許せる行動</h3>
      <ul class="rs-gap-list" data-list="kind">${kindItems.map(row).join("")}</ul></div>` : ""}
  </section>`);
  el.querySelectorAll(".rs-gap-list").forEach((ul) => {
    const lis = [...ul.children];
    if (lis.length <= LIM) return;
    lis.slice(LIM).forEach((li) => { li.hidden = true; });
    const b = h(`<button class="btn btn-ghost btn-sm" type="button">${icon("down")}あと${lis.length - LIM}問を見る</button>`);
    b.addEventListener("click", () => { lis.forEach((li) => { li.hidden = false; }); b.remove(); });
    ul.after(b);
  });
  requestAnimationFrame(() => requestAnimationFrame(() => {
    el.querySelectorAll(".meter[data-v]").forEach((m) => m.style.setProperty("--v", m.dataset.v));
  }));
  return el;
}

/** 画像の保存がうまくいかなかったときなどの案内（モーダル） */
function openModal({ title, body, imgUrl, actions = [] }) {
  const id = `rs-m-${Date.now()}`;
  const m = h(`<div class="modal rs-modal" role="dialog" aria-modal="true" aria-labelledby="${id}">
    <div class="modal-panel">
      <button class="modal-close" type="button" aria-label="閉じる"></button>
      <p class="modal-title" id="${id}">${esc(title)}</p>
      <div class="modal-body">${body}</div>
      ${imgUrl ? `<img class="rs-modal-img" src="${imgUrl}" alt="共有画像">` : ""}
      <div class="modal-actions"></div>
    </div>
  </div>`);
  const close = () => { m.remove(); document.body.classList.remove("is-locked"); document.removeEventListener("keydown", onKey); };
  const onKey = (e) => { if (e.key === "Escape") close(); };
  const box = m.querySelector(".modal-actions");
  for (const a of actions) {
    const b = h(`<button class="btn ${a.primary ? "btn-primary" : "btn-ghost"} btn-block" type="button">${esc(a.label)}</button>`);
    b.addEventListener("click", () => { if (a.onClick) a.onClick(); if (a.close !== false) close(); });
    box.append(b);
  }
  if (!actions.length) {
    const b = h('<button class="btn btn-ghost btn-block" type="button">閉じる</button>');
    b.addEventListener("click", close);
    box.append(b);
  }
  m.querySelector(".modal-close").addEventListener("click", close);
  m.addEventListener("click", (e) => { if (e.target === m) close(); });
  document.addEventListener("keydown", onKey);
  document.body.append(m);
  document.body.classList.add("is-locked");
  const first = m.querySelector(".modal-actions .btn");
  if (first) first.focus();
  return close;
}

// ---------- 結果画面 ----------
/**
 * 結果画面を描く
 * @param {HTMLElement} container
 * @param {{kind:"line"|"feel", answers:string, attrs?:object, word?:string, playPromise?:Promise<{n:number,pct:number|null}|null>}} opts
 */
export function showResult(container, { kind, answers, attrs, word, playPromise } = {}) {
  ensureResultCss();
  const model = buildModel(kind, answers, word);
  container.textContent = "";
  if (!model) {
    container.append(h(`<div class="notice notice--warn">${icon("info")}<p>結果を出せませんでした。もう一度ためしてください。</p></div>`));
    return null;
  }
  void attrs; // 属性は統計に送るだけ（画面では使わない）
  const root = h(`<div class="rs" data-kind="${model.kind}"></div>`);
  container.append(root);

  // 共有の URL と文（rank が来たら作り直す）
  const shareUrl = () => (model.kind === "line"
    ? lineShareUrl(model.res, { word: model.word, top: model.rank ? model.rank.top : null, answers: model.answers })
    : feelShareUrl(model.res, { word: model.word, answers: model.answers }));

  // ---- 共有画像（押す前に作っておく：スマホの共有は押した直後に呼ぶ必要があるため） ----
  const blobs = {};
  const ready = {};
  const urls = {};
  function blobOf(variant) {
    if (!blobs[variant]) {
      blobs[variant] = cardBlob(variant, model).then((b) => { ready[variant] = b; return b; }).catch(() => { delete blobs[variant]; return null; });
    }
    return blobs[variant];
  }
  async function previewUrl(variant) {
    const b = await blobOf(variant);
    if (!b) return null;
    if (!urls[variant]) urls[variant] = URL.createObjectURL(b);
    return urls[variant];
  }
  function resetBlobs() {
    for (const k of Object.keys(blobs)) delete blobs[k];
    for (const k of Object.keys(ready)) delete ready[k];
    for (const k of Object.keys(urls)) { URL.revokeObjectURL(urls[k]); delete urls[k]; }
  }
  const variantName = { post: "image_post", story: "image_story", detail: "image_detail" };
  async function afterSave(result, variant, blob) {
    if (result === "downloaded" && !isPhone()) toast("画像を保存しました");
    if (result === "downloaded" && isPhone()) toast("画像をダウンロードしました");
    if (result === "blocked") {
      const url = await previewUrl(variant);
      openModal({
        title: "画像ができました",
        body: "<p>もう一度「保存・シェア」を押すか、画像を長押しして保存してね。</p>",
        imgUrl: url,
        actions: [{ label: "保存・シェア", primary: true, onClick: () => saveImage(blob, fileName(model, variant), { method: variantName[variant] }) }],
      });
    }
  }
  function saveVariant(variant) {
    const b = ready[variant];
    if (b) {
      saveImage(b, fileName(model, variant), { method: variantName[variant] }).then((r) => afterSave(r, variant, b));
      return;
    }
    toast("画像を作っています");
    blobOf(variant).then((b2) => {
      if (!b2) { toast("画像を作れませんでした", { error: true }); return; }
      saveImage(b2, fileName(model, variant), { method: variantName[variant] }).then((r) => afterSave(r, variant, b2));
    });
  }
  function shareBy(m) {
    const url = shareUrl();
    const text = shareText(model);
    if (m === "x") shareX(text, url);
    else if (m === "line") shareLine(shareText(model, { tag: false }), url);
    else if (m === "copy") copyLink(url);
    else if (m === "native") shareNative(shareText(model, { tag: false }), url);
    else if (m === "instagram") {
      const go = (b) => shareInstagram(b, fileName(model, "story")).then((r) => {
        if (r === "downloaded") {
          openModal({
            title: "ストーリー用の画像を保存しました",
            body: "<p>インスタを開いて、ストーリーを作るところから、保存した画像を選んで貼ってね。</p><p class=\"small muted\">リンクのスタンプに、コピーした結果のリンクを貼ると、見た人が結果のページを開けます。</p>",
            actions: [{ label: "結果のリンクをコピー", primary: true, onClick: () => copyLink(url) }, { label: "閉じる" }],
          });
        } else if (r === "blocked") {
          afterSave("blocked", "story", b);
        }
      });
      if (ready.story) go(ready.story);
      else { toast("画像を作っています"); blobOf("story").then((b) => { if (b) go(b); }); }
    }
  }
  const ctx = { previewUrl, saveVariant, share: shareBy };

  // ---- 1画面に収まる部分 ----
  const shot = renderShot(model);
  root.append(shot);
  root.append(quickShare(ctx));
  root.append(h(`<p class="rs-shot-hint">${icon("info")}ここまでの枠が、スクショ1枚にちょうど収まります。</p>`));

  // ---- 下の部分 ----
  root.append(h(aboutHTML(model)));
  const ans = answersSection(model);
  root.append(ans);
  const save = saveSection(ctx);
  root.append(save);
  root.append(shareSection(ctx));
  if (model.kind === "line") root.append(quizSection());
  const otherKind = model.kind === "line" ? "feel" : "line";
  const other = readSaved(otherKind);
  let gap = null;
  if (other) {
    const lineA = model.kind === "line" ? model.answers : other.answers;
    const feelA = model.kind === "feel" ? model.answers : other.answers;
    gap = gapSection(lineA, feelA, model.word);
  }
  root.append(otherSection(model, !!other, !!gap));
  if (gap) root.append(gap);
  const sis = h('<section class="section rs-sister"></section>');
  root.append(sis);
  renderSister(sis, { place: "result" });
  const again = h(`<section class="section rs-again center">
    <button class="btn btn-ghost" type="button">${icon("again")}もう一度やる</button>
  </section>`);
  again.querySelector("button").addEventListener("click", () => {
    // 画面担当が受け取れるように知らせる（受け取らなければ、そのページを開き直す）
    const ev = new CustomEvent("ul:again", { bubbles: true, cancelable: true, detail: { kind: model.kind } });
    if (container.dispatchEvent(ev)) location.assign(`${ROOT_URL}${model.kind}/`);
  });
  root.append(again);

  // いちばん上から見せる
  try { window.scrollTo({ top: 0, behavior: "instant" }); } catch { window.scrollTo(0, 0); }

  // ---- みんなの統計（平均と、30問の割合） ----
  const statsDone = fetchStats().then((stats) => {
    applyStatsToAnswers(ans, model, stats);
    if (model.kind === "line" && stats && stats.hist) {
      const avg = avgFromHist(stats.hist.line);
      if (avg != null) { model.avg = avg; applyAvg(shot, model); resetBlobs(); save.refresh(); }
    }
  });

  // ---- 上位◯%（POST /api/play の返事） ----
  const rankP = Promise.resolve(playPromise || null).then((p) => {
    if (model.kind !== "line" || !p || p.pct == null || !Number.isFinite(Number(p.pct))) return;
    const top = Math.min(100, Math.max(1, 100 - Math.round(Number(p.pct))));
    model.rank = { top, n: Number(p.n) || null };
    applyRank(shot, model);
    resetBlobs();
    save.refresh();
  }).catch(() => {});

  // 共有画像を先に作っておく（上位の数字とみんなの平均を少し待ってから。画面の書体がそろってから始めて、上の部分の書体を遅らせない）
  //   スマホの共有は押した直後に呼ぶ必要があるので、見本の近くに来るまで待たずに作っておく（すぐ下の「画像を保存」「インスタ」用）
  Promise.race([Promise.all([rankP, statsDone]), sleep(2500)])
    .then(() => (document.fonts && document.fonts.ready ? Promise.race([document.fonts.ready, sleep(4000)]) : null))
    .then(() => sleep(300)).then(() => blobOf("post")).then(() => blobOf("story"));
  // 数字がそろった印（テスト用）
  Promise.all([rankP, statsDone]).then(() => { root.dataset.settled = "1"; });

  return { model, root, shot, shareUrl };
}
