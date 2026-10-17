// プレイ動画を作る（画面なし。シミュレーションと描画を直接動かし、ffmpeg で MP4 にする）
//   node tools/video.mjs [出力（既定 build/gunzo-play.mp4）] [1 職の秒数（既定 12）]
// 試し場（味方 100 人、敵が湧き続ける）で、操作キャラの職を順に替えながら、それぞれの職の動かし方で戦う（簡単な自動操作）
import { spawn } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createSim, JOBS, JOB_LIST } from '../src/sim.js'
import { createRenderer, W, H } from '../src/render.js'
import { ALL_HEX } from '../src/shade.js'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = resolve(process.argv[2] || resolve(ROOT, 'build/gunzo-play.mp4'))
const SEG = Number(process.argv[3] || 12)
const FPS = 30, STEP = 1 / 60, SCALE = 2
mkdirSync(dirname(OUT), { recursive: true })

const RGB = ALL_HEX.map((h) => [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)])
const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', `${W}x${H}`, '-r', String(FPS), '-i', '-',
  '-vf', `scale=${W * SCALE}:${H * SCALE}:flags=neighbor`, '-c:v', 'libx264', '-tune', 'animation', '-pix_fmt', 'yuv420p', '-crf', '26', OUT], { stdio: ['pipe', 'inherit', 'inherit'] })

const S = createSim({ manual: true, test: true, hero: JOB_LIST[0] })
const fb = new Uint8Array(W * H), R = createRenderer(fb)
const ui = { screen: 'play', stick: null }
const inp = S.input
const L = () => S.leader

// ---- 自動操作 ----
const near = () => {
  let best = null, bd = Infinity
  for (const e of S.actE) { if (e.hp <= 0) continue; const d = Math.hypot(e.x - L().x, e.y - L().y); if (d < bd) { bd = d; best = e } }
  return [best, bd]
}
const unit = (x, y) => { const m = Math.hypot(x, y) || 1; return [x / m, y / m] }
const crowd = (r) => S.actE.filter((e) => e.hp > 0 && Math.hypot(e.x - L().x, e.y - L().y) < r).length
let press = 0, holdT = 0                             // press: 押した瞬間、holdT: 押しておく残りの秒（0 なら離す）
const tap = () => { inp.pressed = true; inp.hold = true; holdT = STEP }
const hold = (sec) => { if (holdT <= 0) { inp.pressed = true; inp.hold = true; holdT = sec } }
const RANGE = { sword: 14, shield: 16, thief: 12, hammer: 16, bow: 90, boom: 70, ice: 85, volt: 75, bomb: 85, heal: 55 }
let tJob = 0, timer = 0, phase = 0
function drive(dt) {
  const u = L(), job = u.job, [e, d] = near()
  timer -= dt
  // 動き: 職ごとの間合いを保つ（近すぎれば下がり、遠ければ寄り、ちょうどなら回り込む）。盗賊は敵の背中へ
  let mx = 0, my = 0
  if (e) {
    let tx = e.x, ty = e.y, want = RANGE[job] ?? 30
    if (job === 'thief') { tx = e.x - (e.face || 1) * 12; want = 2 }
    const dx = tx - u.x, dy = ty - u.y, dd = Math.hypot(dx, dy)
    const [ux, uy] = unit(dx, dy)
    if (dd > want + 8) { mx = ux; my = uy }
    else if (dd < want - 8) { mx = -ux; my = -uy }
    else { const s = Math.sin(tJob * 1.3) > 0 ? 1 : -1; mx = -uy * 0.5 * s + ux * 0.2; my = ux * 0.5 * s + uy * 0.2 }
  } else { mx = Math.cos(tJob * 0.4) * 0.6; my = Math.sin(tJob * 0.3) * 0.6 }
  inp.mx = mx
  inp.my = my
  inp.aim = e ? unit(e.x - u.x, e.y - u.y - 0) : null
  if (job === 'bomb' && e) inp.target = { x: e.x, y: e.y }
  // 攻撃: 職ごとの使い方
  if (holdT > 0) { holdT -= dt; if (holdT <= 0) inp.hold = false; return }
  if (!e) return
  switch (job) {
    case 'sword': if (d < 26) tap(); break
    case 'thief': if (d < 22) tap(); break
    case 'hammer': if (crowd(55) >= 3 && timer <= 0) { hold(1.1); timer = 3 } else if (d < 28) tap(); break
    case 'shield': if (d < 45) hold(1.0); break           // 構えて、1 秒ごとに離して押す
    case 'bow': if (timer <= 0 && phase % 4 === 3) { hold(1.5); timer = 1.8; phase++ } else if (timer <= 0) { tap(); timer = 0.4; phase++ } break
    case 'boom': if (!u.boomOut && timer <= 0) { if (phase++ % 3 === 2) hold(0.8); else tap(); timer = 0.3 } break
    case 'ice': if (timer <= 0) { if (phase++ % 3 === 0) hold(0.95); else tap(); timer = 0.5 } break
    case 'bomb': if (timer <= 0) { hold(0.3); timer = 1.0 } break
    case 'volt': if (timer <= 0) { if (phase++ % 4 === 3) hold(1.0); else tap(); timer = 0.5 } break
    case 'heal': if (timer <= 0) { if (phase++ % 5 === 4) hold(2.0); else tap(); timer = 0.6 } break
  }
}

// ---- 録る ----
const out = Buffer.alloc(W * H * 3)
let frames = 0
const write = () => new Promise((ok) => {
  for (let i = 0; i < fb.length; i++) { const c = RGB[fb[i]] ?? [0, 0, 0]; out[i * 3] = c[0]; out[i * 3 + 1] = c[1]; out[i * 3 + 2] = c[2] }
  if (ff.stdin.write(out)) ok(); else ff.stdin.once('drain', ok)
})
for (const [k, job] of JOB_LIST.entries()) {
  S.setJob(L(), job)
  S.banner = JOBS[job].label
  S.bannerT = 2
  tJob = 0
  timer = 0.5
  phase = 0
  holdT = 0
  inp.hold = false
  for (let f = 0; f < SEG * FPS; f++) {
    for (let s = 0; s < 2; s++) { drive(STEP); S.step(STEP); tJob += STEP }
    R.draw(S, ui, S.t)
    await write()
    frames++
  }
  console.log(`${k + 1}/${JOB_LIST.length} ${job}: 倒した敵 ${S.kills}`)
}
ff.stdin.end()
await new Promise((ok) => ff.on('close', ok))
console.log(`${OUT}: ${frames} コマ（${(frames / FPS).toFixed(0)} 秒）`)
process.exit(0)
