// みんなの統計（stats/）と、トップの「見どころ」で使う計算
//   stats/index.html は <body data-page="stats"> を付けてこのファイルを読む（自動で始まる）
//   トップ（top.js）は下の計算だけを使う（data-page が無いので画面は作らない）
//
//   /api/stats の形は CONTRACT.md §7（n・q・seg・hist・types・pair・updatedAt）
//   人が30人未満のところは「集計中（いま◯人）」を出す
import { QUESTIONS } from "./data/questions.js";
import { LINE_TYPES, FEEL_TYPES } from "./data/types.js";
import { applyWord, scoreLine, scoreFeel } from "./engine.js";
import { isEnded } from "./config.js";
import * as store from "./store.js";
import { getStats } from "./api.js";
import { h, icon, url, renderHeader, renderFooter, endedView, errorBox, loadingView, fill, picture } from "./ui.js";

export const MIN_N = 30;
const N = QUESTIONS.length;
const LKEYS = ["out", "moya", "safe"];
const FKEYS = ["only", "friend", "anyone"];
const LABEL = { out: "アウト", moya: "モヤる", safe: "セーフ", only: "気になる人にだけ", friend: "友達なら", anyone: "誰とでも" };
const SHOW = 5; // 並べる数（「全部見る」で30）

// ─── 計算（DOM を使わない） ─────────────────────────────────
export const sum = (a) => a.reduce((x, y) => x + y, 0);
export function shares(c) {
  const t = sum(c);
  return t ? c.map((v) => v / t) : c.map(() => 0);
}
/** 割合（%）を合計100になるように丸める（最大剰余） */
export function pcts(c) {
  const t = sum(c);
  if (!t) return c.map(() => 0);
  const raw = c.map((v) => (100 * v) / t);
  const fl = raw.map(Math.floor);
  let rest = 100 - sum(fl);
  const order = raw.map((v, i) => [v - fl[i], i]).sort((a, b) => b[0] - a[0]);
  for (const [, i] of order) { if (rest <= 0) break; fl[i]++; rest--; }
  return fl;
}
/** 割れぐあい（3つの割合の2乗の和。1/3 ずつで最小の 0.333…・小さいほど割れている） */
export function splitScore(c) {
  return sum(shares(c).map((x) => x * x));
}
/** 答えの平均（0＝アウト寄り〜2＝セーフ寄り） */
export function meanOf(c) {
  const t = sum(c);
  return t ? (c[1] + 2 * c[2]) / t : 0;
}
/** 両方答えた人の数（pair の1問目の9マスの合計） */
export function pairTotal(pair) {
  return Array.isArray(pair) && pair[0] ? sum(pair[0].flat()) : 0;
}
/** 恋人がしたら許せないことを、自分はもっと気軽にする（本音 F ＞ 浮気ライン J）人の割合 */
export function gapShare(pq) {
  let up = 0, t = 0;
  for (let j = 0; j < 3; j++) for (let f = 0; f < 3; f++) { t += pq[j][f]; if (f > j) up += pq[j][f]; }
  return t ? up / t : 0;
}
/** 自分がするより、恋人がするほうを広く許す（J ＞ F）人の割合 */
export function generousShare(pq) {
  let dn = 0, t = 0;
  for (let j = 0; j < 3; j++) for (let f = 0; f < 3; f++) { t += pq[j][f]; if (j > f) dn += pq[j][f]; }
  return t ? dn / t : 0;
}
function argBy(n, fn, better) {
  let best = -1, bv = null;
  for (let i = 0; i < n; i++) { const v = fn(i); if (best < 0 || better(v, bv)) { best = i; bv = v; } }
  return best;
}
/** トップの見どころ3つの材料 */
export function highlights(s) {
  const q = s.q.line;
  const outTop = argBy(N, (i) => shares(q[i])[0], (a, b) => a > b);
  const safeTop = argBy(N, (i) => shares(q[i])[2], (a, b) => a > b);
  const split = argBy(N, (i) => splitScore(q[i]), (a, b) => a < b);
  const pt = pairTotal(s.pair);
  const gapI = pt ? argBy(N, (i) => gapShare(s.pair[i]), (a, b) => a > b) : -1;
  return {
    outTop: { i: outTop, pct: pcts(q[outTop])[0] },
    safeTop: { i: safeTop, pct: pcts(q[safeTop])[2] },
    split: { i: split },
    gap: gapI >= 0 ? { i: gapI, pct: Math.round(100 * gapShare(s.pair[gapI])) } : null,
  };
}
/** 許せる度の分布の帯（0〜4 … 95〜99・100） */
export const bucketOf = (score) => Math.min(20, Math.max(0, Math.floor(score / 5)));
const bucketLabel = (b) => (b === 20 ? "100" : `${b * 5}〜${b * 5 + 4}`);

// ─── 画面 ─────────────────────────────────────────────────
if (typeof document !== "undefined" && document.body.dataset.page === "stats") main();

function main() {
  renderHeader({ current: "stats" });
  renderFooter();
  const app = document.getElementById("app");
  if (isEnded()) {
    fill(app, endedView());
    return;
  }
  const load = () => {
    fill(app, headSection(null), h("section", { class: "section" }, loadingView("みんなの答えを読んでいます")));
    getStats()
      .then((s) => render(app, s))
      .catch((e) => fill(app, headSection(null), h("section", { class: "section" }, errorBox(e, { title: "統計を読めませんでした", retry: load }))));
  };
  load();
}

function headSection(s) {
  const n = s ? s.n : null;
  const word = store.getWord();
  const wl = applyWord("{X}", word);
  return h("section", { class: "section stack" },
    h("span", { class: "eyebrow", text: "みんなの統計" }),
    h("h1", { class: "h1", text: "みんなの浮気ライン" }),
    picture("img/stats.webp", { alt: "", eager: true }),
    h("p", { class: "lead", text: "答えの数を、名前なしで集計しています。1分ごとに新しくなります。" }),
    n
      ? h("div", { class: "stats-grid" },
        statBox("浮気ライン", n.line),
        statBox("本音ライン", n.feel),
        pairCount(s) == null
          ? h("div", { class: "stat" }, h("span", { class: "stat-label", text: "両方" }), h("span", { class: "stat-val stat-val--text", text: "30人未満" }))
          : statBox("両方", pairCount(s)))
      : null,
    h("p", { class: "small muted", text: `問題の「${wl}」は、人によって「異性」「同性」「誰か」のどれかで答えています（ここではあなたが選んだ「${wl}」で表示）。` }));
}
function statBox(label, v) {
  return h("div", { class: "stat" }, h("span", { class: "stat-label", text: label }), h("span", { class: "stat-val" }, String(v || 0), h("small", { text: "人" })));
}

/** 両方答えた人の数。API は30人未満のあいだ pair を0で返すので、そのときは分からない（null） */
function pairCount(s) {
  const t = pairTotal(s.pair);
  if (t) return t;
  return Math.min((s.n && s.n.line) || 0, (s.n && s.n.feel) || 0) > 0 ? null : 0;
}
function collecting(n, what = "") {
  return h("div", { class: "notice notice--ink collecting" }, icon("clock"),
    h("p", {}, h("b", { text: "集計中" }), n == null ? `（いまは${MIN_N}人未満）。` : `（いま${n}人）。`, `${what}${MIN_N}人をこえたら出ます。`));
}

function render(app, s) {
  const word = store.getWord();
  const line = store.getRecord("line");
  const feel = store.getRecord("feel");
  const myL = (i) => (line ? Number(line.answers[i]) : null);
  const myF = (i) => (feel ? Number(feel.answers[i]) : null);
  const qt = (i) => applyWord(QUESTIONS[i].text, word);
  const nL = s.n.line || 0;
  const nF = s.n.feel || 0;
  const nP = pairCount(s);
  const idx = QUESTIONS.map((_, i) => i);

  const jump = h("nav", { class: "chips jump", "aria-label": "この下の見出し" },
    [["hist", "点数の分布"], ["out", "アウト順"], ["safe", "セーフ順"], ["split", "割れた順"], ["gender", "男女の差"], ["age", "年代の差"], ["gap", "本音とのズレ"], ["feel", "本気サイン"], ["types", "タイプ"]]
      .map(([id, label]) => h("a", { class: "chip chip--line", href: "#" + id, text: label })));

  const mineNote = line || feel
    ? h("div", { class: "notice" }, icon("info"), h("p", {}, "あなたの答えには", h("b", { text: "下線" }), "を引いています。"))
    : h("div", { class: "notice" }, icon("info"),
      h("p", {}, "自分の答えと比べるなら、先に", h("a", { class: "link", href: url("line/") }, "浮気許せる度診断"), "を。答えに印がつきます。"));

  const sections = [
    sec("hist", "許せる度の分布", "浮気許せる度診断の点数（0〜100点）。左ほどきびしく、右ほどゆるい。",
      nL < MIN_N ? collecting(nL) : histBlock(s.hist.line, line)),
    sec("out", "浮気だと思う人が多い順", "「アウト」と答えた人の割合が高い行動。",
      nL < MIN_N ? collecting(nL) : listBlock(sortIdx(idx, (i) => shares(s.q.line[i])[0], true), (i) => bandRow(i, qt(i), s.q.line[i], LKEYS, myL(i), [chipPct(s.q.line[i], 0, "out")]))),
    sec("safe", "セーフが多い順", "「セーフ」と答えた人の割合が高い行動。",
      nL < MIN_N ? collecting(nL) : listBlock(sortIdx(idx, (i) => shares(s.q.line[i])[2], true), (i) => bandRow(i, qt(i), s.q.line[i], LKEYS, myL(i), [chipPct(s.q.line[i], 2, "safe")]))),
    sec("split", "意見が割れた順", "アウト・モヤる・セーフの3つが、いちばん同じくらいに分かれた行動。",
      nL < MIN_N ? collecting(nL) : listBlock(sortIdx(idx, (i) => splitScore(s.q.line[i]), false), (i) => bandRow(i, qt(i), s.q.line[i], LKEYS, myL(i), []))),
    sec("gender", "男女で差が大きい順", "女性と男性で、答えの平均がいちばんちがう行動。",
      compareBlock(s, [["g:f", "女性"], ["g:m", "男性"]], qt, myL)),
    sec("age", "年代でちがう行動", "年代で答えの平均がいちばんちがう行動（30人をこえた年代だけ）。",
      compareBlock(s, [["a:10", "10代"], ["a:20", "20代"], ["a:30", "30代"], ["a:40", "40代〜"]], qt, myL)),
    sec("gap", "浮気ラインと本音のズレが大きい行動", "両方の診断に答えた人のうち、恋人がしたら許せないことを、自分はもっと気軽にする人の割合（アウトなのに友達や誰とでもする・モヤるなのに誰とでもする）。",
      nP == null || nP < MIN_N ? collecting(nP, "両方に答えた人が") : gapBlock(s.pair, qt, line, feel)),
    sec("feel", "「気になる人にだけ」が多い行動", "本音ライン診断で、好きな相手にしかしないと答えた人が多い行動（本気のサイン）。",
      nF < MIN_N ? collecting(nF) : listBlock(sortIdx(idx, (i) => shares(s.q.feel[i])[0], true), (i) => bandRow(i, qt(i), s.q.feel[i], FKEYS, myF(i), [chipPct(s.q.feel[i], 0, "only")]))),
    sec("types", "タイプの割合", "どのタイプが多いか。",
      h("div", { class: "stack" },
        h("h3", { class: "h3", text: "浮気ライン（12タイプ）" }),
        nL < MIN_N ? collecting(nL) : typeBlock(LINE_TYPES, s.types.line, line ? (line.result || scoreLine(line.answers)).typeId : null),
        h("h3", { class: "h3 mt-m", text: "本音ライン（6タイプ）" }),
        nF < MIN_N ? collecting(nF) : typeBlock(FEEL_TYPES, s.types.feel, feel ? (feel.result || scoreFeel(feel.answers)).typeId : null))),
  ];

  fill(app,
    headSection(s),
    h("section", { class: "section stack stats-intro" }, jump, mineNote),
    ...sections,
    h("section", { class: "section stack" },
      h("a", { class: "btn btn-primary btn-block", href: url("line/") }, line ? "診断をもう一度" : "浮気許せる度診断をやる", icon("arrow")),
      h("a", { class: "btn btn-secondary btn-block", href: url("feel/") }, feel ? "本音ライン診断をもう一度" : "本音ライン診断をやる"),
      s.updatedAt ? h("p", { class: "small muted center", text: `集計 ${new Date(s.updatedAt).toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}` }) : null));
}

function sec(id, title, desc, body) {
  return h("section", { class: "section stack stats-sec", id },
    h("h2", { class: "h2", text: title }),
    desc ? h("p", { class: "small muted", text: desc }) : null,
    body);
}

function sortIdx(idx, fn, desc) {
  return idx.slice().sort((a, b) => (desc ? fn(b) - fn(a) : fn(a) - fn(b)) || a - b);
}

/** 5件だけ見せて「全部見る」で残りを出す */
function listBlock(order, rowFn, show = SHOW) {
  const rows = order.map((i, k) => {
    const r = rowFn(i, k);
    if (k >= show) r.hidden = true;
    return r;
  });
  const list = h("div", { class: "band-list" }, rows);
  if (order.length <= show) return list;
  const more = h("button", {
    class: "btn btn-ghost btn-sm more-btn", type: "button", "aria-expanded": "false",
    onclick: () => {
      const open = more.getAttribute("aria-expanded") !== "true";
      rows.forEach((r, k) => { if (k >= show) r.hidden = !open; });
      more.setAttribute("aria-expanded", String(open));
      more.lastChild.textContent = open ? "閉じる" : `全部見る（${order.length}問）`;
    },
  }, h("span", { text: `全部見る（${order.length}問）` }));
  return h("div", { class: "stack stack-sm" }, list, h("div", { class: "center" }, more));
}

function bandEl(counts, keys, mine, cls = "") {
  const p = pcts(counts);
  return h("div", { class: ["band", cls], role: "img", "aria-label": keys.map((k, j) => `${LABEL[k]}${p[j]}%`).join(" ") + (mine != null ? `（あなたは${LABEL[keys[mine]]}）` : "") },
    counts.map((c, j) => h("span", { class: ["band-seg", `band-seg--${keys[j]}`, mine === j && "is-mine"], style: { "--w": String(c) }, hidden: c === 0 },
      h("span", { class: "band-pct", text: p[j] + "%" }))));
}

function chipPct(counts, j, key) {
  return h("span", { class: `chip chip--${key} chip-sm`, text: `${LABEL[key]} ${pcts(counts)[j]}%` });
}

function bandRow(i, text, counts, keys, mine, metas) {
  return h("div", { class: "band-row" },
    h("p", { class: "band-q" }, h("span", { class: "band-qn", text: "Q" + (i + 1) }), h("span", { text })),
    bandEl(counts, keys, mine),
    h("div", { class: "band-meta" }, metas, mine != null ? h("span", { class: "chip chip--ink chip-sm", text: `あなた: ${LABEL[keys[mine]]}` }) : null));
}

function histBlock(hist, line) {
  const total = sum(hist);
  const max = Math.max(1, ...hist);
  const myScore = line ? (line.result || scoreLine(line.answers)).score : null;
  const myB = myScore != null ? bucketOf(myScore) : -1;
  // 真ん中の人の帯
  let acc = 0, mid = 0;
  for (let b = 0; b < hist.length; b++) { acc += hist[b]; if (acc >= total / 2) { mid = b; break; } }
  const bars = hist.map((c, b) => h("span", {
    class: ["hist-bar", b < 7 ? "is-low" : b < 14 ? "is-mid" : "is-high", b === myB && "is-mine"],
    style: { "--h": String(Math.max(c ? 3 : 0, Math.round((100 * c) / max))) },
    title: `${bucketLabel(b)}点: ${c}人`,
  }, b === myB ? h("span", { class: "hist-me", text: "あなた" }) : null));
  let below = 0;
  if (myB >= 0) for (let b = 0; b < myB; b++) below += hist[b];
  return h("div", { class: "stack stack-sm" },
    h("figure", { class: "hist", role: "img", "aria-label": `許せる度の分布。真ん中の人は${bucketLabel(mid)}点` + (myScore != null ? `。あなたは${myScore}点` : "") },
      h("div", { class: "hist-bars" }, bars),
      h("div", { class: "hist-axis" }, h("span", { text: "0" }), h("span", { text: "50" }), h("span", { text: "100" })),
      h("div", { class: "meter-scale" }, h("span", { text: "きびしい" }), h("span", { text: "ゆるい" }))),
    h("div", { class: "stats-grid", style: "--cols:2" },
      h("div", { class: "stat" }, h("span", { class: "stat-label", text: "真ん中の人" }), h("span", { class: "stat-val" }, bucketLabel(mid), h("small", { text: "点" }))),
      myScore != null
        ? h("div", { class: "stat" }, h("span", { class: "stat-label", text: "あなた" }), h("span", { class: "stat-val" }, String(myScore), h("small", { text: "点" })))
        : h("div", { class: "stat" }, h("span", { class: "stat-label", text: "答えた人" }), h("span", { class: "stat-val" }, String(total), h("small", { text: "人" })))),
    myScore != null && total
      ? h("p", { class: "small muted", text: `あなたより点が低い（きびしい）人は、およそ${Math.round((100 * (below + hist[myB] / 2)) / total)}%です。` })
      : null);
}

/** 属性ごとの比べ（男女・年代）。30人をこえたグループが2つ以上あるときだけ */
function compareBlock(s, groups, qt, myL) {
  const ok = groups.filter(([k]) => s.seg && s.seg[k] && s.seg[k].n.line >= MIN_N);
  if (ok.length < 2) {
    const counts = groups.map(([k, l]) => `${l}${(s.seg && s.seg[k] && s.seg[k].n.line) || 0}人`).join("・");
    return h("div", { class: "notice notice--ink collecting" }, icon("clock"),
      h("p", {}, h("b", { text: "集計中" }), `（いま ${counts}）。2つ以上のグループが${MIN_N}人をこえたら出ます。`));
  }
  const diff = (i) => {
    const m = ok.map(([k]) => meanOf(s.seg[k].line[i]));
    return Math.max(...m) - Math.min(...m);
  };
  const order = sortIdx(QUESTIONS.map((_, i) => i), diff, true);
  return listBlock(order, (i) => {
    const means = ok.map(([k]) => meanOf(s.seg[k].line[i]));
    // いちばん低い平均のグループ（同じ平均が並んだら決めない）
    const lo = Math.min(...means);
    const lows = ok.filter((_, k) => Math.abs(means[k] - lo) < 1e-9);
    const strictText = lows.length > 1 ? "きびしさは同じくらい" : `${ok.length > 2 ? "いちばんきびしいのは" : "きびしいのは"} ${lows[0][1]}`;
    return h("div", { class: "band-row" },
      h("p", { class: "band-q" }, h("span", { class: "band-qn", text: "Q" + (i + 1) }), h("span", { text: qt(i) })),
      h("div", { class: "cmp" }, ok.map(([k, label]) => h("div", { class: "cmp-row" },
        h("span", { class: "cmp-label", text: label }),
        bandEl(s.seg[k].line[i], LKEYS, null, "band--cmp")))),
      h("div", { class: "band-meta" }, h("span", { class: "chip chip-sm", text: strictText }), myL(i) != null ? h("span", { class: "chip chip--ink chip-sm", text: `あなた: ${LABEL[LKEYS[myL(i)]]}` }) : null));
  }, ok.length > 2 ? 4 : SHOW);
}

function gapBlock(pair, qt, line, feel) {
  const order = sortIdx(QUESTIONS.map((_, i) => i), (i) => gapShare(pair[i]), true);
  return listBlock(order, (i) => {
    const up = Math.round(100 * gapShare(pair[i]));
    const dn = Math.round(100 * generousShare(pair[i]));
    const mine = line && feel ? Number(feel.answers[i]) - Number(line.answers[i]) : null;
    return h("div", { class: "band-row" },
      h("p", { class: "band-q" }, h("span", { class: "band-qn", text: "Q" + (i + 1) }), h("span", { text: qt(i) })),
      pbar("恋人には許せないのに、自分はもっと気軽にする", up, "gap-up"),
      pbar("自分がするより、恋人には広く許す", dn, "gap-down"),
      mine != null
        ? h("div", { class: "band-meta" }, h("span", { class: "chip chip--ink chip-sm", text: mine > 0 ? "あなたも自分に甘め" : mine < 0 ? "あなたは恋人に寛大" : "あなたはズレなし" }))
        : null);
  });
}

function pbar(label, pct, cls) {
  return h("div", { class: `pbar ${cls}` },
    h("span", { class: "pbar-label", text: label }),
    h("span", { class: "pbar-track" }, h("span", { class: "pbar-fill", style: { "--w": String(pct) } })),
    h("span", { class: "pbar-val num", text: pct + "%" }));
}

function typeBlock(types, counts, mine) {
  const total = sum(types.map((t) => counts[t.id] || 0));
  const p = pcts(types.map((t) => counts[t.id] || 0));
  const order = types.map((t, k) => ({ t, c: counts[t.id] || 0, p: p[k] })).sort((a, b) => b.c - a.c);
  const max = Math.max(1, ...order.map((o) => o.p));
  return h("ol", { class: "type-bars" }, order.map(({ t, p: pc }) => h("li", { class: ["type-bar", t.id === mine && "is-mine"], style: { "--c": t.color } },
    h("span", { class: "type-bar-name" },
      h("img", { class: "type-bar-img", src: url(`img/types/${t.id}.webp`), alt: "", width: "32", height: "32", loading: "lazy", decoding: "async", onerror: (e) => { e.currentTarget.hidden = true; } }),
      h("span", { class: "type-bar-label", text: t.name }),
      t.id === mine ? h("span", { class: "chip chip--ink chip-sm", text: "あなた" }) : null),
    h("span", { class: "type-bar-track" }, h("span", { class: "type-bar-fill", style: { "--w": String(Math.round((100 * pc) / max)) } })),
    h("span", { class: "type-bar-val num", text: total ? pc + "%" : "0%" }))));
}
