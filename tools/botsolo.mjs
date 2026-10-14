// ソロのボット：誰も助けずに、主人公ひとりで魔王城へ行ってボスを倒す
//   node tools/botsolo.mjs [最大分=40] [seed=7]
import { makeRun, stats, lastDeath } from './botlib.mjs'
import { microMove, engage } from './microlib.mjs'
import { TILE } from '../src/world.js'

const ROUTE = [...run0().S.world.highway.slice(1), [167, 36], [167, 24], [167, 16]]
function run0() { return makeRun(Number(process.argv[3] ?? 7)) }

const MAXMIN = Number(process.argv[2] ?? 40)
const run = makeRun(Number(process.argv[3] ?? 7))
const { S } = run
const dt = 1 / 30
let nextLog = 0, minHp = 1e9, wi = 0
let bossT0 = null, farmTarget = null
const FARM_LV = Number(process.env.FARM ?? 10)
S.hitLog = []
while (S.t < MAXMIN * 60 && S.state === 'play') {
  const L = S.leader
  let mx = 0, my = 0
  while (wi < ROUTE.length - 1 && Math.hypot(ROUTE[wi][0] * TILE + 8 - L.x, ROUTE[wi][1] * TILE + 8 - L.y) < 40) wi++
  const goal = ROUTE[wi]
  const inArena = L.y < 30 * TILE && L.x > 148 * TILE
  // 弱い敵・飛ぶ敵・ボスとは戦い、遅い強敵は走り抜ける
  const farming = L.lvl < FARM_LV && S.t < 900
  const en = engage(S, L, 150, (e) => inArena || e.kind === 'boss' || e.def.tier <= (farming ? 2 : 1) || (e.def.atk === 'flyer' && e.def.speed > 72))
  let want
  let hit = null
  if (en) { want = en.dir; hit = { x: en.enemy.x, y: en.enemy.y, r: en.reach } }
  else if (farming) {
    // 経験値かせぎ：いちばん近い弱い敵（tier 2 以下）へ向かう
    if (!farmTarget || farmTarget.hp <= 0) {
      let best = null, bd = Infinity
      for (const e of S.enemies) {
        if (e.hp <= 0 || e.def.tier > 2 || e.kind === 'boss') continue
        const d = run.pathLen(L, Math.floor(e.x / TILE), Math.floor(e.y / TILE))
        if (d < bd) { bd = d; best = e }
      }
      farmTarget = best
    }
    want = farmTarget ? run.dirToward(L, Math.floor(farmTarget.x / TILE), Math.floor(farmTarget.y / TILE)) : [0, 0]
  } else want = run.dirToward(L, goal[0], goal[1])
  ;[mx, my] = microMove(S, L, want, { avoid: S.cages.filter((c) => !c.opened), arena: inArena ? S.world.arena : null, hit })
  S.input.mx = mx
  S.input.my = my
  S.step(dt)
  if (bossT0 === null && S.boss.aggro) bossT0 = S.t
  minHp = Math.min(minHp, L.hp)
  if (process.env.TRACE && Math.round(S.t * 30) % 150 === 0) console.log("  trace", Math.round(S.t), "tile", Math.round(L.x / TILE), Math.round(L.y / TILE), "wp", wi, ROUTE[wi].join(","), "want", want.map((v) => v.toFixed(2)).join(","), "move", mx.toFixed(2), my.toFixed(2), "engage", !!en)
  if (S.t >= nextLog) { nextLog += 60; console.log(`${String(Math.round(S.t)).padStart(5)}s hp ${Math.round(L.hp)}/${L.maxhp} LV${L.lvl} 倒した${S.kills} 位置 ${Math.round(L.x / TILE)},${Math.round(L.y / TILE)} ボスHP ${Math.round(S.boss.hp)}`) }
}
console.log('最後に倒した', lastDeath(S))
if (process.env.HITS) { const hs = S.hitLog.filter((h) => h.id === S.leader.id || true).slice(-25); for (const h of hs) console.log('  hit', h.t.toFixed(1), h.by, h.dmg, 'hp', Math.round(h.hp)) }
console.log(`${S.state} ${Math.round(S.t)}s 倒した${S.kills} LV${S.leader.lvl} ボスHP ${Math.round(S.boss.hp)}/${S.boss.maxhp} ${bossT0 ? 'ボス戦 ' + Math.round(S.t - bossT0) + '秒' : ''}`)
