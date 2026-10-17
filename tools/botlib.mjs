// ボットの部品。遊び方の違う何種類かのボットで、難易度を測る
import { createSim } from '../src/sim.js'
import { createFlow, TILE, MW, MH } from '../src/world.js'

// 難しさは GUNZO_DIFF（easy・normal・hard）。本番と同じ決まり（硬い当たりなど。manual）で、操作キャラは自動で攻撃させる（botLeader）
export function makeRun(seed = 7) {
  const S = createSim({ seed, diff: process.env.GUNZO_DIFF || 'normal', manual: true, botLeader: true })
  const nav = createFlow(S.world)
  let navKey = -1
  const goTo = (tx, ty) => {
    const key = ty * MW + tx
    if (key !== navKey) { navKey = key; nav.compute(tx, ty) }
  }
  // いまの位置から目標への向き（単位ベクトル）。道がなければ null
  const dirToward = (o, tx, ty) => {
    goTo(tx, ty)
    const k = Math.floor(o.y / TILE) * MW + Math.floor(o.x / TILE)
    const fx = nav.dirX[k], fy = nav.dirY[k]
    if (fx || fy) {
      const nx = (Math.floor(o.x / TILE) + fx) * TILE + 8, ny = (Math.floor(o.y / TILE) + fy) * TILE + 8
      const d = Math.hypot(nx - o.x, ny - o.y) || 1
      return [(nx - o.x) / d, (ny - o.y) / d]
    }
    const d = Math.hypot(tx * TILE + 8 - o.x, ty * TILE + 8 - o.y) || 1
    return [(tx * TILE + 8 - o.x) / d, (ty * TILE + 8 - o.y) / d]
  }
  const pathLen = (o, tx, ty) => { goTo(tx, ty); const k = Math.floor(o.y / TILE) * MW + Math.floor(o.x / TILE); return nav.dist[k] }
  return { S, nav, goTo, dirToward, pathLen }
}

export const stats = (S) => {
  const lv = S.allies.map((a) => a.lvl)
  const byJob = {}
  for (const a of S.allies) byJob[a.job] = (byJob[a.job] || 0) + 1
  return { t: Math.round(S.t), rescued: S.rescued, alive: S.allies.length, lost: S.lost, kills: S.kills, avgLv: lv.length ? +(lv.reduce((a, b) => a + b, 0) / lv.length).toFixed(1) : 0, byJob }
}

// 死んだ場所を地域ごとに数える
export function lossesByRegion(S) {
  const names = ['GRASS', 'FOREST', 'DESERT', 'SNOW', 'VOLCANO', 'CASTLE']
  const out = {}
  for (const d of S.deaths) {
    const b = S.world.biome[Math.floor(d.y / TILE) * MW + Math.floor(d.x / TILE)]
    out[names[b]] = (out[names[b]] || 0) + 1
  }
  return out
}

export function killers(S) {
  const out = {}
  for (const d of S.deaths) out[d.by] = (out[d.by] || 0) + 1
  return Object.fromEntries(Object.entries(out).sort((a, b) => b[1] - a[1]))
}
// 闘技場（ボス）か、その手前の中庭か
export function castleSplit(S) {
  let arena = 0, yard = 0
  for (const d of S.deaths) {
    const tx = Math.floor(d.x / TILE), ty = Math.floor(d.y / TILE)
    if (tx >= 148 && ty <= 47) { if (ty < 30) arena++; else yard++ }
  }
  return { yard, arena }
}

export function lastDeath(S) {
  const d = S.deaths[S.deaths.length - 1]
  return d ? `${d.by} @tile(${Math.floor(d.x / TILE)},${Math.floor(d.y / TILE)}) t=${Math.round(d.t)}` : '-'
}

// 死に方の分析：一撃（満タンに近いところから）か、積み重ねか
export function deathAnalysis(S) {
  if (!S.hitLog) return null
  const byId = new Map()
  for (const h of S.hitLog) { if (!byId.has(h.id)) byId.set(h.id, []); byId.get(h.id).push(h) }
  let oneShot = 0, two = 0, many = 0, dmgSum = {}, lowHp = 0
  const killDmg = []
  for (const d of S.deaths) {
    const hs = byId.get(d.id) || []
    const last = hs[hs.length - 1]
    if (!last) continue
    const before = last.hp + last.dmg
    killDmg.push(last.dmg)
    if (before >= last.maxhp * 0.85) oneShot++
    else if (before >= last.maxhp * 0.5) two++
    else many++
    // 直前 3 秒に受けた攻撃の数
    const recent = hs.filter((h) => h.t > last.t - 3).length
    dmgSum[recent] = (dmgSum[recent] || 0) + 1
  }
  return { oneShot, halfOrMore: two, low: many, hitsInLast3s: dmgSum, avgKillingHit: killDmg.length ? +(killDmg.reduce((a, b) => a + b, 0) / killDmg.length).toFixed(1) : 0 }
}
