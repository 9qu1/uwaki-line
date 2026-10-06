// 計算（CONTRACT.md §5 の式どおり）。DOM を使わない純粋な ES モジュール（Node でもブラウザでも動く）
//
//   scoreLine(answers)               浮気ライン → { score, gray, cats, typeId, counts }
//   scoreFeel(answers)               本音ライン → { special, open, typeId, signals, counts }
//   compareLineFeel(line, feel)      浮気ラインと本音のズレ → { sweet, generous, same, level, items }
//   quizScore(owner, guesses)        当てっこの点 → { score, pct, diffs }
//   lineTypeOf / feelTypeOf / gapLevelOf / typeById / applyWord / isAnswers
//   stepWeights / pointOf / lineRawOf  重みの中身（説明やテスト用）
//
// 答えはどれも30文字の数字の列（"0120..."・各文字 0/1/2・QUESTIONS の並び順）。
// 形が合わない答えを渡したときは null を返す（画面が落ちないように例外は投げない）。

import { QUESTIONS, CATEGORIES, PARTNER_WORDS } from "./data/questions.js";
import { LINE_TYPES, FEEL_TYPES, GAP_LEVELS } from "./data/types.js";

export const N_QUESTIONS = 30;

// ---- 部分得点モデルの決まった数字（§5-1・変えない） ----
const STEP = 0.7;          // 段の幅 d
const B_SCALE = 0.9;       // 問題の難しさ b = (h − 3) × 0.9
const PRIOR_SD = 1.6;      // θ を無限大にしないための事前の広がり
const SCORE_SCALE = 1.1;   // 許せる度 = round(100 / (1 + exp(−θ / 1.1)))
const THETA_MIN = -500;    // θ は −5〜5 を 0.01 刻みで探す（整数で数えて小数のずれを防ぐ）
const THETA_MAX = 500;

/** 答えの形（30文字・各文字 0/1/2）か */
export function isAnswers(s) {
  return typeof s === "string" && /^[012]{30}$/.test(s);
}

/** 問題の難しさ b */
export function difficultyOf(h) {
  return (h - 3) * B_SCALE;
}

/**
 * 段の効き目（§5-1・問題と選んだもので重みをつける）
 *   a1 ＝ アウト→モヤる の段 ＝ (6 − h) / 3（軽い行動ほど大きい → 軽い行動をアウトにすると大きく下がる）
 *   a2 ＝ モヤる→セーフ の段 ＝ h / 3      （重い行動ほど大きい → 重い行動をセーフにすると大きく上がる）
 *   どの問題も a1 + a2 = 2（アウトとセーフの差は同じ。モヤるの位置が重さで動く）
 */
export function stepWeights(h) {
  return [(6 - h) / 3, h / 3];
}

/**
 * 答えの「点の素」（アウト 0・モヤる (6 − h)/3・セーフ 2）。
 * 全員が同じ問題に答えるので、許せる度はこの合計（0〜60）だけで決まる（合計が大きいほど高い）
 */
export function pointOf(h, k) {
  if (k <= 0) return 0;
  if (k === 1) return stepWeights(h)[0];
  return 2;
}

/**
 * 点の素の合計（0〜60。idx を渡すとその問題だけ）
 * @param {string} answers 30文字
 * @param {number[]} [idx] 使う問題の番号（省略で全部）
 */
export function lineRawOf(answers, idx) {
  let s = 0;
  for (const i of idx || QUESTIONS.map((_, j) => j)) s += pointOf(QUESTIONS[i].h, Number(answers[i]));
  return s;
}

/** 答え k（0/1/2）を選ぶ確率の対数（段ごとに効き目がちがう部分得点モデル） */
function logProb(theta, b, w, k) {
  const d1 = b - STEP;           // アウト→モヤる の境目
  const d2 = b + STEP;           // モヤる→セーフ の境目
  const e0 = 0;
  const e1 = w[0] * (theta - d1);
  const e2 = e1 + w[1] * (theta - d2);
  const m = Math.max(e0, e1, e2);
  const lse = m + Math.log(Math.exp(e0 - m) + Math.exp(e1 - m) + Math.exp(e2 - m));
  return (k === 0 ? e0 : k === 1 ? e1 : e2) - lse;
}

/**
 * θ を探す（−5〜5 を 0.01 刻みの全探索で「対数尤度 − θ²/(2×1.6²)」が最大のところ）
 * @param {string} answers 30文字
 * @param {number[]} [idx] 使う問題の番号（省略で全部）
 */
export function estimateTheta(answers, idx) {
  const items = (idx || QUESTIONS.map((_, i) => i)).map((i) => ({ b: difficultyOf(QUESTIONS[i].h), w: stepWeights(QUESTIONS[i].h), k: Number(answers[i]) }));
  let best = -Infinity;
  let bestT = 0;
  const prior = 2 * PRIOR_SD * PRIOR_SD;
  for (let t = THETA_MIN; t <= THETA_MAX; t++) {
    const theta = t / 100;
    let ll = -(theta * theta) / prior;
    for (const it of items) ll += logProb(theta, it.b, it.w, it.k);
    if (ll > best) { best = ll; bestT = theta; }
  }
  return bestT;
}

/** θ から許せる度（0〜100） */
export function scoreOfTheta(theta) {
  return Math.round(100 / (1 + Math.exp(-theta / SCORE_SCALE)));
}

function countOf(answers) {
  const c = [0, 0, 0];
  for (const ch of answers) c[Number(ch)]++;
  return c;
}

/** 範囲（両端を含む）に入っているか */
function inRange(v, r) {
  return v >= r[0] && v <= r[1];
}

/** 許せる度とモヤる率から浮気ラインのタイプ id（当たらなければ null） */
export function lineTypeOf(score, gray) {
  const t = LINE_TYPES.find((x) => inRange(score, x.band) && inRange(gray, x.gray));
  return t ? t.id : null;
}

/** special と open から本音ラインのタイプ id（当たらなければ null） */
export function feelTypeOf(special, open) {
  const t = FEEL_TYPES.find((x) => inRange(special, x.special) && inRange(open, x.open));
  return t ? t.id : null;
}

/** 自分に甘い度からズレの段（GAP_LEVELS の1つ） */
export function gapLevelOf(sweet) {
  return GAP_LEVELS.find((g) => sweet <= g.max) || GAP_LEVELS[GAP_LEVELS.length - 1];
}

/** id からタイプ（浮気ライン・本音ラインの両方から探す） */
export function typeById(id) {
  return LINE_TYPES.find((t) => t.id === id) || FEEL_TYPES.find((t) => t.id === id) || null;
}

/** 問題文の {X} を相手の呼び方に置きかえる（知らない id は既定の「異性」） */
export function applyWord(text, wordId) {
  const w = PARTNER_WORDS.find((p) => p.id === wordId) || PARTNER_WORDS[0];
  return String(text).split("{X}").join(w.label);
}

/**
 * 浮気ライン
 * @returns {{score:number, gray:number, cats:Object<string,number>, typeId:string, counts:number[]}|null}
 */
export function scoreLine(answers) {
  if (!isAnswers(answers)) return null;
  const score = scoreOfTheta(estimateTheta(answers));
  const counts = countOf(answers);
  const gray = Math.round((100 * counts[1]) / N_QUESTIONS);
  const cats = {};
  for (const c of CATEGORIES) {
    const idx = [];
    QUESTIONS.forEach((q, i) => { if (q.cat === c.id) idx.push(i); });
    cats[c.id] = scoreOfTheta(estimateTheta(answers, idx));
  }
  return { score, gray, cats, typeId: lineTypeOf(score, gray), counts };
}

/**
 * 本音ライン
 * @returns {{special:number, open:number, typeId:string, signals:number[], counts:number[]}|null}
 */
export function scoreFeel(answers) {
  if (!isAnswers(answers)) return null;
  const counts = countOf(answers);
  const special = Math.round((100 * counts[0]) / N_QUESTIONS);
  const sum = counts[1] + 2 * counts[2];
  const open = Math.round((100 * sum) / (2 * N_QUESTIONS));
  const signals = [];
  for (let i = 0; i < N_QUESTIONS; i++) if (answers[i] === "0") signals.push(i);
  return { special, open, typeId: feelTypeOf(special, open), signals, counts };
}

/**
 * 浮気ラインと本音のズレ（同じ問題で J＝浮気ライン、F＝本音）
 *   自分に甘い度 = round(100 × Σ max(0, F − J) / 60)
 *   相手に寛大度 = round(100 × Σ max(0, J − F) / 60)
 */
export function compareLineFeel(lineAnswers, feelAnswers) {
  if (!isAnswers(lineAnswers) || !isAnswers(feelAnswers)) return null;
  let up = 0;
  let down = 0;
  let same = 0;
  const items = [];
  for (let i = 0; i < N_QUESTIONS; i++) {
    const j = Number(lineAnswers[i]);
    const f = Number(feelAnswers[i]);
    if (f > j) up += f - j;
    if (j > f) down += j - f;
    if (j === f) same++;
    items.push({ i, j, f, d: f - j });
  }
  const sweet = Math.round((100 * up) / (2 * N_QUESTIONS));
  const generous = Math.round((100 * down) / (2 * N_QUESTIONS));
  return { sweet, generous, same, level: gapLevelOf(sweet), items };
}

/** 当てっこの点（一致の数・割合・ずれた問題の番号） */
export function quizScore(ownerAnswers, guesses) {
  if (!isAnswers(ownerAnswers) || !isAnswers(guesses)) return null;
  let score = 0;
  const diffs = [];
  for (let i = 0; i < N_QUESTIONS; i++) {
    if (ownerAnswers[i] === guesses[i]) score++;
    else diffs.push(i);
  }
  return { score, pct: Math.round((100 * score) / N_QUESTIONS), diffs };
}
