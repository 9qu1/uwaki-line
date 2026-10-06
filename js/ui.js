// 画面の小物（どのページでも使う）。見た目の部品は css/base.css（docs/design.md）、ページだけのものは css/pages.css
//
// ──── 使い方の一覧（結果担当も使う） ────────────────────────────────
//   ROOT                          サイトの一番上の住所（例 https://9qu1.com/uwaki-line/）。どの深さのページでも同じ
//   url(path)                     ROOT からの住所（例 url("q/?make=1")）
//   h(tag, props, ...children)    要素を作る。props: class（文字か配列）・text・html（決まった文字だけ）・style（文字か {"--v": 3}）
//                                   dataset・onclick など on〜（関数）・aria-*（false も "false" で入る）・hidden/disabled/value/checked はそのまま
//                                   children: 文字・数・要素・配列（null/false は飛ばす）。人が入れた文字は必ず text か children の文字で入れる
//   fill(el, ...children)         el の中身を入れかえる（null・false は飛ばす。replaceChildren は null を「null」の字にするので使わない）
//   icon(name)                    SVG のアイコン（docs/design.md §7）。name: arrow back stats clock warn info save share link copy
//                                   external lock eye eyeOff trash flag retry people target check x line
//   brandMark()                   ロゴの印（SVG）
//   picture(path, { alt, ratio, cls, eager })   img/ の下の絵を角丸の枠に（読めなければ枠ごと隠す）
//   renderHeader({ current, sticky })   ヘッダーを body の先頭に入れる（current: "stats" など。sticky: 上に残す）
//   renderFooter()                フッターを body の最後に入れる（作者 くぁくぁ・X @9qu1・このサイトについて）
//   toast(msg, { error })         画面の下に短く出す
//   modal({ title, body, actions })     確かめの窓。actions: [{ label, value, kind: "primary"|"danger"|"secondary"|"ghost", wrap }]
//                                   押したボタンの value（閉じたら null）で解決する Promise を返す
//   track(event, params)          アクセス解析（本番の 9qu1.com のときだけ GA4。手元は console.debug）
//   endedView()                   締め切りのあとの表示（要素を返す）
//   limitedBadge()                「10月31日まで あと◯日」の札（要素を返す）
//   errorBox(err, { retry })      失敗の表示（日本語の説明と「もう一度」）
//   errMsg(err)                   失敗の日本語の説明
//   loadingView(label)            読み込み中の表示
//   copyText(text)                クリップボードに写す（true / false で解決）
//   xShareUrl(text, link) / lineShareUrl(text, link)   X・LINE の共有画面の住所
//   fmtDate(ms)                   「10/6 14:05」
// ────────────────────────────────────────────────────────────────
import { SITE_NAME, SITE_SUB, END_LABEL, AUTHOR, AUTHOR_X, GA_ID, IS_PROD, isEnded, daysLeft } from "./config.js";

export const ROOT = new URL("../", import.meta.url).href;
export const url = (path = "") => ROOT + String(path).replace(/^\/+/, "");

// ---- 要素を作る ----
const PROPS = new Set(["value", "checked", "disabled", "hidden", "selected", "readOnly", "tabIndex"]);

function append(el, kids) {
  for (const k of kids) {
    if (k == null || k === false || k === true) continue;
    if (Array.isArray(k)) append(el, k);
    else if (k instanceof Node) el.append(k);
    else el.append(document.createTextNode(String(k)));
  }
}

/** el の中身を入れかえる（null・false・配列はそのまま扱える。replaceChildren は null を「null」の字にするので使わない） */
export function fill(el, ...children) {
  el.replaceChildren();
  append(el, children);
  return el;
}

export function h(tag, props, ...children) {
  const el = document.createElement(tag);
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (k.startsWith("aria-")) {
        if (v != null) el.setAttribute(k, String(v));
        continue;
      }
      if (v == null || v === false) continue;
      if (k === "class") el.className = Array.isArray(v) ? v.filter(Boolean).join(" ") : String(v);
      else if (k === "text") el.textContent = String(v);
      else if (k === "html") el.innerHTML = v; // 決まった文字（SVG など）だけ。人が入れた文字は入れない
      else if (k === "style") {
        if (typeof v === "string") el.style.cssText = v;
        else for (const [sk, sv] of Object.entries(v)) {
          if (sk.startsWith("--")) el.style.setProperty(sk, String(sv));
          else el.style[sk] = sv;
        }
      } else if (k === "dataset") Object.assign(el.dataset, v);
      else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (PROPS.has(k)) el[k] = v;
      else el.setAttribute(k, v === true ? "" : String(v));
    }
  }
  append(el, children);
  return el;
}

/** 絵（img/ の下）を角丸の枠に入れる。読めなかったら枠ごと隠す */
export function picture(path, { alt = "", ratio = "16 / 9", cls = "", eager = false } = {}) {
  const img = h("img", { src: url(path), alt, width: "960", height: "640", decoding: "async", loading: eager ? null : "lazy" });
  const box = h("div", { class: ["pic", cls], style: { "--ratio": ratio } }, img);
  img.addEventListener("error", () => { box.hidden = true; });
  return box;
}

// ---- アイコン（24×24・線の太さ 2・色は文字の色） ----
const ICONS = {
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  back: '<path d="M19 12H5M11 18l-6-6 6-6"/>',
  stats: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  warn: '<path d="M12 3l9 16H3z"/><path d="M12 10v4M12 17v.5"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>',
  save: '<path d="M12 3v12M7 10l5 5 5-5M4 21h16"/>',
  share: '<path d="M12 15V3M7 8l5-5 5 5"/><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/>',
  link: '<path d="M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1 1"/><path d="M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1-1"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2.5"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
  external: '<path d="M14 4h6v6M20 4l-9 9"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2.5"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  eyeOff: '<path d="M3 3l18 18"/><path d="M10.6 5.1A10.8 10.8 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3.2 4.1M6.6 6.6C3.9 8.3 2 12 2 12s3.6 7 10 7a10 10 0 0 0 5.4-1.6"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/>',
  flag: '<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>',
  retry: '<path d="M20 11a8 8 0 1 0-2.3 5.7M20 5v6h-6"/>',
  people: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18.5 14.2A6.5 6.5 0 0 1 21.5 20"/>',
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.2"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
};
// 塗りのアイコン（X の印・LINE の吹き出し）
const FILLED = {
  x: '<path d="M18.9 1.15h3.68l-8.04 9.19L24 22.85h-7.4l-5.8-7.58-6.64 7.58H.47l8.6-9.83L0 1.15h7.6l5.24 6.93 6.06-6.93zm-1.29 19.5h2.04L6.49 3.24H4.3l13.31 17.41z"/>',
  line: '<path d="M12 3.2c-5.3 0-9.6 3.47-9.6 7.75 0 3.84 3.4 7.05 8 7.66.31.07.74.2.85.47.1.24.06.62.03.87l-.14.82c-.04.24-.19.95.83.52 1.02-.43 5.5-3.24 7.5-5.55 1.39-1.52 2.06-3.06 2.06-4.79 0-4.28-4.3-7.75-9.53-7.75z"/>',
};

function svgFrom(str) {
  const t = document.createElement("template");
  t.innerHTML = str;
  return t.content.firstElementChild;
}
export function icon(name) {
  if (FILLED[name]) return svgFrom(`<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">${FILLED[name]}</svg>`);
  return svgFrom(`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ICONS.info}</svg>`);
}
export function brandMark() {
  return svgFrom('<svg class="brand-mark" viewBox="0 0 64 64" aria-hidden="true"><rect width="64" height="64" rx="16" fill="#1A1826"/><rect x="9" y="28.5" width="14" height="7" rx="3.5" fill="#E5484D"/><rect x="25" y="28.5" width="14" height="7" rx="3.5" fill="#F2A516"/><rect x="41" y="28.5" width="14" height="7" rx="3.5" fill="#22A06B"/><rect x="34.5" y="15" width="9" height="34" rx="4.5" fill="#FFFFFF" stroke="#1A1826" stroke-width="3.5"/></svg>');
}

// ---- ヘッダー・フッター ----
export function renderHeader({ current = "", sticky = false } = {}) {
  document.querySelectorAll("body > header.site-header").forEach((e) => e.remove());
  const header = h("header", { class: ["site-header", sticky && "site-header--sticky"] },
    h("a", { class: "brand", href: ROOT, "aria-label": `${SITE_NAME}のトップへ` },
      brandMark(),
      h("span", { class: "brand-text" },
        h("span", { class: "brand-name", text: SITE_NAME }),
        SITE_SUB ? h("span", { class: "brand-sub", text: SITE_SUB }) : null)),
    h("nav", { class: "header-nav", "aria-label": "サイト内" },
      h("a", { class: "header-link", href: url("stats/"), "aria-current": current === "stats" ? "page" : null }, icon("stats"), "統計")));
  document.body.prepend(header);
  return header;
}

export function renderFooter() {
  document.querySelectorAll("body > footer.site-footer").forEach((e) => e.remove());
  const ended = isEnded();
  const footer = h("footer", { class: "site-footer" },
    h("div", { class: "footer-brand" }, brandMark(), SITE_NAME, SITE_SUB ? h("span", { class: "footer-sub", text: SITE_SUB }) : null),
    h("ul", { class: "footer-links" },
      h("li", {}, h("a", { href: url("line/") }, "浮気許せる度診断")),
      h("li", {}, h("a", { href: url("feel/") }, "本音ライン診断")),
      h("li", {}, h("a", { href: url("q/") }, "当てっこ")),
      h("li", {}, h("a", { href: url("stats/") }, "みんなの統計")),
      h("li", {}, h("a", { href: url("about/") }, "このサイトについて"))),
    h("p", { class: "footer-note" }, ended
      ? `公開は${END_LABEL}で終わりました。データはすべて消しました。`
      : `${END_LABEL}までの期間限定公開。11月1日にデータをすべて消します。広告は出していません。`),
    h("p", { class: "footer-note" }, `作者 ${AUTHOR}（`, h("a", { href: AUTHOR_X, target: "_blank", rel: "noopener" }, "X @9qu1"), "）"));
  document.body.append(footer);
  return footer;
}

// ---- トースト ----
let toastTimer;
export function toast(msg, { error = false } = {}) {
  let el = document.querySelector("body > .toast");
  if (!el) {
    el = h("div", { class: "toast", role: "status", "aria-live": "polite" });
    document.body.append(el);
  }
  el.textContent = msg;
  el.classList.toggle("toast--error", error);
  el.classList.remove("is-show");
  void el.offsetWidth;
  el.classList.add("is-show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("is-show"), error ? 3600 : 2400);
}

// ---- 確かめの窓 ----
let modalSeq = 0;
export function modal({ title, body, actions = [{ label: "閉じる", value: null, kind: "ghost" }] }) {
  return new Promise((resolve) => {
    const id = "ul-modal-" + ++modalSeq;
    const prev = document.activeElement;
    let done = false;
    const close = (v) => {
      if (done) return;
      done = true;
      root.remove();
      if (!document.querySelector("body > .modal")) document.body.classList.remove("is-locked");
      document.removeEventListener("keydown", onKey, true);
      try { if (prev && prev.focus) prev.focus({ preventScroll: true }); } catch { /* そのまま */ }
      resolve(v);
    };
    const onKey = (e) => {
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); close(null); }
    };
    const KIND = { primary: "btn-primary", danger: "btn-primary btn-danger", secondary: "btn-secondary", ghost: "btn-ghost" };
    const btns = actions.map((a) => h("button", {
      class: ["btn", "btn-block", KIND[a.kind || "ghost"] || "btn-ghost", a.wrap && "btn-wrap"],
      type: "button",
      onclick: () => close(a.value === undefined ? null : a.value),
    }, a.icon ? icon(a.icon) : null, a.label));
    const root = h("div", {
      class: "modal", role: "dialog", "aria-modal": "true", "aria-labelledby": id + "-t",
      onclick: (e) => { if (e.target === root) close(null); },
    },
      h("div", { class: "modal-panel" },
        h("button", { class: "modal-close", type: "button", "aria-label": "閉じる", onclick: () => close(null) }),
        h("p", { class: "modal-title", id: id + "-t", text: title }),
        body ? h("div", { class: "modal-body" }, body) : null,
        h("div", { class: "modal-actions" }, btns)));
    document.body.append(root);
    document.body.classList.add("is-locked");
    document.addEventListener("keydown", onKey, true);
    (btns[0] || root).focus({ preventScroll: true });
  });
}

// ---- アクセス解析（本番の 9qu1.com のときだけ GA4） ----
//   名前や答えの中身は送らない（このサイトについて に書いた約束）:
//   - ページの住所は ?・# の前だけ（友達に見せるページの ?a= には30問の答え、?s= は点数が入るため）
//   - ページの題は、開いたときの決まった題（当てっこの画面はあとで題に名前を入れることがあるため）
//   gtag の set は、このあと送る出来事（自動で送るものも）すべてに効く
let gaStarted = false;
const GA_PAGE = typeof location !== "undefined"
  ? { page_location: location.origin + location.pathname, page_title: typeof document !== "undefined" ? document.title : "" }
  : {};
function startGa() {
  if (gaStarted || !IS_PROD || !GA_ID) return;
  if (location.pathname.includes("/admin/")) return; // 管理の画面は数えない
  gaStarted = true;
  window.dataLayer = window.dataLayer || [];
  window.gtag = function gtag() { window.dataLayer.push(arguments); };
  window.gtag("js", new Date());
  window.gtag("set", GA_PAGE);
  window.gtag("config", GA_ID, GA_PAGE);
  const s = document.createElement("script");
  s.async = true;
  s.src = "https://www.googletagmanager.com/gtag/js?id=" + encodeURIComponent(GA_ID);
  document.head.append(s);
}
startGa();

export function track(event, params = {}) {
  if (IS_PROD) {
    startGa();
    try { if (window.gtag) window.gtag("event", event, { ...params, ...GA_PAGE }); } catch { /* 解析が止まっていても画面は続ける */ }
  } else {
    console.debug("[track]", event, params);
  }
}

// ---- 期間限定 ----
export function limitedBadge() {
  if (isEnded()) return h("span", { class: "badge-limited badge-limited--ended" }, "公開は終わりました");
  const d = daysLeft();
  if (d <= 1) return h("span", { class: "badge-limited" }, `${END_LABEL}まで `, h("b", { class: "badge-today", text: "今日" }), "が最後");
  return h("span", { class: "badge-limited" }, `${END_LABEL}まで あと`, h("b", { text: String(d) }), "日");
}

export function endedView() {
  return h("section", { class: "section ended" },
    h("div", { class: "card ended-card stack" },
      h("span", { class: "ended-icon" }, icon("clock")),
      h("span", { class: "eyebrow" }, "期間限定の公開"),
      h("h1", { class: "h2" }, "公開は", h("span", { class: "nowrap", text: END_LABEL }), "で", h("span", { class: "nowrap", text: "終わりました" })),
      h("p", { class: "lead" }, "遊んでくれて、ありがとうございました。診断の答え・当てっこ・みんなの統計のデータは、11月1日にすべて消しました。"),
      h("div", { class: "stack stack-sm" },
        h("a", { class: "btn btn-secondary btn-block", href: ROOT }, "トップへ"),
        h("a", { class: "btn btn-ghost btn-block", href: url("about/") }, "このサイトについて"))));
}

// ---- 失敗・読み込み中 ----
export function errMsg(err) {
  if (err && typeof err.message === "string" && /[ぁ-んァ-ヶ一-龠]/.test(err.message)) return err.message;
  return "うまくいきませんでした。時間をおいて、もう一度ためしてください。";
}

export function errorBox(err, { retry, title } = {}) {
  return h("div", { class: "notice notice--warn error-box", role: "alert" },
    icon("warn"),
    h("div", { class: "stack stack-sm" },
      title ? h("p", {}, h("b", { text: title })) : null,
      h("p", { text: errMsg(err) }),
      retry ? h("div", {}, h("button", { class: "btn btn-secondary btn-sm", type: "button", onclick: retry }, icon("retry"), "もう一度")) : null));
}

export function loadingView(label = "読み込んでいます") {
  return h("div", { class: "loading", role: "status" },
    h("span", { class: "spinner", "aria-hidden": "true" }),
    h("span", { class: "muted small", text: label }));
}

// ---- 共有・コピー ----
export async function copyText(text) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch { /* 下の方法で */ }
  try {
    const ta = h("textarea", { style: "position:fixed;top:-1000px;left:0;opacity:0", readonly: true, "aria-hidden": "true" });
    ta.value = text;
    document.body.append(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  } catch {
    return false;
  }
}
export function xShareUrl(text, link) {
  return "https://x.com/intent/post?text=" + encodeURIComponent(text) + "&url=" + encodeURIComponent(link);
}
export function lineShareUrl(text, link) {
  return "https://line.me/R/share?text=" + encodeURIComponent(text + "\n" + link);
}

export function fmtDate(ms) {
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return "";
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getMonth() + 1}/${d.getDate()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
