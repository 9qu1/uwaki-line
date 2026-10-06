// API とのやりとり（CONTRACT.md §7・docs/api.md）。住所は config.js の API_BASE（手元は ?api=6713 などで切りかえ）
//
// ──── 使い方の一覧 ────────────────────────────────────────────
//   apiPlay(body)                       POST /api/play           { kind, answers, attrs, pair? } → { ok, n, pct, … }
//   getStats()                          GET  /api/stats          みんなの統計（ページの中で1回だけ取りにいく。失敗したら次の呼び出しで取り直す）
//   createQuiz({ name, answers })       POST /api/quiz           → { ok, id, key, name }
//   getQuiz(id, ownerKey?)              GET  /api/quiz/:id       （鍵が合えば owner: true, private, adminHidden, answers も）
//   answerQuiz(id, { name, guesses })   POST /api/quiz/:id/attempt → { ok, attemptId, akey, score, answers, rank, count }
//   setQuizPrivate(id, key, bool)       POST /api/quiz/:id/private
//   deleteQuiz(id, key)                 POST /api/quiz/:id/delete
//   hideAttempt(id, aid, key)           POST /api/quiz/:id/attempt/:aid/hide
//   deleteAttempt(aid, akey)            POST /api/attempt/:aid/delete
//   report({ quizId, attemptId?, reason })  POST /api/report     reason は "name" | "other"
//   health()                            GET  /api/health
//   adminList(token, { reported })      GET  /api/admin/list     （運営だけ）
//   adminHide(token, body)              POST /api/admin/hide     { quizId | attemptId, hidden }
//   adminPurge(token)                   POST /api/admin/purge
//
//   失敗はどれも Error（ApiError）を投げる: .status（届かないときは 0）・.code（短い英字）・.message（画面に出せる日本語）
//     届かない "network"・時間切れ "timeout"・回数制限 "too_many"(429)・締め切りのあと "ended"(410)・無い "not_found"(404) など
// ────────────────────────────────────────────────────────────────
import { API_BASE } from "./config.js";

const TIMEOUT_MS = 12000;

// サーバーの返事に message が無いとき・届かないときの日本語
const MSG = {
  network: "サーバーにつながりませんでした。電波のよいところで、もう一度ためしてください。",
  timeout: "サーバーから返事がありませんでした。少し待って、もう一度ためしてください。",
  too_many: "回数が多すぎます。1時間ほどおいて、もう一度ためしてください。",
  ended: "公開は10月31日で終わりました。データはすべて消しました。",
  not_found: "見つかりませんでした。非公開になったか、消されたか、URL がまちがっています。",
  forbidden: "鍵が合わないため、この操作はできません。",
  bad_name: "その名前は使えません。1〜12文字で、URL・連絡先や使えない言葉を入れずに書いてください。",
  server: "サーバーでエラーが起きました。時間をおいて、もう一度ためしてください。",
};
const STATUS_CODE = { 404: "not_found", 403: "forbidden", 410: "ended", 429: "too_many" };

export class ApiError extends Error {
  constructor(status, code, message) {
    super(message || MSG[code] || MSG.server);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

async function call(method, path, { body, headers } = {}) {
  const h = { ...(headers || {}) };
  let payload;
  if (method === "POST") {
    h["content-type"] = "application/json";
    payload = JSON.stringify(body || {});
  }
  const ctl = typeof AbortController !== "undefined" ? new AbortController() : null;
  let timedOut = false;
  const timer = ctl ? setTimeout(() => { timedOut = true; ctl.abort(); }, TIMEOUT_MS) : null;
  let res;
  try {
    res = await fetch(API_BASE + path, { method, headers: h, body: payload, signal: ctl ? ctl.signal : undefined, credentials: "omit" });
  } catch {
    throw timedOut ? new ApiError(0, "timeout") : new ApiError(0, "network");
  } finally {
    if (timer) clearTimeout(timer);
  }
  let data = null;
  try { data = await res.json(); } catch { /* JSON でない */ }
  if (!res.ok) {
    const code = (data && (data.ended ? "ended" : data.error)) || STATUS_CODE[res.status] || "server";
    // 締め切りのあと・回数制限・無いものは、いつも同じ言い方にそろえる
    const fixed = code === "ended" || code === "too_many" || code === "not_found";
    const msg = fixed ? MSG[code] : (data && typeof data.message === "string" && data.message) || MSG[code] || MSG.server;
    throw new ApiError(res.status, code, msg);
  }
  if (!data || typeof data !== "object") throw new ApiError(res.status, "server");
  return data;
}

const enc = encodeURIComponent;
const ownerH = (key) => (key ? { "x-owner-key": key } : {});
const adminH = (token) => ({ authorization: "Bearer " + token });

export function apiPlay(body) {
  return call("POST", "/api/play", { body });
}

let statsPromise = null;
export function getStats() {
  if (!statsPromise) {
    statsPromise = call("GET", "/api/stats");
    statsPromise.catch(() => { statsPromise = null; }); // 失敗したら次で取り直す
  }
  return statsPromise;
}

export function createQuiz({ name, answers }) {
  return call("POST", "/api/quiz", { body: { name, answers } });
}
export function getQuiz(id, ownerKey) {
  return call("GET", "/api/quiz/" + enc(id), { headers: ownerH(ownerKey) });
}
export function answerQuiz(id, { name, guesses }) {
  return call("POST", "/api/quiz/" + enc(id) + "/attempt", { body: { name, guesses } });
}
export function setQuizPrivate(id, key, isPrivate) {
  return call("POST", "/api/quiz/" + enc(id) + "/private", { body: { private: !!isPrivate }, headers: ownerH(key) });
}
export function deleteQuiz(id, key) {
  return call("POST", "/api/quiz/" + enc(id) + "/delete", { body: {}, headers: ownerH(key) });
}
export function hideAttempt(id, aid, key) {
  return call("POST", "/api/quiz/" + enc(id) + "/attempt/" + enc(aid) + "/hide", { body: {}, headers: ownerH(key) });
}
export function deleteAttempt(aid, akey) {
  return call("POST", "/api/attempt/" + enc(aid) + "/delete", { body: { akey } });
}
export function report(body) {
  return call("POST", "/api/report", { body });
}
export function health() {
  return call("GET", "/api/health");
}

// ---- 運営（くぁくぁ）だけ ----
export function adminList(token, { reported = false, limit } = {}) {
  const q = new URLSearchParams();
  if (reported) q.set("reported", "1");
  if (limit) q.set("limit", String(limit));
  const s = q.toString();
  return call("GET", "/api/admin/list" + (s ? "?" + s : ""), { headers: adminH(token) });
}
export function adminHide(token, body) {
  return call("POST", "/api/admin/hide", { body, headers: adminH(token) });
}
export function adminPurge(token) {
  return call("POST", "/api/admin/purge", { body: { confirm: "DELETE-ALL" }, headers: adminH(token) });
}
