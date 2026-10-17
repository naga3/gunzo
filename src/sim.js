// ゲームの中身。描画は持たない（Node でも動く）
import { TILE, MW, MH, T, B, solidTile, generateWorld, createFlow, CASTLE } from './world.js'
import { ENEMY_SIZE } from './enemysprites.js'
import {
  HP_MUL, DMG_MUL, DIFFS, DIFF_RAMP, ARMOR, JOBS, JOB_LIST, JOB_COUNTS, ENEMIES, POOLS, BOSS, MAX_LV, xpNeed, lvMul, NAMES, SWING, SHOOT, GUARD, THROW, PRAY, STAB, FREEZE, BREAK, BOOMER, CHAIN, SMASH, MASS,
} from './data.js'

export const VIEW_W = 320
export const VIEW_H = 240
export { JOBS, JOB_LIST, ENEMIES, BOSS, MAX_LV, xpNeed, lvMul, SWING }

const LEASH = 230 // 操作キャラからこれ以上離れた敵は追わない
const rnd = (a, b) => a + Math.random() * (b - a)
const pick = (arr) => arr[(Math.random() * arr.length) | 0]
const RAD = { blob: 7, bat: 6, human: 6, beast: 8, heavy: 13 }

export function createSim(opts = {}) {
  // 難しさ（easy・normal・hard）: 敵の強さと見張りの数、ボス
  const DIFF = DIFFS[opts.diff] ?? DIFFS.normal
  const world = generateWorld(opts.seed ?? 7, DIFF.guards)
  const ramp = (m, tier) => 1 + (m - 1) * (DIFF_RAMP[tier] ?? 1)   // 先の地域ほど、難しさの倍率が強く効く
  const EDEF = Object.fromEntries(Object.entries(ENEMIES).map(([k, D]) => [k, { ...D, hp: Math.round(D.hp * ramp(DIFF.hp, D.tier)), dmg: Math.round(D.dmg * ramp(DIFF.dmg, D.tier)),
    speed: D.speed * ramp(DIFF.speed, D.tier), wind: D.wind * ramp(DIFF.wind, D.tier) }]))
  const flow = createFlow(world)
  const tiles = world.tiles
  // manual: 操作キャラ（manual の職）は自分で振る。ボットや確認では渡さず、今までどおり自動で攻撃する
  const MANUAL = opts.manual ?? false
  const FIELD = opts.test === true || opts.test === 'field'   // 試し場（敵が湧き続ける）。'boss' はボス戦の試し
  const S = {
    world, flow, t: 0, state: 'play', winT: 0,
    allies: [], enemies: [], cages: [], camps: [], projs: [], blasts: [], fx: [], hazards: [],
    actA: [], actE: [], leader: null, cam: { x: 0, y: 0 }, camF: { x: 0, y: 0 }, input: { mx: 0, my: 0, swing: false, pressed: false, hold: false, aim: null, target: null },
    nextId: 1, rescued: 0, total: 0, lost: 0, kills: 0, tpCool: 0, banner: null, bannerT: 0,
    flowKey: -1, boss: null, bossFight: false, bossFightT: 0, hazardsPrev: [], hitLog: null,
    seen: new Uint8Array(MW * MH), deaths: [], deadIdx: new Set(), hitstop: 0, shakeT: 0,
  }

  // --- 当たり判定・見通し ---
  const solidAt = (px, py) => {
    const tx = Math.floor(px / TILE), ty = Math.floor(py / TILE)
    if (tx < 0 || ty < 0 || tx >= MW || ty >= MH) return true
    return solidTile(tiles[ty * MW + tx])
  }
  const boxBlocked = (x, y, h) => solidAt(x - h, y - h) || solidAt(x + h, y - h) || solidAt(x - h, y + h) || solidAt(x + h, y + h)
  // 壁にすべる移動。動けたら true
  function moveBody(o, dx, dy, h = 4) {
    let moved = false
    if (dx) { const nx = o.x + dx; if (!boxBlocked(nx, o.y, h)) { o.x = nx; moved = true } }
    if (dy) { const ny = o.y + dy; if (!boxBlocked(o.x, ny, h)) { o.y = ny; moved = true } }
    return moved
  }
  function clearLine(ax, ay, bx, by) {
    const n = Math.ceil(Math.hypot(bx - ax, by - ay) / 8)
    for (let i = 1; i < n; i++) if (solidAt(ax + ((bx - ax) * i) / n, ay + ((by - ay) * i) / n)) return false
    return true
  }
  // 2点の間を、体の幅（半幅 4）で通れるか
  function clearBox(ax, ay, bx, by) {
    const n = Math.ceil(Math.hypot(bx - ax, by - ay) / 5)
    for (let i = 1; i <= n; i++) if (boxBlocked(ax + ((bx - ax) * i) / n, ay + ((by - ay) * i) / n, 4)) return false
    return true
  }
  const onScreen = (o) => o.x > S.cam.x - 8 && o.x < S.cam.x + VIEW_W + 8 && o.y > S.cam.y - 8 && o.y < S.cam.y + VIEW_H + 8
  const arena = world.arena
  const inArena = (o) => o.x >= arena.x0 && o.x <= arena.x1 && o.y >= arena.y0 && o.y <= arena.y1

  // --- 演出 ---
  const FXMAX = 600
  function spark(x, y, c, n = 4, sp = 40) {
    for (let i = 0; i < n && S.fx.length < FXMAX; i++) {
      const a = rnd(0, 6.28), s = rnd(sp * 0.4, sp)
      S.fx.push({ k: 'spark', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 10, t: 0, life: rnd(0.25, 0.5), c })
    }
  }
  function num(x, y, text, c) {
    if (S.fx.length < FXMAX) S.fx.push({ k: 'num', x, y: y - 8, vx: 0, vy: -26, t: 0, life: 0.7, c, text: String(text) })
  }
  function ring(x, y, c, r = 20, life = 0.4) {
    if (S.fx.length < FXMAX) S.fx.push({ k: 'ring', x, y, vx: 0, vy: 0, t: 0, life, c, r })
  }
  function zap(pts) {
    if (S.fx.length < FXMAX) S.fx.push({ k: 'zap', x: 0, y: 0, vx: 0, vy: 0, t: 0, life: 0.2, pts })
  }

  // --- 生成 ---
  function newAlly(job, x, y, lvl = 1) {
    const J = JOBS[job]
    const u = {
      id: S.nextId++, job, x, y, fx: 0, fy: 1, face: 1, lvl, xp: 0,
      maxhp: Math.round(J.hp * lvMul(lvl)), hp: 0, alive: true, moving: false, active: true,
      cd: rnd(0, 0.4), flash: 0, healT: rnd(0, 1.5),
      wanderT: rnd(0, 2), wx: 0, wy: 0, still: true, stuckT: 0, lastX: x, lastY: y, stuckChk: 0, stkT: 0, noSepT: 0, dodgeAt: 0, hurtT: -99, retreat: false,
      path: null, pi: 0, pathT: 0, pathLife: 0.7, pgx: -1, pgy: -1, ignore: null, ignoreT: 0, goal: 'idle',
      name: pick(NAMES), anim: rnd(0, 4),
    }
    u.hp = u.maxhp
    S.allies.push(u)
    return u
  }
  // 陣地の湧き直し: 倒した見張りは、その場所が画面の外に出て 10 秒たつと、元の場所に湧き直す（顔ぶれは少し変わる）。魔王城の中は湧き直さない
  const RESPAWN = { wait: 10, keep: 0.5 }
  S.respawns = []
  function queueRespawn(idx) {
    const en = world.enemies[idx]
    if (!en) return
    const tx = en.x / TILE, ty = en.y / TILE
    if (tx >= CASTLE.x0 && tx <= CASTLE.x1 && ty >= CASTLE.y0 && ty <= CASTLE.y1) return
    S.respawns.push({ idx, t: RESPAWN.wait })
  }
  function respawnKind(en) {
    if (Math.random() < RESPAWN.keep) return en.kind
    const pool = POOLS[world.biome[((en.y / TILE) | 0) * MW + ((en.x / TILE) | 0)]]
    if (!pool) return en.kind
    const D0 = ENEMIES[en.kind]
    const ok = pool.filter((k) => ENEMIES[k].cost <= D0.cost * 1.5 + 1 && (D0.atk === 'flyer' || ENEMIES[k].atk !== 'flyer'))
    return ok.length ? pick(ok) : en.kind
  }
  function updateRespawns(dt) {
    if (!S.respawns.length) return
    S.respawns = S.respawns.filter((r) => {
      const en = world.enemies[r.idx]
      const m = 24   // 画面のふちのすぐ外も「見えている」とみなす
      if (en.x > S.cam.x - m && en.x < S.cam.x + VIEW_W + m && en.y > S.cam.y - m && en.y < S.cam.y + VIEW_H + m) { r.t = RESPAWN.wait; return true }
      r.t -= dt
      if (r.t > 0) return true
      const e = newEnemy(respawnKind(en), en.x, en.y, en.camp)
      e.idx = r.idx
      S.deadIdx.delete(r.idx)
      return false
    })
  }
  function newEnemy(kind, x, y, camp, def) {
    const D = def ?? EDEF[kind]
    const e = {
      id: S.nextId++, kind, def: D, x, y, hx: x, hy: y, hp: D.hp, maxhp: D.hp, rad: D.big ? 8 : RAD[D.shape],
      cdT: rnd(0.3, 1), flash: 0, face: 1, active: false, aggro: false, anim: rnd(0, 4), wob: rnd(0, 6),
      state: 'idle', windT: 0, aim: null, camp, tele: null, actT: 0, dvx: 0, dvy: 0, hitSet: null,
      path: null, pi: 0, pathT: 0, pathLife: 0.7, pgx: -1, pgy: -1,
    }
    S.enemies.push(e)
    return e
  }

  // --- ダメージ・回復・経験値 ---
  // src: 攻撃の来た所 { x, y }（盾で正面から受けたかを見る）、foe: その攻撃をした敵（ジャストガードでよろけさせる）
  function hurtAlly(u, dmg, by, src = null, foe = null) {
    if (!u.alive) return
    const g = src ? guardOf(u, src.x, src.y) : null
    if (g === 'just') return justGuard(u, foe)
    if (g === 'block') {
      dmg *= GUARD.chip
      spark(u.x + u.guardDir[0] * 9, u.y - 6 + u.guardDir[1] * 9, 'gy6', 4, 40)
    }
    dmg = Math.max(1, Math.round(dmg))
    u.hp -= dmg
    if (FIELD) u.hp = Math.max(1, u.hp)              // 試し場では誰も倒れない（操作キャラも、いっしょにいる仲間も）
    if (S.hitLog) S.hitLog.push({ t: S.t, id: u.id, dmg, by: by ?? '?', hp: u.hp, maxhp: u.maxhp, job: u.job })
    u.hurtT = S.t
    u.flash = 0.12
    num(u.x, u.y - 8, dmg, 'rd4')
    spark(u.x, u.y - 4, 'rd3', 3)
    if (u.hp <= 0) {
      u.alive = false
      S.lost++
      S.deaths.push({ id: u.id, job: u.job, lvl: u.lvl, name: u.name, t: S.t, x: u.x, y: u.y, by: by ?? '?', maxhp: u.maxhp })
      spark(u.x, u.y - 4, 'gy6', 10, 60)
      ring(u.x, u.y, 'gy4', 14, 0.35)
    }
  }
  // 盾で受けたか: 構えていて、攻撃の来た所が正面（half の中）なら 'block'、構えてすぐ（just 秒以内）なら 'just'
  function guardOf(u, sx, sy) {
    if (!u.guarding || !u.guardDir) return null
    const dx = sx - u.x, dy = sy - (u.y - 4), d = Math.hypot(dx, dy)
    if (d > 0.5 && (dx * u.guardDir[0] + dy * u.guardDir[1]) / d < Math.cos(GUARD.half)) return null
    return S.t - u.guardT < GUARD.just ? 'just' : 'block'
  }
  function justGuard(u, foe) {
    hitFeel(GUARD.justStop, true)
    ring(u.x + u.guardDir[0] * 8, u.y - 6 + u.guardDir[1] * 8, 'white', 16, 0.3)
    spark(u.x + u.guardDir[0] * 9, u.y - 6 + u.guardDir[1] * 9, 'white', 8, 70)
    num(u.x, u.y - 22, 'JUST', 'ye3')
    if (foe && foe.hp > 0 && !bossOpening(foe, u)) stunEnemy(foe, GUARD.stun)
  }
  // 敵をよろけさせる（攻撃が止まり、少し動けない）
  function stunEnemy(e, t) {
    if (e.kind === 'boss') { e.pstate = 'stun'; e.pT = t }
    else { e.state = 'stun'; e.stunT = t }
    e.tele = null
    num(e.x, e.y - e.rad - 12, 'BREAK', 'ye3')
  }
  // ボスの隙（BREAK）: 操作キャラがボスの技を止めたとき。ボスは BREAK.dur 秒動けず、その間は全員のダメージが BREAK.mul 倍
  function bossOpening(b, by) {
    if (!b || b.kind !== 'boss' || by !== S.leader || b.hp <= 0) return false
    if (S.t < (b.breakOk ?? 0)) return false
    b.breakT = BREAK.dur
    b.breakOk = S.t + BREAK.dur + BREAK.cool
    b.pstate = 'stun'
    b.pT = Math.max(b.pT, BREAK.dur)
    b.tele = null
    S.banner = 'OPENING!'
    S.bannerT = 1.2
    ring(b.x, b.y, 'ye3', 40, 0.45)
    spark(b.x, b.y - 10, 'ye3', 20, 120)
    hitFeel(0.12, true)
    return true
  }
  function healAlly(u, n) {
    if (!u.alive || u.hp >= u.maxhp) return
    const h = Math.min(n, u.maxhp - u.hp)
    u.hp += h
    if (u === S.leader || S.fx.length < 120) num(u.x, u.y - 8, `+${Math.round(h)}`, 'gr5')
    spark(u.x, u.y - 6, 'gr5', 3, 24)
  }
  function gainXp(u, n) {
    if (!u.alive || u.lvl >= MAX_LV) return
    u.xp += n
    while (u.lvl < MAX_LV && u.xp >= xpNeed(u.lvl)) {
      u.xp -= xpNeed(u.lvl)
      u.lvl++
      const old = u.maxhp
      u.maxhp = Math.round(JOBS[u.job].hp * lvMul(u.lvl))
      u.hp = Math.min(u.maxhp, u.hp + (u.maxhp - old) + u.maxhp * 0.3)
      ring(u.x, u.y, 'ye2', 18, 0.5)
      num(u.x, u.y - 14, `LV${u.lvl}`, 'ye3')
      spark(u.x, u.y - 6, 'ye2', 8, 50)
    }
  }
  // pierce: 硬い敵（armor）にも全部通る攻撃（盗賊の背後・爆弾・引き絞った矢）。ハンマーと、凍った敵を砕く一撃も通る
  function hurtEnemy(e, dmg, by, pierce = false) {
    if (e.hp <= 0) return
    if (e.kind === 'boss') dmg *= e.breakT > 0 ? BREAK.mul : e.pstate === 'stun' ? 1.25 : 1
    if (e.def.armor && !pierce && !(e.frozen > 0) && !(by && JOBS[by.job]?.heavy)) {   // 硬い: 少ししか通らない（灰色の火花）
      dmg *= ARMOR
      spark(e.x, e.y - 6, 'gy5', 2, 30)
    }
    if (e.frozen > 0 && by && JOBS[by.job] && by.job !== 'ice') {   // 凍った敵を、ほかの職で叩くと砕ける（ボスは bossShatter 倍）
      dmg *= e.kind === 'boss' ? FREEZE.bossShatter : FREEZE.shatter
      e.frozen = 0
      if (by === S.leader) num(e.x, e.y - e.rad - 12, 'SHATTER', 'bl5')   // 文字も操作キャラのときだけ（100 人分で画面が埋まらないように）
      spark(e.x, e.y - 5, 'bl5', by === S.leader ? 12 : 4, 80)
      spark(e.x, e.y - 5, 'white', 6, 60)
      if (by === S.leader) hitFeel(0.08, true)     // 止まる・揺れるのは、操作キャラが砕いたときだけ（自律の仲間が砕くたびに揺れないように）
    }
    if (S.dmgByJob && by?.job) {                    // 測るとき（ボット）: 職ごとに、敵の種類（硬い・飛ぶ・ふつう・ボス）別の与えたダメージ
      const cat = e.kind === 'boss' ? 'boss' : e.def.armor ? 'armor' : e.def.atk === 'flyer' ? 'flyer' : 'other'
      const t = (S.dmgByJob[by.job] ??= { armor: 0, flyer: 0, other: 0, boss: 0 })
      t[cat] += Math.min(dmg, Math.max(0, e.hp))
      if (by === S.leader && cat === 'boss') S.dmgLeaderBoss = (S.dmgLeaderBoss ?? 0) + Math.min(dmg, Math.max(0, e.hp))
    }
    e.hp -= dmg
    e.flash = 0.1
    if (!e.aggro) { e.aggro = true; alertCamp(e) }
    // 100 人分の数字で画面が埋まらないよう、操作キャラの攻撃と大きな一撃だけ数字を出す
    if (by === S.leader || dmg >= 18) num(e.x, e.y - e.rad - 2, Math.round(dmg), 'white')
    spark(e.x, e.y - 4, 'ye2', 3)
    if (e.hp <= 0) killEnemy(e, by)
  }
  function killEnemy(e, by) {
    S.kills++
    if (e.idx !== undefined) { S.deadIdx.add(e.idx); queueRespawn(e.idx) }
    spark(e.x, e.y - 4, 'gy6', e.kind === 'boss' ? 40 : 10, e.kind === 'boss' ? 120 : 60)
    ring(e.x, e.y, 'gy4', e.kind === 'boss' ? 60 : 12, 0.3)
    // 経験値は総量が決まっている：半分は倒した人、残りは近くで戦っていた仲間で分ける
    const xp = e.def.xp
    const near = S.allies.filter((a) => a !== by && a.alive && a.active && Math.hypot(a.x - e.x, a.y - e.y) < 110)
    if (by && by.alive) gainXp(by, xp * 0.5)
    const each = (xp * (by && by.alive ? 0.5 : 1)) / Math.max(1, near.length)
    for (const a of near) gainXp(a, each)
    if (e.kind === 'boss') bossDied(e)
  }
  function alertCamp(e) {
    if (e.camp < 0) return
    for (const o of S.enemies) {
      if (o !== e && o.camp === e.camp && o.hp > 0 && Math.hypot(o.x - e.x, o.y - e.y) < 220) o.aggro = true
    }
  }
  const dmgOf = (u, mul = 1) => JOBS[u.job].atk * lvMul(u.lvl) * mul

  // --- 範囲攻撃・飛び道具 ---
  // kb: 爆風で中心から外へ吹き飛ばす強さ（操作キャラの爆弾）
  function explode(x, y, r, dmg, team, by, kb = 0) {
    ring(x, y, team === 'ally' ? 'or2' : 'rd3', r, 0.3)
    spark(x, y, team === 'ally' ? 'ye2' : 'rd4', 10, 70)
    if (team === 'ally') {
      let hit = false
      for (const e of S.actE) {
        if (e.hp > 0 && Math.hypot(e.x - x, e.y - y) < r + e.rad * 0.6) {
          hurtEnemy(e, dmg, by, by && JOBS[by.job]?.kind === 'bomb')   // 爆弾の爆発は硬い敵にも通る
          hit = true
          if (kb && e.hp > 0) {
            let dx = e.x - x, dy = e.y - y, d = Math.hypot(dx, dy)
            if (d < 2 && by) { dx = e.x - by.x; dy = e.y - by.y; d = 0 }   // 真ん中にいた敵は、投げた人から遠ざかる向きへ
            const m = Math.hypot(dx, dy) || 1
            knock(e, dx / m, dy / m, kb * (1 - 0.5 * Math.min(1, d / r)))   // 中心に近いほど強く
            e.flash = 0.16
          }
        }
      }
      if (kb) {                                    // 操作キャラの爆弾: 大きな火花と、揺れ
        spark(x, y, 'or2', 14, 110)
        ring(x, y, 'ye3', r * 0.6, 0.2)
        hitFeel(hit ? THROW.stop : 0, true)
      }
    } else {
      for (const a of S.actA) {
        if (a.alive && Math.hypot(a.x - x, a.y - y) < r + 4) hurtAlly(a, dmg, by && by.kind, { x, y })
      }
    }
  }
  function shoot(from, tx, ty, dmg, o) {
    const a = Math.atan2(ty - from.y, tx - from.x)
    S.projs.push({
      x: from.x, y: from.y - 4, vx: Math.cos(a) * o.speed, vy: Math.sin(a) * o.speed, dmg, team: o.team, life: o.life,
      pierce: o.pierce ?? 0, by: from, kind: o.kind, hit: new Set(), r: o.r ?? 5, splash: o.splash ?? 0, phase: 0, ox: from.x, oy: from.y, maxd: o.maxd ?? 0, spin: rnd(0, 6),
    })
  }
  function shootAngle(from, ang, dmg, o) {
    shoot(from, from.x + Math.cos(ang) * 100, from.y + Math.sin(ang) * 100, dmg, o)
  }

  // --- 味方の攻撃（職ごとに1種類）---
  function nearestEnemy(x, y, r) {
    let best = null, bd = r
    for (const e of S.actE) {
      if (e.hp <= 0) continue
      const d = Math.hypot(e.x - x, e.y - y) - (e.rad - 6)
      if (d < bd) { bd = d; best = e }
    }
    return best
  }
  function attackWith(u, tgt) {
    const J = JOBS[u.job]
    u.cd = J.cd
    u.face = tgt.x >= u.x ? 1 : -1
    const dmg = dmgOf(u)
    const dx = tgt.x - u.x, dy = tgt.y - u.y
    const d = Math.hypot(dx, dy) || 1
    u.fx = dx / d
    u.fy = dy / d
    switch (J.kind) {
      case 'melee':
        if (J.backstab && behind(u, tgt)) { hurtEnemy(tgt, dmg * (tgt.kind === 'boss' ? STAB.bossBack : STAB.back), u, true); num(tgt.x, tgt.y - tgt.rad - 12, 'CRIT', 'ye3'); break }   // 盗賊: 背後から
        hurtEnemy(tgt, dmg, u)
        spark((u.x + tgt.x) / 2, (u.y + tgt.y) / 2 - 4, 'gy6', 2, 30)
        break
      case 'arrow': shoot(u, tgt.x, tgt.y, dmg, { team: 'ally', speed: 210, life: J.range / 210 + 0.15, kind: 'arrow' }); break
      case 'boomerang': shoot(u, tgt.x, tgt.y, dmg, { team: 'ally', speed: 170, life: 4, kind: 'boom', r: 6, pierce: 999, maxd: J.range }); break
      case 'magic': shoot(u, tgt.x, tgt.y, dmg, { team: 'ally', speed: 165, life: J.range / 165 + 0.2, kind: 'magic', r: 6, splash: 28 }); break
      case 'bomb':
        S.blasts.push({ x: tgt.x, y: tgt.y, sx: u.x, sy: u.y - 4, r: 34, dmg, team: 'ally', by: u, t: 1.0, flight: 0.7, total: 1.0 })
        break
      case 'lightning': {
        const pts = [[u.x, u.y - 8]]
        let cur = tgt, m = 1
        const hit = new Set()
        for (let i = 0; i < 4 && cur; i++) {
          hit.add(cur)
          pts.push([cur.x, cur.y - 4])
          hurtEnemy(cur, dmg * m, u)
          m *= 0.8
          let next = null, nd = 52
          for (const e of S.actE) {
            if (e.hp <= 0 || hit.has(e)) continue
            const dd = Math.hypot(e.x - cur.x, e.y - cur.y)
            if (dd < nd) { nd = dd; next = e }
          }
          cur = next
        }
        zap(pts)
        break
      }
    }
  }
  // 僧侶：近くの傷ついた味方を、いちばん傷の深い順に最大3人まで治す
  function healPulse(u) {
    const list = []
    for (const a of S.actA) {
      if (!a.alive) continue
      const r = a.hp / a.maxhp
      if (r < 0.9 && Math.hypot(a.x - u.x, a.y - u.y) < 110) list.push([r, a])
    }
    if (!list.length) return false
    list.sort((p, q) => p[0] - q[0])
    for (const [, a] of list.slice(0, 3)) {
      healAlly(a, 13 * lvMul(u.lvl))
      ring(a.x, a.y, 'gr5', 9, 0.3)
    }
    ring(u.x, u.y, 'gr5', 14, 0.3)
    u.cd = JOBS.heal.cd
    return true
  }

  // --- 操作キャラが自分で振る剣 ---
  const isManual = (u) => MANUAL && !opts.botLeader && !!JOBS[u.job].manual   // botLeader: ボットが操作キャラを動かす（自動で攻撃させる）
  const angDiff = (a, b) => { let d = a - b; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d }
  // 予兆の最中の敵を斬ると、攻撃が止まって少し動けなくなる。ボスは近くの技（叩きつけ・突進・扇）だけ止まる
  function stagger(e, by) {
    if (e.kind === 'boss') {
      if (e.pstate !== 'wind' || !['slam', 'charge', 'fan'].includes(e.atkKind)) return false
      if (bossOpening(e, by)) return true
      e.pstate = 'stun'
      e.pT = SWING.bossStun
    } else {
      if (e.state !== 'wind') return false
      e.state = 'stun'
      e.stunT = SWING.stun
    }
    e.tele = null
    num(e.x, e.y - e.rad - 12, 'BREAK', 'ye3')
    ring(e.x, e.y, 'ye3', e.rad + 8, 0.3)
    return true
  }
  // 敵の弾を、撃った敵へ弾き返す（撃った敵がいなければ ang の向きへ。ang も無ければ来た向きへ）
  function deflectProj(p, u, ang = null) {
    const src = p.by && p.by.hp > 0 ? p.by : null
    const a = src ? Math.atan2(src.y - 4 - p.y, src.x - p.x) : ang ?? Math.atan2(-p.vy, -p.vx)
    const sp = Math.max(160, Math.hypot(p.vx, p.vy) * 1.8)
    p.vx = Math.cos(a) * sp
    p.vy = Math.sin(a) * sp
    p.team = 'ally'
    p.by = u
    p.dmg = Math.max(p.dmg * SWING.back, dmgOf(u) * 2)
    p.hit = new Set()
    p.life = 1.6
    p.splash = 0
    p.deflected = true
    spark(p.x, p.y, 'white', 5, 50)
  }
  // 盾で押す: 正面の敵に体当たり。大きく押し出し、予兆の最中ならよろけさせる
  function bash(u) {
    const [dx0, dy0] = u.guardDir || [u.fx, u.fy]
    u.cd = GUARD.cd
    u.swingT = S.t
    if (S.fx.length < FXMAX) S.fx.push({ k: 'bash', x: u.x, y: u.y - 4, vx: 0, vy: 0, t: 0, life: 0.14, ang: Math.atan2(dy0, dx0), r: GUARD.bashR, half: GUARD.bashHalf })
    let hit = false
    for (const e of S.actE) {
      if (e.hp <= 0) continue
      const dx = e.x - u.x, dy = e.y - u.y, d = Math.hypot(dx, dy)
      if (d > GUARD.bashR + e.rad) continue
      if (d > e.rad && (dx * dx0 + dy * dy0) / d < Math.cos(GUARD.bashHalf)) continue
      stagger(e, u)
      hurtEnemy(e, dmgOf(u, GUARD.bashMul), u)
      if (e.hp > 0) knock(e, dx0, dy0, GUARD.bashKb)
      e.flash = 0.16
      hit = true
    }
    if (hit) hitFeel(GUARD.bashStop, true)
  }
  // 僧侶: いちばん傷の深い仲間（体力の割合がいちばん少ない。自分も）へ、追いかける癒やしの光
  function healBolt(u) {
    let best = null, br = 1
    for (const a of S.actA) {
      if (!a.alive || Math.hypot(a.x - u.x, a.y - u.y) > PRAY.range) continue
      const r = a.hp / a.maxhp
      if (r < br) { br = r; best = a }
    }
    u.cd = PRAY.cd
    u.swingT = S.t
    if (!best) { num(u.x, u.y - 22, 'OK', 'gr5'); return }   // みんな元気
    S.projs.push({ kind: 'healbolt', team: 'heal', x: u.x, y: u.y - 8, vx: 0, vy: -PRAY.boltSpeed, target: best, amount: PRAY.bolt * lvMul(u.lvl), life: 2.5, spin: 0, hit: new Set(), r: 4, by: u })
  }
  // 僧侶: 足元の癒やしの円。中の仲間を少しずつ治し（数字はまとめて出す）、入ってきた敵の弾を消す
  function prayCircle(u, dt) {
    const amt = PRAY.rate * lvMul(u.lvl) * dt
    for (const a of S.actA) {
      if (!a.alive || a.hp >= a.maxhp || Math.hypot(a.x - u.x, a.y - u.y) > PRAY.r) continue
      const h = Math.min(amt, a.maxhp - a.hp)
      a.hp += h
      a.healAcc = (a.healAcc ?? 0) + h
      if (a.healAcc >= 3) { num(a.x, a.y - 8, `+${Math.round(a.healAcc)}`, 'gr5'); a.healAcc = 0 }
    }
    for (const p of S.projs) if (p.team === 'enemy' && Math.hypot(p.x - u.x, p.y + 4 - u.y) < PRAY.r) { p.life = 0; spark(p.x, p.y, 'gr5', 4, 30) }
    if (Math.random() < 0.5) spark(u.x + rnd(-PRAY.r, PRAY.r) * 0.8, u.y + rnd(-PRAY.r, PRAY.r) * 0.5, 'gr5', 1, 12)
  }
  function hitFeel(stop, shake) {
    S.hitstop = Math.max(S.hitstop, stop)
    if (shake) { S.shakeT = 0.12; S.shakeAmp = Math.max(S.shakeT > 0 ? S.shakeAmp ?? 0 : 0, SWING.shake) }
  }
  // 振った向きへ押し出す。重い敵ほど動かない
  function knock(e, ca, sa, kb = SWING.kb) {
    if (e.kind === 'boss') return
    const m = e.def.big ? MASS.big : MASS[e.def.shape] ?? 1
    const v = kb / m
    if (v < 25) return
    e.kbx = ca * v
    e.kby = sa * v
    e.kbT = SWING.kbTime
  }
  // 押し出されている間は自分では動かない。勢いよく壁にぶつかると、ダメージを受けて少し動けなくなる
  function updateKnock(e, dt) {
    const k = e.kbT / SWING.kbTime
    e.kbT -= dt
    const vx = e.kbx * k, vy = e.kby * k
    const x0 = e.x, y0 = e.y
    stepEnemy(e, vx, vy, 1, dt)
    const want = Math.hypot(vx, vy) * dt, got = Math.hypot(e.x - x0, e.y - y0)
    if (want > 0.8 && got < want * 0.4) {
      e.kbT = 0
      ring(e.x, e.y, 'gy6', e.rad + 4, 0.25)
      spark(e.x, e.y - 4, 'br5', 6, 50)
      S.shakeT = Math.max(S.shakeT, 0.1)
      const L = S.leader
      hurtEnemy(e, dmgOf(L) * SWING.wallDmg, L)
      if (e.hp > 0 && e.state !== 'stun') { e.state = 'stun'; e.stunT = SWING.wallStun; e.tele = null }
    }
  }
  // 弓を自分で射る: charge（引いた秒数）で、速射から強い矢まで。向いている方へ
  function shootManual(u, charge) {
    const k = Math.min(1, charge / SHOOT.full), strong = k >= 1
    const mul = strong ? SHOOT.strong : SHOOT.quick + (SHOOT.strong - SHOOT.quick) * 0.5 * k
    const speed = strong ? SHOOT.strongSpeed : SHOOT.speed, range = strong ? SHOOT.strongRange : SHOOT.range
    shoot(u, u.x + u.fx * 100, u.y + u.fy * 100, dmgOf(u, mul), { team: 'ally', speed, life: range / speed, kind: 'arrow', pierce: strong ? 99 : 0, r: strong ? 6 : 5 })
    const p = S.projs[S.projs.length - 1]
    p.manual = true
    p.strong = strong
    u.cd = SHOOT.cd
    u.swingT = S.t
    if (strong) { ring(u.x, u.y - 4, 'white', 10, 0.2); spark(u.x + u.fx * 8, u.y - 4 + u.fy * 8, 'white', 5, 60) }
  }
  // 盗賊のナイフ: 向いている方を素早く刺す。背後からは back 倍（CRIT）。檻も刺して開ける（速い）
  function stab(u) {
    u.cd = STAB.cd
    u.swingT = S.t
    const ang = Math.atan2(u.fy, u.fx), ca = Math.cos(ang), sa = Math.sin(ang)
    if (S.fx.length < FXMAX) S.fx.push({ k: 'stab', x: u.x, y: u.y - 4, vx: 0, vy: 0, t: 0, life: 0.09, ang, r: STAB.r })
    let best = null, bd = Infinity
    for (const e of S.actE) {                      // ナイフは 1 体だけ: 正面のいちばん近い敵
      if (e.hp <= 0) continue
      const dx = e.x - u.x, dy = e.y - u.y, d = Math.hypot(dx, dy)
      if (d > STAB.r + e.rad) continue
      if (d > e.rad && (dx * ca + dy * sa) / d < Math.cos(STAB.half)) continue
      if (d < bd) { bd = d; best = e }
    }
    if (best) {
      const crit = behind(u, best)
      if (crit) bossOpening(best, u)
      hurtEnemy(best, dmgOf(u, crit ? (best.kind === 'boss' ? STAB.bossBack : STAB.back) : 1), u, crit)
      best.flash = 0.16
      spark(best.x, best.y - 5, crit ? 'ye3' : 'white', crit ? 6 : 3, 50)
      if (crit) num(best.x, best.y - best.rad - 12, 'CRIT', 'ye3')
      if (best.hp > 0) knock(best, ca, sa, STAB.kb)
      hitFeel(crit ? STAB.critStop : STAB.stop, crit)
    }
    const c = nearestCage(u.x, u.y, 26)
    if (c) bashCage(u, c)
  }
  function swing(u) {
    u.cd = SWING.cd
    u.swingT = S.t
    const ang = Math.atan2(u.fy, u.fx)
    const inArc = (x, y, r) => {
      const d = Math.hypot(x - u.x, y - u.y)
      return d <= r && (d < 6 || Math.abs(angDiff(Math.atan2(y - u.y, x - u.x), ang)) < SWING.half)
    }
    // 敵の当たりは、絵の形（四角）で見る。扇が少しでもかかるか、自分の体が絵に重なって（そばにいて）いれば当たる
    const ox = u.x, oy = u.y - 3 // 振る中心は体のまんなか
    const hitsBody = (e) => {
      const sz = ENEMY_SIZE[e.kind] ?? { w: 16, h: 16 }
      const lift = e.def.atk === 'flyer' ? 7 : 0
      const x0 = e.x - sz.w * 0.35, x1 = e.x + sz.w * 0.35
      const y0 = e.y + 6 - lift - sz.h * 0.9, y1 = e.y + 6 - lift
      const near = 6
      if (ox > x0 - near && ox < x1 + near && oy > y0 - near && oy < y1 + near) return true
      for (let i = 0; i <= 4; i++) {
        for (let j = 0; j <= 4; j++) {
          const x = x0 + ((x1 - x0) * i) / 4, y = y0 + ((y1 - y0) * j) / 4
          const d = Math.hypot(x - ox, y - oy)
          if (d <= SWING.r && Math.abs(angDiff(Math.atan2(y - oy, x - ox), ang)) < SWING.half) return true
        }
      }
      return false
    }
    const slash = { k: 'slash', x: u.x, y: u.y - 4, vx: 0, vy: 0, t: 0, life: 0.2, ang, r: SWING.r, half: SWING.half, hit: false }
    if (S.fx.length < FXMAX) S.fx.push(slash)
    const dmg = dmgOf(u)
    const ca = Math.cos(ang), sa = Math.sin(ang)
    for (const e of S.actE) {
      if (e.hp <= 0 || !hitsBody(e)) continue
      const broke = stagger(e, u)
      hurtEnemy(e, dmg, u)
      e.flash = 0.16
      // 斬った跡：振った向きに斜めの白い線
      if (S.fx.length < FXMAX) S.fx.push({ k: 'cut', x: e.x, y: e.y - 6, vx: 0, vy: 0, t: 0, life: 0.12, ang: ang + 1.1, len: 9 + e.rad * 0.6 })
      spark(e.x, e.y - 5, 'white', 3, 50)
      if (e.hp <= 0) {
        // とどめ：振った向きへ吹き飛んで消える
        if (S.fx.length < FXMAX && e.kind !== 'boss') S.fx.push({ k: 'corpse', x: e.x, y: e.y, vx: ca * 150, vy: sa * 150, t: 0, life: 0.28, kind: e.kind, def: e.def, face: e.face, rad: e.rad })
        hitFeel(SWING.bigStop, true)
      } else {
        knock(e, ca, sa)
        hitFeel(broke ? SWING.bigStop : SWING.stop, broke)
      }
    }
    // 飛んできた弾は、撃った敵へ弾き返す（撃った敵がいなければ、振った向きへ）
    for (const p of S.projs) if (p.team === 'enemy' && inArc(p.x, p.y + 4, SWING.deflect)) deflectProj(p, u, ang)
    const c = nearestCage(u.x, u.y, 30)
    if (c && inArc(c.x, c.y, 30)) bashCage(u, c)
    slash.hit = S.hitstop > 0                        // 何かに当たった振りは、弧を太く明るく
  }

  // --- 檻 ---
  function openCage(c) {
    if (c.opened) return
    c.opened = true
    tiles[c.ty * MW + c.tx] = T.PATH
    const avg = S.allies.length ? S.allies.reduce((s, a) => s + a.lvl, 0) / S.allies.length : 1
    const u = newAlly(c.job, c.x, c.y, Math.max(1, Math.floor(avg * 0.6)))
    u.name = c.name
    S.rescued++
    spark(c.x, c.y - 4, 'ye2', 14, 70)
    ring(c.x, c.y, 'ye3', 22, 0.6)
    num(c.x, c.y - 16, 'FREE!', 'ye3')
    S.flowKey = -1
    if (S.rescued === S.total) { S.banner = 'ALL RESCUED'; S.bannerT = 6 }
    return u
  }
  function nearestCage(x, y, r) {
    let best = null, bd = r
    for (const c of S.cages) {
      if (c.opened) continue
      const d = Math.hypot(c.x - x, c.y - y)
      if (d < bd) { bd = d; best = c }
    }
    return best
  }
  // 敵の背後にいるか（敵は左右どちらかを向いている。向いていない側から）
  const behind = (u, e) => (u.x - e.x) * (e.face || 1) < -2
  function bashCage(u, c) {
    c.hp -= Math.max(2, JOBS[u.job].atk) * lvMul(u.lvl) * (JOBS[u.job].unlock ?? 1)   // 盗賊は速く開ける
    c.flash = 0.1
    spark(c.x, c.y, 'br5', 3)
    if (c.hp <= 0) openCage(c)
  }

  // --- 体の押し合い ---
  const bodyHead = new Int32Array(MW * MH)
  let bodyNext = []
  let bodies = []
  function buildBodies() {
    bodyHead.fill(-1)
    bodies = []
    bodyNext = []
    const add = (o) => {
      const tx = Math.floor(o.x / TILE), ty = Math.floor(o.y / TILE)
      if (tx < 0 || ty < 0 || tx >= MW || ty >= MH) return
      bodies.push(o)
      bodyNext.push(bodyHead[ty * MW + tx])
      bodyHead[ty * MW + tx] = bodies.length - 1
    }
    for (const a of S.actA) if (a.alive) add(a)
    for (const e of S.actE) if (e.hp > 0) add(e)
  }
  function separation(u, r = 11) {
    let sx = 0, sy = 0
    const tx = Math.floor(u.x / TILE), ty = Math.floor(u.y / TILE)
    for (let j = ty - 1; j <= ty + 1; j++) {
      if (j < 0 || j >= MH) continue
      for (let i = tx - 1; i <= tx + 1; i++) {
        if (i < 0 || i >= MW) continue
        for (let k = bodyHead[j * MW + i]; k >= 0; k = bodyNext[k]) {
          const b = bodies[k]
          if (b === u) continue
          const dx = u.x - b.x, dy = u.y - b.y
          const d = Math.hypot(dx, dy)
          const rr = r + (b.rad ? b.rad - 6 : 0)
          if (d >= rr) continue
          if (d < 0.01) { sx += rnd(-1, 1); sy += rnd(-1, 1); continue }
          const w = 1 - d / rr
          sx += (dx / d) * w
          sy += (dy / d) * w
        }
      }
    }
    return [sx, sy]
  }

  // --- 回り道 ---
  const NB8 = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]
  const walkable = (tx, ty) => tx >= 0 && ty >= 0 && tx < MW && ty < MH && !solidTile(tiles[ty * MW + tx])
  const canStep = (x, y, dx, dy) => walkable(x + dx, y + dy) && (dx === 0 || dy === 0 || (walkable(x + dx, y) && walkable(x, y + dy)))
  const PATH_R = 24
  const pq = new Int32Array(MW * MH)
  const pparent = new Int32Array(MW * MH)
  const pseen = new Uint32Array(MW * MH)
  let pstamp = 0
  function findPath(sx, sy, gx, gy) {
    pstamp++
    let head = 0, tail = 0
    const start = sy * MW + sx, goal = gy * MW + gx
    pq[tail++] = start
    pseen[start] = pstamp
    pparent[start] = -1
    while (head < tail) {
      const cur = pq[head++]
      if (cur === goal) {
        const out = []
        for (let k = cur; k !== start; k = pparent[k]) out.push([(k % MW) * TILE + 8, ((k / MW) | 0) * TILE + 8])
        return out.reverse()
      }
      const cx = cur % MW, cy = (cur / MW) | 0
      for (const [dx, dy] of NB8) {
        const nx = cx + dx, ny = cy + dy
        if (Math.abs(nx - sx) > PATH_R || Math.abs(ny - sy) > PATH_R) continue
        if (!canStep(cx, cy, dx, dy)) continue
        const k = ny * MW + nx
        if (pseen[k] === pstamp) continue
        pseen[k] = pstamp
        pparent[k] = cur
        pq[tail++] = k
      }
    }
    return null
  }
  function flowDir(u) {
    const tx = Math.floor(u.x / TILE), ty = Math.floor(u.y / TILE)
    const k = ty * MW + tx
    const fx = flow.dirX[k], fy = flow.dirY[k]
    if (!fx && !fy) return null
    const dx = (tx + fx) * TILE + 8 - u.x, dy = (ty + fy) * TILE + 8 - u.y
    const dd = Math.hypot(dx, dy) || 1
    return [dx / dd, dy / dd]
  }
  // 目標への向き。まっすぐ行けなければ回り道を探す。たどり着けなければ null
  function steerTo(u, tx, ty) {
    const dx = tx - u.x, dy = ty - u.y
    const d = Math.hypot(dx, dy) || 1
    if (d < 20 || clearBox(u.x, u.y, tx, ty)) { u.path = null; return [dx / d, dy / d] }
    const gtx = Math.floor(tx / TILE), gty = Math.floor(ty / TILE)
    if (!u.path || S.t - u.pathT > u.pathLife || u.pgx !== gtx || u.pgy !== gty) {
      let gx = gtx, gy = gty
      if (!walkable(gx, gy)) {
        let best = null, bd = Infinity
        for (const [ox, oy] of NB8) {
          if (!walkable(gx + ox, gy + oy)) continue
          const dd = Math.hypot((gx + ox) * TILE + 8 - u.x, (gy + oy) * TILE + 8 - u.y)
          if (dd < bd) { bd = dd; best = [gx + ox, gy + oy] }
        }
        if (!best) { u.path = null; return null }
        ;[gx, gy] = best
      }
      const p = findPath(Math.floor(u.x / TILE), Math.floor(u.y / TILE), gx, gy)
      u.pathT = S.t
      u.pathLife = rnd(0.5, 0.9)
      u.pgx = gtx
      u.pgy = gty
      if (!p) { u.path = null; return null }
      if (!p.length) { u.path = null; return [dx / d, dy / d] }
      u.path = p
      u.pi = 0
    }
    const Pth = u.path
    while (u.pi < Pth.length - 1 && clearBox(u.x, u.y, Pth[u.pi + 1][0], Pth[u.pi + 1][1])) u.pi++
    while (u.pi < Pth.length - 1 && Math.hypot(Pth[u.pi][0] - u.x, Pth[u.pi][1] - u.y) < 6) u.pi++
    const wx = Pth[u.pi][0] - u.x, wy = Pth[u.pi][1] - u.y
    const wd = Math.hypot(wx, wy)
    if (wd < 3) return [dx / d, dy / d]
    return [wx / wd, wy / wd]
  }

  // --- 操作キャラ ---
  // 仲間（操作キャラも）は敵をすり抜けない。重なったら、重さ（MASS）に応じて分けて押し戻す（軽い敵は押せる、重い敵とボスには止められる。
  // 盾は重いので、敵を止める壁になる）。飛ぶ敵は浮いているので、すり抜ける。仲間どうしは今までどおり柔らかい押し合い（separation）だけ。
  // 近くの敵は、体の升目（buildBodies）から探す
  const ALLY_MASS = 1.2, SHIELD_MASS = 2.5, ALLY_R = 4
  function pushBodies(u) {
    const tx = Math.floor(u.x / TILE), ty = Math.floor(u.y / TILE)
    const near = []
    for (let j = ty - 1; j <= ty + 1; j++) {
      if (j < 0 || j >= MH) continue
      for (let i = tx - 1; i <= tx + 1; i++) {
        if (i < 0 || i >= MW) continue
        for (let k = bodyHead[j * MW + i]; k >= 0; k = bodyNext[k]) if (bodies[k].def) near.push(bodies[k])
      }
    }
    const LEADER_MASS = JOBS[u.job].taunt ? SHIELD_MASS : JOBS[u.job].heavy ? SMASH.mass : ALLY_MASS, LEADER_R = ALLY_R
    for (const e of near) {
      if (e.hp <= 0 || e.def.atk === 'flyer') continue
      const dx = e.x - u.x, dy = e.y - u.y, d = Math.hypot(dx, dy), min = LEADER_R + e.rad
      if (d >= min) continue
      const nx = d > 0.01 ? dx / d : u.fx || 1, ny = d > 0.01 ? dy / d : u.fy || 0
      const over = min - d
      const m = e.kind === 'boss' ? Infinity : e.def.big ? MASS.big : MASS[e.def.shape] ?? 1
      const toEnemy = m === Infinity ? 0 : LEADER_MASS / (LEADER_MASS + m)
      if (toEnemy > 0) stepEnemy(e, nx, ny, over * toEnemy, 1)   // 敵も壁にはめり込まない
      const left = min - Math.hypot(e.x - u.x, e.y - u.y)        // 敵が壁で動けなかった分も、こちらが下がる
      if (left > 0) { moveBody(u, -nx * left, 0); moveBody(u, 0, -ny * left) }
    }
  }
  // ブーメランの輪（しずく形）の上の場所（th は 0〜2π）。行きは向きの左側、奥（th = π）で折り返し、帰りは右側。最後の home の割合は、投げた人の今いる所へ寄せる
  function boomLoopAt(L, th, by) {
    const D = L.D, W = D * BOOMER.wide * 0.5
    const f = (D / 2) * (1 - Math.cos(th)), sd = -W * 1.55 * Math.sin(th) * (1 - Math.cos(th)) / 2   // しずく形: 手元はとがり、まず前へ出る
    let x = L.sx + L.dx * f - L.dy * sd, y = L.sy + L.dy * f + L.dx * sd
    const h0 = 2 * Math.PI * (1 - BOOMER.home)
    if (by && th > h0) {
      const k = (th - h0) / (2 * Math.PI - h0), s2 = k * k * (3 - 2 * k)
      x += (by.x - L.sx) * s2
      y += (by.y - 4 - L.sy) * s2
    }
    return [x, y]
  }
  // 向き dir の先の敵（向きから 0.45 ラジアン以内で、いちばん近いもの）
  function rayTarget(u, [ax, ay], range) {
    let best = null, bd = Infinity
    for (const e of S.actE) {
      if (e.hp <= 0) continue
      const dx = e.x - u.x, dy = e.y - u.y, d = Math.hypot(dx, dy)
      if (d > range + e.rad || d < 0.01 || (dx * ax + dy * ay) / d < Math.cos(0.45)) continue
      if (d < bd) { bd = d; best = e }
    }
    return best
  }
  // 雷の連鎖（操作キャラ）: first から n 体まで、近い敵へ跳ぶ（hop まで。凍った敵からは 2 倍）。凍った敵は砕ける
  function chainBolt(u, first, n, hop, big) {
    const pts = [[u.x, u.y - 8]], hit = new Set()
    let cur = first, m = CHAIN.mul
    for (let i = 0; i < n && cur; i++) {
      hit.add(cur)
      pts.push([cur.x, cur.y - 4])
      const reach = cur.frozen > 0 ? hop * 2 : hop        // 凍った敵は雷をよく通す
      hurtEnemy(cur, dmgOf(u, m), u)
      cur.flash = 0.16
      spark(cur.x, cur.y - 5, 'ye3', 4, 50)
      m *= CHAIN.decay
      let next = null, nd = reach
      for (const e of S.actE) {
        if (e.hp <= 0 || hit.has(e)) continue
        const dd = Math.hypot(e.x - cur.x, e.y - cur.y)
        if (dd < nd) { nd = dd; next = e }
      }
      cur = next
    }
    if (S.fx.length < FXMAX) S.fx.push({ k: 'zap', x: 0, y: 0, vx: 0, vy: 0, t: 0, life: big ? 0.3 : 0.2, pts, big })
    if (hit.size > 2) num(first.x, first.y - first.rad - 12, `x${hit.size}`, 'ye3')
    hitFeel(big || hit.size > 3 ? CHAIN.bigStop : CHAIN.stop, big)
  }
  // ハンマーの振り下ろし: 向いている方の扇の敵に、重い一撃。大きく吹き飛ばし、予兆の最中ならよろけさせる。見た目は斬撃の弧ではなく、前の地面への衝撃
  function hammerSmash(u) {
    u.cd = SMASH.cd
    u.swingT = S.t
    const ang = Math.atan2(u.fy, u.fx), ca = Math.cos(ang), sa = Math.sin(ang)
    const impact = { k: 'impact', x: u.x + ca * 14, y: u.y + sa * 10, vx: 0, vy: 0, t: 0, life: 0.22, hit: false }   // 体の前の地面に叩きつけた衝撃
    if (S.fx.length < FXMAX) S.fx.push(impact)
    let hit = false
    for (const e of S.actE) {
      if (e.hp <= 0) continue
      const dx = e.x - u.x, dy = e.y - u.y, d = Math.hypot(dx, dy)
      if (d > SMASH.r + e.rad) continue
      if (d > e.rad && (dx * ca + dy * sa) / d < Math.cos(SMASH.half)) continue
      stagger(e, u)
      hurtEnemy(e, dmgOf(u, SMASH.mul), u)
      if (e.hp > 0) knock(e, ca, sa, SMASH.kb)
      e.flash = 0.18
      hit = true
    }
    impact.hit = hit
    spark(u.x + ca * 14, u.y + sa * 10, 'br5', 8, 55)   // 地面を打った土ぼこり
    if (hit) hitFeel(SMASH.stop, true)
    const c = nearestCage(u.x, u.y, 30)
    if (c) bashCage(u, c)
  }
  // ハンマーで地面を叩く: k（溜め 0〜1）で広がる衝撃波。範囲の敵を全員よろけさせ、外へ吹き飛ばす
  function groundSlam(u, k) {
    u.cd = SMASH.cd + 0.3
    u.swingT = S.t
    const R = SMASH.slamR + (SMASH.slamMax - SMASH.slamR) * k
    const mul = SMASH.slamMul + (SMASH.slamMulMax - SMASH.slamMul) * k, stun = SMASH.stun + (SMASH.stunMax - SMASH.stun) * k
    if (S.fx.length < FXMAX) S.fx.push({ k: 'quake', x: u.x, y: u.y, vx: 0, vy: 0, t: 0, life: 0.35, r: R })
    spark(u.x, u.y, 'br5', 16, 90)
    let hit = false
    for (const e of S.actE) {
      if (e.hp <= 0) continue
      const dx = e.x - u.x, dy = e.y - u.y, d = Math.hypot(dx, dy)
      if (d > R + e.rad * 0.6) continue
      hurtEnemy(e, dmgOf(u, mul), u)
      if (e.hp <= 0) continue
      if (!(e.kind === 'boss' && k >= 1 && bossOpening(e, u))) stunEnemy(e, e.kind === 'boss' ? stun * 0.5 : stun)   // 溜めきった地面叩きは、ボスの隙になる
      const m = d || 1
      knock(e, dx / m, dy / m, SMASH.slamKb * (1 - 0.5 * Math.min(1, d / R)))
      e.flash = 0.18
      hit = true
    }
    S.hitstop = Math.max(S.hitstop, hit ? 0.12 : 0.05)
    S.shakeT = 0.3
    S.shakeAmp = 2                                 // 地面を叩いたときだけ、大きく揺らす
  }
  // 敵を凍らせる
  function freezeEnemy(e, dur = null) {
    if (e.kind === 'boss' && S.t < (e.freezeOk ?? 0)) return   // ボスは、凍りが解けてから FREEZE.bossCool 秒は凍らない
    e.frozen = dur != null ? (e.kind === 'boss' ? dur * 0.5 : dur) : e.kind === 'boss' ? FREEZE.bossDur : FREEZE.dur
    e.tele = null
    e.kbT = 0
    ring(e.x, e.y, 'bl5', e.rad + 8, 0.3)
    spark(e.x, e.y - 5, 'white', dur != null ? 3 : 8, 60)
    if (dur == null) num(e.x, e.y - e.rad - 12, 'FREEZE', 'bl5')   // 自律の氷術師の短い凍りでは、文字は出さない
  }
  // 自動で狙う相手: 届く範囲の敵のうち、近いもの（向いている方を少し優先）。autoAim はその向き [x, y] か null
  function autoTarget(u, range = FREEZE.range) {
    let best = null, bs = Infinity
    for (const e of S.actE) {
      if (e.hp <= 0) continue
      const dx = e.x - u.x, dy = e.y - u.y, d = Math.hypot(dx, dy)
      if (d > range + e.rad || d < 0.01) continue
      const score = d * (1.6 - 0.6 * ((dx * u.fx + dy * u.fy) / d))
      if (score < bs) { bs = score; best = e }
    }
    return best
  }
  function autoAim(u, range) {
    const e = autoTarget(u, range)
    if (!e) return null
    const dx = e.x - u.x, dy = e.y - u.y, d = Math.hypot(dx, dy)
    return [dx / d, dy / d]
  }
  function faceTo(u, [x, y]) {
    const m = Math.hypot(x, y) || 1
    u.fx = x / m
    u.fy = y / m
    if (Math.abs(u.fx) > 0.1) u.face = u.fx > 0 ? 1 : -1
  }
  function updateLeader(u, dt) {
    const J = JOBS[u.job]
    const inp = S.input
    let mx = inp.mx, my = inp.my
    const mag = Math.hypot(mx, my)
    if (mag > 1) { mx /= mag; my /= mag }
    u.moving = false
    if (mag > 0.05) {
      const sp = J.speed * (u.hamCast || u.hamWind > 0 ? SMASH.slow : u.charge != null ? SHOOT.slow : u.guarding ? GUARD.slow : u.throwing ? THROW.slow : u.praying ? 0 : u.casting && S.t - u.castT > SHOOT.tap ? FREEZE.slow : u.boomCast && S.t - u.boomT > SHOOT.tap ? BOOMER.slow : u.voltCast && S.t - u.voltT > SHOOT.tap ? CHAIN.slow : 1)   // 弓を引く・盾を構える・爆弾を狙う間は遅い
      moveBody(u, mx * sp * dt, 0)
      moveBody(u, 0, my * sp * dt)
      u.moving = true
      const fl = Math.hypot(mx, my)
      u.fx = mx / fl
      u.fy = my / fl
      if (Math.abs(mx) > 0.1) u.face = mx > 0 ? 1 : -1
    }
    if (isManual(u)) {
      // 入力（main.js）: swing＝振る（剣。押した・離した瞬間）、pressed＝押した瞬間・hold＝押している間（弓）、aim＝狙う向き（無ければ自動）
      // 押したのが少し早くても、受け付けておいて、振れる・射てるようになったら動く
      if (inp.swing) { u.swingReq = S.t; inp.swing = false }
      if (inp.pressed) { u.pressReq = S.t; inp.pressed = false }
      const bow = J.kind === 'arrow'
      // 狙いの向き: ずらして狙っていればその向き。弓を引き絞っている（少し長く押した）ときは、前にずらして狙った向き（覚えておく）。
      // それ以外（軽くタップ）は、近くの敵へ自動で
      const drawing = bow && u.charge != null && u.charge > SHOOT.tap
      const dir = () => inp.aim ?? (drawing ? u.lastAim : null) ?? autoAim(u, bow ? SHOOT.range : SWING.r + 40) ?? [u.fx, u.fy]
      u.aiming = bow && (inp.hold || u.charge != null)   // 狙うのは弓だけ（剣は向いている方へ振る）
      u.aimLine = bow && (!!inp.aim || drawing)        // 狙いの線は、ずらして狙っているときと、引き絞っているときだけ
      if (u.aiming) u.aimDir = dir()
      if (J.kind === 'boomerang') {                // ブーメラン: 戻ってくるまで投げられない。ちょん押しは近くの敵の少し先まで、長押しは押した長さで遠くまで（弓と同じ射線）
        u.boomOut = S.projs.some((q) => q.kind === 'boom' && q.manual && q.by === u && q.life > 0)
        if (!u.boomCast && !u.boomOut && (inp.hold || S.t - (u.pressReq ?? -9) < 0.15)) { u.pressReq = -9; u.boomCast = true; u.boomT = S.t }
        if (u.boomCast) {
          const long = S.t - u.boomT > SHOOT.tap
          const tg = !inp.aim && !(long && u.lastAim) ? autoTarget(u, BOOMER.max) : null
          const dir = inp.aim ?? (long ? u.lastAim : null) ?? (tg ? [tg.x - u.x, tg.y - u.y].map((v, i, a) => v / Math.hypot(...a)) : [u.fx, u.fy])
          const k = long ? Math.min(1, (S.t - u.boomT - SHOOT.tap) / BOOMER.charge) : 0
          u.boomDist = long ? BOOMER.min + (BOOMER.max - BOOMER.min) * k
            : tg ? Math.min(BOOMER.max, Math.max(BOOMER.min, Math.hypot(tg.x - u.x, tg.y - u.y) + BOOMER.over)) : BOOMER.min
          u.aimLine = long
          u.aimDir = dir
          if (!inp.hold) {
            if (inp.aim) u.lastAim = inp.aim
            faceTo(u, dir)
            shoot(u, u.x + dir[0] * 100, u.y + dir[1] * 100, dmgOf(u, BOOMER.mul), { team: 'ally', speed: BOOMER.speed, life: 6, kind: 'boom', r: 7, pierce: 999, maxd: u.boomDist })
            const p = S.projs[S.projs.length - 1]
            p.manual = true
            p.loop = { sx: u.x, sy: u.y - 4, dx: dir[0], dy: dir[1], D: u.boomDist, th: 0 }   // 輪を描いて飛ぶ
            u.swingT = S.t
            u.boomCast = false
            u.aimLine = false
            inp.aim = null
          }
        }
        u.aiming = u.boomCast && S.t - u.boomT > SHOOT.tap
        return
      }
      if (J.heavy) {                               // ハンマー: ちょん押しは、ためてから振り下ろす。長押しは溜めて、離すと地面を叩く
        if (u.hamWind > 0) {                       // 振り下ろしの前のため
          u.hamWind -= dt
          if (u.hamWind <= 0) hammerSmash(u)
          return
        }
        if (!u.hamCast && u.cd <= 0 && (inp.hold || S.t - (u.pressReq ?? -9) < 0.15)) { u.pressReq = -9; u.hamCast = true; u.hamT = S.t }
        if (u.hamCast) {
          const long = S.t - u.hamT > SHOOT.tap
          u.gauge = long ? Math.min(1, (S.t - u.hamT - SHOOT.tap) / SMASH.charge) : null
          if (!inp.hold) {
            if (long) groundSlam(u, u.gauge)
            else u.hamWind = SMASH.wind
            u.hamCast = false
            u.gauge = null
          }
        }
        return
      }
      if (J.kind === 'lightning') {               // 雷術師: ちょん押しは近くの敵へ雷、長押しは射線で溜めて、離すと狙った向きの敵へ。溜まるほど連鎖が伸びる
        if (!u.voltCast && u.cd <= 0 && (inp.hold || S.t - (u.pressReq ?? -9) < 0.15)) { u.pressReq = -9; u.voltCast = true; u.voltT = S.t }
        if (u.voltCast) {
          const long = S.t - u.voltT > SHOOT.tap
          const dir = inp.aim ?? (long ? u.lastAim : null) ?? autoAim(u, CHAIN.range) ?? [u.fx, u.fy]
          const k = long ? Math.min(1, (S.t - u.voltT - SHOOT.tap) / CHAIN.charge) : 0
          u.gauge = long ? k : null
          u.aimLine = long
          u.aimDir = dir
          if (!inp.hold) {
            if (inp.aim) u.lastAim = inp.aim
            faceTo(u, dir)
            const first = long ? rayTarget(u, dir, CHAIN.range) : autoTarget(u, CHAIN.range)
            if (first) chainBolt(u, first, Math.round(CHAIN.n + (CHAIN.fullN - CHAIN.n) * k), CHAIN.hop + (CHAIN.fullHop - CHAIN.hop) * k, k >= 1)
            else num(u.x, u.y - 22, '...', 'gy5')
            u.cd = CHAIN.cd
            u.swingT = S.t
            u.voltCast = false
            u.gauge = null
            u.aimLine = false
            inp.aim = null
          }
        }
        u.aiming = u.voltCast && S.t - u.voltT > SHOOT.tap
        return
      }
      if (J.kind === 'magic') {                    // 氷術師: ちょん押しは近くの敵へ追いかけるツララ。長押しは弓と同じく射線を出して溜め、離すとその向きへ（溜まれば冷気の弾で凍らせる）
        if (!u.casting && u.cd <= 0 && (inp.hold || S.t - (u.pressReq ?? -9) < 0.15)) { u.pressReq = -9; u.casting = true; u.castT = S.t }
        if (u.casting) {
          const long = S.t - u.castT > SHOOT.tap
          const dir = inp.aim ?? (long ? u.lastAim : null) ?? autoAim(u, FREEZE.range) ?? [u.fx, u.fy]
          u.castReady = long && S.t - u.castT >= SHOOT.tap + FREEZE.charge
          u.aimLine = long
          u.aimDir = dir
          if (!inp.hold) {
            if (inp.aim) u.lastAim = inp.aim           // ずらして狙った向きを覚える
            faceTo(u, dir)
            const tx = u.x + dir[0] * 100, ty = u.y + dir[1] * 100
            if (u.castReady) shoot(u, tx, ty, 0, { team: 'ally', speed: FREEZE.boltSpeed, life: FREEZE.range / FREEZE.boltSpeed + 0.1, kind: 'frostbolt', r: 6 })
            else {
              shoot(u, tx, ty, dmgOf(u, FREEZE.icicle), { team: 'ally', speed: FREEZE.icicleSpeed, life: FREEZE.range / FREEZE.icicleSpeed + 0.2, kind: 'icicle', r: 5 })
              if (!long) S.projs[S.projs.length - 1].target = autoTarget(u)   // ちょん押しのツララは、近くの敵を追いかける
            }
            S.projs[S.projs.length - 1].manual = true
            u.cd = FREEZE.cd
            u.swingT = S.t
            u.casting = u.castReady = false
            u.aimLine = false
            inp.aim = null
          }
        }
        u.aiming = u.casting && S.t - u.castT > SHOOT.tap
        return
      }
      if (J.kind === 'heal') {                     // 僧侶: ちょん押しは癒やしの光、長押しは足元に癒やしの円（離すか max 秒で終わる）
        if (u.needRelease && !inp.hold) u.needRelease = false
        if (!u.prayPend && !u.needRelease && u.cd <= 0 && (inp.hold || S.t - (u.pressReq ?? -9) < 0.15)) { u.pressReq = -9; u.prayPend = true; u.prayT = S.t }
        if (u.prayPend) {
          const long = S.t - u.prayT > SHOOT.tap
          u.praying = long && inp.hold
          const over = S.t - u.prayT > SHOOT.tap + PRAY.max
          if (!inp.hold || over) {
            if (!long) healBolt(u)
            else u.cd = PRAY.after
            if (over) u.needRelease = true             // 押したままなら、一度離すまで次は始めない
            u.prayPend = u.praying = false
          }
        }
        if (u.praying) prayCircle(u, dt)
        u.aiming = false
        u.aimLine = false
        return
      }
      if (J.kind === 'bomb') {                     // 爆弾: 押したら狙い始め、押している間は落とす場所を狙い、離したら投げる
        if (!u.throwing && u.cd <= 0 && (inp.hold || S.t - (u.pressReq ?? -9) < 0.15)) { u.pressReq = -9; u.throwing = true; u.throwT = S.t }
        if (u.throwing) {
          const long = S.t - u.throwT > SHOOT.tap
          // 落とす場所: 指定（ずらした・マウス）、長押しなら前に狙った所（自分からの位置）、無ければ近くの敵、無ければ向いている方の少し先
          let tx, ty
          if (inp.target) [tx, ty] = [inp.target.x, inp.target.y]
          else if (long && u.lastThrow) [tx, ty] = [u.x + u.lastThrow[0], u.y + u.lastThrow[1]]
          else {
            const e = nearestEnemy(u.x, u.y, THROW.range)
            ;[tx, ty] = e ? [e.x, e.y] : [u.x + u.fx * 60, u.y + u.fy * 60]
          }
          const dx = tx - u.x, dy = ty - u.y, d = Math.hypot(dx, dy) || 1, k = Math.min(1, THROW.range / d)
          u.throwAt = [u.x + dx * k, u.y + dy * k]
          u.aimLine = long || !!inp.target
          if (!inp.hold) {
            if (inp.target) u.lastThrow = [u.throwAt[0] - u.x, u.throwAt[1] - u.y]
            faceTo(u, [dx, dy])
            S.blasts.push({ x: u.throwAt[0], y: u.throwAt[1], sx: u.x, sy: u.y - 4, r: THROW.r, dmg: dmgOf(u, THROW.mul), team: 'ally', by: u,
              t: THROW.flight + THROW.fuse, flight: THROW.flight, total: THROW.flight + THROW.fuse, kb: THROW.kb })
            u.cd = THROW.cd
            u.swingT = S.t
            u.throwing = false
            u.aimLine = false
            inp.target = null
          }
        }
        u.aiming = false
        return
      }
      if (J.taunt) {                               // 盾: 押したら構え、押している間は構えたまま、離したら盾で押す
        if (!u.guardOn && u.cd <= 0 && (inp.hold || S.t - (u.pressReq ?? -9) < 0.15)) {
          u.pressReq = -9
          u.guardOn = true
          u.guardT = S.t
          u.guardDir = inp.aim ?? autoAim(u, 90) ?? [u.fx, u.fy]   // 構える向き: ずらして狙った向き、無ければ近くの敵、無ければ向いている方
        }
        if (u.guardOn && inp.aim) u.guardDir = inp.aim
        u.guarding = u.guardOn && inp.hold
        if (u.guardOn) faceTo(u, u.guardDir)       // 構えている間は、盾の向きを向いたまま（後ろへ下がっても）
        if (u.guardOn && !inp.hold) { bash(u); u.guardOn = false; u.guarding = false; inp.aim = null }
        u.aiming = false
        u.aimLine = false
        return
      }
      if (bow) {                                   // 弓: 押したら引き始め、押している間は引き絞り、離したら射る
        if (u.charge == null && u.cd <= 0 && (inp.hold || S.t - (u.pressReq ?? -9) < 0.15)) { u.pressReq = -9; u.charge = 0 }
        if (u.charge != null) {
          if (inp.hold) u.charge += dt
          else {
            if (inp.aim) u.lastAim = inp.aim          // ずらして狙った向きを覚える（次に引き絞るときは、ここから）
            faceTo(u, dir())
            shootManual(u, u.charge)
            u.charge = null
            u.aimLine = false
            inp.aim = null
          }
        }
        return
      }
      // 剣・盗賊: 押した瞬間に、向いている方へ振る・刺す（ボタンでも Z でも）
      if (u.cd <= 0 && S.t - (u.pressReq ?? -9) < 0.15) {
        u.pressReq = -9
        if (J.backstab) stab(u)
        else swing(u)
      }
      u.swingReq = -9
      inp.aim = null
      return
    }
    inp.swing = false
    inp.pressed = false
    if (u.cd > 0) return
    if (J.kind === 'heal') { healPulse(u); return }
    const e = nearestEnemy(u.x, u.y, J.range + 2)
    if (e && (J.kind === 'bomb' || J.kind === 'melee' || J.kind === 'lightning' || clearLine(u.x, u.y, e.x, e.y))) attackWith(u, e)
    else if (!e) {
      const c = nearestCage(u.x, u.y, 28)
      if (c) { u.cd = J.cd || 0.6; bashCage(u, c) }
    }
  }

  // 予兆の範囲（円・線）に入っているとき、逃げる向き。入っていなければ null
  function dodgeDir(u) {
    let ex = 0, ey = 0, hit = false
    for (const h of S.hazardsPrev) {
      if (h.t <= 0) continue
      if (h.k === 'circle') {
        const d = Math.hypot(u.x - h.x, u.y - h.y - 4)
        if (d < h.r + 13) { hit = true; const w = 1 + Math.max(0, h.r - d) / h.r; ex += ((u.x - h.x) / (d || 1)) * w; ey += ((u.y - h.y - 4) / (d || 1)) * w }
      } else if (h.k === 'wedge') {
        const rx = u.x - h.x, ry = u.y - h.y
        const d = Math.hypot(rx, ry)
        if (d < h.len) {
          let da = Math.atan2(ry, rx) - h.ang
          while (da > Math.PI) da -= 2 * Math.PI
          while (da < -Math.PI) da += 2 * Math.PI
          if (Math.abs(da) < h.spread / 2 + 0.12 || d < 14) {
            hit = true
            const sg = da >= 0 ? 1 : -1 // 軸の脇へ逃げる
            ex += -Math.sin(h.ang) * sg * 1.5 + (rx / (d || 1)) * 0.3
            ey += Math.cos(h.ang) * sg * 1.5 + (ry / (d || 1)) * 0.3
          }
        }
      } else if (h.k === 'line' && h.w >= 10) {
        const dx = h.x2 - h.x, dy = h.y2 - h.y
        const len = Math.hypot(dx, dy) || 1
        const t = ((u.x - h.x) * dx + (u.y - h.y) * dy) / (len * len)
        if (t > -0.05 && t < 1.1) {
          const cx = h.x + dx * t, cy = h.y + dy * t
          const d = Math.hypot(u.x - cx, u.y - cy)
          if (d < h.w + 6) { hit = true; ex += ((u.x - cx) / (d || 1)) * 1.5; ey += ((u.y - cy) / (d || 1)) * 1.5 }
        }
      }
    }
    if (!hit) { u.dodgeAt = 0; return null }
    if (!u.dodgeAt) u.dodgeAt = S.t + (JOBS[u.job].backstab ? 0.05 : 0.1) + Math.random() * (JOBS[u.job].backstab ? 0.15 : 0.35)   // 盗賊は身軽（すぐ避ける） + (u.lvl < 3 ? 0.15 : 0)
    if (S.t < u.dodgeAt) return null
    if (!ex && !ey) { ex = rnd(-1, 1); ey = rnd(-1, 1) }
    return [ex, ey]
  }

  // --- 味方（自律）---
  function updateAlly(u, dt) {
    const J = JOBS[u.job]
    const L = S.leader
    u.cd -= dt
    u.flash -= dt
    u.anim += dt
    // 戦いから離れて少したつと、体力がゆっくり戻る
    if (u.hp < u.maxhp && S.t - u.hurtT > 6) u.hp = Math.min(u.maxhp, u.hp + u.maxhp * 0.02 * dt)
    if (u === L) return updateLeader(u, dt)
    const dL = Math.hypot(L.x - u.x, L.y - u.y)
    u.moving = false
    const x0 = u.x, y0 = u.y
    if (!u.active) return updateOffscreen(u, dt, dL)

    // 予兆の範囲に入っていたら、反応して外へ逃げる（反応の速さは人によって違う）
    const esc = dodgeDir(u)
    if (esc) {
      u.goal = 'dodge'
      const m0 = Math.hypot(esc[0], esc[1]) || 1
      u.moving = moveBody(u, (esc[0] / m0) * J.speed * 1.1 * dt, 0) | moveBody(u, 0, (esc[1] / m0) * J.speed * 1.1 * dt) ? true : false
      return
    }
    // 体力が減ったら、戦いから下がって回復を待つ
    if (u.hp < u.maxhp * 0.38) u.retreat = true
    else if (u.hp > u.maxhp * 0.6) u.retreat = false
    if (u.retreat) {
      let rx = 0, ry = 0, n = 0
      for (const e of S.actE) {
        const d = Math.hypot(e.x - u.x, e.y - u.y)
        if (d < 170) { rx += (u.x - e.x) / (d || 1); ry += (u.y - e.y) / (d || 1); n++ }
      }
      if (n) {
        u.goal = 'retreat'
        const lx = (L.x - u.x) / (dL || 1), ly = (L.y - u.y) / (dL || 1)
        let dx = rx / n + lx * 0.7, dy = ry / n + ly * 0.7
        const m0 = Math.hypot(dx, dy) || 1
        dx /= m0
        dy /= m0
        // ほかの人に押されて動けないときは、反発を切る
        u.moving = moveBody(u, dx * J.speed * dt, 0) | moveBody(u, 0, dy * J.speed * dt) ? true : false
        if (J.kind === 'heal') { u.healT -= dt; if (u.cd <= 0 && u.healT <= 0) { if (!healPulse(u)) u.healT = 0.35 } }
        return
      }
    }
    // 目標：近くの敵（操作キャラから離れすぎていないもの）
    let tgt = null, td = J.sight
    if (J.kind !== 'heal') {
      for (const e of S.actE) {
        if (e.hp <= 0) continue
        if (e === u.ignore && S.t < u.ignoreT) continue
        const d = Math.hypot(e.x - u.x, e.y - u.y) - (e.rad - 6)
        if (d < td && Math.hypot(e.x - L.x, e.y - L.y) < LEASH) { tgt = e; td = d }
      }
    } else {
      // 僧侶は、敵から離れる。治すのは巡回
      u.healT -= dt
      if (u.cd <= 0 && u.healT <= 0) { if (!healPulse(u)) u.healT = 0.35 }
      for (const e of S.actE) {
        if (e.hp <= 0) continue
        const d = Math.hypot(e.x - u.x, e.y - u.y)
        if (d < 80 && d < td) { tgt = e; td = d }
      }
    }

    let dirx = 0, diry = 0, speed = J.speed
    u.goal = 'idle'
    const ranged = J.range >= 60
    if (tgt && J.kind === 'heal') {
      u.goal = 'flee'
      dirx = (u.x - tgt.x) / (td || 1)
      diry = (u.y - tgt.y) / (td || 1)
      // 操作キャラの側へ逃げる
      const lx = (L.x - u.x) / (dL || 1), ly = (L.y - u.y) / (dL || 1)
      dirx += lx * 0.8
      diry += ly * 0.8
    } else if (tgt) {
      u.goal = 'hold'
      u.face = tgt.x >= u.x ? 1 : -1
      const los = J.kind === 'bomb' || clearLine(u.x, u.y, tgt.x, tgt.y)
      const near = ranged ? J.pref * 0.6 : 0
      const blocked = ranged && td <= J.range && !los
      if (td > (ranged ? J.range * 0.9 : J.range * 0.8 + 2) || blocked) {
        u.goal = 'chase'
        const st = steerTo(u, tgt.x, tgt.y)
        if (st) [dirx, diry] = st
        else { u.ignore = tgt; u.ignoreT = S.t + 3; u.goal = 'idle' }
      } else if (ranged && td < near) {
        dirx = (u.x - tgt.x) / (td || 1)
        diry = (u.y - tgt.y) / (td || 1)
        speed *= 0.9
      } else if (!ranged || J.kind !== 'bomb') {
        const s = Math.sin(u.anim * 2 + u.id)
        dirx = (-(tgt.y - u.y) / (td || 1)) * s * 0.4
        diry = ((tgt.x - u.x) / (td || 1)) * s * 0.4
      }
      if (td <= J.range + (ranged ? 0 : 4) && u.cd <= 0 && los) attackWith(u, tgt)
    } else {
      // 檻を探して壊す
      let goal = null
      if (J.kind !== 'heal') {
        const c = nearestCage(u.x, u.y, 100)
        if (c && dL < LEASH && !(c === u.ignore && S.t < u.ignoreT)) goal = c
      }
      if (goal) {
        u.goal = 'hold'
        const d = Math.hypot(goal.x - u.x, goal.y - u.y)
        if (d < 22) {
          if (u.cd <= 0) { u.cd = J.cd; bashCage(u, goal) }
        } else {
          u.goal = 'cage'
          const st = steerTo(u, goal.x, goal.y)
          if (st) [dirx, diry] = st
          else { u.ignore = goal; u.ignoreT = S.t + 4; u.goal = 'idle' }
        }
      } else if (dL > J.band[1]) {
        u.goal = 'leader'
        const st = steerTo(u, L.x, L.y) ?? flowDir(u)
        if (st) [dirx, diry] = st
        speed *= dL > J.band[1] + 80 ? 1.25 : 1
      } else {
        // 帯の中ではのんびり動く
        u.wanderT -= dt
        if (u.wanderT <= 0) {
          const a = rnd(0, 6.28)
          u.wx = Math.cos(a)
          u.wy = Math.sin(a)
          u.still = Math.random() < 0.5
          u.wanderT = rnd(1, 3)
        }
        if (!u.still) {
          const nx = u.x + u.wx * 20, ny = u.y + u.wy * 20
          const nd = Math.hypot(L.x - nx, L.y - ny)
          if (nd < J.band[1] && nd > J.band[0] * 0.6) { dirx = u.wx * 0.35; diry = u.wy * 0.35 }
        }
        if (dL < J.band[0] * 0.6) { dirx = ((u.x - L.x) / (dL || 1)) * 0.5; diry = ((u.y - L.y) / (dL || 1)) * 0.5 }
      }
    }
    let [sx, sy] = S.t < u.noSepT ? [0, 0] : separation(u)
    sx *= 0.9
    sy *= 0.9
    if ((sx < 0 && solidAt(u.x - 8, u.y)) || (sx > 0 && solidAt(u.x + 8, u.y))) sx = 0
    if ((sy < 0 && solidAt(u.x, u.y - 8)) || (sy > 0 && solidAt(u.x, u.y + 8))) sy = 0
    const sm = Math.hypot(sx, sy)
    const cap = u.goal === 'chase' || u.goal === 'cage' || u.goal === 'leader' ? 0.5 : 1
    if (sm > cap) { sx = (sx / sm) * cap; sy = (sy / sm) * cap }
    dirx += sx
    diry += sy
    let m = Math.hypot(dirx, diry)
    // 予兆の円（これから当たる範囲）の中へは、新しく入らない
    if (m > 0.02 && S.hazardsPrev.length) {
      const nx = u.x + (dirx / m) * speed * 0.25, ny = u.y + (diry / m) * speed * 0.25
      for (const h of S.hazardsPrev) {
        if (h.k !== 'circle' || h.t <= 0.05) continue
        if (Math.hypot(nx - h.x, ny - h.y - 4) < h.r + 4 && Math.hypot(u.x - h.x, u.y - h.y - 4) >= h.r + 4) { dirx = 0; diry = 0; m = 0; break }
      }
    }
    if (m > 0.02) {
      const k = Math.min(1, m)
      u.moving = moveBody(u, (dirx / m) * k * speed * dt, 0) | moveBody(u, 0, (diry / m) * k * speed * dt) ? true : false
      if (!tgt && Math.abs(dirx) > 0.1) u.face = dirx > 0 ? 1 : -1
    }
    // 向かっているのに動けない状態が続いたら、しばらく反発を切る
    if ((u.goal === 'chase' || u.goal === 'cage' || u.goal === 'leader') && Math.hypot(u.x - x0, u.y - y0) < 0.2) u.stkT += dt
    else u.stkT = 0
    if (u.stkT > 0.4) { u.noSepT = S.t + 1.2; u.stkT = 0 }
  }

  // 画面の外：戦わず、ダメージも受けない。操作キャラへ向かって走る。ひっかかったら画面のすぐ外へ瞬間移動
  function updateOffscreen(u, dt, dL) {
    const J = JOBS[u.job]
    if (dL <= J.band[1]) return
    const k = Math.floor(u.y / TILE) * MW + Math.floor(u.x / TILE)
    const fx = flow.dirX[k], fy = flow.dirY[k]
    if (flow.dist[k] < flow.INF && (fx || fy)) {
      const nx = (Math.floor(u.x / TILE) + fx) * TILE + 8, ny = (Math.floor(u.y / TILE) + fy) * TILE + 8
      const dx = nx - u.x, dy = ny - u.y
      const d = Math.hypot(dx, dy) || 1
      const sp = J.speed * 1.6 * dt
      u.moving = moveBody(u, (dx / d) * sp, 0) | moveBody(u, 0, (dy / d) * sp) ? true : false
      if (Math.abs(dx) > 1) u.face = dx > 0 ? 1 : -1
    }
    u.stuckChk -= dt
    if (u.stuckChk <= 0) {
      u.stuckChk = 0.5
      if (Math.hypot(u.x - u.lastX, u.y - u.lastY) < 6) u.stuckT += 0.5
      else u.stuckT = 0
      u.lastX = u.x
      u.lastY = u.y
    }
    if ((u.stuckT >= 2 || dL > 750) && S.tpCool <= 0) {
      if (teleportNearView(u)) { S.tpCool = 0.1; u.stuckT = 0 }
    }
  }
  function teleportNearView(u) {
    const cx = S.cam.x + VIEW_W / 2, cy = S.cam.y + VIEW_H / 2
    const base = Math.atan2(u.y - cy, u.x - cx)
    const m = 28
    for (let i = 0; i < 16; i++) {
      const a = base + (i === 0 ? 0 : rnd(-1.4, 1.4))
      const c = Math.cos(a), s = Math.sin(a)
      const t = Math.min((VIEW_W / 2 + m) / (Math.abs(c) || 1e-6), (VIEW_H / 2 + m) / (Math.abs(s) || 1e-6))
      const x = cx + c * t, y = cy + s * t
      const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE)
      if (tx < 2 || ty < 2 || tx >= MW - 2 || ty >= MH - 2) continue
      if (solidAt(x, y) || !flow.reachable(tx, ty)) continue
      u.x = x
      u.y = y
      return true
    }
    return false
  }

  // --- 敵 ---
  function stepEnemy(e, dx, dy, sp, dt) {
    const mx = dx * sp * dt
    let my = dy * sp * dt
    // 魔王城の中庭の兵は、闘技場には入ってこない
    if (e.def.tier === 6 && e.camp >= 0 && e.y + my < (CASTLE.innerY + 2) * TILE && my < 0) my = 0
    if (e.def.atk === 'flyer') {
      e.x = Math.max(24, Math.min(MW * TILE - 24, e.x + mx))
      e.y = Math.max(24, Math.min(MH * TILE - 24, e.y + my))
    } else {
      const h = Math.min(7, e.rad * 0.6)
      moveBody(e, mx, 0, h)
      moveBody(e, 0, my, h)
    }
  }
  function enemyTarget(e, range) {
    let tgt = null, td = Infinity
    for (const a of S.actA) {
      if (!a.alive) continue
      const d = Math.hypot(a.x - e.x, a.y - e.y)
      if (d > range) continue
      const w = a.guarding ? d * GUARD.taunt : JOBS[a.job].taunt ? d * 0.65 : d   // 盾は狙われやすい（構えていると、もっと）
      if (w < td) { td = w; tgt = a }
    }
    return tgt
  }
  const telegraph = (e, t) => { e.tele = t }

  function updateEnemy(e, dt) {
    const D = e.def
    e.anim += dt
    e.flash -= dt
    e.tele = null
    if (e.frozen > 0) {                            // 凍っている: 動かず、攻撃もしない（予兆も止まる）
      e.frozen -= dt
      e.tele = null
      if (e.kind === 'boss') { if (e.pstate === 'wind' || e.pstate === 'act') e.pstate = 'stun' } else if (e.state === 'wind' || e.state === 'act') e.state = 'recover'
      if (e.frozen <= 0) { spark(e.x, e.y - 5, 'bl5', 6, 40); if (e.kind === 'boss') e.freezeOk = S.t + FREEZE.bossCool }
      return
    }
    if (e.kind === 'boss') return updateBoss(e, dt)
    if (e.kbT > 0) return updateKnock(e, dt)
    if (e.state === 'stun') { // 予兆を斬られて止まっている
      e.stunT -= dt
      if (e.stunT <= 0) { e.state = 'chase'; e.cdT = Math.max(e.cdT, 0.4) }
      return
    }
    const range = e.aggro ? D.aggro * 2 : D.aggro
    const tgt = enemyTarget(e, range)
    if (!tgt) { // 見失ったら、持ち場へ戻って体力を回復する
      if (e.aggro) { e.aggro = false; e.state = 'idle'; e.path = null }
      const hd = Math.hypot(e.hx - e.x, e.hy - e.y)
      if (hd > 10) {
        const st = steerTo(e, e.hx, e.hy)
        if (st) stepEnemy(e, st[0], st[1], D.speed * 0.8, dt)
      }
      if (e.hp < e.maxhp) e.hp = Math.min(e.maxhp, e.hp + e.maxhp * 0.12 * dt)
      return
    }
    if (!e.aggro) { e.aggro = true; alertCamp(e) }
    const dx = tgt.x - e.x, dy = tgt.y - e.y
    const d = Math.hypot(dx, dy) || 1
    const ux = dx / d, uy = dy / d
    e.face = dx >= 0 ? 1 : -1
    e.cdT -= dt

    if (e.state === 'wind') {
      e.windT -= dt
      showTele(e)
      if (e.windT <= 0) resolveAttack(e, tgt)
      return
    }
    if (e.state === 'act') { // 突進中
      e.actT -= dt
      stepEnemy(e, e.dvx, e.dvy, D.dash ?? 190, dt)
      for (const a of S.actA) {
        if (a.alive && !e.hitSet.has(a) && Math.hypot(a.x - e.x, a.y - e.y) < e.rad + 6) { e.hitSet.add(a); hurtAlly(a, D.dmg, e.kind, e, e) }
      }
      if (e.actT <= 0) { e.state = 'recover'; e.cdT = D.cd }
      return
    }
    if (e.state === 'recover') {
      if (e.cdT <= 0) e.state = 'chase'
      return
    }
    e.state = 'chase'
    // 追う・距離を取る
    let mvx = 0, mvy = 0, sp = D.speed
    const startWind = () => { e.state = 'wind'; e.windT = D.wind; e.aim = { x: tgt.x, y: tgt.y, ux, uy } }
    switch (D.atk) {
      case 'melee': case 'flyer': case 'slam': {
        const reach = D.reach + e.rad * 0.3
        if (d > reach + 2) {
          if (D.atk === 'flyer') {
            e.wob += dt * 5
            mvx = ux + -uy * Math.sin(e.wob) * 0.8
            mvy = uy + ux * Math.sin(e.wob) * 0.8
          } else {
            const st = steerTo(e, tgt.x, tgt.y)
            if (st) [mvx, mvy] = st
          }
        } else if (e.cdT <= 0) startWind()
        break
      }
      case 'charge': {
        if (d > 130) { const st = steerTo(e, tgt.x, tgt.y); if (st) [mvx, mvy] = st } else if (e.cdT <= 0 && d > 18) startWind()
        else if (d <= 18) { mvx = -ux; mvy = -uy }
        break
      }
      case 'shoot': case 'fireball': case 'fan': {
        const los = clearLine(e.x, e.y, tgt.x, tgt.y)
        if (d > D.range * 0.85 || !los) { const st = steerTo(e, tgt.x, tgt.y); if (st) [mvx, mvy] = st } else if (d < D.range * 0.4) { mvx = -ux; mvy = -uy }
        if (d <= D.range && los && e.cdT <= 0) startWind()
        break
      }
    }
    const [sx, sy] = separation(e, 10)
    mvx += sx * 0.6
    mvy += sy * 0.6
    const m = Math.hypot(mvx, mvy)
    if (m > 0.02) stepEnemy(e, mvx / m, mvy / m, sp * Math.min(1, m), dt)
  }
  function showTele(e) {
    const D = e.def
    const a = e.aim
    if (D.atk === 'melee' || D.atk === 'flyer') telegraph(e, { k: 'circle', x: e.x, y: e.y, r: D.reach + 6, t: e.windT })
    else if (D.atk === 'slam') telegraph(e, { k: 'circle', x: e.x, y: e.y, r: D.reach, t: e.windT })
    else if (D.atk === 'charge') telegraph(e, { k: 'line', x: e.x, y: e.y, x2: e.x + a.ux * (D.dash ?? 190) * 0.45, y2: e.y + a.uy * (D.dash ?? 190) * 0.45, w: 12, t: e.windT })
    else if (D.atk === 'fan') telegraph(e, { k: 'wedge', x: e.x, y: e.y, ang: Math.atan2(a.uy, a.ux), spread: D.fan === 3 ? 0.5 : 0.9, len: D.range + 10, t: e.windT })
    else telegraph(e, { k: 'line', x: e.x, y: e.y, x2: e.x + a.ux * 90, y2: e.y + a.uy * 90, w: 3, t: e.windT })
    S.hazards.push({ ...e.tele, src: e })
  }
  function resolveAttack(e, tgt) {
    const D = e.def
    const a = e.aim
    e.state = 'recover'
    e.cdT = D.cd
    switch (D.atk) {
      case 'melee': case 'flyer':
        for (const al of S.actA) if (al.alive && Math.hypot(al.x - e.x, al.y - e.y) < D.reach + 6) { hurtAlly(al, D.dmg, e.kind, e, e); break }
        spark(e.x + a.ux * 8, e.y - 4 + a.uy * 8, 'rd4', 3, 30)
        break
      case 'slam':
        ring(e.x, e.y, 'br5', D.reach, 0.35)
        spark(e.x, e.y, 'br4', 10, 70)
        for (const al of S.actA) if (al.alive && Math.hypot(al.x - e.x, al.y - e.y) < D.reach + 4) hurtAlly(al, D.dmg, e.kind, e, e)
        break
      case 'charge':
        e.state = 'act'
        e.actT = 0.45
        e.dvx = a.ux
        e.dvy = a.uy
        e.hitSet = new Set()
        break
      case 'shoot':
        shoot(e, e.x + a.ux * 100, e.y + a.uy * 100, D.dmg, { team: 'enemy', speed: 150, life: (D.range + 30) / 150, kind: 'enemyArrow' })
        break
      case 'fireball':
        shoot(e, e.x + a.ux * 100, e.y + a.uy * 100, D.dmg, { team: 'enemy', speed: 90, life: (D.range + 40) / 90, kind: 'fireball', r: 7, splash: 12 })
        break
      case 'fan': {
        const base = Math.atan2(a.uy, a.ux)
        const n = D.fan, spread = n === 3 ? 0.5 : 0.9
        for (let i = 0; i < n; i++) {
          const ang = base + (n === 1 ? 0 : -spread / 2 + (spread * i) / (n - 1))
          shootAngle(e, ang, D.dmg, { team: 'enemy', speed: 105, life: (D.range + 30) / 105, kind: 'fireball', r: 5, splash: 0 })
        }
        break
      }
    }
  }

  // --- ラスボス ---
  function spawnBoss() {
    const sc = (a) => ({ ...a, dmg: Math.round(a.dmg * DIFF.bossDmg), ...(a.wind ? { wind: a.wind * DIFF.wind } : {}) })
    const D = { ...BOSS, hpBase: BOSS.hpBase * DIFF.boss, hpPerAlly: BOSS.hpPerAlly * DIFF.boss, slam: sc(BOSS.slam), fan: sc(BOSS.fan), charge: sc(BOSS.charge), rain: sc(BOSS.rain),
      shape: 'boss', atk: 'boss', xp: 3000, reach: 30, aggro: 230, wind: 0, cd: 0, dmg: 0, cost: 0 }
    const e = newEnemy('boss', world.boss.x, world.boss.y, -2, D)
    e.rad = 24
    e.pstate = 'move'
    e.alliesAtStart = 100
    e.pT = 1.5
    e.atkKind = null
    e.adds = 0
    e.lastSummon = 0
    e.enraged = false
    S.boss = e
    return e
  }
  const bossPhase = (b) => (b.hp > b.maxhp * 0.66 ? 1 : b.hp > b.maxhp * 0.33 ? 2 : 3)
  function updateBoss(b, dt) {
    const D = b.def
    if (b.breakT > 0) { b.breakT -= dt; if (b.flash <= 0 && Math.floor(S.t * 10) & 1) b.flash = 0.05 }
    const phase = bossPhase(b)
    // 闘技場の中にいる仲間だけを相手にする
    let tgt = null, td = Infinity
    for (const a of S.actA) {
      if (!a.alive || !inArena(a)) continue
      const d = Math.hypot(a.x - b.x, a.y - b.y) * (a.guarding ? GUARD.taunt : JOBS[a.job].taunt ? 0.65 : 1) * (a === S.leader ? BREAK.lead : 1)   // 操作キャラを狙いやすい
      if (d < td) { td = d; tgt = a }
    }
    if (!tgt) { b.pstate = 'move'; b.tele = null; return }
    if (!b.aggro) {
      b.aggro = true
      S.banner = 'DEMON KING'
      S.bannerT = 3
      // 体力は、戦いが始まったときの味方の人数で決まる（1人でも倒せて、大軍でも長く戦える）
      b.alliesAtStart = S.allies.length
      b.maxhp = b.hp = Math.round(D.hpBase + D.hpPerAlly * S.allies.length)
    }
    b.pT -= dt
    b.face = tgt.x >= b.x ? 1 : -1
    const dx = tgt.x - b.x, dy = tgt.y - b.y
    const d = Math.hypot(dx, dy) || 1
    const ux = dx / d, uy = dy / d
    const pf = phase === 1 ? 1 : phase === 2 ? 0.85 : 0.7
    if (b.pstate === 'move') {
      const sp = D.speed * (phase === 3 ? 1.3 : 1)
      if (d > 50) stepEnemy(b, ux, uy, sp, dt)
      if (b.pT <= 0) {
        // 技を選ぶ
        const opts = []
        if (d < 70) opts.push('slam', 'slam', 'slam')
        opts.push('fan', 'charge', 'rain')
        if (phase >= 2) { opts.push('rain'); if (b.adds < D.summon.max && S.t - b.lastSummon > 16) opts.push('summon', 'summon') }
        if (phase === 3) opts.push('fan', 'slam')
        b.atkKind = pick(opts)
        b.pstate = 'wind'
        b.aim = { x: tgt.x, y: tgt.y, ux, uy }
        // 仲間が少ないほど予兆が長い（1 人なら 1.4 倍。30 人以上で通常）
        const wmul = 1 + 0.4 * Math.max(0, 1 - b.alliesAtStart / 30)
        b.pT = { slam: D.slam.wind, fan: D.fan.wind, charge: D.charge.wind, rain: D.rain.wind, summon: 1.2 }[b.atkKind] * (phase === 3 ? 0.85 : 1) * wmul
        b.pT0 = b.pT
        if (b.atkKind === 'rain') {
          const n = D.rain.n + (phase === 3 ? 4 : 0)
          const cand = S.actA.filter((a) => a.alive && inArena(a))
          const L = S.leader
          for (let i = 0; i < n; i++) {
            const a = i < BREAK.leadRain && L?.alive && inArena(L) ? L : cand.length ? pick(cand) : tgt   // 何発かは操作キャラに
            const ang = rnd(0, 6.28), rr = rnd(0, 26)
            S.blasts.push({ x: a.x + Math.cos(ang) * rr, y: a.y + Math.sin(ang) * rr, r: D.rain.r, dmg: D.rain.dmg, team: 'enemy', by: b, t: b.pT, flight: 0, total: b.pT })
          }
        }
      }
      return
    }
    if (b.pstate === 'wind') {
      if (b.atkKind === 'slam') { b.tele = { k: 'circle', x: b.x, y: b.y, r: D.slam.r, t: b.pT }; S.hazards.push({ ...b.tele, src: b }) }
      else if (b.atkKind === 'charge') {
        b.tele = { k: 'line', x: b.x, y: b.y, x2: b.x + b.aim.ux * D.charge.speed * D.charge.dur, y2: b.y + b.aim.uy * D.charge.speed * D.charge.dur, w: 26, t: b.pT }
        S.hazards.push({ ...b.tele, src: b })
      } else if (b.atkKind === 'fan') {
        b.tele = { k: 'wedge', x: b.x, y: b.y, ang: Math.atan2(b.aim.uy, b.aim.ux), spread: D.fan.spread, len: 190, t: b.pT }
        S.hazards.push({ ...b.tele, src: b })
      }
      if (b.pT <= 0) {
        const a = b.aim
        if (b.atkKind === 'slam') {
          ring(b.x, b.y, 'br5', D.slam.r, 0.4)
          spark(b.x, b.y, 'br4', 24, 110)
          for (const al of S.actA) if (al.alive && Math.hypot(al.x - b.x, al.y - b.y) < D.slam.r + 4) hurtAlly(al, D.slam.dmg, 'boss-slam', b, b)
          b.pstate = 'recover'; b.pT = 0.9 * pf
        } else if (b.atkKind === 'fan') {
          const n = D.fan.n + (phase === 3 ? 4 : 0)
          const base = Math.atan2(a.uy, a.ux)
          for (let i = 0; i < n; i++) shootAngle(b, base - D.fan.spread / 2 + (D.fan.spread * i) / (n - 1), D.fan.dmg, { team: 'enemy', speed: D.fan.speed, life: 3, kind: 'fireball', r: 6 })
          b.pstate = 'recover'; b.pT = 0.8 * pf
        } else if (b.atkKind === 'charge') {
          b.pstate = 'act'; b.pT = D.charge.dur; b.dvx = a.ux; b.dvy = a.uy; b.hitSet = new Set()
        } else if (b.atkKind === 'rain') {
          b.pstate = 'recover'; b.pT = 0.9 * pf
        } else if (b.atkKind === 'summon') {
          for (let i = 0; i < D.summon.n && b.adds < D.summon.max; i++) {
            const g = newEnemy(D.summon.kind, b.x + rnd(-50, 50), b.y + rnd(20, 60), -2)
            g.aggro = true
            g.summoned = true
            b.adds++
          }
          b.lastSummon = S.t
          ring(b.x, b.y, 'pu3', 40, 0.5)
          b.pstate = 'recover'; b.pT = 0.8 * pf
        }
      }
      return
    }
    if (b.pstate === 'act') { // 突進
      stepEnemy(b, b.dvx, b.dvy, D.charge.speed, dt)
      for (const a of S.actA) {
        if (a.alive && !b.hitSet.has(a) && Math.hypot(a.x - b.x, a.y - b.y) < b.rad + 6) { b.hitSet.add(a); hurtAlly(a, D.charge.dmg, 'boss-charge', b, b) }
      }
      if (b.pT <= 0) { b.pstate = 'stun'; b.pT = 1.1; spark(b.x, b.y, 'ye2', 12, 60) }
      return
    }
    if (b.pstate === 'stun') { if (b.pT <= 0) { b.pstate = 'move'; b.pT = 0.6 * pf } return }
    if (b.pstate === 'recover') { if (b.pT <= 0) { b.pstate = 'move'; b.pT = (1.0 + Math.random() * 0.8) * pf } }
  }
  function bossDied(b) {
    S.state = 'win'
    S.winT = 0
    for (const e of S.enemies) if (e !== b && e.hp > 0) { e.hp = 0 }
    S.projs.length = 0
    S.blasts.length = 0
  }

  // --- 遅れて爆発するもの（爆弾・ボスの雨）---
  function updateBlasts(dt) {
    for (const bl of S.blasts) {
      bl.t -= dt
      if (bl.t <= 0) explode(bl.x, bl.y, bl.r, bl.dmg, bl.team, bl.by, bl.kb ?? 0)
      else if (bl.team === 'enemy') S.hazards.push({ k: 'circle', x: bl.x, y: bl.y, r: bl.r, t: bl.t })
    }
    S.blasts = S.blasts.filter((b) => b.t > 0)
  }

  // --- 飛び道具 ---
  function updateProjs(dt) {
    for (const p of S.projs) {
      p.life -= dt
      p.spin += dt * 14
      if (p.team === 'heal') {                     // 癒やしの光: 仲間を追いかけて、着いたら治す
        const a = p.target
        if (!a || !a.alive) { p.life = 0; continue }
        const dx = a.x - p.x, dy = a.y - 6 - p.y, d = Math.hypot(dx, dy) || 1
        const turn = Math.min(1, dt * 8)
        p.vx += ((dx / d) * PRAY.boltSpeed - p.vx) * turn
        p.vy += ((dy / d) * PRAY.boltSpeed - p.vy) * turn
        p.x += p.vx * dt
        p.y += p.vy * dt
        if (d < 7) { healAlly(a, p.amount); ring(a.x, a.y, 'gr5', 12, 0.3); spark(a.x, a.y - 6, 'gr6', 6, 40); p.life = 0 }
        continue
      }
      if (p.strong && Math.random() < 0.7) spark(p.x - p.vx * 0.03, p.y - p.vy * 0.03, Math.random() < 0.5 ? 'or2' : 'ye2', 1, 25)   // 炎の矢の火の粉
      if (p.kind === 'boom' && p.loop) {           // 自分で投げたブーメラン: 輪を描いて飛び、最後は投げた人の今いる所へ
        const by = p.by
        if (!by || !by.alive) { p.life = 0; continue }
        const L = p.loop, at = (th) => boomLoopAt(L, th, by)
        const [x0, y0] = at(L.th), [x1, y1] = at(Math.min(2 * Math.PI, L.th + 0.01))
        const step = Math.max(L.D * 0.35, Math.hypot(x1 - x0, y1 - y0) / 0.01)   // 角度あたりの道のり（手元のとがった所で 0 にならないように）
        const was = L.th
        L.th = Math.min(2 * Math.PI, L.th + (BOOMER.speed * dt) / step)
        if (was < Math.PI && L.th >= Math.PI) { p.phase = 1; p.hit.clear() }   // 奥で折り返し: 帰りでもう一度当たる
        const [nx, ny] = at(L.th)
        p.vx = (nx - p.x) / dt
        p.vy = (ny - p.y) / dt
        p.x = nx
        p.y = ny
        if (L.th >= 2 * Math.PI || (L.th > 1.6 * Math.PI && Math.hypot(by.x - p.x, by.y - 4 - p.y) < 9)) {
          p.life = 0
          spark(by.x, by.y - 6, 'ye3', 4, 30)
          ring(by.x, by.y, 'ye2', 8, 0.2)
          continue
        }
      } else if (p.kind === 'boom') {
        if (p.phase === 0) {
          p.x += p.vx * dt
          p.y += p.vy * dt
          if (Math.hypot(p.x - p.ox, p.y - p.oy) >= p.maxd || solidAt(p.x, p.y + 4)) { p.phase = 1; p.hit.clear() }
        } else {
          const by = p.by
          if (!by || !by.alive) { p.life = 0; continue }
          const dx = by.x - p.x, dy = by.y - 4 - p.y
          const d = Math.hypot(dx, dy) || 1
          if (d < 9) {                             // 手元に戻った（自分で投げたものは、受け止めた印）
            p.life = 0
            if (p.manual) { spark(by.x, by.y - 6, 'ye3', 4, 30); ring(by.x, by.y, 'ye2', 8, 0.2) }
            continue
          }
          const back = p.manual ? BOOMER.back : 190
          p.x += (dx / d) * back * dt
          p.y += (dy / d) * back * dt
        }
      } else {
        if (p.target && p.target.hp > 0 && (p.kind === 'frostbolt' || p.kind === 'icicle')) {   // 氷術師の弾: 狙った敵を追いかける
          const dx = p.target.x - p.x, dy = p.target.y - 6 - p.y, d = Math.hypot(dx, dy) || 1, sp = Math.hypot(p.vx, p.vy), turn = Math.min(1, dt * 10)
          p.vx += ((dx / d) * sp - p.vx) * turn
          p.vy += ((dy / d) * sp - p.vy) * turn
        }
        p.x += p.vx * dt
        p.y += p.vy * dt
        if (solidAt(p.x, p.y + 4)) {
          if (p.kind === 'magic') explode(p.x, p.y, p.splash, p.dmg, 'ally', p.by)
          else if (p.kind === 'fireball' && p.splash) explode(p.x, p.y, p.splash, p.dmg, p.team, p.by)
          else spark(p.x, p.y, 'gy4', 2, 20)
          p.life = 0
          continue
        }
      }
      if (p.team === 'ally') {
        for (const e of S.actE) {
          if (e.hp <= 0 || p.hit.has(e)) continue
          if (Math.hypot(e.x - p.x, e.y - 4 - p.y) < p.r + e.rad) {
            p.hit.add(e)
            if (p.kind === 'magic') {                  // 自律の氷術師の玉: 直撃した敵を短く凍らせ（仲間が砕ける）、まわりにも当たる
              if (p.by?.job === 'ice' && e.hp > 0 && e.kind !== 'boss') freezeEnemy(e, FREEZE.autoDur)   // ボスは、操作キャラの冷気でだけ凍る
              explode(p.x, p.y, p.splash, p.dmg, 'ally', p.by); p.life = 0; break
            }
            if (p.kind === 'frostbolt') { freezeEnemy(e); if (e.frozen > 0) bossOpening(e, p.by); hitFeel(FREEZE.stop, false); p.life = 0; break }   // 冷気の弾: 当たった敵を凍らせる
            if (p.strong && e.kind === 'boss' && e.pstate === 'wind') bossOpening(e, p.by)   // 予兆の最中のボスに、引き絞った矢
            hurtEnemy(e, p.dmg, p.by, !!p.strong)      // 引き絞った矢は、硬い敵にも通る
            if (p.manual) {                            // 自分で射た矢: 短いヒットストップと、矢の向きへのノックバック
              const v = Math.hypot(p.vx, p.vy) || 1
              const mv = p.kind === 'boom' && p.phase === 1 ? [p.by.x - p.x, p.by.y - p.y] : [p.vx, p.vy], mm = Math.hypot(...mv) || 1   // ブーメランの帰りは、戻る向きへ
              if (e.hp > 0) knock(e, mv[0] / mm, mv[1] / mm, p.kind === 'boom' ? BOOMER.kb : p.strong ? SHOOT.strongKb : SHOOT.kb)
              hitFeel(p.strong ? SHOOT.strongStop : SHOOT.stop, p.strong && e.hp <= 0)
              e.flash = 0.16
            }
            if (p.pierce-- <= 0) { p.life = 0; break }
          }
        }
        if (p.life <= 0 && p.kind === 'magic' && p.hit.size === 0) explode(p.x, p.y, p.splash, p.dmg, 'ally', p.by)
      } else {
        for (const a of S.actA) {
          if (!a.alive) continue
          if (Math.hypot(a.x - p.x, a.y - 4 - p.y) < p.r + 4) {
            // 盾で正面から受けた弾: ジャストなら撃った敵へ跳ね返す、ふつうは止める（少しだけ食らう）
            const from = { x: p.x - p.vx * 0.1, y: p.y - p.vy * 0.1 }
            const g = guardOf(a, from.x, from.y)
            if (g === 'just') { deflectProj(p, a); justGuard(a, null); break }
            if (g === 'block') { hurtAlly(a, p.dmg * GUARD.chip, p.by && p.by.kind); spark(p.x, p.y, 'gy6', 4, 40); p.life = 0; break }
            if (p.splash) explode(p.x, p.y, p.splash, p.dmg, 'enemy', p.by)
            else hurtAlly(a, p.dmg, p.by && (p.by.kind === 'boss' ? 'boss-fan' : p.by.kind))
            p.life = 0
            break
          }
        }
      }
    }
    S.projs = S.projs.filter((p) => p.life > 0)
  }

  // --- 操作の切り替え ---
  function switchTo(u) {
    if (!u || !u.alive || u === S.leader) return false
    if (S.leader) { S.leader.charge = null; S.leader.aiming = false; S.leader.guardOn = S.leader.guarding = false; S.leader.throwing = false; S.leader.prayPend = S.leader.praying = false; S.leader.casting = false; S.leader.boomCast = false; S.leader.voltCast = false; S.leader.gauge = null; S.leader.hamCast = false; S.leader.hamWind = 0 }   // 引いていた弓・構えていた盾・狙いは、切り替えたらやめる
    S.leader = u
    S.flowKey = -1
    ring(u.x, u.y, 'white', 16, 0.3)
    updateCamera()
    return true
  }
  function cycle(dir) {
    const list = S.allies.filter((a) => a.alive)
    if (list.length < 2) return
    const i = list.indexOf(S.leader)
    switchTo(list[(i + dir + list.length) % list.length])
  }
  function tapAt(wx, wy, radius = 14) {
    let best = null, bd = radius
    for (const a of S.allies) {
      if (!a.alive || a === S.leader || !a.active) continue
      const d = Math.hypot(a.x - wx, a.y - 4 - wy)
      if (d < bd) { bd = d; best = a }
    }
    return best ? switchTo(best) : false
  }
  // カメラ: camF はドットより細かい位置、cam はその整数の部分（世界はここから描き、半端な分は main.js が画面ごとずらしてなめらかに見せる）
  // 職を替える（試し場の切り替え用）。体力は新しい職の満タンに
  function setJob(u, job) {
    if (!JOBS[job]) return
    u.job = job
    u.maxhp = u.hp = Math.round(JOBS[job].hp * lvMul(u.lvl))
    u.charge = null
    u.aiming = u.aimLine = false
    u.guardOn = u.guarding = false
    u.throwing = false
    u.prayPend = u.praying = false
    u.casting = false
    u.boomCast = false
    u.voltCast = false
    u.hamCast = false
    u.hamWind = 0
    u.gauge = null
    u.cd = 0
    ring(u.x, u.y, 'white', 16, 0.3)
  }
  function updateCamera() {
    const L = S.leader
    S.camF.x = Math.max(0, Math.min(MW * TILE - VIEW_W, L.x - VIEW_W / 2))
    S.camF.y = Math.max(0, Math.min(MH * TILE - VIEW_H, L.y - VIEW_H / 2))
    if (S.shakeT > 0) { const a = S.shakeAmp ?? SWING.shake; S.camF.x += Math.round(rnd(-1, 1) * a); S.camF.y += Math.round(rnd(-1, 1) * a) }
    else S.shakeAmp = 0
    S.cam.x = Math.floor(S.camF.x)
    S.cam.y = Math.floor(S.camF.y)
  }
  function reveal(tx, ty, r) {
    for (let y = Math.max(0, ty - r); y <= Math.min(MH - 1, ty + r); y++) {
      for (let x = Math.max(0, tx - r); x <= Math.min(MW - 1, tx + r); x++) {
        if ((x - tx) ** 2 + (y - ty) ** 2 <= r * r) S.seen[y * MW + x] = 1
      }
    }
  }
  function refreshFlow() {
    const L = S.leader
    const tx = Math.max(0, Math.min(MW - 1, Math.floor(L.x / TILE))), ty = Math.max(0, Math.min(MH - 1, Math.floor(L.y / TILE)))
    const key = ty * MW + tx
    if (key !== S.flowKey) {
      S.flowKey = key
      flow.compute(tx, ty)
      reveal(tx, ty, 13)
    }
  }

  function step(dt) {
    dt = Math.min(dt, 0.05)
    S.t += dt
    if (S.state === 'win') {
      S.winT += dt
      for (const f of S.fx) { f.t += dt; f.x += f.vx * dt; f.y += f.vy * dt; if (f.k === 'spark') f.vy += 120 * dt }
      S.fx = S.fx.filter((f) => f.t < f.life)
      if (S.winT < 2.5 && Math.random() < 0.5 && S.boss) spark(S.boss.x + rnd(-30, 30), S.boss.y + rnd(-30, 20), pick(['ye2', 'or2', 'white', 'rd3']), 6, 100)
      return
    }
    if (S.state !== 'play') return
    // ヒットストップ：当たった瞬間、少しだけ全部を止める
    if (S.hitstop > 0) { S.hitstop -= dt; return }
    S.shakeT -= dt
    S.tpCool -= dt
    if (playground) playground.step(dt)
    else updateRespawns(dt)
    if (S.bannerT > 0) { S.bannerT -= dt; if (S.bannerT <= 0) S.banner = null }
    updateCamera()
    refreshFlow()
    // ボス戦中は、闘技場の中ならカメラの外でも動く
    const b = S.boss
    if (b && b.hp > 0 && b.aggro && S.allies.some((a) => a.alive && inArena(a))) S.bossFightT = 1.5
    S.bossFightT -= dt
    S.bossFight = S.bossFightT > 0
    S.actA = []
    S.actE = []
    for (const a of S.allies) {
      a.active = onScreen(a) || (S.bossFight && inArena(a))
      if (a.active && a.alive) S.actA.push(a)
    }
    for (const e of S.enemies) {
      e.active = e.hp > 0 && (onScreen(e) || (S.bossFight && inArena(e)))
      if (e.active) S.actE.push(e)
    }
    S.hazardsPrev = S.hazards
    S.hazards = []
    buildBodies()
    for (const a of S.allies) if (a.alive) updateAlly(a, dt)
    if (MANUAL) for (const a of S.actA) if (a.alive) pushBodies(a)   // 仲間と敵の、硬い当たり（ボットと check.mjs では入れない）
    for (const e of S.actE) if (e.hp > 0) updateEnemy(e, dt)
    for (const c of S.cages) c.flash -= dt
    updateBlasts(dt)
    updateProjs(dt)
    for (const f of S.fx) {
      f.t += dt
      f.x += f.vx * dt
      f.y += f.vy * dt
      if (f.k === 'spark') f.vy += 120 * dt
    }
    S.fx = S.fx.filter((f) => f.t < f.life)
    if (b) b.adds = S.enemies.filter((e) => e.summoned && e.hp > 0).length
    S.enemies = S.enemies.filter((e) => e.hp > 0 || e === S.boss)
    // 倒れた操作キャラは、いちばん近い仲間（戦える職を優先）に引き継ぐ
    if (!S.leader.alive) {
      let best = null, bd = Infinity
      for (const a of S.allies) {
        if (!a.alive) continue
        const d = Math.hypot(a.x - S.leader.x, a.y - S.leader.y) + (JOBS[a.job].kind === 'heal' ? 400 : 0)
        if (d < bd) { bd = d; best = a }
      }
      S.allies = S.allies.filter((a) => a.alive || a === S.leader)
      if (best) { S.leader = best; S.flowKey = -1; ring(best.x, best.y, 'white', 16, 0.3) }
      else { S.state = 'over'; return }
    }
    S.allies = S.allies.filter((a) => a.alive)
  }

  // --- 初期配置 ---
  // 配役：最初の地域は職をまんべんなく、あとはシャッフル
  const jobs = []
  for (const j of JOB_LIST) for (let i = 0; i < JOB_COUNTS[j]; i++) jobs.push(j)
  for (let i = jobs.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [jobs[i], jobs[j]] = [jobs[j], jobs[i]] }
  // 開始地点にいちばん近い 4 つの檻は、頑丈な職にする（最初の数人が倒れてすぐ終わらないように）
  {
    const order = world.spots.map((sp, i) => [Math.hypot(sp.tx - world.start.x / TILE, sp.ty - world.start.y / TILE), i]).sort((a, b) => a[0] - b[0]).slice(0, 4).map((p) => p[1])
    ;['shield', 'bow', 'heal', 'sword'].forEach((j, k) => {
      const from = jobs.findIndex((x, idx) => x === j && !order.includes(idx))
      const to = order[k]
      if (from >= 0) { jobs[from] = jobs[to]; jobs[to] = j }
    })
  }
  const names = [...NAMES]                         // 捕虜の名前: 重ならないように、まぜてから順に配る
  for (let i = names.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [names[i], names[j]] = [names[j], names[i]] }
  world.spots.forEach((sp, i) => {
    S.cages.push({
      id: i, tx: sp.tx, ty: sp.ty, x: sp.tx * TILE + 8, y: sp.ty * TILE + 8, hp: 10, maxhp: 10, flash: 0, opened: false,
      job: jobs[i], name: names[i] ?? `ALLY${i + 1}`, region: sp.region,
    })
  })
  S.total = S.cages.length
  S.camps = world.camps
  world.enemies.forEach((en, i) => { const e = newEnemy(en.kind, en.x, en.y, en.camp); e.idx = i })
  spawnBoss()
  S.leader = newAlly(opts.hero ?? 'sword', world.start.x, world.start.y) // 主人公の職（試し場で変えられる）
  S.leader.name = 'HERO'
  updateCamera()
  refreshFlow()

  // --- 試し場（createSim({ test: true })）：開始地点のまわりに、いろいろな敵を並べる ---
  // 強さは地域の倍率をかけない素の値。倒されたら、しばらくして同じ場所に出直す。誰も倒れない
  // 味方 99 人（本番と同じ職の人数）を連れて始まり、画面のふちから敵が湧き続ける
  const playground = FIELD ? makePlayground() : opts.test === 'boss' ? makeBossTest() : null
  // ボス戦の試し（createSim({ test: 'boss', testLv })）: 全員助けた（99 人）レベル testLv の仲間で、闘技場の前から始める。
  // 魔王城の兵はいない。ふつうに倒れる（全員倒れたらやり直し）
  function makeBossTest() {
    const LV = opts.testLv ?? 13
    const L = S.leader
    L.x = 167 * TILE + 8; L.y = 36 * TILE
    for (const c of S.cages) { c.opened = true; tiles[c.ty * MW + c.tx] = T.PATH }
    S.rescued = S.total
    const fresh = (u) => { u.lvl = LV; u.xp = 0; u.maxhp = Math.round(JOBS[u.job].hp * lvMul(LV)); u.hp = u.maxhp }
    fresh(L)
    const pool = jobs.map((j, i) => [j, names[i]])
    for (const [j, name] of pool) {
      for (let tries = 0; tries < 40; tries++) {
        const x = L.x + rnd(-90, 90), y = L.y + rnd(0, 70)
        if (!boxBlocked(x, y, 5)) { const u = newAlly(j, x, y, LV); u.name = name ?? u.name; fresh(u); break }
      }
    }
    for (const e of S.enemies) if (e !== S.boss) e.hp = 0
    S.enemies = S.enemies.filter((e) => e === S.boss)
    S.deadIdx = new Set()
    updateCamera()
    refreshFlow()
    return { step() {} }
  }
  function makePlayground() {
    const KINDS = ['slime', 'bat', 'goblin', 'boar', 'wolf', 'shaman', 'treant', 'scorpion', 'mummy', 'frostarcher', 'yeti', 'golem', 'knight', 'darkmage']
    const base = (k) => {
      const D = ENEMIES[k]
      // 気づく距離を短くして、近づいた相手から一体ずつ戦えるようにする
      return { ...D, hp: Math.round(D.hp / HP_MUL[D.tier]), dmg: Math.round(D.dmg / DMG_MUL[D.tier]), aggro: 60 }
    }
    const L = S.leader
    // 味方: 本番と同じ職の人数で 99 人、開始地点のまわりに（試し場では誰も倒れない）
    for (const j of JOB_LIST) for (let i = 0; i < JOB_COUNTS[j]; i++) {
      for (let tries = 0; tries < 30; tries++) {
        const x = L.x + rnd(-70, 70), y = L.y + rnd(-50, 50)
        if (!boxBlocked(x, y, 5)) { newAlly(j, x, y); break }
      }
    }
    for (const e of S.enemies) if (e !== S.boss && Math.hypot(e.x - L.x, e.y - L.y) < 500) e.hp = 0
    S.enemies = S.enemies.filter((e) => e.hp > 0 || e === S.boss)
    const slots = []
    KINDS.forEach((k, i) => {
      // 壁や水で置けなければ、少し近づけたり、向きをずらしたりして探す
      found: for (const da of [0, 0.15, -0.15, 0.3, -0.3, 0.45, -0.45]) {
        const a = ((i + da) / KINDS.length) * Math.PI * 2
        for (let r = 140; r > 50; r -= 6) {
          const x = L.x + Math.cos(a) * r, y = L.y + Math.sin(a) * r * 0.8
          if (!boxBlocked(x, y, 8)) { slots.push({ k, x, y, def: base(k), e: null, wait: 0 }); break found }
        }
      }
    })
    // 湧き続ける敵: 画面のふちから、全地域の敵（素の強さ）が攻めてくる。湧いた敵が WAVE_MAX を超えないように、WAVE_EVERY 秒ごとに 1 体
    const ALL = Object.keys(ENEMIES).filter((k) => k !== 'imp')
    const WAVE_MAX = 40, WAVE_EVERY = 0.5
    const wave = []
    let waveT = 2
    const spawnWave = () => {
      const k = pick(ALL), D = { ...base(k), aggro: 400 }
      for (let tries = 0; tries < 12; tries++) {
        const side = (Math.random() * 4) | 0, u = Math.random()
        const x = S.cam.x + (side === 0 ? 10 : side === 1 ? VIEW_W - 10 : u * VIEW_W), y = S.cam.y + (side === 2 ? 14 : side === 3 ? VIEW_H - 10 : u * VIEW_H)
        if (boxBlocked(x, y, 8) || !flow.reachable(Math.floor(x / TILE), Math.floor(y / TILE))) continue
        const e = newEnemy(k, x, y, -9, D)
        e.aggro = true
        wave.push(e)
        return
      }
    }
    return {
      step(dt) {
        L.hp = Math.max(L.hp, 1)
        waveT -= dt
        if (waveT <= 0) {
          waveT = WAVE_EVERY
          for (let i = wave.length - 1; i >= 0; i--) if (wave[i].hp <= 0) wave.splice(i, 1)
          if (wave.length < WAVE_MAX) spawnWave()
        }
        for (const sl of slots) {
          if (sl.e && sl.e.hp > 0) continue
          sl.wait -= dt
          if (sl.wait > 0) continue
          sl.e = newEnemy(sl.k, sl.x, sl.y, -9, sl.def)
          sl.wait = 4
        }
      },
    }
  }

  // --- セーブ・ロード（戦いの最中は保存しない）---
  const b64 = (arr) => { let str = ''; for (let i = 0; i < arr.length; i += 8192) str += String.fromCharCode(...arr.subarray(i, i + 8192)); return btoa(str) }
  const unb64 = (str) => { const bin = atob(str); const out = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i); return out }
  function serialize() {
    return {
      v: 1, seed: world.seed, diff: opts.diff ?? 'normal', t: S.t, rescued: S.rescued, lost: S.lost, kills: S.kills,
      leader: S.allies.indexOf(S.leader),
      allies: S.allies.map((a) => ({ job: a.job, x: Math.round(a.x), y: Math.round(a.y), lvl: a.lvl, xp: +a.xp.toFixed(2), hp: Math.round(a.hp), name: a.name })),
      cages: S.cages.map((c) => ({ o: c.opened ? 1 : 0, job: c.job, name: c.name })),
      dead: [...S.deadIdx],
      fallen: S.deaths.map((d) => ({ job: d.job, lvl: d.lvl, name: d.name })),   // 倒れた仲間（ポーズの一覧に出す）
      seen: b64(S.seen),
    }
  }
  function restore(d) {
    S.t = d.t
    S.rescued = d.rescued
    S.lost = d.lost
    S.kills = d.kills
    d.cages.forEach((c, i) => {
      const cg = S.cages[i]
      cg.job = JOBS[c.job] ? c.job : 'sword'; cg.name = c.name
      if (c.o) { cg.opened = true; tiles[cg.ty * MW + cg.tx] = T.PATH }
    })
    S.allies = []
    for (const a of d.allies) {
      const u = newAlly(JOBS[a.job] ? a.job : 'sword', a.x, a.y, a.lvl)   // なくなった職（槍・弩・斧）は剣士に
      Object.assign(u, { xp: a.xp, hp: a.hp, name: a.name })
      u.maxhp = Math.round(JOBS[u.job].hp * lvMul(a.lvl))
    }
    S.leader = S.allies[Math.max(0, d.leader)]
    const dead = new Set(d.dead)
    S.deadIdx = new Set(d.dead)
    S.deaths = (d.fallen ?? []).filter((f) => JOBS[f.job])
    S.respawns = []
    for (const i of S.deadIdx) queueRespawn(i)
    for (const e of S.enemies) if (e.idx !== undefined && dead.has(e.idx)) e.hp = 0
    S.enemies = S.enemies.filter((e) => e.hp > 0 || e === S.boss)
    S.seen = unb64(d.seen)
    S.flowKey = -1
    S.state = 'play'
    updateCamera()
    refreshFlow()
  }
  // 保存してよい状態か（戦いの最中でない）
  const canSave = () => {
    if (S.state !== 'play' || S.bossFight || S.boss.aggro) return false
    for (const e of S.actE) if (e.aggro && e.hp > 0) return false
    return true
  }

  Object.assign(S, {
    bossOpening, serialize, restore, canSave, spawnEnemy: (k, x, y) => { const e = newEnemy(k, x, y, -9); e.active = true; return e },
    step, switchTo, cycle, tapAt, newAlly, isManual, setJob, boomLoopAt, diff: opts.diff ?? 'normal', openCage, boxBlocked, teleportNearView, inArena, healPulse,
    bossPhase: () => (S.boss ? bossPhase(S.boss) : 0), nearestCage,
  })
  return S
}
