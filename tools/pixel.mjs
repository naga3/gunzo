// art/ は PX-13h Pixel（~/src/etc/px13h/tools/pixel）の「グループ gunzo」。Pixel で直接ここの絵を描く
//   art/group.json（色の表と、保存したら動かすコマンド）、art/GROUP.md・art/allies/GROUP.md（Pixel の Claude への指示）
//   art/gunzo.gpl: 色の表の元（ゲームも Pixel もここを読む）
//   art/allies/<職>.pic: 味方の向きごとの一枚絵（down・up・left・right）と、動きのコマ（down_walk1 など）
//   動き（アニメ）は、各ファイルの anim の行（anim walk_down down_walk1:120 down:120 …。Pixel のプレビューと、ゲームの両方が読む）
// このスクリプト:
//   node tools/pixel.mjs build          art/gunzo.gpl → src/palette.js、art/allies/*.pic → src/art.js（Pixel が保存のたびに動かす。変わったときだけ書く）
//   node tools/pixel.mjs new <職>        art/allies/<職>.pic を作る（右は今の絵、左はその反転を下書きに。上下は空）
import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { SPRITES, roleNames, W, H } from '../src/sprites.js'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const ART = join(ROOT, 'art')
const ALLIES = join(ART, 'allies')
const GPL = join(ART, 'gunzo.gpl')
const DIRS = ['down'] // 人は正面だけ（2026-10-17）
const LABEL = { down: '下（正面）', up: '上（背中）', left: '左', right: '右' }

// art/gunzo.gpl（GIMP のパレット）を読む: [{ hex, name }]
function readGpl() {
  const out = []
  for (const line of readFileSync(GPL, 'utf8').split('\n')) {
    const m = /^\s*(\d+)\s+(\d+)\s+(\d+)\s+(\S+)/.exec(line)
    if (m) out.push({ hex: [m[1], m[2], m[3]].map((v) => (+v).toString(16).padStart(2, '0')).join(''), name: m[4] })
  }
  if (!out.length || out.length > 256) throw new Error(`${GPL} の色は 1〜256 個（${out.length} 個）`)
  const dup = out.find((c, i) => out.findIndex((d) => d.name === c.name) !== i)
  if (dup) throw new Error(`${GPL} に同じ名前 ${dup.name} が 2 つある`)
  return out
}
const PAL = readGpl()
const P = Object.fromEntries(PAL.map((c, i) => [c.name, i]))
const NAME_OF = PAL.map((c) => c.name)

// 中身が変わったときだけ書く（Vite が、変わっていないファイルでゲームを読み直さないように）
function writeIfChanged(file, text) {
  if (existsSync(file) && readFileSync(file, 'utf8') === text) return false
  writeFileSync(file, text)
  return true
}

// .pic を読む（Pixel の pic.js と同じ書き方。ここでは要る分だけ）: { palette, rgb, colors: { 文字: 番号 }, pics: { 名前: rows } }
function readPic(file) {
  const doc = { palette: null, rgb: 0, colors: {}, pics: {}, anims: {} }
  let cur = null
  for (const raw of readFileSync(file, 'utf8').split('\n')) {
    const line = raw.replace(/\s+$/, '')
    if (/^\s/.test(line) && line.trim()) { if (cur) cur.push(line.trim()); continue }
    cur = null
    let m
    if ((m = /^palette\s+(\S+)$/.exec(line))) doc.palette = m[1]
    else if (/^rgb\s/.test(line)) doc.rgb++
    else if ((m = /^anim\s+(\S+)\s+(.+)$/.exec(line))) {
      const fr = m[2].trim().split(/\s+/).map((f) => /^([A-Za-z_][A-Za-z0-9_]*)(?::(\d+))?$/.exec(f)).filter(Boolean)
      doc.anims[m[1]] = { frames: fr.map((x) => x[1]), ms: fr.map((x) => Math.max(10, Math.min(5000, +(x[2] ?? 120)))) }
    }
    else if ((m = /^color\s+(\S)\s+(\d+)$/.exec(line))) doc.colors[m[1]] = +m[2]
    else if ((m = /^pic\s+(\S+)\s+(\d+)\s+(\d+)/.exec(line))) doc.pics[m[1]] = cur = []
  }
  return doc
}

// art/allies/<職>.pic を確かめて、DIR_ART の 1 職分にする（候補 ~ を除く絵を全部。空の絵は飛ばす）。colors は、使っている文字の色すべて
function artOf(job, file) {
  const doc = readPic(file)
  if (doc.palette !== 'gunzo' || doc.rgb) throw new Error(`${file} が gunzo の色の表を使っていない（palette gunzo の行が要る。rgb の行は使わない）`)
  const art = { colors: {}, anims: doc.anims }
  for (const d of Object.keys(doc.pics).filter((n) => !n.includes('~'))) {
    const rows = doc.pics[d]
    if (rows.length !== H || rows.some((r) => r.length !== W)) throw new Error(`${file} の ${d} が ${W}×${H} でない`)
    if (rows.every((r) => /^\.*$/.test(r))) continue // 空（まだ描いていない）
    for (const ch of new Set(rows.join(''))) {    // 色は、ファイルの color の行がすべて（人ごとに変わる色は無い）
      if (ch === '.') continue
      if (!(ch in doc.colors)) throw new Error(`${file} の ${d} に、色の決まっていない文字 ${ch}`)
      if (!NAME_OF[doc.colors[ch]]) throw new Error(`${file} の文字 ${ch} の色 ${doc.colors[ch]} 番が、gunzo の色の表に無い`)
      art.colors[ch] = NAME_OF[doc.colors[ch]]
    }
    art[d] = rows
  }
  return art
}

function buildPalette() {
  const rows = PAL.map((c) => `  ['${c.name}', '${c.hex}'],`).join('\n')
  const text = `// 色の表（tools/pixel.mjs build が art/gunzo.gpl から作る。手で直さない。色を足す・変えるのは art/gunzo.gpl で）
// パレット番号で描き、RGB は直接使わない。コードでは P.名前 で指す
const COLORS = [
${rows}
]

export const PAL_HEX = COLORS.map((c) => c[1])
export const P = Object.fromEntries(COLORS.map((c, i) => [c[0], i]))
`
  if (writeIfChanged(join(ROOT, 'src/palette.js'), text)) console.log(`src/palette.js: ${PAL.length} 色`)
}

function build() {
  buildPalette()
  const all = {}
  if (existsSync(ALLIES)) {
    for (const f of readdirSync(ALLIES).filter((f) => f.endsWith('.pic')).sort()) {
      const job = f.slice(0, -4)
      if (!SPRITES[job]) { console.log(`art/allies/${f}: 職の名前でないので飛ばす（${Object.keys(SPRITES).join(' ')}）`); continue }
      all[job] = artOf(job, join(ALLIES, f))
    }
  }
  const body = Object.entries(all).map(([job, a]) => {
    const parts = [`    colors: ${JSON.stringify(a.colors)},`]
    if (Object.keys(a.anims).length) parts.push(`    anims: {\n${Object.entries(a.anims).map(([n, x]) => `      ${n}: { frames: ${JSON.stringify(x.frames)}, ms: ${JSON.stringify(x.ms)} },`).join('\n')}\n    },`)
    for (const [d, rows] of Object.entries(a)) if (d !== 'colors' && d !== 'anims') parts.push(`    ${d}: [\n${rows.map((r) => `      '${r}',`).join('\n')}\n    ],`)
    return `  ${job}: {\n${parts.join('\n')}\n  },`
  }).join('\n')
  const text = `// Pixel で描いた、向きごとの一枚絵と動きのコマ（tools/pixel.mjs が art/allies/*.pic から作る。手で直さない）\n` +
    `// anims は動き（ファイルの anim の行）。ms は 1 コマの長さ（ミリ秒）\nexport const DIR_ART = {${body ? `\n${body}\n` : ''}}\n`
  if (writeIfChanged(join(ROOT, 'src/art.js'), text))
    for (const [job, a] of Object.entries(all)) console.log(`src/art.js: ${job}（${Object.keys(a).filter((d) => d !== 'colors' && d !== 'anims').join('・')}${Object.keys(a.anims).length ? `、動き ${Object.keys(a.anims).join('・')}` : '' || '絵なし'}${Object.keys(a.colors).length ? `、色 ${Object.keys(a.colors).length}` : ''}）`)
}

function create(job) {
  if (!SPRITES[job]) throw new Error(`職が無い: ${job}（${Object.keys(SPRITES).join(' ')}）`)
  const file = join(ALLIES, `${job}.pic`)
  if (existsSync(file)) throw new Error(`${file} はもうある`)
  const draft = { down: SPRITES[job].a }       // 今の絵を下書きに
  const empty = Array(H).fill('.'.repeat(W))
  const roles = roleNames(job)
  const lines = [
    `# gunzo の味方「${job}」の絵（正面と歩き）。決まりは art/GROUP.md と art/allies/GROUP.md`,
    `title ${job}`,
    'palette gunzo',
    ...DIRS.map((d) => `anim walk_${d} ${d}_walk1:120 ${d}:120 ${d}_walk2:120 ${d}:120`),
    ...Object.entries(roles).map(([c, n]) => `color ${c} ${P[n]}`),
    '',
  ]
  for (const d of DIRS) lines.push(`pic ${d} ${W} ${H} "${LABEL[d]}"`, ...(draft[d] ?? empty).map((r) => '  ' + r), '')
  for (const k of [1, 2]) lines.push(`pic down_walk${k} ${W} ${H} "歩き ${k}"`, ...draft.down.map((r) => '  ' + r), '')
  mkdirSync(ALLIES, { recursive: true })
  writeFileSync(file, lines.join('\n'))
  console.log(`${file} を作った（down と歩きのコマに、今の絵を下書きとして入れた）`)
}

const [cmd, job] = process.argv.slice(2)
try {
  if (cmd === 'build') build()
  else if (cmd === 'new' && job) { create(job); build() }
  else { console.error('使い方: node tools/pixel.mjs build / new <職>'); process.exit(2) }
} catch (e) {
  console.error(e.message)
  process.exit(1)
}
