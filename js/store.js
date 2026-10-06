// 端末に残すもの（CONTRACT.md §6）。読み書きはすべて try/catch（保存できない端末やシークレットでも落ちない）
//
// ──── 使い方の一覧（結果担当も使う） ────────────────────────────────
//   kind は "line"（浮気ライン）か "feel"（本音ライン）
//
//   getRecord(kind)                 最後の結果 { answers, attrs, word, at, result, n?, pct? } か null（ul.line / ul.feel）
//                                     answers が30文字でないものは null として扱う
//   saveRecord(kind, rec)           最後の結果を保存（丸ごと置きかえ）
//   patchRecord(kind, fields)       最後の結果に項目を足す・上書き（例: { n, pct }）
//   isCounted(kind) / setCounted(kind)
//                                   統計に数えたか（ul.counted.line / ul.counted.feel = "1"。同じ端末は最初の1回だけ数える）
//   getWord() / setWord(id)         相手の呼び方 "i" | "d" | "o"（ul.word・既定 "i"）
//   lastAttrs()                     前に入れた属性 { age, gender, love }（2つの診断の新しいほう。無ければ全部 ""）
//
//   getQuizzes()                    自分が作った当てっこ [{ id, key, name, at, w? }]（新しい順・ul.quizzes）
//   findQuiz(id)                    その id の自分の当てっこ（無ければ null）
//   addQuiz(q)                      足す（同じ id は上書き。name が空なら前の name を残す）
//   removeQuiz(id)                  消す
//   getAttempts()                   自分が答えた当てっこ [{ quizId, attemptId, akey, name, score, at }]（ul.attempts）
//   findAttempt(quizId)             その当てっこへの自分の答え（無ければ null）
//   addAttempt(a) / removeAttempt(attemptId)
//
//   getProgress(key) / saveProgress(key, obj) / clearProgress(key)
//                                   途中の答え（sessionStorage の ul.progress.<key>。key は "line" "feel" "q.<id>" など）
//   readJSON(key, fallback) / writeJSON(key, value) / removeKey(key)
//                                   そのほかの localStorage（JSON）
// ────────────────────────────────────────────────────────────────

const ANS_RE = /^[012]{30}$/;
const WORDS = ["i", "d", "o"];
const KINDS = ["line", "feel"];

function ls() {
  try { return window.localStorage; } catch { return null; }
}
function ss() {
  try { return window.sessionStorage; } catch { return null; }
}

/** localStorage から JSON を読む（読めなければ fallback） */
export function readJSON(key, fallback = null) {
  try {
    const s = ls();
    const v = s ? s.getItem(key) : null;
    if (v == null) return fallback;
    return JSON.parse(v);
  } catch {
    return fallback;
  }
}
/** localStorage に JSON で書く（書けなければ false） */
export function writeJSON(key, value) {
  try {
    const s = ls();
    if (!s) return false;
    s.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}
export function removeKey(key) {
  try { const s = ls(); if (s) s.removeItem(key); } catch { /* そのまま */ }
}
function readRaw(key) {
  try { const s = ls(); return s ? s.getItem(key) : null; } catch { return null; }
}
function writeRaw(key, v) {
  try { const s = ls(); if (s) s.setItem(key, v); } catch { /* そのまま */ }
}

// ---- 最後の結果 ----
export function getRecord(kind) {
  if (!KINDS.includes(kind)) return null;
  const r = readJSON("ul." + kind, null);
  if (!r || typeof r !== "object" || !ANS_RE.test(r.answers || "")) return null;
  return r;
}
export function saveRecord(kind, rec) {
  if (!KINDS.includes(kind)) return false;
  return writeJSON("ul." + kind, rec);
}
export function patchRecord(kind, fields) {
  const r = getRecord(kind);
  if (!r) return false;
  return saveRecord(kind, { ...r, ...fields });
}

// ---- 統計に数えたか ----
export function isCounted(kind) {
  return readRaw("ul.counted." + kind) === "1";
}
export function setCounted(kind) {
  writeRaw("ul.counted." + kind, "1");
}

// ---- 相手の呼び方 ----
export function getWord() {
  const w = readRaw("ul.word");
  return WORDS.includes(w) ? w : "i";
}
export function setWord(id) {
  if (WORDS.includes(id)) writeRaw("ul.word", id);
}

/** 前に入れた属性（2つの診断の新しいほう） */
export function lastAttrs() {
  const recs = KINDS.map(getRecord).filter(Boolean).sort((a, b) => (b.at || 0) - (a.at || 0));
  const a = (recs[0] && recs[0].attrs) || {};
  return { age: a.age || "", gender: a.gender || "", love: a.love || "" };
}

// ---- 自分が作った当てっこ ----
export function getQuizzes() {
  const l = readJSON("ul.quizzes", []);
  if (!Array.isArray(l)) return [];
  return l.filter((q) => q && typeof q.id === "string" && typeof q.key === "string").sort((a, b) => (b.at || 0) - (a.at || 0));
}
export function findQuiz(id) {
  return getQuizzes().find((q) => q.id === id) || null;
}
export function addQuiz(q) {
  if (!q || !q.id || !q.key) return;
  const l = getQuizzes();
  const old = l.find((x) => x.id === q.id);
  const merged = { ...(old || {}), ...q, name: q.name || (old && old.name) || "", at: q.at || (old && old.at) || Date.now() };
  writeJSON("ul.quizzes", [merged, ...l.filter((x) => x.id !== q.id)].slice(0, 50));
}
export function removeQuiz(id) {
  writeJSON("ul.quizzes", getQuizzes().filter((q) => q.id !== id));
}

// ---- 自分が答えた当てっこ ----
export function getAttempts() {
  const l = readJSON("ul.attempts", []);
  if (!Array.isArray(l)) return [];
  return l.filter((a) => a && typeof a.quizId === "string" && typeof a.attemptId === "string").sort((a, b) => (b.at || 0) - (a.at || 0));
}
export function findAttempt(quizId) {
  return getAttempts().find((a) => a.quizId === quizId) || null;
}
export function addAttempt(a) {
  if (!a || !a.quizId || !a.attemptId) return;
  const l = getAttempts().filter((x) => x.attemptId !== a.attemptId && x.quizId !== a.quizId);
  writeJSON("ul.attempts", [{ ...a, at: a.at || Date.now() }, ...l].slice(0, 100));
}
export function removeAttempt(attemptId) {
  writeJSON("ul.attempts", getAttempts().filter((a) => a.attemptId !== attemptId));
}

// ---- 途中の答え（タブを閉じるまで） ----
export function getProgress(key) {
  try {
    const s = ss();
    const v = s ? s.getItem("ul.progress." + key) : null;
    return v ? JSON.parse(v) : null;
  } catch {
    return null;
  }
}
export function saveProgress(key, obj) {
  try { const s = ss(); if (s) s.setItem("ul.progress." + key, JSON.stringify(obj)); } catch { /* そのまま */ }
}
export function clearProgress(key) {
  try { const s = ss(); if (s) s.removeItem("ul.progress." + key); } catch { /* そのまま */ }
}
