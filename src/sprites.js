// 味方のドット絵（16x16）。文字の表で描き、右向きの絵を左右反転して使う。
// 向きごとの一枚絵（上下左右）を Pixel で描いた職は、そちらを使う（art/allies/<職>.pic → src/art.js。tools/pixel.mjs）
// 基本の体（BASE）の上に、職ごとの絵（帽子・服・武器）を重ねる。'.' は透明、'_' は基本の絵を消す
// 色の文字:
//   o 輪郭  s 肌  S 肌の影  e 目  E 目の光
//   h 髪  H 髪の影  j 髪の光
//   c 服の色  C その影  D その光
//   u U V 職の服（主・影・光）  p P ズボン（主・影）  g G 革（主・影）  l 革の光
//   m M n 金属（光・中・影）  w 白  y Y 金（主・光）  r R 赤（主・影）  x X z 職ごとの特別な色
import * as ART from './art.js' // tools/pixel.mjs が作る。作る途中（古い art.js）でも読めるように、名前ごとには取り出さない
export const ANIMS = Object.fromEntries(Object.entries(ART.DIR_ART ?? {}).map(([job, a]) => [job, a.anims ?? {}])) // 職 → 動き
export const DIR_ART = ART.DIR_ART ?? {}
export const W = 16
export const H = 16

// 頭 7 段、胴 5 段、足 4 段（16x16）
const HEAD = [
  '.....oooooo.....',
  '....ohhjhhho....',
  '....ohhhhsso....',
  '....ohhsesso....',
  '....ohssssso....',
  '.....oSssSo.....',
  '......oooo......',
]
const TORSO = [
  '.....ocDcco.....',
  '...ococcDcoco...',
  '...ococcccCoco..'.slice(0, 16),
  '...osogyggoso...',
  '.....occCco.....',
]
const LEGS_A = [
  '.....oppppo.....',
  '.....opPPpo.....',
  '.....oggggo.....',
  '.....oooooo.....',
]
const LEGS_B = [
  '.....oppppo.....',
  '....oppo.ppo....',
  '...oggo..oggo...',
  '...oooo..oooo...',
]
export const BASE = { a: [...HEAD, ...TORSO, ...LEGS_A], b: [...HEAD, ...TORSO, ...LEGS_B] }

// 職ごとの絵。recolor: 基本の服の色を置きかえる。parts: [y, x, 文字列]（'.' はそのまま、'_' は消す）
// extra: その職だけの色（u U V x X z）
const col = (x, ch, from, to) => { const out = []; for (let i = from; i <= to; i++) out.push([i, x, ch]); return out }
const ROBE = [[12, 4, 'ouuUuuuo'], [13, 3, 'ouuuUuuuuo']]
const ROBE_W = [[12, 4, 'owwUwwwo'], [13, 3, 'owwwUwwwwo']]

export const JOB_ART = {
  sword: {
    parts: [[1, 14, 'w'], ...col(14, 'm', 2, 8), ...col(15, 'M', 2, 8), [9, 13, 'yyy'], [10, 14, 'g'], [11, 14, 'G'], [2, 5, 'rrrrrr']],
  },
  shield: {
    recolor: { c: 'M', C: 'n', D: 'm' },
    extra: { x: 'bl3', X: 'bl1', z: 'ye1' },
    parts: [
      [0, 5, 'onnnno'], [1, 4, 'onMMMMno'], [2, 5, 'nnnn'],
      [7, 0, 'oooo'], [8, 0, 'oxxXo'], [9, 0, 'oxzXo'], [10, 0, 'oxzXo'], [11, 0, 'oxxXo'], [12, 1, 'oXXo'], [13, 2, 'oo'],
      [6, 13, 'nnn'], [7, 13, 'nMn'], [8, 13, 'nnn'], [9, 14, 'g'], [10, 14, 'G'],
    ],
  },
  bow: {
    recolor: { c: 'u', C: 'U', D: 'V' },
    extra: { u: 'gr3', U: 'gr1', V: 'gr4' },
    parts: [
      [0, 5, 'oUUUUo'], [1, 4, 'oUuuuuUo'], [2, 5, 'UUuu'],
      [2, 14, 'g'], [3, 15, 'g'], ...col(15, 'g', 4, 10), [11, 15, 'g'], [12, 14, 'g'], ...col(14, 'w', 3, 11),
      [6, 2, 'w'], [7, 2, 'G'], [8, 2, 'G'], [9, 2, 'g'],
    ],
  },
  boom: {
    recolor: { c: 'u', C: 'U', D: 'V' },
    extra: { u: 'tl2', U: 'tl1', V: 'tl3', x: 'gr3', X: 'gr1', z: 'ye2' },
    parts: [
      [0, 10, 'r'], [0, 11, 'ry'],
      [0, 5, 'oXXXXo'], [1, 4, 'oXxxxxXo'], [2, 4, 'XXXXXXXX'],
      [6, 14, 'yY'], [7, 13, 'yy'], [8, 13, 'y'], [9, 13, 'yy'], [10, 14, 'yY'],
    ],
  },
  hammer: { // ハンマー使い（仮の絵。ちゃんとした絵は Pixel の art/allies/hammer.pic で描く）: 茶色の革の服、肩に大きな鉄のハンマー
    recolor: { c: 'g', C: 'G', D: 'l' },
    parts: [
      [2, 5, 'rrrrrr'],
      [0, 10, 'oooooo'], [1, 10, 'oMmmMo'], [2, 10, 'oMmMMo'], [3, 10, 'oMMMno'], [4, 10, 'oooooo'], ...col(13, 'G', 5, 12),
    ],
  },
  thief: { // 盗賊（仮の絵。ちゃんとした絵は Pixel の art/allies/thief.pic で描く）: 濃い緑のフードと服、右手にナイフ
    recolor: { c: 'u', C: 'U', D: 'V' },
    extra: { u: 'gr1', U: 'gr0', V: 'gr2' },
    parts: [
      [1, 4, 'ouuVuuuo'], [2, 4, 'ouUuusso'], [3, 4, 'ouus'], [4, 4, 'ou'],
      [8, 14, 'w'], [9, 14, 'm'], [10, 13, 'gM'],
    ],
  },
  ice: { // 氷術師（仮の絵。ちゃんとした絵は Pixel の art/allies/ice.pic で描く）: 水色のとんがり帽子とローブ、氷の杖
    recolor: { c: 'u', C: 'U', D: 'V' },
    extra: { u: 'bl4', U: 'bl3', V: 'bl5' },
    parts: [
      [0, 7, 'oVo'], [1, 6, 'oUVUo'], [2, 3, 'oUUUUUUUUo'],
      ...ROBE,
      [1, 13, 'VwV'], [2, 13, 'wVw'], [3, 13, 'VwV'], ...col(14, 'g', 4, 13),
    ],
  },
  bomb: {
    extra: { z: 'bl4' },
    parts: [
      [2, 5, 'GGGGGG'], [2, 6, 'yzzy'], [8, 6, 'gggg'], [9, 6, 'gGgg'],
      [4, 13, 'oo'], [5, 12, 'onMo'], [6, 12, 'onno'], [7, 13, 'oo'], [3, 14, 'g'], [2, 15, 'o'], [1, 15, 'Y'],
    ],
  },
  volt: {
    recolor: { c: 'u', C: 'U', D: 'V', h: 'y', H: 'x', j: 'Y' },
    extra: { u: 'bl2', U: 'bl1', V: 'bl3', x: 'ye1' },
    parts: [
      [0, 5, 'y'], [0, 7, 'y'], [0, 9, 'y'],
      ...ROBE,
      [8, 7, 'Yy'], [9, 6, 'yY'],
      [1, 14, 'Y'], [2, 13, 'y'], [3, 14, 'Y'], ...col(14, 'g', 4, 13),
    ],
  },
  heal: {
    recolor: { c: 'u', C: 'U', D: 'V' },
    extra: { u: 'gy6', U: 'gy4', V: 'white' },
    parts: [
      [0, 5, 'owVVwo'], [1, 4, 'oVwwwwVo'], [2, 5, 'wwww'],
      [10, 6, 'cccc'],
      ...ROBE_W,
      [1, 13, 'yyy'], [2, 13, 'y.y'], [3, 13, 'yyy'], ...col(14, 'g', 4, 13),
    ],
  },
}

// 絵を組み立てる：基本の体 → 色の置きかえ → 職の絵を重ねる
export function compose(base, art) {
  const g = base.map((r) => [...r])
  if (art.recolor) for (const row of g) for (let x = 0; x < W; x++) if (art.recolor[row[x]]) row[x] = art.recolor[row[x]]
  for (const [y, x, str] of art.parts) {
    for (let i = 0; i < str.length; i++) {
      const ch = str[i]
      if (ch === '.' || x + i >= W || x + i < 0) continue
      g[y][x + i] = ch === '_' ? '.' : ch
    }
  }
  return g.map((r) => r.join(''))
}
export const SPRITES = {}
for (const [job, art] of Object.entries(JOB_ART)) SPRITES[job] = { a: compose(BASE.a, art), b: compose(BASE.b, art) }

// --- 描画用：文字の絵を、文字コードの配列にしておく ---
export const SPRITE_DATA = {}
for (const [job, fr] of Object.entries(SPRITES)) {
  SPRITE_DATA[job] = {}
  for (const k of ['a', 'b']) {
    const arr = new Uint8Array(W * H)
    fr[k].forEach((row, y) => [...row].forEach((ch, x) => { arr[y * W + x] = ch.charCodeAt(0) }))
    SPRITE_DATA[job][k] = arr
  }
}

// 向きごとの一枚絵（Pixel で描いたもの）。down・up・left・right と、動きのコマ（down_walk1 など）。描いていない向きは横向きで代える
export const DIR_DATA = {}
for (const [job, art] of Object.entries(DIR_ART)) {
  const toArr = (rows) => { const arr = new Uint8Array(W * H); rows.forEach((row, y) => [...row].forEach((ch, x) => { arr[y * W + x] = ch.charCodeAt(0) })); return arr }
  DIR_DATA[job] = {}
  for (const [d, rows] of Object.entries(art)) if (d !== 'colors' && d !== 'anims') DIR_DATA[job][d] = toArr(rows)
}

// 文字 → 色の名前（パレット）。人ごとに色を変える仕組みは無い（2026-10-17 にやめた。色の違いは絵のデータとして作る）
// Pixel で描いた職（DIR_ART）は、その絵のファイルの color の行がすべて。ほかの職（文字の表の絵）は、この決まった色
const FIXED = {
  o: 'ink', s: 'sk3', S: 'sk2', e: 'ink', E: 'white', p: 'br2', P: 'br1', g: 'br3', G: 'br1', l: 'br5',
  m: 'gy6', M: 'gy4', n: 'gy3', w: 'white', y: 'ye1', Y: 'ye3', r: 'rd3', R: 'rd1',
  u: 'bl2', U: 'bl1', V: 'bl3', x: 'or2', X: 'or1', z: 'tl2',
  c: 'bl3', C: 'bl2', D: 'bl4', h: 'br3', H: 'br2', j: 'br4',
}
// 職ごとの、文字 → 色の名前
export function roleNames(job) {
  return { ...FIXED, ...(JOB_ART[job]?.extra ?? {}), ...(DIR_ART[job]?.colors ?? {}) }
}
// 職ごとの、文字 → パレット番号の表（一度作ったら使い回す）
const tableCache = new Map()
export function colorTable(job, P) {
  let t = tableCache.get(job)
  if (t) return t
  t = new Uint8Array(256).fill(255)
  for (const [ch, name] of Object.entries(roleNames(job))) t[ch.charCodeAt(0)] = P[name]
  tableCache.set(job, t)
  return t
}
