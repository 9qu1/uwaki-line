// 管理（admin/・noindex・どこからもリンクしない）。くぁくぁだけが使う
//   運営の鍵（API の ADMIN_TOKEN）を入れる（このタブの sessionStorage の ul.admin.token に覚える・タブを閉じたら忘れる・画面には出さない）
//     9qu1.com はほかのページと同じ住所（origin）なので、ずっと残る localStorage には置かない
//   → 当てっこの一覧（通報ありだけ／全部）→ 非公開にする・戻す／通報のある答えを隠す・戻す／全部消す（画面で「ぜんぶけす」と打つ。API には DELETE-ALL を送る）
import { isEnded } from "./config.js";
import { adminList, adminHide, adminPurge } from "./api.js";
import { h, icon, url, renderHeader, toast, modal, errorBox, errMsg, loadingView, fmtDate, fill } from "./ui.js";

const TOKEN_KEY = "ul.admin.token";
const CONFIRM_WORD = "ぜんぶけす"; // 全部消す前に打つ言葉（画面だけ。API へは api.js が confirm: "DELETE-ALL" を送る）
let app;

// 鍵はこのタブの中だけに覚える（sessionStorage。読めない端末では覚えずに毎回入れる）
function readToken() {
  try { return sessionStorage.getItem(TOKEN_KEY) || ""; } catch { return ""; }
}
function writeToken(t) {
  try { sessionStorage.setItem(TOKEN_KEY, t); } catch { /* 覚えられなくても、このページの中では使える */ }
}
function forgetToken() {
  try { sessionStorage.removeItem(TOKEN_KEY); } catch { /* そのまま */ }
  try { localStorage.removeItem(TOKEN_KEY); } catch { /* 前の版で localStorage に残した鍵も消す */ }
}
let reportedOnly = true;

main();

function main() {
  renderHeader();
  app = document.getElementById("app");
  if (isEnded()) {
    fill(app, h("section", { class: "section stack" },
      h("h1", { class: "h1", text: "管理" }),
      h("p", { class: "lead", text: "締め切りのあとです。もう受付は止まっていて、データは消えています。" })));
    return;
  }
  try { localStorage.removeItem(TOKEN_KEY); } catch { /* 前の版で localStorage に残した鍵は消す */ }
  const token = readToken();
  if (token) showList(token);
  else showLogin();
}

function showLogin(msg) {
  const input = h("input", { class: "input", id: "ul-admin-token", type: "password", autocomplete: "off", spellcheck: "false", placeholder: "運営の鍵" });
  const err = h("span", { class: "field-error", hidden: !msg, text: msg || "" });
  fill(app, h("section", { class: "section stack" },
    h("span", { class: "eyebrow", text: "運営だけ" }),
    h("h1", { class: "h1", text: "管理" }),
    h("p", { class: "small muted", text: "運営の鍵（公開のときに作って、パソコンの uwaki-line-admin-token.txt に保存した鍵）を入れてください。このタブを閉じるまで覚えます。" }),
    h("form", {
      class: "stack stack-sm", novalidate: true,
      onsubmit: (e) => {
        e.preventDefault();
        const t = input.value.trim();
        if (!t) { err.textContent = "鍵を入れてください。"; err.hidden = false; return; }
        // 鍵は英数字と記号だけ（日本語などはヘッダーに入れられず、送る前に失敗するため）
        if (!/^[!-~]+$/.test(t)) { err.textContent = "鍵が合いません（英数字と記号だけです）。"; err.hidden = false; return; }
        writeToken(t);
        showList(t);
      },
    },
      h("div", { class: "field" }, h("label", { class: "field-label", for: "ul-admin-token", text: "運営の鍵" }), input, err),
      h("button", { class: "btn btn-primary btn-block", type: "submit" }, icon("lock"), "入る"))));
  input.focus();
}

async function showList(token) {
  fill(app, h("section", { class: "section" }, loadingView()));
  let data;
  try {
    data = await adminList(token, { reported: reportedOnly, limit: 500 });
  } catch (e) {
    if (e.status === 403 && e.code === "forbidden") {
      forgetToken();
      showLogin("鍵が合いません。");
      return;
    }
    fill(app, h("section", { class: "section stack" },
      h("h1", { class: "h1", text: "管理" }),
      errorBox(e, { title: "一覧を読めませんでした", retry: () => showList(token) }),
      h("button", { class: "btn btn-ghost btn-sm", type: "button", onclick: () => { forgetToken(); showLogin(); } }, "鍵を入れ直す")));
    return;
  }
  render(token, data);
}

function render(token, data) {
  const t = data.totals || {};
  const tabs = h("div", { class: "seg", role: "group", "aria-label": "表示" },
    h("button", { class: "seg-btn", type: "button", "aria-pressed": String(reportedOnly), onclick: () => { reportedOnly = true; showList(token); } }, "通報ありだけ"),
    h("button", { class: "seg-btn", type: "button", "aria-pressed": String(!reportedOnly), onclick: () => { reportedOnly = false; showList(token); } }, "全部"));

  const hideQuiz = async (q, hidden) => {
    try {
      await adminHide(token, { quizId: q.id, hidden });
      toast(hidden ? "非公開にしました" : "戻しました");
      showList(token);
    } catch (e) { toast(errMsg(e), { error: true }); }
  };
  const hideAttempt = async (a, hidden) => {
    try {
      await adminHide(token, { attemptId: a.id, hidden });
      toast(hidden ? "答えを隠しました" : "答えを戻しました");
      showList(token);
    } catch (e) { toast(errMsg(e), { error: true }); }
  };

  const quizRows = (data.quizzes || []).map((q) => h("li", { class: "admin-item" },
    h("div", { class: "admin-item-main" },
      h("p", { class: "admin-name", text: q.name }),
      h("p", { class: "small muted" },
        h("span", { class: "num", text: q.id }), ` ・ ${fmtDate(q.createdAt)} ・ 答え ${q.count} ・ 通報 ${q.reports}（答えへの通報 ${q.attemptReports}）`),
      h("div", { class: "chips" },
        q.adminHidden ? h("span", { class: "chip chip--out chip-sm", text: "運営が非公開" }) : null,
        q.private ? h("span", { class: "chip chip--line chip-sm", text: "作った人が非公開" }) : null,
        !q.adminHidden && !q.private ? h("span", { class: "chip chip--safe chip-sm", text: "公開中" }) : null)),
    h("div", { class: "admin-acts" },
      q.adminHidden
        ? h("button", { class: "btn btn-secondary btn-sm", type: "button", onclick: () => hideQuiz(q, false) }, icon("eye"), "戻す")
        : h("button", { class: "btn btn-primary btn-sm", type: "button", onclick: () => hideQuiz(q, true) }, icon("eyeOff"), "非公開"),
      !q.adminHidden && !q.private ? h("a", { class: "btn btn-ghost btn-sm", href: url(`q/?id=${q.id}`), target: "_blank", rel: "noopener" }, "開く") : null)));

  const attRows = (data.attempts || []).map((a) => h("li", { class: "admin-item" },
    h("div", { class: "admin-item-main" },
      h("p", { class: "admin-name", text: a.name }),
      h("p", { class: "small muted" },
        "当てっこ ", h("span", { class: "num", text: a.quizId }), ` ・ ${a.score}/30 ・ ${fmtDate(a.createdAt)} ・ 通報 ${a.reports}`),
      a.hidden ? h("span", { class: "chip chip--line chip-sm", text: a.hiddenBy === "admin" ? "運営が隠した" : "作った人が消した" }) : null),
    h("div", { class: "admin-acts" },
      a.hidden
        ? (a.hiddenBy === "admin" ? h("button", { class: "btn btn-secondary btn-sm", type: "button", onclick: () => hideAttempt(a, false) }, "戻す") : null)
        : h("button", { class: "btn btn-primary btn-sm", type: "button", onclick: () => hideAttempt(a, true) }, icon("eyeOff"), "隠す"))));

  const confirmInput = h("input", { class: "input", id: "ul-admin-confirm", type: "text", autocomplete: "off", spellcheck: "false", placeholder: CONFIRM_WORD, "aria-label": `確かめのため「${CONFIRM_WORD}」と打つ` });
  const purgeBtn = h("button", { class: "btn btn-primary btn-danger btn-block", type: "button", disabled: true }, icon("trash"), "全部消す");
  confirmInput.addEventListener("input", () => { purgeBtn.disabled = confirmInput.value.trim() !== CONFIRM_WORD; });
  purgeBtn.addEventListener("click", async () => {
    if (confirmInput.value.trim() !== CONFIRM_WORD) return;
    const ok = await modal({
      title: "本当に全部消しますか？",
      body: "当てっこ・答え・統計のすべての行を消します。元に戻せません。",
      actions: [{ label: "全部消す", value: true, kind: "danger" }, { label: "やめる", value: null }],
    });
    if (!ok) return;
    try {
      await adminPurge(token);
      toast("全部消しました");
      showList(token);
    } catch (e) { toast(errMsg(e), { error: true }); }
  });

  fill(app,
    h("section", { class: "section stack" },
      h("div", { class: "row between" },
        h("h1", { class: "h1", text: "管理" }),
        h("button", { class: "btn btn-ghost btn-sm", type: "button", onclick: () => { forgetToken(); showLogin(); } }, "鍵を忘れる")),
      h("div", { class: "stats-grid", style: "--cols:2" },
        stat("当てっこ", t.quizzes), stat("答え", t.attempts), stat("浮気ライン", t.line), stat("本音ライン", t.feel)),
      tabs,
      h("button", { class: "btn btn-ghost btn-sm", type: "button", onclick: () => showList(token) }, icon("retry"), "読み直す")),
    h("section", { class: "section stack" },
      h("h2", { class: "h2", text: reportedOnly ? "通報のある当てっこ" : "当てっこ（新しい順）" }),
      quizRows.length ? h("ul", { class: "admin-list" }, quizRows) : h("p", { class: "muted", text: "ありません。" })),
    h("section", { class: "section stack" },
      h("h2", { class: "h2", text: "通報のある答え" }),
      attRows.length ? h("ul", { class: "admin-list" }, attRows) : h("p", { class: "muted", text: "ありません。" })),
    h("section", { class: "section stack" },
      h("h2", { class: "h2", text: "全部消す" }),
      h("p", { class: "small muted", text: `ふだんは使わない。11月1日の 0:00 に自動で全部消える。確かめのため「${CONFIRM_WORD}」と打ってから押す。` }),
      confirmInput,
      purgeBtn));
}

function stat(label, v) {
  return h("div", { class: "stat" }, h("span", { class: "stat-label", text: label }), h("span", { class: "stat-val", text: String(v || 0) }));
}
