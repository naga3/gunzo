// 味方のドット絵の確認: node tools/spriteview.mjs out.png [職]
import { writePng } from './png.mjs'
import { BASE, W, H, SPRITES, JOB_ART } from '../src/sprites.js'
import { P } from '../src/palette.js'

const COL = {
  o: 'ink', s: 'sk3', S: 'sk2', e: 'ink', E: 'white', h: 'br3', H: 'br1', j: 'br5',
  c: 'bl3', C: 'bl2', D: 'bl4', u: 'bl2', U: 'bl1', V: 'bl3', p: 'br2', P: 'br1', g: 'br3', G: 'br1', l: 'br5',
  m: 'gy6', M: 'gy4', n: 'gy3', w: 'white', y: 'ye1', Y: 'ye3', r: 'rd3', R: 'rd1', x: 'or2', X: 'or1', z: 'tl2',
}
function render(rows, fb, ox, oy, stride, ex = {}) {
  const C2 = { ...COL, ...ex }
  rows.forEach((r, y) => [...r].forEach((ch, x) => { if (ch !== '.' && ch !== '_' && C2[ch]) fb[(oy + y) * stride + ox + x] = P[C2[ch]] }))
}
const frames = Object.values(SPRITES).flatMap((s) => [s.a, s.b])
const cols = 8, scale = 6
const stride = cols * 18, rowsN = Math.ceil(frames.length / cols)
const fb = new Uint8Array(stride * rowsN * 26).fill(P.gr3)
frames.forEach((f, i) => { const job = Object.keys(SPRITES)[i >> 1]; const ex = JOB_ART[job].extra ?? {}; render(f, fb, (i % cols) * 18 + 1, Math.floor(i / cols) * 26 + 1, stride, ex) })
writePng(process.argv[2] || '/tmp/sprites.png', fb, stride, rowsN * 26, scale)
for (const [k, rows] of Object.entries(BASE)) {
  if (rows.length !== H) console.log('rows', k, rows.length)
  rows.forEach((r, i) => { if (r.length !== W) console.log('bad length', k, i, r.length, JSON.stringify(r)) })
}
