// 引っかかりを測る: node tools/stuck.mjs [人数] [秒]
// 敵なしで、操作キャラがマップ中を歩き回る。画面内の味方が、離れているのに動けない時間を数える
import { createSim, JOBS, JOB_LIST } from '../src/sim.js'
import { createFlow, TILE, MW } from '../src/world.js'

const N = Number(process.argv[2] ?? 60)
const secs = Number(process.argv[3] ?? 120)
const S = createSim({ seed: Number(process.argv[4] ?? 7) })
const FIGHT = process.argv[5] === 'fight'
if (!FIGHT) S.enemies.length = 0
for (let i = 0; i < N; i++) S.newAlly(JOB_LIST[i % 5], S.leader.x + (Math.random() - 0.5) * 60, S.leader.y + (Math.random() - 0.5) * 60)
for (const a of S.allies) { a.maxhp = a.hp = 99999 }
const nav = createFlow(S.world)
const waypoints = S.cages.map((c) => ({ tx: c.tx, ty: c.ty, x: c.x, y: c.y }))
let wi = 0, navKey = -1
const dt = 1 / 30
const byGoal = {}
const stuck = new Map() // id -> 連続で動けなかった秒数
let stuckSecs = 0, onScreenFar = 0, worst = 0, worstWho = null
const prev = new Map()
while (S.t < secs && S.state === 'play') {
  const L = S.leader
  const w = waypoints[wi % waypoints.length]
  if (Math.hypot(w.x - L.x, w.y - L.y) < 40) wi++
  const key = w.ty * MW + w.tx
  if (key !== navKey) { navKey = key; nav.compute(w.tx, w.ty) }
  const k = Math.floor(L.y / TILE) * MW + Math.floor(L.x / TILE)
  let mx = 0, my = 0
  const fx = nav.dirX[k], fy = nav.dirY[k]
  if (fx || fy) {
    const nx = (Math.floor(L.x / TILE) + fx) * TILE + 8, ny = (Math.floor(L.y / TILE) + fy) * TILE + 8
    const d = Math.hypot(nx - L.x, ny - L.y) || 1
    mx = (nx - L.x) / d; my = (ny - L.y) / d
  } else { const d = Math.hypot(w.x - L.x, w.y - L.y) || 1; mx = (w.x - L.x) / d; my = (w.y - L.y) / d }
  S.input.mx = mx * 0.8; S.input.my = my * 0.8
  for (const a of S.allies) if (a.hp < 99999 && a.hp > 0) a.hp = Math.min(a.maxhp, a.hp) // 少しゆっくり歩く
  S.step(dt)
  for (const a of S.allies) {
    if (a === S.leader || !a.alive || !a.active) { stuck.delete(a.id); continue }
    const dL = Math.hypot(a.x - S.leader.x, a.y - S.leader.y)
    const p = prev.get(a.id)
    prev.set(a.id, { x: a.x, y: a.y })
    const want = a.goal === 'chase' || a.goal === 'cage' || a.goal === 'leader'
    if (!want || !p) { stuck.delete(a.id); continue }
    onScreenFar += dt
    if (Math.hypot(a.x - p.x, a.y - p.y) < 0.15) {
      const s = (stuck.get(a.id) || 0) + dt
      stuck.set(a.id, s)
      stuckSecs += dt
      byGoal[a.goal] = (byGoal[a.goal] || 0) + dt
      if (s > worst) { worst = s; worstWho = `${a.job} @tile(${Math.floor(a.x / TILE)},${Math.floor(a.y / TILE)}) leader(${Math.floor(S.leader.x / TILE)},${Math.floor(S.leader.y / TILE)}) d=${Math.round(dL)}` }
    } else stuck.set(a.id, 0)
  }
}
for (const a of S.allies) {
  if ((stuck.get(a.id) || 0) > 10) { const nbrs = S.allies.filter((b) => b !== a && Math.hypot(b.x - a.x, b.y - a.y) < 14).length
  console.log('  nbrs', nbrs, 'blockedHere', S.boxBlocked(a.x, a.y, 4), 'S', S.boxBlocked(a.x, a.y + 3, 4), 'N', S.boxBlocked(a.x, a.y - 3, 4), 'E', S.boxBlocked(a.x + 3, a.y, 4), 'W', S.boxBlocked(a.x - 3, a.y, 4), 'ignore', !!a.ignore)
  console.log('STUCK pos', a.x.toFixed(1), a.y.toFixed(1), 'door tiles', [65,66,67].map((x) => S.world.tiles[45 * MW + x]).join(''), a.job, 'tile', Math.floor(a.x / TILE), Math.floor(a.y / TILE), 'goal', a.goal, 'path', JSON.stringify(a.path && a.path.map((p) => [Math.floor(p[0] / TILE), Math.floor(p[1] / TILE)])), 'pi', a.pi, 'gates', JSON.stringify(S.gates.map((g) => g.opened)), 'tile type', S.world.tiles[Math.floor(a.y / TILE) * MW + Math.floor(a.x / TILE)]) }
}
console.log('目標別', Object.entries(byGoal).map(([k, v]) => `${k}:${v.toFixed(0)}`).join(' '))
console.log(`${N + 1}人 ${Math.round(S.t)}秒 / 画面内で動こうとしている時間 ${onScreenFar.toFixed(0)}人秒 のうち、動けなかった ${stuckSecs.toFixed(0)}人秒 (${((stuckSecs / Math.max(1, onScreenFar)) * 100).toFixed(1)}%)、最長 ${worst.toFixed(1)}秒 ${worstWho ?? ''}`)
