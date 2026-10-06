// 名前（当てっこを作った人・答えた人のニックネーム）の決まりのうち、URL・連絡先・禁止語を見るところ
//   画面（quiz.js の checkName）とサーバー（worker/src/names.js の cleanName）が同じこのファイルを使う
//   ナカミドの決まり（URL っぽいもの・禁止語 ngwords.js）に、浮気許せる度診断だけの決まりを足している（2026-10-06）:
//   - 連絡先（@ の付いた SNS の ID・電話番号）と、.com などで終わらない短い URL（bit.ly/… など）も断る
//   - 禁止語は、字のあいだに記号をはさんだもの（し/ね など）も断る（文字と数字以外を落としてからも照らす）
//   - 浮気許せる度診断だけの禁止語（tools/name-extra-words.txt → name-extra.js。ハッシュだけ）を足す
//
//   nameIssue(name)        → null（使える）か "url" | "contact" | "ng"
//   strongNormalize(s)     → 照らすためにそろえた形（NFKC・小文字・カタカナ→ひらがな・文字と数字以外を落とす）
//   h32(s)                 → 語のハッシュ（ngwords.js と同じ FNV-1a）
import { hasNgWord, ngNormalize } from "./ngwords.js";
import { EXTRA_PART, EXTRA_WHOLE } from "./name-extra.js";

// URL っぽいもの（連絡先や外のサイトへの誘導を防ぐ）。「英数字.英字/」の形の短い URL と、よくある終わり方も見る
export const URLISH = /https?:|:\/\/|www\.|line\.me|[a-z0-9-]+\.[a-z]{2,6}\/|\.(com|net|jp|me|io|app|xyz|co|ly|gg|to|cc|tk|org|info|link|site|dev|page|bio)\b/i;
// 連絡先っぽいもの（@ の付いた SNS の ID・10桁以上の電話番号など）
export const CONTACTISH = /@|\d[\d-]{8,}\d/;

export function h32(s) {
  let x = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    x ^= s.charCodeAt(i);
    x = Math.imul(x, 0x01000193) >>> 0;
  }
  return x;
}

export function strongNormalize(s) {
  return ngNormalize(String(s).normalize("NFKC")).replace(/[^\p{L}\p{N}]/gu, "");
}

/** 浮気許せる度診断だけの禁止語に当たるか（part は名前のどこか、whole は名前がその語だけ・くり返し） */
function hasExtraNg(n) {
  const s = strongNormalize(n);
  if (!s) return false;
  for (let i = 0; i < s.length; i++) {
    for (let len = 1; len <= 12 && i + len <= s.length; len++) {
      if (EXTRA_PART.has(h32(s.slice(i, i + len)))) return true;
    }
  }
  if (EXTRA_WHOLE.has(h32(s))) return true;
  // くり返し（「しねしね」など）
  for (let len = 1; len <= 6 && len * 2 <= s.length; len++) {
    if (s.length % len) continue;
    const unit = s.slice(0, len);
    if (unit.repeat(s.length / len) === s && EXTRA_WHOLE.has(h32(unit))) return true;
  }
  return false;
}

/**
 * 名前の中身の問題（長さ・見えない字などは呼ぶ側で先に見る）
 * @param {string} n NFKC でそろえて、見えない字を落としたあとの名前
 * @returns {null|"url"|"contact"|"ng"}
 */
export function nameIssue(n) {
  const s = String(n);
  if (URLISH.test(s)) return "url";
  if (CONTACTISH.test(s)) return "contact";
  if (hasNgWord(s) || hasNgWord(strongNormalize(s)) || hasExtraNg(s)) return "ng";
  return null;
}
