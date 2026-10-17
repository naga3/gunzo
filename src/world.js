// 世界（タイルの地図）と、操作キャラへ向かう道筋（フローフィールド）
import { ENEMIES, POOLS, TIER_OF_BIOME, budgetOf } from './data.js'

export const TILE = 16
export const MW = 192
export const MH = 144

export const T = { GROUND: 0, TREE: 1, WATER: 2, ROCK: 3, PATH: 4, DECO: 5, CAGE: 6, WALL: 7, FLOOR: 8 }
export const solidTile = (t) => t === T.TREE || t === T.WATER || t === T.ROCK || t === T.CAGE || t === T.WALL
export const B = { GRASS: 0, FOREST: 1, DESERT: 2, SNOW: 3, VOLCANO: 4, CASTLE: 5 }

// 地域の中心（タイル）と、捕虜の数。合計 99
const REGIONS = [
  { b: B.GRASS, cx: 34, cy: 110, n: 22 },
  { b: B.FOREST, cx: 34, cy: 38, n: 20 },
  { b: B.DESERT, cx: 96, cy: 114, n: 20 },
  { b: B.SNOW, cx: 96, cy: 40, n: 18 },
  { b: B.VOLCANO, cx: 152, cy: 96, n: 19 },
]
export const START = { x: 10, y: 132 }
// 魔王城：外壁の矩形（タイル）。中は、手前の中庭と奥の闘技場に分かれる
export const CASTLE = { x0: 148, y0: 4, x1: 187, y1: 47, innerY: 30, gateX0: 165, gateX1: 170 }
export const BOSS_POS = { x: 167.5, y: 13 }
// 最短の道（ここを通れば誰も助けなくても魔王城に着く）
const HIGHWAY = [[10, 132], [36, 120], [62, 110], [86, 100], [110, 96], [132, 82], [146, 64], [160, 54], [167, 50]]

function mulberry32(a) {
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
function makeNoise(rng, gw, gh) {
  const g = new Float32Array((gw + 1) * (gh + 1))
  for (let i = 0; i < g.length; i++) g[i] = rng()
  return (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y)
    let fx = x - xi, fy = y - yi
    fx = fx * fx * (3 - 2 * fx)
    fy = fy * fy * (3 - 2 * fy)
    const a = g[yi * (gw + 1) + xi], b = g[yi * (gw + 1) + xi + 1]
    const c = g[(yi + 1) * (gw + 1) + xi], d = g[(yi + 1) * (gw + 1) + xi + 1]
    return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy
  }
}
const segDist = (px, py, ax, ay, bx, by) => {
  const dx = bx - ax, dy = by - ay
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1)))
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy))
}
const highwayDist = (x, y) => {
  let d = Infinity
  for (let i = 0; i + 1 < HIGHWAY.length; i++) d = Math.min(d, segDist(x, y, ...HIGHWAY[i], ...HIGHWAY[i + 1]))
  return d
}

// 地形の濃さ（バイオームごと）
const PROFILE = [
  { water: 0.68, tree: 0.63, rock: 0.015, deco: 0.05 },
  { water: 0.74, tree: 0.5, rock: 0.01, deco: 0.04 },
  { water: 0.82, tree: 0.77, rock: 0.03, deco: 0.03 },
  { water: 0.66, tree: 0.6, rock: 0.02, deco: 0.05 },
  { water: 0.64, tree: 0.68, rock: 0.04, deco: 0.04 },
]

// guards: 見張りの数の倍率（難しさ）
export function generateWorld(seed = 7, guards = 1) {
  const rng = mulberry32(seed)
  const tiles = new Uint8Array(MW * MH)
  const biome = new Uint8Array(MW * MH)
  const wA = makeNoise(rng, 80, 64), wB = makeNoise(rng, 80, 64)
  const tA = makeNoise(rng, 80, 64), tB = makeNoise(rng, 80, 64)
  const warp = makeNoise(rng, 24, 20)
  const at = (x, y) => y * MW + x
  const inside = (x, y) => x >= 0 && y >= 0 && x < MW && y < MH
  const inCastle = (x, y) => x >= CASTLE.x0 && x <= CASTLE.x1 && y >= CASTLE.y0 && y <= CASTLE.y1

  // バイオーム：いちばん近い地域の中心（境界はゆがめる）
  for (let y = 0; y < MH; y++) {
    for (let x = 0; x < MW; x++) {
      let best = 0, bd = Infinity
      const w = 1 + 0.35 * (warp(x / 9, y / 9) - 0.5)
      REGIONS.forEach((r, i) => {
        const d = Math.hypot(x - r.cx, y - r.cy) * (i % 2 ? w : 2 - w)
        if (d < bd) { bd = d; best = i }
      })
      biome[at(x, y)] = inCastle(x, y) ? B.CASTLE : REGIONS[best].b
    }
  }
  // 地形
  for (let y = 0; y < MH; y++) {
    for (let x = 0; x < MW; x++) {
      const b = biome[at(x, y)]
      let t = T.GROUND
      if (x < 2 || y < 2 || x >= MW - 2 || y >= MH - 2) t = T.TREE
      else if (b !== B.CASTLE) {
        const P = PROFILE[b]
        const water = 0.65 * wA(x / 7, y / 7) + 0.35 * wB(x / 3, y / 3)
        const tree = 0.6 * tA(x / 6, y / 6) + 0.4 * tB(x / 2.5, y / 2.5)
        if (water > P.water) t = T.WATER
        else if (tree > P.tree) t = T.TREE
        else {
          const r = rng()
          if (r < P.rock) t = T.ROCK
          else if (r < P.rock + P.deco) t = T.DECO
        }
      }
      tiles[at(x, y)] = t
    }
  }

  const clear = (cx, cy, rx, ry, to = T.GROUND) => {
    for (let y = cy - ry; y <= cy + ry; y++) {
      for (let x = cx - rx; x <= cx + rx; x++) {
        if (x > 1 && y > 1 && x < MW - 2 && y < MH - 2 && !(tiles[at(x, y)] === T.WALL && inCastle(x, y))) tiles[at(x, y)] = to
      }
    }
  }
  const carveLeg = (x0, y0, x1, y1, r) => {
    let x = x0, y = y0
    for (;;) {
      clear(x, y, r, r, T.PATH)
      if (x === x1 && y === y1) break
      if (x !== x1) x += Math.sign(x1 - x)
      else y += Math.sign(y1 - y)
    }
  }
  const carveL = (ax, ay, bx, by, firstH, r = 1) => {
    if (firstH) { carveLeg(ax, ay, bx, ay, r); carveLeg(bx, ay, bx, by, r) }
    else { carveLeg(ax, ay, ax, by, r); carveLeg(ax, by, bx, by, r) }
  }
  // 斜めの線（最短の道）
  const carveLine = (ax, ay, bx, by, r) => {
    const n = Math.max(Math.abs(bx - ax), Math.abs(by - ay))
    for (let i = 0; i <= n; i++) clear(Math.round(ax + ((bx - ax) * i) / n), Math.round(ay + ((by - ay) * i) / n), r, r, T.PATH)
  }

  // --- 捕虜の場所（99）---
  const spots = []
  const farFromStart = (x, y) => Math.hypot(x - START.x, y - START.y) > 17
  REGIONS.forEach((reg, ri) => {
    let minD = 13, fails = 0, placed = 0
    while (placed < reg.n && fails < 100000) {
      const x = 7 + Math.floor(rng() * (MW - 14)), y = 7 + Math.floor(rng() * (MH - 14))
      const ok = biome[at(x, y)] === reg.b && !inCastle(x, y) && farFromStart(x, y) && highwayDist(x, y) > 14 &&
        spots.every((s) => Math.hypot(s.tx - x, s.ty - y) >= minD) && !(x > CASTLE.x0 - 8 && y < CASTLE.y1 + 8)
      if (ok) { spots.push({ tx: x, ty: y, region: ri, biome: reg.b }); placed++; fails = 0 } else if (++fails % 3000 === 0) minD -= 0.5
    }
  })
  spots.forEach((s, i) => { s.id = i })

  // --- 道 ---
  const nodes = [{ x: START.x, y: START.y, start: true }, ...spots.map((s) => ({ x: s.tx, y: s.ty, spot: s }))]
  clear(START.x, START.y, 4, 4)
  for (const s of spots) clear(s.tx, s.ty, 3, 3)
  const connected = [nodes[0]]
  const rest = nodes.slice(1)
  const edges = []
  while (rest.length) {
    let best = null
    for (const n of rest) for (const c of connected) {
      const d = Math.hypot(n.x - c.x, n.y - c.y)
      if (!best || d < best.d) best = { n, c, d }
    }
    rest.splice(rest.indexOf(best.n), 1)
    connected.push(best.n)
    edges.push([best.c, best.n])
  }
  // 近いもの同士にも道を足して、ぐるっと回れるようにする
  for (const n of nodes) {
    if (n.start) continue
    const near = nodes.filter((m) => m !== n && !edges.some((e) => (e[0] === n && e[1] === m) || (e[0] === m && e[1] === n)))
      .sort((a, b) => Math.hypot(a.x - n.x, a.y - n.y) - Math.hypot(b.x - n.x, b.y - n.y))[0]
    if (near && Math.hypot(near.x - n.x, near.y - n.y) < 26 && rng() < 0.55) edges.push([n, near])
  }
  for (const [a, b] of edges) carveL(a.x, a.y, b.x, b.y, rng() < 0.5)
  // 最短の道
  for (let i = 0; i + 1 < HIGHWAY.length; i++) carveLine(HIGHWAY[i][0], HIGHWAY[i][1], HIGHWAY[i + 1][0], HIGHWAY[i + 1][1], 2)
  clear(START.x, START.y, 4, 4)
  for (const s of spots) { clear(s.tx, s.ty, 3, 3); tiles[at(s.tx, s.ty)] = T.CAGE }

  // --- 魔王城 ---
  const C = CASTLE
  for (let y = C.y0; y <= C.y1; y++) for (let x = C.x0; x <= C.x1; x++) tiles[at(x, y)] = T.WALL
  for (let y = C.y0 + 2; y <= C.y1 - 2; y++) for (let x = C.x0 + 2; x <= C.x1 - 2; x++) tiles[at(x, y)] = T.FLOOR
  for (let x = C.x0 + 2; x <= C.x1 - 2; x++) { tiles[at(x, C.innerY)] = T.WALL; tiles[at(x, C.innerY + 1)] = T.WALL }
  for (let x = C.gateX0; x <= C.gateX1; x++) {
    for (let y = C.innerY; y <= C.innerY + 1; y++) tiles[at(x, y)] = T.FLOOR
    tiles[at(x, C.y1 - 1)] = T.FLOOR
    tiles[at(x, C.y1)] = T.FLOOR
    tiles[at(x, C.y1 + 1)] = T.PATH
  }
  // 中庭の柱
  for (let py = C.innerY + 5; py <= C.y1 - 4; py += 5) {
    for (let px = C.x0 + 5; px <= C.x1 - 4; px += 6) {
      if (px >= C.gateX0 - 3 && px <= C.gateX1 + 3) continue
      tiles[at(px, py)] = T.WALL
    }
  }
  // 闘技場の飾り（玉座）
  for (let x = 164; x <= 171; x++) tiles[at(x, 8)] = T.DECO
  carveLeg(HIGHWAY[HIGHWAY.length - 1][0], HIGHWAY[HIGHWAY.length - 1][1], 167, C.y1 + 1, 2)

  // --- 歩いて行ける場所（開始地点から）---
  const reach = new Uint8Array(MW * MH)
  {
    const q = [[START.x, START.y]]
    reach[at(START.x, START.y)] = 1
    while (q.length) {
      const [x, y] = q.pop()
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy
        if (!inside(nx, ny) || reach[at(nx, ny)] || solidTile(tiles[at(nx, ny)])) continue
        reach[at(nx, ny)] = 1
        q.push([nx, ny])
      }
    }
  }
  // 届かない捕虜には、開始地点から道をつなぐ
  for (const s of spots) {
    const around = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => reach[at(s.tx + dx, s.ty + dy)])
    if (!around) {
      const c = connected.find((n) => n.start) || nodes[0]
      carveL(s.tx, s.ty + 1, c.x, c.y, true)
      tiles[at(s.tx, s.ty)] = T.CAGE
    }
  }

  const walkable = (px, py) => {
    const tx = Math.floor(px / TILE), ty = Math.floor(py / TILE)
    return inside(tx, ty) && !solidTile(tiles[at(tx, ty)])
  }

  // --- 敵 ---
  const enemies = []
  const camps = []
  // starter: 開始地点のそばのやさしい見張り（難しさで数を変えない）
  // 難しさ（guards）は、同じ配置のまま敵を足す・減らすだけにする（世界の乱数の進み方を変えない。足す分は別の乱数で）
  const placeGroup = (cx, cy, tier, bi, kindOverride, rMin, rMax, budgetMul = 1, campId = -1, starter = false) => {
    const pool = POOLS[bi]
    let budget = budgetOf(tier, rng()) * budgetMul
    const kinds = []
    let guard = 0
    while (budget > 0 && guard++ < 40) {
      const k = kindOverride ? kindOverride[(rng() * kindOverride.length) | 0] : pool[(rng() * pool.length) | 0]
      const cost = ENEMIES[k].cost
      if (cost > budget && kinds.length > 0) { if (guard > 25) break; continue }
      kinds.push(k)
      budget -= cost
    }
    const g = starter ? 1 : guards
    const keep = Math.max(1, Math.round(kinds.length * Math.min(1, g)))   // 減らす分（easy）: 置く場所は同じように選んで、置かない
    let r2 = (cx * 73856093) ^ (cy * 19349663) ^ 0x5bd1e995                 // 足す分（hard）の乱数
    const rng2 = () => { r2 = (r2 * 1103515245 + 12345) & 0x7fffffff; return r2 / 0x80000000 }
    const extra = g > 1 ? Math.floor(kinds.length * (g - 1) + rng2()) : 0
    const place = (k, rnd, put) => {
      for (let tries = 0; tries < 50; tries++) {
        const a = rnd() * Math.PI * 2, r = rMin + rnd() * (rMax - rMin)
        const x = cx * TILE + 8 + Math.cos(a) * r, y = cy * TILE + 8 + Math.sin(a) * r
        if (walkable(x, y)) {
          if (put) enemies.push({ kind: k, x, y, camp: campId, tier })
          break
        }
      }
    }
    kinds.forEach((k, i) => place(k, rng, i < keep))
    const src = kindOverride ?? pool
    for (let i = 0; i < extra; i++) place(src[(rng2() * src.length) | 0], rng2, true)
  }
  // 最初の捕虜（開始地点にいちばん近いもの）はやさしく
  const nearStart = [...spots].sort((a, b) => Math.hypot(a.tx - START.x, a.ty - START.y) - Math.hypot(b.tx - START.x, b.ty - START.y))
  const easyMul = new Map([[nearStart[0], 0.45], [nearStart[1], 0.6], [nearStart[2], 0.75], [nearStart[3], 0.9]])
  for (const s of spots) {
    const tier = TIER_OF_BIOME[s.biome]
    s.tier = tier
    s.camp = camps.length
    camps.push({ x: s.tx * TILE + 8, y: s.ty * TILE + 8, tier, spot: s.id })
    if (easyMul.has(s)) placeGroup(s.tx, s.ty, 1, 0, s === nearStart[0] ? ['slime', 'slime', 'bat'] : null, 26, 60, easyMul.get(s), s.camp, true)
    else placeGroup(s.tx, s.ty, tier, s.biome, null, 26, 66, 1, s.camp)
  }
  // 最短の道の番人（避けて通れるが、道の上にいる）
  const sentinels = []
  {
    let travelled = 0
    let nextAt = 34
    for (let i = 0; i + 1 < HIGHWAY.length; i++) {
      const [ax, ay] = HIGHWAY[i], [bx, by] = HIGHWAY[i + 1]
      const len = Math.hypot(bx - ax, by - ay)
      while (nextAt - travelled < len) {
        const f = (nextAt - travelled) / len
        const x = Math.round(ax + (bx - ax) * f), y = Math.round(ay + (by - ay) * f)
        const bi = biome[at(x, y)]
        const camp = camps.length
        camps.push({ x: x * TILE + 8, y: y * TILE + 8, tier: TIER_OF_BIOME[bi], spot: -1 })
        const ground = POOLS[bi].filter((k) => ENEMIES[k].atk !== 'flyer')
        placeGroup(x, y, TIER_OF_BIOME[bi], bi, ground, 20, 52, 0.55, camp)
        sentinels.push({ x, y })
        nextAt += 22
      }
      travelled += len
    }
  }
  // 道ばたの見張り
  const roadTiles = []
  for (let y = 4; y < MH - 4; y++) for (let x = 4; x < MW - 4; x++) if (tiles[at(x, y)] === T.PATH && !inCastle(x, y)) roadTiles.push([x, y])
  for (let i = 0, made = 0; made < 36 && i < 4000; i++) {
    const [x, y] = roadTiles[(rng() * roadTiles.length) | 0]
    if (Math.hypot(x - START.x, y - START.y) < 22 || highwayDist(x, y) < 12) continue
    if (spots.some((s) => Math.hypot(s.tx - x, s.ty - y) < 9) || sentinels.some((s) => Math.hypot(s.x - x, s.y - y) < 14)) continue
    const bi = biome[at(x, y)]
    const camp = camps.length
    camps.push({ x: x * TILE + 8, y: y * TILE + 8, tier: TIER_OF_BIOME[bi], spot: -1 })
    placeGroup(x, y, TIER_OF_BIOME[bi], bi, null, 12, 40, 0.5, camp)
    made++
  }
  // 魔王城の中庭の兵
  for (const [gx, gy] of [[156, 36], [178, 36], [156, 42], [178, 42], [160, 33], [174, 33], [167, 40]]) {
    const camp = camps.length
    camps.push({ x: gx * TILE + 8, y: gy * TILE + 8, tier: 6, spot: -1 })
    placeGroup(gx, gy, 6, B.CASTLE, ['knight', 'knight', 'darkmage'], 12, 48, 0.55, camp)
  }

  return {
    seed, tiles, biome, spots, camps, enemies, highway: HIGHWAY, sentinels,
    start: { x: START.x * TILE + 8, y: START.y * TILE + 8 },
    boss: { x: BOSS_POS.x * TILE, y: BOSS_POS.y * TILE },
    arena: { x0: (C.x0 + 2) * TILE, y0: (C.y0 + 2) * TILE, x1: (C.x1 - 1) * TILE, y1: C.innerY * TILE },
    reach, at, inside, walkable,
  }
}

// 操作キャラのいる場所から全タイルまでの歩数（BFS）と、各タイルの次の一歩
export function createFlow(world) {
  const n = MW * MH
  const dist = new Int32Array(n)
  const dirX = new Int8Array(n)
  const dirY = new Int8Array(n)
  const queue = new Int32Array(n)
  const INF = 1 << 28
  const NB = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]
  const free = (x, y) => x >= 0 && y >= 0 && x < MW && y < MH && !solidTile(world.tiles[y * MW + x])
  // 斜めは、両隣が空いているときだけ
  const canStep = (x, y, dx, dy) => free(x + dx, y + dy) && (dx === 0 || dy === 0 || (free(x + dx, y) && free(x, y + dy)))
  return {
    dist, dirX, dirY, INF,
    compute(tx, ty) {
      dist.fill(INF)
      let head = 0, tail = 0
      dist[ty * MW + tx] = 0
      queue[tail++] = ty * MW + tx
      while (head < tail) {
        const cur = queue[head++]
        const cx = cur % MW, cy = (cur / MW) | 0
        for (const [dx, dy] of NB) {
          if (!canStep(cx, cy, dx, dy)) continue
          const k = (cy + dy) * MW + cx + dx
          if (dist[k] !== INF) continue
          dist[k] = dist[cur] + 1
          queue[tail++] = k
        }
      }
      for (let i = 0; i < tail; i++) {
        const k = queue[i]
        dirX[k] = 0
        dirY[k] = 0
        if (dist[k] === 0) continue
        const x = k % MW, y = (k / MW) | 0
        let best = dist[k]
        for (const [dx, dy] of NB) {
          if (!canStep(x, y, dx, dy)) continue
          const d = dist[(y + dy) * MW + x + dx]
          if (d < best) { best = d; dirX[k] = dx; dirY[k] = dy }
        }
      }
    },
    reachable(tx, ty) {
      return tx >= 0 && ty >= 0 && tx < MW && ty < MH && dist[ty * MW + tx] < INF
    },
  }
}
