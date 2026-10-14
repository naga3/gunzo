// 画面を PNG に書き出す: node tools/shot.mjs out.png [allies] [seconds] [x,y(タイル)]
import { createSim } from '../src/sim.js'
import { JOB_LIST } from '../src/data.js'
import { TILE } from '../src/world.js'
import { createRenderer, W, H } from '../src/render.js'
import { writePng } from './png.mjs'

const out = process.argv[2] || '/tmp/gunzo.png'
const n = Number(process.argv[3] ?? 0)
const secs = Number(process.argv[4] ?? 1)
const S = createSim()
if (process.argv[5]) {
  const [tx, ty] = process.argv[5].split(',').map(Number)
  S.leader.x = tx * TILE + 8
  S.leader.y = ty * TILE + 8
}
for (let i = 0; i < n; i++) {
  const a = S.newAlly(JOB_LIST[i % JOB_LIST.length], S.leader.x + (Math.random() - 0.5) * 200, S.leader.y + (Math.random() - 0.5) * 140, 1 + (i % 9))
  a.hp = i % 5 === 0 ? a.maxhp * 0.5 : a.maxhp
}
for (let i = 0; i < secs * 60; i++) S.step(1 / 60)
const fb = new Uint8Array(W * H)
createRenderer(fb).draw(S, { screen: 'play', stick: null }, S.t)
writePng(out, fb, W, H, 1)
console.log('wrote', out, 'allies', S.allies.length)
