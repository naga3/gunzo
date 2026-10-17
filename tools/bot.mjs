// ふつうのボット：近い捕虜から順に、まっすぐ歩いて助ける。避けない・待たない
//   node tools/bot.mjs [助けたい人数=99] [最大分=90] [seed=7]
import { makeRun, stats, lossesByRegion, killers, castleSplit, deathAnalysis } from './botlib.mjs'
import { TILE } from '../src/world.js'

const GOAL = Number(process.argv[2] ?? 99)
const MAXMIN = Number(process.argv[3] ?? 90)
const run = makeRun(Number(process.argv[4] ?? 7))
const { S } = run
S.hitLog = []
S.dmgByJob = {}
const dt = 1 / 30
let nextLog = 0
let target = null
// GRIND=分: 全員助けたあと、その分だけ陣地を回って敵を狩ってからボスへ（湧き直しを使ったレベル上げ）
const GRIND = Number(process.env.GRIND ?? 0) * 60
let grindT0 = null, grindCamp = null, lvBeforeGrind = null
const campSeen = new Map()
let bossT0 = null, aliveAtBoss = 0, lostAtBoss = 0
const arenaGate = { x: 167 * TILE, y: 44 * TILE }
while (S.t < MAXMIN * 60 && S.state === 'play') {
  const L = S.leader
  let tx, ty
  const allFree = S.rescued >= GOAL || S.cages.every((c) => c.opened)
  if (allFree && grindT0 === null) { grindT0 = S.t; lvBeforeGrind = stats(S).avgLv }
  if (allFree && S.t - grindT0 < GRIND) {
    // いちばん近い、しばらく行っていない陣地（魔王城の外）へ
    if (!grindCamp || Math.hypot(grindCamp.x - L.x, grindCamp.y - L.y) < 30) {
      if (grindCamp) campSeen.set(grindCamp, S.t)
      let best = null, bd = Infinity
      for (const c of S.camps) {
        if (c.tier < 4 || c.x > 147 * TILE || S.t - (campSeen.get(c) ?? -99) < 40) continue
        const d = Math.hypot(c.x - L.x, c.y - L.y)
        if (d < bd) { bd = d; best = c }
      }
      grindCamp = best
    }
    target = null
    tx = Math.floor(grindCamp.x / TILE); ty = Math.floor(grindCamp.y / TILE)
  } else if (allFree) {
    // ボスへ：闘技場の中まで
    tx = 167; ty = 16
    if (L.y < 30 * TILE) { tx = Math.floor(S.boss.x / TILE); ty = Math.floor(S.boss.y / TILE) + 6 }
  } else {
    if (!target || target.opened) {
      // 弱い地域から順に（草原→森→砂漠→雪原→火山）、同じ地域では近いものから
      const rem = S.cages.filter((c) => !c.opened)
      const reg = Math.min(...rem.map((c) => c.region))
      let best = null, bd = Infinity
      for (const c of rem) {
        if (c.region !== reg) continue
        const d = run.pathLen(L, c.tx, c.ty)
        if (d < bd) { bd = d; best = c }
      }
      target = best
    }
    tx = target.tx; ty = target.ty
  }
  const d = Math.hypot(tx * TILE + 8 - L.x, ty * TILE + 8 - L.y)
  if (target && !target.opened && d < 26) { S.input.mx = 0; S.input.my = 0 } // 檻の前では止まって壊す
  else { const [mx, my] = run.dirToward(L, tx, ty); S.input.mx = mx; S.input.my = my }
  S.step(dt)
  if (bossT0 === null && S.boss.aggro) { bossT0 = S.t; aliveAtBoss = S.allies.length; lostAtBoss = S.lost }
  if (S.t >= nextLog) { nextLog += 120; const s = stats(S); console.log(`${String(s.t).padStart(5)}s 救出${s.rescued} 生存${s.alive} 失った${s.lost} 倒した${s.kills} 平均LV${s.avgLv}`) }
}
const s = stats(S)
if (GRIND) console.log(`レベル上げ ${GRIND / 60}分: 平均LV ${lvBeforeGrind} → ${s.avgLv}`)
if (bossT0 !== null) console.log(`ボス戦 ${Math.round(S.t - bossT0)}秒 開始時の生存${aliveAtBoss} この戦いで失った${S.lost - lostAtBoss}`)
console.log(`${S.state} ${s.t}s 救出${s.rescued}/${S.total} 生存${s.alive} 失った${s.lost} 倒した${s.kills} 平均LV${s.avgLv} ボスHP ${Math.round(S.boss.hp)}/${S.boss.maxhp}`)
console.log(JSON.stringify(s.byJob), '死んだ場所', JSON.stringify(lossesByRegion(S)), JSON.stringify(castleSplit(S)))
console.log('倒した敵', JSON.stringify(killers(S)))
console.log('死に方', JSON.stringify(deathAnalysis(S)))
// 職ごとの与えたダメージ（硬い・飛ぶ・ふつう・ボスの割合）。人数で割って、1 人あたりで比べる
{
  const n = {}
  for (const c of S.cages) n[c.job] = (n[c.job] ?? 0) + 1
  const rows = Object.entries(S.dmgByJob).map(([j, t]) => {
    const all = t.armor + t.flyer + t.other + t.boss, per = all / (n[j] ?? 1)
    return `${j.padEnd(6)} 1人 ${per.toFixed(0).padStart(5)}  硬い${((t.armor / all) * 100).toFixed(0).padStart(3)}% 飛ぶ${((t.flyer / all) * 100).toFixed(0).padStart(3)}% ボス${((t.boss / all) * 100).toFixed(0).padStart(3)}%`
  })
  console.log('職ごとの与えたダメージ\n  ' + rows.join('\n  '))
}
