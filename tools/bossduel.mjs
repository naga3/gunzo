// ソロのボット：主人公（LV12）ひとりでボスと戦う。何回か回して、勝てるかを見る
//   node tools/bossduel.mjs [回数=8]
import { makeRun } from './botlib.mjs'
import { microMove, engage } from './microlib.mjs'
import { TILE } from '../src/world.js'

const RUNS = Number(process.argv[2] ?? 8)
const out = []
for (let r = 0; r < RUNS; r++) {
  const run = makeRun(7)
  const { S } = run
  const L = S.leader
  L.lvl = 12
  L.maxhp = Math.round(34 * 2.1)
  L.hp = L.maxhp
  L.x = 167 * TILE
  L.y = 26 * TILE
  for (let i = 0; i < 30 * 300 && S.state === 'play'; i++) {
    const en = engage(S, L, 400, (e) => e.kind === 'boss')
    const want = en ? en.dir : [0, -1]
    const m = microMove(S, L, want, { arena: S.world.arena, hit: en ? { x: en.enemy.x, y: en.enemy.y, r: en.reach } : null })
    S.input.mx = m[0]
    S.input.my = m[1]
    S.step(1 / 30)
  }
  out.push({ state: S.state, left: Math.round(S.boss.hp), max: S.boss.maxhp, t: Math.round(S.t) })
}
console.log(out.map((o) => `${o.state}(残り${o.left}/${o.max}, ${o.t}秒)`).join('\n'))
console.log(`勝ち ${out.filter((o) => o.state === 'win').length}/${RUNS}`)
