// 描画。640x480 のインデックスバッファ（fb）にパレット番号で描く。DOM は使わない
import { P } from './palette.js'
import { TILE, MW, MH, T, B } from './world.js'
import { JOBS, VIEW_W, VIEW_H, MAX_LV, xpNeed } from './sim.js'
import { SPRITE_DATA, colorTable, W as SW, H as SH } from './sprites.js'

export const W = VIEW_W
export const H = VIEW_H

// 画面のボタン（fb 座標）
export const PREV_BTN = { x: 10, y: H - 48, w: 36, h: 36 }
export const NEXT_BTN = { x: 52, y: H - 48, w: 36, h: 36 }
export const PAUSE_BTN = { x: W - 148, y: 10, w: 30, h: 30 }
export const MINI = { x: W - 108, y: 10, w: 98, h: 74 }
export const NEW_BTN = { x: W / 2 - 110, y: 330, w: 220, h: 40 }
export const CONT_BTN = { x: W / 2 - 110, y: 380, w: 220, h: 40 }
export const MENU_BTNS = [
  { id: 'resume', label: 'RESUME', x: W / 2 - 110, y: 190, w: 220, h: 40 },
  { id: 'sound', label: 'SOUND', x: W / 2 - 110, y: 240, w: 220, h: 40 },
  { id: 'title', label: 'TITLE', x: W / 2 - 110, y: 290, w: 220, h: 40 },
]

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

export function createRenderer(fb) {
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
          else if (k === T.DECO) blit(CASTLE_SET.deco, sx, sy)
          else blit(CASTLE_SET.floor[(tx + ty) & 1], sx, sy)
          continue
        }
        const st = SETS[bi] ?? SETS[B.GRASS]
        let tile
        switch (k) {
          case T.TREE: tile = st.tree[h & 1]; break
          case T.WATER: tile = st.water[(Math.floor(t * 1.5) + tx + ty) & 1]; break
          case T.ROCK: tile = st.rock[h & 1]; break
          case T.PATH: tile = st.path[h % 3]; break
          case T.DECO: tile = st.deco[h % 3]; break
          case T.WALL: tile = CASTLE_SET.wall; break
          case T.FLOOR: tile = CASTLE_SET.floor[(tx + ty) & 1]; break
          default: tile = st.ground[h & 3]
        }
        blit(tile, sx, sy)
      }
    }
  }

  // --- 味方 ---
  // 足元を (fx, fy) として、16x24 のドット絵を描く（右向きの絵を、左向きなら反転する）
  function drawPerson(o, fx, fy, opts = {}) {
    const flash = o.flash > 0
    const right = o.face >= 0
    const walk = o.moving && !opts.still
    const step = walk ? Math.floor(o.anim * 9) & 1 : 0
    const frame = step ? 'b' : 'a'
    const oy = fy - (SH - 1) - (walk && !step ? 1 : 0) // 歩くとき、足をそろえた瞬間に 1 ドット上がる
    const ox = fx - (SW >> 1)
    // 影
    rect(fx - 5, fy - 2, 11, 2, c('gy1'))
    rect(fx - 4, fy - 3, 9, 1, c('gy1'))
    const data = SPRITE_DATA[o.job]?.[frame]
    if (data) {
      const tbl = colorTable(o.job, o.cloth, o.hair, P)
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

  // --- 敵 ---
  function drawBlob(e, fx, fy, col) {
    const sq = Math.floor(e.anim * 4) & 1
    const rows = sq ? [3, 5, 6, 6, 6, 6, 5] : [3, 5, 6, 6, 6, 6]
    rect(fx - 6, fy - 1, 13, 2, c('gy1'))
    rows.forEach((hw, i) => {
      const y = fy - rows.length + i - 1
      rect(fx - hw, y, hw * 2 + 1, 1, i === rows.length - 1 ? col(1) : col(0))
      if (i > 0 && i < 4) px(fx - hw + 1, y, col(2))
    })
    const s = e.face >= 0 ? 1 : 0
    const ey = fy - rows.length + 2
    px(fx - 2 + s, ey, c('ink')); px(fx + 1 + s, ey, c('ink'))
    px(fx - 2 + s, ey - 1, c('white'))
    return 11
  }
  function drawBat(e, fx, fy, col) {
    const fl = Math.floor(e.anim * 10) & 1
    const by = fy - 10 + (fl ? 0 : 1)
    const big = e.def.big ? 3 : 0
    rect(fx - 4, fy - 1, 9, 1, c('gy1'))
    rect(fx - 2 - (big ? 1 : 0), by, 5 + (big ? 2 : 0), 5 + (big ? 1 : 0), col(0))
    rect(fx - 2, by - 1, 1, 1, col(0)); rect(fx + 2, by - 1, 1, 1, col(0))
    const wy = fl ? by - 2 : by + 1
    rect(fx - 8 - big, wy, 6 + big, 2, col(1)); rect(fx + 3, wy, 6 + big, 2, col(1))
    rect(fx - 6 - big, wy + (fl ? 2 : 2), 4 + big, 1, col(1)); rect(fx + 3, wy + 2, 4 + big, 1, col(1))
    px(fx - 1, by + 1, c('rd3')); px(fx + 1, by + 1, c('rd3'))
    return 17
  }
  function drawHumanE(e, fx, fy, col) {
    const D = e.def
    const s = e.face >= 0 ? 1 : -1
    const walkb = Math.floor(e.anim * 6) & 1
    const knight = e.kind === 'knight'
    rect(fx - 4, fy - 1, 9, 2, c('gy1'))
    rect(fx - 3, fy - 3, 2, 3 - walkb, c('br1')); rect(fx + 1, fy - 3, 2, 2 + walkb, c('br1'))
    rect(fx - 4, fy - 9, 8, 6, col(0))
    if (e.kind === 'mummy') for (let y = fy - 9; y < fy - 3; y += 2) rect(fx - 4, y, 8, 1, col(2))
    rect(fx - 3, fy - 14, 6, 5, knight ? col(2) : col(1))
    if (knight) { rect(fx - 3, fy - 15, 6, 2, col(1)); px(fx, fy - 17, c('rd3')); px(fx, fy - 16, c('rd3')); rect(fx - 1 + s, fy - 12, 3, 1, c('ink')) }
    else if (e.kind === 'mummy') { for (let y = fy - 14; y < fy - 9; y += 2) rect(fx - 3, y, 6, 1, col(0)); px(fx - 1 + s, fy - 12, c('rd3')); px(fx + 1 + s, fy - 12, c('rd3')) }
    else { rect(fx - 4, fy - 15, 8, 3, col(2)); px(fx - 1 + s, fy - 11, c('ink')); px(fx + 1 + s, fy - 11, c('ink')) }
    px(fx - 5, fy - 8, col(1)); px(fx + 4, fy - 8, col(1))
    const wx = (dx) => fx + s * dx
    if (D.weapon === 'bow') { for (let j = 0; j < 7; j++) px(wx(6), fy - 14 + j, c('br3')); px(wx(5), fy - 14, c('br3')); px(wx(5), fy - 8, c('br3')); for (let j = 0; j < 5; j++) px(wx(4), fy - 13 + j, c('gy5')) }
    else if (D.weapon === 'staff') { for (let j = 0; j < 12; j++) px(wx(6), fy - 16 + j, c('br3')); rect(wx(6) - 1, fy - 19, 3, 3, col(2)); px(wx(6), fy - 18, c('white')) }
    else if (D.weapon === 'sword') { for (let j = 0; j < 8; j++) px(wx(6), fy - 17 + j, c('gy6')); px(wx(5), fy - 9, c('ye1')); px(wx(7), fy - 9, c('ye1')); rect(fx - s * 8 - (s > 0 ? 0 : -3), fy - 11, 4, 6, c('gy4')); px(fx - s * 7 + (s > 0 ? 0 : 0), fy - 9, c('rd3')) }
    return knight ? 18 : 19
  }
  function drawBeast(e, fx, fy, col) {
    const s = e.face >= 0 ? 1 : -1
    const run = Math.floor(e.anim * 8) & 1
    rect(fx - 7, fy - 1, 15, 2, c('gy1'))
    rect(fx - 6, fy - 3, 2, 3 - run, col(1)); rect(fx - 2, fy - 3, 2, 2 + run, col(1)); rect(fx + 1, fy - 3, 2, 3 - run, col(1)); rect(fx + 5, fy - 3, 2, 2 + run, col(1))
    rect(fx - 7, fy - 9, 14, 6, col(0))
    rect(fx - 7, fy - 9, 14, 1, col(2))
    // 頭
    const hx = s > 0 ? fx + 5 : fx - 10
    rect(hx, fy - 11, 6, 5, col(0))
    px(hx + (s > 0 ? 4 : 1), fy - 10, c('ink'))
    if (e.kind === 'wolf' || e.kind === 'snowwolf') { px(hx + 1, fy - 12, col(1)); px(hx + 4, fy - 12, col(1)); px(fx - s * 8, fy - 8, col(1)); px(fx - s * 9, fy - 9, col(1)) }
    else if (e.kind === 'boar') { px(hx + (s > 0 ? 6 : -1), fy - 8, c('white')); px(hx + (s > 0 ? 6 : -1), fy - 9, c('white')); px(fx - s * 8, fy - 8, col(1)) }
    else if (e.kind === 'scorpion') { for (let j = 0; j < 6; j++) px(fx - s * (6 + (j > 3 ? 5 - j : j)) , fy - 9 - j, col(0)); px(fx - s * 6, fy - 15, c('rd3')); px(hx + (s > 0 ? 6 : -1), fy - 8, col(2)); px(hx + (s > 0 ? 7 : -2), fy - 9, col(2)) }
    return 15
  }
  function drawHeavy(e, fx, fy, col) {
    const s = e.face >= 0 ? 1 : -1
    const walkb = Math.floor(e.anim * 4) & 1
    rect(fx - 9, fy - 1, 19, 3, c('gy1'))
    rect(fx - 6, fy - 6, 5, 6 - walkb, col(1)); rect(fx + 2, fy - 6, 5, 5 + walkb, col(1))
    rect(fx - 8, fy - 17, 16, 11, col(0))
    rect(fx - 8, fy - 17, 16, 2, col(2))
    rect(fx - 11, fy - 16, 4, 10, col(0)); rect(fx + 8, fy - 16, 4, 10, col(0))
    rect(fx - 11, fy - 7, 4, 3, col(1)); rect(fx + 8, fy - 7, 4, 3, col(1))
    rect(fx - 4, fy - 23, 8, 7, col(e.kind === 'yeti' ? 2 : 0))
    px(fx - 2 + s, fy - 20, c('ink')); px(fx + 1 + s, fy - 20, c('ink'))
    if (e.kind === 'yeti') { rect(fx - 4, fy - 23, 8, 2, c('white')); rect(fx - 2, fy - 18, 4, 1, c('rd3')); rect(fx - 6, fy - 13, 2, 1, c('white')) }
    else if (e.kind === 'golem') { px(fx - 5, fy - 14, c('or2')); px(fx + 3, fy - 12, c('or2')); px(fx, fy - 10, c('ye2')); px(fx - 2, fy - 20, c('ye2')); px(fx + 1, fy - 20, c('ye2')); rect(fx - 6, fy - 9, 3, 1, c('or1')) }
    else if (e.kind === 'treant') { rect(fx - 7, fy - 25, 14, 5, c('gr3')); rect(fx - 5, fy - 27, 10, 3, c('gr4')); px(fx - 6, fy - 12, c('br1')); px(fx + 5, fy - 9, c('br1')); px(fx, fy - 14, c('br1')) }
    return 28
  }
  function drawBossSprite(b, fx, fy, t) {
    const col = (n) => (b.flash > 0 ? c('white') : c(n))
    const stun = b.pstate === 'stun'
    const rage = b.hp < b.maxhp * 0.33
    const bob = Math.round(Math.sin(t * 3) * 1)
    rect(fx - 26, fy - 2, 53, 5, c('gy1'))
    // 足
    rect(fx - 14, fy - 14, 10, 14, col('pu0')); rect(fx + 5, fy - 14, 10, 14, col('pu0'))
    rect(fx - 16, fy - 3, 13, 3, col('ink')); rect(fx + 4, fy - 3, 13, 3, col('ink'))
    // マント
    rect(fx - 24, fy - 42 + bob, 49, 30, col('rd1'))
    rect(fx - 26, fy - 36 + bob, 4, 26, col('rd0')); rect(fx + 23, fy - 36 + bob, 4, 26, col('rd0'))
    for (let i = 0; i < 6; i++) rect(fx - 24 + i * 9, fy - 14 + bob, 6, 3, col('rd1'))
    // 胴
    rect(fx - 14, fy - 44 + bob, 29, 26, col('pu1'))
    rect(fx - 14, fy - 44 + bob, 29, 3, col('pu2'))
    rect(fx - 4, fy - 36 + bob, 9, 9, col(rage ? 'or2' : 'rd2')); rect(fx - 2, fy - 34 + bob, 5, 5, col('ye2'))
    // 腕と爪
    rect(fx - 24, fy - 42 + bob, 8, 18, col('pu1')); rect(fx + 17, fy - 42 + bob, 8, 18, col('pu1'))
    for (let i = 0; i < 3; i++) { rect(fx - 24 + i * 3, fy - 24 + bob, 2, 5, col('gy6')); rect(fx + 17 + i * 3, fy - 24 + bob, 2, 5, col('gy6')) }
    // 頭と角
    rect(fx - 9, fy - 58 + bob, 19, 15, col('pu2'))
    rect(fx - 9, fy - 58 + bob, 19, 3, col('pu3'))
    for (let i = 0; i < 9; i++) { px(fx - 10 - (i >> 1), fy - 59 + bob - i, col('gy6')); px(fx + 10 + (i >> 1), fy - 59 + bob - i, col('gy6')) }
    rect(fx - 11, fy - 60 + bob, 3, 3, col('gy5')); rect(fx + 9, fy - 60 + bob, 3, 3, col('gy5'))
    const eye = stun ? 'ye2' : rage ? 'ye3' : 'rd3'
    rect(fx - 6, fy - 52 + bob, 4, 3, c(eye)); rect(fx + 3, fy - 52 + bob, 4, 3, c(eye))
    rect(fx - 5, fy - 46 + bob, 11, 2, c('ink')); for (let i = 0; i < 5; i++) px(fx - 5 + i * 3, fy - 46 + bob, c('white'))
    // 冠
    for (let i = 0; i < 5; i++) rect(fx - 8 + i * 4, fy - 62 + bob - (i % 2 ? 0 : 2), 3, 4, col('ye1'))
    if (stun) for (let i = 0; i < 3; i++) { const a = t * 5 + (i * 6.28) / 3; px(Math.round(fx + Math.cos(a) * 16), Math.round(fy - 66 + Math.sin(a) * 3), c('ye3')) }
  }
  function drawEnemy(e, fx, fy, t) {
    const D = e.def
    if (e.kind === 'boss') { drawBossSprite(e, fx, fy, t); return }
    const col = (i) => (e.flash > 0 ? c('white') : c(D.col[i]))
    let top
    switch (D.shape) {
      case 'blob': top = drawBlob(e, fx, fy, col); break
      case 'bat': top = drawBat(e, fx, fy, col); break
      case 'human': top = drawHumanE(e, fx, fy, col); break
      case 'beast': top = drawBeast(e, fx, fy, col); break
      case 'heavy': top = drawHeavy(e, fx, fy, col); break
      default: top = 12
    }
    if (e.hp < e.maxhp) {
      const w = D.shape === 'heavy' ? 16 : 10
      const bw = Math.max(1, Math.round((w * e.hp) / e.maxhp))
      const by = fy - top - 3
      rect(fx - (w >> 1), by, w, 2, c('black'))
      rect(fx - (w >> 1), by, bw, 1, c('rd3'))
    }
    if (e.state === 'wind') px(fx, fy - top - 6, Math.floor(e.windT * 20) & 1 ? c('rd3') : c('ye3')) // 予兆の「!」
  }

  function drawCage(cg, fx, fy, t) {
    const fake = { job: cg.job, cloth: cg.cloth, hair: cg.hair, face: 1, flash: 0, moving: false, anim: t, lvl: 1, hp: 1, maxhp: 1 }
    drawPerson(fake, fx, fy - 1, { still: true, nobar: true })
    const f = cg.flash > 0
    const bar = f ? c('white') : c('br4')
    const dark = f ? c('white') : c('br2')
    const top = 26
    rect(fx - 9, fy - top, 18, 2, c('br1'))
    rect(fx - 9, fy - top + 2, 18, 1, dark)
    for (let x = -8; x <= 8; x += 3) rect(fx + x, fy - top + 2, 1, top - 2, bar)
    rect(fx - 9, fy - top + 2, 1, top - 2, dark)
    rect(fx + 8, fy - top + 2, 1, top - 2, dark)
    rect(fx - 9, fy - 2, 18, 2, c('br1'))
    px(fx, fy - 12, c('ye1')); px(fx + 1, fy - 12, c('ye1'))
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
        const col = p.kind === 'enemyArrow' ? c('rd3') : c('gy6')
        for (let i = 0; i < 6; i++) px(Math.round(x - Math.cos(a) * i), Math.round(y - Math.sin(a) * i), i === 0 ? c('white') : col)
        break
      }
      case 'bolt':
        for (let i = 0; i < 9; i++) { const xx = Math.round(x - Math.cos(a) * i), yy = Math.round(y - Math.sin(a) * i); px(xx, yy, i === 0 ? c('white') : c('bl5')); if (i < 6) px(xx, yy - 1, c('bl3')) }
        break
      case 'axe': {
        const r = Math.floor(p.spin) & 3
        const pts = [[0, -3], [3, 0], [0, 3], [-3, 0]]
        for (let i = 0; i < 4; i++) { const [ox, oy] = pts[(i + r) & 3]; px(x + ox, y + oy, i === 0 ? c('gy6') : c('br3')); px(x + (ox >> 1), y + (oy >> 1), c('br3')) }
        px(x, y, c('gy5'))
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
      case 'fireball':
        disc(x, y, p.r >= 6 ? 4 : 3, c('or1')); disc(x, y, 2, c('ye2')); px(x, y, c('white'))
        break
    }
  }
  function drawBlast(bl, cx, cy, t) {
    const x = Math.round(bl.x - cx), y = Math.round(bl.y - cy)
    if (bl.team === 'ally') {
      // 爆弾：投げられているあいだは山なりに飛び、着いたら導火線が光る
      const fl = bl.total - bl.t
      if (fl < bl.flight) {
        const k = fl / bl.flight
        const bx = bl.sx + (bl.x - bl.sx) * k - cx, by = bl.sy + (bl.y - bl.sy) * k - cy - Math.sin(k * Math.PI) * 26
        disc(Math.round(bx), Math.round(by), 2, c('ink')); px(Math.round(bx), Math.round(by) - 3, c('or2'))
        px(Math.round(bl.x - cx), Math.round(bl.y - cy), c('rd3')) // 落ちる場所の印
      } else {
        disc(x, y, 2, c('ink'))
        px(x + 1, y - 3, Math.floor(t * 20) & 1 ? c('ye3') : c('or2'))
        ringPx(x, y, bl.r, c('rd3'), 1, true)
      }
    } else {
      const k = 1 - bl.t / bl.total
      ditherDisc(x, y, Math.round(bl.r * k), c('rd2'), 0)
      ringPx(x, y, bl.r, Math.floor(t * 12) & 1 ? c('rd3') : c('rd4'), 1)
    }
  }
  function drawWedge(tl, cx, cy, t) {
    const x = Math.round(tl.x - cx), y = Math.round(tl.y - cy) + 4
    const blink = Math.floor(t * 14) & 1
    const a0 = tl.ang - tl.spread / 2, a1 = tl.ang + tl.spread / 2
    const ex = (a) => [Math.round(x + Math.cos(a) * tl.len), Math.round(y + Math.sin(a) * tl.len)]
    // 中を市松で塗る（半透明の代わり）
    for (let i = 0; i < 40; i++) {
      const a = a0 + ((a1 - a0) * i) / 39
      for (let r = 10; r < tl.len; r += 4) if (((r >> 2) + i) & 1) px(Math.round(x + Math.cos(a) * r), Math.round(y + Math.sin(a) * r), c('rd1'))
    }
    const [x0, y0] = ex(a0), [x1, y1] = ex(a1)
    lineThick(x, y, x0, y0, 1, blink ? c('rd3') : c('rd4'))
    lineThick(x, y, x1, y1, 1, blink ? c('rd3') : c('rd4'))
    for (let i = 0; i <= 24; i++) { const a = a0 + ((a1 - a0) * i) / 24; px(Math.round(x + Math.cos(a) * tl.len), Math.round(y + Math.sin(a) * tl.len), blink ? c('rd3') : c('rd4')) }
  }
  function drawTele(tl, cx, cy, t) {
    if (tl.k === 'wedge') { drawWedge(tl, cx, cy, t); return }
    const x = Math.round(tl.x - cx), y = Math.round(tl.y - cy) + 4
    const blink = Math.floor(t * 14) & 1
    if (tl.k === 'circle') {
      ditherDisc(x, y, Math.round(tl.r), c('rd1'), 0)
      ringPx(x, y, tl.r, blink ? c('rd3') : c('rd4'), 1)
    } else if (tl.k === 'line') {
      const x2 = Math.round(tl.x2 - cx), y2 = Math.round(tl.y2 - cy) + 4
      lineThick(x, y, x2, y2, Math.max(1, tl.w), c('rd1'), 0)
      lineThick(x, y, x2, y2, 1, blink ? c('rd3') : c('rd4'), 3)
    }
  }
  function drawFx(S) {
    const cx = S.cam.x, cy = S.cam.y
    for (const f of S.fx) {
      const x = Math.round(f.x - cx), y = Math.round(f.y - cy)
      const k = f.t / f.life
      if (f.k === 'spark') { px(x, y, c(f.c)); if (k < 0.5) px(x + 1, y, c(f.c)) }
      else if (f.k === 'ring') ringPx(x, y, f.r * (0.4 + 0.6 * k), c(f.c))
      else if (f.k === 'num') { text(f.text, x - textW(f.text) / 2 + 1, y + 1, c('black')); text(f.text, x - textW(f.text) / 2, y, c(f.c)) }
      else if (f.k === 'zap') {
        for (let i = 0; i + 1 < f.pts.length; i++) {
          const [ax, ay] = f.pts[i], [bx, by] = f.pts[i + 1]
          const n = 5
          let px0 = ax - cx, py0 = ay - cy
          for (let j = 1; j <= n; j++) {
            const nx = ax + ((bx - ax) * j) / n - cx + (j < n ? ((hash(j + i * 7, Math.floor(f.t * 40)) % 7) - 3) : 0)
            const ny = ay + ((by - ay) * j) / n - cy + (j < n ? ((hash(j * 3, i + Math.floor(f.t * 40)) % 7) - 3) : 0)
            lineThick(Math.round(px0), Math.round(py0), Math.round(nx), Math.round(ny), 1, c('ye3'))
            lineThick(Math.round(px0) + 1, Math.round(py0), Math.round(nx) + 1, Math.round(ny), 1, c('bl5'))
            px0 = nx
            py0 = ny
          }
        }
      }
    }
  }

  // --- ミニマップ ---
  let mini = null
  function buildMini(S) {
    const w = 96, h = 72
    mini = { w, h, base: new Uint8Array(w * h) }
    const ground = [c('gr3'), c('gr2'), c('sa2'), c('gy6'), c('gy2'), c('gy3')]
    const solid = [c('gr1'), c('gr0'), c('sa1'), c('gy4'), c('ink'), c('gy1')]
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const tx = x * 2, ty = y * 2
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
    rect(MINI.x, MINI.y, MINI.w, MINI.h, c('black'))
    for (let y = 0; y < mini.h; y++) {
      for (let x = 0; x < mini.w; x++) {
        const k = y * 2 * MW + x * 2
        const seen = S.seen[k] | S.seen[k + 1] | S.seen[k + MW] | S.seen[k + MW + 1]
        px(ox + x, oy + y, seen ? mini.base[y * mini.w + x] : c('ink'))
      }
    }
    const seenAt = (tx, ty) => S.seen[ty * MW + tx]
    for (const cg of S.cages) {
      if (cg.opened || !seenAt(cg.tx, cg.ty)) continue
      rect(ox + (cg.tx >> 1) - 1, oy + (cg.ty >> 1) - 1, 2, 2, c('ye2'))
    }
    const bt = S.boss
    if (bt && bt.hp > 0) {
      const bx = Math.floor(bt.x / TILE), by = Math.floor(bt.y / TILE)
      if (seenAt(bx, by) || Math.floor(t * 2) & 1) rect(ox + (bx >> 1) - 1, oy + (by >> 1) - 1, 3, 3, c('mag'))
    }
    // いまの画面の範囲
    const vx0 = Math.floor(S.cam.x / TILE / 2), vy0 = Math.floor(S.cam.y / TILE / 2)
    const vw = Math.round(VIEW_W / TILE / 2), vh = Math.round(VIEW_H / TILE / 2)
    for (let i = 0; i < vw; i++) { px(ox + vx0 + i, oy + vy0, c('white')); px(ox + vx0 + i, oy + vy0 + vh, c('white')) }
    for (let j = 0; j <= vh; j++) { px(ox + vx0, oy + vy0 + j, c('white')); px(ox + vx0 + vw, oy + vy0 + j, c('white')) }
    // 仲間の群れ
    for (const a of S.allies) if (a !== S.leader) px(ox + (Math.floor(a.x / TILE) >> 1), oy + (Math.floor(a.y / TILE) >> 1), c('bl5'))
    const lx = ox + (Math.floor(S.leader.x / TILE) >> 1), ly = oy + (Math.floor(S.leader.y / TILE) >> 1)
    if (Math.floor(t * 4) & 1) rect(lx - 1, ly - 1, 3, 3, c('white'))
  }

  // --- HUD ---
  function drawButton(b, label, hot, sc = 3) {
    rect(b.x, b.y, b.w, b.h, c('black'))
    rect(b.x + 1, b.y + 1, b.w - 2, b.h - 2, hot ? c('gy3') : c('gy1'))
    rect(b.x + 2, b.y + 2, b.w - 4, 1, c('gy3'))
    text(label, b.x + b.w / 2 - textW(label, sc) / 2, b.y + b.h / 2 - (sc * 5) / 2, c('gy6'), sc)
  }
  function drawHud(S, ui, t) {
    const L = S.leader
    shadowText(`RESCUED ${S.rescued}/${S.total}`, 10, 10, c('ye3'), 2)
    shadowText(`ALLIES ${S.allies.length}`, 10, 28, c('white'), 2)
    const J = JOBS[L.job]
    const pw = 190, px0 = (W - pw) / 2, py0 = H - 50
    rect(px0, py0, pw, 42, c('black'))
    rect(px0 + 1, py0 + 1, pw - 2, 40, c('gy1'))
    text(`${L.name} ${J.label}`, px0 + 8, py0 + 7, c('white'), 2)
    text(`LV${L.lvl}`, px0 + pw - 8 - textW(`LV${L.lvl}`, 2), py0 + 7, c('ye2'), 2)
    rect(px0 + 8, py0 + 22, pw - 16, 7, c('black'))
    rect(px0 + 9, py0 + 23, Math.max(0, Math.round(((pw - 18) * L.hp) / L.maxhp)), 5, L.hp < L.maxhp * 0.35 ? c('rd3') : c('lime'))
    rect(px0 + 8, py0 + 32, pw - 16, 3, c('black'))
    if (L.lvl < MAX_LV) rect(px0 + 9, py0 + 33, Math.round(((pw - 18) * L.xp) / xpNeed(L.lvl)), 1, c('bl4'))
    drawButton(PREV_BTN, '<')
    drawButton(NEXT_BTN, '>')
    drawButton(PAUSE_BTN, '=', false, 2)
    drawMini(S, t)
    // ボスの体力
    const b = S.boss
    if (b && b.hp > 0 && b.aggro) {
      const bw = 300, bx = (W - bw) / 2 - 20, by = 8
      rect(bx - 2, by - 2, bw + 4, 14, c('black'))
      rect(bx, by, bw, 10, c('rd0'))
      rect(bx, by, Math.max(0, Math.round((bw * b.hp) / b.maxhp)), 10, b.hp < b.maxhp * 0.33 ? c('or2') : c('rd3'))
      shadowText('DEMON KING', bx + bw / 2 - textW('DEMON KING', 2) / 2, by + 14, c('white'), 2)
    }
    if (ui.stick) {
      ringPx(ui.stick.ax, ui.stick.ay, 26, c('gy5'), 1)
      disc(ui.stick.x, ui.stick.y, 6, c('gy6'))
    }
    if (S.banner) {
      const bx = (W - 300) / 2
      rect(bx, 90, 300, 34, c('black'))
      rect(bx + 2, 92, 296, 30, c('gy1'))
      text(S.banner, W / 2 - textW(S.banner, 3) / 2, 100, c('ye3'), 3)
    }
  }

  function overlayDark() {
    for (let y = 0; y < H; y++) for (let x = y & 1; x < W; x += 2) fb[y * W + x] = c('black')
  }
  const fmtTime = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`
  function drawTitle(ui, t) {
    overlayDark()
    const title = 'GUNZO'
    const sc = 12
    const x = W / 2 - textW(title, sc) / 2
    text(title, x + 4, 80 + 4, c('black'), sc)
    text(title, x, 80, c('ye2'), sc)
    const sub = '99 FRIENDS - 100 HEROES'
    text(sub, W / 2 - textW(sub, 2) / 2, 170, c('white'), 2)
    const lines = ['DRAG OR WASD: MOVE', 'TAP A FRIEND: SWITCH', 'FREE THEM ALL. DEFEAT THE DEMON KING.']
    lines.forEach((l, i) => text(l, W / 2 - textW(l, 2) / 2, 220 + i * 22, c('gy5'), 2))
    drawButton(NEW_BTN, 'NEW GAME', ui.hot === 'new')
    if (ui.hasSave) drawButton(CONT_BTN, 'CONTINUE', ui.hot === 'cont')
    if (ui.hasSave) text(ui.saveInfo || '', W / 2 - textW(ui.saveInfo || '', 1) / 2, 428, c('gy4'), 1)
  }
  function drawPause(ui) {
    overlayDark()
    text('PAUSE', W / 2 - textW('PAUSE', 5) / 2, 120, c('white'), 5)
    for (const b of MENU_BTNS) drawButton(b, b.id === 'sound' ? (ui.sound ? 'SOUND ON' : 'SOUND OFF') : b.label, false)
    const tips = ['DRAG OR WASD: MOVE', 'TAP A FRIEND: SWITCH (Q E: PREV NEXT)', 'RED AREAS: DANGER, STEP OUT!']
    tips.forEach((l, i) => text(l, W / 2 - textW(l, 2) / 2, 360 + i * 22, c('gy5'), 2))
  }
  function drawOver(S, ui, t) {
    overlayDark()
    const s = 'ALL FALLEN'
    text(s, W / 2 - textW(s, 6) / 2, 150, c('rd3'), 6)
    const r = `RESCUED ${S.rescued}/${S.total}  LOST ${S.lost}  KILLS ${S.kills}`
    text(r, W / 2 - textW(r, 2) / 2, 240, c('white'), 2)
    const m = ui.hasSave ? 'TAP TO CONTINUE FROM SAVE' : 'TAP TO RETRY'
    if (Math.floor(t * 2) % 2 === 0) text(m, W / 2 - textW(m, 3) / 2, 320, c('white'), 3)
  }
  function drawWin(S, t) {
    if (S.winT < 2.5) return
    overlayDark()
    const s = 'VICTORY'
    text(s, W / 2 - textW(s, 10) / 2 + 3, 63, c('black'), 10)
    text(s, W / 2 - textW(s, 10) / 2, 60, c('ye2'), 10)
    const solo = S.rescued === 0
    const perfect = S.rescued === S.total && S.lost === 0
    const title = perfect ? 'PERFECT - NO ONE LOST' : solo ? 'SOLO CLEAR' : S.rescued === S.total ? 'ALL RESCUED' : 'CLEARED'
    text(title, W / 2 - textW(title, 3) / 2, 160, perfect || solo ? c('ye3') : c('white'), 3)
    const rows = [`RESCUED ${S.rescued}/${S.total}`, `LOST ${S.lost}`, `ALIVE ${S.allies.length}`, `TIME ${fmtTime(S.t)}`, `KILLS ${S.kills}`]
    rows.forEach((l, i) => text(l, W / 2 - textW(l, 2) / 2, 220 + i * 24, c('white'), 2))
    if (Math.floor(t * 2) % 2 === 0) text('TAP TO RETURN TO TITLE', W / 2 - textW('TAP TO RETURN TO TITLE', 2) / 2, 380, c('gy5'), 2)
  }

  // --- 1フレーム ---
  function draw(S, ui, t) {
    drawMap(S, t)
    const cx = S.cam.x, cy = S.cam.y
    const L = S.leader
    // 地面の予兆・爆発の印は、人の下に
    for (const h of S.hazards) if (h.k) drawTele(h, cx, cy, t)
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
        if (o === L) {
          const bob = Math.round(Math.sin(t * 6) * 1.5)
          const ay = fy - 35 - bob
          for (let i = 0; i < 4; i++) rect(fx - 3 + i, ay + i, 7 - i * 2, 1, c('ye2'))
          px(fx, ay + 4, c('ye2'))
        }
      } else if (en.k === 'enemy') drawEnemy(o, fx, fy, t)
      else drawCage(o, fx, fy, t)
    }
    for (const bl of S.blasts) drawBlast(bl, cx, cy, t)
    for (const p of S.projs) drawProj(p, cx, cy)
    drawFx(S)
    if (ui.screen !== 'title') drawHud(S, ui, t)
    if (ui.screen === 'title') drawTitle(ui, t)
    else if (ui.paused) drawPause(ui)
    else if (S.state === 'over') drawOver(S, ui, t)
    else if (S.state === 'win') drawWin(S, t)
  }

  return { draw, drawMap, text, rect, px }
}
