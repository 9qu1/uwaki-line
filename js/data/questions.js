// 30問・カテゴリ・選択肢（中身担当）
// 決まり（CONTRACT.md §4-1）
//   - ちょうど30問。並び順は公開後に変えない（答えは並び順の数字の列で保存するため）
//   - text の {X} は相手の呼び方に置きかえる（既定「異性」。「同性」「誰か」も選べる）
//   - h は行動の重さ 1〜5（1＝ほとんどの人が気にしない、5＝多くの人がアウトと言う）。点の重みに使う（engine.js）
//   - どの問題も「本音ライン」の3択（気になる人にだけ／友達ならする／誰とでもする）で答えられる文にする
//     ふだんしないことも「するとしたら」で答えてもらう（MODE_PROMPTS・MODE_HINTS）
//   - 性的な行為・お酒の場面は入れない（小中高生も遊ぶ）。学生にも大人にも場面がある文にする。1問は全角34字以内
//   - 参考に見せてもらったシートの文・並びは使わない（research/source-sheet-DO-NOT-COPY.md）
//   - 確かめ方: node tools/test/content-check.mjs

export const QUESTIONS = [
  { id: "q01", text: "{X}とハイタッチして喜び合う", cat: "near", h: 1 },
  { id: "q02", text: "{X}をインスタの「親しい友達」に入れる", cat: "sns", h: 2 },
  { id: "q03", text: "{X}と二人でカフェにこもって勉強や作業をする", cat: "meet", h: 2 },
  { id: "q04", text: "{X}とのトークをピン留めする", cat: "talk", h: 3 },
  { id: "q05", text: "{X}に誕生日のお祝いを0時ちょうどに送る", cat: "care", h: 3 },
  { id: "q06", text: "{X}と同じペットボトルを回し飲みする", cat: "near", h: 3 },
  { id: "q07", text: "{X}と二人で推しのライブに行く", cat: "meet", h: 3 },
  { id: "q08", text: "{X}とスマホの位置情報を共有し合う", cat: "sns", h: 4 },
  { id: "q09", text: "{X}とゲームのボイスチャットで夜中まで話す", cat: "talk", h: 3 },
  { id: "q10", text: "{X}の好きなお菓子を覚えて買っておく", cat: "care", h: 2 },
  { id: "q11", text: "{X}の運転する車の助手席に乗る", cat: "meet", h: 3 },
  { id: "q12", text: "{X}の服についたゴミを取ってあげる", cat: "near", h: 1 },
  { id: "q13", text: "{X}からの連絡には何をしていてもすぐ返す", cat: "talk", h: 2 },
  { id: "q14", text: "部活や残業でがんばる{X}に飲み物を差し入れる", cat: "care", h: 2 },
  { id: "q15", text: "{X}の昔の投稿までさかのぼって全部見る", cat: "sns", h: 3 },
  { id: "q16", text: "雨の日に{X}と相合傘で帰る", cat: "near", h: 3 },
  { id: "q17", text: "{X}の家に一人で遊びに行く", cat: "meet", h: 4 },
  { id: "q18", text: "{X}に今日の服の自撮りを送る", cat: "talk", h: 3 },
  { id: "q19", text: "{X}が風邪をひいたら家まで食べ物を届ける", cat: "care", h: 3 },
  { id: "q20", text: "{X}の投稿の通知をオンにする", cat: "sns", h: 2 },
  { id: "q21", text: "{X}の頭をぽんぽんする", cat: "near", h: 4 },
  { id: "q22", text: "打ち上げから{X}と二人でこっそり抜け出す", cat: "meet", h: 5 },
  { id: "q23", text: "{X}に進路や仕事の悩みを打ち明ける", cat: "talk", h: 2 },
  { id: "q24", text: "{X}の分までお弁当を作って渡す", cat: "care", h: 4 },
  { id: "q25", text: "身近な{X}の写真をスマホの待ち受けにする", cat: "sns", h: 4 },
  { id: "q26", text: "{X}と通話をつないだまま寝落ちする", cat: "talk", h: 4 },
  { id: "q27", text: "{X}に身につけるアクセサリーを贈る", cat: "care", h: 4 },
  { id: "q28", text: "{X}とSNSのアイコンをペアにする", cat: "sns", h: 4 },
  { id: "q29", text: "{X}と二人で日帰り旅行に行く", cat: "meet", h: 5 },
  { id: "q30", text: "{X}と手をつないで歩く", cat: "near", h: 5 },
];

// 相手の呼び方（遊ぶ前に選ぶ。既定は「異性」）。label がそのまま問題文の {X} に入る
//   「誰か」は性別を決めない言い方（浮気ラインでも本音ラインでも自然に読めるように）
export const PARTNER_WORDS = [
  { id: "i", label: "異性" },
  { id: "d", label: "同性" },
  { id: "o", label: "誰か" },
];
// 呼び方を選ぶところに小さく添える文（浮気ラインは恋人から見て、本音ラインは自分から見て、になるため）
export const WORD_NOTE = "異性・同性は、その行動をする人から見て";

// 遊ぶ画面の問いかけ（問題文の上に出す）と、遊ぶ前の説明に添える1行
export const MODE_PROMPTS = {
  line: "恋人が、これをしたら？",
  feel: "あなたがするとしたら、相手は？",
};
export const MODE_HINTS = {
  line: "恋人がいない人は、未来の恋人がしたらと考えてね",
  feel: "ふだんしないことは「するとしたら」で考えてね",
};

// カテゴリ（5つ・各6問）。short は結果のカテゴリ別の線に出す短い名前
export const CATEGORIES = [
  { id: "meet", label: "ふたりで会う", short: "会う" },
  { id: "talk", label: "連絡・通話", short: "連絡" },
  { id: "sns", label: "SNS・スマホ", short: "SNS" },
  { id: "care", label: "気づかい・贈りもの", short: "気づかい" },
  { id: "near", label: "距離の近さ", short: "近さ" },
];

// 浮気ラインの3択（値 0・1・2 は固定）
export const LINE_CHOICES = [
  { v: 0, key: "out", label: "アウト", sub: "浮気だと思う" },
  { v: 1, key: "moya", label: "モヤる", sub: "浮気とは言わないけど引っかかる" },
  { v: 2, key: "safe", label: "セーフ", sub: "ぜんぜん平気" },
];

// 本音ラインの3択（値 0・1・2 は固定。0 が「特別な意味がある」側で浮気ラインの 0 とそろう）
export const FEEL_CHOICES = [
  { v: 0, key: "only", label: "気になる人にだけ", sub: "好きな相手にしかしない" },
  { v: 1, key: "friend", label: "友達ならする", sub: "仲がよければする" },
  { v: 2, key: "anyone", label: "誰とでもする", sub: "相手は気にしない" },
];
