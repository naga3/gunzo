// 描画。640x480 のインデックスバッファ（fb）にパレット番号で描く。DOM は使わない
import { P } from './palette.js'
import { dark } from './shade.js'
import { TILE, MW, MH, T, B } from './world.js'
import { JOBS, VIEW_W, VIEW_H, MAX_LV, xpNeed } from './sim.js'
import { SHOOT, GUARD, THROW, PRAY, FREEZE } from './data.js'
import { SPRITE_DATA, DIR_DATA, ANIMS, colorTable, W as SW, H as SH } from './sprites.js'
import { ENEMY_DATA, ENEMY_SIZE, ENEMY_ANIM, enemyTable } from './enemysprites.js'
import * as ART from './art.js'

export const W = VIEW_W
// 半透明の色（HUD と余白の絵だけで使う。表示側 main.js の PAL32 で、透けた黒・透けた白にする）。ボタンの下の世界が見える
export const GLASS = 254, GLASS_HOT = 253
export const H = VIEW_H

// 画面のボタン（fb 座標）
export const PAUSE_BTN = { x: 4, y: H - 26, w: 22, h: 22 }
export const PREV_BTN = { x: 30, y: H - 26, w: 22, h: 22 }
export const NEXT_BTN = { x: 56, y: H - 26, w: 22, h: 22 }
// 振るボタン（自分で振る職を操作しているときだけ出る）。r は見た目の半径
export const SWING_BTN = { x: W - 30, y: H - 32, r: 22 }
export const MINI = { x: W - 70, y: 4, w: 66, h: 50 }
// タイトル: スロット 3 つと、選んだスロットの項目
export const SLOT_BTNS = [0, 1, 2].map((i) => ({ x: W / 2 - 100, y: 96 + i * 32, w: 200, h: 28 }))
export const slotItemBtn = (i) => ({ x: W / 2 - 70, y: 112 + i * 26, w: 140, h: 22 })
// ポーズ画面: 下に並ぶボタンと、仲間の一覧のページ送り
export const MENU_BTNS = [
  { id: 'resume', label: 'RESUME', x: 96, y: H - 24, w: 54, h: 20 },
  { id: 'save', label: 'SAVE', x: 152, y: H - 24, w: 52, h: 20 },
  { id: 'sound', label: 'SOUND', x: 206, y: H - 24, w: 56, h: 20 },
  { id: 'title', label: 'TITLE', x: 264, y: H - 24, w: 52, h: 20 },
]
export const PAGE_PREV = { x: 4, y: H - 24, w: 20, h: 20 }
export const PAGE_NEXT = { x: 70, y: H - 24, w: 20, h: 20 }
export const LIST_ROWS = 10, LIST_COLS = 3, LIST_Y = 20, ROW_H = 19, COL_W = (W - 8) / LIST_COLS
const LIST_PER = LIST_ROWS * LIST_COLS
// 一覧に出す人: 生きている仲間（助けた順）と、その後ろに倒れた仲間（倒れた順）
const listPeople = (S) => [...S.allies.filter((a) => a.alive), ...S.deaths.map((d) => ({ ...d, fallen: true }))]
export const listPages = (S) => Math.max(1, Math.ceil(listPeople(S).length / LIST_PER))
const listPage = (S, ui) => Math.min(ui.page ?? 0, listPages(S) - 1)
// 一覧の i 番目（ページの中）の枠
const listCell = (i) => ({ x: 4 + Math.floor(i / LIST_ROWS) * COL_W, y: LIST_Y + (i % LIST_ROWS) * ROW_H, w: COL_W - 2, h: ROW_H - 1 })
// fb の点 p にいる仲間（ポーズの一覧を押したとき）
export function listHit(S, ui, p) {
  const page = listPage(S, ui), people = listPeople(S)
  for (let i = 0; i < LIST_PER; i++) {
    const a = people[page * LIST_PER + i]
    if (!a) return null
    const b = listCell(i)
    if (p.x >= b.x && p.x < b.x + b.w && p.y >= b.y && p.y < b.y + b.h) return a.fallen ? null : a
  }
  return null
}

const c = (name) => P[name]

// 3x5 の小さなフォント
const FONT = {
  0: '111101101101111', 1: '010110010010111', 2: '111001111100111', 3: '111001111001111',
  4: '101101111001001', 5: '111100111001111', 6: '111100111101111', 7: '111001001001001',
  8: '111101111101111', 9: '111101111001111', '/': '001001010100100',
  A: '010101111101101', B: '110101110101110', C: '011100100100011', D: '110101101101110', E: '111100110100111', F: '111100110100100', G: '011100101101011', H: '101101111101101', I: '111010010010111', J: '001001001101010', K: '101101110101101', L: '100100100100111', M: '101111111101101', N: '110101101101101', O: '010101101101010', P: '110101110100100', Q: '010101101111011', R: '110101110101101', S: '011100010001110', T: '111010010010010', U: '101101101101111', V: '101101101101010', W: '101101111111101', X: '101101010101101', Y: '101101010010010', Z: '111001010100111',
  ':': '000010000010000', '.': '000000000000010', '-': '000000111000000', '!': '010010010000010', '?': '111001011000010',
  '<': '001010100010001', '>': '100010001010100', '+': '000010111010000', '%': '101001010100101', '=': '000111000111000',
}

// fb の大きさ（w × h）は、ふだんは画面と同じ。カメラをドットより細かく動かすときは、世界を 1 ドット大きく描く（main.js）
export function createRenderer(fb, w = VIEW_W, h = VIEW_H) {
  const W = w, H = h
  function px(x, y, col) {
    if (x >= 0 && x < W && y >= 0 && y < H) fb[y * W + x] = col
  }
  function rect(x, y, w, h, col) {
    const x0 = Math.max(0, x), x1 = Math.min(W, x + w)
    const y0 = Math.max(0, y), y1 = Math.min(H, y + h)
    if (x1 <= x0 || y1 <= y0) return // 空なら何もしない（fill の終点が負だと配列の末尾からの位置になり、全体を塗ってしまう）
    for (let j = y0; j < y1; j++) fb.fill(col, j * W + x0, j * W + x1)
  }
  function text(str, x, y, col, sc = 1) {
    x = Math.round(x)
    y = Math.round(y)
    for (const ch of String(str).toUpperCase()) {
      const g = FONT[ch]
      if (g) for (let i = 0; i < 15; i++) if (g[i] === '1') rect(x + (i % 3) * sc, y + ((i / 3) | 0) * sc, sc, sc, col)
      x += 4 * sc
    }
  }
  const textW = (s, sc = 1) => String(s).length * 4 * sc - sc
  function shadowText(str, x, y, col, sc = 1) {
    text(str, x + sc, y + sc, c('black'), sc)
    text(str, x, y, col, sc)
  }
  function ringPx(cx, cy, r, col, flat = 0.55, dotted = false) {
    const n = Math.max(12, Math.round(r * 5))
    for (let i = 0; i < n; i++) {
      if (dotted && (i & 1)) continue
      const a = (i / n) * Math.PI * 2
      px(Math.round(cx + Math.cos(a) * r), Math.round(cy + Math.sin(a) * r * flat), col)
    }
  }
  function disc(cx, cy, r, col) {
    for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) if (x * x + y * y <= r * r + r * 0.5) px(cx + x, cy + y, col)
  }
  // 市松模様で塗る（半透明の代わり）
  function ditherDisc(cx, cy, r, col, phase = 0) {
    for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) if (x * x + y * y <= r * r && ((x + y + phase) & 1) === 0) px(cx + x, cy + y, col)
  }
  function lineThick(x0, y0, x1, y1, w, col, dash = 0) {
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1)
    for (let i = 0; i <= n; i++) {
      if (dash && ((i / dash) | 0) % 2) continue
      const x = Math.round(x0 + ((x1 - x0) * i) / n), y = Math.round(y0 + ((y1 - y0) * i) / n)
      if (w <= 1) px(x, y, col)
      else rect(x - (w >> 1), y - (w >> 1), w, w, col)
    }
  }

  // --- タイル ---
  const hash = (x, y) => {
    let h = (x * 374761393 + y * 668265263) | 0
    h = (h ^ (h >>> 13)) * 1274126177
    return (h ^ (h >>> 16)) >>> 0
  }
  function makeTile(fn) {
    const t = new Uint8Array(TILE * TILE)
    fn((x, y, col) => { if (x >= 0 && y >= 0 && x < TILE && y < TILE) t[y * TILE + x] = col })
    return t
  }
  function fillT(set, x, y, w, h, col) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) set(x + i, y + j, col)
  }
  function groundBase(set, seed, base, a, b) {
    fillT(set, 0, 0, 16, 16, c(base))
    for (let i = 0; i < 9; i++) {
      const h = hash(seed * 31 + i, seed + 7)
      const x = h % TILE, y = (h >>> 8) % TILE
      set(x, y, i % 3 === 0 ? c(a) : c(b))
      if (i % 3 === 1) set(x, y - 1, c(b))
    }
  }
  const BIOME_ART = {
    [B.GRASS]: { base: 'gr3', a: 'gr2', b: 'gr4', path: ['br4', 'br3', 'br5'], deco: ['white', 'ye2', 'pk2'] },
    [B.FOREST]: { base: 'gr2', a: 'gr1', b: 'gr3', path: ['br3', 'br2', 'br4'], deco: ['rd3', 'white', 'ye2'] },
    [B.DESERT]: { base: 'sa2', a: 'sa1', b: 'sa3', path: ['br4', 'br3', 'br5'], deco: ['gy6', 'gy5', 'white'] },
    [B.SNOW]: { base: 'gy6', a: 'bl5', b: 'white', path: ['gy5', 'gy4', 'sa3'], deco: ['bl4', 'bl3', 'bl5'] },
    [B.VOLCANO]: { base: 'gy1', a: 'ink', b: 'gy2', path: ['st1', 'gy2', 'st2'], deco: ['or1', 'rd2', 'or2'] },
    [B.CASTLE]: { base: 'st2', a: 'st1', b: 'gy4', path: ['br4', 'br3', 'br5'], deco: ['rd2', 'rd1', 'ye1'] },
  }
  function treeTile(set, b, s) {
    const A = BIOME_ART[b]
    groundBase(set, s + 20, A.base, A.a, A.b)
    if (b === B.DESERT) { // サボテン
      fillT(set, 7, 3, 3, 11, c('gr3')); fillT(set, 3, 6, 3, 2, c('gr3')); fillT(set, 3, 4, 2, 4, c('gr3')); fillT(set, 11, 7, 3, 2, c('gr3')); fillT(set, 12, 5, 2, 4, c('gr3'))
      fillT(set, 8, 3, 1, 11, c('gr4')); set(8, 2, c('pk2')); set(8, 14, c('gr1'))
      return
    }
    if (b === B.SNOW) { // 雪の松
      set(7, 14, c('br1')); set(8, 14, c('br1')); fillT(set, 7, 11, 2, 3, c('br2'))
      for (let r = 0; r < 4; r++) fillT(set, 8 - (r + 2), 2 + r * 3, (r + 2) * 2, 4, c(r % 2 ? 'gr1' : 'gr2'))
      for (let r = 0; r < 4; r++) fillT(set, 8 - (r + 1), 2 + r * 3, (r + 1) * 2, 1, c('white'))
      return
    }
    if (b === B.VOLCANO) { // 焼けた木
      fillT(set, 7, 4, 2, 10, c('br0')); set(5, 6, c('br0')); set(6, 5, c('br0')); set(10, 8, c('br0')); set(9, 7, c('br0')); set(5, 9, c('br0')); set(11, 5, c('ink')); set(7, 3, c('ink'))
      set(8, 8, c('or1')); set(7, 11, c('rd2'))
      return
    }
    // 緑の木（森は濃く大きい）
    set(7, 14, c('br1')); set(8, 14, c('br1'))
    for (let y = 11; y < 15; y++) { set(7, y, c('br2')); set(8, y, c('br3')) }
    const big = b === B.FOREST
    for (let y = -1; y <= 12; y++) {
      for (let x = 0; x < 16; x++) {
        const dx = x - 7.5, dy = y - 6 + (s ? 0.4 : 0)
        const d = (dx * dx) / (big ? 62 : 56) + (dy * dy) / (big ? 46 : 40)
        if (d > 1) continue
        let col = big ? c('gr1') : c('gr2')
        if (d > 0.72) col = big ? c('gr0') : c('gr1')
        else if (dx + dy < -4) col = big ? c('gr2') : c('gr4')
        else if (dx + dy < -1) col = big ? c('gr2') : c('gr3')
        set(x, y, col)
      }
    }
    set(5 + s, 4, big ? c('gr3') : c('gr5')); set(6 + s, 3, big ? c('gr3') : c('gr5'))
  }
  function rockTile(set, b, s) {
    const A = BIOME_ART[b]
    groundBase(set, s + 40, A.base, A.a, A.b)
    const pal = b === B.DESERT ? ['br4', 'br3', 'sa1', 'sa3'] : b === B.VOLCANO ? ['gy1', 'pu0', 'gy2', 'gy3'] : b === B.SNOW ? ['gy4', 'gy3', 'gy5', 'white'] : ['gy3', 'gy2', 'gy4', 'gy5']
    for (let y = 3; y < 15; y++) {
      for (let x = 1; x < 15; x++) {
        const dx = x - 7.5, dy = y - 9.5
        const d = (dx * dx) / 40 + (dy * dy) / 20
        if (d > 1) continue
        let col = c(pal[0])
        if (d > 0.7 || y > 12) col = c(pal[1])
        else if (dx + dy < -3) col = c(pal[3])
        else if (dx + dy < 0) col = c(pal[2])
        set(x, y, col)
      }
    }
    set(5, 5, c(pal[3])); set(6, 5, c(pal[3]))
  }
  function waterTile(set, b, f) {
    const pal = b === B.SNOW ? ['bl4', 'bl5', 'white'] : b === B.VOLCANO ? ['rd2', 'or1', 'ye1'] : b === B.FOREST ? ['tl1', 'tl2', 'tl3'] : b === B.DESERT ? ['wt2', 'wt3', 'white'] : ['wt1', 'wt2', 'wt3']
    fillT(set, 0, 0, 16, 16, c(pal[0]))
    for (let y = 2; y < TILE; y += 5) {
      for (let x = 0; x < TILE; x++) {
        const k = (x + y * 3 + f * 4) % 8
        if (k < 3) set(x, y, c(pal[1]))
        if (k === 1) set(x, y - 1, c(pal[2]))
      }
    }
  }
  const SETS = {}
  for (const bi of [B.GRASS, B.FOREST, B.DESERT, B.SNOW, B.VOLCANO]) {
    const A = BIOME_ART[bi]
    SETS[bi] = {
      ground: [0, 1, 2, 3].map((s) => makeTile((set) => groundBase(set, s + bi * 7, A.base, A.a, A.b))),
      deco: [0, 1, 2].map((s) => makeTile((set) => {
        groundBase(set, s + 9 + bi * 7, A.base, A.a, A.b)
        for (let i = 0; i < 3; i++) {
          const h = hash(s * 17 + i, 3 + bi)
          const x = 2 + (h % 12), y = 3 + ((h >>> 8) % 10)
          set(x, y, c(A.deco[(s + i) % 3]))
          if (bi === B.GRASS) set(x, y + 1, c('gr2'))
          if (bi === B.FOREST && i === 0) { set(x, y + 1, c('white')); set(x - 1, y, c('rd3')); set(x + 1, y, c('rd3')) }
        }
      })),
      path: [0, 1, 2].map((s) => makeTile((set) => {
        fillT(set, 0, 0, 16, 16, c(A.path[0]))
        for (let i = 0; i < 14; i++) {
          const h = hash(s * 13 + i, 5)
          set(h % TILE, (h >>> 8) % TILE, i % 2 ? c(A.path[1]) : c(A.path[2]))
        }
      })),
      tree: [0, 1].map((s) => makeTile((set) => treeTile(set, bi, s))),
      rock: [0, 1].map((s) => makeTile((set) => rockTile(set, bi, s))),
      water: [0, 1].map((f) => makeTile((set) => waterTile(set, bi, f))),
    }
  }
  const CASTLE_SET = {
    floor: [0, 1].map((s) => makeTile((set) => {
      for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) set(x, y, ((x >> 3) + (y >> 3) + s) & 1 ? c('gy3') : c('gy2'))
      for (let i = 0; i < 16; i++) { set(i, 0, c('gy1')); set(0, i, c('gy1')) }
    })),
    wall: makeTile((set) => {
      fillT(set, 0, 0, 16, 16, c('gy2'))
      for (let r = 0; r < 4; r++) {
        fillT(set, 0, r * 4 + 3, 16, 1, c('gy1'))
        const off = r % 2 ? 4 : 0
        for (let x = off; x < 16; x += 8) fillT(set, x, r * 4, 1, 4, c('gy1'))
        fillT(set, 0, r * 4, 16, 1, c('gy3'))
      }
    }),
    deco: makeTile((set) => { fillT(set, 0, 0, 16, 16, c('rd1')); fillT(set, 0, 0, 16, 2, c('ye1')); fillT(set, 0, 14, 16, 2, c('ye1')); fillT(set, 6, 5, 4, 6, c('rd2')) }),
  }
  CASTLE_SET.decos = [CASTLE_SET.deco]
  // Pixel で描いた背景（art/tiles/*.pic → src/art.js の TILE_PIC）があれば、プログラムの絵と入れ替える。
  // 同じ種類（ground1, ground2…）は何枚でもよい（場所ごとに混ぜて使う）。透明な点は、その地域の ground1 の色にする
  {
    const TILE_PIC = ART.TILE_PIC ?? {}
    const toTile = (pic, rows, under) => {
      const t = new Uint8Array(TILE * TILE)
      for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
        const ch = rows[y]?.[x]
        t[y * TILE + x] = ch && ch !== '.' && pic.colors[ch] ? P[pic.colors[ch]] : under ? under[y * TILE + x] : 0
      }
      return t
    }
    const list = (pic, kind, under) => Object.keys(pic.pics).filter((n) => new RegExp(`^${kind}\\d+$`).test(n))
      .sort((a, b) => parseInt(a.slice(kind.length), 10) - parseInt(b.slice(kind.length), 10)).map((n) => toTile(pic, pic.pics[n], under))
    const NAMES = { grass: B.GRASS, forest: B.FOREST, desert: B.DESERT, snow: B.SNOW, volcano: B.VOLCANO }
    for (const [name, bi] of Object.entries(NAMES)) {
      const pic = TILE_PIC[name]
      if (!pic) continue
      const st = SETS[bi]
      const ground = list(pic, 'ground', null)
      if (ground.length) st.ground = ground
      for (const kind of ['deco', 'path', 'tree', 'rock', 'water']) { const l = list(pic, kind, st.ground[0]); if (l.length) st[kind] = l }
      st.waterMs = pic.anims?.water?.ms?.[0] ?? 670
    }
    const cp = TILE_PIC.castle
    if (cp) {
      const floor = list(cp, 'floor', null)
      if (floor.length) CASTLE_SET.floor = floor
      if (cp.pics.wall) CASTLE_SET.wall = toTile(cp, cp.pics.wall, CASTLE_SET.floor[0])
      const decos = list(cp, 'deco', CASTLE_SET.floor[0])
      if (decos.length) CASTLE_SET.decos = decos
    }
  }
  function blit(tile, x, y) {
    for (let j = 0; j < TILE; j++) {
      const yy = y + j
      if (yy < 0 || yy >= H) continue
      for (let i = 0; i < TILE; i++) {
        const xx = x + i
        if (xx < 0 || xx >= W) continue
        fb[yy * W + xx] = tile[j * TILE + i]
      }
    }
  }
  function drawMap(S, t) {
    const cx = S.cam.x, cy = S.cam.y
    const tx0 = Math.floor(cx / TILE), ty0 = Math.floor(cy / TILE)
    for (let ty = ty0; ty <= ty0 + VIEW_H / TILE + 1; ty++) {
      for (let tx = tx0; tx <= tx0 + VIEW_W / TILE + 1; tx++) {
        if (tx < 0 || ty < 0 || tx >= MW || ty >= MH) continue
        const k = S.world.tiles[ty * MW + tx]
        const bi = S.world.biome[ty * MW + tx]
        const h = hash(tx, ty)
        const sx = tx * TILE - cx, sy = ty * TILE - cy
        if (bi === B.CASTLE) {
          if (k === T.WALL) blit(CASTLE_SET.wall, sx, sy)
          else if (k === T.DECO) blit(CASTLE_SET.decos[h % CASTLE_SET.decos.length], sx, sy)
          else blit(CASTLE_SET.floor[(tx + ty) % CASTLE_SET.floor.length], sx, sy)
          continue
        }
        const st = SETS[bi] ?? SETS[B.GRASS]
        let tile
        switch (k) {
          case T.TREE: tile = st.tree[h % st.tree.length]; break
          case T.WATER: tile = st.water[(Math.floor((t * 1000) / (st.waterMs ?? 670)) + tx + ty) % st.water.length]; break
          case T.ROCK: tile = st.rock[h % st.rock.length]; break
          case T.PATH: tile = st.path[h % st.path.length]; break
          case T.DECO: tile = st.deco[h % st.deco.length]; break
          case T.WALL: tile = CASTLE_SET.wall; break
          case T.FLOOR: tile = CASTLE_SET.floor[(tx + ty) % CASTLE_SET.floor.length]; break
          default: tile = st.ground[h % st.ground.length]
        }
        blit(tile, sx, sy)
      }
    }
  }

  // --- 味方 ---
  // Pixel で描いた職の絵: 人は正面（down）だけ（2026-10-17）。歩いていて、その職の walk_down のコマがあれば、o.anim（秒）に合わせてコマを回す
  // （向きの絵を描いた職が出てきたら、その向きを使う作りは残してある）
  // 返す: [絵, 反転するか, 動きのコマか]。一枚絵の無い職は null
  function dirSprite(o, walking) {
    const D = DIR_DATA[o.job]
    if (!D) return null
    const fx = o.fx ?? 0, fy = o.fy ?? 1
    let d = Math.abs(fx) > Math.abs(fy) ? (fx > 0 ? 'right' : 'left') : (fy >= 0 ? 'down' : 'up')
    if (!D[d] && D.down) d = 'down'                // 描いていない向きは正面で
    if (D[d]) {
      const A = walking && ANIMS[o.job]?.[`walk_${d}`]
      if (A) {
        const fr = A.frames.map((f, i) => [D[f], A.ms[i]]).filter((x) => x[0])
        if (fr.length > 1 || (fr.length === 1 && fr[0][0] !== D[d])) {
          const total = fr.reduce((s, x) => s + x[1], 0)
          let t = (o.anim * 1000) % total, k = 0
          while (t >= fr[k][1]) { t -= fr[k][1]; k++ }
          return [fr[k][0], false, true]
        }
      }
      return [D[d], false, false]
    }
    const side = d === 'left' || d === 'right' ? d : o.face >= 0 ? 'right' : 'left'
    if (D[side]) return [D[side], false, false]
    const other = side === 'right' ? 'left' : 'right'
    return D[other] ? [D[other], true, false] : null
  }
  // 足元を (fx, fy) として、16x16 のドット絵を描く（右向きの絵を、左向きなら反転する。向きごとの一枚絵があればそれ）
  function drawPerson(o, fx, fy, opts = {}) {
    const flash = o.flash > 0
    const ds = dirSprite(o, o.moving && !opts.still)
    const right = ds ? !ds[1] : o.face >= 0
    const walk = o.moving && !opts.still && !ds?.[2]   // 動きのコマで歩くときは、体を上下に揺らさない
    const step = walk ? Math.floor(o.anim * 9) & 1 : 0
    const frame = step ? 'b' : 'a'
    const oy = fy - (SH - 1) - (walk && !step ? 1 : 0) // 歩くとき、足をそろえた瞬間に 1 ドット上がる
    const ox = fx - (SW >> 1)
    // 影
    rect(fx - 5, fy - 2, 11, 2, c('gy1'))
    rect(fx - 4, fy - 3, 9, 1, c('gy1'))
    const data = ds ? ds[0] : SPRITE_DATA[o.job]?.[frame]
    if (data) {
      const tbl = colorTable(o.job, P)
      const white = c('white')
      for (let y = 0; y < SH; y++) {
        const yy = oy + y
        if (yy < 0 || yy >= H) continue
        for (let x = 0; x < SW; x++) {
          const ch = data[y * SW + (right ? x : SW - 1 - x)]
          if (ch === 46) continue // '.'
          let col = tbl[ch]
          if (col === 255) continue
          if (flash && ch !== 111) col = white // 輪郭（o）以外は白
          const xx = ox + x
          if (xx >= 0 && xx < W) fb[yy * W + xx] = col
        }
      }
    }
    if (opts.nobar) return
    const top = SH + (walk && !step ? 1 : 0)
    const pips = Math.min(5, Math.floor(o.lvl / 3))
    for (let i = 0; i < pips; i++) px(fx - pips + 1 + i * 2, fy - top - 2, c('ye2'))
    if (o.hp < o.maxhp) {
      const bw = Math.max(1, Math.round((10 * o.hp) / o.maxhp))
      const by = fy - top - 5
      rect(fx - 5, by, 10, 2, c('black'))
      rect(fx - 5, by, bw, 1, o.hp < o.maxhp * 0.35 ? c('rd3') : c('lime'))
    }
  }

  // --- 敵・ボス：ドット絵（enemysprites.js）---
  function drawEnemy(e, fx, fy, t) {
    const D = e.def
    const kind = e.kind
    const data = ENEMY_DATA[kind]
    const size = ENEMY_SIZE[kind]
    if (!data) return
    const isBoss = kind === 'boss'
    const flyer = D.atk === 'flyer'
    // 歩く・はばたく・はずむ
    let frame = 'a'
    if (D.shape === 'blob') frame = Math.floor(e.anim * 4) & 1 ? 'b' : 'a'
    else if (flyer) frame = Math.floor(e.anim * 10) & 1 ? 'b' : 'a'
    else if (isBoss) frame = Math.floor(e.anim * 2) & 1 ? 'b' : 'a'
    else if (e.state === 'chase' || e.state === 'act') frame = Math.floor(e.anim * 8) & 1 ? 'b' : 'a'
    const lift = flyer ? 7 + Math.round(Math.sin(e.anim * 4) * 1.5) : 0
    const oy = fy - size.h - lift
    const ox = fx - (size.w >> 1)
    const right = e.face >= 0
    // 影
    const sw = Math.max(7, Math.round(size.w * 0.7))
    rect(fx - (sw >> 1), fy - 2, sw, 2, c('gy1'))
    rect(fx - (sw >> 1) + 1, fy - 3, sw - 2, 1, c('gy1'))
    const tbl = enemyTable(kind, P, isBoss ? { rage: e.hp < e.maxhp * 0.33, stun: e.pstate === 'stun' } : {})
    // Pixel で描いた動き（anim move）があれば、動いている間はそのコマと長さで回す
    const A = ENEMY_ANIM[kind], animOn = D.shape === 'blob' || flyer || isBoss || e.state === 'chase' || e.state === 'act'
    let arr = data[frame]
    if (A) {
      arr = data.a
      if (animOn) {
        const total = A.ms.reduce((s2, v) => s2 + v, 0)
        let tt = (e.anim * 1000) % total, k = 0
        while (tt >= A.ms[k]) { tt -= A.ms[k]; k++ }
        arr = A.frames[k]
      }
    }
    const white = c('white')
    // 弾を撃つ・突進する予兆: 白く点滅し、直前の一瞬は白く光りっぱなし（射線・突進の線の代わり）
    const aimLeft = !isBoss && e.state === 'wind' && ['shoot', 'fireball', 'fan', 'charge'].includes(D.atk) ? e.windT
      : isBoss && e.pstate === 'wind' && (e.atkKind === 'fan' || e.atkKind === 'charge') ? e.pT : null
    const flash = e.flash > 0 || (aimLeft != null && (aimLeft < 0.12 || (Math.floor(t * 14) & 1)))
    const frozen = e.frozen > 0, iceA = c('bl5'), iceB = c('bl4'), iceW = c('white')
    for (let y = 0; y < size.h; y++) {
      const yy = oy + y
      if (yy < 0 || yy >= H) continue
      for (let x = 0; x < size.w; x++) {
        const ch = arr[y * size.w + (right ? x : size.w - 1 - x)]
        if (ch === 46) continue
        let col = tbl[ch]
        if (col === 255) continue
        // 命中の点滅：小さい敵は真っ白、ボスと大きな敵は市松（大勢に撃たれ続けても、絵が見えるように）
        if (flash && ch !== 111 && (size.w < 24 || ((x + y) & 1))) col = white
        else if (frozen && ch !== 111) col = (x + y) & 1 ? iceA : (y < 3 ? iceW : iceB)   // 凍っている: 氷の色の市松
        const xx = ox + x
        if (xx >= 0 && xx < W) fb[yy * W + xx] = col
      }
    }
    const top = size.h + lift
    if (isBoss) {
      if (e.pstate === 'stun') for (let i = 0; i < 3; i++) { const a = t * 5 + (i * 6.28) / 3; px(Math.round(fx + Math.cos(a) * 12), Math.round(oy - 4 + Math.sin(a) * 2), c('ye3')) }
      return
    }
    if (e.hp < e.maxhp) {
      const w = Math.min(20, Math.max(10, size.w))
      const bw = Math.max(1, Math.round((w * e.hp) / e.maxhp))
      const by = fy - top - 3
      rect(fx - (w >> 1), by, w, 2, c('black'))
      rect(fx - (w >> 1), by, bw, 1, c('rd3'))
    }
    if (e.state === 'stun') for (let i = 0; i < 2; i++) { const a = t * 6 + i * 3.14; px(Math.round(fx + Math.cos(a) * 6), Math.round(fy - top - 5 + Math.sin(a) * 1.5), c('ye3')) }
    if (e.state === 'wind') px(fx, fy - top - 6, Math.floor(e.windT * 20) & 1 ? c('rd3') : c('ye3')) // 予兆の「!」
  }

  function drawCage(cg, fx, fy, t) {
    const fake = { job: cg.job, face: 1, flash: 0, moving: false, anim: t, lvl: 1, hp: 1, maxhp: 1 }
    drawPerson(fake, fx, fy - 1, { still: true, nobar: true })
    const f = cg.flash > 0
    const bar = f ? c('white') : c('br4')
    const dark = f ? c('white') : c('br2')
    const top = SH + 3
    rect(fx - 8, fy - top, 16, 2, c('br1'))
    rect(fx - 8, fy - top + 2, 16, 1, dark)
    for (let x = -7; x <= 7; x += 3) rect(fx + x, fy - top + 2, 1, top - 2, bar)
    rect(fx - 8, fy - top + 2, 1, top - 2, dark)
    rect(fx + 7, fy - top + 2, 1, top - 2, dark)
    rect(fx - 8, fy - 2, 16, 2, c('br1'))
    px(fx, fy - 9, c('ye1')); px(fx + 1, fy - 9, c('ye1'))
    if (cg.hp < cg.maxhp) {
      const bw = Math.max(1, Math.round((14 * cg.hp) / cg.maxhp))
      rect(fx - 7, fy - top - 4, 14, 2, c('black'))
      rect(fx - 7, fy - top - 4, bw, 1, c('ye1'))
    }
  }

  function drawProj(p, cx, cy) {
    const x = Math.round(p.x - cx), y = Math.round(p.y - cy)
    const a = Math.atan2(p.vy, p.vx)
    switch (p.kind) {
      case 'arrow': case 'enemyArrow': {
        // 矢: 先端（やじり）から後ろへ、矢柄、羽。どの向きでも描けるように、向きにそって点を置く
        const ca = Math.cos(a), sa = Math.sin(a), nx = -sa, ny = ca          // 前と、横
        const at = (i, side = 0) => [Math.round(x - ca * i + nx * side), Math.round(y - sa * i + ny * side)]
        const dot = (i, side, col) => { const [xx, yy] = at(i, side); px(xx, yy, col) }
        if (p.strong) {                              // 引き絞りきった矢: 炎をまとった大きな矢
          const fl = Math.floor((p.spin ?? 0) * 2)                             // 炎のゆらめき（毎フレーム変わる）
          const rnd3 = (i, k) => (hash(i * 7 + k, fl) % 3) - 1
          for (let i = -2; i < 26; i++) {                                      // 炎: やじりの後ろからふくらみ、後ろほど細くなる。外は赤、中は橙、芯は黄
            const k = (i + 2) / 28
            const w = 5 * Math.sin(Math.min(1, k * 2.2) * Math.PI / 2) * (1 - k * 0.75) + rnd3(i, 1) * 0.8
            if (k > 0.6 && hash(i, fl) % 3 === 0) continue                    // 後ろの方は、ちぎれる
            for (let side = -Math.ceil(w); side <= Math.ceil(w); side++) {
              const u = Math.abs(side) / (w + 0.01)
              if (u > 1) continue
              dot(i + rnd3(i, side + 9), side, u > 0.7 ? c('rd3') : u > 0.4 ? c('or2') : u > 0.15 ? c('ye2') : c('ye3'))
            }
          }
          for (let i = 1; i < 16; i++) dot(i, 0, c(i < 3 ? 'white' : 'br5'))   // 炎の中の矢柄
          dot(0, 0, c('white')); dot(-1, 0, c('white'))                        // 大きなやじり
          for (const sd of [-1, 1]) { dot(1, sd, c('gy6')); dot(2, sd, c('gy6')); dot(2, sd * 2, c('gy5')); dot(3, sd * 2, c('gy5')) }
          for (const sd of [-1, 1]) { dot(13, sd * 1.5, c('or1')); dot(14, sd * 2, c('rd3')); dot(15, sd * 2.5, c('rd3')) }   // 燃える羽
          break
        }
        const enemy = p.kind === 'enemyArrow' && !p.deflected
        const len = 11
        const shaft = enemy ? c('rd2') : p.deflected ? c('ye2') : c('br4')
        const head = enemy ? c('rd4') : c('gy6'), tip = c('white')
        const feather = c('rd3'), feather2 = enemy ? c('rd1') : c('white')
        for (let i = 2; i < len - 1; i++) dot(i, 0, shaft)                 // 矢柄
        dot(0, 0, tip)                                                       // やじり: 先端と、左右に広がる三角
        dot(1, 0, head); dot(2, -1, head); dot(2, 1, head); dot(1, -0.5, head); dot(1, 0.5, head)
        dot(len - 3, -1, feather); dot(len - 3, 1, feather)                 // 羽: 後ろへ向かって左右に開く
        dot(len - 2, -1, feather2); dot(len - 2, 1, feather2); dot(len - 1, -2, feather); dot(len - 1, 2, feather)
        dot(len - 1, 0, shaft)
        break
      }
      case 'boom': {
        const r = Math.floor(p.spin) & 3
        const pts = [[3, -1], [1, 3], [-3, 1], [-1, -3]]
        const [ox, oy] = pts[r]
        px(x, y, c('ye2')); px(x + ox, y + oy, c('ye3')); px(x - ox, y - oy, c('ye1')); px(x + ox + (oy > 0 ? 1 : -1), y + oy, c('ye2')); px(x + (ox >> 1), y + (oy >> 1), c('ye2'))
        break
      }
      case 'magic':
        disc(x, y, 3, c('pu2')); disc(x, y, 2, c('pu3')); px(x, y, c('white')); px(x + 3, y - 3, c('pu4')); px(x - 3, y + 2, c('pu4'))
        break
      case 'icicle': {                             // ツララ: 先の尖った氷のかけら
        const ca = Math.cos(a), sa = Math.sin(a)
        for (let i = 0; i < 7; i++) {
          const xx = Math.round(x - ca * i), yy = Math.round(y - sa * i)
          px(xx, yy, i < 2 ? c('white') : i < 5 ? c('bl5') : c('bl4'))
          if (i >= 2 && i <= 4) { px(Math.round(xx - sa), Math.round(yy + ca), c('bl4')); px(Math.round(xx + sa), Math.round(yy - ca), c('bl5')) }
        }
        break
      }
      case 'frostbolt':                            // 冷気の弾: 白く光る大きな玉と、まわりの氷の粒
        disc(x, y, 4, c('bl4')); disc(x, y, 3, c('bl5')); disc(x, y, 1, c('white'))
        for (let i = 0; i < 4; i++) { const r = p.spin + (i * Math.PI) / 2; px(Math.round(x + Math.cos(r) * 6), Math.round(y + Math.sin(r) * 6), c('white')) }
        break
      case 'healbolt':                             // 癒やしの光: 緑に光る小さな玉
        disc(x, y, 2, c('gr5')); px(x, y, c('white'))
        px(x + (Math.floor(p.spin) & 1 ? 3 : -3), y, c('gr6')); px(x, y + (Math.floor(p.spin) & 1 ? -3 : 3), c('gr6'))
        break
      case 'fireball':
        if (p.deflected) { disc(x, y, p.r >= 6 ? 4 : 3, c('bl3')); disc(x, y, 2, c('bl5')); px(x, y, c('white')); break } // 弾き返した弾は青く
        disc(x, y, p.r >= 6 ? 4 : 3, c('or1')); disc(x, y, 2, c('ye2')); px(x, y, c('white'))
        break
    }
  }
  function drawBlast(bl, cx, cy, t) {
    const x = Math.round(bl.x - cx), y = Math.round(bl.y - cy)
    if (bl.team === 'ally') {
      // 爆弾：投げられているあいだは山なりに飛び、着いたら導火線が光る（爆発の範囲の線は描かない。敵の予兆と紛らわしいので）
      const fl = bl.total - bl.t
      if (fl < bl.flight) {
        const k = fl / bl.flight
        const bx = bl.sx + (bl.x - bl.sx) * k - cx, by = bl.sy + (bl.y - bl.sy) * k - cy - Math.sin(k * Math.PI) * 26
        disc(Math.round(bx), Math.round(by), 2, c('ink')); px(Math.round(bx), Math.round(by) - 3, c('or2'))
        px(Math.round(bl.x - cx), Math.round(bl.y - cy), c('ye2')) // 落ちる場所の印（味方の爆弾は黄色。赤は敵の予兆と紛らわしい）
      } else {
        disc(x, y, 2, c('ink'))
        px(x + 1, y - 3, Math.floor(t * 20) & 1 ? c('ye3') : c('or2'))
      }
    } else {
      // ボスの雨: 足元の予兆と同じく、地面を暗くした丸。落ちるまでに、小さい丸から広がっていく
      const k = 1 - bl.t / bl.total
      darkDisc(x, y, Math.max(3, bl.r * (0.35 + 0.65 * k)))
    }
  }
  // 予兆: 足元の円（殴る・叩きつける）だけ描く。弾を撃つ線・扇形と突進の線は描かない（撃つ敵・突進する敵が点滅する。drawEnemy）
  function drawTele(tl, cx, cy, t) {
    if (tl.k !== 'circle') return
    const x = Math.round(tl.x - cx), y = Math.round(tl.y - cy) + 4
    // 色は付けず、地面を少し暗くした丸（重なっても暗くなるのは一度だけ。人や敵はこの上に描く）
    darkDisc(x, y, tl.r)
  }
  function darkDisc(cx, cy, r) {
    const r2 = r * r
    for (let dy = -Math.ceil(r); dy <= r; dy++) {
      const yy = cy + dy
      if (yy < 0 || yy >= H) continue
      for (let dx = -Math.ceil(r); dx <= r; dx++) {
        const xx = cx + dx
        if (xx < 0 || xx >= W || dx * dx + dy * dy > r2) continue
        fb[yy * W + xx] = dark(fb[yy * W + xx])
      }
    }
  }
  // 剣の振り：太い一筆の弧（どの向きにも振れるので、プログラムで描く）。先頭（振り終わりの側）が太く、尾（振り始めの側）へ細く尖る。
  // 色は 2 つ: 外側が白、内側が水色（当たったら黄）。両側のふちは少しだけ不揃い（形はいつも同じ、決まった乱数）。
  // 前の 4 割で扇の端から端へ走り、残りで尾が先頭へ縮んで消える。k は 0〜1
  function drawSlash(f, x, y, k) {
    const sweep = Math.min(1, k / 0.4)
    const tail = k < 0.4 ? 1 : Math.max(0, 1 - (k - 0.4) / 0.6)   // 見えている尾の長さ（扇の幅に対して）
    const R = f.r + 1, span = 2 * f.half, lead = -f.half + span * sweep
    const head = 11 * (0.4 + 0.6 * tail)                              // 先頭の太さ
    const cw = Math.cos(f.ang), sw = Math.sin(f.ang)
    const white = c('white'), inner = c(f.hit ? 'ye2' : 'bl5')
    const lim = Math.ceil(R + 3)
    for (let dy = -lim; dy <= lim; dy++) {
      for (let dx = -lim; dx <= lim; dx++) {
        const d = Math.hypot(dx, dy)
        const rel = Math.atan2(dx * -sw + dy * cw, dx * cw + dy * sw)   // 振る向きから見た角度
        const age = (lead - rel) / span                                 // 刃が通ってからの遅れ（0〜1）
        if (rel > lead || rel < -f.half || age > tail) continue
        const a = age / Math.max(tail, 0.01)                            // 0 先頭〜1 尾の端
        const pos = Math.floor((rel + f.half) * R)                      // 弧にそった位置（点で数える。跡の模様は地面に残る）
        let th = head * Math.pow(1 - a, 1.1)                            // 先頭が太く、尾へ細く
        const out = R + (th >= 4 && hash(11, (pos / 5) | 0) % 4 === 0 ? -1 : 0)            // 外のふちを、ときどき 1 点へこませる
        if (th >= 3) th += (hash(7, (pos / 3) | 0) % 3) - 1                                // 内のふちの不揃い（±1）
        th = Math.round(th)
        if (th < 1) continue
        const off = Math.floor(out + 0.5 - d)                           // 外のふちからの深さ
        if (off < 0 || off >= th) continue
        px(x + dx, y + dy, th >= 3 && off >= Math.ceil(th * 0.55) ? inner : white)   // 内側 4 割ほどが水色
      }
    }
  }
  // 盾の「[」: 中心 (cx, cy) から向き dir へ dist 離れた所に、向きと直角な長さ 2×half の線。両端は体の方へ 3 点折り返す。w は太さ
  function drawBracket(cx, cy, [dx, dy], dist, half, w, col, edge) {
    const nx = -dy, ny = dx
    const at = (along, side) => [Math.round(cx + dx * along + nx * side), Math.round(cy + dy * along + ny * side)]
    for (let t = 0; t < w; t++) {
      const d = dist - t
      for (let sd = -half; sd <= half; sd += 0.5) { const [xx, yy] = at(d, sd); px(xx, yy, Math.abs(sd) > half - 1 ? edge : col) }
      for (const sgn of [-1, 1]) for (let b = 0; b <= 3; b += 0.5) { const [xx, yy] = at(d - b, sgn * (half - t * 0)); px(xx, yy, edge) }
    }
  }
  function drawFx(S) {
    const cx = S.cam.x, cy = S.cam.y
    for (const f of S.fx) {
      const x = Math.round(f.x - cx), y = Math.round(f.y - cy)
      const k = f.t / f.life
      if (f.k === 'spark') { px(x, y, c(f.c)); if (k < 0.5) px(x + 1, y, c(f.c)) }
      else if (f.k === 'ring') ringPx(x, y, f.r * (0.4 + 0.6 * k), c(f.c))
      else if (f.k === 'cut') {
        // 斬った跡：はじめは太く、すぐ細くなる
        const dx = Math.cos(f.ang) * f.len, dy = Math.sin(f.ang) * f.len
        lineThick(Math.round(x - dx), Math.round(y - dy), Math.round(x + dx), Math.round(y + dy), k < 0.5 ? 2 : 1, c('white'))
      }
      else if (f.k === 'corpse') {
        // とどめを刺した敵：点滅しながら飛んでいく
        const ghost = { kind: f.kind, def: f.def, anim: 0, state: 'idle', face: f.face, hp: 1, maxhp: 1, rad: f.rad, flash: Math.floor(f.t * 30) & 1 ? 1 : 0 }
        drawEnemy(ghost, x, y + 6, S.t)
      }
      else if (f.k === 'slash') drawSlash(f, x, y, k)
      else if (f.k === 'impact') {                   // ハンマーを叩きつけた衝撃: 白い輪が一瞬広がり、放射状の短い線、地面のひび
        const r = 3 + 9 * Math.min(1, k * 2.5)
        if (k < 0.6) ringPx(x, y, r, k < 0.3 ? c('white') : c('gy5'), 0.6)
        if (k < 0.45) for (let i = 0; i < 8; i++) {
          const a = i * 0.785, r0 = r + 1, r1 = r + (f.hit ? 6 : 4)
          lineThick(Math.round(x + Math.cos(a) * r0), Math.round(y + Math.sin(a) * r0 * 0.6), Math.round(x + Math.cos(a) * r1), Math.round(y + Math.sin(a) * r1 * 0.6), 1, f.hit ? c('ye3') : c('white'))
        }
        for (let i = 0; i < 4; i++) { const a = i * 1.57 + 0.6; lineThick(x, y, Math.round(x + Math.cos(a) * 7), Math.round(y + Math.sin(a) * 4), 1, c('br1')) }   // ひび
        if (k < 0.3) disc(x, y, 2, c('white'))
      }
      else if (f.k === 'quake') {                    // 地面を叩いた衝撃波: 2 重の輪が外へ広がり、地面にひびの線
        const r = f.r * (0.3 + 0.7 * Math.min(1, k * 1.6))
        ringPx(x, y, r, k < 0.5 ? c('white') : c('br5'), 0.6)
        ringPx(x, y, r * 0.7, c('br4'), 0.6, true)
        if (k < 0.6) for (let i = 0; i < 8; i++) { const a = i * 0.785 + 0.3; lineThick(Math.round(x + Math.cos(a) * 5), Math.round(y + Math.sin(a) * 3), Math.round(x + Math.cos(a) * r * 0.5), Math.round(y + Math.sin(a) * r * 0.3), 1, c('br1')) }
      }
      else if (f.k === 'stab') {                     // ナイフの突き: ナイフ（握り・つば・幅のある刃・とがった先）が前へ突き出て、後ろに短い残像
        const ca = Math.cos(f.ang), sa = Math.sin(f.ang), tip = 8 + f.r * Math.min(1, k * 2.5)
        const at = (r, side, col) => px(Math.round(x + ca * r - sa * side), Math.round(y + sa * r + ca * side), col)
        if (k < 0.7) for (let r = 4; r < tip - 12; r++) if (r & 1) at(r, 0, c('gy4'))   // 残像
        for (let r = tip - 14; r < tip - 9; r++) { at(r, 0, c('br3')); at(r, 1, c('br2')) }   // 握り
        for (let sd = -2; sd <= 2; sd++) at(tip - 9, sd, c('gy6'))   // つば
        for (let r = tip - 8; r <= tip; r++) {                       // 刃: 根元は 3 ドット幅、先へ細く
          const w = r < tip - 5 ? 1 : r < tip - 1 ? 0.5 : 0
          at(r, 0, c('white'))
          if (w >= 0.5) at(r, -1, c('white'))
          if (w >= 1) at(r, 1, c('gy5'))
        }
      }
      else if (f.k === 'bash') {                     // 盾で押す: 「[」が太くなって前へ飛び出す
        const dir = [Math.cos(f.ang), Math.sin(f.ang)]
        drawBracket(x, y, dir, 11 + 12 * k, 8 + 2 * k, k < 0.6 ? 2 : 1, c('white'), k < 0.5 ? c('gy6') : c('gy4'))
      }
      else if (f.k === 'num') { text(f.text, x - textW(f.text) / 2 + 1, y + 1, c('black')); text(f.text, x - textW(f.text) / 2, y, c(f.c)) }
      else if (f.k === 'zap') {
        for (let i = 0; i + 1 < f.pts.length; i++) {
          const [ax, ay] = f.pts[i], [bx, by] = f.pts[i + 1]
          const n = 5
          let px0 = ax - cx, py0 = ay - cy
          for (let j = 1; j <= n; j++) {
            const nx = ax + ((bx - ax) * j) / n - cx + (j < n ? ((hash(j + i * 7, Math.floor(f.t * 40)) % 7) - 3) : 0)
            const ny = ay + ((by - ay) * j) / n - cy + (j < n ? ((hash(j * 3, i + Math.floor(f.t * 40)) % 7) - 3) : 0)
            lineThick(Math.round(px0), Math.round(py0), Math.round(nx), Math.round(ny), 1, c(f.big ? 'white' : 'ye3'))
            lineThick(Math.round(px0) + 1, Math.round(py0), Math.round(nx) + 1, Math.round(ny), 1, c('bl5'))
            if (f.big) lineThick(Math.round(px0), Math.round(py0) + 1, Math.round(nx), Math.round(ny) + 1, 1, c('ye3'))   // 満タンの雷は太く
            px0 = nx
            py0 = ny
          }
        }
      }
    }
  }

  // --- ミニマップ（3 タイルを 1 ドットに）---
  let mini = null
  function buildMini(S) {
    const w = 64, h = 48
    mini = { w, h, base: new Uint8Array(w * h) }
    const ground = [c('gr3'), c('gr2'), c('sa2'), c('gy6'), c('gy2'), c('gy3')]
    const solid = [c('gr1'), c('gr0'), c('sa1'), c('gy4'), c('ink'), c('gy1')]
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const tx = x * 3 + 1, ty = y * 3 + 1
        const t0 = S.world.tiles[ty * MW + tx], b0 = S.world.biome[ty * MW + tx]
        let col = ground[b0]
        if (t0 === T.TREE || t0 === T.ROCK || t0 === T.WALL) col = solid[b0]
        else if (t0 === T.WATER) col = b0 === B.SNOW ? c('bl5') : b0 === B.VOLCANO ? c('or2') : c('wt2')
        else if (t0 === T.PATH) col = c('br4')
        mini.base[y * w + x] = col
      }
    }
  }
  function drawMini(S, t) {
    if (!mini) buildMini(S)
    const ox = MINI.x + 1, oy = MINI.y + 1
    rect(MINI.x, MINI.y, MINI.w, MINI.h, GLASS)     // 枠と、まだ見ていない所は半透明
    for (let y = 0; y < mini.h; y++) {
      for (let x = 0; x < mini.w; x++) {
        const k = (y * 3 + 1) * MW + x * 3 + 1
        const seen = S.seen[k] | S.seen[k - 1] | S.seen[k + 1] | S.seen[k - MW] | S.seen[k + MW]
        if (seen) px(ox + x, oy + y, mini.base[y * mini.w + x])
      }
    }
    const seenAt = (tx, ty) => S.seen[ty * MW + tx]
    if (Math.floor(t * 2) & 1) for (const cg of S.cages) {   // まだ助けていない檻を全部、黄色の 1 ドットで点滅（助けた檻は出さない）
      if (!cg.opened) px(ox + Math.floor(cg.tx / 3), oy + Math.floor(cg.ty / 3), c('ye2'))
    }
    // 魔王の居場所は出さない（2026-10-18。探す楽しみを残す）
    // いまの画面の範囲
    const vx0 = Math.floor(S.cam.x / TILE / 3), vy0 = Math.floor(S.cam.y / TILE / 3)
    const vw = Math.max(2, Math.round(VIEW_W / TILE / 3)), vh = Math.max(2, Math.round(VIEW_H / TILE / 3))
    for (let i = 0; i <= vw; i++) { px(ox + vx0 + i, oy + vy0, c('white')); px(ox + vx0 + i, oy + vy0 + vh, c('white')) }
    for (let j = 0; j <= vh; j++) { px(ox + vx0, oy + vy0 + j, c('white')); px(ox + vx0 + vw, oy + vy0 + j, c('white')) }
    for (const a of S.allies) if (a !== S.leader) px(ox + Math.floor(a.x / TILE / 3), oy + Math.floor(a.y / TILE / 3), c('bl5'))
    const lx = ox + Math.floor(S.leader.x / TILE / 3), ly = oy + Math.floor(S.leader.y / TILE / 3)
    if (Math.floor(t * 4) & 1) rect(lx - 1, ly - 1, 3, 3, c('white'))
  }

  // --- HUD ---
  // glass: 半透明（ゲームの画面の上に乗るボタン）。ふだんは塗る（タイトル・ポーズなど、後ろが暗い画面）
  function drawButton(b, label, hot, sc = 2, glass = false) {
    if (glass) {
      rect(b.x, b.y, b.w, b.h, hot ? GLASS_HOT : GLASS)
      rect(b.x, b.y, b.w, 1, c('gy4'))
    } else {
      rect(b.x, b.y, b.w, b.h, c('black'))
      rect(b.x + 1, b.y + 1, b.w - 2, b.h - 2, hot ? c('gy3') : c('gy1'))
      rect(b.x + 1, b.y + 1, b.w - 2, 1, c('gy3'))
    }
    text(label, b.x + b.w / 2 - textW(label, sc) / 2, b.y + b.h / 2 - (sc * 5) / 2, c('gy6'), sc)
  }
  // 半透明の丸いボタン。振った直後は明るくする
  // ポーズ・前・次のボタン。ox, oy: ずらす分（余白の絵に描くとき）
  // glass: 画面の上では半透明、余白（後ろが黒い）では塗る
  function drawNavBtns(ox, oy, glass = true) {
    const at = (b) => ({ ...b, x: b.x + ox, y: b.y + oy })
    const sc = PREV_BTN.w >= 32 ? 3 : 2               // 大きいボタン（スマホの余白）は、字と線も太く
    drawButton(at(PREV_BTN), '<', false, sc, glass)
    drawButton(at(NEXT_BTN), '>', false, sc, glass)
    const pb = at(PAUSE_BTN)
    drawButton(pb, '', false, sc, glass)
    const m = Math.round(pb.w * 0.27), th = sc, gap = Math.round((pb.h - 2 * m - th) / 2)
    for (let i = 0; i < 3; i++) rect(pb.x + m, pb.y + m + i * gap, pb.w - 2 * m, th, c('gy6'))   // ハンバーガー（三本線）
  }
  // b: ボタンの場所（ふだんは画面の右下。余白に出すときは余白の絵の座標）
  function drawSwingBtn(S, L, b = SWING_BTN) {
    const { x, y, r } = b
    const hot = S.t - (L.swingT ?? -9) < 0.1
    if (b.solid) disc(x, y, r, hot ? c('gy3') : c('gy1'))   // 余白（後ろが黒い）では透かさない
    else disc(x, y, r, hot ? GLASS_HOT : GLASS)     // 画面の上では半透明（網掛けをやめた。2026-10-18）
    ringPx(x, y, r, hot ? c('white') : c('gy5'), 1)
    const col = hot ? c('ye3') : c('white')
    if (JOBS[L.job].heavy) {                         // ハンマーの印
      rect(x - 7, y - 9, 12, 7, col)
      lineThick(x - 1, y - 2, x - 1, y + 9, 2, col)
      return
    }
    if (JOBS[L.job].kind === 'lightning') {          // 雷術師の印（稲妻）
      lineThick(x + 4, y - 9, x - 3, y, 2, col)
      lineThick(x - 3, y, x + 3, y, 2, col)
      lineThick(x + 3, y, x - 4, y + 9, 2, col)
      return
    }
    if (JOBS[L.job].kind === 'boomerang') {          // ブーメランの印（く の字）。戻ってくるまでは薄く
      const cc = L.boomOut ? c('gy4') : col
      lineThick(x - 7, y - 6, x + 1, y + 1, 2, cc)
      lineThick(x + 1, y + 1, x - 6, y + 8, 2, cc)
      return
    }
    if (JOBS[L.job].kind === 'magic') {              // 氷術師の印（つらら）: 横棒から、長さの違うつららが 3 本下がる（ちょん押しで撃つのがつらら）
      rect(x - 9, y - 8, 19, 2, col)                // 上の横棒
      for (const [cx, len] of [[-7, 9], [0, 14], [7, 7]]) {   // 3 本のつらら: 幅 5 から先へ細く、とがる
        for (let r = 0; r < len; r++) {
          const half = Math.max(0, Math.round(2 * (1 - r / (len - 1))))
          rect(x + cx - half, y - 6 + r, half * 2 + 1, 1, col)
        }
      }
      return
    }
    if (JOBS[L.job].backstab) {                      // 盗賊の印（ナイフ）: 幅のある短い刃と、とがった先、つば、太い握り（形だけで見せる）
      const KNIFE = [
        '...........B',
        '..........BB',
        '.........BBb',
        '........BBb.',
        '.......BBb..',
        '......BBb...',
        '..g..BBb....',
        '...gBBb.....',
        '...hgb......',
        '..hhhg......',
        '.hhh..g.....',
        'hhh.........',
      ]
      KNIFE.forEach((row, j) => { for (let i = 0; i < row.length; i++) if (row[i] !== '.') px(x - 6 + i, y - 6 + j, col) })   // ほかの職の印と同じく 1 色
      return
    }
    if (JOBS[L.job].kind === 'heal') {               // 僧侶の印（十字）
      rect(x - 2, y - 9, 5, 18, col)
      rect(x - 8, y - 3, 17, 5, col)
      return
    }
    if (JOBS[L.job].kind === 'bomb') {               // 爆弾の印
      disc(x - 1, y + 2, 6, col)
      disc(x - 1, y + 2, 4, hot ? c('ye3') : c('gy4'))
      lineThick(x + 3, y - 3, x + 6, y - 7, 1, col)
      px(x + 7, y - 8, c('or2')); px(x + 8, y - 9, c('ye2'))
      return
    }
    if (JOBS[L.job].taunt) {                         // 盾の印
      rect(x - 6, y - 8, 13, 2, col)
      lineThick(x - 6, y - 8, x - 6, y + 2, 1, col)
      lineThick(x + 6, y - 8, x + 6, y + 2, 1, col)
      lineThick(x - 6, y + 2, x, y + 9, 1, col)
      lineThick(x + 6, y + 2, x, y + 9, 1, col)
      lineThick(x, y - 5, x, y + 5, 1, col)
      return
    }
    if (JOBS[L.job].kind === 'arrow') {              // 矢の印
      lineThick(x - 8, y + 8, x + 7, y - 7, 1, col)
      lineThick(x + 3, y - 8, x + 8, y - 8, 1, col)
      lineThick(x + 8, y - 8, x + 8, y - 3, 1, col)
      lineThick(x - 9, y + 5, x - 5, y + 9, 1, col)
      lineThick(x - 7, y + 3, x - 3, y + 7, 1, col)
      return
    }
    // 剣の印
    lineThick(x - 7, y + 7, x + 8, y - 8, 2, col)
    lineThick(x - 8, y + 2, x - 2, y + 8, 1, col)
    rect(x - 10, y + 9, 2, 2, col)
  }
  function drawHud(S, ui, t) {
    const L = S.leader
    if (S.nightmare) shadowText(`NIGHTMARE ${fmtTime(S.t)}`, 4, 4, c('rd3'), 1)   // ナイトメアは耐えた時間
    else shadowText(`RESCUED ${S.rescued}/${S.total}`, 4, 4, c('ye3'), 1)
    shadowText(`ALLIES ${S.allies.length}`, 4, 12, c('white'), 1)
    const J = JOBS[L.job]
    const pw = 116, px0 = Math.round((W - pw) / 2), py0 = H - 29
    rect(px0, py0, pw, 25, GLASS)                  // 名前の欄は半透明

    text(L.name, px0 + 5, py0 + 4, c('white'), 1)
    text(J.label, px0 + 5 + textW(L.name, 1) + 4, py0 + 4, c('gy5'), 1)   // 職は薄く（ポーズの一覧と同じ）
    text(`LV${L.lvl}`, px0 + pw - 5 - textW(`LV${L.lvl}`, 1), py0 + 4, c('ye2'), 1)
    rect(px0 + 5, py0 + 12, pw - 10, 5, c('black'))
    rect(px0 + 6, py0 + 13, Math.max(0, Math.round(((pw - 12) * L.hp) / L.maxhp)), 3, L.hp < L.maxhp * 0.35 ? c('rd3') : c('lime'))
    rect(px0 + 5, py0 + 18, pw - 10, 3, c('black'))
    if (L.lvl < MAX_LV) rect(px0 + 6, py0 + 19, Math.round(((pw - 12) * L.xp) / xpNeed(L.lvl)), 1, c('bl4'))
    if (!ui.pad) drawNavBtns(0, 0)                  // 余白があるときは、余白に出す（drawPad）
    if (S.isManual?.(L) && !ui.pad) drawSwingBtn(S, L)   // 余白があるときは、余白に出す（drawPad）
    drawMini(S, t)
    // ボスの体力
    const b = S.boss
    if (b && b.hp > 0 && b.aggro) {
      const bw = 150, bx = Math.round((W - bw) / 2) - 24, by = 4
      rect(bx - 1, by - 1, bw + 2, 8, c('black'))
      rect(bx, by, bw, 6, c('rd0'))
      rect(bx, by, Math.max(0, Math.round((bw * b.hp) / b.maxhp)), 6, b.hp < b.maxhp * 0.33 ? c('or2') : c('rd3'))
      shadowText('DEMON KING', bx + bw / 2 - textW('DEMON KING', 1) / 2, by + 9, c('white'), 1)
    }
    if (ui.stick) {
      ringPx(ui.stick.ax, ui.stick.ay, 13, c('gy5'), 1)
      disc(ui.stick.x, ui.stick.y, 3, c('gy6'))
    }
    if (S.banner) {
      const bw = Math.max(110, textW(S.banner, 2) + 16), bx = Math.round((W - bw) / 2)
      rect(bx, 44, bw, 18, c('black'))
      rect(bx + 1, 45, bw - 2, 16, c('gy1'))
      text(S.banner, W / 2 - textW(S.banner, 2) / 2, 49, c('ye3'), 2)
    }
  }

  // タイトル・ポーズ・ゲームオーバー・クリアの画面: 後ろの世界を暗い色にする（網掛けの代わり）。
  // 世界と HUD を分けて描くとき（main.js）は、世界の絵のほうを暗くする（draw の world で）。HUD の絵の透明（255）はそのまま
  const dimmed = (S, ui) => ui.screen === 'title' || ui.paused || S.state === 'over' || (S.state === 'win' && S.winT >= 2.5)
  function overlayDark() {
    for (let i = 0; i < fb.length; i++) if (fb[i] !== 255) fb[i] = dark(fb[i])
  }
  const fmtTime = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`
  function drawTitle(ui, t) {
    overlayDark()
    const title = 'GUNZO'
    const sc = 6
    const x = W / 2 - textW(title, sc) / 2
    text(title, x + 2, 24 + 2, c('black'), sc)
    text(title, x, 24, c('ye2'), sc)
    const sub = '99 FRIENDS - 100 HEROES'
    text(sub, W / 2 - textW(sub, 1) / 2, 72, c('white'), 1)
    if (ui.slotMenu) {                              // 選んだスロットの項目
      const o = ui.slots[ui.slotSel - 1]
      const h = `SLOT ${o.n}`
      text(h, W / 2 - textW(h, 2) / 2, 92, c('ye3'), 2)
      ui.slotMenu.forEach((it, i) => {
        const b = slotItemBtn(i)
        drawButton(b, it.label, false, 1)
        if (it.id === 'delete' && ui.delArm) text(it.label, b.x + b.w / 2 - textW(it.label, 1) / 2, b.y + b.h / 2 - 2, c('rd3'), 1)
        if (it.id === 'nightmare') text(it.label, b.x + b.w / 2 - textW(it.label, 1) / 2, b.y + b.h / 2 - 2, c('rd3'), 1)
      })
    } else {
      ui.slots.forEach((o, i) => {
        const b = SLOT_BTNS[i]
        rect(b.x, b.y, b.w, b.h, c('black'))
        rect(b.x + 1, b.y + 1, b.w - 2, b.h - 2, o.cleared ? c('bl1') : c('gy1'))
        rect(b.x + 1, b.y + 1, b.w - 2, 1, c('gy3'))
        text(String(o.n), b.x + 6, b.y + 9, c('ye2'), 2)
        if (o.empty && !o.suspended) text('NEW GAME', b.x + 24, b.y + 11, c('gy5'), 1)
        else o.lines.forEach((l, k) => l && text(l, b.x + 24, b.y + 6 + k * 9, k === 1 && o.suspended ? c('ye3') : k === 1 && o.cleared ? c('rd3') : c('white'), 1))
        if (o.cleared) text('*', b.x + b.w - 10, b.y + 6, c('ye3'), 1)
      })
      const rec = [ui.best ? `BEST CLEAR ${fmtTime(ui.best)}` : '', ui.nmBest ? `NIGHTMARE ${fmtTime(ui.nmBest)}` : ''].filter(Boolean).join('   ')
      if (rec) text(rec, W / 2 - textW(rec, 1) / 2, 196, c('gy5'), 1)
      const tip = 'TAP A SLOT (KEYS 1 2 3)'
      text(tip, W / 2 - textW(tip, 1) / 2, 210, c('gy4'), 1)
    }
  }
  // ポーズ: 助けた仲間の一覧（歩く絵・名前・職・今のレベル・次のレベルまでの経験値）。押すとその仲間に切り替わる
  function drawPause(S, ui, t) {
    rect(0, 0, W, H, c('black'))                  // 一覧は字が多いので、後ろの世界は見せない
    text('PAUSE', 4, 4, c('white'), 2)
    const info = `TIME ${fmtTime(S.t)}  ALLIES ${S.allies.filter((a) => a.alive).length}`
    text(info, W - 4 - textW(info, 1), 7, c('gy5'), 1)
    const pages = listPages(S), page = listPage(S, ui)
    const people = listPeople(S)
    const fallen = people.filter((a) => a.fallen).length
    if (fallen) { const f = `FALLEN ${fallen}`; text(f, W - 4 - textW(info, 1) - 8 - textW(f, 1), 7, c('rd3'), 1) }
    people.slice(page * LIST_PER, page * LIST_PER + LIST_PER).forEach((a, i) => {
      const { x, y, w, h } = listCell(i)
      const me = a === S.leader
      rect(x, y, w, h, me ? c('bl1') : a.fallen ? c('black') : c('gy1'))
      if (a.fallen) {                               // 倒れた仲間: 暗い枠に、暗くした止まった絵と赤い印
        rect(x, y, w, 1, c('gy1')); rect(x, y + h - 1, w, 1, c('gy1')); rect(x, y, 1, h, c('gy1')); rect(x + w - 1, y, 1, h, c('gy1'))
        drawPerson({ job: a.job, fx: 0, fy: 1, face: 1, flash: 0, moving: false, anim: 0 }, x + 10, y + h - 1, { nobar: true, still: true })
        for (let yy = y + 1; yy < y + h - 1; yy++) for (let xx = x + 1; xx < x + 20; xx++) fb[yy * W + xx] = dark(dark(fb[yy * W + xx]))
        text(a.name, x + 21, y + 3, c('gy4'), 1)
        const lv = `LV${a.lvl}`
        text(lv, x + w - 3 - textW(lv, 1), y + 3, c('gy3'), 1)
        text(JOBS[a.job].label, x + 21, y + 10, c('gy3'), 1)
        text('FALLEN', x + w - 3 - textW('FALLEN', 1), y + 10, c('rd3'), 1)
        return
      }
      drawPerson({ job: a.job, fx: 0, fy: 1, face: 1, flash: 0, moving: true, anim: t + i * 0.17 }, x + 10, y + h - 1, { nobar: true })
      text(a.name, x + 21, y + 3, me ? c('ye3') : c('white'), 1)
      const lv = `LV${a.lvl}`
      text(lv, x + w - 3 - textW(lv, 1), y + 3, c('ye2'), 1)
      text(JOBS[a.job].label, x + 21, y + 10, c('gy5'), 1)
      const nx = a.lvl >= MAX_LV ? 'MAX' : `NEXT ${Math.max(1, Math.ceil(xpNeed(a.lvl) - a.xp))}`
      text(nx, x + w - 3 - textW(nx, 1), y + 10, c('bl4'), 1)
    })
    if (pages > 1) {
      drawButton(PAGE_PREV, '<', false)
      drawButton(PAGE_NEXT, '>', false)
      const pg = `${page + 1}/${pages}`
      text(pg, (PAGE_PREV.x + PAGE_PREV.w + PAGE_NEXT.x) / 2 - textW(pg, 1) / 2, H - 16, c('white'), 1)
    }
    for (const b of MENU_BTNS) {
      if (b.id === 'save' && !ui.canSave) {        // 戦いの最中・ナイトメアでは押せない（灰色）
        rect(b.x, b.y, b.w, b.h, c('black')); rect(b.x + 1, b.y + 1, b.w - 2, b.h - 2, c('gy1'))
        text(b.label, b.x + b.w / 2 - textW(b.label, 1) / 2, b.y + b.h / 2 - 2, c('gy3'), 1)
        continue
      }
      drawButton(b, b.id === 'sound' ? (ui.sound ? 'SOUND ON' : 'SOUND OFF') : b.label, b.id === 'save' && ui.savedFlash > 0, 1)
    }
    const note = ui.savedFlash > 0 ? 'SAVED!' : !ui.canSave && !S.nightmare && ui.saveNote ? `${ui.saveNote} - CAN'T SAVE IN BATTLE` : ui.saveNote
    if (note) text(note, 152, H - 31, ui.savedFlash > 0 ? c('ye3') : c('gy4'), 1)
  }
  function drawOver(S, ui, t) {
    overlayDark()
    if (S.nightmare) {                              // ナイトメアの終わり: 耐えた秒
      const s = 'NIGHTMARE OVER'
      text(s, W / 2 - textW(s, 3) / 2, 50, c('rd3'), 3)
      const tm = `SURVIVED ${fmtTime(S.t)}`
      text(tm, W / 2 - textW(tm, 2) / 2, 86, c('white'), 2)
      const rows = [S.nmNewBest ? 'NEW RECORD!' : S.nmBestAll ? `BEST ${fmtTime(Math.max(S.nmBestAll, S.t))}` : '', `KILLS ${S.kills}  DEMON KINGS ${S.nmBosses ?? 0}`, 'LEVELS GAINED ARE KEPT']
      rows.forEach((l, i) => l && text(l, W / 2 - textW(l, 1) / 2, 112 + i * 12, i === 0 && S.nmNewBest ? c('ye3') : c('white'), 1))
      if (Math.floor(t * 2) % 2 === 0) text('TAP TO RETURN TO TITLE', W / 2 - textW('TAP TO RETURN TO TITLE', 1) / 2, 170, c('gy5'), 1)
      return
    }
    const s = 'ALL FALLEN'
    text(s, W / 2 - textW(s, 3) / 2, 70, c('rd3'), 3)
    const r = `RESCUED ${S.rescued}/${S.total}  LOST ${S.lost}  KILLS ${S.kills}`
    text(r, W / 2 - textW(r, 1) / 2, 108, c('white'), 1)
    const m = 'TAP TO CONTINUE FROM SAVE'
    if (Math.floor(t * 2) % 2 === 0) text(m, W / 2 - textW(m, 1) / 2, 140, c('white'), 1)
  }
  function drawWin(S, t) {
    if (S.winT < 2.5) return
    overlayDark()
    const s = 'VICTORY'
    text(s, W / 2 - textW(s, 5) / 2 + 1, 25, c('black'), 5)
    text(s, W / 2 - textW(s, 5) / 2, 24, c('ye2'), 5)
    const solo = S.rescued === 0
    const perfect = S.rescued === S.total && S.lost === 0
    const title = perfect ? 'PERFECT - NO ONE LOST' : solo ? 'SOLO CLEAR' : S.rescued === S.total ? 'ALL RESCUED' : 'CLEARED'
    text(title, W / 2 - textW(title, 2) / 2, 66, perfect || solo ? c('ye3') : c('white'), 2)
    const rows = [`TIME ${fmtTime(S.t)}${S.newBest ? '  NEW RECORD!' : S.best ? `  (BEST ${fmtTime(S.best)})` : ''}`, `RESCUED ${S.rescued}/${S.total}`, `LOST ${S.lost}`, `ALIVE ${S.allies.length}`, `KILLS ${S.kills}`]   // クリア時間（早解き）
    rows.forEach((l, i) => text(l, W / 2 - textW(l, 1) / 2, 100 + i * 12, c('white'), 1))
    text('NIGHTMARE MODE UNLOCKED', W / 2 - textW('NIGHTMARE MODE UNLOCKED', 1) / 2, 164, c('rd3'), 1)
    if (Math.floor(t * 2) % 2 === 0) text('TAP TO RETURN TO TITLE', W / 2 - textW('TAP TO RETURN TO TITLE', 1) / 2, 180, c('gy5'), 1)
  }

  // --- 1フレーム ---
  // layer: 'all'（全部）、'world'（地面・人・演出だけ）、'hud'（HUD・タイトル・ポーズなど。何も描かない所は 255＝透明）
  function draw(S, ui, t, layer = 'all') {
    if (layer === 'hud') {
      fb.fill(255)
      return drawTop(S, ui, t)
    }
    drawMap(S, t)
    const cx = S.cam.x, cy = S.cam.y
    const L = S.leader
    // 地面の予兆・爆発の印は、人の下に
    for (const h of S.hazards) if (h.k) drawTele(h, cx, cy, t)
    if (L?.praying) {                                // 僧侶の癒やしの円（地面に、薄い緑の市松と、回る縁）
      const x = Math.round(L.x - cx), y = Math.round(L.y - cy) + 4
      ditherDisc(x, y, PRAY.r, c('gr5'), Math.floor(t * 6) & 1)
      ringPx(x, y, PRAY.r, c('gr6'), 1)
      for (let i = 0; i < 8; i++) { const a = t * 2 + (i * Math.PI) / 4; px(Math.round(x + Math.cos(a) * PRAY.r), Math.round(y + Math.sin(a) * PRAY.r), c('white')) }
    }
    const ents = []
    for (const g of S.cages) if (!g.opened) ents.push({ y: g.y, k: 'cage', o: g })
    for (const a of S.allies) ents.push({ y: a.y, k: 'ally', o: a })
    for (const e of S.actE) if (e.hp > 0) ents.push({ y: e.y, k: 'enemy', o: e })
    ents.sort((a, b) => a.y - b.y)
    for (const en of ents) {
      const o = en.o
      const fx = Math.round(o.x - cx), fy = Math.round(o.y - cy) + 6
      if (fx < -40 || fx > W + 40 || fy < -20 || fy > H + 70) continue
      if (en.k === 'ally') {
        if (o === L) ringPx(fx, fy - 1, 8, Math.floor(t * 4) & 1 ? c('ye3') : c('ye1'), 0.5)
        drawPerson(o, fx, fy)
        if (o === L && o.boomCast && o.aimLine && o.aimDir && S.boomLoopAt) {   // ブーメラン: 通る輪の点線
          const lp = { sx: o.x, sy: o.y - 4, dx: o.aimDir[0], dy: o.aimDir[1], D: o.boomDist }
          const n = Math.round(lp.D * 2.6)                // 道のりにそって、2 点おきに 1 点空ける点線
          for (let i = 3; i < n - 3; i++) {
            if (i % 3 === 2) continue
            const [wx, wy] = S.boomLoopAt(lp, (i / n) * 2 * Math.PI, null)
            px(Math.round(wx - cx), Math.round(wy - cy), Math.abs(i / n - 0.5) < 0.06 ? c('ye3') : c('white'))   // 折り返しの所は黄色
          }
        } else if (o === L && S.isManual?.(o) && o.aimLine && o.aimDir) {
          // 狙っている向きの線（点線）。弓は遠くまで、剣は届く所まで
          const [ax, ay] = o.aimDir, kd = JOBS[o.job].kind, len = kd === 'boomerang' ? o.boomDist : kd === 'arrow' || kd === 'magic' || kd === 'lightning' ? 70 : 30   // ブーメランは届く所まで
          for (let r = 14; r <= len; r += 3) px(Math.round(fx + ax * r), Math.round(fy - 8 + ay * r), r > len - 8 ? c('ye3') : c('white'))
        }
        if (o === L && S.isManual?.(o)) {
          // 振る向きの印：体のまわりに小さな矢じり（狙っている間は、狙いの向き）
          const cx0 = fx, cy0 = fy - 8, [ax, ay] = o.aiming && o.aimDir ? o.aimDir : [o.fx, o.fy]
          for (let r = 12; r <= 15; r++) px(Math.round(cx0 + ax * r), Math.round(cy0 + ay * r), c('ye3'))
          px(Math.round(cx0 + ax * 13 - ay * 2), Math.round(cy0 + ay * 13 + ax * 2), c('ye3'))
          px(Math.round(cx0 + ax * 13 + ay * 2), Math.round(cy0 + ay * 13 - ax * 2), c('ye3'))
        }
        if (o === L && o.guarding && o.guardDir) {   // 盾を構えている: 正面に「[」の形（構えてすぐのジャストガードの間は白く光る）
          const just = S.t - o.guardT < GUARD.just
          drawBracket(fx, fy - 8, o.guardDir, 11, 7, 1, just ? c('white') : c('gy6'), just ? c('white') : c('gy4'))
        }
        if (o === L && o.gauge != null) {             // 雷術師が溜めている: 頭の上にゲージ（満タンで光る）
          const gy = fy - SH - 4
          rect(fx - 7, gy, 14, 3, c('black'))
          rect(fx - 6, gy + 1, Math.round(12 * o.gauge), 1, o.gauge >= 1 ? (Math.floor(t * 16) & 1 ? c('white') : c('ye3')) : c(JOBS[o.job].heavy ? 'or2' : 'ye1'))
        }
        if (o === L && o.casting && o.aimLine) {      // 氷術師が溜めている: 頭の上にゲージ（満タンで光る）
          const k = Math.min(1, (S.t - o.castT - SHOOT.tap) / FREEZE.charge), gy = fy - SH - 4
          rect(fx - 7, gy, 14, 3, c('black'))
          rect(fx - 6, gy + 1, Math.round(12 * k), 1, o.castReady ? (Math.floor(t * 16) & 1 ? c('white') : c('bl5')) : c('bl4'))
        }
        if (o === L && o.throwing && o.aimLine && o.throwAt) {   // 爆弾を狙っている: 山なりの線と、落ちる所の爆発の範囲
          const tx = Math.round(o.throwAt[0] - cx), ty = Math.round(o.throwAt[1] - cy)
          for (let i = 1; i < 12; i++) {
            const k = i / 12
            px(Math.round(fx + (tx - fx) * k), Math.round(fy - 8 + (ty - fy + 8) * k - Math.sin(k * Math.PI) * 26), i & 1 ? c('white') : c('gy5'))
          }
          ringPx(tx, ty, THROW.r, Math.floor(t * 8) & 1 ? c('or2') : c('ye2'), 1, true)
          px(tx, ty, c('white')); px(tx - 1, ty, c('or2')); px(tx + 1, ty, c('or2')); px(tx, ty - 1, c('or2')); px(tx, ty + 1, c('or2'))
        }
        if (o === L && o.charge != null) {          // 弓を引いている: 頭の上にためのゲージ。引き絞りきったら光る
          const k = Math.min(1, o.charge / SHOOT.full), full = k >= 1
          const gy = fy - SH - 4
          rect(fx - 7, gy, 14, 3, c('black'))
          rect(fx - 6, gy + 1, Math.round(12 * k), 1, full ? (Math.floor(t * 16) & 1 ? c('white') : c('ye3')) : c('bl4'))
        }
        if (o === L) {
          const bob = Math.round(Math.sin(t * 6) * 1.5)
          const ay = fy - SH - 11 - bob
          for (let i = 0; i < 4; i++) rect(fx - 3 + i, ay + i, 7 - i * 2, 1, c('ye2'))
          px(fx, ay + 4, c('ye2'))
        }
      } else if (en.k === 'enemy') drawEnemy(o, fx, fy, t)
      else drawCage(o, fx, fy, t)
    }
    for (const bl of S.blasts) drawBlast(bl, cx, cy, t)
    for (const p of S.projs) drawProj(p, cx, cy)
    drawFx(S)
    if (layer === 'world' && dimmed(S, ui)) overlayDark()   // 世界だけの絵: ここで暗くする（HUD の絵は透明のまま）
    if (layer === 'all') drawTop(S, ui, t)
  }
  function drawTop(S, ui, t) {
    if (ui.screen !== 'title' && !ui.paused) drawHud(S, ui, t)
    if (ui.screen === 'title') drawTitle(ui, t)
    else if (ui.paused) drawPause(S, ui, t)
    else if (S.state === 'over') drawOver(S, ui, t)
    else if (S.state === 'win') drawWin(S, t)
  }

  // 画面の外の余白（スマホ）: 移動のスティックと振るボタン。fb は余白の絵（画面全体）、ui.pad の座標はその上のドット
  function drawPad(S, ui, t) {
    fb.fill(255)
    const P = ui.pad
    if (!P || ui.screen !== 'play' || ui.paused || S.state !== 'play' || !S.leader) return
    const st = ui.padStick
    if (st) {
      ringPx(Math.round(st.ax + P.ox), Math.round(st.ay + P.oy), 16, c('gy5'), 1)
      disc(Math.round(st.x + P.ox), Math.round(st.y + P.oy), 5, c('gy6'))
    } else if (P.stick) {                           // 触っていないとき: 移動できる場所の目印
      ringPx(P.stick.x + P.ox, P.stick.y + P.oy, 16, c('gy2'), 1)
      disc(P.stick.x + P.ox, P.stick.y + P.oy, 3, c('gy2'))
    }
    if (S.isManual?.(S.leader)) drawSwingBtn(S, S.leader, { x: SWING_BTN.x + P.ox, y: SWING_BTN.y + P.oy, r: SWING_BTN.r, solid: true })
    drawNavBtns(P.ox, P.oy, false)
  }

  return { draw, drawPad, drawMap, drawFx, drawProj, text, rect, px, tileSets: () => ({ SETS, CASTLE_SET }) }   // tileSets: タイルの絵（tools/pixel.mjs が下書きに書き出す）
}
