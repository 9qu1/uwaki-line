// 共有画像を canvas で描く（結果担当）
//   投稿用 1080×1350（post）／ストーリー用 1080×1920（story）／くわしい画像 1080×縦長（detail・30問の答え全部）
//
//   drawCard(variant, model)  → Promise<HTMLCanvasElement>
//   cardBlob(variant, model)  → Promise<Blob>（PNG）
//   loadCardFonts(model, variant) → 描く文字を全部つないで document.fonts.load で待つ（docs/design.md §4）
//                                   問題文はくわしい画像（detail）にしか描かないので、そのときだけ読む（書体のファイルを読みすぎない）
//
// model は result.js の buildModel の形:
//   { kind: "line"|"feel", type, answers, word, res, rank: {top, n}|null, avg }
//
// 同じ model なら何回描いても同じ画像になるようにする（書体と絵を読み終えてから描く・乱数を使わない）。
// 絵文字は使わない。サイト名と URL は必ず入れる。
import { SITE_NAME, SITE_SUB, END_LABEL } from "./config.js";
import { QUESTIONS, CATEGORIES, LINE_CHOICES, FEEL_CHOICES } from "./data/questions.js";
import { FEEL_TYPES } from "./data/types.js";
import { applyWord } from "./engine.js";
import { rankView, nameUnits, AVG_NEAR } from "./share.js";

const W = 1080;
const SHORT_URL = "9qu1.com/uwaki-line";

// 色（base.css の :root と同じ値）
const C = {
  bg: "#F5F1EA", bg2: "#ECE6DB", surface: "#FFFFFF", surface2: "#FBF8F3",
  ink: "#1A1826", ink2: "#4A4657", muted: "#66616F", line: "#E3DCCF", lineStrong: "#CEC4B4",
  out: "#E5484D", outInk: "#B8262B", outSoft: "#FDECEC", outLine: "#F5C2C3",
  moya: "#F2A516", moyaInk: "#8F5600", moyaSoft: "#FFF3D9", moyaLine: "#F5D693",
  safe: "#22A06B", safeInk: "#157148", safeSoft: "#E3F4EB", safeLine: "#A9DCC2",
  only: "#8A4DE8", onlyInk: "#6430C0", onlySoft: "#F1EAFE", onlyLine: "#D4C1FA",
  friend: "#2F80ED", friendInk: "#1A5FC0", friendSoft: "#E7F0FE", friendLine: "#B8D2FA",
  anyone: "#64748B", anyoneInk: "#46526A", anyoneSoft: "#EDF0F4", anyoneLine: "#C9D1DC",
};
// 答えの色（値 0・1・2 の順）
const ANS = {
  line: [
    { fill: C.out, ink: C.outInk, soft: C.outSoft, line: C.outLine, text: "#FFFFFF" },
    { fill: C.moya, ink: C.moyaInk, soft: C.moyaSoft, line: C.moyaLine, text: C.ink },
    { fill: C.safe, ink: C.safeInk, soft: C.safeSoft, line: C.safeLine, text: "#FFFFFF" },
  ],
  feel: [
    { fill: C.only, ink: C.onlyInk, soft: C.onlySoft, line: C.onlyLine, text: "#FFFFFF" },
    { fill: C.friend, ink: C.friendInk, soft: C.friendSoft, line: C.friendLine, text: "#FFFFFF" },
    { fill: C.anyone, ink: C.anyoneInk, soft: C.anyoneSoft, line: C.anyoneLine, text: "#FFFFFF" },
  ],
};
const FD = '"Zen Kaku Gothic New", "Hiragino Sans", "Hiragino Kaku Gothic ProN", "Noto Sans JP", sans-serif';
const FN = '"Bricolage Grotesque", "Zen Kaku Gothic New", sans-serif';
// 書体の <link>（各ページの <head> と同じ URL。docs/design.md §2）。数字の書体は使う字だけ（text=）を読む
const FONT_CSS_JA = "https://fonts.googleapis.com/css2?family=Zen+Kaku+Gothic+New:wght@700;900&display=swap";
const FONT_CSS_NUM = "https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,700..800&display=swap&text=0123456789%25%2F.%2C%2B-%3A";

const f = (w, s) => `${w} ${s}px ${FD}`;
const fn = (s, w = 800) => `${w} ${s}px ${FN}`;

// ---------- 書体 ----------
/** 書体の <link> が無いページでも描けるように足す（あれば何もしない）。和文と数字の2つ */
function ensureFontLinks() {
  const links = [...document.querySelectorAll('link[rel="stylesheet"]')];
  const one = (key, href) => {
    let link = links.find((l) => (l.href || "").includes(key));
    if (!link) {
      link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = href;
      document.head.append(link);
    }
    return link;
  };
  return [one("Zen+Kaku+Gothic+New", FONT_CSS_JA), one("Bricolage+Grotesque", FONT_CSS_NUM)];
}
function waitSheet(link) {
  if (link.sheet) return Promise.resolve();
  return new Promise((ok) => {
    const done = () => ok();
    link.addEventListener("load", done, { once: true });
    link.addEventListener("error", done, { once: true });
    setTimeout(done, 5000);
  });
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** その書体の面が読み終わっているか（check は面が無いときも true を返すので、面があることも確かめる） */
function faceReady(family, weight) {
  let found = false;
  for (const ff of document.fonts) {
    if (ff.family.replace(/["']/g, "") !== family) continue;
    const w = String(ff.weight);
    if (!(w === String(weight) || (w.includes(" ") && Number(w.split(" ")[0]) <= weight && weight <= Number(w.split(" ")[1])))) continue;
    if (ff.status === "loaded") found = true;
  }
  return found;
}

/** canvas に描くラベル（ここに無い文字を描くと、その字だけ書体の読みこみが間に合わないことがある） */
const LABELS = [
  "あなたのタイプは", "30問の答え", "許せる度", "気になる人にだけ", "点", "%", "個", "問", "Q",
  "モヤる率", "ゆるさの順位", "きびしさの順位", "上位", "人中", "アウトにした数", "ひらき度", "本気サイン", "30問中",
  "きびしい", "ゆるい", "三角はみんなの平均", "みんなの平均とほぼ同じ", "特別な人にだけ", "誰とでも", "相手を選ぶ", "特別が多い", "ほどほど", "特別は少なめ",
  "あなたの浮気ラインは？", "あなたの本音ラインは？", "浮気許せる度診断の結果", "本音ライン診断の結果", "までの期間限定",
];
/** 描く文字を全部つないだもの（名前・肩書き・ラベル・数字。withQuestions のときは問題文も） */
function allText(model, withQuestions = false) {
  const t = model.type;
  const parts = [
    SITE_NAME, SITE_SUB, SHORT_URL, END_LABEL, ...LABELS,
    t.name, t.catch,
    ...CATEGORIES.map((c) => c.label + c.short),
    ...LINE_CHOICES.map((c) => c.label), ...FEEL_CHOICES.map((c) => c.label),
    ...FEEL_TYPES.map((x) => x.name), // 本音ラインの6タイプの地図
    ...(withQuestions ? QUESTIONS.map((q) => applyWord(q.text, model.word)) : []),
    "0123456789,.%/",
  ];
  return [...new Set([...parts.join("")])].join("");
}

/**
 * 描く前に書体を読み終える（1枚目だけ別の書体になる落とし穴の対策）
 *   問題文はくわしい画像（detail）に太さ 700 でしか描かないので、そのときだけ 700 で読む
 */
// 回線が遅くて書体が届かないときも、8秒で端末の書体に切りかえて描く（「作っています」のまま止まらないように）
export async function loadCardFonts(model, variant = "post") {
  await Promise.race([loadCardFontsInner(model, variant), sleep(8000)]);
}

async function loadCardFontsInner(model, variant) {
  if (typeof document === "undefined" || !document.fonts) return;
  const links = ensureFontLinks();
  await Promise.all(links.map(waitSheet));
  const text900 = allText(model, false);
  const text700 = allText(model, variant === "detail");
  const nums = "0123456789%/.,+-";
  for (let i = 0; i < 3; i++) {
    try {
      await Promise.all([
        document.fonts.load(`900 64px "Zen Kaku Gothic New"`, text900),
        document.fonts.load(`700 64px "Zen Kaku Gothic New"`, text700),
        document.fonts.load(`800 64px "Bricolage Grotesque"`, nums),
      ]);
      await document.fonts.ready;
    } catch { /* 読めないときは端末の書体で描く */ }
    const ok = document.fonts.check(`900 64px "Zen Kaku Gothic New"`, text900)
      && document.fonts.check(`700 64px "Zen Kaku Gothic New"`, text700)
      && faceReady("Zen Kaku Gothic New", 900) && faceReady("Zen Kaku Gothic New", 700) && faceReady("Bricolage Grotesque", 800);
    if (ok) return;
    await sleep(300);
  }
}

// ---------- 絵 ----------
const artCache = new Map();
/** タイプの絵（無いときは null → 色の面と頭文字で描く） */
export function loadArt(typeId) {
  if (!artCache.has(typeId)) {
    const src = new URL(`../img/types/${typeId}.webp`, import.meta.url).href;
    artCache.set(typeId, new Promise((ok) => {
      const img = new Image();
      img.decoding = "async";
      img.onload = async () => {
        try { await img.decode(); } catch { /* そのまま */ }
        ok(img.naturalWidth ? img : null);
      };
      img.onerror = () => ok(null);
      img.src = src;
    }));
  }
  return artCache.get(typeId);
}

// ---------- 描く小物 ----------
function rr(ctx, x, y, w, h, r) {
  const k = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + k, y);
  ctx.arcTo(x + w, y, x + w, y + h, k);
  ctx.arcTo(x + w, y + h, x, y + h, k);
  ctx.arcTo(x, y + h, x, y, k);
  ctx.arcTo(x, y, x + w, y, k);
  ctx.closePath();
}
function fillRR(ctx, x, y, w, h, r, color) {
  ctx.fillStyle = color;
  rr(ctx, x, y, w, h, r);
  ctx.fill();
}

// 行頭に来てはいけない字（前の単位にくっつける）・行末に来てはいけない字（後ろにくっつける）
const NO_START = "、。，．・：；？！ー―…‥）」』】〕〉》｝)]}ぁぃぅぇぉっゃゅょゎァィゥェォッャュョヮヵヶ％%";
const NO_END = "（「『【〔〈《｛([{";
let segmenter = null;
function units(text) {
  let segs;
  try {
    if (!segmenter) segmenter = new Intl.Segmenter("ja", { granularity: "word" });
    segs = [...segmenter.segment(text)].map((s) => s.segment);
  } catch {
    segs = [...text];
  }
  const out = [];
  for (const s of segs) {
    const last = out[out.length - 1];
    if (last != null && (NO_START.includes(s[0]) || NO_END.includes(last.slice(-1)))) out[out.length - 1] = last + s;
    else out.push(s);
  }
  return out;
}
/** 幅に収まるよう折り返す（文節の切れ目で。長すぎる単位は字で切る） */
function wrap(ctx, text, maxW, pre = null) {
  const lines = [];
  let cur = "";
  for (const u of pre || units(String(text))) {
    if (ctx.measureText(cur + u).width <= maxW) { cur += u; continue; }
    if (cur) { lines.push(cur); cur = ""; }
    if (ctx.measureText(u).width <= maxW) { cur = u; continue; }
    for (const ch of u) {
      if (cur && ctx.measureText(cur + ch).width > maxW && !NO_START.includes(ch)) { lines.push(cur); cur = ch; }
      else cur += ch;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}
/** 決まった行数に収まるいちばん大きな字の大きさ（name: true ならタイプの名前の切れ目で折り返す） */
function fit(ctx, text, { weight = 900, max, min, width, lines = 1, name = false }) {
  const pre = name ? nameUnits(text) : null;
  for (let s = max; s >= min; s -= 2) {
    ctx.font = f(weight, s);
    const ls = wrap(ctx, text, width, pre);
    if (ls.length <= lines) return { size: s, lines: ls };
  }
  ctx.font = f(weight, min);
  return { size: min, lines: wrap(ctx, text, width, pre) };
}
/** 1行の文字（はみ出すときは縮める） */
function text1(ctx, s, x, y, { font, color, align = "left", maxW = 0, base = "alphabetic" }) {
  ctx.font = font;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = base;
  if (maxW) ctx.fillText(s, x, y, maxW);
  else ctx.fillText(s, x, y);
}

/** ロゴ（site/favicon.svg と同じ形） */
function drawLogo(ctx, x, y, s) {
  const k = s / 64;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(k, k);
  fillRR(ctx, 0, 0, 64, 64, 16, C.ink);
  fillRR(ctx, 9, 28.5, 14, 7, 3.5, C.out);
  fillRR(ctx, 25, 28.5, 14, 7, 3.5, C.moya);
  fillRR(ctx, 41, 28.5, 14, 7, 3.5, C.safe);
  rr(ctx, 34.5, 15, 9, 34, 4.5);
  ctx.fillStyle = "#FFFFFF";
  ctx.fill();
  ctx.lineWidth = 3.5;
  ctx.strokeStyle = C.ink;
  ctx.stroke();
  ctx.restore();
}

/** 3色の線（サイトの印） */
function drawTri(ctx, x, y, w, h, kind = "line", r = h / 2) {
  const cols = kind === "feel" ? [C.only, C.friend, C.anyone] : [C.out, C.moya, C.safe];
  const gap = Math.max(4, w * 0.035);
  const sw = (w - gap * 2) / 3;
  cols.forEach((c, i) => fillRR(ctx, x + i * (sw + gap), y, sw, h, r, c));
}

/** サイト名（ロゴ＋名前＋添え書き） */
function drawBrand(ctx, x, y, { s = 72, align = "left", dark = false } = {}) {
  const nameFont = f(900, Math.round(s * 0.62));
  const subFont = f(700, Math.round(s * 0.33));
  ctx.font = nameFont;
  const nw = ctx.measureText(SITE_NAME).width;
  ctx.font = subFont;
  const sw = ctx.measureText(SITE_SUB).width;
  const tw = Math.max(nw, sw);
  const total = s + s * 0.28 + tw;
  const x0 = align === "center" ? x - total / 2 : x;
  drawLogo(ctx, x0, y, s);
  const tx = x0 + s + s * 0.28;
  // 添え書きが無いときは、名前をロゴの高さの真ん中に置く
  text1(ctx, SITE_NAME, tx, y + s * (SITE_SUB ? 0.56 : 0.74), { font: nameFont, color: dark ? "#FFFFFF" : C.ink });
  if (SITE_SUB) text1(ctx, SITE_SUB, tx, y + s * 0.98, { font: subFont, color: dark ? "rgba(255,255,255,.7)" : C.muted });
  return { x: x0, w: total };
}

/** 地（生成り＋上の白い光＋タイプの色の大きな丸） */
function drawBg(ctx, w, h, model) {
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, w, h);
  const g = ctx.createRadialGradient(w / 2, -160, 40, w / 2, -160, 900);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  // 右上と左下にタイプの色の大きな丸（薄く）
  ctx.save();
  ctx.globalAlpha = 0.09;
  ctx.fillStyle = model.type.color;
  ctx.beginPath(); ctx.arc(w + 60, 120, 330, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(-120, h - 140, 300, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  // いちばん上の3色の線
  drawTri(ctx, 0, 0, w, 14, model.kind, 0);
}

/** 絵（白いふち・少し傾ける）。無いときはタイプの色の面と頭文字 */
function drawArt(ctx, img, model, cx, cy, s, { r = 40, ring = 10, rot = 0, shadow = true } = {}) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(rot);
  if (shadow) {
    ctx.shadowColor = "rgba(10,8,20,.35)";
    ctx.shadowBlur = 40;
    ctx.shadowOffsetY = 16;
  }
  fillRR(ctx, -s / 2 - ring, -s / 2 - ring, s + ring * 2, s + ring * 2, r + ring, "#FFFFFF");
  ctx.shadowColor = "transparent";
  rr(ctx, -s / 2, -s / 2, s, s, r);
  ctx.clip();
  if (img) {
    const k = Math.max(s / img.naturalWidth, s / img.naturalHeight);
    const dw = img.naturalWidth * k;
    const dh = img.naturalHeight * k;
    ctx.drawImage(img, -dw / 2, -dh / 2, dw, dh);
  } else {
    // 仮の絵：色の面＋頭文字＋3色の線
    ctx.fillStyle = model.type.color;
    ctx.fillRect(-s / 2, -s / 2, s, s);
    const g = ctx.createLinearGradient(-s / 2, -s / 2, s / 2, s / 2);
    g.addColorStop(0, "rgba(255,255,255,.28)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(-s / 2, -s / 2, s, s);
    text1(ctx, [...model.type.name][0], 0, s * 0.08, {
      font: f(900, Math.round(s * 0.5)), color: "#FFFFFF", align: "center", base: "middle",
    });
    drawTri(ctx, -s * 0.28, s * 0.3, s * 0.56, Math.max(8, s * 0.035), model.kind);
  }
  ctx.restore();
}

/** ライン・メーター（左＝きびしい、右＝ゆるい） */
function drawMeter(ctx, x, y, w, h, v, { kind = "line", markW = 16, markH = 0, avg = null, ring = 5 } = {}) {
  const cols = kind === "feel" ? [C.onlyLine, C.friendLine, C.anyoneLine] : [C.outLine, C.moyaLine, C.safeLine];
  ctx.save();
  rr(ctx, x, y, w, h, h / 2);
  ctx.clip();
  const gap = Math.max(2, w * 0.01);
  const sw = (w - gap * 2) / 3;
  cols.forEach((c, i) => { ctx.fillStyle = c; ctx.fillRect(x + i * (sw + gap), y, sw + (i === 2 ? 1 : 0), h); });
  ctx.restore();
  if (avg != null) {
    const ax = x + Math.max(6, Math.min(w - 6, (w * avg) / 100));
    const ts = Math.max(9, h * 0.6);
    ctx.fillStyle = C.muted;
    ctx.beginPath();
    ctx.moveTo(ax, y + h + 6);
    ctx.lineTo(ax - ts * 0.7, y + h + 6 + ts);
    ctx.lineTo(ax + ts * 0.7, y + h + 6 + ts);
    ctx.closePath();
    ctx.fill();
  }
  const mh = markH || h * 2.6;
  const mx = x + Math.max(markW / 2, Math.min(w - markW / 2, (w * v) / 100));
  ctx.save();
  ctx.shadowColor = "rgba(26,24,38,.3)";
  ctx.shadowBlur = 10;
  ctx.shadowOffsetY = 3;
  fillRR(ctx, mx - markW / 2 - ring, y + h / 2 - mh / 2 - ring, markW + ring * 2, mh + ring * 2, (markW + ring * 2) / 2, "#FFFFFF");
  ctx.restore();
  fillRR(ctx, mx - markW / 2, y + h / 2 - mh / 2, markW, mh, markW / 2, C.ink);
  return mx;
}

/** 30問の答えの足あと（答えの色の小さな印が30個） */
function drawTrail(ctx, x, y, w, h, model, { gap = 5, empty = "rgba(255,255,255,.18)" } = {}) {
  const a = model.answers;
  const cw = (w - gap * 29) / 30;
  for (let i = 0; i < 30; i++) {
    const v = a ? Number(a[i]) : -1;
    const col = v >= 0 ? ANS[model.kind][v].fill : empty;
    fillRR(ctx, x + i * (cw + gap), y, cw, h, Math.min(h / 2, cw / 2), col);
  }
}

/** 答えのラベル（色つきの札） */
function drawPill(ctx, x, y, w, h, kind, v, { size = 30, label } = {}) {
  const a = ANS[kind][v];
  fillRR(ctx, x, y, w, h, h / 2, a.fill);
  const lab = label || (kind === "line" ? LINE_CHOICES : FEEL_CHOICES)[v].label;
  ctx.font = f(900, size);
  let s = size;
  while (ctx.measureText(lab).width > w - h * 0.6 && s > 16) { s -= 2; ctx.font = f(900, s); }
  text1(ctx, lab, x + w / 2, y + h / 2 + s * 0.04, { font: f(900, s), color: a.text, align: "center", base: "middle" });
}

/** 数字＋単位（Bricolage の数字と Zen Kaku の単位）。戻り値は右端の x */
function drawNum(ctx, num, unit, x, base, { size, unitSize, color = C.ink, align = "left", unitColor } = {}) {
  ctx.font = fn(size);
  const nw = ctx.measureText(String(num)).width;
  ctx.font = f(900, unitSize);
  const uw = unit ? ctx.measureText(unit).width : 0;
  const gap = unit ? size * 0.05 : 0;
  const total = nw + gap + uw;
  const x0 = align === "center" ? x - total / 2 : align === "right" ? x - total : x;
  text1(ctx, String(num), x0, base, { font: fn(size), color });
  if (unit) text1(ctx, unit, x0 + nw + gap, base, { font: f(900, unitSize), color: unitColor || color });
  return x0 + total;
}

// ---------- 結果の部品 ----------
function pickCats(model) {
  return CATEGORIES.map((c) => ({ label: c.short, v: model.res.cats ? model.res.cats[c.id] : null }));
}
/** 本音ライン: カテゴリごとのひらき度（そのカテゴリの6問で） */
function feelCats(model) {
  return CATEGORIES.map((c) => {
    let s = 0;
    let n = 0;
    QUESTIONS.forEach((q, i) => { if (q.cat === c.id && model.answers) { s += Number(model.answers[i]); n++; } });
    return { label: c.short, v: n ? Math.round((100 * s) / (2 * n)) : null };
  });
}
function signalCount(model) {
  const r = model.res;
  if (Array.isArray(r.signals)) return r.signals.length;
  return r.n != null ? r.n : Math.round((r.special * 30) / 100);
}

/** タイプの大きな面（色の面＋絵＋名前＋肩書き）。文の行数を先に測って、重ならないように並べる */
function drawHero(ctx, box, model, art, { layout = "side" } = {}) {
  const { x, y, w, h } = box;
  const t = model.type;
  ctx.save();
  ctx.shadowColor = "rgba(26,24,38,.22)";
  ctx.shadowBlur = 50;
  ctx.shadowOffsetY = 20;
  fillRR(ctx, x, y, w, h, 48, t.color);
  ctx.restore();
  ctx.save();
  rr(ctx, x, y, w, h, 48);
  ctx.clip();
  const g = ctx.createLinearGradient(x, y, x + w, y + h);
  g.addColorStop(0, "rgba(255,255,255,.16)");
  g.addColorStop(0.55, "rgba(255,255,255,0)");
  g.addColorStop(1, "rgba(0,0,0,.14)");
  ctx.fillStyle = g;
  ctx.fillRect(x, y, w, h);
  ctx.restore();

  const label = "あなたのタイプは";
  const hasTrail = !!model.answers;
  const rings = (cx, cy, rs) => {
    ctx.save();
    rr(ctx, x, y, w, h, 48);
    ctx.clip();
    ctx.strokeStyle = "rgba(255,255,255,.10)";
    ctx.lineWidth = 3;
    for (const r of rs) { ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke(); }
    ctx.restore();
  };
  if (layout === "side") {
    const s = Math.min(380, h - 120);
    const acx = x + w - 52 - s / 2;
    const acy = y + 56 + s / 2;
    rings(acx, acy, [240, 310, 380]);
    drawArt(ctx, art, model, acx, acy, s, { rot: -0.045 });
    const tx = x + 48;
    const tw = w - s - 52 - 48 - 44;
    // 名前・肩書きに使える高さ（下は足あとの場所）
    const top = y + 82;
    const bottom = y + h - (hasTrail ? 108 : 40);
    ctx.font = f(700, 30);
    const cl = wrap(ctx, t.catch, tw).slice(0, 3);
    const catchH = cl.length * 42 + 26;
    let nm = null;
    for (let size = 92; size >= 44; size -= 2) {
      ctx.font = f(900, size);
      const ls = wrap(ctx, t.name, tw, nameUnits(t.name));
      if (ls.length <= 3 && top + 24 + ls.length * size * 1.12 + catchH <= bottom) { nm = { size, lines: ls }; break; }
    }
    if (!nm) { ctx.font = f(900, 44); nm = { size: 44, lines: wrap(ctx, t.name, tw, nameUnits(t.name)) }; }
    let ty = top;
    text1(ctx, label, tx, ty, { font: f(700, 28), color: "rgba(255,255,255,.76)" });
    ty += 24;
    for (const ln of nm.lines) {
      ty += nm.size * 1.12;
      text1(ctx, ln, tx, ty, { font: f(900, nm.size), color: "#FFFFFF" });
    }
    ty += 26;
    for (const ln of cl) {
      ty += 42;
      text1(ctx, ln, tx, ty, { font: f(700, 30), color: "rgba(255,255,255,.9)" });
    }
    if (hasTrail) {
      const ty2 = y + h - 52;
      text1(ctx, "30問の答え", tx, ty2 - 14, { font: f(700, 22), color: "rgba(255,255,255,.66)" });
      drawTrail(ctx, tx, ty2, w - 96, 22, model, { gap: 6 });
    }
  } else {
    // 縦の並び（ストーリー用）：絵が上、名前と肩書きが下。文の高さを先に測って絵の大きさを決める
    const padT = 64;
    const padB = 52;
    const nm = fit(ctx, t.name, { weight: 900, max: 108, min: 60, width: w - 120, lines: 2, name: true });
    ctx.font = f(700, 34);
    const cl = wrap(ctx, t.catch, w - 140).slice(0, 2);
    const textH = 44 + 12 + nm.lines.length * nm.size * 1.14 + 20 + cl.length * 50 + (hasTrail ? 22 + 46 : 0);
    const ring = 12;
    const s = Math.max(260, Math.min(470, h - padT - padB - textH - 34 - ring * 2));
    const acy = y + padT + ring + s / 2;
    rings(x + w / 2, acy, [s * 0.62, s * 0.8, s * 0.98]);
    drawArt(ctx, art, model, x + w / 2, acy, s, { rot: -0.035, r: 52, ring });
    let ty = acy + s / 2 + ring + 34 + 34;
    text1(ctx, label, x + w / 2, ty, { font: f(700, 32), color: "rgba(255,255,255,.76)", align: "center" });
    ty += 12;
    for (const ln of nm.lines) {
      ty += nm.size * 1.14;
      text1(ctx, ln, x + w / 2, ty, { font: f(900, nm.size), color: "#FFFFFF", align: "center" });
    }
    ty += 20;
    for (const ln of cl) {
      ty += 50;
      text1(ctx, ln, x + w / 2, ty, { font: f(700, 34), color: "rgba(255,255,255,.9)", align: "center" });
    }
    if (hasTrail) drawTrail(ctx, x + 64, y + h - padB - 22, w - 128, 22, model, { gap: 6 });
  }
}

/** 大きな数字（許せる度・気になる人にだけ）と小さな箱2つ */
function drawScoreBlock(ctx, box, model, { stacked = false } = {}) {
  const { x, y, w } = box;
  const isLine = model.kind === "line";
  const big = isLine ? model.res.score : model.res.special;
  const unit = isLine ? "点" : "%";
  const label = isLine ? "許せる度" : "気になる人にだけ";
  const boxes = [];
  if (isLine) {
    boxes.push({ label: "モヤる率", num: model.res.gray, unit: "%" });
    if (model.rank && model.rank.top != null) {
      const rv = rankView(model.rank.top);
      boxes.push({ label: `${rv.label}の順位`, num: rv.value, unit: "%", pre: "上位", sub: model.rank.n ? `${model.rank.n.toLocaleString("ja-JP")}人中` : "" });
    }
    else if (model.res.counts) boxes.push({ label: "アウトにした数", num: model.res.counts[0], unit: "問" });
  } else {
    boxes.push({ label: "ひらき度", num: model.res.open, unit: "" });
    boxes.push({ label: "本気サイン", num: signalCount(model), unit: "個", sub: "30問中" });
  }
  if (!stacked) {
    text1(ctx, label, x, y + 34, { font: f(700, 30), color: C.muted });
    drawNum(ctx, big, unit, x - 6, y + 230, { size: 236, unitSize: 64 });
    const bw = 400;
    const bx = x + w - bw;
    boxes.forEach((b, i) => drawStatBoxB(ctx, bx, y + 6 + i * 122, bw, 108, b));
  } else {
    text1(ctx, label, x + w / 2, y + 36, { font: f(700, 34), color: C.muted, align: "center" });
    drawNum(ctx, big, unit, x + w / 2, y + 270, { size: 270, unitSize: 76, align: "center" });
    const bw = (w - 24) / 2;
    boxes.forEach((b, i) => drawStatBoxB(ctx, x + i * (bw + 24), y + 310, bw, 116, b));
  }
}
function drawStatBoxB(ctx, x, y, w, h, b) {
  fillRR(ctx, x, y, w, h, 28, C.surface);
  ctx.strokeStyle = C.line;
  ctx.lineWidth = 2;
  rr(ctx, x + 1, y + 1, w - 2, h - 2, 27);
  ctx.stroke();
  text1(ctx, b.label, x + 28, y + 40, { font: f(700, 24), color: C.muted });
  let nx = x + 26;
  const base = y + h - 20;
  if (b.pre) {
    text1(ctx, b.pre, nx, base, { font: f(900, 28), color: C.ink });
    ctx.font = f(900, 28);
    nx += ctx.measureText(b.pre).width + 6;
  }
  const right = drawNum(ctx, b.num, b.unit, nx, base, { size: 58, unitSize: 26 });
  if (b.sub) text1(ctx, b.sub, right + 12, base - 2, { font: f(700, 22), color: C.muted, maxW: Math.max(40, x + w - right - 34) });
}

/** 大きなメーター＋両端の言葉 */
function drawMainMeter(ctx, box, model, { h = 22 } = {}) {
  const { x, y, w } = box;
  const isLine = model.kind === "line";
  const v = isLine ? model.res.score : model.res.open;
  const hasAvg = isLine && model.avg != null;
  // 自分の点と平均が近いと、三角は印の下に隠れる。そのときは三角を描かずに「ほぼ同じ」と書く（画面の結果と同じ決まり）
  const near = hasAvg && Math.abs(v - model.avg) <= AVG_NEAR;
  drawMeter(ctx, x, y, w, h, v, { kind: model.kind, markW: 18, markH: h * 2.8, avg: hasAvg && !near ? model.avg : null, ring: 6 });
  const ly = y + h + 48;
  text1(ctx, isLine ? "きびしい" : "特別な人にだけ", x, ly, { font: f(700, 26), color: isLine ? C.outInk : C.onlyInk });
  text1(ctx, isLine ? "ゆるい" : "誰とでも", x + w, ly, { font: f(700, 26), color: isLine ? C.safeInk : C.anyoneInk, align: "right" });
  if (hasAvg) text1(ctx, near ? "みんなの平均とほぼ同じ" : "三角はみんなの平均", x + w / 2, ly, { font: f(700, 22), color: C.muted, align: "center" });
}

/** カテゴリ5本（名前｜メーター｜数字） */
function drawCats(ctx, box, model, { rowH = 40, nameW = 150, size = 28 } = {}) {
  const { x, y, w } = box;
  const rows = model.kind === "line" ? pickCats(model) : feelCats(model);
  rows.forEach((r, i) => {
    const cy = y + i * rowH + rowH / 2;
    text1(ctx, r.label, x, cy + size * 0.36, { font: f(700, size), color: C.ink });
    const mx = x + nameW;
    const mw = w - nameW - 96;
    if (r.v != null) {
      drawMeter(ctx, mx, cy - 7, mw, 14, r.v, { kind: model.kind, markW: 10, markH: 32, ring: 4 });
      drawNum(ctx, r.v, "", x + w, cy + size * 0.42, { size: size + 6, unitSize: 10, align: "right" });
    }
  });
}

/** 本音ラインの6タイプの地図（行＝気になる人にだけの多さ、列＝ひらき度） */
function drawTypeMap(ctx, box, model, { headH = 40, rowH = 66, gap = 10, labelW = 150, size = 26 } = {}) {
  const { x, y, w } = box;
  const rows = [["f1", "f2"], ["f3", "f4"], ["f5", "f6"]];
  const rowLabels = ["特別が多い", "ほどほど", "特別は少なめ"];
  const cw = (w - labelW - 12) / 2;
  text1(ctx, "相手を選ぶ", x + labelW + cw / 2, y + headH - 12, { font: f(700, 22), color: C.muted, align: "center" });
  text1(ctx, "誰とでも", x + labelW + 12 + cw * 1.5, y + headH - 12, { font: f(700, 22), color: C.muted, align: "center" });
  rows.forEach((pair, r) => {
    const ry = y + headH + r * (rowH + gap);
    text1(ctx, rowLabels[r], x, ry + rowH / 2 + 9, { font: f(700, 24), color: C.ink2 });
    pair.forEach((id, c) => {
      const t = FEEL_TYPES.find((ft) => ft.id === id);
      const cx = x + labelW + c * (cw + 12);
      const mine = id === model.type.id;
      if (mine) {
        fillRR(ctx, cx, ry, cw, rowH, 20, t.color);
      } else {
        fillRR(ctx, cx, ry, cw, rowH, 20, C.surface);
        ctx.strokeStyle = C.line;
        ctx.lineWidth = 2;
        rr(ctx, cx + 1, ry + 1, cw - 2, rowH - 2, 19);
        ctx.stroke();
      }
      ctx.font = f(mine ? 900 : 700, size);
      text1(ctx, t.name, cx + cw / 2, ry + rowH / 2 + size * 0.36, { font: f(mine ? 900 : 700, size), color: mine ? "#FFFFFF" : C.muted, align: "center", maxW: cw - 24 });
    });
  });
  return headH + rows.length * (rowH + gap);
}

/** 下の帯（URL） */
function drawFooterBand(ctx, y, h, model, { center = false } = {}) {
  ctx.fillStyle = C.ink;
  ctx.fillRect(0, y, W, h);
  drawTri(ctx, 0, y, W, 8, model.kind, 0);
  const cy = y + h / 2 + 12;
  const ask = model.kind === "line" ? "あなたの浮気ラインは？" : "あなたの本音ラインは？";
  if (center) {
    text1(ctx, ask, W / 2, cy - 26, { font: f(700, 28), color: "rgba(255,255,255,.7)", align: "center" });
    text1(ctx, SHORT_URL, W / 2, cy + 26, { font: f(900, 44), color: "#FFFFFF", align: "center" });
  } else {
    drawLogo(ctx, 56, cy - 34, 48);
    text1(ctx, SHORT_URL, 122, cy, { font: f(900, 38), color: "#FFFFFF" });
    text1(ctx, ask, W - 56, cy - 2, { font: f(700, 26), color: "rgba(255,255,255,.72)", align: "right" });
  }
}

/** 上の見出し（サイト名と、右に小さく何の結果か） */
function drawTop(ctx, y, model, { right = true } = {}) {
  drawBrand(ctx, 56, y, { s: 72 });
  if (right) {
    const s = model.kind === "line" ? "浮気許せる度診断の結果" : "本音ライン診断の結果";
    text1(ctx, s, W - 56, y + 46, { font: f(700, 26), color: C.ink2, align: "right" });
    text1(ctx, `${END_LABEL}までの期間限定`, W - 56, y + 80, { font: f(700, 20), color: C.muted, align: "right" });
  }
}

// ---------- 3種類の画像 ----------
function makeCanvas(w, h) {
  const cv = document.createElement("canvas");
  cv.width = w;
  cv.height = h;
  return cv;
}

function drawPost(model, art) {
  const H = 1350;
  const cv = makeCanvas(W, H);
  const ctx = cv.getContext("2d");
  drawBg(ctx, W, H, model);
  drawTop(ctx, 46, model);
  drawHero(ctx, { x: 40, y: 150, w: W - 80, h: 500 }, model, art, { layout: "side" });
  drawScoreBlock(ctx, { x: 64, y: 680, w: W - 128 }, model);
  drawMainMeter(ctx, { x: 64, y: 960, w: W - 128 }, model);
  if (model.kind === "line") drawCats(ctx, { x: 64, y: 1062, w: W - 128 }, model, { rowH: 38, size: 26 });
  else drawTypeMap(ctx, { x: 64, y: 1046, w: W - 128 }, model, { headH: 36, rowH: 50, gap: 8, size: 24 });
  drawFooterBand(ctx, H - 92, 92, model);
  return cv;
}

// ストーリーの中身を置く高さ（インスタのストーリーは、16:9 の端末で上と下の約 250px に名前の帯・返信の欄が重なる）
const STORY_SAFE = { top: 250, bottom: 1660 };
function drawStory(model, art) {
  const H = 1920;
  const cv = makeCanvas(W, H);
  const ctx = cv.getContext("2d");
  drawBg(ctx, W, H, model);
  // 中身（サイト名〜URL の札）は下の座標で描いてから、まとめて縮めて STORY_SAFE の内側に入れる
  //   縮めるぶん横は広い座標（VW）で描くので、縮めたあとも横いっぱいに近い幅になる
  const SRC_TOP = 196;
  const SRC_BOTTOM = 1884;
  const k = (STORY_SAFE.bottom - STORY_SAFE.top) / (SRC_BOTTOM - SRC_TOP);
  const VW = Math.round(W / k);
  ctx.save();
  ctx.translate(0, STORY_SAFE.top);
  ctx.scale(k, k);
  ctx.translate(0, -SRC_TOP);
  drawBrand(ctx, VW / 2, SRC_TOP, { s: 76, align: "center" });
  drawHero(ctx, { x: 56, y: 312, w: VW - 112, h: 900 }, model, art, { layout: "stack" });
  drawScoreBlock(ctx, { x: 80, y: 1240, w: VW - 160 }, model, { stacked: true });
  drawMainMeter(ctx, { x: 80, y: 1720, w: VW - 160 }, model, { h: 20 });
  // URL の札（いちばん下。縮めたあとで下から 260px より上に来る）
  ctx.font = f(900, 40);
  const uw = ctx.measureText(SHORT_URL).width + 96;
  fillRR(ctx, VW / 2 - uw / 2, 1812, uw, 72, 36, C.ink);
  text1(ctx, SHORT_URL, VW / 2, 1861, { font: f(900, 40), color: "#FFFFFF", align: "center" });
  ctx.restore();
  return cv;
}

/** くわしい画像の行の高さを先に測る */
function layoutRows(ctx, model, textW) {
  const out = [];
  ctx.font = f(700, 30);
  QUESTIONS.forEach((q, i) => {
    const lines = wrap(ctx, applyWord(q.text, model.word), textW);
    out.push({ i, q, lines, h: Math.max(84, lines.length * 42 + 40) });
  });
  return out;
}

function drawDetail(model, art) {
  // 先に高さを測る
  const pad = 56;
  const pillW = model.kind === "line" ? 168 : 250;
  const textW = W - pad * 2 - 40 - 76 - pillW - 24;
  const tmp = makeCanvas(10, 10).getContext("2d");
  const rows = layoutRows(tmp, model, textW);
  const byCat = CATEGORIES.map((c) => ({ c, rows: rows.filter((r) => r.q.cat === c.id) }));
  const headH = 150 + 470 + 40;          // 見出し＋タイプの面
  const mapH = 40 + 3 * (52 + 8);        // 本音の6タイプの地図
  const sumH = 284 + 104 + (model.kind === "feel" ? mapH + 16 : 0); // 数字とメーター（と地図）
  const catHeadH = 104;
  const listH = byCat.reduce((s, b) => s + catHeadH + b.rows.reduce((t, r) => t + r.h, 0) + 36, 0);
  const H = Math.ceil(headH + sumH + 110 + listH + 40 + 130);
  const cv = makeCanvas(W, H);
  const ctx = cv.getContext("2d");
  drawBg(ctx, W, H, model);
  drawTop(ctx, 46, model);
  drawHero(ctx, { x: 40, y: 150, w: W - 80, h: 470 }, model, art, { layout: "side" });
  let y = headH;
  // 数字
  drawScoreBlock(ctx, { x: 64, y, w: W - 128 }, model);
  y += 284;
  drawMainMeter(ctx, { x: 64, y, w: W - 128 }, model);
  y += 104;
  if (model.kind === "feel") {
    y += drawTypeMap(ctx, { x: 64, y, w: W - 128 }, model, { headH: 40, rowH: 52, gap: 8, size: 24 }) + 16;
  }
  // 30問
  y += 60;
  text1(ctx, "30問の答え", pad, y, { font: f(900, 44), color: C.ink });
  drawTri(ctx, pad, y + 22, 90, 8, model.kind);
  const choices = model.kind === "line" ? LINE_CHOICES : FEEL_CHOICES;
  // 凡例
  let lx = W - pad;
  for (let v = 2; v >= 0; v--) {
    ctx.font = f(700, 24);
    const tw = ctx.measureText(choices[v].label).width;
    text1(ctx, choices[v].label, lx, y - 4, { font: f(700, 24), color: C.ink2, align: "right" });
    fillRR(ctx, lx - tw - 30, y - 24, 20, 20, 6, ANS[model.kind][v].fill);
    lx -= tw + 56;
  }
  y += 50;
  const catScore = model.kind === "line" ? pickCats(model) : feelCats(model);
  byCat.forEach((b, ci) => {
    // カテゴリの見出し＋そのカテゴリのライン
    fillRR(ctx, pad - 8, y, W - pad * 2 + 16, catHeadH - 16, 26, C.ink);
    text1(ctx, b.c.label, pad + 24, y + 58, { font: f(900, 34), color: "#FFFFFF" });
    const v = catScore[ci].v;
    if (v != null) {
      const mx = W - pad - 360;
      drawMeter(ctx, mx, y + 38, 250, 12, v, { kind: model.kind, markW: 10, markH: 30, ring: 3 });
      drawNum(ctx, v, "", W - pad - 24, y + 62, { size: 38, unitSize: 10, align: "right", color: "#FFFFFF" });
    }
    y += catHeadH;
    b.rows.forEach((r, k) => {
      if (k % 2 === 0) fillRR(ctx, pad - 8, y, W - pad * 2 + 16, r.h, 20, "rgba(255,255,255,.75)");
      const qy = y + r.h / 2 + 11;
      text1(ctx, "Q", pad + 10, qy, { font: f(900, 26), color: C.muted });
      ctx.font = f(900, 26);
      text1(ctx, String(r.i + 1), pad + 12 + ctx.measureText("Q").width + 2, qy, { font: fn(30), color: C.muted });
      let ty = y + (r.h - r.lines.length * 42) / 2 + 31;
      for (const ln of r.lines) {
        text1(ctx, ln, pad + 92, ty, { font: f(700, 30), color: C.ink });
        ty += 42;
      }
      const v2 = model.answers ? Number(model.answers[r.i]) : -1;
      if (v2 >= 0) drawPill(ctx, W - pad - pillW, y + r.h / 2 - 28, pillW, 56, model.kind, v2, { size: 28 });
      y += r.h;
    });
    y += 36;
  });
  drawFooterBand(ctx, H - 130, 130, model, { center: true });
  return cv;
}

/**
 * 共有画像を描く
 * @param {"post"|"story"|"detail"} variant
 */
export async function drawCard(variant, model) {
  const [art] = await Promise.all([loadArt(model.type.id), loadCardFonts(model, variant)]);
  if (variant === "story") return drawStory(model, art);
  if (variant === "detail") return drawDetail(model, art);
  return drawPost(model, art);
}

/** 共有画像を PNG の Blob に */
export async function cardBlob(variant, model) {
  const cv = await drawCard(variant, model);
  return new Promise((ok, ng) => cv.toBlob((b) => (b ? ok(b) : ng(new Error("画像を作れませんでした"))), "image/png"));
}

export const CARD_SIZES = { post: [1080, 1350], story: [1080, 1920], detail: [1080, 0] };
