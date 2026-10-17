// 敵とボスのドット絵の確認: node tools/enemyview.mjs out.png [倍率]
import { writePng } from './png.mjs'
import { ENEMY_DATA, ENEMY_SIZE, enemyTable } from '../src/enemysprites.js'
import { P } from '../src/palette.js'

const scale = Number(process.argv[3] ?? 4)
const kinds = Object.keys(ENEMY_DATA).filter((k) => k !== 'boss')
const cellW = 30, cellH = 32, cols = 10
const stride = cols * cellW
const rowsN = Math.ceil((kinds.length * 2) / cols) + 4
const fb = new Uint8Array(stride * rowsN * cellH).fill(P.gr3)
function draw(kind, f, ox, oy, opts) {
  const { w, h } = ENEMY_SIZE[kind]
  const tbl = enemyTable(kind, P, opts)
  const data = ENEMY_DATA[kind][f]
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const ch = data[y * w + x]
    if (ch === 46) continue
    const c = tbl[ch]
    if (c !== 255) fb[(oy + y) * stride + ox + x] = c
  }
}
kinds.forEach((k, i) => {
  for (const [j, f] of ['a', 'b'].entries()) {
    const n = i * 2 + j
    const { w, h } = ENEMY_SIZE[k]
    draw(k, f, (n % cols) * cellW + Math.floor((cellW - w) / 2), Math.floor(n / cols) * cellH + (cellH - h), {})
  }
})
// ボス（通常・怒り・気絶）
const by = Math.ceil((kinds.length * 2) / cols) * cellH
;[{}, { rage: true }, { stun: true }].forEach((o, i) => draw('boss', i === 1 ? 'b' : 'a', i * 56 + 4, by + 2, o))
writePng(process.argv[2] || '/tmp/gz/enemies.png', fb, stride, rowsN * cellH, scale)
console.log('ok', kinds.length)
