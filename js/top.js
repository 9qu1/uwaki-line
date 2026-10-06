// トップ（site/index.html）
//   絵・名前・ひとこと → 2つの入口（やったことがあれば「前の結果」）→ みんなの統計の見どころ3つ → 当てっこの説明と自分の当てっこ
//   → 作者のほかのサイト（sister.js の renderSister）→ 期間限定・このサイトについて
import { LINE_CHOICES, FEEL_CHOICES, QUESTIONS } from "./data/questions.js";
import { applyWord, typeById, scoreLine, scoreFeel } from "./engine.js";
import { SITE_NAME, SITE_SUB, END_LABEL, isEnded, SISTER } from "./config.js";
import * as store from "./store.js";
import { getStats } from "./api.js";
import { h, icon, url, renderHeader, renderFooter, track, limitedBadge, endedView, errorBox, fill, picture } from "./ui.js";
import { MIN_N, highlights, pcts, pairTotal } from "./stats.js";

const LKEYS = ["out", "moya", "safe"];
const LABEL = { out: "アウト", moya: "モヤる", safe: "セーフ" };

main();

function main() {
  renderHeader();
  renderFooter();
  const app = document.getElementById("app");
  if (isEnded()) {
    fill(app, heroSection(true), endedView(), sisterSection(), limitedSection(true));
    return;
  }
  fill(app, heroSection(false), entrySection(), highlightSection(), quizSection(), sisterSection(), limitedSection(false));
}

// ---- 絵と名前 ----
function heroSection(ended) {
  const img = h("img", { class: "hero-img", src: url("img/hero.webp"), alt: "", width: "1200", height: "800", decoding: "async", fetchpriority: "high" });
  const art = h("div", { class: "hero-art" },
    // 絵が無い・読めないときの面（墨の地に3色の線と印）
    h("div", { class: "hero-fallback", "aria-hidden": "true" },
      h("span", { class: "hero-fb-line" }, h("i"), h("i"), h("i"), h("b")),
      h("span", { class: "hero-fb-labels" }, h("span", { text: "アウト" }), h("span", { text: "モヤる" }), h("span", { text: "セーフ" }))),
    img);
  img.addEventListener("error", () => art.classList.add("is-noimg"));
  img.addEventListener("load", () => art.classList.add("is-loaded"));
  return h("section", { class: "section hero" },
    art,
    h("div", { class: "hero-body stack" },
      h("div", { class: "row" }, limitedBadge()),
      h("p", { class: "hero-brand" }, h("span", { class: "hero-name", text: SITE_NAME }), SITE_SUB ? h("span", { class: "hero-sub", text: SITE_SUB }) : null),
      h("h1", { class: "h1 hero-title" }, "その行動、浮気？", h("br"), "あなたのラインを3択で。"),
      ended
        ? null
        : h("p", { class: "lead" }, "恋人がこれをしたら、アウト？モヤる？セーフ？ 30の行動を3択で仕分けると、あなたの「許せる度」とタイプ、どこから引っかかるかの線が見えてきます。"),
      ended ? null : h("a", { class: "btn btn-primary btn-lg btn-block btn-fit", href: url("line/") }, "浮気許せる度診断をはじめる", icon("arrow"))));
}

// ---- 2つの入口 ----
function typeNameOf(kind, rec) {
  const r = rec.result || (kind === "line" ? scoreLine(rec.answers) : scoreFeel(rec.answers));
  const t = r && typeById(r.typeId);
  return t ? t.name : "";
}

function entryCard(kind) {
  const rec = store.getRecord(kind);
  const line = kind === "line";
  const choices = (line ? LINE_CHOICES : FEEL_CHOICES).map((c) => h("span", { class: `chip chip--${c.key} chip--dot chip-sm`, text: c.label }));
  const card = h("a", { class: ["entry-card", !line && "entry-card--feel"], href: url(kind + "/") },
    h("span", { class: "entry-kicker", text: line ? "恋人がこれをしたら？" : "自分がするなら、相手は？" }),
    h("span", { class: "entry-title", text: line ? "浮気許せる度診断" : "本音ライン診断" }),
    h("span", { class: "entry-desc", text: line
      ? "30の行動を「アウト・モヤる・セーフ」で仕分け。許せる度（0〜100点）と12のタイプ、カテゴリごとの線が分かります。"
      : "同じ30の行動を「気になる人にだけ・友達なら・誰とでも」で。本気のサインと6つのタイプ、浮気ラインとのズレが分かります。" }),
    h("span", { class: "chips entry-choices" }, choices),
    h("span", { class: "entry-meta" }, h("span", { text: "30問・約3分" }), h("span", { class: "entry-go" }, rec ? "もう一度" : "はじめる", icon("arrow"))));
  const name = rec ? typeNameOf(kind, rec) : "";
  return h("div", { class: "entry" },
    card,
    rec
      ? h("a", { class: "entry-result", href: url(kind + "/#done") },
        h("span", { class: "entry-result-label", text: "前の結果" }),
        h("b", { class: "entry-result-name", text: name || "結果を見る" }),
        h("span", { class: "entry-result-go" }, "見る", icon("arrow")))
      : null);
}

function entrySection() {
  const both = store.getRecord("line") && store.getRecord("feel");
  return h("section", { class: "section stack", id: "start" },
    h("span", { class: "eyebrow", text: "2つの診断" }),
    h("h2", { class: "h2", text: "どちらからでも、30問・約3分" }),
    h("div", { class: "stack entries" }, entryCard("line"), entryCard("feel")),
    both
      ? h("div", { class: "notice" }, icon("info"),
        h("p", {}, "両方そろっています。", h("b", { text: "浮気ラインと本音のズレ" }), "は、結果の画面の下のほうにあります。", h("a", { class: "link", href: url("line/#done") }, "浮気ラインの結果へ")))
      : h("p", { class: "small muted" }, "両方やると「恋人には許さないのに、自分はしていること」が分かります。"));
}

// ---- みんなの統計の見どころ ----
function highlightSection() {
  const list = h("div", { class: "hl-list" }, [0, 1, 2].map(() => h("div", { class: "card card--tight hl-card" },
    h("span", { class: "skeleton", style: "height:14px;width:40%" }),
    h("span", { class: "skeleton", style: "height:22px;width:90%;margin-top:10px" }),
    h("span", { class: "skeleton", style: "height:10px;width:100%;margin-top:12px" }))));
  const sec = h("section", { class: "section stack", id: "highlights" },
    h("span", { class: "eyebrow", text: "みんなの統計" }),
    h("h2", { class: "h2", text: "みんなの答えの見どころ" }),
    picture("img/stats.webp", { alt: "3色のバーの上に、みんなの駒が集まったり、ばらけたりしている絵" }),
    list,
    h("a", { class: "btn btn-secondary btn-block", href: url("stats/") }, icon("stats"), "みんなの統計を見る"));
  const load = () => {
    getStats()
      .then((s) => fill(list, ...highlightCards(s)))
      .catch((e) => fill(list, errorBox(e, { title: "統計を読めませんでした", retry: load })));
  };
  load();
  return sec;
}

function highlightCards(s) {
  const n = (s.n && s.n.line) || 0;
  if (n < MIN_N) {
    return [h("div", { class: "notice notice--ink collecting" }, icon("clock"),
      h("p", {}, h("b", { text: "集計中" }), `（いま${n}人）。${MIN_N}人をこえると、ここに「浮気だと思う人がいちばん多い行動」や「意見が割れた行動」が出ます。`))];
  }
  const word = store.getWord();
  const mine = store.getRecord("line");
  const hl = highlights(s);
  const cards = [];
  const qt = (i) => applyWord(QUESTIONS[i].text, word);
  const band = (counts, keys, my) => {
    const p = pcts(counts);
    return h("div", { class: "band band--lg", role: "img", "aria-label": keys.map((k, j) => `${LABEL[k]}${p[j]}%`).join(" ") },
      counts.map((c, j) => h("span", { class: ["band-seg", `band-seg--${keys[j]}`, my === j && "is-mine"], style: { "--w": String(c) }, hidden: c === 0 },
        h("span", { class: "band-pct", text: p[j] + "%" }))));
  };
  const myAns = (i) => (mine ? Number(mine.answers[i]) : null);
  cards.push(hlCard("浮気だと思う人がいちばん多い", qt(hl.outTop.i), `${hl.outTop.pct}%`, "がアウト", "out", band(s.q.line[hl.outTop.i], LKEYS, myAns(hl.outTop.i))));
  cards.push(hlCard("意見がいちばん割れた", qt(hl.split.i), null, "人によって答えがバラバラ", "moya", band(s.q.line[hl.split.i], LKEYS, myAns(hl.split.i))));
  if (hl.gap && pairTotal(s.pair) >= MIN_N) {
    cards.push(hlCard("恋人には許さないのに、自分はしがち", qt(hl.gap.i), `${hl.gap.pct}%`, "の人が当てはまる", "only", null));
  } else {
    cards.push(hlCard("いちばんセーフが多い", qt(hl.safeTop.i), `${hl.safeTop.pct}%`, "がセーフ", "safe", band(s.q.line[hl.safeTop.i], LKEYS, myAns(hl.safeTop.i))));
  }
  return cards;
}
function hlCard(label, text, big, unit, tone, bandEl) {
  return h("div", { class: `card card--tight hl-card hl-card--${tone}` },
    h("span", { class: "hl-label", text: label }),
    h("p", { class: "hl-q", text: text }),
    big ? h("p", { class: "hl-big" }, h("span", { class: "hl-num", text: big }), h("span", { class: "hl-unit", text: unit })) : h("p", { class: "hl-sub", text: unit }),
    bandEl);
}

// ---- 当てっこ ----
function quizSection() {
  const line = store.getRecord("line");
  const quizzes = store.getQuizzes();
  const attempts = store.getAttempts();
  return h("section", { class: "section stack", id: "quiz" },
    h("div", { class: "card card--ink stack quiz-promo" },
      picture("img/quiz.webp", { alt: "ハリネズミとネコが、ついたての向こうの印の位置を当てっこしている絵", cls: "pic--on-ink" }),
      h("span", { class: "eyebrow eyebrow--light", text: "当てっこ" }),
      h("h2", { class: "h2 quiz-promo-title", text: "わたしの浮気ライン、当てられる？" }),
      h("p", { class: "quiz-promo-text", text: "浮気許せる度診断のあなたの答えを、友達に予想してもらう遊び。合った数で点数がつき、ランキングになります。" }),
      h("ol", { class: "steps" },
        h("li", {}, h("b", { text: "1" }), h("span", { text: "浮気許せる度診断に答える" })),
        h("li", {}, h("b", { text: "2" }), h("span", { text: "当てっこを作って、リンクを友達に送る" })),
        h("li", {}, h("b", { text: "3" }), h("span", { text: "友達が30問を予想して、点数とランキング" }))),
      line
        ? h("a", { class: "btn btn-light btn-block", href: url("q/?make=1") }, icon("people"), "当てっこを作る")
        : h("a", { class: "btn btn-light btn-block btn-fit", href: url("line/") }, "まず診断をやる", icon("arrow"))),
    quizzes.length
      ? h("div", { class: "stack stack-sm" },
        h("h3", { class: "h3", text: "あなたが作った当てっこ" }),
        h("ul", { class: "mini-list" }, quizzes.slice(0, 5).map((q) => h("li", {},
          h("a", { class: "mini-row", href: url(`q/?id=${encodeURIComponent(q.id)}${q.w ? "&w=" + q.w : ""}`) },
            h("span", { class: "mini-name", text: (q.name || "名前なし") + "の浮気ライン" }),
            h("span", { class: "mini-go" }, "ランキング", icon("arrow")))))))
      : null,
    attempts.length
      ? h("div", { class: "stack stack-sm" },
        h("h3", { class: "h3", text: "あなたが答えた当てっこ" }),
        h("ul", { class: "mini-list" }, attempts.slice(0, 5).map((a) => h("li", {},
          h("a", { class: "mini-row", href: url(`q/?id=${encodeURIComponent(a.quizId)}`) },
            h("span", { class: "mini-name", text: a.quizName ? a.quizName + "の浮気ライン" : "当てっこ" }),
            h("span", { class: "mini-score" }, h("b", { text: String(a.score) }), "/30"))))))
      : null);
}

// ---- 作者のほかのサイト ----
function sisterSection() {
  const box = h("section", { class: "section sister-slot", id: "sister" });
  import("./sister.js")
    .then((m) => m.renderSister(box, { place: "top" }))
    .catch((e) => {
      // sister.js が無い・読めないときは、文字だけのリンクを出しておく
      console.debug("[top] sister.js を使えないので文字のリンクにします", e);
      const link = (key, title, desc) => h("a", {
        class: "link-card link-card--text", href: SISTER[key].url, target: "_blank", rel: "noopener",
        onclick: () => track(SISTER[key].ev, { place: "top" }),
      }, h("span", { class: "link-card-body" },
        h("span", { class: "link-card-name", text: SISTER[key].name }),
        h("span", { class: "link-card-title", text: title }),
        h("span", { class: "link-card-desc", text: desc })));
      fill(box,
        h("span", { class: "eyebrow", text: "作者のほかのサイト" }),
        h("div", { class: "stack stack-sm mt-m" },
          link("rikaido", "リカイド 恋編", "恋人や友達が、あなたの恋愛観をどれだけ分かってるか"),
          link("nakamidoRenai", "恋愛偏差値診断", "あなたの恋愛の強さを偏差値で"),
          link("nakamidoAisho", "相性診断", "ふたりの相性をくわしく")));
    });
  return box;
}

// ---- 期間限定 ----
function limitedSection(ended) {
  return h("section", { class: "section" },
    h("div", { class: "notice" }, icon("clock"),
      h("p", {},
        ended
          ? [h("b", { text: `公開は${END_LABEL}で終わりました。` }), "データはすべて消しました。"]
          : [h("b", { text: `${END_LABEL}までの期間限定公開` }), "です。11月1日 0:00 に受付を止めて、答え・当てっこ・統計のデータをすべて消します。"],
        " ",
        h("a", { class: "link", href: url("about/") }, "このサイトについて"))));
}
