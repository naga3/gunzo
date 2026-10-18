import { ALL_HEX } from './shade.js'
import { createSim, JOB_LIST, JOBS } from './sim.js'
import { SHOOT, THROW, NIGHTMARE } from './data.js'
import { createRenderer, W, H, GLASS, GLASS_HOT, PREV_BTN, NEXT_BTN, PAUSE_BTN, SWING_BTN, SLOT_BTNS, slotItemBtn, MENU_BTNS, PAGE_PREV, PAGE_NEXT, listPages, listHit } from './render.js'
import { audio } from './audio.js'
import { SLOTS, migrate, useTestSaves, readSlot, writeSlot, deleteSlot, readSuspend, writeSuspend, clearSuspend, readNum, writeNum, BEST_KEY, NM_BEST_KEY } from './save.js'

const PAL32 = new Uint32Array(256)               // 使っていない番号（255 など）は透明
ALL_HEX.forEach((h, i) => {   // 色の表と、その暗い色
  const n = parseInt(h, 16)
  PAL32[i] = 0xff000000 | ((n & 0xff) << 16) | (n & 0xff00) | (n >> 16)
})
PAL32[GLASS] = 0x66000000                            // 半透明の黒（振るボタン）。0xAABBGGRR
PAL32[GLASS_HOT] = 0x66ffffff                        // 半透明の白（振った直後）

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
let padReady = false                                 // ui ができるまでは、余白の配置をしない
// 画面の外の余白（スマホ）: 縦持ちは画面を上に寄せて下の余白を、横持ちは左右の帯を、移動と振るボタンに使う。狭ければ使わない（今までどおり画面の上）
const PAD_MIN = 100                                  // 余白がこれ（CSS ピクセル）より狭ければ使わない
const padEl = document.getElementById('pad')
const padCtx = padEl.getContext('2d')
let pad = null                                       // { fb, out32, img, renderer, w, h }
const SWING_HOME = { x: SWING_BTN.x, y: SWING_BTN.y, r: SWING_BTN.r }
const NAV_HOME = [PAUSE_BTN, PREV_BTN, NEXT_BTN].map((b) => ({ ...b }))   // ポーズ・前・次の、ふだんの場所（画面の左下）
// 余白に置くときは大きく（指で押しやすいよう、見た目で 46 CSS ピクセルくらい）。dx, dy: 並べる向き（1 か 0）
const placeNav = (x, y, dx, dy, size) => [PAUSE_BTN, PREV_BTN, NEXT_BTN].forEach((b, i) => Object.assign(b, { x: x + dx * i * (size + 4), y: y + dy * i * (size + 4), w: size, h: size }))
function layoutPad() {
  const iw = window.innerWidth, ih = window.innerHeight
  const touch = matchMedia('(pointer: coarse)').matches
  const below = ih - H * scale, side = (iw - W * scale) / 2
  let mode = null
  if (touch && below >= PAD_MIN && below >= side * 2) mode = 'bottom'
  else if (touch && side >= PAD_MIN * 0.8) mode = 'side'
  document.body.style.alignItems = mode === 'bottom' ? 'flex-start' : 'center'
  Object.assign(SWING_BTN, SWING_HOME)
  ;[PAUSE_BTN, PREV_BTN, NEXT_BTN].forEach((b, i) => Object.assign(b, NAV_HOME[i]))
  ui.pad = null
  if (!mode) { padEl.style.display = 'none'; return }
  const r = view.getBoundingClientRect()
  const pw = Math.ceil(iw / scale), ph = Math.ceil(ih / scale)
  const ox = Math.round(r.left / scale), oy = Math.round(r.top / scale)   // 余白の絵の上での、ゲームの画面の左上
  const navSize = Math.max(22, Math.min(40, Math.round(46 / scale)))
  if (mode === 'bottom') {
    const bh = ph - oy - H, cy = H + Math.max(navSize + 44, Math.min(bh * 0.45, 110))
    Object.assign(SWING_BTN, { x: W - 52, y: Math.round(cy), r: 30 })
    ui.pad = { mode, ox, oy, stick: { x: 64, y: Math.round(cy) } }
    placeNav(4, H + 8, 1, 0, navSize)                // 下の余白の左上に横並び
  } else {
    const sw = ox, cy = Math.round(H * 0.62)
    Object.assign(SWING_BTN, { x: Math.round(W + sw / 2), y: cy, r: Math.min(30, Math.round(sw * 0.4)) })
    ui.pad = { mode, ox, oy, stick: { x: Math.round(-sw / 2), y: cy } }
    const ns = Math.min(navSize, Math.floor((sw - 12) / 3) - 4)   // 帯に 3 つ横に入る大きさ
    placeNav(Math.round(-sw / 2 - (ns * 3 + 8) / 2), 8, 1, 0, ns)   // 左の帯の上に横並び（縦持ちと同じ並び）
  }
  padEl.style.display = ''
  padEl.width = pw
  padEl.height = ph
  padEl.style.width = `${pw * scale}px`
  padEl.style.height = `${ph * scale}px`
  const img = padCtx.createImageData(pw, ph), fb = new Uint8Array(pw * ph)
  pad = { fb, img, out32: new Uint32Array(img.data.buffer), renderer: createRenderer(fb, pw, ph), ctx: padCtx }
}
function resize() {
  scale = Math.min(window.innerWidth / W, window.innerHeight / H)
  view.style.width = `${W * scale}px`
  view.style.height = `${H * scale}px`
  hud.el.style.width = `${W * scale}px`
  hud.el.style.height = `${H * scale}px`
  world.el.style.width = `${(W + 1) * scale}px`
  world.el.style.height = `${(H + 1) * scale}px`
  if (padReady) layoutPad()
}
function present(L) {
  for (let i = 0; i < L.fb.length; i++) L.out32[i] = PAL32[L.fb[i]]
  L.ctx.putImageData(L.img, 0, 0)
}
window.addEventListener('resize', resize)
resize()

// ふだんは本来のゲーム。?test を付けて開くとボス戦の試し（全員助けた LV13 の仲間で、闘技場の前から。?test&lv=20 でレベルを変える）。
// ?test=field は試し場（味方 100 人で、敵が湧き続ける）。どちらもセーブを使わない
const QS = new URLSearchParams(location.search)
const TEST = QS.has('test')
const TEST_MODE = QS.get('test') === 'field' ? 'field' : 'boss'
const TEST_LV = Number(QS.get('lv')) || 13
const TEST_HERO = 'sword'                             // 試し場の主人公の職（いま手触りを作っている職）
const simOpts = (o = {}) => ({ manual: true, ...(TEST ? { test: TEST_MODE, testLv: TEST_LV, hero: TEST_HERO } : {}), ...o })

// --- セーブ（src/save.js）---
// スロット 3 つ。ふだんのセーブはポーズの SAVE だけ。閉じたときは中断用のセーブ（一度だけ再開できる）。クリアするとナイトメアが開く
const SOUND_KEY = 'gunzo-sound'
const fmtTime = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`
const ui = { screen: 'title', paused: false, stick: null, sound: localStorage.getItem(SOUND_KEY) !== '0', hot: null, slots: [], slotSel: 0, slotMenu: null, delArm: false }
if (TEST) useTestSaves()   // 試しのセーブは別の名前で（ふだんのセーブに触らない）
else migrate()
const avgLv = (list) => (list.length ? (list.reduce((s, a) => s + a.lvl, 0) / list.length).toFixed(1) : '-')
// タイトルのスロットの要約
function refreshSlots() {
  ui.slots = []
  for (let n = 1; n <= SLOTS; n++) {
    const d = readSlot(n), sus = readSuspend(n)
    const o = { n, empty: !d, suspended: !!sus, cleared: !!d?.clear, lines: [] }
    if (d?.clear) {
      o.lines.push(`CLEARED ${fmtTime(d.clear.time)}  LV${avgLv(d.clear.party)}`)
      o.lines.push(d.nmBest ? `NIGHTMARE ${fmtTime(d.nmBest)}` : 'NIGHTMARE OPEN')
    } else if (d?.save) {
      const v = d.save
      o.lines.push(`RESCUED ${v.rescued}/99  LV${avgLv(v.allies)}`)
      o.lines.push(`LOST ${v.lost}  TIME ${fmtTime(v.t)}`)
    }
    if (sus) o.lines[1] = 'SUSPENDED - RESUME'
    ui.slots.push(o)
  }
  ui.best = readNum(BEST_KEY)
  ui.nmBest = readNum(NM_BEST_KEY)
}
// スロットを選んだときの項目
function slotMenu(n) {
  const o = ui.slots[n - 1], items = []
  if (o.suspended) items.push({ id: 'resume', label: 'RESUME' })
  else if (o.cleared) items.push({ id: 'nightmare', label: 'NIGHTMARE' })
  else items.push({ id: 'continue', label: 'CONTINUE' })
  items.push({ id: 'delete', label: 'DELETE' }, { id: 'back', label: 'BACK' })
  return items
}
refreshSlots()
audio.setEnabled(ui.sound)
padReady = true
layoutPad()

let S = createSim(simOpts())
let slot = 0                                         // 遊んでいるスロット（1〜3。試しでは 0）
let lastSaveT = -1                                   // 最後に SAVE した時のゲームの時間（-1 はまだ）
function start(sim, banner) {
  S = sim
  if (banner) { S.banner = banner; S.bannerT = 4 }
  ui.screen = 'play'
  ui.paused = false
  ui.slotMenu = null
  audio.music('field')
}
function save() {
  if (!slot || S.nightmare || !S.canSave()) return false
  const d = readSlot(slot) ?? {}
  d.save = S.serialize()
  if (!writeSlot(slot, d)) return false
  lastSaveT = S.t
  return true
}
function newGame(n) {
  slot = n
  clearSuspend(n)
  start(createSim(simOpts()), 'FREE 99 FRIENDS')
  lastSaveT = -1
  writeSlot(n, { save: S.serialize() }); lastSaveT = 0   // 始めた時点を 1 度だけ保存（スロットを取る）
}
function continueGame(n) {
  const d = readSlot(n)?.save
  if (!d) return newGame(n)
  slot = n
  clearSuspend(n)
  const sim = createSim(simOpts({ seed: d.seed }))
  sim.restore(d)
  start(sim)
  lastSaveT = sim.t
}
function nightmare(n, sus) {
  const d = readSlot(n)
  if (!d?.clear) return
  slot = n
  clearSuspend(n)
  const sim = createSim(simOpts({ seed: d.clear.seed, nightmare: { party: d.clear.party } }))
  if (sus) sim.restoreNM(sus)
  start(sim, sus ? null : 'NIGHTMARE')
  audio.music('boss')
}
function resumeSuspend(n) {
  const sus = readSuspend(n)
  if (!sus) return
  if (sus.mode === 'nightmare') return nightmare(n, sus.data)
  slot = n
  clearSuspend(n)                                    // 一度だけ
  const sim = createSim(simOpts({ seed: sus.data.seed }))
  sim.restore(sus.data)
  start(sim)
  lastSaveT = sus.lastSaveT ?? -1
}
// ナイトメアの終わり（全員倒れた・タイトルに戻った）: 上がったレベルを持ち帰り、耐えた秒を記録する
function endNightmare() {
  if (!slot || !S.nightmare || S.nmDone) return
  S.nmDone = true
  const d = readSlot(slot)
  if (!d?.clear) return
  for (const m of S.nmNow()) { const p = d.clear.party[m.pid]; if (p && m.lvl >= p.lvl) { p.lvl = m.lvl; p.xp = m.xp } }
  S.nmPrevBest = d.nmBest ?? 0
  if (S.t > (d.nmBest ?? 0)) d.nmBest = S.t
  writeSlot(slot, d)
  S.nmBestAll = readNum(NM_BEST_KEY)
  if (S.t > S.nmBestAll) { writeNum(NM_BEST_KEY, S.t); S.nmNewBest = true }
}
// クリア: このスロットはクリア済みに（ふだんのセーブは消し、クリアしたときの仲間を残す）。クリア時間の記録（早解き）
function cleared() {
  if (!slot) return
  const d = readSlot(slot) ?? {}
  d.save = null
  d.clear = { party: S.clearParty(), time: S.t, seed: S.world.seed }
  writeSlot(slot, d)
  clearSuspend(slot)
  const best = readNum(BEST_KEY)
  S.best = best
  if (!best || S.t < best) { S.newBest = true; writeNum(BEST_KEY, S.t) }
}
// 閉じた・隠したとき: 中断用のセーブ。戻ってきて遊び続けるなら消す（やり直しに使えないように）
function suspend() {
  if (!slot || ui.screen !== 'play' || S.state !== 'play') return
  writeSuspend(slot, S.nightmare ? { mode: 'nightmare', data: S.serializeNM() } : { mode: 'normal', data: S.serialize(), lastSaveT })
}
document.addEventListener('visibilitychange', () => { if (document.hidden) suspend(); else if (slot) clearSuspend(slot) })
window.addEventListener('pagehide', suspend)
function toTitle() {
  if (S.nightmare) endNightmare()
  ui.screen = 'title'
  ui.paused = false
  ui.slotMenu = null
  slot = 0
  S = createSim(simOpts())
  refreshSlots()
  audio.music(null)
}
// 試し（?test）はタイトルを飛ばして、すぐ始める
if (TEST) { slot = 1; start(S) }   // 試しはスロット 1（試し用）で、保存していない新しい状態から

// --- 入力 ---
// ドラッグ：始点からの向きで動く（遠くへ引いたら始点が追いかける）。短いタップ：味方に切り替え
// 自分で振る職を操作しているときは、右下の振るボタン（ちょん＝自動で狙う、ずらす＝狙う、離すと振る・射る）。PC もマウスは指と同じ。Space か Z は振るボタンを押すのと同じ（狙いは自動）
const STICK_MAX = 15
const DEAD = 3
const drags = new Map()
const aimsByDrag = () => S.isManual(S.leader) && (['arrow', 'bomb', 'magic', 'boomerang', 'lightning'].includes(JOBS[S.leader.job].kind) || JOBS[S.leader.job].taunt)   // 狙えるのは弓・爆弾・氷術師・ブーメラン・雷術師・盾（剣・盗賊は向いている方へ）
const throwsBomb = () => S.isManual(S.leader) && JOBS[S.leader.job].kind === 'bomb'
let zHeld = false                                    // Z（Space）を押している（振るボタンを押しているのと同じ）
let zTimer = 0
let zDownT = 0
let mouseAt = null                                   // PC のマウスの場所（画面のドット。押していなくても）
canvas.addEventListener('pointermove', (e) => { if (e.pointerType === 'mouse') mouseAt = toFb(e) })
canvas.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') mouseAt = null })
// 弓で Z を長押し（引き絞り）しているあいだは、マウスのドラッグが狙いになる。ちょん押しではドラッグ（移動）に触らない
// mv: 狙いに替える前の、移動の向き（ドラッグの始点からのずれ）。移動に戻すとき、同じ向きに歩き続けるように
const toAim = (d) => ({ kind: 'btn', fire: false, aim: true, follow: !!d.follow, ax: d.x, ay: d.y, x: d.x, y: d.y, mv: d.kind === 'drag' ? [d.x - d.ax, d.y - d.ay] : [0, 0] })
const toMove = (d) => ({ kind: 'drag', follow: d.follow, ax: d.x - d.mv[0], ay: d.y - d.mv[1], sx: d.x, sy: d.y, x: d.x, y: d.y, t: 0, moved: 99 })   // Z を離したあとも、押したままなら歩き続ける
const keys = new Set()

function toFb(e) {
  const r = canvas.getBoundingClientRect()
  return { x: ((e.clientX - r.left) * W) / r.width, y: ((e.clientY - r.top) * H) / r.height, scale: r.width / W }
}
const pause = () => { ui.paused = true; ui.page = 0 }
const turnPage = (d) => { const n = listPages(S); ui.page = (((ui.page ?? 0) + d) % n + n) % n }
// タイトル: スロットを選ぶ（空きならすぐ始める）、選んだスロットの項目
function pickSlot(n) {
  ui.slotSel = n
  ui.delArm = false
  if (ui.slots[n - 1].empty && !ui.slots[n - 1].suspended) return newGame(n)
  ui.slotMenu = slotMenu(n)
}
function slotAction(id) {
  const n = ui.slotSel
  if (id === 'resume') resumeSuspend(n)
  else if (id === 'continue') continueGame(n)
  else if (id === 'nightmare') nightmare(n)
  else if (id === 'back') { ui.slotMenu = null; ui.delArm = false }
  else if (id === 'delete') {
    if (!ui.delArm) { ui.delArm = true; ui.slotMenu = ui.slotMenu.map((it) => (it.id === 'delete' ? { ...it, label: 'REALLY DELETE?' } : it)); return }
    deleteSlot(n)
    refreshSlots()
    ui.slotMenu = null
    ui.delArm = false
  }
}
// 全員倒れたあと: ふだんは最後に SAVE したところから（なければ最初から）。ナイトメアはタイトルへ
function gameOverTap() {
  if (S.nightmare) return toTitle()
  continueGame(slot)
}
const inRect = (p, b, m = 0) => p.x >= b.x - m && p.x < b.x + b.w + m && p.y >= b.y - m && p.y < b.y + b.h + m
const SLOP = (e) => (e.pointerType === 'touch' ? 4 : 0)   // 指のときは、ボタンのまわり 4 ドットも押したことにする

canvas.addEventListener('pointerdown', (e) => {
  e.preventDefault()
  audio.unlock()
  try { canvas.setPointerCapture(e.pointerId) } catch { /* 作った操作（試し）では取れない */ }
  const p = toFb(e)
  if (ui.screen === 'title') {
    if (ui.slotMenu) { ui.slotMenu.forEach((it, i) => { if (inRect(p, slotItemBtn(i))) slotAction(it.id) }); return }
    SLOT_BTNS.forEach((b, i) => { if (inRect(p, b)) pickSlot(i + 1) })
    return
  }
  if (ui.paused) {
    if (inRect(p, PAGE_PREV)) turnPage(-1)
    if (inRect(p, PAGE_NEXT)) turnPage(1)
    const a = listHit(S, ui, p)                   // 一覧の仲間を押すと、その仲間に切り替えて戻る
    if (a && a.alive) { S.switchTo(a); ui.paused = false; return }
    for (const b of MENU_BTNS) {
      if (!inRect(p, b)) continue
      if (b.id === 'resume') ui.paused = false
      else if (b.id === 'sound') { ui.sound = !ui.sound; localStorage.setItem(SOUND_KEY, ui.sound ? '1' : '0'); audio.setEnabled(ui.sound) }
      else if (b.id === 'save') { if (save()) ui.savedFlash = 1.2 }
      else if (b.id === 'title') toTitle()
    }
    return
  }
  if (S.state === 'over') { gameOverTap(); return }
  if (S.state === 'win') { if (S.winT > 2.5) toTitle(); return }
  if (inRect(p, PAUSE_BTN, SLOP(e))) { pause(); drags.clear(); return }
  if (inRect(p, PREV_BTN, SLOP(e))) { S.cycle(-1); drags.set(e.pointerId, { kind: 'btn' }); return }
  if (inRect(p, NEXT_BTN, SLOP(e))) { S.cycle(1); drags.set(e.pointerId, { kind: 'btn' }); return }
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
    drags.set(e.pointerId, toAim({ ...p, follow: e.pointerType === 'mouse' }))
    return
  }
  // PC のマウス: 押している間、マウスのある場所へ歩く（スマホの指は、押した所からの向きで動くスティック）
  const follow = e.pointerType === 'mouse'
  drags.set(e.pointerId, { kind: 'drag', follow, ax: p.x, ay: p.y, sx: p.x, sy: p.y, x: p.x, y: p.y, t: performance.now(), moved: 0 })
})
// 画面の外の余白を触った: 振るボタンか、触った所を始点にした移動のスティック
window.addEventListener('pointerdown', (e) => {
  if (e.target === canvas || !ui.pad || ui.screen !== 'play' || ui.paused || S.state !== 'play') return
  e.preventDefault()
  audio.unlock()
  const p = toFb(e)
  if (inRect(p, PAUSE_BTN, SLOP(e))) { pause(); drags.clear(); return }   // ポーズ・前・次も余白にある
  if (inRect(p, PREV_BTN, SLOP(e))) { S.cycle(-1); drags.set(e.pointerId, { kind: 'btn' }); return }
  if (inRect(p, NEXT_BTN, SLOP(e))) { S.cycle(1); drags.set(e.pointerId, { kind: 'btn' }); return }
  if (S.isManual(S.leader) && Math.hypot(p.x - SWING_BTN.x, p.y - SWING_BTN.y) < SWING_BTN.r + 10) {
    S.input.pressed = true
    S.input.hold = true
    S.input.aim = null
    drags.set(e.pointerId, { kind: 'btn', hold: true, fire: true, ax: p.x, ay: p.y })
    return
  }
  drags.set(e.pointerId, { kind: 'drag', pad: true, follow: false, ax: p.x, ay: p.y, sx: p.x, sy: p.y, x: p.x, y: p.y, t: performance.now(), moved: 0 })
})
const FOLLOW_STOP = 3, FOLLOW_SLOW = 14            // マウスへ歩くとき: この近さで止まり、この距離の内側ではゆっくり
const AIM_DEAD = 5                                   // ボタンから、これ以上ずらしたら狙う（それまでは自動）
window.addEventListener('pointermove', (e) => {
  const d = drags.get(e.pointerId)
  if (d?.kind === 'btn' && (d.fire || d.aim)) {
    const p = toFb(e), dx = p.x - d.ax, dy = p.y - d.ay, m = Math.hypot(dx, dy)
    d.x = p.x
    d.y = p.y
    S.input.aim = m > AIM_DEAD ? [dx / m, dy / m] : null
    // 爆弾は、落とす場所: ずらした向きへ、ずらした長さの THROW.drag 倍だけ先
    S.input.target = throwsBomb() && m > AIM_DEAD ? { x: S.leader.x + dx * THROW.drag, y: S.leader.y + dy * THROW.drag } : null
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
  if (!d || d.kind !== 'drag' || d.pad) return      // 余白のスティックは、ちょんと触っても仲間を選ばない
  if (d.moved < 4 && performance.now() - d.t < 350) {
    const p = toFb(e)
    // 小さな画面でも押せるよう、画面上の見た目の大きさで判定の半径を決める
    const radius = Math.max(9, 22 / p.scale)
    if (S.tapAt(p.x + S.camF.x, p.y + S.camF.y, radius)) audio.sfx('switch')
  }
}
window.addEventListener('pointerup', endPointer)
window.addEventListener('pointercancel', (e) => { if (drags.get(e.pointerId)?.hold) S.input.hold = false; drags.delete(e.pointerId) })
canvas.addEventListener('contextmenu', (e) => e.preventDefault())

window.addEventListener('keydown', (e) => {
  if (e.repeat) return
  audio.unlock()
  const k = e.key.toLowerCase()
  if (ui.screen === 'title') {
    if (ui.slotMenu) {
      if (k === 'escape') { ui.slotMenu = null; ui.delArm = false }
      else if (k === 'enter' || k === ' ') slotAction(ui.slotMenu[0].id)
      return
    }
    if (k === '1' || k === '2' || k === '3') pickSlot(Number(k))
    return
  }
  if (k === 'escape' || k === 'p') { if (S.state === 'play') { if (ui.paused) ui.paused = false; else pause() } return }
  if (ui.paused && (k === 'arrowleft' || k === 'a')) { turnPage(-1); return }
  if (ui.paused && (k === 'arrowright' || k === 'd')) { turnPage(1); return }
  if (k === 'm') { ui.sound = !ui.sound; localStorage.setItem(SOUND_KEY, ui.sound ? '1' : '0'); audio.setEnabled(ui.sound); return }
  if (S.state === 'over') { if (k === 'r' || k === ' ' || k === 'enter') gameOverTap(); return }
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
window.addEventListener('blur', () => { keys.clear(); drags.clear(); zHeld = false; S.input.hold = false; if (ui.screen === 'play' && S.state === 'play' && !ui.paused) pause() })

function readInput() {
  // PC: 弓で Z を長押し（引き絞り）しているあいだは、マウスのある場所へ狙う
  if (zHeld && mouseAt && aimsByDrag() && performance.now() - zDownT > SHOOT.tap * 1000) {
    const L = S.leader, dx = mouseAt.x + S.camF.x - L.x, dy = mouseAt.y + S.camF.y - (L.y - 4), m = Math.hypot(dx, dy)
    if (m > 4) S.input.aim = [dx / m, dy / m]
    if (throwsBomb()) S.input.target = { x: mouseAt.x + S.camF.x, y: mouseAt.y + S.camF.y }   // 爆弾は、マウスのある場所へ落とす
  }
  let mx = 0, my = 0
  if (keys.has('arrowleft') || keys.has('a')) mx -= 1
  if (keys.has('arrowright') || keys.has('d')) mx += 1
  if (keys.has('arrowup') || keys.has('w')) my -= 1
  if (keys.has('arrowdown') || keys.has('s')) my += 1
  ui.stick = null
  ui.padStick = null
  for (const d of drags.values()) {
    if (d.kind !== 'drag') continue
    if (d.follow) {                                  // マウスのある場所へ（近くではゆっくり、着いたら止まる）
      const L = S.leader, dx = d.x + S.camF.x - L.x, dy = d.y + S.camF.y - (L.y - 4), dist = Math.hypot(dx, dy)
      if (dist > FOLLOW_STOP) {
        const k = Math.min(1, (dist - FOLLOW_STOP) / FOLLOW_SLOW)
        mx += (dx / dist) * k
        my += (dy / dist) * k
      }
      break
    }
    const dx = d.x - d.ax, dy = d.y - d.ay
    const dist = Math.hypot(dx, dy)
    if (dist > DEAD) {
      const k = Math.min(1, (dist - DEAD) / (STICK_MAX - DEAD))
      mx += (dx / dist) * k
      my += (dy / dist) * k
    }
    if (d.pad) ui.padStick = { ax: d.ax, ay: d.ay, x: d.x, y: d.y }
    else if (d.moved >= 4) ui.stick = { ax: d.ax, ay: d.ay, x: d.x, y: d.y }
    break
  }
  S.input.mx = mx
  S.input.my = my
}

// --- ループ ---
let last = performance.now()
let prev = { rescued: 0, lost: 0, state: 'play', boss: false, bossHp: 0, leaderId: 0, leaderLv: 1, swingT: undefined, hits: 0 }
let lastHitSfx = 0
function events() {
  if (S.rescued > prev.rescued) audio.sfx('rescue')
  if (S.lost > prev.lost) audio.sfx('lost')
  if (S.state === 'win' && prev.state !== 'win') {
    audio.sfx('win'); audio.music('ending')
    cleared()
  }
  if (S.state === 'over' && prev.state !== 'over') { audio.sfx('over'); audio.music(null); if (S.nightmare) endNightmare() }
  const bossOn = S.boss && S.boss.aggro && S.boss.hp > 0
  if (bossOn && !prev.boss) audio.music('boss')
  if (S.leader && S.leader.id === prev.leaderId && S.leader.lvl > prev.leaderLv) audio.sfx('levelup')
  // 操作キャラの攻撃だけ、控えめな音: 振る・撃つ（攻撃した時刻 swingT が変わった）、当たった（同じ 1/20 秒には 1 回だけ）
  const L = S.leader
  if (L && L.id === prev.leaderId && L.swingT !== undefined && L.swingT !== prev.swingT) audio.sfx(['melee'].includes(JOBS[L.job].kind) ? 'swing' : 'shot')
  if ((S.leaderHits ?? 0) > prev.hits && performance.now() - lastHitSfx > 50) { audio.sfx('hit'); lastHitSfx = performance.now() }
  prev = { rescued: S.rescued, lost: S.lost, state: S.state, boss: bossOn, leaderId: S.leader ? S.leader.id : 0, leaderLv: S.leader ? S.leader.lvl : 1, swingT: L?.swingT, hits: S.leaderHits ?? 0 }
}
let frameAvg = 1 / 60
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000)
  const last0 = last
  last = now
  // ポーズの SAVE の様子
  ui.canSave = !!slot && !S.nightmare && S.canSave()
  ui.saveNote = S.nightmare ? 'NIGHTMARE - NO SAVE' : lastSaveT < 0 ? 'NOT SAVED YET' : `SAVED ${fmtTime(S.t - lastSaveT)} AGO`
  if (ui.savedFlash > 0) ui.savedFlash -= dt
  if (ui.screen === 'play' && !ui.paused) {
    readInput()
    S.step(dt)
    events()
    // ナイトメア: 重くて 1 コマが長いときは、同時に出る敵の上限を下げる（軽ければ戻す）
    if (S.nightmare) {
      frameAvg += ((now - last0) / 1000 - frameAvg) * 0.05
      if (frameAvg > 1 / 30) S.nmCap = Math.max(80, S.nmCap - 2)
      else if (frameAvg < 1 / 50) S.nmCap = Math.min(NIGHTMARE.cap, S.nmCap + 1)
    }
  } else if (ui.screen === 'title') {
    S.step(dt) // 背景の世界は止めない（敵が動く）
  }
  world.renderer.draw(S, ui, now / 1000, 'world')
  hud.renderer.draw(S, ui, now / 1000, 'hud')
  present(world)
  present(hud)
  if (ui.pad && pad) { pad.renderer.drawPad(S, ui, now / 1000); present(pad) }
  const fx = S.camF.x - S.cam.x, fy = S.camF.y - S.cam.y   // カメラの半端な分（0〜1 ドット）
  world.el.style.transform = `translate(${-fx * scale}px, ${-fy * scale}px)`
  requestAnimationFrame(frame)
}
requestAnimationFrame(frame)
window.__G = { get sim() { return S }, ui }
