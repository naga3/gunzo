import { PAL_HEX } from './palette.js'
import { createSim, JOB_LIST, JOBS } from './sim.js'
import { SHOOT } from './data.js'
import { createRenderer, W, H, PREV_BTN, NEXT_BTN, PAUSE_BTN, SWING_BTN, NEW_BTN, CONT_BTN, MENU_BTNS } from './render.js'
import { audio } from './audio.js'

const PAL32 = new Uint32Array(256)               // 使っていない番号（255 など）は透明
PAL_HEX.forEach((h, i) => {
  const n = parseInt(h, 16)
  PAL32[i] = 0xff000000 | ((n & 0xff) << 16) | (n & 0xff00) | (n >> 16)
})

// 2 枚重ね: 下が世界（地面・人・演出。1 ドット大きく描き、カメラの半端な分だけずらしてスクロールをなめらかに）、上が HUD（ずらさない）
const view = document.getElementById('view')
const layer = (id, w, h) => {
  const el = document.getElementById(id)
  el.width = w
  el.height = h
  const ctx = el.getContext('2d')
  const img = ctx.createImageData(w, h)
  const fb = new Uint8Array(w * h)
  return { el, ctx, img, out32: new Uint32Array(img.data.buffer), fb, renderer: createRenderer(fb, w, h) }
}
const world = layer('world', W + 1, H + 1)
const hud = layer('c', W, H)
const canvas = hud.el
let scale = 1
function resize() {
  scale = Math.min(window.innerWidth / W, window.innerHeight / H)
  view.style.width = `${W * scale}px`
  view.style.height = `${H * scale}px`
  hud.el.style.width = `${W * scale}px`
  hud.el.style.height = `${H * scale}px`
  world.el.style.width = `${(W + 1) * scale}px`
  world.el.style.height = `${(H + 1) * scale}px`
}
function present(L) {
  for (let i = 0; i < L.fb.length; i++) L.out32[i] = PAL32[L.fb[i]]
  L.ctx.putImageData(L.img, 0, 0)
}
window.addEventListener('resize', resize)
resize()

// 今は手触りを作っている途中なので、ふだんは試し場で開く（セーブを使わず、開始地点のまわりに敵を並べる）
// ?game を付けて開くと、本来のゲーム
const TEST = !new URLSearchParams(location.search).has('game')
const TEST_HERO = 'bow'                            // 試し場の主人公の職（いま手触りを作っている職）
const simOpts = (o = {}) => ({ manual: true, test: TEST, ...(TEST ? { hero: TEST_HERO } : {}), ...o })

// --- セーブ ---
const SAVE_KEY = 'gunzo-save-v1'
const SOUND_KEY = 'gunzo-sound'
const readSave = () => {
  try { const raw = localStorage.getItem(SAVE_KEY); return raw ? JSON.parse(raw) : null } catch { return null }
}
const fmtTime = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`
const ui = { screen: 'title', paused: false, stick: null, hasSave: false, saveInfo: '', sound: localStorage.getItem(SOUND_KEY) !== '0', hot: null }
function refreshSaveInfo() {
  const d = TEST ? null : readSave() // 試し場は、ふだんのセーブに触らない
  ui.hasSave = !!d
  ui.saveInfo = d ? `RESCUED ${d.rescued}/99  ALLIES ${d.allies.length}  LOST ${d.lost}  TIME ${fmtTime(d.t)}` : ''
}
refreshSaveInfo()
audio.setEnabled(ui.sound)

let S = createSim(simOpts())
let lastSaveT = 0
function save() {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(S.serialize())) } catch { /* 容量がなければ諦める */ }
  lastSaveT = S.t
  refreshSaveInfo()
}
function newGame() {
  if (!TEST) try { localStorage.removeItem(SAVE_KEY) } catch { /* ignore */ }
  S = createSim(simOpts())
  S.banner = 'FREE 99 FRIENDS'
  S.bannerT = 5
  lastSaveT = 0
  ui.screen = 'play'
  ui.paused = false
  refreshSaveInfo()
  audio.music('field')
}
function continueGame() {
  const d = readSave()
  if (!d) return newGame()
  S = createSim(simOpts({ seed: d.seed }))
  S.restore(d)
  lastSaveT = S.t
  ui.screen = 'play'
  ui.paused = false
  audio.music('field')
}
function toTitle() {
  ui.screen = 'title'
  ui.paused = false
  S = createSim(simOpts())
  refreshSaveInfo()
  audio.music(null)
}

// --- 入力 ---
// ドラッグ：始点からの向きで動く（遠くへ引いたら始点が追いかける）。短いタップ：味方に切り替え
// 自分で振る職を操作しているときは、右下の振るボタン（ちょん＝自動で狙う、ずらす＝狙う、離すと振る・射る）。PC もマウスは指と同じ。Space か Z は振るボタンを押すのと同じ（狙いは自動）
const STICK_MAX = 15
const DEAD = 3
const drags = new Map()
const aimsByDrag = () => S.isManual(S.leader) && JOBS[S.leader.job].kind === 'arrow'   // 狙えるのは弓だけ（剣は向いている方へ振る）
let zHeld = false                                    // Z（Space）を押している（振るボタンを押しているのと同じ）
let zTimer = 0
let zDownT = 0
let mouseAt = null                                   // PC のマウスの場所（画面のドット。押していなくても）
canvas.addEventListener('pointermove', (e) => { if (e.pointerType === 'mouse') mouseAt = toFb(e) })
canvas.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') mouseAt = null })
// 弓で Z を長押し（引き絞り）しているあいだは、マウスのドラッグが狙いになる。ちょん押しではドラッグ（移動）に触らない
// mv: 狙いに替える前の、移動の向き（ドラッグの始点からのずれ）。移動に戻すとき、同じ向きに歩き続けるように
const toAim = (d) => ({ kind: 'btn', fire: false, aim: true, ax: d.x, ay: d.y, x: d.x, y: d.y, mv: d.kind === 'drag' ? [d.x - d.ax, d.y - d.ay] : [0, 0] })
const toMove = (d) => ({ kind: 'drag', ax: d.x - d.mv[0], ay: d.y - d.mv[1], sx: d.x, sy: d.y, x: d.x, y: d.y, t: 0, moved: 99 })   // Z を離したあとも、押したままなら歩き続ける
const keys = new Set()

function toFb(e) {
  const r = canvas.getBoundingClientRect()
  return { x: ((e.clientX - r.left) * W) / r.width, y: ((e.clientY - r.top) * H) / r.height, scale: r.width / W }
}
const inRect = (p, b) => p.x >= b.x && p.x < b.x + b.w && p.y >= b.y && p.y < b.y + b.h

canvas.addEventListener('pointerdown', (e) => {
  e.preventDefault()
  audio.unlock()
  try { canvas.setPointerCapture(e.pointerId) } catch { /* 作った操作（試し）では取れない */ }
  const p = toFb(e)
  if (ui.screen === 'title') {
    if (inRect(p, NEW_BTN)) newGame()
    else if (ui.hasSave && inRect(p, CONT_BTN)) continueGame()
    return
  }
  if (ui.paused) {
    for (const b of MENU_BTNS) {
      if (!inRect(p, b)) continue
      if (b.id === 'resume') ui.paused = false
      else if (b.id === 'sound') { ui.sound = !ui.sound; localStorage.setItem(SOUND_KEY, ui.sound ? '1' : '0'); audio.setEnabled(ui.sound) }
      else if (b.id === 'title') toTitle()
    }
    return
  }
  if (S.state === 'over') { if (ui.hasSave) continueGame(); else newGame(); return }
  if (S.state === 'win') { if (S.winT > 2.5) { if (!TEST) try { localStorage.removeItem(SAVE_KEY) } catch { /* ignore */ } toTitle() } return }
  if (inRect(p, PAUSE_BTN)) { ui.paused = true; drags.clear(); return }
  if (inRect(p, PREV_BTN)) { S.cycle(-1); drags.set(e.pointerId, { kind: 'btn' }); return }
  if (inRect(p, NEXT_BTN)) { S.cycle(1); drags.set(e.pointerId, { kind: 'btn' }); return }
  // 振るボタン（ブロスタ式）: ちょんと押して離す → 近くの敵へ自動で。ボタンから指をずらす → その向きに狙う。離すと振る・射る（弓は押している間が引き絞り）
  if (S.isManual(S.leader) && Math.hypot(p.x - SWING_BTN.x, p.y - SWING_BTN.y) < SWING_BTN.r + 4) {
    S.input.pressed = true
    S.input.hold = true
    S.input.aim = null
    drags.set(e.pointerId, { kind: 'btn', hold: true, fire: true, ax: p.x, ay: p.y })
    return
  }
  // Z（Space）を押している間のドラッグは、振るボタンからずらすのと同じ: 移動ではなく狙い（始めた所からの向き）。Z を離すと撃つ
  if (zHeld && aimsByDrag()) {
    drags.set(e.pointerId, toAim(p))
    return
  }
  drags.set(e.pointerId, { kind: 'drag', ax: p.x, ay: p.y, sx: p.x, sy: p.y, x: p.x, y: p.y, t: performance.now(), moved: 0 })
})
const AIM_DEAD = 5                                   // ボタンから、これ以上ずらしたら狙う（それまでは自動）
canvas.addEventListener('pointermove', (e) => {
  const d = drags.get(e.pointerId)
  if (d?.kind === 'btn' && (d.fire || d.aim)) {
    const p = toFb(e), dx = p.x - d.ax, dy = p.y - d.ay, m = Math.hypot(dx, dy)
    d.x = p.x
    d.y = p.y
    S.input.aim = m > AIM_DEAD ? [dx / m, dy / m] : null
    return
  }
  if (!d || d.kind !== 'drag') return
  const p = toFb(e)
  d.x = p.x
  d.y = p.y
  d.moved = Math.max(d.moved, Math.hypot(p.x - d.sx, p.y - d.sy))
  const dx = p.x - d.ax, dy = p.y - d.ay
  const dist = Math.hypot(dx, dy)
  if (dist > STICK_MAX) { // 始点を引きずる
    d.ax += (dx / dist) * (dist - STICK_MAX)
    d.ay += (dy / dist) * (dist - STICK_MAX)
  }
})
function endPointer(e) {
  const d = drags.get(e.pointerId)
  drags.delete(e.pointerId)
  if (d?.hold) S.input.hold = false                // 振るボタンを離した（弓は射る）
  if (d?.fire) S.input.swing = true                // 剣は、振るボタンを離した瞬間に振る
  if (!d || d.kind !== 'drag') return
  if (d.moved < 4 && performance.now() - d.t < 350) {
    const p = toFb(e)
    // 小さな画面でも押せるよう、画面上の見た目の大きさで判定の半径を決める
    const radius = Math.max(9, 22 / p.scale)
    if (S.tapAt(p.x + S.camF.x, p.y + S.camF.y, radius)) audio.sfx('switch')
  }
}
canvas.addEventListener('pointerup', endPointer)
canvas.addEventListener('pointercancel', (e) => { if (drags.get(e.pointerId)?.hold) S.input.hold = false; drags.delete(e.pointerId) })
canvas.addEventListener('contextmenu', (e) => e.preventDefault())

window.addEventListener('keydown', (e) => {
  if (e.repeat) return
  audio.unlock()
  const k = e.key.toLowerCase()
  if (ui.screen === 'title') {
    if (k === 'enter' || k === ' ') { if (ui.hasSave) continueGame(); else newGame() }
    else if (k === 'n') newGame()
    return
  }
  if (k === 'escape' || k === 'p') { if (S.state === 'play') ui.paused = !ui.paused; return }
  if (k === 'm') { ui.sound = !ui.sound; localStorage.setItem(SOUND_KEY, ui.sound ? '1' : '0'); audio.setEnabled(ui.sound); return }
  if (S.state === 'over') { if (k === 'r' || k === ' ' || k === 'enter') { if (ui.hasSave) continueGame(); else newGame() } return }
  if (S.state === 'win') { if (S.winT > 2.5 && (k === ' ' || k === 'enter')) toTitle(); return }
  if (ui.paused) return
  if (k === ' ' || k === 'z') {                   // 振るボタンを押すのと同じ（狙いは自動。押しながらドラッグで狙う）
    zHeld = true
    zDownT = performance.now()
    S.input.aim = null
    S.input.pressed = true
    S.input.hold = true
    clearTimeout(zTimer)                           // 長押しになったら、移動中のドラッグも、そこから狙いに
    zTimer = setTimeout(() => { if (zHeld && aimsByDrag()) for (const [id, d] of drags) if (d.kind === 'drag') drags.set(id, toAim(d)) }, SHOOT.tap * 1000)
    e.preventDefault()
    return
  }
  if (k === 'e' || k === 'tab') { S.cycle(1); e.preventDefault() }
  else if (k === 'q' && TEST) {                     // 試し場: 操作キャラを次の職に（手触りを試す用）
    const i = JOB_LIST.indexOf(S.leader.job)
    S.setJob(S.leader, JOB_LIST[(i + 1) % JOB_LIST.length])
  } else if (k === 'q') S.cycle(-1)
  keys.add(k)
})
window.addEventListener('keyup', (e) => {
  const k = e.key.toLowerCase()
  keys.delete(k)
  if (k === ' ' || k === 'z') {
    zHeld = false
    clearTimeout(zTimer)
    for (const [id, d] of drags) if (d.aim) drags.set(id, toMove(d))   // 狙いのドラッグは、移動のドラッグに戻す
    if (S.input.hold) { S.input.hold = false; S.input.swing = true }   // 振るボタンを離すのと同じ（剣は振る、弓は射る）
  }
})
window.addEventListener('blur', () => { keys.clear(); drags.clear(); zHeld = false; S.input.hold = false; if (ui.screen === 'play' && S.state === 'play') ui.paused = true })

function readInput() {
  // PC: 弓で Z を長押し（引き絞り）しているあいだは、マウスのある場所へ狙う
  if (zHeld && mouseAt && aimsByDrag() && performance.now() - zDownT > SHOOT.tap * 1000) {
    const L = S.leader, dx = mouseAt.x + S.camF.x - L.x, dy = mouseAt.y + S.camF.y - (L.y - 4), m = Math.hypot(dx, dy)
    if (m > 4) S.input.aim = [dx / m, dy / m]
  }
  let mx = 0, my = 0
  if (keys.has('arrowleft') || keys.has('a')) mx -= 1
  if (keys.has('arrowright') || keys.has('d')) mx += 1
  if (keys.has('arrowup') || keys.has('w')) my -= 1
  if (keys.has('arrowdown') || keys.has('s')) my += 1
  ui.stick = null
  for (const d of drags.values()) {
    if (d.kind !== 'drag') continue
    const dx = d.x - d.ax, dy = d.y - d.ay
    const dist = Math.hypot(dx, dy)
    if (dist > DEAD) {
      const k = Math.min(1, (dist - DEAD) / (STICK_MAX - DEAD))
      mx += (dx / dist) * k
      my += (dy / dist) * k
    }
    if (d.moved >= 4) ui.stick = { ax: d.ax, ay: d.ay, x: d.x, y: d.y }
    break
  }
  S.input.mx = mx
  S.input.my = my
}

// --- ループ ---
let last = performance.now()
let prev = { rescued: 0, lost: 0, state: 'play', boss: false, bossHp: 0, leaderId: 0, leaderLv: 1 }
function events() {
  if (S.rescued > prev.rescued) audio.sfx('rescue')
  if (S.lost > prev.lost) audio.sfx('lost')
  if (S.state === 'win' && prev.state !== 'win') { audio.sfx('win'); audio.music('ending') }
  if (S.state === 'over' && prev.state !== 'over') { audio.sfx('over'); audio.music(null) }
  const bossOn = S.boss && S.boss.aggro && S.boss.hp > 0
  if (bossOn && !prev.boss) audio.music('boss')
  if (S.leader && S.leader.id === prev.leaderId && S.leader.lvl > prev.leaderLv) audio.sfx('levelup')
  prev = { rescued: S.rescued, lost: S.lost, state: S.state, boss: bossOn, leaderId: S.leader ? S.leader.id : 0, leaderLv: S.leader ? S.leader.lvl : 1 }
}
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000)
  last = now
  if (ui.screen === 'play' && !ui.paused) {
    readInput()
    S.step(dt)
    events()
    if (!TEST && S.state === 'play' && S.t - lastSaveT > 20 && S.canSave()) save()
  } else if (ui.screen === 'title') {
    S.step(dt) // 背景の世界は止めない（敵が動く）
  }
  world.renderer.draw(S, ui, now / 1000, 'world')
  hud.renderer.draw(S, ui, now / 1000, 'hud')
  present(world)
  present(hud)
  const fx = S.camF.x - S.cam.x, fy = S.camF.y - S.cam.y   // カメラの半端な分（0〜1 ドット）
  world.el.style.transform = `translate(${-fx * scale}px, ${-fy * scale}px)`
  requestAnimationFrame(frame)
}
requestAnimationFrame(frame)
window.__G = { get sim() { return S }, ui }
