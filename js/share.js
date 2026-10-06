// 共有（画像の保存・X・LINE・Instagram・リンクのコピー）と、結果まわりで使う小物（結果担当）
//
//   ROOT_URL                       サイトの根っこ（本番は https://9qu1.com/uwaki-line/）。どの階層のページからでも同じ
//   track(ev, params)              押した数（ui.js の track。まだ無い・読めないときは何もしない）
//   readSaved(kind)                端末に残した最後の結果（CONTRACT §6 の ul.line / ul.feel）
//   fetchStats()                   みんなの統計（api.js の getStats。無いときは API を直接）
//   lineShareUrl / feelShareUrl    友達に見せるページ（r/<id>/・f/<id>/）の URL
//   shareText(model)               X などに出す文（絵文字なし・ハッシュタグは1つ）
//   shareX / shareLine / copyLink / shareNative / saveImage / shareInstagram
//   toast(msg)                     下に出る短いお知らせ（ui.js に toast があればそちら）
//
// 文はすべて日本語。絵文字は使わない。
import { SITE_NAME, SITE_SUB, API_BASE } from "./config.js";
import { isAnswers } from "./engine.js";
import { CATEGORIES } from "./data/questions.js";

export const ROOT_URL = new URL("../", import.meta.url).href;
export const SHORT_URL = "9qu1.com/uwaki-line";
export const HASHTAG = { line: "浮気許せる度診断", feel: "本音ライン診断" };
/** 自分の許せる度とみんなの平均がこの点数以内なら、平均の三角（自分の印に隠れる）の代わりに「ほぼ同じ」と書く（結果画面と共有画像で同じ） */
export const AVG_NEAR = 5;

/** 結果まわりの見た目（css/result.css）。ページに <link> が無いときだけ足す（作者のほかのサイトをどのページに置いても崩れないように） */
export function ensureResultCss() {
  if (typeof document === "undefined") return;
  const has = [...document.querySelectorAll('link[rel="stylesheet"]')].some((l) => /\/css\/result\.css(\?|$)/.test(l.href));
  if (has) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = new URL("../css/result.css", import.meta.url).href;
  document.head.append(link);
}

// ---------- ui.js（画面担当）とのつなぎ ----------
let uiP = null;
function ui() {
  if (!uiP) uiP = import("./ui.js").catch(() => null);
  return uiP;
}

/** 押した数を数える（GA4 は ui.js が本番のときだけ送る） */
export async function track(ev, params) {
  try {
    const m = await ui();
    if (m && typeof m.track === "function") m.track(ev, params || {});
  } catch { /* 数えられなくても画面は止めない */ }
}

let toastTimer = 0;
/** 下に出る短いお知らせ（ui.js の toast があればそれを使う） */
export async function toast(msg, opts = {}) {
  try {
    const m = await ui();
    if (m && typeof m.toast === "function") { m.toast(msg, opts); return; }
  } catch { /* 自前で出す */ }
  let el = document.querySelector(".toast");
  if (!el) {
    el = document.createElement("div");
    el.className = "toast";
    el.setAttribute("role", "status");
    el.setAttribute("aria-live", "polite");
    document.body.append(el);
  }
  el.textContent = msg;
  el.classList.toggle("toast--error", !!opts.error);
  el.classList.add("is-show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("is-show"), 2600);
}

// ---------- 端末に残したもの（CONTRACT §6） ----------
/** 最後の浮気ライン／本音ライン（{ answers, attrs, word, at, result }）。無い・壊れているときは null */
export function readSaved(kind) {
  try {
    const v = JSON.parse(localStorage.getItem("ul." + kind) || "null");
    return v && isAnswers(v.answers) ? v : null;
  } catch {
    return null;
  }
}

// ---------- みんなの統計 ----------
let statsP = null;
const statsOk = (s) => !!(s && s.n && s.q);
/** GET /api/stats の中身（読めないとき・締め切りのあとは null）。1ページで1回だけ読む */
export function fetchStats() {
  if (!statsP) {
    statsP = (async () => {
      let m = null;
      try { m = await import("./api.js"); } catch { m = null; }
      if (m && typeof m.getStats === "function") {
        try {
          const s = await m.getStats();
          return statsOk(s) ? s : null;
        } catch {
          return null; // 届かない・締め切りのあと
        }
      }
      // api.js が無いときは直接読む
      try {
        const r = await fetch(API_BASE + "/api/stats", { headers: { accept: "application/json" } });
        if (!r.ok) return null;
        const s = await r.json();
        return statsOk(s) ? s : null;
      } catch {
        return null;
      }
    })();
  }
  return statsP;
}

// ---------- 友達に見せるページの URL ----------
/**
 * 浮気ライン: r/<タイプid>/?s=許せる度&g=モヤる率&c=カテゴリ5つ&p=上位%&w=呼び方&a=答え30文字
 *   p は許せる度の高い（ゆるい）ほうから数えた上位%（1〜100）。見せるときは rankView で「ゆるさ／きびしさ 上位◯%」にする
 * @param {{typeId:string, score:number, gray:number, cats:Object}} res scoreLine の結果
 */
export function lineShareUrl(res, { word, top, answers } = {}) {
  const q = [`s=${res.score}`, `g=${res.gray}`, `c=${CATEGORIES.map((c) => res.cats[c.id]).join(",")}`];
  if (top != null) q.push(`p=${top}`);
  if (word) q.push(`w=${encodeURIComponent(word)}`);
  if (isAnswers(answers)) q.push(`a=${answers}`);
  return `${ROOT_URL}r/${res.typeId}/?${q.join("&")}`;
}

/** 本音ライン: f/<タイプid>/?s=special&o=open&n=本気サインの数&w=呼び方&a=答え30文字 */
export function feelShareUrl(res, { word, answers } = {}) {
  const n = Array.isArray(res.signals) ? res.signals.length : res.n;
  const q = [`s=${res.special}`, `o=${res.open}`, `n=${n}`];
  if (word) q.push(`w=${encodeURIComponent(word)}`);
  if (isAnswers(answers)) q.push(`a=${answers}`);
  return `${ROOT_URL}f/${res.typeId}/?${q.join("&")}`;
}

/**
 * タイプの名前を折り返してよい切れ目で分ける（「さっぱりイル／カ」「おすそ／わけランタン」にしない）
 *   切れ目: カタカナの始まりの前（一途な｜ペンギン）・カタカナが終わったあと（ヤキモチ｜うさぎ。「の」などの前は切らない）・「の」「を」のあと（みんなの｜太陽）
 */
export function nameUnits(text) {
  const cs = [...String(text)];
  const kata = (c) => !!c && c >= "\u30A0" && c <= "\u30FF"; // カタカナ（長音「ー」を含む）
  const out = [];
  cs.forEach((c, i) => {
    const p = cs[i - 1];
    const brk = i > 0 && ((kata(c) && !kata(p)) || (!kata(c) && kata(p) && !"のをな".includes(c)) || ("のを".includes(p) && i < cs.length - 1 && !kata(c)));
    if (brk || !out.length) out.push(c);
    else out[out.length - 1] += c;
  });
  return out;
}

/**
 * 「上位◯%」の見せ方。top は許せる度の高い（ゆるい）ほうから数えた上位%（1〜100）
 *   半分より上なら「ゆるさ 上位◯%」、下なら「きびしさ 上位◯%」（全部アウトの人に「上位99%」と出さないため）
 */
export function rankView(top) {
  const t = Math.min(100, Math.max(1, Math.round(Number(top))));
  return t <= 50 ? { side: "yuru", label: "ゆるさ", value: t } : { side: "kibi", label: "きびしさ", value: Math.max(1, 100 - t) };
}

/** 共有の文（X・LINE・ほかのアプリ）。ハッシュタグは1つまで・絵文字なし */
export function shareText(model, { tag = true } = {}) {
  const t = model.type;
  let s;
  if (model.kind === "line") {
    s = `浮気許せる度診断の結果は「${t.name}」。許せる度は${model.res.score}点`;
    if (model.rank && model.rank.top != null) {
      const rv = rankView(model.rank.top);
      s += `（${rv.label}上位${rv.value}%）`;
    }
    s += "でした。あなたの浮気のラインはどこ？";
  } else {
    // 「気になる人にだけ」と答えた数（割合だけだと、診断を知らない人には何の数か分からない）
    const only = Array.isArray(model.res.counts) ? model.res.counts[0] : Math.round((model.res.special * 30) / 100);
    s = `本音ライン診断の結果は「${t.name}」。30問のうち「気になる人にだけ」は${only}問でした。あなたの本音のラインは？`;
  }
  if (tag) s += ` #${HASHTAG[model.kind]}`;
  return s;
}

// ---------- 共有の方法 ----------
/**
 * 新しいタブで開く。ポップアップが止められたときだけ、同じタブで開く
 *   features に noopener を入れると window.open はいつも null を返す（決まり）ので入れない。
 *   開いたあとで opener を切る（開いた先から、このページを動かせないように）
 */
function openWindow(url) {
  let w = null;
  try { w = window.open(url, "_blank"); } catch { w = null; }
  if (w) {
    try { w.opener = null; } catch { /* 切れなくても開くのは続ける */ }
  } else {
    location.href = url; // ポップアップが止められたときは同じタブで
  }
}

/** X（旧 Twitter）の投稿画面 */
export function shareX(text, url) {
  track("share_click", { method: "x" });
  openWindow(`https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`);
}

/** LINE で送る（文と URL をいっしょに。当てっこの画面と同じ送り方） */
export function shareLine(text, url) {
  track("share_click", { method: "line" });
  openWindow(`https://line.me/R/share?text=${encodeURIComponent(`${text}\n${url}`)}`);
}

/** リンクをコピー */
export async function copyLink(url, text) {
  track("share_click", { method: "copy" });
  const body = text ? `${text}\n${url}` : url;
  let ok = false;
  try {
    await navigator.clipboard.writeText(body);
    ok = true;
  } catch {
    try {
      const ta = document.createElement("textarea");
      ta.value = body;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.append(ta);
      ta.select();
      ok = document.execCommand("copy");
      ta.remove();
    } catch { ok = false; }
  }
  toast(ok ? "リンクをコピーしました" : "コピーできませんでした。長押しでコピーしてね", { error: !ok });
  return ok;
}

/** スマホのほかのアプリへ（文と URL） */
export async function shareNative(text, url) {
  track("share_click", { method: "native" });
  if (navigator.share) {
    try {
      await navigator.share({ text, url });
      return true;
    } catch (e) {
      if (e && e.name === "AbortError") return false;
    }
  }
  return copyLink(url, text);
}

/** スマホか（画像はスマホなら共有シート、PC ならダウンロード） */
export function isPhone() {
  const ua = navigator.userAgent || "";
  if (/iPhone|iPad|iPod|Android/i.test(ua)) return true;
  if (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1) return true; // iPad の PC 表示
  try { return matchMedia("(pointer: coarse)").matches && matchMedia("(max-width: 900px)").matches; } catch { return false; }
}

/** ファイルとして共有できるか */
export function canShareFile(file) {
  try {
    return !!(navigator.canShare && navigator.share && navigator.canShare({ files: [file] }));
  } catch {
    return false;
  }
}

/** ダウンロード（PC・共有できないとき） */
export function download(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  a.style.display = "none";
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/**
 * 画像を保存・共有する。スマホは navigator.share({ files })（iPhone のホーム画面アプリで <a download> は戻れなくなるため）、PC はダウンロード
 *   ※ navigator.share は押した直後に呼ぶ必要があるので、blob は押す前に作っておく
 * @returns {Promise<"shared"|"downloaded"|"cancel"|"blocked">}
 */
export async function saveImage(blob, filename, { method = "image", text, url } = {}) {
  track("share_click", { method });
  const file = new File([blob], filename, { type: blob.type || "image/png" });
  if (isPhone() && canShareFile(file)) {
    try {
      const data = { files: [file] };
      if (text) data.text = url ? `${text}\n${url}` : text;
      await navigator.share(data);
      return "shared";
    } catch (e) {
      if (e && e.name === "AbortError") return "cancel";
      if (e && e.name === "NotAllowedError") return "blocked"; // 押してから時間がたった → 画面で案内する
      // 文つきで断られる端末があるので、画像だけでもう一度
      try {
        await navigator.share({ files: [file] });
        return "shared";
      } catch (e2) {
        if (e2 && e2.name === "AbortError") return "cancel";
        if (e2 && e2.name === "NotAllowedError") return "blocked";
      }
    }
  }
  download(blob, filename);
  return "downloaded";
}

/**
 * Instagram（ストーリー用の画像をスマホの共有シートへ。PC・できないときは保存して案内）
 * @returns {Promise<"shared"|"downloaded"|"cancel"|"blocked">}
 */
export async function shareInstagram(blob, filename) {
  track("share_click", { method: "instagram" });
  const file = new File([blob], filename, { type: blob.type || "image/png" });
  // PC の共有画面からはインスタに送れないので、スマホだけ共有シート（PC は保存して案内）
  if (isPhone() && canShareFile(file)) {
    try {
      await navigator.share({ files: [file] });
      return "shared";
    } catch (e) {
      if (e && e.name === "AbortError") return "cancel";
      if (e && e.name === "NotAllowedError") return "blocked";
    }
  }
  download(blob, filename);
  return "downloaded";
}

/** ファイルの名前（uwaki-line-a1-post.png など） */
export function fileName(model, variant) {
  return `${model.kind === "line" ? "uwaki-line" : "honne-line"}-${model.type.id}-${variant}.png`;
}

export const SITE_LABEL = SITE_SUB ? `${SITE_NAME}（${SITE_SUB}）` : SITE_NAME;
