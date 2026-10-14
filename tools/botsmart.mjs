// 上手い人のボット：敵の手前で止まって態勢を整え、1グループずつ引き寄せて戦い、予兆の攻撃を避ける
//   node tools/botsmart.mjs [レベル 1=上手い 2=とても上手い] [最大分=90] [seed=7]
import { makeRun, stats, lossesByRegion, killers, castleSplit, deathAnalysis } from './botlib.mjs'
import { microMove } from './microlib.mjs'
import { TILE } from '../src/world.js'
import { ENEMIES, JOBS } from '../src/data.js'

const SKILL = Number(process.argv[2] ?? 1)
const MAXMIN = Number(process.argv[3] ?? 90)
const run = makeRun(Number(process.argv[4] ?? 7))
const { S } = run
S.hitLog = []
const dt = 1 / 30
const KITE = process.env.KITE === '1'
const need = SKILL > 1 ? { hp: 0.96, near: 0.95 } : { hp: 0.85, near: 0.9 }

const skipped = new Map() // 引き寄せに失敗した敵は、しばらく無視する
const trail = []
let trailT = 0
let nextLog = 0, target = null, mode = 'travel', rally = null, modeT = 0, pullEnemy = null, bossT0 = null, aliveAtBoss = 0, lostAtBoss = 0
const ignoreFight = new Map() // 長く戦っても決着しない（届かない）敵は、しばらく無視する
const aggroed = () => S.actE.filter((e) => e.aggro && e.hp > 0 && e.kind !== 'boss' && (ignoreFight.get(e) ?? 0) < S.t && Math.hypot(e.x - S.leader.x, e.y - S.leader.y) < 420)
const calm = (L) => {
  const near = S.allies.filter((a) => Math.hypot(a.x - L.x, a.y - L.y) < 190).length
  const hp = S.allies.reduce((s, a) => s + a.hp / a.maxhp, 0) / S.allies.length
  return near >= S.allies.length * need.near && hp >= need.hp
}
const inArena = (L) => L.y < 30 * TILE && L.x > 148 * TILE
while (S.t < MAXMIN * 60 && S.state === 'play') {
  const L = S.leader
  modeT += dt
  trailT += dt
  if (trailT >= 0.5) { trailT = 0; trail.push({ x: L.x, y: L.y }); if (trail.length > 400) trail.shift() }
  let want = [0, 0]
  const fight = aggroed()
  const bossGo = S.rescued >= 99 || S.cages.every((c) => c.opened)

  // 目標
  let goalTile
  if (bossGo) goalTile = inArena(L) ? [167, 22] : L.y < 36 * TILE + 40 && L.y > 30 * TILE ? [167, 24] : [167, 36]
  else {
    if (!target || target.opened) {
      const rem = S.cages.filter((c) => !c.opened)
      const reg = Math.min(...rem.map((c) => c.region))
      let best = null, bd = Infinity
      for (const c of rem) { if (c.region !== reg) continue; const d = run.pathLen(L, c.tx, c.ty); if (d < bd) { bd = d; best = c } }
      target = best
    }
    goalTile = [target.tx, target.ty]
  }

  const go = (mode2) => { mode = mode2; modeT = 0 }
  if (inArena(L) && S.boss.aggro) {
    // ボス戦：ボスから離れた位置で動き回って避ける。味方が戦う
    const b = S.boss
    const d = Math.hypot(b.x - L.x, b.y - L.y)
    want = d < 190 ? [(L.x - b.x) / (d || 1), (L.y - b.y) / (d || 1)] : d > 240 ? [(b.x - L.x) / d, (b.y - L.y) / d] : [0, 0]
    if (bossT0 === null) { bossT0 = S.t; aliveAtBoss = S.allies.length; lostAtBoss = S.lost }
  } else {
    // 1 フレームに 1 回だけ状態を変える
    switch (mode) {
      case 'travel': {
        let threat = null, td = Infinity
        for (const e of S.actE) {
          if (e.aggro || e.hp <= 0 || e.kind === 'boss' || (skipped.get(e) ?? 0) > S.t) continue
          const d = Math.hypot(e.x - L.x, e.y - L.y)
          if (d < ENEMIES[e.kind].aggro + 110 && d < td) { td = d; threat = e }
        }
        if (fight.length > 0) { rally = { x: L.x, y: L.y }; go('fight') }
        else if (threat && !inArena(L)) { rally = { x: L.x, y: L.y }; pullEnemy = threat; go('stage') }
        else {
          const d = Math.hypot(goalTile[0] * TILE + 8 - L.x, goalTile[1] * TILE + 8 - L.y)
          want = target && !target.opened && !bossGo && d < 26 ? [0, 0] : run.dirToward(L, goalTile[0], goalTile[1])
        }
        break
      }
      case 'stage': // 態勢が整うまで待つ
        if (fight.length > 0) go('fight')
        else if (calm(L) || modeT > 30) go('pull')
        break
      case 'pull': { // 1 グループだけ引き寄せる
        if (fight.length > 0) go('fight')
        else if (!pullEnemy || pullEnemy.hp <= 0) go('recover')
        else {
          const d = Math.hypot(pullEnemy.x - L.x, pullEnemy.y - L.y)
          if (modeT > 12) { skipped.set(pullEnemy, S.t + 90); go('recover') }
          else want = [(pullEnemy.x - L.x) / d, (pullEnemy.y - L.y) / d]
        }
        break
      }
      case 'fight': {
        // 下がりながら戦う：足の遅い敵に追いつかれないよう、近い敵から離れる。遠くから撃ってくる敵には近づく
        let nd = Infinity, ne = null
        for (const e of fight) { const d = Math.hypot(e.x - L.x, e.y - L.y); if (d < nd) { nd = d; ne = e } }
        const meleeNear = SKILL > 0 && fight.some((e) => ['melee', 'flyer', 'slam', 'charge'].includes(e.def.atk) && Math.hypot(e.x - L.x, e.y - L.y) < (SKILL > 1 ? 190 : 150))
        if (meleeNear && KITE) {
          const back = trail[Math.max(0, trail.length - 1 - 6)] ?? rally
          want = run.dirToward(L, Math.floor(back.x / TILE), Math.floor(back.y / TILE))
        } else if (ne && modeT > 6) {
          if (nd > 60) want = [(ne.x - L.x) / nd, (ne.y - L.y) / nd]
        } else {
          const rd = Math.hypot(rally.x - L.x, rally.y - L.y)
          if (rd > 14) want = [(rally.x - L.x) / rd, (rally.y - L.y) / rd]
        }
        if (modeT > 45) { for (const e of fight) ignoreFight.set(e, S.t + 120); go('recover') }
        else if (fight.length === 0 && modeT > 2) go('recover')
        break
      }
      case 'recover':
        if (fight.length > 0) go('fight')
        else if (calm(L) || modeT > 30) { rally = null; go('travel') }
        break
    }
  }
  const m = microMove(S, L, want, { arena: inArena(L) ? S.world.arena : null })
  S.input.mx = m[0]
  S.input.my = m[1]
  S.step(dt)
  if (S.t >= nextLog) { nextLog += 120; const s = stats(S); console.log(`${String(s.t).padStart(5)}s 救出${s.rescued} 生存${s.alive} 失った${s.lost} 倒した${s.kills} 平均LV${s.avgLv} ${mode}`) }
}
const s = stats(S)
if (bossT0 !== null) console.log(`ボス戦 ${Math.round(S.t - bossT0)}秒 開始時の生存${aliveAtBoss} この戦いで失った${S.lost - lostAtBoss}`)
console.log(`${S.state} ${s.t}s 救出${s.rescued}/${S.total} 生存${s.alive} 失った${s.lost} 倒した${s.kills} 平均LV${s.avgLv} ボスHP ${Math.round(S.boss.hp)}/${S.boss.maxhp}`)
console.log(JSON.stringify(s.byJob), '死んだ場所', JSON.stringify(lossesByRegion(S)), JSON.stringify(castleSplit(S)))
console.log('倒した敵', JSON.stringify(killers(S)))
console.log('死に方', JSON.stringify(deathAnalysis(S)))
