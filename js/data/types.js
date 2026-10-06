// 結果のタイプ（中身担当）
// 決まり（CONTRACT.md §4-3）
//   - id は英数字の小文字（URL に使う）。公開後に変えない
//   - 範囲は両端を含む。どの値の組み合わせでも必ずどれか1つに当たる（tools/test/content-check.mjs で確かめる）
//   - 名前は決めつけない・悪口にしない。絵文字は使わない
//   - color はタイプの色（白い文字を載せてコントラスト 4.5:1 以上）
//   - art は Codex に渡す絵の説明（英語・性格や小物だけ。画風と文字は書かない）
//
// 境目の数字は「分布の試し」（docs/content.md）で、どのタイプも 2〜20% に入るように決めた
// 説明の文は、そのタイプに入りうる答えの数（アウト・モヤる・セーフ）を全部数えて、外れないように書いた（docs/content.md）

// ---- 浮気ライン 12タイプ ----
// 許せる度の帯（4段）: 0〜34 / 35〜49 / 50〜64 / 65〜100
// モヤる率の段（3段）: 帯ごとに少し変える（真ん中の帯はモヤるを選ぶ人が多いため）
//   0〜34 と 65〜100: 0〜30（モヤるが9問まで）/ 31〜42（10〜12問）/ 43〜100（13問以上）
//   35〜49 と 50〜64: 0〜34（10問まで）/ 35〜44（11〜13問）/ 45〜100（14問以上）
export const LINE_TYPES = [
  {
    id: "a1", band: [0, 34], gray: [0, 30],
    name: "一途なペンギン",
    catch: "白黒くっきり、愛はまっすぐ",
    desc: "恋人の「特別」は自分だけのもの、という線がくっきりしているタイプ。アウトとセーフの区切りに迷いが少なく、何がダメなのかを言葉にできます。その分かりやすさが、ふたりの安心につながります。",
    good: "ルールがシンプルで分かりやすく、相手が迷わずにすむ",
    tip: "ダメなことは先に言うね。それ以外は信じてる",
    color: "#1E3A6E",
    art: "A small penguin standing upright on an ice floe, wearing a neat bow tie, holding one red heart close to its chest with both flippers, a single bold straight line drawn in the snow in front of its feet, determined but warm expression",
  },
  {
    id: "a2", band: [0, 34], gray: [31, 42],
    name: "寄りそうハクチョウ",
    catch: "ふたりの時間を大切に守る",
    desc: "恋人とのふたりの時間を、なにより大切にしたいタイプ。アウトにする行動は多めですが、場面によっては「モヤる」で受けとめる柔らかさもあります。",
    good: "関係をていねいに育てられる。相手の事情にも耳を傾けられる",
    tip: "誰と会うか教えてくれたら、それだけで安心できるよ",
    color: "#3A3F8F",
    art: "A graceful white swan floating on a calm lake at sunset, gently sheltering a small glowing heart under one wing, a soft ribbon on the water forming a circle around it",
  },
  {
    id: "a3", band: [0, 34], gray: [43, 100],
    name: "気づき上手のハリネズミ",
    catch: "小さな変化も見のがさない",
    desc: "恋人の小さな変化や、ほかの人との距離の近さによく気づくタイプ。「モヤる」が多く、まったく平気と言える行動は少なめです。その気づく力は、相手を大切に思っている証拠です。",
    good: "相手の気持ちの変化にもすぐ気づけるやさしさ",
    tip: "モヤっとしたら小さいうちに話すね。聞いてくれるとうれしい",
    color: "#6A3D8C",
    art: "A small hedgehog holding a magnifying glass, carefully examining a faint dotted line on the ground, a few small autumn leaves drifting around, attentive and gentle expression",
  },
  {
    id: "b1", band: [35, 49], gray: [0, 34],
    name: "約束を守るシバイヌ",
    catch: "迷わず線を引ける人",
    desc: "アウトとセーフを、あまり迷わずに分けるタイプ。大事なところは譲らず、そのぶん「ここまではいい」という線もはっきりしています。",
    good: "筋が通っていてブレない。信頼の土台をつくれる",
    tip: "ここだけは守ってほしい、を一緒に決めておこう",
    color: "#34495E",
    art: "A loyal shiba inu sitting upright beside a small rope fence with a single open gate, holding a small scroll tied with a red ribbon in its mouth, under a crescent moon, faithful and dependable expression",
  },
  {
    id: "b2", band: [35, 49], gray: [35, 44],
    name: "見守りフクロウ",
    catch: "よく見て、よく考える人",
    desc: "行動そのものより、そのときの理由や空気を見て判断するタイプ。厳しすぎず甘すぎず、ちょうどいい距離から恋人を見守っています。",
    good: "感情だけで決めつけない。話し合いがしやすい",
    tip: "理由を聞かせてくれたら、たいていのことは分かるよ",
    color: "#6B4F2A",
    art: "A round owl perched on a tree branch at dusk, wearing small round glasses, holding a small lantern and looking down at a winding path marked with a soft dashed line",
  },
  {
    id: "b3", band: [35, 49], gray: [45, 100],
    name: "ヤキモチうさぎ",
    catch: "言わないけど、ちょっと気にする",
    desc: "浮気だと責めるほどではないけれど、心の中ではちょっと気にしていることが多いタイプ。「モヤる」がたくさんあるのは、それだけ相手のことを考えている証拠です。",
    good: "相手を責めずに、自分の気持ちと向き合える",
    tip: "ちょっとだけヤキモチ焼いてた、って言ってもいい？",
    color: "#9C3D3D",
    art: "A small white rabbit hugging a big round toasted rice cake that is puffing up like a balloon, cheeks slightly puffed, glancing sideways, shy and cute expression",
  },
  {
    id: "c1", band: [50, 64], gray: [0, 34],
    name: "さっぱりイルカ",
    catch: "ダメはダメ、いいはいい",
    desc: "アウトかセーフか、白黒をはっきりつけるタイプ。アウトとセーフは同じくらいで、迷いの少ない、風通しのいい線引きです。",
    good: "相手を縛らない。気持ちの切りかえも早い",
    tip: "ここからはダメ、を決めておこう。あとは信じてる",
    color: "#0E6672",
    art: "A cheerful dolphin leaping out of sparkling blue water, a single bright buoy line floating on the surface behind it, open sky, light and breezy mood",
  },
  {
    id: "c2", band: [50, 64], gray: [35, 44],
    name: "ほどよいラッコ",
    catch: "信じて、ほどよく見守る",
    desc: "アウト・モヤる・セーフを、ほどよく使い分けるタイプ。信じて任せつつ、気になることには少しモヤっとします。近すぎず遠すぎない、ちょうどいい距離感を知っています。",
    good: "バランス感覚がよく、どんな相手ともうまくやれる",
    tip: "信じてるよ。でも、たまには話を聞かせてね",
    color: "#2E6B4A",
    art: "A sea otter floating on its back in calm water, holding a smooth round stone on its belly, a loose kelp ribbon drifting nearby, relaxed and content expression",
  },
  {
    id: "c3", band: [50, 64], gray: [45, 100],
    name: "すまし顔のネコ",
    catch: "許すけど、実は気にしてる",
    desc: "アウトは少なめだけれど、「モヤる」は多めのタイプ。平気な顔で許しつつ、心の中ではちゃんと気にしています。その本音を少し見せると、もっと仲よくなれます。",
    good: "相手の自由を大事にできる、大人っぽい余裕",
    tip: "平気なふりしてたけど、本当はちょっと気になってた",
    color: "#8A4A12",
    art: "A sleek cat sitting with a composed face on a windowsill, tail curled neatly around its paws, secretly glancing sideways at a ball of yarn with a slightly tangled thread",
  },
  {
    id: "d1", band: [65, 100], gray: [0, 30],
    name: "おおらかなクジラ",
    catch: "海みたいに広い心",
    desc: "多くのことをセーフと言える、心の広いタイプ。線を引くときも迷いが少なく、はっきり決められます。恋人を信じる力が強い人です。",
    good: "相手を信じて任せられる。一緒にいて気がラク",
    tip: "あなたのこと、信じてるからね",
    color: "#1D5C94",
    art: "A huge gentle whale swimming in a wide open ocean, a tiny boat with a heart-shaped sail riding safely on its back, a far-away horizon line",
  },
  {
    id: "d2", band: [65, 100], gray: [31, 42],
    name: "自由なツバメ",
    catch: "信じて空を広くする",
    desc: "恋人には自由でいてほしいタイプ。セーフが多く、気になることがあっても少しモヤっとする程度。おたがいの世界を大切にできます。",
    good: "相手の友達づきあいや趣味を大事にできる",
    tip: "おたがい好きなことして、また会おうね",
    color: "#4E6A14",
    art: "A swallow flying freely across a wide blue sky, carrying a light ribbon in its beak, a few small clouds, a feeling of freedom and lightness",
  },
  {
    id: "d3", band: [65, 100], gray: [43, 100],
    name: "受けとめカピバラ",
    catch: "モヤっとも丸ごと受けとめる",
    desc: "アウトは少なく、「モヤる」があっても受けとめてしまうタイプ。おおらかさの中に、ちゃんと繊細な気持ちも持っています。たまには本音を言葉にすると、もっとラクになります。",
    good: "どんな相手でも包みこむ、ふところの深さ",
    tip: "嫌なときは嫌って言うね。言えたらほめてね",
    color: "#7B4F6B",
    art: "A capybara relaxing in a warm hot spring with a small citrus fruit on its head, a little bird, a frog and a duckling resting comfortably around it",
  },
];

// ---- 本音ライン 6タイプ ----
// special（「気になる人にだけ」の割合 %）: 37〜100（11問以上）/ 20〜36（6〜10問）/ 0〜19（5問まで）
// open（ひらき度 0〜100）: special の段ごとに境目を変える（35 / 53 / 72）
export const FEEL_TYPES = [
  {
    id: "f1", special: [37, 100], open: [0, 35],
    name: "本命スポットライト",
    catch: "特別な人だけを照らす",
    desc: "好きな人にしかしないことが、はっきり多いタイプ。ほかの人とは友達としての距離を守るので、あなたの「特別扱い」は分かりやすい本気のサインです。",
    good: "好意が伝わりやすく、誤解されにくい",
    tip: "これをするのは、あなただからだよ",
    color: "#5B2C83",
    art: "A single bright stage spotlight shining down on one small glowing heart in the middle of an empty stage, heavy curtains on both sides, the rest of the stage softly dim",
  },
  {
    id: "f2", special: [37, 100], open: [36, 100],
    name: "メリハリの灯台",
    catch: "本命には強い光を一本",
    desc: "好きな人にしかしないことがはっきりある一方で、それ以外は友達や、ときには誰とでもできるタイプ。特別と普通の切りかえがはっきりしています。",
    good: "みんなと仲よくしながら、本命を大事にできる",
    tip: "誰とでも話すけど、特別はあなただけ",
    color: "#1B4F72",
    art: "A tall lighthouse on a rocky shore at twilight, its one strong beam lighting up a single window of a small house across the bay, while a softer warm glow spreads over the other houses along the shore",
  },
  {
    id: "f3", special: [20, 36], open: [0, 53],
    name: "ぬくもりのキャンドル",
    catch: "近くの人をそっと温める",
    desc: "誰とでもとはいかないけれど、仲よくなった相手にはやさしいタイプ。「友達ならする」がよく出てきます。好きな人への特別も、いくつかちゃんと取ってあります。",
    good: "信頼できる相手を大事にする。関係が長続きしやすい",
    tip: "仲のいい友達もいるけど、特別な席はあなたのもの",
    color: "#94430E",
    art: "A small lit candle in a ceramic holder on a wooden table, two cups of warm tea beside it, the soft glow reaching only the nearby objects",
  },
  {
    id: "f4", special: [20, 36], open: [54, 100],
    name: "おすそわけランタン",
    catch: "明るさをみんなに分ける",
    desc: "気になる人への特別もありつつ、誰とでも気軽にすることも多いタイプ。人との距離が近く、まわりを明るくします。好意のサインは少し見えにくいかもしれません。",
    good: "人見知りせず、どこでも打ちとけられる",
    tip: "みんなと仲よくしても、帰る場所はあなた",
    color: "#0F6B5E",
    art: "A glowing paper lantern hanging from a string among a cluster of smaller lanterns at a night festival, sharing its warm light with all of them",
  },
  {
    id: "f5", special: [0, 19], open: [0, 72],
    name: "仲間思いのたき火",
    catch: "友達との輪をあたためる",
    desc: "「気になる人にだけ」と答えたことが少なく、仲のいい友達になら何でもできるタイプ。友情と恋の境目がゆるやかなので、恋のサインは言葉で伝えるのがおすすめです。",
    good: "友達を心から大切にできる",
    tip: "好きって気持ちは、ちゃんと言葉で伝えるね",
    color: "#A3342A",
    art: "A crackling campfire in a forest clearing at night, several empty camp chairs arranged in a circle around it, marshmallows on sticks leaning on a log",
  },
  {
    id: "f6", special: [0, 19], open: [73, 100],
    name: "みんなの太陽",
    catch: "誰にでも同じように明るい",
    desc: "相手をあまり選ばず、誰とでも同じように接するタイプ。分けへだてのなさが魅力ですが、好きな人には「特別」が伝わりにくいこともあります。",
    good: "誰にでも公平でやさしい",
    tip: "あなたにだけの特別、ひとつ決めておこうか",
    color: "#8A6100",
    art: "A bright smiling sun over a wide meadow full of many different flowers all facing it, warm rays spreading evenly in every direction",
  },
];

// ---- 浮気ラインと本音のズレ（自分に甘い度 0〜100）の5段 ----
// 自分に甘い度 = 恋人がしたら許せないことを、自分はもっと気軽にする度合い（式は engine.js の compareLineFeel）
//   段は自分に甘い度だけで引く（CONTRACT §5-3）。相手に寛大度（恋人には自分より広く許す）はここでは見ないので、
//   文は「恋人にダメと言うことを、自分がするか」だけを言う（「ほぼ同じ」のように両方向を言い切らない）
export const GAP_LEVELS = [
  { max: 8, name: "自分にも甘くない", desc: "恋人にダメと言うことを、自分はほとんどしていません。相手に求めることは、自分でも守れる人です。" },
  { max: 15, name: "ほんの少し自分にやさしい", desc: "恋人にはダメなのに自分はすること、が少しだけあります。誰にでもあるくらいの、自分へのやさしさです。" },
  { max: 23, name: "自分にはちょっと甘め", desc: "恋人がしたら引っかかるのに、自分はもっと気軽にすることがいくつかあります。どこがズレたか、下の一覧で見てみましょう。" },
  { max: 33, name: "自分のことは別腹", desc: "恋人にはしてほしくないのに、自分は気軽にしていることが多め。逆の立場で考えると、新しい発見があるかもしれません。" },
  { max: 100, name: "ものさしが2本ある", desc: "恋人用と自分用で、ものさしがかなり違います。どちらに合わせるか、恋人と話してみるのがおすすめです。" },
];
