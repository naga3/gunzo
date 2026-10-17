// 敵とボスのドット絵。小さい敵は、形を塗ってから輪郭を自動でつける。人型の敵は、味方の体（BASE）に服・武器を重ねる
// 色の文字: b l B = その敵の主・光・影（data.js の col）、o 輪郭、w 白、e 目、r 赤、y Y 金、g G 革、m M n 金属、x X その敵だけの色、s S 肌
import { BASE, compose } from './sprites.js'
import { ENEMIES } from './data.js'
import * as ART from './art.js' // Pixel で描いた敵（art/enemies/*.pic → src/art.js の ENEMY_PIC）。あれば、プログラムの絵の代わりに使う
const PIC = ART.ENEMY_PIC ?? {}

// --- 塗る道具 ---
const mk = (w, h) => Array.from({ length: h }, () => Array(w).fill('.'))
const px = (g, x, y, c) => { x = Math.round(x); y = Math.round(y); if (y >= 0 && y < g.length && x >= 0 && x < g[0].length) g[y][x] = c }
const rect = (g, x, y, w, h, c) => { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) px(g, x + i, y + j, c) }
// だ円（左上を明るく、右下を暗く）
function ell(g, cx, cy, rx, ry, base = 'b', dark = 'B', light = 'l') {
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      const nx = (x - cx) / rx, ny = (y - cy) / ry
      if (nx * nx + ny * ny > 1) continue
      const s = nx * 0.7 + ny * 0.9
      px(g, x, y, s > 0.5 ? dark : s < -0.55 ? light : base)
    }
  }
}
// 多角形（偶奇で塗る）
function poly(g, pts, c) {
  const ys = pts.map((p) => p[1])
  for (let y = Math.floor(Math.min(...ys)); y <= Math.ceil(Math.max(...ys)); y++) {
    const xs = []
    for (let i = 0; i < pts.length; i++) {
      const [x1, y1] = pts[i], [x2, y2] = pts[(i + 1) % pts.length]
      if ((y1 <= y + 0.5 && y2 > y + 0.5) || (y2 <= y + 0.5 && y1 > y + 0.5)) xs.push(x1 + ((y + 0.5 - y1) / (y2 - y1)) * (x2 - x1))
    }
    xs.sort((a, b) => a - b)
    for (let i = 0; i + 1 < xs.length; i += 2) for (let x = Math.round(xs[i]); x < Math.round(xs[i + 1]); x++) px(g, x, y, c)
  }
}
// 周りに輪郭（o）をつける
function outline(g) {
  const h = g.length, w = g[0].length
  const out = g.map((r) => [...r])
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (g[y][x] !== '.') continue
      const n = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => { const c = g[y + dy]?.[x + dx]; return c && c !== '.' && c !== 'o' })
      if (n) out[y][x] = 'o'
    }
  }
  return out
}
const rows = (g) => g.map((r) => r.join(''))

// --- スライム ---
function blob(f) {
  const g = mk(16, 12)
  if (f === 0) { ell(g, 8, 6.5, 6, 5) } else { ell(g, 8, 7.5, 7, 4) }
  const ey = f === 0 ? 5 : 6
  px(g, 5, ey, 'e'); px(g, 10, ey, 'e'); px(g, 5, ey - 1, 'w'); px(g, 10, ey - 1, 'w')
  px(g, 7, ey + 2, 'o'); px(g, 8, ey + 2, 'o')
  return rows(outline(g))
}

// --- コウモリ（big は大きい）---
function bat(f, big) {
  const W = big ? 24 : 16, H = big ? 16 : 12
  const g = mk(W, H)
  const cx = W / 2 - 0.5
  const up = f === 0
  const wy = up ? 1 : H - 4
  // 羽（膜）
  const span = big ? 11 : 7
  poly(g, [[cx - 1, H / 2], [cx - span, wy], [cx - span + 2, wy + 3], [cx - span / 2, H / 2 + 2], [cx - 1, H / 2 + 2]], 'B')
  poly(g, [[cx + 1, H / 2], [cx + span, wy], [cx + span - 2, wy + 3], [cx + span / 2, H / 2 + 2], [cx + 1, H / 2 + 2]], 'B')
  for (let i = 0; i < span; i += 2) { px(g, cx - 1 - i, up ? H / 2 - i * 0.55 + 1 : H / 2 + i * 0.45, 'l'); px(g, cx + 1 + i, up ? H / 2 - i * 0.55 + 1 : H / 2 + i * 0.45, 'l') }
  // 体と頭
  ell(g, cx, H / 2 + 1, big ? 3.5 : 2.5, big ? 4.5 : 3.5)
  ell(g, cx, H / 2 - 2, big ? 3 : 2.2, big ? 2.6 : 2)
  px(g, cx - (big ? 3 : 2), H / 2 - 4, 'b'); px(g, cx + (big ? 3 : 2), H / 2 - 4, 'b')
  px(g, cx - 1, H / 2 - 2, 'r'); px(g, cx + 1, H / 2 - 2, 'r')
  if (big) { px(g, cx - 3, H / 2 - 5, 'w'); px(g, cx + 3, H / 2 - 5, 'w'); px(g, cx, H / 2 + 1, 'r') }
  return rows(outline(g))
}

// --- けもの（横向き、右向き）---
function boar(f) {
  const g = mk(20, 14)
  ell(g, 9, 7, 7, 4.5); ell(g, 16, 7, 3.2, 3)
  rect(g, 4 + f, 10, 2, 3, 'B'); rect(g, 7 - f, 10, 2, 3, 'B'); rect(g, 11 + f, 10, 2, 3, 'B'); rect(g, 14 - f, 10, 2, 3, 'B')
  px(g, 18, 8, 'B'); px(g, 19, 8, 'B'); px(g, 17, 9, 'w'); px(g, 18, 10, 'w') // 鼻・牙
  px(g, 16, 5, 'e')
  for (let i = 0; i < 4; i++) px(g, 6 + i * 2, 3 - (i & 1), 'B') // 背のたてがみ
  px(g, 2, 6, 'B'); px(g, 1, 5, 'B')
  return rows(outline(g))
}
function wolf(f) {
  const g = mk(20, 14)
  ell(g, 9, 7, 6.5, 3.8); ell(g, 16, 5.5, 3, 2.6)
  poly(g, [[14, 3], [15, 0], [16, 3]], 'b'); poly(g, [[16, 3], [17.5, 0], [18, 4]], 'B') // 耳
  rect(g, 4 + f, 9, 2, 4, 'B'); rect(g, 7 - f, 9, 2, 4, 'b'); rect(g, 12 + f, 9, 2, 4, 'b'); rect(g, 14 - f, 9, 2, 4, 'B')
  poly(g, [[3, 5], [0, 2], [0, 5], [2, 8]], 'b') // しっぽ
  px(g, 17, 5, 'e'); px(g, 19, 7, 'B'); px(g, 18, 8, 'w')
  px(g, 8, 9, 'l'); px(g, 9, 9, 'l'); px(g, 10, 9, 'l')
  return rows(outline(g))
}
function scorpion(f) {
  const g = mk(22, 14)
  ell(g, 10, 9, 6, 3)
  // しっぽ（左から上へ曲がって、針）
  for (const [x, y] of [[4, 8], [2, 7], [1, 5], [1, 3], [2, 1], [4, 0]]) { rect(g, x, y, 2, 2, 'b') }
  px(g, 5, 1, 'r'); px(g, 6, 2, 'r')
  // はさみ
  ell(g, 17, 6, 2.4, 2); ell(g, 19, 9, 2.2, 1.8)
  poly(g, [[18, 3.5], [21, 5], [18, 6]], 'l')
  // 足
  for (let i = 0; i < 3; i++) { px(g, 6 + i * 3 + f, 12, 'B'); px(g, 6 + i * 3 + f, 13, 'B') }
  px(g, 14, 8, 'e'); px(g, 15, 8, 'e')
  return rows(outline(g))
}

// --- 大きい敵（24x24）---
function yeti(f) {
  const g = mk(26, 26)
  rect(g, 6, 20, 5, 5, 'b'); rect(g, 15, 20, 5, 5, 'b')
  rect(g, 6 + f, 22, 5, 3, 'B'); rect(g, 15 - f, 22, 5, 3, 'B')
  ell(g, 13, 14, 9, 8)
  ell(g, 3.5, 14, 3.2, 7, 'b', 'B', 'l'); ell(g, 22.5, 14, 3.2, 7, 'b', 'B', 'l') // 腕
  rect(g, 1, 19, 5, 3, 'x'); rect(g, 20, 19, 5, 3, 'x') // 手
  ell(g, 13, 7, 6, 5)
  ell(g, 13, 8, 4, 3, 'x', 'x', 'x') // 顔
  px(g, 11, 7, 'e'); px(g, 15, 7, 'e'); px(g, 11, 6, 'w'); px(g, 15, 6, 'w')
  rect(g, 11, 10, 5, 2, 'r'); px(g, 11, 10, 'w'); px(g, 15, 10, 'w')
  for (const [x, y] of [[8, 13], [12, 16], [17, 13], [10, 18], [16, 18]]) { px(g, x, y, 'l'); px(g, x + 1, y, 'l') }
  px(g, 8, 3, 'b'); px(g, 18, 3, 'b'); px(g, 7, 2, 'l'); px(g, 19, 2, 'l')
  return rows(outline(g))
}
function golem(f) {
  const g = mk(26, 26)
  rect(g, 5, 17, 6, 8, 'B'); rect(g, 15, 17, 6, 8, 'B'); rect(g, 5, 17, 6, 2, 'b'); rect(g, 15, 17, 6, 2, 'b')
  if (f) { rect(g, 5, 23, 6, 2, 'b'); rect(g, 15, 22, 6, 3, 'B') }
  rect(g, 4, 6, 18, 12, 'b'); rect(g, 4, 6, 18, 2, 'l'); rect(g, 4, 15, 18, 3, 'B')
  rect(g, 0, 7, 5, 12, 'b'); rect(g, 21, 7, 5, 12, 'b'); rect(g, 0, 7, 5, 2, 'l'); rect(g, 21, 7, 5, 2, 'l')
  rect(g, 0, 17, 5, 3, 'B'); rect(g, 21, 17, 5, 3, 'B')
  rect(g, 8, 0, 10, 7, 'b'); rect(g, 8, 0, 10, 2, 'l'); rect(g, 8, 5, 10, 2, 'B')
  // ひび割れ（光る）
  for (const [x, y] of [[7, 9], [8, 10], [9, 11], [9, 12], [16, 8], [17, 9], [17, 10], [18, 11], [12, 13], [13, 14], [13, 15], [2, 12], [3, 13], [23, 13], [22, 14]]) px(g, x, y, 'x')
  rect(g, 10, 3, 2, 2, 'Y'); rect(g, 14, 3, 2, 2, 'Y')
  rect(g, 11, 6, 4, 1, 'o')
  return rows(outline(g))
}
function treant(f) {
  const g = mk(26, 28)
  // 根の足
  rect(g, 5, 22, 5, 5, 'B'); rect(g, 16, 22, 5, 5, 'B'); rect(g, 3, 25, 4, 2, 'B'); rect(g, 19, 25, 4, 2, 'B')
  if (f) { rect(g, 5, 26, 5, 1, 'b'); rect(g, 16, 25, 5, 2, 'b') }
  // 幹
  rect(g, 6, 9, 14, 15, 'b'); rect(g, 6, 9, 3, 15, 'l'); rect(g, 16, 9, 4, 15, 'B')
  for (const y of [11, 14, 18, 21]) { rect(g, 9, y, 2, 1, 'B'); rect(g, 13, y + 1, 3, 1, 'B') }
  // 腕（枝）
  poly(g, [[6, 11], [0, 9], [0, 13], [6, 16]], 'b'); poly(g, [[20, 11], [26, 9], [26, 13], [20, 16]], 'b')
  rect(g, 0, 7, 2, 3, 'x'); rect(g, 24, 7, 2, 3, 'x')
  // 葉の冠
  ell(g, 13, 6, 11, 5.5, 'x', 'X', 'x'); ell(g, 6, 9, 4, 3, 'x', 'X', 'x'); ell(g, 20, 9, 4, 3, 'x', 'X', 'x')
  for (const [x, y] of [[8, 3], [12, 1], [17, 3], [10, 5], [15, 6]]) px(g, x, y, 'Y')
  // 顔
  px(g, 10, 14, 'e'); px(g, 11, 14, 'e'); px(g, 15, 14, 'e'); px(g, 16, 14, 'e'); rect(g, 12, 18, 3, 2, 'o')
  return rows(outline(g))
}

// --- 人型の敵：味方の体に服と武器を重ねる ---
const col = (x, ch, from, to) => { const out = []; for (let i = from; i <= to; i++) out.push([i, x, ch]); return out }
const BOW = [[2, 14, 'g'], [3, 15, 'g'], ...col(15, 'g', 4, 10), [11, 15, 'g'], [12, 14, 'g'], ...col(14, 'w', 3, 11)]
const STAFF = (ch = 'x') => [[1, 13, 'GGG'.replace(/G/g, ch)], ...col(14, 'g', 2, 13)]
const HUMANS = {
  goblin: {
    skin: ['gr5', 'gr3'], hair: ['rd2', 'rd1', 'rd3'], cloth: ['rd1', 'rd0', 'rd2'],
    parts: [[0, 5, 'oRRRRo'], [1, 4, 'oRrrrrRo'], [2, 4, 'RRRRRRRR'], [3, 2, 'sS'], [3, 12, 'sS'], [2, 1, 's'], [2, 14, 's'], ...BOW],
  },
  shaman: {
    skin: ['sk2', 'sk1'], hair: ['gr3', 'gr1', 'gr4'], cloth: ['gr1', 'gr0', 'gr2'],
    parts: [[0, 7, 'oGo'], [1, 6, 'oGgGo'], [2, 3, 'oGGGGGGGGo'], [10, 5, 'rrrrrr'], ...STAFF('Y'), [12, 4, 'ogggggo'.slice(0, 7)], [13, 3, 'oggggggggo'.slice(0, 10)]],
    extra: { G: 'gr1', g: 'gr3' },
  },
  mummy: {
    skin: ['sa3', 'sa2'], hair: ['sa3', 'sa2', 'sa1'], cloth: ['sa3', 'sa2', 'sa1'], eye: 'rd3',
    parts: [[2, 5, 'SSSSSS'], [4, 5, 'SSSSSS'], [8, 6, 'SSSS'], [9, 6, 'wwww'], [10, 5, 'SSSSSS'], [11, 6, 'wwww'], [12, 5, 'ssSSss'], [13, 5, 'sSssSs'], [5, 2, 's'], [6, 13, 'S']],
    pants: ['sa3', 'sa2'],
  },
  sandmage: {
    skin: ['sk2', 'sk1'], hair: ['ye1', 'or1', 'ye2'], cloth: ['or1', 'rd1', 'or2'],
    parts: [[0, 5, 'oyyyyo'], [1, 4, 'oyYyyyyo'], [2, 4, 'yyyyyyyy'], [1, 7, 'r'], ...STAFF('R'), [12, 4, 'oooooooo'], [13, 4, 'occccco'.slice(0, 8)]],
  },
  frostarcher: {
    skin: ['sk3', 'sk2'], hair: ['bl4', 'bl3', 'bl5'], cloth: ['bl2', 'bl1', 'bl3'],
    parts: [[0, 5, 'owwwwo'], [1, 4, 'owlllllwo'.slice(0, 8)], [2, 4, 'wwwwwwww'], ...BOW, [11, 6, 'wwww']],
  },
  firemage: {
    skin: ['sk2', 'sk1'], hair: ['rd3', 'rd2', 'rd4'], cloth: ['rd2', 'rd1', 'rd3'],
    parts: [[0, 7, 'oRo'], [1, 6, 'oRrRo'], [2, 3, 'oRRRRRRRRo'], [12, 4, 'orrrrrro'], [13, 3, 'orrrRrrrro'], ...STAFF('Y')],
  },
  knight: {
    skin: ['sk3', 'sk2'], hair: ['gy5', 'gy3', 'gy6'], cloth: ['gy3', 'gy2', 'gy5'],
    parts: [
      [0, 5, 'oMmmMo'], [1, 4, 'oMmmmmMo'], [2, 5, 'MMMM'], [0, 7, 'rr'], [1, 7, 'r'],
      [7, 0, 'oooo'], [8, 0, 'omMMo'], [9, 0, 'omMMo'], [10, 0, 'omMMo'], [11, 0, 'omMMo'], [12, 1, 'oMMo'], [13, 2, 'oo'], [9, 1, 'r'], [10, 1, 'r'],
      [1, 14, 'w'], ...col(14, 'm', 2, 8), [9, 13, 'yyy'], [10, 14, 'g'],
    ],
  },
  darkmage: {
    skin: ['sk1', 'sk1'], hair: ['pu1', 'pu0', 'pu2'], cloth: ['pu1', 'pu0', 'pu2'],
    parts: [[0, 5, 'oUUUUo'], [1, 4, 'oUuuuuUo'], [2, 5, 'UUuu'], [12, 4, 'ouuUuuuo'], [13, 3, 'ouuuUuuuuo'], ...STAFF('m'), [2, 13, 'mmm']],
    extra: { u: 'pu1', U: 'pu0' },
  },
}

// --- ボス（48x56）---
function boss(f) {
  const g = mk(48, 58)
  const bob = f
  // 足
  rect(g, 14, 46 + bob, 8, 10 - bob, 'B'); rect(g, 26, 46 + bob, 8, 10 - bob, 'B')
  rect(g, 12, 54, 11, 3, 'n'); rect(g, 25, 54, 11, 3, 'n')
  // マント（後ろ）
  poly(g, [[8, 16], [40, 16], [46, 54], [2, 54]], 'R')
  poly(g, [[8, 16], [14, 16], [10, 54], [2, 54]], 'r')
  for (let i = 0; i < 6; i++) rect(g, 3 + i * 7, 52, 4, 3, 'R')
  // 胴
  ell(g, 24, 30 + bob, 12, 14, 'b', 'B', 'l')
  // 胸の光（球）
  ell(g, 24, 29 + bob, 4.5, 5.5, 'x', 'X', 'Y')
  // 肩のとげ
  ell(g, 10, 19 + bob, 7, 5, 'b', 'B', 'l'); ell(g, 38, 19 + bob, 7, 5, 'b', 'B', 'l')
  poly(g, [[5, 16], [3, 8], [9, 14]], 'm'); poly(g, [[43, 16], [45, 8], [39, 14]], 'm')
  poly(g, [[10, 15], [10, 6], [14, 14]], 'm'); poly(g, [[38, 15], [38, 6], [34, 14]], 'm')
  // 腕と爪
  ell(g, 7, 33 + bob, 4.5, 10, 'b', 'B', 'l'); ell(g, 41, 33 + bob, 4.5, 10, 'b', 'B', 'l')
  for (let i = 0; i < 3; i++) { poly(g, [[3 + i * 3, 42 + bob], [5 + i * 3, 42 + bob], [4 + i * 3, 48 + bob]], 'w'); poly(g, [[37 + i * 3, 42 + bob], [39 + i * 3, 42 + bob], [38 + i * 3, 48 + bob]], 'w') }
  // 頭
  ell(g, 24, 12 + bob, 9, 8, 'b', 'B', 'l')
  // 角（曲がっている）
  poly(g, [[16, 8], [11, 5], [9, 0], [14, 3], [18, 6]], 'w'); poly(g, [[32, 8], [37, 5], [39, 0], [34, 3], [30, 6]], 'w')
  px(g, 9, 0, 'm'); px(g, 39, 0, 'm')
  // 冠
  for (let i = 0; i < 5; i++) { poly(g, [[17 + i * 3.5, 6 + bob], [18.5 + i * 3.5, 1 + bob + (i % 2 ? 1 : 0)], [20 + i * 3.5, 6 + bob]], 'y') }
  rect(g, 17, 6 + bob, 15, 2, 'y'); px(g, 24, 5 + bob, 'r')
  // 顔：目と牙
  poly(g, [[17, 11 + bob], [22, 13 + bob], [22, 15 + bob], [17, 13 + bob]], 'E'); poly(g, [[31, 11 + bob], [26, 13 + bob], [26, 15 + bob], [31, 13 + bob]], 'E')
  rect(g, 19, 20 + bob, 11, 2, 'o'); for (let i = 0; i < 5; i++) px(g, 19 + i * 2.5, 22 + bob, 'w')
  return rows(outline(g))
}

// --- 組み立て ---
const SIZE = {}
export const ENEMY_ART = {}
const add = (kind, fn) => { ENEMY_ART[kind] = { a: fn(0), b: fn(1) }; SIZE[kind] = { w: ENEMY_ART[kind].a[0].length, h: ENEMY_ART[kind].a.length } }
add('slime', blob); add('icegel', blob); add('lavagel', blob)
add('bat', (f) => bat(f, false)); add('moth', (f) => bat(f, false)); add('vulture', (f) => bat(f, false)); add('firebat', (f) => bat(f, false)); add('imp', (f) => bat(f, false))
add('gargoyle', (f) => bat(f, true))
add('boar', boar); add('wolf', wolf); add('snowwolf', wolf); add('scorpion', scorpion)
add('yeti', yeti); add('golem', golem); add('treant', treant)
add('boss', boss)
for (const [k, spec] of Object.entries(HUMANS)) {
  ENEMY_ART[k] = { a: compose(BASE.a, { parts: spec.parts }), b: compose(BASE.b, { parts: spec.parts }) }
  SIZE[k] = { w: 16, h: 16 }
}
export const ENEMY_SIZE = SIZE

// 描画用：文字コードの配列
export const ENEMY_DATA = {}
for (const [k, art] of Object.entries(ENEMY_ART)) {
  ENEMY_DATA[k] = {}
  for (const f of ['a', 'b']) {
    const arr = new Uint8Array(SIZE[k].w * SIZE[k].h)
    art[f].forEach((row, y) => [...row].forEach((ch, x) => { arr[y * SIZE[k].w + x] = ch.charCodeAt(0) }))
    ENEMY_DATA[k][f] = arr
  }
}

// Pixel で描いた敵: 大きさ・絵（a 立ち＝idle、b 動き＝move1）・動き（anim move のコマと長さ）を、プログラムの絵と入れ替える
export const ENEMY_ANIM = {}
for (const [k, pic] of Object.entries(PIC)) {
  const idle = pic.pics.idle ?? Object.values(pic.pics)[0]
  if (!idle) continue
  const w = idle[0].length, h = idle.length
  const toArr = (rows) => { const arr = new Uint8Array(w * h); rows.forEach((row, y) => [...row].forEach((ch, x) => { arr[y * w + x] = ch.charCodeAt(0) })); return arr }
  SIZE[k] = { w, h }
  ENEMY_DATA[k] = { a: toArr(idle), b: toArr(pic.pics.move1 ?? idle) }
  const an = pic.anims?.move
  if (an) {
    const fr = an.frames.map((n, i) => [pic.pics[n], an.ms[i]]).filter(([rows]) => rows && rows.length === h && rows[0].length === w)
    if (fr.length) ENEMY_ANIM[k] = { frames: fr.map(([rows]) => toArr(rows)), ms: fr.map(([, ms]) => ms) }
  }
}

// 敵ごとの、文字 → パレット番号の表
const tableCache = new Map()
const CLOTH_KEYS = { c: 0, C: 1, D: 2 }
const FIXED = {
  o: 'ink', e: 'ink', E: 'rd3', w: 'white', r: 'rd3', R: 'rd1', y: 'ye1', Y: 'ye3', g: 'br3', G: 'br1', l2: 'br5',
  m: 'gy6', M: 'gy4', n: 'gy3', s: 'sk3', S: 'sk2', p: 'br2', P: 'br1', u: 'bl2', U: 'bl1', V: 'bl3',
}
const SPECIAL = { // x X の色（その敵だけ）
  yeti: { x: 'bl4' }, golem: { x: 'or2', X: 'or1' }, treant: { x: 'gr3', X: 'gr1' },
}
export function enemyTable(kind, P, options = {}) {
  const key = `${kind}|${options.rage ? 1 : 0}${options.stun ? 1 : 0}`
  let t = tableCache.get(key)
  if (t) return t
  t = new Uint8Array(256).fill(255)
  const set = (ch, name) => { t[ch.charCodeAt(0)] = P[name] }
  if (PIC[kind]) {                                 // Pixel で描いた敵は、そのファイルの色がすべて
    for (const [ch, name] of Object.entries(PIC[kind].colors)) set(ch, name)
    tableCache.set(key, t)
    return t
  }
  for (const [ch, name] of Object.entries(FIXED)) set(ch, name)
  const D = ENEMIES[kind]
  const H = HUMANS[kind]
  if (H) {
    set('s', H.skin[0]); set('S', H.skin[1])
    set('c', H.cloth[0]); set('C', H.cloth[1]); set('D', H.cloth[2])
    set('h', H.hair[0]); set('H', H.hair[1]); set('j', H.hair[2])
    set('p', H.pants?.[0] ?? 'br2'); set('P', H.pants?.[1] ?? 'br1')
    if (H.eye) set('e', H.eye)
    for (const [ch, name] of Object.entries(H.extra ?? {})) set(ch, name)
  } else if (D) {
    set('b', D.col[0]); set('B', D.col[1]); set('l', D.col[2])
    for (const [ch, name] of Object.entries(SPECIAL[kind] ?? {})) set(ch, name)
  }
  if (kind === 'boss') {
    set('b', 'pu2'); set('B', 'pu1'); set('l', 'pu3'); set('R', 'rd0'); set('r', 'rd1'); set('E', options.stun ? 'ye2' : options.rage ? 'ye3' : 'rd3')
    set('x', options.rage ? 'or2' : 'rd2'); set('X', options.rage ? 'or1' : 'rd1'); set('Y', 'ye2'); set('n', 'ink'); set('m', 'gy6')
  }
  tableCache.set(key, t)
  return t
}
