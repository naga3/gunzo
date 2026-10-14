// 操作キャラの動かし方：数手先を予測して、予兆の攻撃と飛び道具を避ける。ソロのボットと、上手いボットで共有する
import { JOBS } from '../src/data.js'

const DIRS = []
for (let i = 0; i < 12; i++) DIRS.push([Math.cos((i / 12) * Math.PI * 2), Math.sin((i / 12) * Math.PI * 2)])
DIRS.push([0, 0])
const STAY = DIRS.length - 1

// 2 段階（前半と後半で向きを変える）で先読みして、いちばん安全で、行きたい向きに近い最初の動きを返す
//  desired: 行きたい向き。opts.hit: { x, y, r } を指定すると、その近く（r 以内）にいる時間を評価する（斬る機会）
export function microMove(S, L, desired, opts = {}) {
  const speed = JOBS[L.job].speed
  const T = opts.horizon ?? 1.2, STEP = 0.1, SPLIT = 0.5
  const dm = Math.hypot(desired[0], desired[1])
  let best = DIRS[STAY], bs = Infinity
  const near = (o, r) => Math.abs(o.x - L.x) < r && Math.abs(o.y - L.y) < r
  const hz = S.hazards.filter((h) => near(h, 320) || (h.k === 'line' && (near({ x: h.x2, y: h.y2 }, 320) || near(h, 400))))
  const pj = S.projs.filter((p) => p.team === 'enemy' && near(p, 260))
  const av = opts.avoid ? opts.avoid.filter((a) => near(a, 110)) : null
  for (const d1 of DIRS) {
    for (const d2 of DIRS) {
      let x = L.x, y = L.y, pen = 0, strike = 0
      for (let t = STEP; t <= T + 1e-6; t += STEP) {
        const dir = t <= SPLIT ? d1 : d2
        if (dir[0] || dir[1]) {
          const nx = x + dir[0] * speed * STEP, ny = y + dir[1] * speed * STEP
          if (!S.boxBlocked(nx, y, 4)) x = nx
          if (!S.boxBlocked(x, ny, 4)) y = ny
        }
        for (const h of hz) {
          if (t > h.t + 0.3) continue
          const live = t >= h.t - 0.05 // 当たる瞬間のあたり（ここにいると大きく減点）。それ以前も、範囲の中にいると少し減点して早めに出る
          if (h.k === 'circle') {
            if (Math.hypot(x - h.x, y + 4 - h.y) < h.r + 8) pen += live ? 100 : 6
          } else if (h.k === 'wedge') {
            const rx = x - h.x, ry = y - h.y
            const d = Math.hypot(rx, ry)
            if (d < h.len + 6) {
              let da = Math.atan2(ry, rx) - h.ang
              while (da > Math.PI) da -= 2 * Math.PI
              while (da < -Math.PI) da += 2 * Math.PI
              if (Math.abs(da) < h.spread / 2 + 0.15 || d < 12) pen += live ? 100 : 5
            }
          } else {
            const dx = h.x2 - h.x, dy = h.y2 - h.y
            const len = Math.hypot(dx, dy) || 1
            const u = Math.max(0, Math.min(1, ((x - h.x) * dx + (y - h.y) * dy) / (len * len)))
            if (Math.hypot(x - (h.x + dx * u), y - (h.y + dy * u)) < Math.max(h.w, 4) / 2 + 8) pen += live ? (h.w >= 8 ? 100 : 40) : 4
          }
        }
        for (const p of pj) {
          if (Math.hypot(x - (p.x + p.vx * t), y - (p.y + 4 + p.vy * t)) < p.r + 7 + (p.splash || 0)) pen += 100
        }
        if (opts.arena) {
          const A = opts.arena
          const m = Math.min(x - A.x0, A.x1 - x, y - A.y0, A.y1 - y)
          if (m < 48) pen += (48 - m) * 0.4
        }
        if (av) for (const a of av) if (Math.hypot(x - a.x, y - a.y) < 38) pen += 25
        if (opts.hit && Math.hypot(x - opts.hit.x, y - opts.hit.y) <= opts.hit.r) strike++
      }
      // 行きたい向きへ、どれだけ進めたか（距離で比べる）
      let want = 0
      const ddx = x - L.x, ddy = y - L.y
      const full = speed * T
      if (dm > 0.01) want = 1 - (ddx * desired[0] + ddy * desired[1]) / (dm * full)
      else want = (Math.hypot(ddx, ddy) / full) * 0.3
      const score = pen + want * 8 - strike * 1.5
      if (score < bs) { bs = score; best = d1 }
    }
  }
  return best
}

// いちばん近い（気づいている）敵。近づく向きと、斬れる距離を返す
export function engage(S, L, range = 150, filter = () => true) {
  let ne = null, nd = range
  for (const e of S.actE) {
    if (e.hp <= 0 || (!e.aggro && e.kind !== 'boss') || !filter(e)) continue
    const d = Math.hypot(e.x - L.x, e.y - L.y) - e.rad
    if (d < nd) { nd = d; ne = e }
  }
  if (!ne) return null
  const J = JOBS[L.job]
  const d = Math.hypot(ne.x - L.x, ne.y - L.y) || 1
  const reachNeeded = Math.max(10, J.range - 4 + ne.rad - 6)
  return { enemy: ne, reach: reachNeeded, dir: d > reachNeeded ? [(ne.x - L.x) / d, (ne.y - L.y) / d] : [0, 0] }
}
