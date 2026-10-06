// 作者のほかのサイト（リカイド・ナカミド）への紹介（結果担当。トップと結果画面で使う）
//
//   renderSister(container, { place: "top" | "result" })
//
// 見た目が分かるように、それぞれの画面と結果の画像を小さく見せる（site/img/sister/。tools/sister/make-sister.py で作る）。
// 広告に見えないようにする（「PR」などと書かない・作者のサイトだと分かる文）。リンクと UTM は config.js の SISTER。
import { SISTER, AUTHOR } from "./config.js";
import { track, ensureResultCss } from "./share.js";

const IMG = (name) => new URL(`../img/sister/${name}`, import.meta.url).href;
const EXT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 4h6v6M20 4l-9 9"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg>';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/** 1つのサイトのカード（画面と結果の画像を重ねて見せる） */
function siteCard({ key, name, sub, title, desc, screen, results, links, accent }) {
  const shots = results.map((r, i) => `<img class="ss-result ss-result--${i + 1}" src="${IMG(r.src)}" alt="${esc(r.alt)}" width="${r.w}" height="${r.h}" loading="lazy" decoding="async">`).join("");
  const btns = links.map((l) => `<a class="btn ${l.primary ? "btn-primary" : "btn-secondary"} btn-sm ss-btn" href="${esc(l.href)}" target="_blank" rel="noopener" data-ev="${esc(l.ev)}" data-site="${esc(key)}">${esc(l.label)}${EXT}</a>`).join("");
  return `<article class="ss-card" style="--ss:${accent}">
    <a class="ss-visual" href="${esc(links[0].href)}" target="_blank" rel="noopener" data-ev="${esc(links[0].ev)}" data-site="${esc(key)}" tabindex="-1" aria-hidden="true">
      <span class="ss-phone"><img src="${IMG(screen.src)}" alt="" width="${screen.w}" height="${screen.h}" loading="lazy" decoding="async"></span>
      ${shots}
    </a>
    <div class="ss-body">
      <p class="ss-name"><span class="ss-dot" aria-hidden="true"></span>${esc(name)}<span class="ss-sub">${esc(sub)}</span></p>
      <p class="ss-title">${esc(title)}</p>
      <p class="ss-desc">${esc(desc)}</p>
      <div class="ss-btns">${btns}</div>
    </div>
  </article>`;
}

/**
 * 作者のほかのサイト
 * @param {HTMLElement} container
 * @param {{place?: "top"|"result"}} opts
 */
export function renderSister(container, { place = "result" } = {}) {
  if (!container) return;
  ensureResultCss();
  const lead = place === "top"
    ? `${AUTHOR}が作っている、恋愛まわりのほかのサイトです。どれも無料・登録なしで遊べます。`
    : `この診断を作った${AUTHOR}の、ほかのサイトです。恋人や友達とくらべて遊べます。`;
  const rikaido = siteCard({
    key: "rikaido",
    name: SISTER.rikaido.name,
    sub: "恋編",
    title: "わたしの恋愛観、どれだけ分かってる？",
    desc: "恋愛の2択だけ30問のクイズを作って送ると、友達や恋人があなたの恋愛観をどれだけ分かっているかが点数とランキングで出ます。",
    screen: { src: "rikaido-screen.webp", w: 360, h: 644 },
    results: [{ src: "rikaido-result.webp", alt: "リカイドの結果の画面（理解度 24/30）", w: 360, h: 301 }],
    links: [{ label: "リカイド 恋編で遊ぶ", href: SISTER.rikaido.url, ev: SISTER.rikaido.ev, primary: true }],
    accent: "#FF5C7A",
  });
  const nakamido = siteCard({
    key: "nakamido",
    name: SISTER.nakamidoRenai.name,
    sub: "恋愛偏差値・相性",
    title: "恋愛力は何点？ ふたりの相性は何%？",
    desc: "恋愛偏差値診断は20問で、恋愛の力を4つに分けて点数に。相性診断は、ふたりが同じ12問に答えるだけで相性を%で出します。",
    screen: { src: "nakamido-screen.webp", w: 360, h: 628 },
    results: [
      { src: "nakamido-renai.webp", alt: "ナカミドの恋愛偏差値診断の結果画像（62点）", w: 480, h: 252 },
      { src: "nakamido-aisho.webp", alt: "ナカミドの相性診断の結果画像（88%）", w: 480, h: 252 },
    ],
    links: [
      { label: "恋愛偏差値診断", href: SISTER.nakamidoRenai.url, ev: SISTER.nakamidoRenai.ev, primary: true },
      { label: "相性診断", href: SISTER.nakamidoAisho.url, ev: SISTER.nakamidoAisho.ev },
    ],
    accent: "#B5179E",
  });
  container.innerHTML = `<div class="ss ss--${place === "top" ? "top" : "result"} stack">
    <div class="stack stack-sm">
      <span class="eyebrow">あわせて遊ぶ</span>
      <h2 class="h2">作者のほかのサイト</h2>
      <p class="small muted">${esc(lead)}</p>
    </div>
    <div class="ss-list">${rikaido}${nakamido}</div>
  </div>`;
  container.querySelectorAll("a[data-ev]").forEach((a) => {
    a.addEventListener("click", () => track(a.dataset.ev, { place, site: a.dataset.site }));
  });
}
