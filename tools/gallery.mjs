// 全職と全敵を並べた一覧画像: node tools/gallery.mjs out.png
import { createSim } from '../src/sim.js'
import { JOB_LIST, ENEMIES } from '../src/data.js'
import { TILE } from '../src/world.js'
import { createRenderer, W, H } from '../src/render.js'
import { writePng } from './png.mjs'

const S = createSim()
// 何もない草地へ移して、並べる
S.leader.x = 12 * TILE; S.leader.y = 128 * TILE
S.enemies.length = 0
const base = { x: S.leader.x - 100, y: S.leader.y - 90 }
JOB_LIST.forEach((j, i) => {
  const u = S.newAlly(j, base.x + (i % 11) * 22, base.y, 5)
  u.face = 1
})
const kinds = Object.keys(ENEMIES)
kinds.forEach((k, i) => {
  const e = S.enemies.length
  const en = (() => { const o = { kind: k }; return o })()
})
// 敵は newEnemy を直接呼べないので、sim の公開口を使う
for (const [i, k] of kinds.entries()) S.spawnEnemy(k, base.x + (i % 12) * 26, base.y + 40 + Math.floor(i / 12) * 34)
S.step(0.01)
const fb = new Uint8Array(W * H)
const R = createRenderer(fb)
R.draw(S, { screen: 'play', stick: null }, 0.2)
// 切り出して拡大
const cx = Math.round(base.x - S.cam.x - 16), cy = Math.round(base.y - S.cam.y - 30)
const cw = 300, ch = 130
const crop = new Uint8Array(cw * ch)
for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) crop[y * cw + x] = fb[(cy + y) * W + (cx + x)]
writePng(process.argv[2] || '/tmp/gunzo-gallery.png', crop, cw, ch, 4)
console.log('ok', kinds.length)
