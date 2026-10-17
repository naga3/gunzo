import { PAL_HEX } from './palette.js'
import { createSim } from './sim.js'
import { createRenderer, W, H, PREV_BTN, NEXT_BTN, PAUSE_BTN, NEW_BTN, CONT_BTN, MENU_BTNS } from './render.js'
import { audio } from './audio.js'

const PAL32 = new Uint32Array(PAL_HEX.map((h) => {
  const n = parseInt(h, 16)
  return 0xff000000 | ((n & 0xff) << 16) | (n & 0xff00) | (n >> 16)
}))

const canvas = document.getElementById('c')
canvas.width = W
canvas.height = H
const ctx = canvas.getContext('2d')
const img = ctx.createImageData(W, H)
const out32 = new Uint32Array(img.data.buffer)
const fb = new Uint8Array(W * H)
const renderer = createRenderer(fb)

function resize() {
  const s = Math.min(window.innerWidth / W, window.innerHeight / H)
  canvas.style.width = `${W * s}px`
  canvas.style.height = `${H * s}px`
}
window.addEventListener('resize', resize)
resize()

// --- セーブ ---
const SAVE_KEY = 'gunzo-save-v1'
const SOUND_KEY = 'gunzo-sound'
const readSave = () => {
  try { const raw = localStorage.getItem(SAVE_KEY); return raw ? JSON.parse(raw) : null } catch { return null }
}
const fmtTime = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`
const ui = { screen: 'title', paused: false, stick: null, hasSave: false, saveInfo: '', sound: localStorage.getItem(SOUND_KEY) !== '0', hot: null }
function refreshSaveInfo() {
  const d = readSave()
  ui.hasSave = !!d
  ui.saveInfo = d ? `RESCUED ${d.rescued}/99  ALLIES ${d.allies.length}  LOST ${d.lost}  TIME ${fmtTime(d.t)}` : ''
}
refreshSaveInfo()
audio.setEnabled(ui.sound)

let S = createSim()
let lastSaveT = 0
function save() {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(S.serialize())) } catch { /* 容量がなければ諦める */ }
  lastSaveT = S.t
  refreshSaveInfo()
}
function newGame() {
  try { localStorage.removeItem(SAVE_KEY) } catch { /* ignore */ }
  S = createSim()
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
  S = createSim({ seed: d.seed })
  S.restore(d)
  lastSaveT = S.t
  ui.screen = 'play'
  ui.paused = false
  audio.music('field')
}
function toTitle() {
  ui.screen = 'title'
  ui.paused = false
  S = createSim()
  refreshSaveInfo()
  audio.music(null)
}

// --- 入力 ---
// ドラッグ：始点からの向きで動く（遠くへ引いたら始点が追いかける）。短いタップ：味方に切り替え
const STICK_MAX = 15
const DEAD = 3
const drags = new Map()
const keys = new Set()

function toFb(e) {
  const r = canvas.getBoundingClientRect()
  return { x: ((e.clientX - r.left) * W) / r.width, y: ((e.clientY - r.top) * H) / r.height, scale: r.width / W }
}
const inRect = (p, b) => p.x >= b.x && p.x < b.x + b.w && p.y >= b.y && p.y < b.y + b.h

canvas.addEventListener('pointerdown', (e) => {
  e.preventDefault()
  audio.unlock()
  canvas.setPointerCapture(e.pointerId)
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
  if (S.state === 'win') { if (S.winT > 2.5) { try { localStorage.removeItem(SAVE_KEY) } catch { /* ignore */ } toTitle() } return }
  if (inRect(p, PAUSE_BTN)) { ui.paused = true; drags.clear(); return }
  if (inRect(p, PREV_BTN)) { S.cycle(-1); drags.set(e.pointerId, { kind: 'btn' }); return }
  if (inRect(p, NEXT_BTN)) { S.cycle(1); drags.set(e.pointerId, { kind: 'btn' }); return }
  drags.set(e.pointerId, { kind: 'drag', ax: p.x, ay: p.y, sx: p.x, sy: p.y, x: p.x, y: p.y, t: performance.now(), moved: 0 })
})
canvas.addEventListener('pointermove', (e) => {
  const d = drags.get(e.pointerId)
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
  if (!d || d.kind !== 'drag') return
  if (d.moved < 4 && performance.now() - d.t < 350) {
    const p = toFb(e)
    // 小さな画面でも押せるよう、画面上の見た目の大きさで判定の半径を決める
    const radius = Math.max(9, 22 / p.scale)
    if (S.tapAt(p.x + S.cam.x, p.y + S.cam.y, radius)) audio.sfx('switch')
  }
}
canvas.addEventListener('pointerup', endPointer)
canvas.addEventListener('pointercancel', (e) => drags.delete(e.pointerId))
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
  if (k === 'e' || k === 'tab') { S.cycle(1); e.preventDefault() }
  else if (k === 'q') S.cycle(-1)
  keys.add(k)
})
window.addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()))
window.addEventListener('blur', () => { keys.clear(); drags.clear(); if (ui.screen === 'play' && S.state === 'play') ui.paused = true })

function readInput() {
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
    if (S.state === 'play' && S.t - lastSaveT > 20 && S.canSave()) save()
  } else if (ui.screen === 'title') {
    S.step(dt) // 背景の世界は止めない（敵が動く）
  }
  renderer.draw(S, ui, now / 1000)
  for (let i = 0; i < fb.length; i++) out32[i] = PAL32[fb[i]]
  ctx.putImageData(img, 0, 0)
  requestAnimationFrame(frame)
}
requestAnimationFrame(frame)
window.__G = { get sim() { return S }, ui }
