// ボス戦だけを繰り返す: node tools/bossarmy.mjs [回数=12] [人数=90] [レベル=7]
import { createSim } from '../src/sim.js'
import { JOB_LIST, JOB_COUNTS } from '../src/data.js'
import { TILE } from '../src/world.js'
import { killers, deathAnalysis } from './botlib.mjs'

const RUNS = Number(process.argv[2] ?? 12)
const N = Number(process.argv[3] ?? 90)
const LV = Number(process.argv[4] ?? 7)
const res = []
for (let r = 0; r < RUNS; r++) {
  const S = createSim()
  S.hitLog = []
  S.enemies = S.enemies.filter((e) => e.kind === 'boss')
  const jobs = []
  for (const j of JOB_LIST) for (let i = 0; i < JOB_COUNTS[j]; i++) jobs.push(j)
  S.leader.x = 167 * TILE; S.leader.y = 34 * TILE
  for (let i = 0; i < N - 1; i++) {
    const j = jobs[(Math.random() * jobs.length) | 0]
    const a = S.newAlly(j, S.leader.x + (Math.random() - 0.5) * 240, S.leader.y + (Math.random() - 0.5) * 100, LV)
    a.hp = a.maxhp
  }
  S.leader.lvl = LV; S.leader.maxhp = Math.round(34 * (1 + 0.1 * (LV - 1))); S.leader.hp = S.leader.maxhp
  let t0 = null
  for (let i = 0; i < 30 * 240 && S.state === 'play'; i++) {
    const L = S.leader
    const b = S.boss
    // ふつう：ボスの少し手前まで歩く
    const gx = b.x, gy = b.y + 120
    const d = Math.hypot(gx - L.x, gy - L.y)
    S.input.mx = d > 20 ? (gx - L.x) / d : 0
    S.input.my = d > 20 ? (gy - L.y) / d : 0
    S.step(1 / 30)
    if (t0 === null && b.aggro) t0 = S.t
  }
  res.push({ lost: S.lost, t: S.t - (t0 ?? 0), state: S.state, k: killers(S), da: deathAnalysis(S) })
}
console.log('損害', res.map((r) => r.lost).join(' '), ' 平均', (res.reduce((s, r) => s + r.lost, 0) / res.length).toFixed(1))
console.log('時間', res.map((r) => Math.round(r.t)).join(' '))
const all = {}
for (const r of res) for (const [k, v] of Object.entries(r.k)) all[k] = (all[k] || 0) + v
console.log('倒した敵（合計）', JSON.stringify(all))
console.log('勝敗', res.map((r) => r.state).join(' '))
