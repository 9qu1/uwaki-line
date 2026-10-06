// 設定（名前・場所・締め切り）。名前を変えるときはここと OGP を作り直す
export const SITE_NAME = "浮気許せる度診断"; // 2026-10-06 ユーザーが決めた名前
export const SITE_SUB = ""; // 添え書き（空なら出さない）
export const SLUG = "uwaki-line";
export const SITE_URL = "https://9qu1.com/uwaki-line/";
export const AUTHOR = "くぁくぁ";
export const AUTHOR_X = "https://x.com/9qu1";

// 10月31日までの期間限定（11月1日 0:00 日本時間に受付を止め、データを全部消す）
export const END_AT = "2026-11-01T00:00:00+09:00";
export const END_LABEL = "10月31日";

export const GA_ID = "G-1T31EDBJBY"; // 9qu1.com 全体のプロパティ（本番のホストのときだけ読む）

const PROD_API = "https://uwaki-line.nakamido.workers.dev";

function isLocalHost() {
  const h = location.hostname;
  return h === "localhost" || h === "127.0.0.1" || h === "[::1]" || h.endsWith(".localhost");
}
export const IS_LOCAL = typeof location !== "undefined" && isLocalHost();
export const IS_PROD = typeof location !== "undefined" && location.hostname === "9qu1.com";

// 手元では同じホスト名の 6710 番の API（?api=6711 でほかの番に。sessionStorage に覚える）
function apiBase() {
  if (typeof location === "undefined") return PROD_API;
  if (!IS_LOCAL) return PROD_API;
  let port = "6710";
  try {
    const q = new URLSearchParams(location.search).get("api");
    if (q && /^\d{2,5}$/.test(q)) sessionStorage.setItem("ul.api", q);
    port = sessionStorage.getItem("ul.api") || port;
  } catch { /* 保存できない環境では既定の番 */ }
  return `http://${location.hostname}:${port}`;
}
export const API_BASE = apiBase();

// 今の時刻（手元だけ ?now=ISO で差しかえて締め切りのあとを確かめられる）
export function now() {
  if (IS_LOCAL) {
    try {
      const q = new URLSearchParams(location.search).get("now");
      if (q) { const t = Date.parse(q); if (!Number.isNaN(t)) return t; }
    } catch { /* そのまま */ }
  }
  return Date.now();
}
export function isEnded() { return now() >= Date.parse(END_AT); }
export function daysLeft() {
  const ms = Date.parse(END_AT) - now();
  return Math.max(0, Math.ceil(ms / 86400e3));
}

// 作者のほかのサイト（送客）
const UTM = "utm_source=uwaki-line&utm_medium=referral&utm_campaign=sister";
export const SISTER = {
  rikaido: { name: "リカイド", url: `https://rikaido.me/koi/?${UTM}`, ev: "sister_click_rikaido" },
  nakamidoRenai: { name: "ナカミド", url: `https://nakamido.com/renai-hensachi/?${UTM}`, ev: "sister_click_nakamido" },
  nakamidoAisho: { name: "ナカミド", url: `https://nakamido.com/aisho/?${UTM}`, ev: "sister_click_nakamido" },
};
