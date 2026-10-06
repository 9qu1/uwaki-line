// 30問に答える画面（浮気ライン line/・本音ライン feel/ 共通）と、当てっこの予想（q/）で使う1問ずつの3択
//
//   line/index.html・feel/index.html は <body data-play="line"> などを付けてこのファイルを読む（自動で始まる）
//   q/ は runQuestions() だけを使う（data-play が無いので自動では始まらない）
//
//   流れ: 説明と設定（相手の呼び方・属性はどれも任意）→ 1問ずつ3択 → 結果（URL に #done）
//   終わったら: store に保存（ul.line / ul.feel）→ まだ数えていなければ /api/play に送る（pair は両方そろったときだけ）
//             → result.js の showResult(container, { kind, answers, attrs, word, playPromise }) を呼ぶ
//               playPromise は { n, pct } か null に解決する（失敗しても結果は出す）
//   途中で閉じても sessionStorage（ul.progress.line など）で続きから
import { QUESTIONS, CATEGORIES, PARTNER_WORDS, LINE_CHOICES, FEEL_CHOICES, MODE_PROMPTS, MODE_HINTS, WORD_NOTE } from "./data/questions.js";
import { scoreLine, scoreFeel, applyWord, typeById } from "./engine.js";
import { isEnded } from "./config.js";
import * as store from "./store.js";
import { apiPlay, getStats } from "./api.js";
import { h, icon, url, renderHeader, renderFooter, toast, track, endedView, fill } from "./ui.js";

const N = QUESTIONS.length;
const CAT = Object.fromEntries(CATEGORIES.map((c) => [c.id, c]));
const NEXT_DELAY = 220; // 押してから次の問題へ移るまで（押した感じを見せる）
const INPUT_GUARD = 240; // 次の問題を出してから、押しを受け付けるまで（うっかりの2回押しで、読んでいない問題に答えが入らないように）
const PCT_MIN = 30; // 「上位◯%」を出し始める人数（API と同じ）

// 属性の選択肢（CONTRACT §4-2）
export const ATTR_DEFS = [
  { key: "age", label: "年代", opts: [["10", "10代"], ["20", "20代"], ["30", "30代"], ["40", "40代〜", "40代以上"]] },
  { key: "gender", label: "性別", opts: [["f", "女性"], ["m", "男性"], ["x", "その他"]] },
  { key: "love", label: "恋人", opts: [["y", "いる"], ["n", "いない"]] },
];
const ATTR_OK = { age: ["10", "20", "30", "40"], gender: ["f", "m", "x"], love: ["y", "n"] };
export function cleanAttrs(a) {
  const o = {};
  for (const k of Object.keys(ATTR_OK)) o[k] = a && ATTR_OK[k].includes(a[k]) ? a[k] : "";
  return o;
}

const MODE_TITLE = { line: "浮気許せる度診断", feel: "本音ライン診断" };
const MODE_LEAD = {
  line: "恋人がこの行動をしたら、アウト？モヤる？セーフ？ 30の行動を仕分けると、あなたの「許せる度」（0〜100点）とタイプ、どこから引っかかるかの線が分かります。",
  feel: "あなたがこの行動をするとしたら、相手は誰？ 「気になる人にだけ」「友達なら」「誰とでも」で答えると、あなたの本音のラインが分かります。浮気許せる度診断と両方やると、ふたつのズレも出ます。",
};

// ─────────────────────────────────────────────────────────────
// 1問ずつの3択（line/・feel/・q/ の予想で共通）
//   opts: {
//     mode: "line" | "feel"（選択肢の種類）
//     word: "i" | "d" | "o"（{X} の呼び方）
//     prompt: 問題の上の問いかけ（文字か要素）
//     initial: [0|1|2|null ×30]（前に答えたもの）・start: 始める問題の番号（0から）
//     onChange(answers, next)  答えるか戻るたび（途中の保存に使う）
//     onDone(answers)          30問そろったら（30文字の数字の列）
//     onExit(answers)          1問目で「戻る」を押したら
//   }
//   返すもの: { destroy() }（キーボードの受け付けを外す）
// ─────────────────────────────────────────────────────────────
export function runQuestions(container, opts) {
  const mode = opts.mode === "feel" ? "feel" : "line";
  const defs = mode === "feel" ? FEEL_CHOICES : LINE_CHOICES;
  const answers = Array.from({ length: N }, (_, k) => {
    const v = opts.initial ? opts.initial[k] : null;
    return v === 0 || v === 1 || v === 2 ? v : null;
  });
  let i = Math.min(Math.max(Number(opts.start) || 0, 0), N - 1);
  let busy = false; // 押してから次の問題を出すまで（答えも「戻る」も受け付けない）
  let guard = false; // 次の問題を出した直後（答えだけ受け付けない。「戻る」は押せる）
  let guardTimer = 0;
  let alive = true;

  const fillBar = h("div", { class: "progress-fill" });
  const countNow = h("b", { text: "1" });
  const progress = h("div", { class: "progress" },
    h("div", { class: "progress-track" }, fillBar),
    h("span", { class: "progress-count" }, countNow, "/" + N));
  const marks = Array.from({ length: N }, () => h("i"));
  const trail = h("div", { class: "trail", "aria-hidden": "true" }, marks);
  const qnum = h("b", { text: "1" });
  const cat = h("span", { class: "chip" });
  const qtext = h("p", { class: "qcard-text", id: "ul-qtext" });
  const card = h("div", { class: "qcard" },
    h("div", { class: "qcard-head" }, h("span", { class: "qcard-num" }, "Q", qnum), cat),
    qtext);
  const live = h("p", { class: "sr-only", "aria-live": "polite" });
  const btns = defs.map((c) => h("button", {
    class: `choice choice--${c.key}`, type: "button", "aria-pressed": "false", "aria-describedby": "ul-qtext",
    onclick: () => choose(c.v),
  },
    h("span", { class: "choice-lamp", "aria-hidden": "true" }),
    h("span", { class: "choice-body" },
      h("span", { class: "choice-label", text: c.label }),
      h("span", { class: "choice-sub", text: c.sub })),
    h("span", { class: "choice-key", "aria-hidden": "true", text: String(c.v + 1) })));
  const group = h("div", { class: ["choices", mode === "feel" && "choices--feel"], role: "group", "aria-label": "答え" }, btns);
  const backBtn = h("button", { class: "btn btn-ghost btn-sm play-back", type: "button", onclick: () => back() }, icon("back"), "戻る");
  const prompt = h("p", { class: "play-prompt" }, opts.prompt || "");
  const root = h("section", { class: ["play", `play--${mode}`] },
    h("div", { class: "play-top" }, progress, trail),
    prompt,
    card,
    live,
    group,
    h("div", { class: "play-foot" }, backBtn, h("span", { class: "play-keys", text: "キーボードの 1・2・3 でも答えられます" })));
  fill(container, root);

  function render(animate, lock = false) {
    const q = QUESTIONS[i];
    qnum.textContent = String(i + 1);
    countNow.textContent = String(i + 1);
    progress.style.setProperty("--p", (i / N) * 100 + "%");
    cat.textContent = (CAT[q.cat] && CAT[q.cat].label) || "";
    qtext.textContent = applyWord(q.text, opts.word);
    live.textContent = `${i + 1}問目`;
    marks.forEach((m, k) => {
      const a = answers[k];
      m.className = [a !== null ? "is-" + defs[a].key : "", k === i ? "is-now" : ""].filter(Boolean).join(" ");
    });
    btns.forEach((b, k) => { b.disabled = lock; b.setAttribute("aria-pressed", String(answers[i] === k)); });
    if (animate) {
      card.classList.remove("is-enter");
      void card.offsetWidth;
      card.classList.add("is-enter");
      // 小さい画面で下までスクロールして押したときは、次の問題の頭が見えるところへ戻す
      const top = prompt.getBoundingClientRect().top;
      if (top < 0) window.scrollTo({ top: window.scrollY + top - 12, behavior: "auto" });
    }
  }

  function choose(v) {
    if (busy || guard || !alive) return;
    busy = true;
    btns.forEach((b, k) => { b.setAttribute("aria-pressed", String(k === v)); b.disabled = true; });
    answers[i] = v;
    if (opts.onChange) opts.onChange(answers.slice(), i < N - 1 ? i + 1 : Math.max(0, answers.indexOf(null)));
    setTimeout(() => {
      if (!alive) return;
      if (i < N - 1) {
        i += 1; // 前に答えた問題も1問ずつ進む（戻って直したとき）
      } else {
        const empty = answers.indexOf(null);
        if (empty === -1) { finish(); return; }
        i = empty; // 最後まで来て空きがあれば、空いている問題へ
      }
      // 次の問題を出したあとも少しだけ答えを押せないままにする（2回押しの2回目を受け付けない）
      busy = false;
      guard = true;
      render(true, true);
      guardTimer = setTimeout(() => {
        guard = false;
        if (!alive) return;
        btns.forEach((b) => { b.disabled = false; });
      }, INPUT_GUARD);
    }, NEXT_DELAY);
  }

  function back() {
    if (busy || !alive) return;
    // 答えを押せない間（次の問題を出した直後）でも「戻る」は受け付ける
    clearTimeout(guardTimer);
    guard = false;
    if (i === 0) {
      destroy();
      if (opts.onExit) opts.onExit(answers.slice());
      return;
    }
    i -= 1;
    if (opts.onChange) opts.onChange(answers.slice(), i);
    render(true);
  }

  function finish() {
    destroy();
    opts.onDone(answers.join(""));
  }

  function onKey(e) {
    if (!alive || e.altKey || e.ctrlKey || e.metaKey) return;
    const t = e.target;
    if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
    if (document.body.classList.contains("is-locked")) return;
    if (e.key === "1" || e.key === "2" || e.key === "3") { e.preventDefault(); choose(Number(e.key) - 1); }
    else if (e.key === "ArrowLeft" || e.key === "Backspace") { e.preventDefault(); back(); }
  }
  function destroy() {
    alive = false;
    document.removeEventListener("keydown", onKey);
  }
  document.addEventListener("keydown", onKey);
  render(false);
  return { destroy };
}

// ─────────────────────────────────────────────────────────────
// line/・feel/ のページ
// ─────────────────────────────────────────────────────────────
function main(kind) {
  renderHeader({ current: kind });
  renderFooter();
  const app = document.getElementById("app");
  if (isEnded()) {
    fill(app, endedView());
    return;
  }
  window.addEventListener("hashchange", () => {
    if (location.hash === "#done") showDone(kind, app);
  });
  if (location.hash === "#done") {
    if (showDone(kind, app)) return;
    history.replaceState(null, "", location.pathname + location.search);
  }
  const prog = readProgress(kind);
  if (prog && prog.filled > 0) {
    // 途中で閉じた続きから
    startQuestions(kind, app, prog.word, prog.attrs, prog.initial, prog.next);
    toast(`続きから（${prog.next + 1}問目）`);
    return;
  }
  renderIntro(kind, app);
}

function readProgress(kind) {
  const p = store.getProgress(kind);
  if (!p || typeof p.a !== "string" || p.a.length !== N) return null;
  const initial = [...p.a].map((ch) => (ch === "0" || ch === "1" || ch === "2" ? Number(ch) : null));
  const filled = initial.filter((v) => v !== null).length;
  let next = Number.isInteger(p.i) ? p.i : initial.indexOf(null);
  if (next < 0 || next >= N) next = Math.max(0, initial.indexOf(null));
  return { initial, filled, next, word: ["i", "d", "o"].includes(p.word) ? p.word : store.getWord(), attrs: cleanAttrs(p.attrs) };
}

function renderIntro(kind, app) {
  let word = store.getWord();
  const attrs = store.lastAttrs();
  const rec = store.getRecord(kind);
  const prog = readProgress(kind);
  const other = kind === "line" ? "feel" : "line";
  const otherRec = store.getRecord(other);

  // 相手の呼び方
  const sampleQ = QUESTIONS.find((q) => q.id === "q30") || QUESTIONS[QUESTIONS.length - 1];
  const sample = h("p", { class: "word-sample" });
  const segBtns = PARTNER_WORDS.map((w) => h("button", {
    class: "seg-btn", type: "button", "aria-pressed": String(w.id === word),
    onclick: () => {
      word = w.id;
      segBtns.forEach((b, k) => b.setAttribute("aria-pressed", String(PARTNER_WORDS[k].id === word)));
      paintSample();
    },
  }, w.label));
  function paintSample() {
    fill(sample, "例：「", h("b", { text: applyWord(sampleQ.text, word) }), "」");
  }
  paintSample();

  // 属性（どれも任意・もう一度押すと外れる）
  const groups = ATTR_DEFS.map((d) => {
    const chips = d.opts.map(([v, label, aria]) => h("button", {
      class: "chip chip--pick", type: "button", "aria-pressed": String(attrs[d.key] === v), "aria-label": aria || null,
      onclick: (e) => {
        attrs[d.key] = attrs[d.key] === v ? "" : v;
        chips.forEach((c, k) => c.setAttribute("aria-pressed", String(attrs[d.key] === d.opts[k][0])));
        e.currentTarget.blur();
      },
    }, label));
    return h("div", { class: "attr-group", role: "group", "aria-label": d.label },
      h("span", { class: "attr-label", text: d.label }),
      h("div", { class: `attr-chips attr-chips--${d.opts.length}` }, chips));
  });

  const start = (useAttrs) => {
    store.setWord(word);
    const a = useAttrs ? cleanAttrs(attrs) : cleanAttrs({});
    const p = readProgress(kind);
    track("start_" + kind, { word });
    startQuestions(kind, app, word, a, p ? p.initial : null, p ? Math.max(0, p.initial.indexOf(null)) : 0);
  };

  const legend = (kind === "line" ? LINE_CHOICES : FEEL_CHOICES).map((c) => h("li", { class: `mode-legend-item mode-legend-item--${c.key}` },
    h("span", { class: "mode-legend-dot", "aria-hidden": "true" }),
    h("b", { text: c.label }),
    h("span", { class: "muted", text: c.sub })));

  fill(app,
    h("section", { class: "section stack intro" },
      h("span", { class: "eyebrow" }, "30問・約3分"),
      h("h1", { class: "h1", text: MODE_TITLE[kind] }),
      h("p", { class: "lead", text: MODE_LEAD[kind] }),
      h("div", { class: "card card--soft card--tight stack stack-sm" },
        h("p", { class: "mode-prompt" }, h("span", { class: "tri-line", "aria-hidden": "true" }), MODE_PROMPTS[kind]),
        h("ul", { class: ["mode-legend", kind === "feel" && "mode-legend--feel"] }, legend)),
      h("div", { class: "notice" }, icon("info"), h("p", { text: MODE_HINTS[kind] }))),
    h("section", { class: "section stack intro-setup" },
      h("div", { class: "stack stack-sm" },
        h("h2", { class: "h3", text: "相手の呼び方" }),
        h("div", { class: "seg", role: "group", "aria-label": "相手の呼び方" }, segBtns),
        h("p", { class: "small muted", text: WORD_NOTE }),
        sample),
      h("div", { class: "stack stack-sm" },
        h("h2", { class: "h3" }, "あなたのこと", h("span", { class: "h3-note", text: "（答えなくてOK）" })),
        h("div", { class: "card card--tight stack stack-sm attr-card" }, groups),
        h("p", { class: "small muted", text: "みんなの統計に、名前なしで数えます（同じ端末は最初の1回だけ）。" })),
      prog && prog.filled > 0
        ? h("div", { class: "notice notice--warn" }, icon("info"),
          h("div", { class: "stack stack-sm" },
            h("p", {}, `途中まで答えています（${prog.filled}/${N}問）。「はじめる」で続きから。`),
            h("div", {}, h("button", {
              class: "btn btn-ghost btn-sm", type: "button",
              onclick: () => { store.clearProgress(kind); renderIntro(kind, app); toast("最初からにしました"); },
            }, icon("retry"), "最初からやり直す"))))
        : null,
      h("div", { class: "stack stack-sm" },
        h("button", { class: "btn btn-primary btn-lg btn-block", type: "button", onclick: () => start(true) }, "はじめる", icon("arrow")),
        h("button", { class: "btn btn-ghost btn-block", type: "button", onclick: () => start(false) }, "答えずに始める"),
        rec ? h("a", { class: "btn btn-secondary btn-block", href: "#done" }, "前の結果を見る") : null,
        rec ? resultName(kind, rec) : null),
      !otherRec
        ? h("p", { class: "small muted center" },
          kind === "line" ? "本音ライン診断もやると、浮気ラインとのズレが分かります。" : "浮気許せる度診断もやると、本音とのズレが分かります。",
          h("a", { class: "link", href: url(other + "/") }, kind === "line" ? "本音ライン診断へ" : "浮気許せる度診断へ"))
        : null));
  window.scrollTo(0, 0);
}

function resultName(kind, rec) {
  const r = rec.result || (kind === "line" ? scoreLine(rec.answers) : scoreFeel(rec.answers));
  const t = r && typeById(r.typeId);
  return t ? h("p", { class: "small muted center", text: `前回の結果: ${t.name}` }) : null;
}

function startQuestions(kind, app, word, attrs, initial, next) {
  window.scrollTo(0, 0);
  const save = (ans, i) => store.saveProgress(kind, { word, attrs, a: ans.map((v) => (v === null ? "-" : String(v))).join(""), i });
  if (!initial) save(Array(N).fill(null), 0);
  runQuestions(app, {
    mode: kind,
    word,
    prompt: MODE_PROMPTS[kind],
    initial,
    start: next || 0,
    onChange: save,
    onExit: (ans) => { save(ans, 0); renderIntro(kind, app); },
    onDone: (answers) => finish(kind, app, answers, word, attrs),
  });
}

function finish(kind, app, answers, word, attrs) {
  const result = kind === "line" ? scoreLine(answers) : scoreFeel(answers);
  const rec = { answers, attrs: cleanAttrs(attrs), word, at: Date.now(), result };
  store.saveRecord(kind, rec);
  store.clearProgress(kind);
  track("finish_" + kind, { type: result ? result.typeId : "" });
  // 戻るボタンで問題に戻らないように、履歴を足さずに #done にする
  history.replaceState(null, "", location.pathname + location.search + "#done");
  const playPromise = countPlay(kind, rec);
  showResultView(kind, app, rec, playPromise);
}

/** 統計に数える（同じ端末は最初の1回だけ）。数え済みなら統計から「上位◯%」を出す。失敗しても null */
function countPlay(kind, rec) {
  if (store.isCounted(kind)) return fromStats(kind, rec);
  const other = store.getRecord(kind === "line" ? "feel" : "line");
  const body = { kind, answers: rec.answers, attrs: cleanAttrs(rec.attrs) };
  if (other) body.pair = kind === "line" ? { line: rec.answers, feel: other.answers } : { line: other.answers, feel: rec.answers };
  return apiPlay(body)
    .then((r) => {
      store.setCounted(kind);
      const out = { n: Number(r.n) || 0, pct: typeof r.pct === "number" ? r.pct : null };
      store.patchRecord(kind, out);
      return out;
    })
    .catch((e) => {
      console.debug("[play] 統計に送れませんでした（結果はそのまま出す）", e && e.code);
      return null;
    });
}

/** みんなの統計から人数と「自分より低い人の割合」を出す（API の pct と同じ数え方） */
function fromStats(kind, rec) {
  return getStats()
    .then((s) => {
      const n = (s.n && s.n[kind]) || 0;
      let pct = null;
      const r = rec.result || scoreLine(rec.answers);
      if (kind === "line" && n >= PCT_MIN && s.hist && Array.isArray(s.hist.line) && r) {
        const my = Math.min(20, Math.max(0, Math.floor(r.score / 5)));
        let lower = 0, same = 0, total = 0;
        s.hist.line.forEach((c, b) => { total += c; if (b < my) lower += c; else if (b === my) same += c; });
        pct = total ? Math.round((100 * (lower + same / 2)) / total) : null;
      }
      const out = { n, pct };
      store.patchRecord(kind, out);
      return out;
    })
    .catch(() => null);
}

/** 開き直したとき（#done）。前の結果が無ければ false */
function showDone(kind, app) {
  const rec = store.getRecord(kind);
  if (!rec) return false;
  if (!rec.result) rec.result = kind === "line" ? scoreLine(rec.answers) : scoreFeel(rec.answers);
  showResultView(kind, app, rec, countPlay(kind, rec));
  return true;
}

let shownSeq = 0;
async function showResultView(kind, app, rec, playPromise) {
  const seq = ++shownSeq;
  window.scrollTo(0, 0);
  fill(app);
  try {
    const mod = await import("./result.js");
    if (seq !== shownSeq) return;
    await mod.showResult(app, { kind, answers: rec.answers, attrs: rec.attrs || {}, word: rec.word || "i", playPromise });
  } catch (e) {
    console.warn("[play] result.js が使えないので仮の表示にします", e);
    if (seq !== shownSeq) return;
    fill(app, fallbackResult(kind, rec, playPromise));
  }
}

// result.js がまだ無いとき・読めなかったときの仮の結果
function fallbackResult(kind, rec, playPromise) {
  const r = rec.result || (kind === "line" ? scoreLine(rec.answers) : scoreFeel(rec.answers));
  const t = r ? typeById(r.typeId) : null;
  const extra = h("p", { class: "small muted" });
  playPromise.then((p) => {
    if (p && p.n) extra.textContent = p.pct != null ? `いま ${p.n}人が遊びました。あなたより許せる度が低い人は ${p.pct}%。` : `いま ${p.n}人が遊びました。`;
  });
  return h("section", { class: "section stack fallback-result" },
    h("span", { class: "eyebrow", text: MODE_TITLE[kind] + "の結果" }),
    h("div", { class: "card stack" },
      h("p", { class: "h1", text: t ? t.name : "結果" }),
      t ? h("p", { class: "lead", text: t.catch }) : null,
      kind === "line" && r
        ? h("div", { class: "stats-grid", style: "--cols:2" },
          h("div", { class: "stat" }, h("span", { class: "stat-label", text: "許せる度" }), h("span", { class: "stat-val" }, String(r.score), h("small", { text: "点" }))),
          h("div", { class: "stat" }, h("span", { class: "stat-label", text: "モヤる率" }), h("span", { class: "stat-val" }, String(r.gray), h("small", { text: "%" }))))
        : null,
      kind === "feel" && r
        ? h("div", { class: "stats-grid", style: "--cols:2" },
          h("div", { class: "stat" }, h("span", { class: "stat-label", text: "気になる人にだけ" }), h("span", { class: "stat-val" }, String(r.special), h("small", { text: "%" }))),
          h("div", { class: "stat" }, h("span", { class: "stat-label", text: "ひらき度" }), h("span", { class: "stat-val" }, String(r.open))))
        : null,
      t ? h("p", { text: t.desc }) : null,
      extra),
    h("div", { class: "stack stack-sm" },
      kind === "line" ? h("a", { class: "btn btn-primary btn-block", href: url("q/?make=1") }, "当てっこを作る", icon("arrow")) : null,
      h("a", { class: "btn btn-secondary btn-block", href: url(kind === "line" ? "feel/" : "line/") }, kind === "line" ? "本音ライン診断へ" : "浮気許せる度診断へ"),
      h("a", { class: "btn btn-ghost btn-block", href: "./" }, icon("retry"), "もう一度やる")));
}

// line/・feel/ のページなら始める（いちばん最後に呼ぶ。上の let などが決まってから）
const PAGE_KIND = typeof document !== "undefined" ? document.body.dataset.play : "";
if (PAGE_KIND === "line" || PAGE_KIND === "feel") main(PAGE_KIND);
