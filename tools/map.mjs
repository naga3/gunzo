// 世界の地図を PNG に書き出す: node tools/map.mjs out.png [seed]
import { generateWorld, MW, MH, T, TILE } from '../src/world.js'
import { P } from '../src/palette.js'
import { writePng } from './png.mjs'

const w = generateWorld(Number(process.argv[3] ?? 7))
const S = 4
const fb = new Uint8Array(MW * MH)
const ground = [P.gr3, P.gr2, P.sa2, P.gy6, P.gy2, P.gy3]
for (let y = 0; y < MH; y++) {
  for (let x = 0; x < MW; x++) {
    const b = w.biome[y * MW + x], t = w.tiles[y * MW + x]
    let c = ground[b]
    if (t === T.TREE) c = [P.gr1, P.gr0, P.sa1, P.gy4, P.br1, P.gy1][b]
    else if (t === T.WATER) c = b === 3 ? P.bl5 : b === 4 ? P.or2 : P.wt2
    else if (t === T.ROCK) c = P.gy4
    else if (t === T.PATH) c = P.br4
    else if (t === T.WALL) c = P.gy1
    else if (t === T.FLOOR) c = P.gy3
    fb[y * MW + x] = c
  }
}
const mark = (tx, ty, c, r = 1) => { for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) { const x = tx + i, y = ty + j; if (x >= 0 && y >= 0 && x < MW && y < MH) fb[y * MW + x] = c } }
for (const e of w.enemies) fb[Math.floor(e.y / TILE) * MW + Math.floor(e.x / TILE)] = P.rd3
for (const s of w.spots) mark(s.tx, s.ty, P.ye2, 1)
mark(Math.floor(w.start.x / TILE), Math.floor(w.start.y / TILE), P.white, 2)
mark(Math.floor(w.boss.x / TILE), Math.floor(w.boss.y / TILE), P.mag, 2)
writePng(process.argv[2] || '/tmp/gunzo-map.png', fb, MW, MH, S)
console.log('ok')
