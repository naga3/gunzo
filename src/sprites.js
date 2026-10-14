// 味方のドット絵（16x24）。文字の表で描き、右向きの絵を左右反転して使う。
// 基本の体（BASE）の上に、職ごとの絵（帽子・服・武器）を重ねる。'.' は透明、'_' は基本の絵を消す
// 色の文字:
//   o 輪郭  s 肌  S 肌の影  e 目  E 目の光
//   h 髪  H 髪の影  j 髪の光
//   c 服の色（人ごとに違う）  C その影  D その光
//   u U V 職の服（主・影・光）  p P ズボン（主・影）  g G 革（主・影）  l 革の光
//   m M n 金属（光・中・影）  w 白  y Y 金（主・光）  r R 赤（主・影）  x X z 職ごとの特別な色
export const W = 16
export const H = 24

const HEAD = [
  '................',
  '.....oooooo.....',
  '....ohhhhhho....',
  '...ohhhjjhhho...',
  '...ohhhhhhhho...',
  '...ohhhhsssso...',
  '...ohhssessso...',
  '...ohhsssssso...',
  '....oSsssssSo...',
  '.....oSSSSSo....',
]
const TORSO = [
  '....ocDccccco...',
  '..ococcDcccoco..',
  '..ococcccccoco..',
  '..osoccccCCoso..',
  '..oSocCCCCCoSo..',
  '....ogggyggo....',
  '....occccccCo...',
  '....ocCCccCCo...',
]
const LEGS_A = [
  '....oppppppo....',
  '....oppPoppo....',
  '....oppo.ppo....',
  '....ogGo.oggo...',
  '....oGGo.oGGo...',
  '....oooo.oooo...',
]
const LEGS_B = [
  '....oppppppo....',
  '...oppPoppo.....',
  '...oppo.oppo....',
  '..ogGo...oggo...',
  '..oGGo...oGGo...',
  '..oooo...oooo...',
]
export const BASE = { a: [...HEAD, ...TORSO, ...LEGS_A], b: [...HEAD, ...TORSO, ...LEGS_B] }


// 職ごとの絵。recolor: 基本の服の色を置きかえる。parts: [y, x, 文字列]（'.' はそのまま、'_' は消す）
// extra: その職だけの色（x X z）
const col = (y, x, ch, from, to) => { const out = []; for (let i = from; i <= to; i++) out.push([i, x, ch]); return out }

export const JOB_ART = {
  sword: {
    parts: [
      [2, 14, 'w'], ...col(0, 14, 'mM', 3, 11), [12, 13, 'yyy'], [13, 14, 'g'], [14, 14, 'G'],
      [4, 4, 'rrrrrrrr'], [10, 11, 'mM'],
    ],
  },
  spear: {
    recolor: { c: 'u', C: 'U', D: 'V' },
    extra: { u: 'bl3', U: 'bl2', V: 'bl4' },
    parts: [
      [0, 6, 'rrr'], [1, 5, 'oMmMo'], [2, 4, 'oMmmmMo'], [3, 3, 'oMmmmmmMo'], [4, 3, 'oMmmmmmMo'], [5, 4, 'MMMM'],
      [0, 14, 'w'], [1, 13, 'mwm'], [2, 14, 'M'], ...col(0, 14, 'g', 3, 21), [8, 13, 'r'], [9, 13, 'r'],
    ],
  },
  shield: {
    recolor: { c: 'M', C: 'n', D: 'm' },
    extra: { x: 'bl3', X: 'bl1', z: 'ye1' },
    parts: [
      [1, 5, 'onnnno'], [2, 4, 'onMMMMno'], [3, 3, 'onMmmMMMno'], [4, 3, 'onMMMMMMno'], [5, 4, 'nnnn'],
      [11, 0, 'oxxxXo'], [12, 0, 'oxxzXo'], [13, 0, 'oxzzXo'], [14, 0, 'oxxzXo'], [15, 0, 'oxxxXo'], [16, 1, 'oxxXo'], [17, 2, 'oXXo'], [18, 3, 'oo'],
      [10, 13, 'nnn'], [11, 13, 'nMn'], [12, 13, 'nnn'], [13, 14, 'g'], [14, 14, 'G'],
    ],
  },
  bow: {
    recolor: { c: 'u', C: 'U', D: 'V' },
    extra: { u: 'gr3', U: 'gr1', V: 'gr4' },
    parts: [
      [1, 5, 'oUUUUo'], [2, 4, 'oUuuuuUo'], [3, 3, 'oUuuuuuuUo'], [4, 3, 'oUuuuuuuUo'], [5, 4, 'UUuu'],
      [6, 14, 'g'], [7, 15, 'g'], ...col(0, 15, 'g', 8, 14), [15, 14, 'g'], ...col(0, 14, 'w', 7, 14),
      [8, 2, 'w'], [9, 2, 'G'], [10, 2, 'G'], [11, 2, 'g'], [12, 2, 'g'],
    ],
  },
  xbow: {
    recolor: { c: 'g', C: 'G', D: 'l' },
    parts: [
      [1, 5, 'oGGGGo'], [2, 4, 'oGlggGGo'], [3, 3, 'oGglgggGGo'], [4, 3, 'GGGGGGGGGGG'], 
      [13, 8, 'GggggggG'], [12, 14, 'w'], [14, 14, 'w'], [11, 15, 'G'], [12, 15, 'G'], [13, 15, 'm'], [14, 15, 'G'], [15, 15, 'G'],
    ],
  },
  axe: {
    recolor: { c: 's', C: 'S', D: 's' },
    parts: [
      [4, 4, 'rrrrrrrr'], [15, 5, 'wMwMwM'], [10, 5, 'gg'], [10, 9, 'gg'], [11, 6, 'g'], [11, 9, 'g'],
      [4, 13, 'mmM'], [5, 12, 'mmwM'], [6, 12, 'mmmM'], [7, 13, 'mmM'], ...col(0, 14, 'g', 8, 16),
    ],
  },
  boom: {
    recolor: { c: 'u', C: 'U', D: 'V' },
    extra: { u: 'tl2', U: 'tl1', V: 'tl3', x: 'gr3', X: 'gr1', z: 'ye2' },
    parts: [
      [0, 10, 'r'], [1, 11, 'r'], [2, 12, 'ry'],
      [1, 5, 'oXXXXo'], [2, 4, 'oXxxxxXo'], [3, 3, 'oXxxxxxxXo'], [4, 3, 'XXXXXXXXXXX'],
      [9, 14, 'yY'], [10, 13, 'yy'], [11, 13, 'y'], [12, 13, 'yy'], [13, 14, 'yY'],
    ],
  },
  mage: {
    recolor: { c: 'u', C: 'U', D: 'V' },
    extra: { u: 'pu2', U: 'pu1', V: 'pu3' },
    parts: [
      [0, 8, 'o'], [1, 7, 'oVo'], [2, 6, 'oUVUo'], [3, 2, 'oUUUUUUUUUUo'], [4, 3, 'oUUUUUUUUo'],
      ...col(18, 4, '_', 18, 20), [18, 4, 'ouuUuuuo'], [19, 3, 'ouuuUuuuuo'], [20, 3, 'oUUuuuUUuo'],
      [3, 13, 'RrR'], [4, 13, 'rwr'], [5, 13, 'RrR'], ...col(0, 14, 'g', 6, 20),
    ],
  },
  bomb: {
    recolor: {},
    parts: [
      [4, 4, 'GGGGGGGG'], [4, 6, 'yzzy'], [12, 5, 'gggggg'], [13, 5, 'gGggGg'], [14, 5, 'gggggg'],
      [8, 13, 'oo'], [9, 12, 'onMo'], [10, 12, 'onno'], [11, 13, 'oo'], [7, 14, 'g'], [6, 15, 'o'], [5, 15, 'Y'],
    ],
    extra: { z: 'bl4' },
  },
  volt: {
    recolor: { c: 'u', C: 'U', D: 'V', h: 'y', H: 'x', j: 'Y' },
    extra: { u: 'bl2', U: 'bl1', V: 'bl3', x: 'ye1' },
    parts: [
      [0, 5, 'y'], [0, 8, 'y'], [0, 10, 'y'], [1, 4, 'y'], [1, 11, 'y'],
      ...col(18, 4, '_', 18, 20), [18, 4, 'ouuUuuuo'], [19, 3, 'ouuuUuuuuo'], [20, 3, 'oUUuuuUUuo'],
      [11, 8, 'Y'], [12, 7, 'yY'], [13, 6, 'Yy'], [14, 7, 'Y'],
      [1, 14, 'Y'], [2, 13, 'y'], [3, 14, 'Y'], [4, 13, 'y'], [5, 14, 'Y'], ...col(0, 14, 'g', 6, 20),
    ],
  },
  heal: {
    recolor: { c: 'u', C: 'U', D: 'V' },
    extra: { u: 'gy6', U: 'gy4', V: 'white' },
    parts: [
      [1, 5, 'owVVwo'], [2, 4, 'oVwwwwVo'], [3, 3, 'oVwwwwwwVo'], [4, 3, 'owwwwwwwwo'], [5, 4, 'wwww'],
      [15, 5, 'cccccc'],
      ...col(18, 4, '_', 18, 20), [18, 4, 'owwUwwwo'], [19, 3, 'owwwUwwwwo'], [20, 3, 'oUUwwwUUwo'],
      [2, 13, 'yyy'], [3, 13, 'y.y'], [4, 13, 'yyy'], ...col(0, 14, 'g', 5, 20),
    ],
  },
}

// 絵を組み立てる：基本の体 → 色の置きかえ → 職の絵を重ねる
function compose(base, art) {
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

// 服・髪の色の濃淡（主・影・光）
const CLOTH_SH = { bl3: ['bl3', 'bl2', 'bl4'], rd3: ['rd3', 'rd2', 'rd4'], ye1: ['ye1', 'or1', 'ye2'], pu3: ['pu3', 'pu2', 'pu4'], tl2: ['tl2', 'tl1', 'tl3'], pk2: ['pk2', 'pk1', 'pk3'], or2: ['or2', 'or1', 'ye1'], gy6: ['gy6', 'gy4', 'white'] }
const HAIR_SH = { br1: ['br1', 'br0', 'br2'], br3: ['br3', 'br2', 'br4'], ye2: ['ye2', 'ye1', 'ye3'], ink: ['ink', 'black', 'gy2'], rd2: ['rd2', 'rd1', 'rd3'], gy5: ['gy5', 'gy4', 'gy6'] }
const FIXED = {
  o: 'ink', s: 'sk3', S: 'sk2', e: 'ink', E: 'white', p: 'br2', P: 'br1', g: 'br3', G: 'br1', l: 'br5',
  m: 'gy6', M: 'gy4', n: 'gy3', w: 'white', y: 'ye1', Y: 'ye3', r: 'rd3', R: 'rd1',
  u: 'bl2', U: 'bl1', V: 'bl3', x: 'or2', X: 'or1', z: 'tl2',
}
// 職・服の色・髪の色ごとの、文字 → パレット番号の表（一度作ったら使い回す）
const tableCache = new Map()
export function colorTable(job, cloth, hair, P) {
  const key = `${job}|${cloth}|${hair}`
  let t = tableCache.get(key)
  if (t) return t
  t = new Uint8Array(256).fill(255)
  const set = (ch, name) => { t[ch.charCodeAt(0)] = P[name] }
  for (const [ch, name] of Object.entries(FIXED)) set(ch, name)
  for (const [ch, name] of Object.entries(JOB_ART[job]?.extra ?? {})) set(ch, name)
  const cs = CLOTH_SH[cloth] ?? CLOTH_SH.bl3, hs = HAIR_SH[hair] ?? HAIR_SH.br3
  set('c', cs[0]); set('C', cs[1]); set('D', cs[2])
  set('h', hs[0]); set('H', hs[1]); set('j', hs[2])
  tableCache.set(key, t)
  return t
}
