// 動作確認（Node）: node tools/check.mjs
import { createSim } from '../src/sim.js'
import { JOB_LIST, JOBS } from '../src/data.js'
import { TILE, MW, MH, T, solidTile } from '../src/world.js'
import { createRenderer, W, H } from '../src/render.js'

let fails = 0
const ok = (cond, msg) => { console.log(`${cond ? 'ok  ' : 'FAIL'} ${msg}`); if (!cond) fails++ }
const run = (S, secs) => { for (let i = 0; i < secs * 60; i++) S.step(1 / 60) }
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y)

// 1. 世界：捕虜と門が道でつながっているか（門は通れるものとして数える）
{
  const S = createSim()
  const w = S.world
  const seen = new Uint8Array(MW * MH)
  const q = [[Math.floor(w.start.x / TILE), Math.floor(w.start.y / TILE)]]
  seen[q[0][1] * MW + q[0][0]] = 1
  while (q.length) {
    const [x, y] = q.pop()
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy
      if (nx < 0 || ny < 0 || nx >= MW || ny >= MH || seen[ny * MW + nx]) continue
      const t = w.tiles[ny * MW + nx]
      if (solidTile(t) && t !== T.GATE && t !== T.CAGE) continue
      seen[ny * MW + nx] = 1
      q.push([nx, ny])
    }
  }
  const reachCages = S.cages.filter((c) => [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => seen[(c.ty + dy) * MW + c.tx + dx]))
  ok(reachCages.length === S.cages.length, `全ての檻に隣から行ける (${reachCages.length}/${S.cages.length})`)
  const reachEn = S.enemies.filter((e) => seen[Math.floor(e.y / TILE) * MW + Math.floor(e.x / TILE)])
  ok(reachEn.length === S.enemies.length, `全ての敵が歩ける場所にいる (${reachEn.length}/${S.enemies.length})`)
}

// 2. 100人の負荷（最悪：全員が画面内で敵と戦う）
{
  const S = createSim()
  for (let i = 0; i < 99; i++) S.newAlly(JOB_LIST[i % 5], S.leader.x + (Math.random() - 0.5) * 260, S.leader.y + (Math.random() - 0.5) * 200)
  S.leader.x = 24 * TILE
  S.leader.y = 34 * TILE + 40
  for (const a of S.allies) { a.x = S.leader.x + (Math.random() - 0.5) * 300; a.y = S.leader.y + (Math.random() - 0.5) * 220 }
  const t0 = performance.now()
  const N = 600
  for (let i = 0; i < N; i++) S.step(1 / 60)
  const ms = (performance.now() - t0) / N
  ok(ms < 4, `100人＋敵で 1 step ${ms.toFixed(2)}ms（目安 4ms 未満）`)
  console.log(`     生存 ${S.allies.length}, 倒した敵 ${S.kills}, 救出 ${S.rescued}`)
}

// 3. 画面外の仲間が戻ってくる（凍結・瞬間移動・経路）
{
  const S = createSim()
  const far = []
  for (let i = 0; i < 30; i++) {
    const a = S.newAlly(JOB_LIST[i % 5], 6 * TILE, 52 * TILE)
    far.push(a)
  }
  // 操作キャラを遠くへ動かす
  S.leader.x = 40 * TILE
  S.leader.y = 20 * TILE
  S.flowKey = -1
  run(S, 1)
  const d0 = far.reduce((s, a) => s + dist(a, S.leader), 0) / far.length
  let offscreenDeaths = 0
  for (let i = 0; i < 40 * 60; i++) {
    S.step(1 / 60)
    for (const a of far) if (!a.alive && !a.counted) { a.counted = true; if (!a.active) offscreenDeaths++ }
  }
  const near = far.filter((a) => dist(a, S.leader) < 350).length
  ok(near >= 28, `遠くの仲間が40秒で操作キャラの近くに来る (${near}/30, 平均距離 ${Math.round(d0)} → ${Math.round(far.reduce((s, a) => s + dist(a, S.leader), 0) / far.length)})`)
  ok(offscreenDeaths === 0, `画面外にいる間は誰も死なない (画面外での死亡 ${offscreenDeaths}, 合流後に倒れた ${far.filter((a) => !a.alive).length})`)
}

// 4. 救出・戦闘・レベル・切り替え・引き継ぎ
{
  const S = createSim()
  for (let i = 0; i < 20; i++) S.newAlly(JOB_LIST[i % 5], 16 * TILE, 48 * TILE)
  S.leader.x = 16 * TILE + 8
  S.leader.y = 49 * TILE
  S.flowKey = -1
  run(S, 60)
  ok(S.rescued >= 1, `見張りを倒して檻が開く (救出 ${S.rescued}, 倒した敵 ${S.kills})`)
  const lv = Math.max(...S.allies.map((a) => a.lvl))
  ok(S.allies.some((a) => a.lvl >= 2 || a.xp > 0), `経験値が入る (最大 LV${lv})`)
  const first = S.leader
  const other = S.allies.find((a) => a !== first)
  ok(S.switchTo(other) && S.leader === other, '切り替えができる')
  S.cycle(1)
  ok(S.leader !== other, '次へ送れる')
  const l = S.leader
  l.hp = 0
  l.alive = false
  S.step(1 / 60)
  ok(S.leader !== l && S.leader.alive && S.state === 'play', '操作キャラが倒れたら別の仲間に引き継ぐ')
  for (const a of S.allies) { a.alive = false }
  S.step(1 / 60)
  ok(S.state === 'over', '全員倒れるとゲームオーバー')
}

// 5. 全ての職が、1 体の敵を倒せる（僧侶は味方を治せる）
{
  for (const job of JOB_LIST) {
    const S = createSim()
    S.enemies.length = 0
    // 何もない草地へ
    const ox = 12 * TILE, oy = 128 * TILE
    S.leader.x = ox - 300; S.leader.y = oy
    const u = S.newAlly(job, ox, oy, 5)
    S.switchTo(u)
    u.x = ox; u.y = oy
    if (job === 'heal') {
      const a = S.newAlly('sword', ox + 20, oy); a.hp = 5
      for (let i = 0; i < 300; i++) S.step(1 / 30)
      ok(a.hp > 5, `僧侶が味方を治す (${Math.round(a.hp)}/${a.maxhp})`)
    } else {
      const e = S.spawnEnemy('slime', ox + Math.min(40, JOBS[job].range - 6), oy)
      e.hp = e.maxhp = 400 // 長持ちさせて、与えたダメージを測る
      e.def = { ...e.def, dmg: 0, speed: 0 }
      let dealt = 0
      for (let i = 0; i < 30 * 8; i++) { S.input.mx = 0; S.input.my = 0; const before = e.hp; S.step(1 / 30); dealt += Math.max(0, before - e.hp) }
      ok(dealt > 0 || e.hp < 400, `${job} が敵にダメージを与える (${Math.round(400 - e.hp)})`)
    }
  }
}

// 6. 画面の左外にはみ出した矩形が、画面全体を塗らない（コウモリが画面端に出たときのフラッシュ）
{
  const fb = new Uint8Array(W * H).fill(5)
  const R = createRenderer(fb)
  R.rect(-20, 0, 9, 1, 2)
  R.rect(-20, -3, 9, 5, 2)
  R.rect(W + 5, 10, 9, 2, 2)
  ok(fb.every((v) => v === 5), '画面の外の矩形は何も塗らない')
}

// 試し場（ブラウザでふだん開く形）: 自分で動かす職ぜんぶで始まり、振る・射る・構える・投げる・祈るを押して離しても止まらない。描ける
{
  let err = null
  try {
    for (const hero of JOB_LIST.filter((j) => JOBS[j].manual)) {
      const S = createSim({ manual: true, test: true, hero })
      for (const [hold, n] of [[true, 1], [true, 60], [false, 30], [true, 20], [false, 30]]) {
        if (hold) S.input.pressed = true
        S.input.hold = hold
        for (let i = 0; i < n; i++) S.step(1 / 60)
      }
      const fb = new Uint8Array(W * H)
      createRenderer(fb).draw(S, { screen: 'play', stick: null }, S.t)
    }
  } catch (e) { err = e }
  ok(!err, `試し場で、自分で動かす職ぜんぶが動く${err ? `（${err.message}）` : ''}`)
}

// ボス戦の試し（?test で開く形）: 99 人＋操作キャラが LV13 で闘技場の前にいて、ボスと戦える。描ける
{
  let err = null, S = null
  try {
    S = createSim({ manual: true, test: 'boss', testLv: 13, hero: 'hammer' })
    for (let i = 0; i < 60 * 8; i++) { S.input.my = -1; S.step(1 / 60) }
    createRenderer(new Uint8Array(W * H)).draw(S, { screen: 'play', stick: null }, S.t)
  } catch (e) { err = e }
  ok(!err && S.allies.length >= 50 && S.allies.every((a) => a.lvl === 13) && S.boss.aggro && S.boss.hp < S.boss.maxhp,
    `ボス戦の試しで、LV13 の 100 人がボスと戦える${err ? `（${err.message}）` : ''}`)
}

// ナイトメア: クリアしたときの仲間で始まり、敵が湧き、中断して戻せる。倒れたら終わる
{
  let err = null, S = null, S2 = null
  try {
    const party = JOB_LIST.flatMap((j) => Array.from({ length: 10 }, (_, i) => ({ job: j, lvl: 12, xp: 0, name: `${j}${i}` })))
    S = createSim({ manual: true, nightmare: { party } })
    for (let i = 0; i < 60 * 20; i++) { S.input.mx = 1; S.step(1 / 60) }
    createRenderer(new Uint8Array(W * H)).draw(S, { screen: 'play', stick: null }, S.t)
    S2 = createSim({ manual: true, nightmare: { party } })
    S2.restoreNM(JSON.parse(JSON.stringify(S.serializeNM())))
  } catch (e) { err = e }
  ok(!err && S.allies.length + S.deaths.length === 100 && S.kills > 0 && !S.canSave() && Math.abs(S2.t - S.t) < 1e-6 && S2.allies.length === S.allies.length,
    `ナイトメアが動き、中断から戻せる${err ? `（${err.message}）` : ''}`)
}

console.log(fails ? `\n${fails} 件失敗` : '\n全部通った')
process.exit(fails ? 1 : 0)
