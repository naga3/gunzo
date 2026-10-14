// パレットを、ドット絵ツール用のファイルに書き出す: node tools/export-palette.mjs
import { writeFileSync } from 'node:fs'
import { PAL_HEX, P } from '../src/palette.js'
import { writePng } from './png.mjs'

const names = Object.entries(P).sort((a, b) => a[1] - b[1]).map((e) => e[0])
// GIMP パレット（.gpl）：Aseprite・GIMP・Krita などで開ける
const gpl = ['GIMP Palette', 'Name: GUNZO 64', 'Columns: 8', '#']
PAL_HEX.forEach((h, i) => gpl.push(`${String(parseInt(h.slice(0, 2), 16)).padStart(3)} ${String(parseInt(h.slice(2, 4), 16)).padStart(3)} ${String(parseInt(h.slice(4, 6), 16)).padStart(3)} ${names[i]}`))
writeFileSync('art/gunzo64.gpl', gpl.join('\n') + '\n')
// 16 進数の一覧（Lospec 形式。1 行 1 色）
writeFileSync('art/gunzo64.hex', PAL_HEX.join('\n') + '\n')
// 色見本の PNG（8x8 のマス）
const cell = 16, cols = 8
const fb = new Uint8Array(cols * 8 * cell * cell)
for (let i = 0; i < 64; i++) {
  const cx = (i % cols) * cell, cy = Math.floor(i / cols) * cell
  for (let y = 0; y < cell; y++) for (let x = 0; x < cell; x++) fb[(cy + y) * cols * cell + cx + x] = i
}
writePng('art/gunzo64.png', fb, cols * cell, 8 * cell, 1)
// 色の一覧（名前つき）
writeFileSync('art/gunzo64.txt', PAL_HEX.map((h, i) => `${String(i).padStart(2)} ${names[i].padEnd(6)} #${h}`).join('\n') + '\n')
console.log('wrote art/gunzo64.{gpl,hex,png,txt}')
