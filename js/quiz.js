// 当てっこ（q/・noindex）
//   ?make=1      作る（store の最後の浮気ラインの答えを使う。無ければ「先に浮気許せる度診断を」）
//   ?id=xxxxxxxx 答える（友達）／作った人の画面（store に鍵があるとき・#k=鍵 で開いたとき）
//                &w=i|d|o は作った人が選んだ相手の呼び方（問題文の {X}）
//   何も無し     当てっこの説明と、自分が作った・答えた当てっこの一覧
//
//   作った人の鍵は URL の #k= で受け取り、すぐ store（ul.quizzes）に入れて URL から消す
//   名前は必ず textContent で入れる（innerHTML にしない）
import { QUESTIONS, LINE_CHOICES } from "./data/questions.js";
import { applyWord, quizScore, typeById, scoreLine } from "./engine.js";
import { isEnded } from "./config.js";
import * as store from "./store.js";
import * as api from "./api.js";
import { h, icon, url, renderHeader, renderFooter, toast, track, endedView, modal, copyText, errorBox, errMsg, loadingView, xShareUrl, lineShareUrl, fmtDate, fill, picture } from "./ui.js";
import { nameIssue } from "./namecheck.js";
import { runQuestions } from "./play.js";
import { isPhone } from "./share.js";

// スマホでは X・LINE を同じタブで開く（新しいタブだとアプリに切り替わらず、空のタブが残って元の画面が真っ白に見えた・2026-10-06）
const PHONE = isPhone();

const N = QUESTIONS.length;
const ID_RE = /^[a-z2-9]{8}$/;
const NAME_MAX = 12;
const WORDS = ["i", "d", "o"];
const CH = Object.fromEntries(LINE_CHOICES.map((c) => [c.v, c]));
const HASHTAG = "#浮気許せる度診断";

const params = new URLSearchParams(location.search);
let app;

main();

function main() {
  renderHeader();
  renderFooter();
  app = document.getElementById("app");
  if (isEnded()) {
    fill(app, endedView());
    return;
  }
  const id = params.get("id");
  // 作った人の鍵（#k=…）を取り込んで、すぐ URL から消す（履歴にも残さない）
  const m = location.hash.match(/[#&]k=([A-Za-z0-9_-]{32})/);
  if (location.hash) history.replaceState(null, "", location.pathname + location.search);
  if (m && id && ID_RE.test(id)) {
    const w = params.get("w");
    store.addQuiz({ id, key: m[1], ...(WORDS.includes(w) ? { w } : {}) });
  }
  if (params.get("make") === "1") return makeView();
  if (id && ID_RE.test(id)) return loadQuiz(id);
  if (id) return notFoundView(null, null);
  return indexView();
}

// ─── 小物 ────────────────────────────────────────────────
function wordOf(id) {
  const w = params.get("w");
  if (WORDS.includes(w)) return w;
  const q = id ? store.findQuiz(id) : null;
  if (q && WORDS.includes(q.w)) return q.w;
  const a = id ? store.findAttempt(id) : null;
  if (a && WORDS.includes(a.w)) return a.w;
  return "i";
}
function shareLink(id, w) {
  return url(`q/?id=${id}` + (w && w !== "i" ? `&w=${w}` : ""));
}
/** URL の ?id= などを差しかえる（?api= など手元用のものは残す） */
function setSearch(obj) {
  const p = new URLSearchParams(location.search);
  for (const k of ["make", "id", "w"]) p.delete(k);
  for (const [k, v] of Object.entries(obj)) if (v) p.set(k, v);
  const s = p.toString();
  history.replaceState(null, "", location.pathname + (s ? "?" + s : ""));
}
/** ページの題（タブの名前）。作った人・答えた人の名前は入れない（アクセス解析などで外に出さないため） */
function setTitle(text) {
  document.title = text ? `${text}｜浮気許せる度診断` : "当てっこ｜浮気許せる度診断";
}
function section(...kids) {
  return h("section", { class: "section stack" }, ...kids);
}
function rankPos(list, r) {
  return 1 + list.filter((x) => x.score > r.score).length;
}

/** 名前の下調べ（本当の判定はサーバー。ここでは分かりやすい理由を先に出す） */
function checkName(raw) {
  const s = String(raw || "");
  if (s.length > 64) return { error: "長すぎます。12文字までにしてください。" };
  const n = s.normalize("NFKC").replace(/[\p{Cc}\p{Cf}]/gu, "").replace(/[<>"'&`\\]/g, "").replace(/\s+/g, " ").trim();
  if (!n) return { error: "名前を入れてください。" };
  if ([...n].length > NAME_MAX) return { error: `${NAME_MAX}文字までにしてください。` };
  if (!/[\p{L}\p{N}\p{S}]/u.test(n)) return { error: "その名前は使えません。" };
  const issue = nameIssue(n); // サーバーと同じ判定（namecheck.js）
  if (issue === "url") return { error: "URL のようなものは入れられません。" };
  if (issue === "contact") return { error: "SNS の ID や電話番号などの連絡先は入れないでください。" };
  if (issue) return { error: "その名前は使えません。ちがう名前にしてください。" };
  return { name: n };
}

function nameField(label, help) {
  const input = h("input", {
    class: "input", id: "ul-name", type: "text", maxlength: "24", autocomplete: "off", autocapitalize: "off",
    spellcheck: "false", enterkeyhint: "done", placeholder: "例：しろくま", "aria-describedby": "ul-name-help",
  });
  const count = h("span", { class: "field-count", text: `0/${NAME_MAX}` });
  const err = h("span", { class: "field-error", hidden: true, role: "alert" });
  const sync = () => {
    const len = [...input.value.trim()].length;
    count.textContent = `${len}/${NAME_MAX}`;
    count.classList.toggle("is-over", len > NAME_MAX);
  };
  input.addEventListener("input", () => { sync(); input.removeAttribute("aria-invalid"); err.hidden = true; });
  const el = h("div", { class: "field" },
    h("label", { class: "field-label", for: "ul-name", text: label }),
    input,
    h("div", { class: "field-foot" }, h("span", { class: "field-help", id: "ul-name-help", text: help }), count),
    err);
  return {
    el, input,
    set(v) { input.value = v || ""; sync(); },
    showError(msg) { err.textContent = msg; err.hidden = false; input.setAttribute("aria-invalid", "true"); input.focus(); },
  };
}

function shareRow(text, link, place) {
  const items = [
    h("a", { class: "btn btn-secondary btn-sm share-btn share-btn--x", href: xShareUrl(text, link), target: PHONE ? null : "_blank", rel: PHONE ? null : "noopener", onclick: () => track("share_click", { method: "x", place }) }, icon("x"), "X"),
    h("a", { class: "btn btn-secondary btn-sm share-btn share-btn--line", href: lineShareUrl(text, link), target: PHONE ? null : "_blank", rel: PHONE ? null : "noopener", onclick: () => track("share_click", { method: "line", place }) }, icon("line"), "LINE"),
    h("button", {
      class: "btn btn-secondary btn-sm share-btn", type: "button",
      onclick: async () => {
        const ok = await copyText(link);
        toast(ok ? "リンクをコピーしました" : "コピーできませんでした。上のリンクを長押ししてコピーしてください", { error: !ok });
        track("share_click", { method: "copy", place });
      },
    }, icon("copy"), "コピー"),
  ];
  if (typeof navigator !== "undefined" && navigator.share) {
    items.push(h("button", {
      class: "btn btn-secondary btn-sm share-btn", type: "button",
      onclick: () => { navigator.share({ text, url: link }).catch(() => {}); track("share_click", { method: "native", place }); },
    }, icon("share"), "ほか"));
  }
  return h("div", { class: "share-row" }, items);
}

function linkBox(link) {
  const input = h("input", { class: "input link-input", type: "text", readonly: true, value: link, "aria-label": "友達に送るリンク", onfocus: (e) => e.target.select() });
  return input;
}

// ─── 一覧（?id も ?make も無いとき） ───────────────────────
function steps(light) {
  return h("ol", { class: ["steps", light && "steps--light"] },
    h("li", {}, h("b", { text: "1" }), h("span", { text: "浮気許せる度診断に答える" })),
    h("li", {}, h("b", { text: "2" }), h("span", { text: "当てっこを作って、リンクを友達に送る" })),
    h("li", {}, h("b", { text: "3" }), h("span", { text: "友達が30問を予想して、点数とランキング" })));
}

function myLists() {
  const quizzes = store.getQuizzes();
  const attempts = store.getAttempts();
  return [
    quizzes.length
      ? section(
        h("h2", { class: "h3", text: "あなたが作った当てっこ" }),
        h("ul", { class: "mini-list" }, quizzes.map((q) => h("li", {},
          h("a", { class: "mini-row", href: url(`q/?id=${q.id}` + (q.w && q.w !== "i" ? `&w=${q.w}` : "")) },
            h("span", { class: "mini-name", text: (q.name || "名前なし") + "の浮気ライン" }),
            h("span", { class: "mini-go" }, "ランキング", icon("arrow")))))))
      : null,
    attempts.length
      ? section(
        h("h2", { class: "h3", text: "あなたが答えた当てっこ" }),
        h("ul", { class: "mini-list" }, attempts.map((a) => h("li", {},
          h("a", { class: "mini-row", href: url(`q/?id=${a.quizId}` + (a.w && a.w !== "i" ? `&w=${a.w}` : "")) },
            h("span", { class: "mini-name", text: a.quizName ? a.quizName + "の浮気ライン" : "当てっこ" }),
            h("span", { class: "mini-score" }, h("b", { text: String(a.score) }), "/30"))))))
      : null,
  ];
}

function indexView() {
  setTitle("");
  const line = store.getRecord("line");
  fill(app,
    section(
      picture("img/quiz.webp", { alt: "", eager: true }),
      h("span", { class: "eyebrow", text: "当てっこ" }),
      h("h1", { class: "h1", text: "わたしの浮気ライン、当てられる？" }),
      h("p", { class: "lead", text: "浮気許せる度診断のあなたの答えを、友達に予想してもらう遊びです。30問のうち何問合ったかで点数がつき、ランキングになります。" }),
      steps(true),
      line
        ? h("a", { class: "btn btn-primary btn-lg btn-block", href: url("q/?make=1") }, icon("people"), "当てっこを作る")
        : h("a", { class: "btn btn-primary btn-lg btn-block btn-fit", href: url("line/") }, "まず診断をやる", icon("arrow")),
      h("p", { class: "small muted", text: "当てっこはリンクを知っている人だけが見られます。作った人はいつでも非公開・削除ができます。" })),
    ...myLists());
}

// ─── 作る ────────────────────────────────────────────────
function makeView() {
  setTitle("当てっこを作る");
  const line = store.getRecord("line");
  if (!line) {
    fill(app, section(
      h("span", { class: "eyebrow", text: "当てっこを作る" }),
      h("h1", { class: "h1", text: "先に浮気許せる度診断を" }),
      h("p", { class: "lead", text: "当てっこは、あなたの浮気許せる度診断の答えを友達に予想してもらう遊びです。先に浮気許せる度診断（30問・約3分）に答えてください。" }),
      h("a", { class: "btn btn-primary btn-lg btn-block btn-fit", href: url("line/") }, "浮気許せる度診断をはじめる", icon("arrow")),
      h("a", { class: "btn btn-ghost btn-block", href: url("q/") }, "当てっこについて")));
    return;
  }
  const r = line.result || scoreLine(line.answers);
  const t = r ? typeById(r.typeId) : null;
  const f = nameField("あなたの名前（ニックネーム）", `本名や連絡先は書かないでください。リンクを知っている人に見えます。${NAME_MAX}文字まで。`);
  const btnLabel = () => [h("span", { text: "当てっこを作る" }), icon("arrow")];
  const btn = h("button", { class: "btn btn-primary btn-lg btn-block", type: "submit" }, btnLabel());
  const form = h("form", {
    class: "stack", novalidate: true,
    onsubmit: async (e) => {
      e.preventDefault();
      if (btn.disabled) return;
      const c = checkName(f.input.value);
      if (c.error) { f.showError(c.error); return; }
      btn.disabled = true;
      fill(btn, h("span", { class: "spinner spinner--light", "aria-hidden": "true" }), "作っています");
      try {
        const res = await api.createQuiz({ name: c.name, answers: line.answers });
        const w = WORDS.includes(line.word) ? line.word : "i";
        store.addQuiz({ id: res.id, key: res.key, name: res.name || c.name, at: Date.now(), w });
        track("quiz_create", {});
        setSearch({ id: res.id, w: w !== "i" ? w : "" });
        loadQuiz(res.id, { justCreated: true });
      } catch (err) {
        btn.disabled = false;
        fill(btn, ...btnLabel());
        if (err.code === "bad_name") f.showError(errMsg(err));
        else if (err.code === "ended") fill(app, endedView());
        else toast(errMsg(err), { error: true });
      }
    },
  },
    f.el,
    h("p", { class: "small muted", text: "作ったあとで、いつでも非公開にしたり消したりできます。10月31日をすぎると全部消えます。" }),
    btn);
  fill(app,
    section(
      picture("img/quiz.webp", { alt: "", eager: true }),
      h("span", { class: "eyebrow", text: "当てっこを作る" }),
      h("h1", { class: "h1", text: "わたしの浮気ライン、当てられる？" }),
      h("p", { class: "lead", text: "あなたの浮気許せる度診断の答え（30問）を、友達に予想してもらいます。合った数が点数になり、ランキングになります。" }),
      h("div", { class: "card card--soft card--tight use-answers" },
        h("span", { class: "small muted", text: "使う答え" }),
        h("p", {}, h("b", { text: `${fmtDate(line.at)} の浮気許せる度診断` }), t ? `（${t.name}・許せる度 ${r.score}点）` : ""),
        h("p", { class: "small muted", text: "あとで診断をやり直しても、作った当てっこの答えは変わりません。" })),
      // 結果の共有リンク（?a=）と結果の画像には同じ30問の答えが入っている（CONTRACT §8-4）。見た人には答えが分かる
      h("div", { class: "notice notice--warn quiz-leak-note" }, icon("info"),
        h("p", { text: "結果のリンクや結果の画像（30問の答えの色の点・くわしい画像）を見せた相手には、答えが分かってしまいます。当てっこは、結果より先に送るのがおすすめです。" })),
      form),
    ...myLists());
  f.input.focus({ preventScroll: true });
}

// ─── 読む（作った人か、答える人か） ──────────────────────
async function loadQuiz(id, opts = {}) {
  fill(app, section(loadingView()));
  const mine = store.findQuiz(id);
  let data;
  try {
    data = await api.getQuiz(id, mine ? mine.key : undefined);
  } catch (e) {
    if (e.code === "ended") return fill(app, endedView());
    if (e.status === 404) return notFoundView(id, mine);
    return fill(app, section(
      errorBox(e, { title: "当てっこを読めませんでした", retry: () => loadQuiz(id, opts) }),
      h("a", { class: "btn btn-ghost btn-block", href: url("") }, "トップへ")));
  }
  if (data.owner && mine) {
    store.addQuiz({ id, key: mine.key, name: data.name });
    return ownerView(data, store.findQuiz(id), opts);
  }
  if (mine) store.removeQuiz(id); // 鍵が合わない（まちがった #k= など）
  const att = store.findAttempt(id);
  if (att) return attemptView(data, att, {});
  return visitorView(data);
}

function notFoundView(id, mine) {
  setTitle("見つかりません");
  fill(app, section(
    h("span", { class: "eyebrow", text: "当てっこ" }),
    h("h1", { class: "h1", text: "この当てっこは見られません" }),
    h("p", { class: "lead", text: "非公開になったか、消されたか、URL がまちがっています。" }),
    mine
      ? h("div", { class: "notice" }, icon("info"),
        h("div", { class: "stack stack-sm" },
          h("p", { text: "この端末に、あなたが作った記録が残っています。消した当てっこなら、一覧から外せます。" }),
          h("div", {}, h("button", {
            class: "btn btn-secondary btn-sm", type: "button",
            onclick: () => { store.removeQuiz(id); toast("一覧から外しました"); notFoundView(id, null); },
          }, "一覧から外す"))))
      : null,
    h("a", { class: "btn btn-primary btn-block", href: url("line/") }, "浮気許せる度診断をやる", icon("arrow")),
    h("a", { class: "btn btn-ghost btn-block", href: url("") }, "トップへ")));
}

// ─── ランキング ───────────────────────────────────────────
function rankingEl(data, { owner = false, mineId = null, onHide, onReport } = {}) {
  if (!data.ranking || !data.ranking.length) {
    return h("p", { class: "muted small rank-empty", text: owner ? "まだ誰も答えていません。リンクを送ってみよう。" : "まだ誰も答えていません。1番乗りしよう。" });
  }
  return h("ol", { class: "rank-list" }, data.ranking.map((r) => {
    const me = r.id === mineId;
    let act;
    if (owner) act = h("button", { class: "rank-act", type: "button", "aria-label": `${r.name}の答えを消す`, onclick: () => onHide(r) }, "消す");
    else if (me) act = h("span", { class: "rank-you", text: "あなた" });
    else act = h("button", { class: "rank-act", type: "button", "aria-label": `${r.name}を通報する`, onclick: () => onReport(r) }, "通報");
    return h("li", { class: ["rank-item", me && "is-me"] },
      h("span", { class: "rank-pos", text: String(rankPos(data.ranking, r)) }),
      h("span", { class: "rank-name", text: r.name }),
      h("span", { class: "rank-score" }, String(r.score), h("small", { text: "/30" })),
      act);
  }));
}

async function reportFlow(quizId, attempt) {
  const reason = await modal({
    title: attempt ? `「${attempt.name}」を通報しますか？` : "この当てっこを通報しますか？",
    body: "運営（くぁくぁ）が確認して、必要なら非公開にします。通報したことは相手に知らされません。理由を選んでください。",
    actions: [
      { label: "名前がよくない（悪口・本名・連絡先など）", value: "name", kind: "secondary", wrap: true },
      { label: "そのほか", value: "other", kind: "secondary" },
      { label: "やめる", value: null, kind: "ghost" },
    ],
  });
  if (!reason) return;
  try {
    await api.report({ quizId, ...(attempt ? { attemptId: attempt.id } : {}), reason });
    toast("通報を送りました。ありがとうございます");
  } catch (e) {
    toast(errMsg(e), { error: true });
  }
}

// ─── 答える人の画面 ───────────────────────────────────────
function visitorView(data, { nameError } = {}) {
  setTitle("浮気ラインの当てっこ");
  const w = wordOf(data.id);
  const f = nameField("あなたの名前（ニックネーム）", `本名や連絡先は書かないでください。ランキングに出て、このリンクを知っている人に見えます。${NAME_MAX}文字まで。`);
  const prog = store.getProgress("q." + data.id);
  if (prog && prog.name) f.set(prog.name);
  const top = data.ranking && data.ranking[0];
  const form = h("form", {
    class: "stack", novalidate: true,
    onsubmit: (e) => {
      e.preventDefault();
      const c = checkName(f.input.value);
      if (c.error) { f.showError(c.error); return; }
      startGuess(data, c.name, w);
    },
  },
    f.el,
    h("button", { class: "btn btn-primary btn-lg btn-block", type: "submit" }, icon("target"), prog && prog.a && prog.a.replace(/-/g, "").length ? "予想の続きから" : "予想をはじめる"));
  fill(app,
    section(
      picture("img/quiz.webp", { alt: "", eager: true }),
      h("span", { class: "eyebrow", text: "当てっこ" }),
      h("h1", { class: "h1 quiz-title" }, h("span", { class: "quiz-name", text: data.name }), h("span", { text: "の浮気ライン、当てられる？" })),
      h("p", { class: "lead" }, h("span", { text: data.name }), "が浮気許せる度診断で答えた30問（恋人がこれをしたら、アウト？モヤる？セーフ？）を予想してね。合った数が点数になります。"),
      h("div", { class: "stats-grid", style: "--cols:2" },
        h("div", { class: "stat" }, h("span", { class: "stat-label", text: "答えた人" }), h("span", { class: "stat-val" }, String(data.count || 0), h("small", { text: "人" }))),
        h("div", { class: "stat" }, h("span", { class: "stat-label", text: "いまの1位" }),
          top ? h("span", { class: "stat-val" }, String(top.score), h("small", { text: "/30" })) : h("span", { class: "stat-val stat-val--text", text: "まだ" }))),
      form,
      h("p", { class: "small muted", text: "予想は30問・約3分。答えたあとで、自分の答えを消すこともできます。" })),
    section(
      h("h2", { class: "h3", text: "ランキング" }),
      h("div", { class: "card card--tight" }, rankingEl(data, { onReport: (r) => reportFlow(data.id, r) })),
      h("div", { class: "row between" },
        h("a", { class: "link small", href: url("line/") }, "自分の浮気ラインも診断する"),
        h("button", { class: "btn btn-ghost btn-sm", type: "button", onclick: () => reportFlow(data.id, null) }, icon("flag"), "この当てっこを通報"))));
  if (nameError) f.showError(nameError);
}

function startGuess(data, name, w) {
  const key = "q." + data.id;
  const prog = store.getProgress(key);
  const initial = prog && typeof prog.a === "string" && prog.a.length === N ? [...prog.a].map((c) => (c === "-" ? null : Number(c))) : null;
  if (initial && initial.every((v) => v !== null)) {
    // 30問そろっているのに送れていなかった（電波など）→ そのまま送る
    submitGuess(data, name, initial.join(""), w);
    return;
  }
  const save = (ans, i) => store.saveProgress(key, { name, a: ans.map((v) => (v === null ? "-" : String(v))).join(""), i });
  if (!initial) save(Array(N).fill(null), 0);
  window.scrollTo(0, 0);
  runQuestions(app, {
    mode: "line",
    word: w,
    prompt: h("span", {}, "恋人がこれをしたら、", h("b", { class: "play-who", text: data.name }), "は？"),
    initial,
    start: initial ? Math.max(0, initial.indexOf(null)) : 0,
    onChange: save,
    onExit: (ans) => { save(ans, 0); visitorView(data); window.scrollTo(0, 0); },
    onDone: (guesses) => { save([...guesses].map(Number), 0); submitGuess(data, name, guesses, w); },
  });
}

async function submitGuess(data, name, guesses, w) {
  fill(app, section(loadingView("答え合わせをしています")));
  window.scrollTo(0, 0);
  try {
    const r = await api.answerQuiz(data.id, { name, guesses });
    const att = { quizId: data.id, attemptId: r.attemptId, akey: r.akey, name, score: r.score, at: Date.now(), quizName: data.name, guesses, answers: r.answers, w };
    store.addAttempt(att);
    store.clearProgress("q." + data.id);
    track("quiz_answer", { score: r.score });
    let fresh = data;
    try { fresh = await api.getQuiz(data.id); } catch { /* ランキングは前に読んだもの */ }
    attemptView(fresh, att, { rank: r.rank, count: r.count });
  } catch (e) {
    if (e.code === "ended") return fill(app, endedView());
    if (e.status === 404) return notFoundView(data.id, null);
    if (e.code === "bad_name") return visitorView(data, { nameError: errMsg(e) });
    fill(app, section(
      errorBox(e, { title: "答えを送れませんでした", retry: () => submitGuess(data, name, guesses, w) }),
      h("p", { class: "small muted", text: "予想はこの端末に残っています。あとで開き直しても、もう一度送れます。" })));
  }
}

function scoreComment(score) {
  if (score >= 27) return "ほぼ本人。考え方がそっくりです。";
  if (score >= 21) return "かなり分かってる。さすがです。";
  if (score >= 15) return "半分以上は当たり。ずれた問題を話してみると発見がありそう。";
  if (score >= 10) return "意外とちがうかも。ふたりのラインを答え合わせしてみよう。";
  return "ほぼ別の人。ずれた問題を見ながら話してみよう。";
}

function attemptView(data, att, opts = {}) {
  setTitle("当てっこの結果");
  const w = WORDS.includes(att.w) ? att.w : wordOf(data.id);
  const qs = att.answers && att.guesses ? quizScore(att.answers, att.guesses) : null;
  const score = Number(att.score) || 0;
  const pct = Math.round((100 * score) / N);
  const inRank = (data.ranking || []).find((r) => r.id === att.attemptId);
  const rank = opts.rank || (inRank ? rankPos(data.ranking, inRank) : null);
  const count = opts.count || data.count || 0;
  const line = store.getRecord("line");
  const link = shareLink(data.id, w);
  const shareText = `${data.name}の浮気ライン、${score}/30問当てた。あなたは何問？ ${HASHTAG}`;

  const diffs = qs ? qs.diffs : [];
  const diffList = qs
    ? (diffs.length
      ? h("div", { class: "band-list" }, diffs.map((i) => h("div", { class: "band-row" },
        h("p", { class: "band-q" }, h("span", { class: "band-qn", text: "Q" + (i + 1) }), h("span", { text: applyWord(QUESTIONS[i].text, w) })),
        h("div", { class: "band-meta diff-meta" },
          h("span", { class: "small muted", text: "予想" }),
          h("span", { class: `chip chip--${CH[att.guesses[i]].key} chip-sm`, text: CH[att.guesses[i]].label }),
          icon("arrow"),
          h("span", { class: "small muted", text: "本当は" }),
          h("span", { class: `chip chip--${CH[att.answers[i]].key} chip-sm is-solid`, text: CH[att.answers[i]].label })))))
      : h("p", { class: "lead", text: "全問当たりました。" }))
    : h("p", { class: "small muted", text: "ずれた問題は、答えたすぐあとの画面でだけ見られます。" });

  const delBtn = h("button", {
    class: "btn btn-ghost btn-sm", type: "button",
    onclick: async () => {
      const ok = await modal({
        title: "自分の答えを消しますか？",
        body: "ランキングからも消えます。元に戻せません。",
        actions: [{ label: "消す", value: true, kind: "danger", icon: "trash" }, { label: "やめる", value: null }],
      });
      if (!ok) return;
      try {
        await api.deleteAttempt(att.attemptId, att.akey);
      } catch (e) {
        if (e.status !== 404) { toast(errMsg(e), { error: true }); return; }
      }
      store.removeAttempt(att.attemptId);
      toast("あなたの答えを消しました");
      loadQuiz(data.id);
    },
  }, icon("trash"), "自分の答えを消す");

  fill(app,
    section(
      h("span", { class: "eyebrow", text: "当てっこの結果" }),
      h("div", { class: "card stack attempt-card" },
        h("p", { class: "attempt-of" }, h("span", { class: "quiz-name", text: data.name }), "の浮気ライン"),
        h("p", { class: "bignum" }, h("span", { class: "bignum-val", text: String(score) }), h("span", { class: "bignum-unit", text: "/30問" })),
        h("div", { class: "chips" },
          h("span", { class: "chip chip--ink", text: `正解 ${pct}%` }),
          rank ? h("span", { class: "chip", text: `${count}人中 ${rank}位` }) : null),
        h("p", { class: "lead", text: scoreComment(score) })),
      h("div", { class: "stack stack-sm" },
        h("p", { class: "small muted", text: "結果を送って、友達にもためしてもらう" }),
        shareRow(shareText, link, "quiz_result"))),
    section(
      h("h2", { class: "h2", text: qs ? `ずれた問題（${diffs.length}問）` : "ずれた問題" }),
      diffList),
    section(
      h("h2", { class: "h2", text: "ランキング" }),
      h("div", { class: "card card--tight" }, rankingEl(data, { mineId: att.attemptId, onReport: (r) => reportFlow(data.id, r) })),
      !inRank ? h("p", { class: "small muted", text: "あなたの答えはランキングに出ていません（作った人がランキングから外したか、100位より下です）。答えそのものを消したいときは、下の「自分の答えを消す」から消せます。" }) : null),
    section(
      line
        ? h("a", { class: "btn btn-primary btn-lg btn-block", href: url("q/?make=1") }, icon("people"), "自分の当てっこを作る")
        : h("a", { class: "btn btn-primary btn-block btn-fit", href: url("line/") }, "あなたも診断をやる", icon("arrow")),
      line ? h("a", { class: "btn btn-secondary btn-block", href: url("line/#done") }, "自分の浮気ラインの結果") : null,
      h("div", { class: "row between" },
        delBtn,
        h("button", { class: "btn btn-ghost btn-sm", type: "button", onclick: () => reportFlow(data.id, null) }, icon("flag"), "この当てっこを通報"))));
}

// ─── 作った人の画面 ───────────────────────────────────────
function ownerView(data, mine, { justCreated = false } = {}) {
  setTitle("あなたの当てっこ");
  const id = data.id;
  const w = WORDS.includes(mine.w) ? mine.w : wordOf(id);
  const link = shareLink(id, w);
  const shareText = `${data.name}の浮気ライン、何問当てられる？ ${HASHTAG}`;
  const busy = { v: false };
  const act = async (fn, okMsg) => {
    if (busy.v) return;
    busy.v = true;
    try {
      await fn();
      if (okMsg) toast(okMsg);
    } catch (e) {
      if (e.code === "ended") { fill(app, endedView()); return; }
      if (e.status === 404) { notFoundView(id, store.findQuiz(id)); return; }
      toast(errMsg(e), { error: true });
    } finally {
      busy.v = false;
    }
  };
  const reload = () => loadQuiz(id);

  const togglePrivate = () => act(async () => {
    await api.setQuizPrivate(id, mine.key, !data.private);
    toast(data.private ? "公開にもどしました" : "非公開にしました");
    reload();
  });
  const removeQuiz = async () => {
    const ok = await modal({
      title: "この当てっこを消しますか？",
      body: "答えてくれた人の答えとランキングも、すべて消えます。元に戻せません。",
      actions: [{ label: "消す", value: true, kind: "danger", icon: "trash" }, { label: "やめる", value: null }],
    });
    if (!ok) return;
    act(async () => {
      await api.deleteQuiz(id, mine.key);
      store.removeQuiz(id);
      deletedView();
    });
  };
  const hideOne = async (r) => {
    const ok = await modal({
      title: `「${r.name}」の答えを消しますか？`,
      body: "ランキングから消えます。元に戻せません。",
      actions: [{ label: "消す", value: true, kind: "danger", icon: "trash" }, { label: "やめる", value: null }],
    });
    if (!ok) return;
    act(async () => { await api.hideAttempt(id, r.id, mine.key); toast("ランキングから消しました"); reload(); });
  };

  const status = [
    data.private ? h("span", { class: "chip chip--line" }, icon("eyeOff"), "非公開") : h("span", { class: "chip chip--safe chip--dot" }, "公開中"),
    data.adminHidden ? h("span", { class: "chip chip--out chip--dot" }, "運営が非公開") : null,
    data.createdAt ? h("span", { class: "chip", text: `${fmtDate(data.createdAt)} 作成` }) : null,
  ];

  fill(app,
    justCreated
      ? h("section", { class: "section" },
        h("div", { class: "card card--ink stack stack-sm made-banner" },
          h("span", { class: "eyebrow eyebrow--light", text: "できました" }),
          h("p", { class: "h3 made-title", text: "当てっこができました" }),
          h("p", { class: "made-text", text: "下のリンクを友達に送ってください。答えてもらうと、ここにランキングが出ます。" })))
      : null,
    section(
      h("span", { class: "eyebrow", text: "あなたが作った当てっこ" }),
      h("h1", { class: "h1 quiz-title" }, h("span", { class: "quiz-name", text: data.name }), h("span", { text: "の浮気ライン、当てられる？" })),
      h("div", { class: "chips" }, status),
      data.adminHidden
        ? h("div", { class: "notice notice--warn" }, icon("warn"), h("p", { text: "運営が非公開にしました。友達はこの当てっこを開けません。心当たりがないときは X @9qu1 まで。" }))
        : data.private
          ? h("div", { class: "notice notice--warn" }, icon("eyeOff"), h("p", { text: "いまは非公開です。友達がリンクを開いても見られません。" }))
          : null),
    section(
      h("h2", { class: "h3", text: "友達に送るリンク" }),
      h("div", { class: "card card--tight stack stack-sm share-card" },
        linkBox(link),
        shareRow(shareText, link, "quiz_owner"))),
    section(
      h("div", { class: "row between" },
        h("h2", { class: "h3", text: "ランキング" }),
        h("span", { class: "small muted" }, "答えた人 ", h("b", { class: "num", text: String(data.count || 0) }), "人")),
      h("div", { class: "card card--tight" }, rankingEl(data, { owner: true, onHide: hideOne })),
      h("div", { class: "center" }, h("button", { class: "btn btn-ghost btn-sm", type: "button", onclick: reload }, icon("retry"), "新しくする"))),
    section(
      h("h2", { class: "h3" }, icon("lock"), "自分用のリンク"),
      h("p", { class: "small muted", text: "このリンクを開くと、ほかの端末からでもこの画面（ランキング・非公開・削除）が使えます。人には送らないでください。" }),
      h("button", {
        class: "btn btn-secondary btn-block", type: "button",
        onclick: async () => {
          const ok = await copyText(link + "#k=" + mine.key);
          toast(ok ? "自分用のリンクをコピーしました。人に送らないでください" : "コピーできませんでした", { error: !ok });
        },
      }, icon("copy"), "自分用のリンクをコピー")),
    section(
      h("h2", { class: "h3", text: "公開と削除" }),
      h("div", { class: "stack stack-sm" },
        h("button", { class: "btn btn-secondary btn-block", type: "button", onclick: togglePrivate },
          data.private ? icon("eye") : icon("eyeOff"), data.private ? "公開にもどす" : "非公開にする"),
        h("p", { class: "small muted", text: "非公開のあいだは、友達がリンクを開いても見られません。いつでも戻せます。" }),
        h("button", { class: "btn btn-ghost btn-block btn-danger-text", type: "button", onclick: removeQuiz }, icon("trash"), "当てっこを消す"),
        h("p", { class: "small muted", text: "答えてくれた人の答えも、すべて消えます。元に戻せません。" }))),
    section(
      h("a", { class: "btn btn-ghost btn-block", href: url("") }, "トップへ")));
}

function deletedView() {
  setTitle("消しました");
  fill(app, section(
    h("span", { class: "eyebrow", text: "当てっこ" }),
    h("h1", { class: "h1", text: "当てっこを消しました" }),
    h("p", { class: "lead", text: "答えてくれた人の答えとランキングも、すべて消しました。" }),
    h("a", { class: "btn btn-primary btn-block", href: url("q/?make=1") }, "新しく作る"),
    h("a", { class: "btn btn-ghost btn-block", href: url("") }, "トップへ")));
  window.scrollTo(0, 0);
}
