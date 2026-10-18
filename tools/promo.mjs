// 紹介動画を作る（画面なし。シミュレーションと描画を直接動かし、ffmpeg で字幕と曲を付けて MP4 にする）
//   node tools/promo.mjs [出力（既定 build/gunzo-promo.mp4）]
// 前半: みどころ（仲間 10 人ほどのふつうの冒険、大技、ナイトメア、最後に 100 人のボス戦を少し）。曲はボス戦
// 後半: 職の紹介（10 職。味方はその人だけ、字幕付き）と、ゲームの紹介（檻の仲間を助ける、仲間の一覧、締め）。曲はフィールド
// 動画では、当たったときに一瞬止まる演出（ヒットストップ）と画面の揺れを切る（1 秒 30 コマだと、つっかえて見える）
// 操作キャラは簡単な自動操作。字幕は Noto Sans CJK JP（ffmpeg の drawtext）
import { spawn, execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { dirname, resolve, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'
import { createSim, JOBS, JOB_LIST } from '../src/sim.js'
import { JOB_COUNTS } from '../src/data.js'
import { createRenderer, W, H } from '../src/render.js'
import { ALL_HEX } from '../src/shade.js'
import { TILE, MW, MH, B, createFlow } from '../src/world.js'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = resolve(process.argv[2] || join(ROOT, 'build/gunzo-promo.mp4'))
const FPS = 30, STEP = 1 / 60, SCALE = 2
const TMP = join(tmpdir(), `gunzo-promo-${process.pid}`)
mkdirSync(dirname(OUT), { recursive: true })
mkdirSync(TMP, { recursive: true })

const RGB = ALL_HEX.map((h) => [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)])
const raw = join(TMP, 'video.mp4')
const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', `${W}x${H}`, '-r', String(FPS), '-i', '-',
  '-vf', `scale=${W * SCALE}:${H * SCALE}:flags=neighbor`, '-c:v', 'libx264', '-tune', 'animation', '-pix_fmt', 'yuv420p', '-crf', '18', raw], { stdio: ['pipe', 'inherit', 'inherit'] })
const fb = new Uint8Array(W * H), R = createRenderer(fb)
const out = Buffer.alloc(W * H * 3)
let frames = 0
const captions = []                                 // { from, to, text, big }
const now = () => frames / FPS
const caption = (text, sec, big = false) => captions.push({ from: now(), to: now() + sec, text, big })
const write = () => new Promise((ok) => {
  for (let i = 0; i < fb.length; i++) { const c = RGB[fb[i]] ?? [0, 0, 0]; out[i * 3] = c[0]; out[i * 3 + 1] = c[1]; out[i * 3 + 2] = c[2] }
  frames++
  if (ff.stdin.write(out)) ok(); else ff.stdin.once('drain', ok)
})
// sec 秒録る。each(dt) は 1/60 秒ごとの操作。ui は描くときの画面（HUD を出さないときは layer 'world'）
async function record(S, sec, each, { ui = { screen: 'play' }, layer = 'world', before = null } = {}) {
  for (let f = 0; f < sec * FPS; f++) {
    for (let s = 0; s < 2; s++) { each?.(STEP); S.hitstop = 0; S.shakeT = 0; S.step(STEP) }
    before?.()
    R.draw(S, ui, S.t, layer)
    await write()
  }
}
// 味方を減らす: 操作キャラと、近い n 人だけ残す（人が多すぎると何が起きているか分からない）
const thin = (S, n) => { const L = S.leader; S.allies = [L, ...S.allies.filter((a) => a !== L).sort((a, b) => Math.hypot(a.x - L.x, a.y - L.y) - Math.hypot(b.x - L.x, b.y - L.y)).slice(0, n)] }
// 敵を減らす: 操作キャラから近い max 体だけ残す（遠い分は黙って消す）
const trimEnemies = (S, max) => { const L = S.leader; const live = S.enemies.filter((e) => e.hp > 0 && e !== S.boss).sort((a, b) => Math.hypot(a.x - L.x, a.y - L.y) - Math.hypot(b.x - L.x, b.y - L.y)); for (const e of live.slice(max)) e.hp = 0 }
const party = (lv) => JOB_LIST.flatMap((j) => Array.from({ length: JOB_COUNTS[j] + (j === 'sword' ? 1 : 0) }, (_, i) => ({ job: j, lvl: lv, xp: 0, name: `${j}${i}` })))

// ---- 職ごとの簡単な自動操作（tools/video.mjs と同じ考え） ----
const unit = (x, y) => { const m = Math.hypot(x, y) || 1; return [x / m, y / m] }
const RANGE = { sword: 14, shield: 16, thief: 12, hammer: 16, bow: 90, boom: 70, ice: 85, volt: 75, bomb: 85, heal: 55 }
function driver(S) {
  let holdT = 0, timer = 0.4, phase = 0, t = 0
  const inp = S.input
  const tap = () => { inp.pressed = true; inp.hold = true; holdT = STEP }
  const hold = (sec) => { if (holdT <= 0) { inp.pressed = true; inp.hold = true; holdT = sec } }
  return (dt) => {
    const u = S.leader
    if (!u) return
    t += dt
    timer -= dt
    let e = null, d = Infinity
    for (const x of S.actE) { if (x.hp <= 0) continue; const k = Math.hypot(x.x - u.x, x.y - u.y); if (k < d) { d = k; e = x } }
    const crowd = (r) => S.actE.filter((x) => x.hp > 0 && Math.hypot(x.x - u.x, x.y - u.y) < r).length
    let mx = 0, my = 0
    if (e) {
      let tx = e.x, want = RANGE[u.job] ?? 30
      if (u.job === 'thief') { tx = e.x - (e.face || 1) * 12; want = 2 }
      const [ux, uy] = unit(tx - u.x, e.y - u.y), dd = Math.hypot(tx - u.x, e.y - u.y)
      if (dd > want + 8) { mx = ux; my = uy } else if (dd < want - 8) { mx = -ux; my = -uy } else { const s = Math.sin(t * 1.3) > 0 ? 1 : -1; mx = -uy * 0.5 * s + ux * 0.2; my = ux * 0.5 * s + uy * 0.2 }
    } else { mx = Math.cos(t * 0.4) * 0.6; my = Math.sin(t * 0.3) * 0.6 }
    inp.mx = mx; inp.my = my
    inp.aim = e ? unit(e.x - u.x, e.y - u.y) : null
    if (u.job === 'bomb' && e) inp.target = { x: e.x, y: e.y }
    if (holdT > 0) { holdT -= dt; if (holdT <= 0) inp.hold = false; return }
    if (!e) return
    switch (u.job) {
      case 'sword': if (d < 26) tap(); break
      case 'thief': if (d < 22) tap(); break
      case 'hammer': if (crowd(55) >= 3 && timer <= 0) { hold(1.1); timer = 2.2 } else if (d < 28) tap(); break
      case 'shield': if (d < 45) hold(1.0); break
      case 'bow': if (timer <= 0 && phase % 3 === 2) { hold(1.5); timer = 1.7; phase++ } else if (timer <= 0) { tap(); timer = 0.35; phase++ } break
      case 'boom': if (!u.boomOut && timer <= 0) { if (phase++ % 3 === 2) hold(0.8); else tap(); timer = 0.3 } break
      case 'ice': if (timer <= 0) { if (phase++ % 2 === 0) hold(0.95); else tap(); timer = 0.45 } break
      case 'bomb': if (timer <= 0) { hold(0.3); timer = 0.7 } break
      case 'volt': if (timer <= 0) { if (phase++ % 3 === 2) hold(1.0); else tap(); timer = 0.45 } break
      case 'heal': if (timer <= 0) { if (phase++ % 4 === 3) hold(1.8); else tap(); timer = 0.55 } break
    }
  }
}
const immortal = (S) => () => { if (S.leader) S.leader.hp = S.leader.maxhp }

// ==== 前半: みどころ ====
// 1. タイトル
{
  const S = createSim({ manual: true })
  caption('99 人を助けて、100 人で魔王を倒せ', 3.5, true)
  await record(S, 3.5, null, { ui: { screen: 'title', slots: [] }, layer: 'all' })
}
// 2. ふつうの冒険: 仲間 10 人ほどで、地域の見張りの陣地に攻め込む（2 か所）
const MIX = ['shield', 'bow', 'heal', 'hammer', 'volt', 'bomb', 'ice', 'thief', 'boom', 'bow']
for (const [tier, lv, text] of [[2, 7, '仲間と一緒に、各地の敵の陣地へ'], [3, 11, '助けた仲間は、それぞれの技で自分から戦う']]) {
  const S = createSim({ manual: true })
  const camp = S.camps.filter((c) => c.tier === tier).map((c) => ({ c, n: S.enemies.filter((e) => e.hp > 0 && e.camp === S.camps.indexOf(c)).length })).sort((x, y) => y.n - x.n)[0].c
  const L = S.leader
  L.x = camp.x - 70; L.y = camp.y + 40
  L.lvl = lv; L.maxhp = Math.round(JOBS[L.job].hp * (1 + 0.1 * (lv - 1))); L.hp = L.maxhp
  MIX.forEach((j, i) => { const a = S.newAlly(j, L.x - 20 + (i % 5) * 10, L.y + 10 + Math.floor(i / 5) * 12, lv); a.hp = a.maxhp })
  const drive = driver(S), keep = immortal(S)
  for (let i = 0; i < 60 * 1.5; i++) { drive(STEP); keep(); S.step(STEP) }
  caption(text, 6)
  await record(S, 6, (dt) => { keep(); drive(dt) })
}
// 3. 大技を手早く（仲間は 8 人ほど、敵も近くの 12 体まで）
for (const [job, text] of [['hammer', 'ハンマーで地面を叩いて、まとめて吹き飛ばす'], ['volt', '稲妻が敵から敵へ'], ['ice', '凍らせて、砕く'], ['bow', '引き絞った炎の矢']]) {
  const S = createSim({ manual: true, test: 'field', hero: job })
  thin(S, 8)
  const drive = driver(S)
  const each = (dt) => { trimEnemies(S, 12); drive(dt) }
  for (let i = 0; i < 60 * 3; i++) { each(STEP); S.step(STEP) }
  caption(text, 3.5)
  await record(S, 3.5, each)
}
// 4. ナイトメア: 湧き続ける大群（仲間は 20 人、少しだけ）
{
  const S = createSim({ manual: true, nightmare: { party: party(30) } })
  S.setJob(S.leader, 'bomb')
  thin(S, 20)
  const drive = driver(S), keep = immortal(S)
  const KINDS = ['slime', 'bat', 'goblin', 'wolf', 'scorpion', 'snowwolf', 'knight', 'firebat', 'mummy', 'icegel']
  const swarm = () => {                            // 画面のまわりに敵を補い、いつも 120 体ほどの大群にする（見せるため）
    const L = S.leader, n = S.enemies.filter((e) => e.hp > 0).length
    for (let i = n; i < 120; i++) {
      const a = Math.random() * Math.PI * 2, r = 130 + Math.random() * 60
      const e = S.spawnEnemy(KINDS[(Math.random() * KINDS.length) | 0], L.x + Math.cos(a) * r, L.y + Math.sin(a) * r * 0.8)
      e.aggro = true
    }
  }
  for (let i = 0; i < 60 * 15; i++) { drive(STEP); keep(); swarm(); S.step(STEP) }
  caption('クリア後はナイトメア。終わらない大群に、何秒耐えられるか', 5)
  await record(S, 5, (dt) => { keep(); swarm(); drive(dt) })
}
// 5. 最後は 100 人で魔王に挑む（少しだけ）。操作キャラはあまり動かさず、予兆が見えたら隙を作る（OPENING!）
{
  const S = createSim({ manual: true, test: 'boss', testLv: 22, hero: 'sword' })
  const keep = immortal(S)
  let lastOpen = -9, tapT = 0
  const each = (dt) => {
    keep()
    const b = S.boss, L = S.leader
    S.input.mx = 0; S.input.my = 0
    if (!b || b.hp <= 0 || !L) return
    const d = Math.hypot(b.x - L.x, b.y + 40 - L.y)
    if (d > 26) { const [ux, uy] = unit(b.x - L.x, b.y + 40 - L.y); S.input.mx = ux; S.input.my = uy }   // ボスの前まで歩いて、そこで止まる
    else if ((tapT -= dt) <= 0) { S.input.pressed = true; S.input.hold = true; tapT = 0.5 } else S.input.hold = false
    if (b.pstate === 'wind' && S.t - lastOpen > 4 && b.aggro) { lastOpen = S.t; S.bossOpening(b, L) }
  }
  for (let i = 0; i < 60 * 6; i++) { each(STEP); S.step(STEP) }   // ボスの前まで（録らない）
  caption('最後は 100 人で魔王に挑む。技を止めて、一斉攻撃！', 6)
  await record(S, 6, each, { layer: 'all' })
}
const firstHalf = now()

// ==== 後半: 職の紹介とゲームの紹介 ====
const DESC = {
  sword: '剣士　振って斬る。技の予兆を斬れば止まり、弾は弾き返す',
  shield: '盾　構えて受け止める。ジャストガードで跳ね返し、敵を引きつける',
  bow: '弓　引き絞るほど強い矢。最大まで引くと、硬い敵も貫く炎の矢',
  boom: 'ブーメラン　弧を描いて戻ってくる。行きと帰りで群れをまとめて',
  ice: '氷術師　つららで刺し、溜めた冷気で凍らせる。凍った敵は砕ける',
  bomb: '爆弾兵　狙った所へ投げて爆発。硬い敵にもよく効く',
  volt: '雷術師　稲妻が敵から敵へ連鎖する。群れと空の敵に',
  heal: '僧侶　癒やしの光と祈りの円で、仲間を回復する',
  thief: '盗賊　素早いナイフ。背後から刺せば大ダメージ',
  hammer: 'ハンマー　遅いが重い一撃。溜めて地面を叩くと周りを吹き飛ばす',
}
{
  // ふつうの世界で、味方はその人だけ。敵は最初の陣地の敵を消し、まわりにいつも 4 体ほど（倒されたら画面の外から 1 体ずつ補う。
  // 湧いた敵をその場で消すと、1 コマだけ映ってちらつくので、消さずに補うだけにする）
  const S = createSim({ manual: true })
  const L = S.leader
  L.lvl = 10; L.maxhp = Math.round(JOBS[L.job].hp * 1.9); L.hp = L.maxhp
  // 開始地点は世界の端で、カメラが止まって操作キャラが画面の端に寄るので、まわりが開けた内側の草原へ
  let best = null, open = -1
  for (let ty = 10; ty < MH - 10; ty += 2) for (let tx = 12; tx < MW - 12; tx += 2) {
    if (S.world.biome[ty * MW + tx] !== B.GRASS) continue
    if (S.cages.some((c) => Math.hypot(c.tx - tx, c.ty - ty) < 12)) continue   // 檻が映らない所
    const x = tx * TILE + 8, y = ty * TILE + 8
    let n = 0
    for (let dy = -4; dy <= 4; dy++) for (let dx = -6; dx <= 6; dx++) if (!S.boxBlocked(x + dx * TILE, y + dy * TILE, 6)) n++
    if (n > open) { open = n; best = [x, y] }
  }
  L.x = best[0]; L.y = best[1]
  for (const e of S.enemies) if (e !== S.boss) e.hp = 0
  S.allies = [L]
  const KINDS = ['slime', 'goblin', 'boar', 'wolf', 'bat', 'shaman', 'scorpion', 'mummy']
  const keep = immortal(S)
  const feed = () => {
    const n = S.enemies.filter((e) => e.hp > 0 && e !== S.boss && Math.hypot(e.x - L.x, e.y - L.y) < 260).length
    for (let i = n; i < 4; i++) {
      for (let tries = 0; tries < 20; tries++) {
        const a = Math.random() * Math.PI * 2, x = L.x + Math.cos(a) * 190, y = L.y + Math.sin(a) * 150   // 画面のすぐ外
        if (S.boxBlocked(x, y, 8)) continue
        const e = S.spawnEnemy(KINDS[(Math.random() * KINDS.length) | 0], x, y)
        e.aggro = true
        break
      }
    }
  }
  for (let i = 0; i < 60 * 2; i++) { feed(); keep(); S.step(STEP) }
  caption('10 の職。どの仲間も、操作すると自分の技が使える', 3.5, true)
  await record(S, 3.5, () => { feed(); keep() })
  for (const job of JOB_LIST) {
    S.setJob(L, job)
    const drv = driver(S), drive = (dt) => { feed(); keep(); drv(dt) }
    const [name, desc] = DESC[job].split('　')
    caption(desc, 4.5)
    captions.push({ from: now(), to: now() + 4.5, text: name, title: true })
    await record(S, 4.5, drive)                    // 職の紹介は HUD を出さない（字幕と重ならないように）
  }
}
// 檻を開けて仲間を助ける（本番の始まり）
{
  const S = createSim({ manual: true, seed: 7 })
  const nav = createFlow(S.world)
  const L0 = S.leader
  const cage = [...S.cages].sort((a, b) => Math.hypot(a.x - L0.x, a.y - L0.y) - Math.hypot(b.x - L0.x, b.y - L0.y))[0]
  nav.compute(cage.tx, cage.ty)
  const drive = driver(S), keep = immortal(S)
  const each = (dt) => {
    keep()
    const L = S.leader, d = Math.hypot(cage.x - L.x, cage.y - L.y)
    if (cage.opened) return drive(dt)
    if (d < 24) { S.input.mx = 0; S.input.my = 0; if (Math.random() < 0.2) { S.input.pressed = true; S.input.hold = true } else S.input.hold = false; return }
    const k = Math.floor(L.y / TILE) * MW + Math.floor(L.x / TILE), fx = nav.dirX[k], fy = nav.dirY[k]
    const tx = (Math.floor(L.x / TILE) + fx) * TILE + 8, ty = (Math.floor(L.y / TILE) + fy) * TILE + 8
    const [ux, uy] = fx || fy ? unit(tx - L.x, ty - L.y) : unit(cage.x - L.x, cage.y - L.y)
    S.input.mx = ux; S.input.my = uy
  }
  for (let i = 0; i < 60 * 60 && Math.hypot(cage.x - S.leader.x, cage.y - S.leader.y) > 120; i++) { each(STEP); S.step(STEP) }   // 檻の近くまで（録らない）
  caption('とらわれの仲間を見つけ、見張りを倒して檻を壊す', 6)
  await record(S, 6, each, { layer: 'all' })
}
// 仲間の一覧（ポーズ）
{
  const S = createSim({ manual: true, test: 'boss', testLv: 13, hero: 'sword' })
  S.allies.forEach((a, i) => { a.lvl = 8 + (i * 7) % 30; a.xp = i % 9 })
  caption('助けた仲間は一覧で。育てて、誰でも操作できる', 4)
  await record(S, 4, null, { ui: { screen: 'play', paused: true, page: 1, sound: true, canSave: true, saveNote: 'SAVED 1:23 AGO' }, layer: 'all' })
}
// 締め
{
  const S = createSim({ manual: true })
  caption('GUNZO', 4, true)
  await record(S, 4, null, { ui: { screen: 'title', slots: [] }, layer: 'all' })
}
const total = now()
ff.stdin.end()
await new Promise((ok) => ff.on('close', ok))

// ---- 字幕と曲を付ける ----
const font = "font='Noto Sans CJK JP'"
// 文字の大きさ: 画面の幅（両端に余白）に収まるように。全角は 1 字ぶん、半角は 0.55 字ぶんで数える
const fit = (text, base, width = W * SCALE - 60) => {
  const len = [...text].reduce((n, ch) => n + (ch.charCodeAt(0) < 0x100 ? 0.55 : 1), 0)
  return Math.max(12, Math.min(base, Math.floor(width / len)))
}
const draws = captions.map((c, i) => {
  const f = join(TMP, `c${i}.txt`)
  writeFileSync(f, c.text)
  const fade = `alpha='if(lt(t,${c.from + 0.25}),(t-${c.from})/0.25,if(gt(t,${c.to - 0.25}),(${c.to}-t)/0.25,1))'`
  const when = `enable='between(t,${c.from},${c.to})'`
  if (c.big) return `drawtext=${font}:textfile=${f}:fontsize=${fit(c.text, 40)}:fontcolor=white:borderw=3:bordercolor=black:x=(w-text_w)/2:y=h*0.62:${when}:${fade}`
  if (c.title) return `drawtext=${font}:textfile=${f}:fontsize=${fit(c.text, 34)}:fontcolor=0xffe066:borderw=3:bordercolor=black:x=(w-text_w)/2:y=h-th-86:${when}:${fade}`   // 職の名前（説明の上）
  return `drawtext=${font}:textfile=${f}:fontsize=${fit(c.text, 24)}:fontcolor=white:box=1:boxcolor=black@0.6:boxborderw=10:x=(w-text_w)/2:y=h-th-26:${when}:${fade}`
}).join(',')
const A = join(ROOT, 'public/audio')
// 曲: 前半はボス戦、後半はフィールド（どちらも繰り返して長さに合わせ、つなぎ目と終わりはフェード）
const audio = `[1:a]aloop=loop=-1:size=2e9,atrim=0:${firstHalf},afade=t=in:d=0.5,afade=t=out:st=${firstHalf - 1}:d=1[a1];` +
  `[2:a]aloop=loop=-1:size=2e9,atrim=0:${total - firstHalf},afade=t=in:d=1,afade=t=out:st=${total - firstHalf - 2}:d=2[a2];[a1][a2]concat=n=2:v=0:a=1,volume=1.4[a]`
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', raw, '-i', join(A, 'boss.ogg'), '-i', join(A, 'field.ogg'),
  '-filter_complex', `[0:v]${draws}[v];${audio}`, '-map', '[v]', '-map', '[a]', '-c:v', 'libx264', '-crf', '20', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '160k', '-shortest', OUT])
rmSync(TMP, { recursive: true, force: true })
console.log(`${OUT}: ${total.toFixed(1)} 秒（前半 ${firstHalf.toFixed(1)} 秒）`)
process.exit(0)
