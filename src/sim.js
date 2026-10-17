// ゲームの中身。描画は持たない（Node でも動く）
import { TILE, MW, MH, T, B, solidTile, generateWorld, createFlow, CASTLE } from './world.js'
import {
  JOBS, JOB_LIST, JOB_COUNTS, ENEMIES, BOSS, MAX_LV, xpNeed, lvMul, SYLLABLES, CLOTHES, HAIRS,
} from './data.js'

export const VIEW_W = 320
export const VIEW_H = 240
export { JOBS, JOB_LIST, ENEMIES, BOSS, MAX_LV, xpNeed, lvMul }

const LEASH = 230 // 操作キャラからこれ以上離れた敵は追わない
const rnd = (a, b) => a + Math.random() * (b - a)
const pick = (arr) => arr[(Math.random() * arr.length) | 0]
const RAD = { blob: 7, bat: 6, human: 6, beast: 8, heavy: 13 }

export function createSim(opts = {}) {
  const world = generateWorld(opts.seed ?? 7)
  const flow = createFlow(world)
  const tiles = world.tiles
  const S = {
    world, flow, t: 0, state: 'play', winT: 0,
    allies: [], enemies: [], cages: [], camps: [], projs: [], blasts: [], fx: [], hazards: [],
    actA: [], actE: [], leader: null, cam: { x: 0, y: 0 }, input: { mx: 0, my: 0 },
    nextId: 1, rescued: 0, total: 0, lost: 0, kills: 0, tpCool: 0, banner: null, bannerT: 0,
    flowKey: -1, boss: null, bossFight: false, bossFightT: 0, hazardsPrev: [], hitLog: null,
    seen: new Uint8Array(MW * MH), deaths: [], deadIdx: new Set(),
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
      cloth: pick(CLOTHES), hair: pick(HAIRS), name: pick(SYLLABLES) + pick(SYLLABLES), anim: rnd(0, 4),
    }
    u.hp = u.maxhp
    S.allies.push(u)
    return u
  }
  function newEnemy(kind, x, y, camp, def) {
    const D = def ?? ENEMIES[kind]
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
  function hurtAlly(u, dmg, by) {
    if (!u.alive) return
    dmg = Math.max(1, Math.round(dmg))
    u.hp -= dmg
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
  function hurtEnemy(e, dmg, by) {
    if (e.hp <= 0) return
    if (e.kind === 'boss' && e.pstate === 'stun') dmg *= 1.25
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
    if (e.idx !== undefined) S.deadIdx.add(e.idx)
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
  function explode(x, y, r, dmg, team, by) {
    ring(x, y, team === 'ally' ? 'or2' : 'rd3', r, 0.3)
    spark(x, y, team === 'ally' ? 'ye2' : 'rd4', 10, 70)
    if (team === 'ally') {
      for (const e of S.actE) {
        if (e.hp > 0 && Math.hypot(e.x - x, e.y - y) < r + e.rad * 0.6) hurtEnemy(e, dmg, by)
      }
    } else {
      for (const a of S.actA) {
        if (a.alive && Math.hypot(a.x - x, a.y - y) < r + 4) hurtAlly(a, dmg, by && by.kind)
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
        hurtEnemy(tgt, dmg, u)
        spark((u.x + tgt.x) / 2, (u.y + tgt.y) / 2 - 4, 'gy6', 2, 30)
        break
      case 'pierce': { // 前の2体を突く
        const hits = []
        for (const e of S.actE) {
          if (e.hp <= 0) continue
          const rx = e.x - u.x, ry = e.y - u.y
          const along = rx * u.fx + ry * u.fy
          const side = Math.abs(rx * -u.fy + ry * u.fx)
          if (along > -4 && along < J.range + e.rad && side < 8 + e.rad * 0.6) hits.push([along, e])
        }
        hits.sort((a, b) => a[0] - b[0])
        for (const [, e] of hits.slice(0, 2)) hurtEnemy(e, dmg, u)
        for (let i = 6; i < J.range; i += 4) spark(u.x + u.fx * i, u.y - 4 + u.fy * i, 'gy6', 1, 6)
        break
      }
      case 'arrow': shoot(u, tgt.x, tgt.y, dmg, { team: 'ally', speed: 210, life: J.range / 210 + 0.15, kind: 'arrow' }); break
      case 'bolt': shoot(u, tgt.x, tgt.y, dmg, { team: 'ally', speed: 320, life: J.range / 320 + 0.15, kind: 'bolt', r: 5 }); break
      case 'axe': shoot(u, tgt.x, tgt.y, dmg, { team: 'ally', speed: 150, life: J.range / 150 + 0.2, kind: 'axe', r: 6 }); break
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

  // --- 檻 ---
  function openCage(c) {
    if (c.opened) return
    c.opened = true
    tiles[c.ty * MW + c.tx] = T.PATH
    const avg = S.allies.length ? S.allies.reduce((s, a) => s + a.lvl, 0) / S.allies.length : 1
    const u = newAlly(c.job, c.x, c.y, Math.max(1, Math.floor(avg * 0.6)))
    u.cloth = c.cloth
    u.hair = c.hair
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
  function bashCage(u, c) {
    c.hp -= Math.max(2, JOBS[u.job].atk) * lvMul(u.lvl)
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
  function updateLeader(u, dt) {
    const J = JOBS[u.job]
    const inp = S.input
    let mx = inp.mx, my = inp.my
    const mag = Math.hypot(mx, my)
    if (mag > 1) { mx /= mag; my /= mag }
    u.moving = false
    if (mag > 0.05) {
      moveBody(u, mx * J.speed * dt, 0)
      moveBody(u, 0, my * J.speed * dt)
      u.moving = true
      const fl = Math.hypot(mx, my)
      u.fx = mx / fl
      u.fy = my / fl
      if (Math.abs(mx) > 0.1) u.face = mx > 0 ? 1 : -1
    }
    if (u.cd > 0) return
    if (J.kind === 'heal') { healPulse(u); return }
    const e = nearestEnemy(u.x, u.y, J.range + 2)
    if (e && (J.kind === 'bomb' || J.kind === 'melee' || J.kind === 'pierce' || J.kind === 'lightning' || clearLine(u.x, u.y, e.x, e.y))) attackWith(u, e)
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
    if (!u.dodgeAt) u.dodgeAt = S.t + 0.1 + Math.random() * 0.35 + (u.lvl < 3 ? 0.15 : 0)
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
      const w = JOBS[a.job].taunt ? d * 0.65 : d
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
    if (e.kind === 'boss') return updateBoss(e, dt)
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
        if (a.alive && !e.hitSet.has(a) && Math.hypot(a.x - e.x, a.y - e.y) < e.rad + 6) { e.hitSet.add(a); hurtAlly(a, D.dmg, e.kind) }
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
        for (const al of S.actA) if (al.alive && Math.hypot(al.x - e.x, al.y - e.y) < D.reach + 6) { hurtAlly(al, D.dmg, e.kind); break }
        spark(e.x + a.ux * 8, e.y - 4 + a.uy * 8, 'rd4', 3, 30)
        break
      case 'slam':
        ring(e.x, e.y, 'br5', D.reach, 0.35)
        spark(e.x, e.y, 'br4', 10, 70)
        for (const al of S.actA) if (al.alive && Math.hypot(al.x - e.x, al.y - e.y) < D.reach + 4) hurtAlly(al, D.dmg, e.kind)
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
    const D = { ...BOSS, shape: 'boss', atk: 'boss', xp: 3000, reach: 30, aggro: 230, wind: 0, cd: 0, dmg: 0, cost: 0 }
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
    const phase = bossPhase(b)
    // 闘技場の中にいる仲間だけを相手にする
    let tgt = null, td = Infinity
    for (const a of S.actA) {
      if (!a.alive || !inArena(a)) continue
      const d = Math.hypot(a.x - b.x, a.y - b.y) * (JOBS[a.job].taunt ? 0.65 : 1)
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
          for (let i = 0; i < n; i++) {
            const a = cand.length ? pick(cand) : tgt
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
          for (const al of S.actA) if (al.alive && Math.hypot(al.x - b.x, al.y - b.y) < D.slam.r + 4) hurtAlly(al, D.slam.dmg, 'boss-slam')
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
        if (a.alive && !b.hitSet.has(a) && Math.hypot(a.x - b.x, a.y - b.y) < b.rad + 6) { b.hitSet.add(a); hurtAlly(a, D.charge.dmg, 'boss-charge') }
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
      if (bl.t <= 0) explode(bl.x, bl.y, bl.r, bl.dmg, bl.team, bl.by)
      else if (bl.team === 'enemy') S.hazards.push({ k: 'circle', x: bl.x, y: bl.y, r: bl.r, t: bl.t })
    }
    S.blasts = S.blasts.filter((b) => b.t > 0)
  }

  // --- 飛び道具 ---
  function updateProjs(dt) {
    for (const p of S.projs) {
      p.life -= dt
      p.spin += dt * 14
      if (p.kind === 'boom') {
        if (p.phase === 0) {
          p.x += p.vx * dt
          p.y += p.vy * dt
          if (Math.hypot(p.x - p.ox, p.y - p.oy) >= p.maxd || solidAt(p.x, p.y + 4)) { p.phase = 1; p.hit.clear() }
        } else {
          const by = p.by
          if (!by || !by.alive) { p.life = 0; continue }
          const dx = by.x - p.x, dy = by.y - 4 - p.y
          const d = Math.hypot(dx, dy) || 1
          if (d < 9) { p.life = 0; continue }
          p.x += (dx / d) * 190 * dt
          p.y += (dy / d) * 190 * dt
        }
      } else {
        p.x += p.vx * dt
        p.y += p.vy * dt
        if (solidAt(p.x, p.y + 4)) {
          if (p.kind === 'magic') explode(p.x, p.y, p.splash, p.dmg, 'ally', p.by)
          else if (p.kind === 'fireball' && p.splash) explode(p.x, p.y, p.splash, p.dmg, 'enemy', p.by)
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
            if (p.kind === 'magic') { explode(p.x, p.y, p.splash, p.dmg, 'ally', p.by); p.life = 0; break }
            hurtEnemy(e, p.dmg, p.by)
            if (p.pierce-- <= 0) { p.life = 0; break }
          }
        }
        if (p.life <= 0 && p.kind === 'magic' && p.hit.size === 0) explode(p.x, p.y, p.splash, p.dmg, 'ally', p.by)
      } else {
        for (const a of S.actA) {
          if (!a.alive) continue
          if (Math.hypot(a.x - p.x, a.y - 4 - p.y) < p.r + 4) {
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
  function updateCamera() {
    const L = S.leader
    S.cam.x = Math.round(Math.max(0, Math.min(MW * TILE - VIEW_W, L.x - VIEW_W / 2)))
    S.cam.y = Math.round(Math.max(0, Math.min(MH * TILE - VIEW_H, L.y - VIEW_H / 2)))
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
    S.tpCool -= dt
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
    ;['shield', 'bow', 'heal', 'spear'].forEach((j, k) => {
      const from = jobs.findIndex((x, idx) => x === j && !order.includes(idx))
      const to = order[k]
      if (from >= 0) { jobs[from] = jobs[to]; jobs[to] = j }
    })
  }
  world.spots.forEach((sp, i) => {
    S.cages.push({
      id: i, tx: sp.tx, ty: sp.ty, x: sp.tx * TILE + 8, y: sp.ty * TILE + 8, hp: 10, maxhp: 10, flash: 0, opened: false,
      job: jobs[i], cloth: pick(CLOTHES), hair: pick(HAIRS), name: pick(SYLLABLES) + pick(SYLLABLES), region: sp.region,
    })
  })
  S.total = S.cages.length
  S.camps = world.camps
  world.enemies.forEach((en, i) => { const e = newEnemy(en.kind, en.x, en.y, en.camp); e.idx = i })
  spawnBoss()
  S.leader = newAlly('sword', world.start.x, world.start.y)
  S.leader.name = 'HERO'
  updateCamera()
  refreshFlow()

  // --- セーブ・ロード（戦いの最中は保存しない）---
  const b64 = (arr) => { let str = ''; for (let i = 0; i < arr.length; i += 8192) str += String.fromCharCode(...arr.subarray(i, i + 8192)); return btoa(str) }
  const unb64 = (str) => { const bin = atob(str); const out = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i); return out }
  function serialize() {
    return {
      v: 1, seed: world.seed, t: S.t, rescued: S.rescued, lost: S.lost, kills: S.kills,
      leader: S.allies.indexOf(S.leader),
      allies: S.allies.map((a) => ({ job: a.job, x: Math.round(a.x), y: Math.round(a.y), lvl: a.lvl, xp: +a.xp.toFixed(2), hp: Math.round(a.hp), name: a.name, cloth: a.cloth, hair: a.hair })),
      cages: S.cages.map((c) => ({ o: c.opened ? 1 : 0, job: c.job, cloth: c.cloth, hair: c.hair, name: c.name })),
      dead: [...S.deadIdx],
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
      cg.job = c.job; cg.cloth = c.cloth; cg.hair = c.hair; cg.name = c.name
      if (c.o) { cg.opened = true; tiles[cg.ty * MW + cg.tx] = T.PATH }
    })
    S.allies = []
    for (const a of d.allies) {
      const u = newAlly(a.job, a.x, a.y, a.lvl)
      Object.assign(u, { xp: a.xp, hp: a.hp, name: a.name, cloth: a.cloth, hair: a.hair })
      u.maxhp = Math.round(JOBS[a.job].hp * lvMul(a.lvl))
    }
    S.leader = S.allies[Math.max(0, d.leader)]
    const dead = new Set(d.dead)
    S.deadIdx = new Set(d.dead)
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
    serialize, restore, canSave, spawnEnemy: (k, x, y) => { const e = newEnemy(k, x, y, -9); e.active = true; return e },
    step, switchTo, cycle, tapAt, newAlly, openCage, boxBlocked, teleportNearView, inArena, healPulse,
    bossPhase: () => (S.boss ? bossPhase(S.boss) : 0), nearestCage,
  })
  return S
}
