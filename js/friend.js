// 友達に見せるページ（r/<タイプid>/・f/<タイプid>/。結果担当）
//   ページは tools/build-share-pages.mjs がタイプごとに作る（OGP つき）。<main id="friend" data-kind data-type> の中身をここで描く
//
//   浮気ライン: ?s=許せる度&g=モヤる率&c=カテゴリ5つ（カンマ）&p=上位%&w=呼び方&a=答え30文字（CONTRACT §8-4）
//   本音ライン: ?s=special&o=open&n=本気サインの数&w=呼び方&a=答え30文字
//
// 数字は形を確かめてから使う。答え（a）があれば答えから計算し直し、ページのタイプと合わなければ数字を出さない（タイプだけ）。
// 見た人が自分の結果を持っていれば「あなたとくらべる」（30問を並べて一致の数）。
import { isEnded, END_LABEL } from "./config.js";
import { QUESTIONS, CATEGORIES, LINE_CHOICES, FEEL_CHOICES, PARTNER_WORDS } from "./data/questions.js";
import { LINE_TYPES, FEEL_TYPES } from "./data/types.js";
import { scoreLine, scoreFeel, isAnswers, applyWord, lineTypeOf, feelTypeOf, quizScore, typeById } from "./engine.js";
import { renderShot, icon, applyRank, phraseHTML } from "./result.js";
import { renderSister } from "./sister.js";
import { ROOT_URL, readSaved } from "./share.js";

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
function h(html) {
  const t = document.createElement("template");
  t.innerHTML = html.trim();
  return document.importNode(t.content, true).firstElementChild;
}
const KEYS = { line: ["out", "moya", "safe"], feel: ["only", "friend", "anyone"] };
const CHOICES = { line: LINE_CHOICES, feel: FEEL_CHOICES };

/** 0〜max の整数（形がちがえば null） */
function int(v, min, max) {
  if (v == null || !/^\d{1,3}$/.test(v)) return null;
  const n = Number(v);
  return n >= min && n <= max ? n : null;
}
function wordOf(q) {
  const w = q.get("w");
  return PARTNER_WORDS.some((p) => p.id === w) ? w : "i";
}

/** 浮気ラインの数字（だめなら null → タイプだけ） */
export function parseLine(type, q) {
  const word = wordOf(q);
  const top = int(q.get("p"), 1, 100);
  const a = q.get("a");
  if (isAnswers(a)) {
    const res = scoreLine(a);
    return res && res.typeId === type.id ? { res, answers: a, word, top } : null;
  }
  const s = int(q.get("s"), 0, 100);
  const g = int(q.get("g"), 0, 100);
  if (s == null || g == null || lineTypeOf(s, g) !== type.id) return null;
  const cs = (q.get("c") || "").split(",");
  let cats = null;
  if (cs.length === CATEGORIES.length && cs.every((x) => int(x, 0, 100) != null)) {
    cats = {};
    CATEGORIES.forEach((c, i) => { cats[c.id] = Number(cs[i]); });
  }
  return { res: { typeId: type.id, score: s, gray: g, cats, counts: null }, answers: null, word, top };
}

/** 本音ラインの数字（だめなら null） */
export function parseFeel(type, q) {
  const word = wordOf(q);
  const a = q.get("a");
  if (isAnswers(a)) {
    const res = scoreFeel(a);
    return res && res.typeId === type.id ? { res, answers: a, word, top: null } : null;
  }
  const s = int(q.get("s"), 0, 100);
  const o = int(q.get("o"), 0, 100);
  if (s == null || o == null || feelTypeOf(s, o) !== type.id) return null;
  let n = int(q.get("n"), 0, 30);
  if (n != null && Math.round((100 * n) / 30) !== s) n = null; // special と合わない数は出さない
  return { res: { typeId: type.id, special: s, open: o, n, counts: null }, answers: null, word, top: null };
}

function aboutHTML(kind, type) {
  const tipLabel = kind === "line" ? "恋人へのひとこと" : "好きな人へのひとこと";
  return `<section class="section rs-about stack" style="--tc:${esc(type.color)}">
    <span class="eyebrow">このタイプは</span>
    <h2 class="h2 rs-about-name">${phraseHTML(type.name)}<span class="rs-about-catch">${esc(type.catch)}</span></h2>
    <p class="lead">${esc(type.desc)}</p>
    <div class="rs-points">
      <div class="rs-point"><span class="rs-point-label">いいところ</span><p>${esc(type.good)}</p></div>
      <div class="rs-point rs-point--tip"><span class="rs-point-label">${tipLabel}</span><p>「${esc(type.tip)}」</p></div>
    </div>
  </section>`;
}

function ctaHTML(kind, ended) {
  const href = `${ROOT_URL}${kind}/`;
  const title = kind === "line" ? "あなたの浮気ラインはどこ？" : "あなたの本音ラインはどこ？";
  const sub = kind === "line"
    ? "恋人がしたら「アウト・モヤる・セーフ」を30問。許せる度と12タイプのどれかが出ます。"
    : "あなたがするなら「気になる人にだけ・友達なら・誰とでも」を30問。6タイプのどれかが出ます。";
  if (ended) {
    return `<section class="section"><div class="notice notice--ink">${icon("info")}<p><b>公開は${END_LABEL}で終わりました。</b>遊んでくれてありがとうございました。データはすべて消しました。</p></div></section>`;
  }
  return `<section class="section fr-cta stack">
    <div class="card card--ink stack fr-cta-card">
      <p class="card-title">${title}</p>
      <p class="card-sub">${sub}約3分・登録なし。</p>
      <a class="btn btn-block btn-lg fr-cta-btn" href="${href}" data-cta>あなたもやってみる${icon("arrow", 2.2)}</a>
    </div>
  </section>`;
}

/** あなたとくらべる（見た人が同じ診断の結果を持っているとき） */
function compareSection(kind, friendAnswers, word) {
  const mine = readSaved(kind);
  if (!mine) {
    if (!friendAnswers) return null;
    return h(`<section class="section fr-compare stack stack-sm">
      <span class="eyebrow">あなたとくらべる</span>
      <h2 class="h2">あなたと何問、同じ答え？</h2>
      <p class="small muted">診断すると、このページに戻ってきたときに、この人とあなたの30問の答えを並べてくらべられます。</p>
    </section>`);
  }
  const myType = typeById((kind === "line" ? scoreLine(mine.answers) : scoreFeel(mine.answers))?.typeId);
  if (!friendAnswers) {
    if (!myType) return null;
    return h(`<section class="section fr-compare stack stack-sm">
      <span class="eyebrow">あなたとくらべる</span>
      <p class="fr-vs"><span>あなたは</span><b style="--tc:${esc(myType.color)}">${esc(myType.name)}</b></p>
      <p class="small muted">このリンクには30問の答えが入っていないので、問題ごとにはくらべられません。</p>
    </section>`);
  }
  const sc = quizScore(friendAnswers, mine.answers);
  if (!sc) return null;
  const ch = CHOICES[kind];
  const keys = KEYS[kind];
  const diffs = sc.diffs;
  const LIM = 8;
  const el = h(`<section class="section fr-compare stack">
    <div class="stack stack-sm">
      <span class="eyebrow">あなたとくらべる</span>
      <h2 class="h2">30問中 <span class="num fr-same">${sc.score}</span>問が同じ答え</h2>
      ${myType ? `<p class="fr-vs"><span>あなたは</span><b style="--tc:${esc(myType.color)}">${esc(myType.name)}</b></p>` : ""}
    </div>
    <div class="meter rs-gap-meter" style="--v:${sc.pct}"><div class="meter-track"></div><span class="meter-mark"></span></div>
    <div class="meter-scale meter-scale--plain"><span>ちがう</span><span>そっくり</span></div>
    ${diffs.length ? `<h3 class="h3">答えがちがった問題（${diffs.length}問）</h3>
    <ul class="rs-gap-list">${diffs.map((i) => `<li class="rs-gap-item">
      <p class="rs-gap-q"><span class="band-qn">Q${i + 1}</span><span>${esc(applyWord(QUESTIONS[i].text, word))}</span></p>
      <div class="rs-gap-pair">
        <span class="rs-gap-side"><small>友達</small><span class="chip chip--${keys[Number(friendAnswers[i])]} is-solid chip-sm">${esc(ch[Number(friendAnswers[i])].label)}</span></span>
        <span class="rs-gap-side"><small>あなた</small><span class="chip chip--${keys[Number(mine.answers[i])]} is-solid chip-sm">${esc(ch[Number(mine.answers[i])].label)}</span></span>
      </div></li>`).join("")}</ul>` : '<p class="notice">30問ぜんぶ同じ答えでした。</p>'}
  </section>`);
  const ul = el.querySelector(".rs-gap-list");
  if (ul && ul.children.length > LIM) {
    const lis = [...ul.children];
    lis.slice(LIM).forEach((li) => { li.hidden = true; });
    const b = h(`<button class="btn btn-ghost btn-sm" type="button">あと${lis.length - LIM}問を見る</button>`);
    b.addEventListener("click", () => { lis.forEach((li) => { li.hidden = false; }); b.remove(); });
    ul.after(b);
  }
  return el;
}

/** タイプの一覧（ほかのタイプのページへ） */
function typesHTML(kind, current) {
  const list = kind === "line" ? LINE_TYPES : FEEL_TYPES;
  const dir = kind === "line" ? "r" : "f";
  return `<section class="section fr-types stack stack-sm">
    <span class="eyebrow">${kind === "line" ? "浮気ラインの12タイプ" : "本音ラインの6タイプ"}</span>
    <div class="fr-type-grid">${list.map((t) => `<a class="fr-type${t.id === current ? " is-current" : ""}" href="${ROOT_URL}${dir}/${t.id}/" style="--tc:${esc(t.color)}"${t.id === current ? ' aria-current="page"' : ""}><span class="fr-type-dot" aria-hidden="true"></span><span>${esc(t.name)}</span></a>`).join("")}</div>
  </section>`;
}

function main() {
  // アクセス解析（ui.js は読みこむと本番のときだけ GA4 を始める）。フッターもほかのページと同じもの（締め切りのあとの文も）に描き直す
  import("./ui.js").then((m) => { if (m && typeof m.renderFooter === "function") m.renderFooter(); }).catch(() => null);
  const root = document.getElementById("friend");
  if (!root) return;
  const kind = root.dataset.kind === "feel" ? "feel" : "line";
  const type = (kind === "line" ? LINE_TYPES : FEEL_TYPES).find((t) => t.id === root.dataset.type);
  if (!type) return;
  const q = new URLSearchParams(location.search);
  const hasParams = ["s", "a", "g", "o"].some((k) => q.has(k));
  const parsed = kind === "line" ? parseLine(type, q) : parseFeel(type, q);
  const model = {
    kind, type,
    answers: parsed ? parsed.answers : null,
    word: parsed ? parsed.word : "i",
    res: parsed ? parsed.res : null,
    rank: parsed && parsed.top != null ? { top: parsed.top, n: null } : null,
    avg: null,
  };
  const ended = isEnded();
  root.textContent = "";
  const frag = document.createDocumentFragment();
  const head = h(`<section class="section fr-head stack stack-sm">
    <span class="eyebrow">${hasParams ? (kind === "line" ? "友達の浮気ライン" : "友達の本音ライン") : (kind === "line" ? "浮気許せる度診断のタイプ" : "本音ライン診断のタイプ")}</span>
  </section>`);
  const shot = renderShot(model, { who: hasParams ? "friend" : "type", numbers: !!parsed });
  head.append(shot);
  if (model.rank) applyRank(shot, model); // 上位◯%（人数は分からないので数字だけ）
  if (hasParams && !parsed) head.append(h('<p class="small muted">リンクの数字が読みとれなかったので、タイプだけを出しています。</p>'));
  frag.append(head);
  frag.append(h(ctaHTML(kind, ended)));
  const cmp = compareSection(kind, model.answers, model.word);
  if (cmp) frag.append(cmp);
  frag.append(h(aboutHTML(kind, type)));
  frag.append(h(typesHTML(kind, type.id)));
  const sis = h('<section class="section"></section>');
  frag.append(sis);
  root.append(frag);
  renderSister(sis, { place: "result" });
}

main();
