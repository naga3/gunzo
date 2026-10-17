// ボス戦だけを繰り返す: node tools/bossarmy.mjs [回数=12] [人数=90] [レベル=7]
import { createSim } from '../src/sim.js'
import { JOB_LIST, JOB_COUNTS, DIFFS, lvMul } from '../src/data.js'
import { TILE } from '../src/world.js'
import { killers, deathAnalysis } from './botlib.mjs'

const RUNS = Number(process.argv[2] ?? 12)
const N = Number(process.argv[3] ?? 90)
const LV = Number(process.argv[4] ?? 7)
// 試しに倍率を変える: BOSS_HP=1.5 BOSS_DMG=1.3 node tools/bossarmy.mjs …（data.js は書き換えない）
const D0 = DIFFS[process.env.GUNZO_DIFF || 'normal']
if (process.env.BOSS_HP) D0.boss = Number(process.env.BOSS_HP)
if (process.env.BOSS_DMG) D0.bossDmg = Number(process.env.BOSS_DMG)
// 上手な人の代わり: SKILL=0.6 で、ボスが予兆を出すたびに 6 割で隙を作り（BREAK）、操作キャラは避けきる（倒れない）
const SKILL = Number(process.env.SKILL ?? 0)
const res = []
for (let r = 0; r < RUNS; r++) {
  const S = createSim({ diff: process.env.GUNZO_DIFF || 'normal', manual: true, botLeader: true })
  S.hitLog = []
  S.dmgByJob = {}
  S.enemies = S.enemies.filter((e) => e.kind === 'boss')
  const jobs = []
  for (const j of JOB_LIST) for (let i = 0; i < JOB_COUNTS[j]; i++) jobs.push(j)
  S.leader.x = 167 * TILE; S.leader.y = 34 * TILE
  for (let i = 0; i < N - 1; i++) {
    const j = jobs[(Math.random() * jobs.length) | 0]
    const a = S.newAlly(j, S.leader.x + (Math.random() - 0.5) * 240, S.leader.y + (Math.random() - 0.5) * 100, LV)
    a.hp = a.maxhp
  }
  S.leader.lvl = LV; S.leader.maxhp = Math.round(34 * lvMul(LV)); S.leader.hp = S.leader.maxhp
  let t0 = null
  for (let i = 0; i < 30 * 240 && S.state === 'play'; i++) {
    const L = S.leader
    const b = S.boss
    // ふつう：ボスの少し手前まで歩く
    const gx = b.x, gy = b.y + 70
    const d = Math.hypot(gx - L.x, gy - L.y)
    S.input.mx = d > 20 ? (gx - L.x) / d : 0
    S.input.my = d > 20 ? (gy - L.y) / d : 0
    if (SKILL > 0) {
      if (b.pstate === 'wind' && b.lastWind !== b.pT0) { b.lastWind = b.pT0; if (Math.random() < SKILL) b.wantOpen = true }
      if (b.wantOpen && b.pstate === 'wind' && b.pT < b.pT0 * 0.5) { b.wantOpen = false; S.bossOpening(b, L) }
      if (b.pstate !== 'wind') b.wantOpen = false
      L.hp = L.maxhp
    }
    S.step(1 / 30)
    if (t0 === null && b.aggro) t0 = S.t
  }
  res.push({ lead: (S.dmgLeaderBoss ?? 0) / S.boss.maxhp, hpLeft: Math.max(0, S.boss.hp / S.boss.maxhp), lost: S.lost, t: S.t - (t0 ?? 0), state: S.state, k: killers(S), da: deathAnalysis(S) })
}
console.log('損害', res.map((r) => r.lost).join(' '), ' 平均', (res.reduce((s, r) => s + r.lost, 0) / res.length).toFixed(1))
console.log('時間', res.map((r) => Math.round(r.t)).join(' '))
const all = {}
for (const r of res) for (const [k, v] of Object.entries(r.k)) all[k] = (all[k] || 0) + v
console.log('倒した敵（合計）', JSON.stringify(all))
console.log('勝敗', res.map((r) => r.state).join(' '), ` 勝ち ${res.filter((r) => r.state === 'win').length}/${res.length}`)
console.log('操作キャラが削った割合', res.map((r) => `${Math.round(r.lead * 100)}%`).join(' '))
console.log('ボスの残り体力', res.map((r) => `${Math.round(r.hpLeft * 100)}%`).join(' '))
