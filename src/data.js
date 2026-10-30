// 職・敵・ボスの定義。数値はシミュレーション（tools/bot.mjs など）で調整する

// レベル: 上限は高く（99）、上がるほど上がりにくい（ふつうの RPG。鍛える時間と難しさの引き換え）
export const MAX_LV = 99
export const xpNeed = (lv) => 4 + 2.4 * lv * (1 + lv / 12)
// レベルの強さの倍率（攻撃と体力）。LV13 まではまっすぐ伸び（ボスの調整はここまでで合わせた）、その先は急に伸びる（LV30 で 5.3 倍、LV50 で 13 倍、LV99 で 48 倍。育てきるとボスも数秒で倒せる）
export const lvMul = (lv) => 1 + 0.1 * (lv - 1) + 0.005 * Math.max(0, lv - 13) ** 2

// 職。kind は攻撃の種類（sim.js の attackWith）。pref はこの距離を保つ。band は操作キャラからの好む距離の帯
// manual: 操作しているときは自動で攻撃せず、自分で振る・射る（sim.js の swing・shootManual。剣士と弓）
export const JOB_LIST = ['sword', 'shield', 'bow', 'boom', 'ice', 'bomb', 'volt', 'heal', 'thief', 'hammer']   // 2026-10-17 に槍・弩・斧をやめ、ハンマー使いを足して 10 職
export const JOBS = {
  sword: { label: 'SWORD', hp: 34, speed: 72, atk: 6, range: 20, cd: 0.55, kind: 'melee', manual: true, pref: 14, band: [26, 64], sight: 150 },
  shield: { label: 'SHIELD', hp: 56, speed: 58, atk: 4, range: 18, cd: 0.8, kind: 'melee', taunt: true, manual: true, pref: 14, band: [16, 44], sight: 130 },
  bow: { label: 'BOW', hp: 20, speed: 70, atk: 4, range: 140, cd: 0.85, kind: 'arrow', manual: true, pref: 100, band: [70, 120], sight: 170 },
  boom: { label: 'BOOM', hp: 24, speed: 70, atk: 4, range: 105, cd: 1.4, kind: 'boomerang', manual: true, pref: 75, band: [56, 100], sight: 140 },
  // 氷術師（2026-10-17 に魔法使いから。凍らせて止める。性能はまだ前の魔法使いのまま）
  ice: { label: 'ICE', hp: 18, speed: 62, atk: 5, range: 110, cd: 1.6, kind: 'magic', manual: true, pref: 85, band: [64, 112], sight: 150 },
  bomb: { label: 'BOMB', hp: 24, speed: 60, atk: 9, range: 125, cd: 2.2, kind: 'bomb', manual: true, pref: 95, band: [70, 116], sight: 150 },
  volt: { label: 'VOLT', hp: 20, speed: 62, atk: 5, range: 100, cd: 1.3, kind: 'lightning', manual: true, pref: 75, band: [60, 106], sight: 140 },
  // 盗賊: 足が速く、檻（あとで宝箱も）を unlock 倍の速さで開ける。ナイフで刺す（背後からは STAB.back 倍）
  thief: { label: 'THIEF', hp: 32, speed: 86, atk: 5, range: 16, cd: 0.5, kind: 'melee', manual: true, unlock: 4, backstab: true, pref: 12, band: [24, 60], sight: 140 },
  // ハンマー使い: いちばん遅いが、一撃が重い。体も重い（押し合いで押し負けにくい）
  hammer: { label: 'HAMMER', hp: 44, speed: 50, atk: 12, range: 22, cd: 1.3, kind: 'melee', manual: true, heavy: true, pref: 14, band: [20, 56], sight: 130 },
  heal: { label: 'HEAL', hp: 24, speed: 66, atk: 0, range: 0, cd: 1.8, kind: 'heal', manual: true, pref: 0, band: [60, 110], sight: 120 },
}
// 99 人の配役（合計 99）。最初の地域には、いろいろな職を多めに入れる
export const JOB_COUNTS = { sword: 11, shield: 11, bow: 11, boom: 9, ice: 10, bomb: 10, volt: 9, heal: 10, thief: 10, hammer: 8 }

// 敵。atk: melee 近づいて殴る / flyer 飛んで殴る / charge 突進 / shoot 矢 / fireball 遅い大きな玉 / fan 扇状の玉 / slam 足元の範囲
// 攻撃は、予兆（wind 秒）のあとに当たる。予兆の間に離れれば避けられる
// shape: blob / bat / human / beast / heavy。col は色（パレット名）
const E = (o) => ({ reach: 13, range: 0, wind: 0.4, cd: 1.0, aggro: 120, fan: 3, ...o })
export const ENEMIES = {
  // 草原（tier 1）
  slime: E({ name: 'SLIME', shape: 'blob', col: ['gr4', 'gr2', 'gr5'], hp: 18, speed: 28, dmg: 4, atk: 'melee', reach: 13, wind: 0.4, cd: 1.0, xp: 4, cost: 1, aggro: 100 }),
  bat: E({ name: 'BAT', shape: 'bat', col: ['pu2', 'pu1', 'pu4'], hp: 11, speed: 62, dmg: 3, atk: 'flyer', reach: 11, wind: 0.25, cd: 0.8, xp: 3, cost: 1, aggro: 120 }),
  goblin: E({ name: 'GOBLIN', shape: 'human', col: ['rd1', 'gr5', 'rd2'], weapon: 'bow', hp: 14, speed: 34, dmg: 5, atk: 'shoot', range: 130, wind: 0.55, cd: 1.5, xp: 5, cost: 1.5, aggro: 150 }),
  boar: E({ name: 'BOAR', shape: 'beast', col: ['br3', 'br1', 'br5'], hp: 26, speed: 38, dmg: 7, atk: 'charge', reach: 12, wind: 0.6, cd: 1.6, xp: 6, cost: 2, aggro: 130 }),
  // 森（tier 2）
  wolf: E({ name: 'WOLF', shape: 'beast', col: ['gy3', 'gy1', 'gy5'], hp: 24, speed: 58, dmg: 6, atk: 'melee', reach: 14, wind: 0.3, cd: 0.9, xp: 6, cost: 2, aggro: 140 }),
  shaman: E({ name: 'SHAMAN', shape: 'human', col: ['gr1', 'sk2', 'gr3'], weapon: 'staff', hp: 18, speed: 30, dmg: 8, atk: 'fireball', range: 140, wind: 0.7, cd: 2.2, xp: 8, cost: 2.5, aggro: 150 }),
  treant: E({ name: 'TREANT', shape: 'heavy', col: ['br2', 'gr2', 'gr4'], hp: 70, speed: 22, dmg: 12, atk: 'slam', reach: 28, wind: 0.9, cd: 2.5, xp: 14, cost: 5, aggro: 110 }),
  moth: E({ name: 'MOTH', shape: 'bat', col: ['gr3', 'gr1', 'gr6'], hp: 14, speed: 66, dmg: 4, atk: 'flyer', reach: 11, wind: 0.25, cd: 0.8, xp: 4, cost: 1.2, aggro: 120 }),
  // 砂漠（tier 3）
  scorpion: E({ name: 'SCORPION', shape: 'beast', col: ['or1', 'br1', 'sa2'], hp: 40, speed: 40, dmg: 9, atk: 'melee', reach: 15, wind: 0.45, cd: 1.2, xp: 10, cost: 3, aggro: 130 }),
  vulture: E({ name: 'VULTURE', shape: 'bat', col: ['sa1', 'br2', 'sa3'], hp: 20, speed: 70, dmg: 7, atk: 'flyer', reach: 11, wind: 0.25, cd: 0.8, xp: 8, cost: 2, aggro: 130 }),
  mummy: E({ name: 'MUMMY', shape: 'human', col: ['sa3', 'sa2', 'sa1'], weapon: 'none', hp: 60, speed: 28, dmg: 9, atk: 'melee', reach: 14, wind: 0.5, cd: 1.3, xp: 12, cost: 4, aggro: 110 }),
  sandmage: E({ name: 'SANDMAGE', shape: 'human', col: ['or1', 'sk2', 'ye1'], weapon: 'staff', hp: 26, speed: 30, dmg: 10, atk: 'fireball', range: 140, wind: 0.7, cd: 2.2, xp: 12, cost: 3.5, aggro: 150 }),
  // 雪原（tier 4）
  icegel: E({ name: 'ICEGEL', shape: 'blob', col: ['bl4', 'bl2', 'bl5'], hp: 55, speed: 32, dmg: 9, atk: 'melee', reach: 13, wind: 0.4, cd: 1.0, xp: 12, cost: 3, aggro: 100 }),
  snowwolf: E({ name: 'SNOWWOLF', shape: 'beast', col: ['gy6', 'gy4', 'white'], hp: 42, speed: 64, dmg: 9, atk: 'melee', reach: 14, wind: 0.3, cd: 0.9, xp: 13, cost: 3.5, aggro: 140 }),
  yeti: E({ name: 'YETI', shape: 'heavy', col: ['gy6', 'bl4', 'white'], hp: 120, speed: 26, dmg: 13, atk: 'slam', reach: 30, wind: 1.05, cd: 2.5, xp: 26, cost: 8, aggro: 110 }),
  frostarcher: E({ name: 'FROST', shape: 'human', col: ['bl2', 'sk3', 'bl4'], weapon: 'bow', hp: 30, speed: 32, dmg: 6, atk: 'fan', range: 150, fan: 3, wind: 0.7, cd: 2.0, xp: 16, cost: 4, aggro: 160 }),
  // 火山（tier 5）
  lavagel: E({ name: 'LAVAGEL', shape: 'blob', col: ['or2', 'rd2', 'ye2'], hp: 80, speed: 32, dmg: 12, atk: 'melee', reach: 13, wind: 0.4, cd: 1.0, xp: 18, cost: 4, aggro: 100 }),
  firebat: E({ name: 'FIREBAT', shape: 'bat', col: ['rd3', 'rd1', 'ye2'], hp: 30, speed: 74, dmg: 10, atk: 'flyer', reach: 11, wind: 0.25, cd: 0.8, xp: 14, cost: 3, aggro: 130 }),
  golem: E({ name: 'GOLEM', shape: 'heavy', col: ['rd1', 'gy2', 'or2'], hp: 180, speed: 24, dmg: 13, atk: 'slam', reach: 34, wind: 1.15, cd: 3.0, xp: 40, cost: 10, aggro: 110 }),
  firemage: E({ name: 'FIREMAGE', shape: 'human', col: ['rd2', 'sk2', 'or2'], weapon: 'staff', hp: 40, speed: 30, dmg: 7, atk: 'fan', range: 150, fan: 5, wind: 0.8, cd: 2.4, xp: 22, cost: 5, aggro: 160 }),
  // 魔王城（tier 6）
  knight: E({ name: 'KNIGHT', shape: 'human', col: ['gy3', 'gy5', 'gy6'], weapon: 'sword', hp: 120, speed: 40, dmg: 16, atk: 'melee', reach: 16, wind: 0.5, cd: 1.3, xp: 30, cost: 7, aggro: 130 }),
  darkmage: E({ name: 'DARKMAGE', shape: 'human', col: ['pu1', 'sk1', 'pu3'], weapon: 'staff', hp: 55, speed: 30, dmg: 8, atk: 'fan', range: 160, fan: 5, wind: 0.8, cd: 2.2, xp: 28, cost: 6, aggro: 170 }),
  gargoyle: E({ name: 'GARGOYLE', shape: 'bat', col: ['gy3', 'gy1', 'rd3'], hp: 70, speed: 72, dmg: 14, atk: 'flyer', reach: 12, wind: 0.3, cd: 0.9, xp: 24, cost: 5, aggro: 140, big: true }),
}

// ボスが呼ぶ手下（どの地域にも出ない）
ENEMIES.imp = E({ name: 'IMP', shape: 'bat', col: ['pu3', 'pu1', 'ye2'], hp: 90, speed: 62, dmg: 14, atk: 'flyer', reach: 11, wind: 0.3, cd: 1.0, xp: 12, cost: 3, aggro: 200, tier: 6 })

// 地域ごとの出る敵（バイオーム番号 0 草原 1 森 2 砂漠 3 雪原 4 火山 5 魔王城）
export const POOLS = [
  ['slime', 'slime', 'bat', 'goblin', 'boar'],
  ['wolf', 'wolf', 'shaman', 'treant', 'moth', 'goblin'],
  ['scorpion', 'scorpion', 'vulture', 'mummy', 'sandmage'],
  ['icegel', 'snowwolf', 'snowwolf', 'yeti', 'frostarcher'],
  ['lavagel', 'firebat', 'golem', 'firemage', 'firemage'],
  ['knight', 'knight', 'darkmage', 'gargoyle'],
]
export const TIER_OF_BIOME = [1, 2, 3, 4, 5, 6]
// 地域ごとの、敵の体力と攻撃力の倍率（tier 1〜6）。仲間が増えていく速さに合わせて調整する
export const HP_MUL = [0, 1.0, 1.5, 2.2, 3.0, 4.0, 4.0]
export const DMG_MUL = [0, 0.9, 1.1, 1.4, 1.7, 2.0, 1.9]
for (const [i, pool] of POOLS.entries()) {
  for (const k of pool) {
    const D = ENEMIES[k]
    if (D.tier) continue
    D.tier = i + 1
    D.hp = Math.round(D.hp * HP_MUL[D.tier])
    D.dmg = Math.round(D.dmg * DMG_MUL[D.tier])
    D.xp = Math.round(D.xp * 1.5)
  }
}
// 硬い敵（armor）: ふつうの攻撃は ARMOR 倍しか通らない。通るのは、盗賊の背後・ハンマー・爆弾・凍らせて砕く・引き絞った矢
export const ARMOR = 0.35
for (const k of ['knight', 'golem', 'mummy', 'scorpion', 'yeti', 'treant', 'gargoyle']) ENEMIES[k].armor = true

// 難しさ: 敵の体力 hp・攻撃力 dmg・速さ speed・予兆の長さ wind の倍率、見張りの数 guards の倍率、ボスの体力 boss・ボスの攻撃 bossDmg の倍率
// 敵の倍率は、先の地域ほど強く効く（DIFF_RAMP。tier 1 の草原はその割合だけ。魔王城で全部）。最初の一人が、いきなりやられないように
export const DIFFS = {
  easy: { label: 'EASY', hp: 0.7, dmg: 0.6, speed: 0.9, wind: 1.3, guards: 0.75, boss: 0.7, bossDmg: 0.6 },
  normal: { label: 'NORMAL', hp: 0.95, dmg: 0.8, speed: 1, wind: 1, guards: 1, boss: 3, bossDmg: 3 },   // ボスは 2026-10-18 に 3 倍・3 倍（隙を作れる人がギリギリ勝てる）
  hard: { label: 'HARD', hp: 1.2, dmg: 1.2, speed: 1.05, wind: 0.85, guards: 1.1, boss: 2.3, bossDmg: 1.7 },
}
export const DIFF_RAMP = [0, 0.3, 0.55, 0.75, 0.9, 1, 1]   // tier ごとの効き方

// 見張りの強さ（コスト合計）。tier が上がるほど増える
export const budgetOf = (tier, r) => 1.7 + 2.5 * tier + r * 1.4 * tier

// ラスボス
export const BOSS = {
  name: 'DEMON KING', hp: 7000, hpBase: 1200, hpPerAlly: 260, speed: 38, size: 1,
  slam: { r: 58, dmg: 28, wind: 0.85 },
  fan: { n: 7, spread: 1.3, dmg: 10, speed: 130, wind: 0.6 },
  charge: { dmg: 26, speed: 270, dur: 0.6, wind: 0.65 },
  rain: { n: 7, r: 24, dmg: 16, wind: 0.95 },
  summon: { kind: 'imp', n: 2, max: 4 },
}

// 操作キャラが自分で振る剣。r は届く距離、half は扇の半分の角度（ラジアン）、cd は次に振れるまで
// deflect は弾を弾ける距離、back は弾き返した弾の威力の倍率、stun は予兆を斬って止めたときに動けない時間
// 当たったときの手応え: stop はヒットストップ（秒。BREAK・とどめは bigStop）、kb はノックバックの初速（重さで割る）
// wallDmg は壁にぶつかったときのダメージ（剣の何倍か）、wallStun はそのとき動けない時間、shake は画面の揺れ（ドット）
export const SWING = {
  r: 24, half: 1.05, cd: 0.3, deflect: 30, back: 2, stun: 0.7, bossStun: 1.0,
  stop: 0.05, bigStop: 0.09, kb: 190, kbTime: 0.16, wallDmg: 0.5, wallStun: 0.4, shake: 1,
}
// 操作キャラが自分で射る弓。押してすぐ離すと速射、押し続けると引き絞る（full 秒で引き絞りきり、離すと強い矢）。引いている間は歩く速さが slow 倍
// quick・full は剣士の攻撃力の倍率。強い矢は貫く。stop はヒットストップ、kb はノックバック（重さで割る）
// tap: これより短く押して離したら「軽いタップ」（狙いの線を出さず、近くの敵へ自動で）
export const SHOOT = { tap: 0.12, cd: 0.32, full: 1.4, slow: 0.5, quick: 1.2, strong: 8, speed: 240, strongSpeed: 380, range: 170, strongRange: 230, stop: 0.03, strongStop: 0.07, kb: 90, strongKb: 170 }
// 操作キャラが自分で使う盾。押している間は構える（正面 half ラジアンの攻撃と弾を受ける。受けると chip 倍だけ食らう。歩く速さ slow 倍）
// 構えてから just 秒以内に受けたらジャストガード（無傷。敵は stun 秒よろけ、弾は撃った敵へ跳ね返す）。離すと盾で押す（bash）
// 構えている間は、敵に狙われやすい（taunt。距離をこの倍に見る）
export const GUARD = { half: 1.2, chip: 0.15, slow: 0.4, just: 0.2, stun: 1.0, justStop: 0.1, taunt: 0.35,
  bashR: 24, bashHalf: 1.0, bashMul: 1.5, bashKb: 280, bashStop: 0.06, cd: 0.45 }
// 操作キャラが自分で投げる爆弾。ちょん押しは近くの敵の足元へ、長押しで落とす場所を狙う（ずらした長さ × drag ドット先。range まで）。離すと投げる
// flight 秒で山なりに飛び、着いて fuse 秒で爆発（半径 r、攻撃力の mul 倍）。爆風は中心から外へ吹き飛ばす（kb を重さで割る）
export const THROW = { range: 130, min: 16, drag: 4, flight: 0.5, fuse: 0.4, r: 34, mul: 2.2, kb: 240, stop: 0.08, cd: 0.8, slow: 0.6 }
// 操作キャラが自分で使う僧侶。ちょん押しは、いちばん傷の深い仲間（range の中。自分も）へ癒やしの光（bolt × レベル の回復）
// 長押しは、足元に癒やしの円（半径 r。中の仲間は 1 秒に rate × レベル 回復、敵の弾は消える）。祈っている間は動けない。max 秒で終わり、after 秒休む
export const PRAY = { range: 150, bolt: 16, boltSpeed: 170, cd: 0.5, r: 38, rate: 9, max: 4, after: 1.2, smite: 5, smiteCd: 0.8 }   // smite: 治す仲間がいないときの光の攻撃（攻撃力。レベルの倍率をかける）、smiteCd: そのときの次まで（弓の 7 割ほどの強さ。gunzo-online から、2026-10-30）
// 操作キャラが自分で使う盗賊のナイフ。押した瞬間に向いている方を刺す（届く距離 r、扇の半分 half）。cd 秒ごとに連打できる。背後から刺すと back 倍（CRIT）
export const STAB = { r: 18, half: 0.8, cd: 0.18, back: 3, bossBack: 2, stop: 0.03, critStop: 0.07, kb: 70 }
// 操作キャラが自分で使う氷術師。ちょん押しは近くの敵へツララ（攻撃力の icicle 倍）。長押しは狙った敵に照準を合わせ、charge 秒溜めて離すと冷気の弾で凍らせる
// 凍った敵は dur 秒（ボスは bossDur 秒）動けず攻撃もしない。ほかの職で叩くと砕けて shatter 倍（SHATTER）。照準・溜めの間は歩く速さ slow 倍
// autoDur: 自律の氷術師の玉が直撃した敵を凍らせる秒（ボスは半分）。bossCool: ボスは凍りが解けてからこの秒は凍らない
// ボスの隙: 操作キャラがボスの技を止める（予兆を斬る・ジャストガード・背後を刺す・凍らせる・ハンマーで叩く・予兆に引き絞った矢）と、
// ボスは dur 秒動けず、その間は全員の与えるダメージが mul 倍。終わってから cool 秒は、次の隙はできない（ふつうのよろけだけ）
// lead: ボスは操作キャラを狙いやすい（距離をこの倍に見る）。leadRain: ボスの雨のうち、操作キャラに落ちる数
export const BREAK = { dur: 3, mul: 2.5, cool: 4, lead: 0.5, leadRain: 2 }
// ナイトメア（クリアのあと）: 敵の体力は grow 秒ごとに e 倍（攻撃はその dmgPow 乗、経験値は xpPow 乗の xpMul 倍）。tierEvery 秒ごとに先の地域の敵が混ざる
// 湧く数は 1 秒に rate0 体から、1 秒ごとに rateUp ずつ増え、rateMax まで。同時に cap 体まで。far より離れた敵は消える。bossEvery 秒ごとに魔王（強さ bossMul 倍）
export const NIGHTMARE = { grow: 150, dmgPow: 1, xpPow: 1, xpMul: 3, tierEvery: 60, rate0: 3, rateUp: 0.03, rateMax: 30, cap: 500, far: 420, bossEvery: 150, bossMul: 0.3 }
export const FREEZE = { autoDur: 1.0, bossCool: 4, bossShatter: 1.5, range: 150, charge: 0.7, dur: 2.5, bossDur: 1.2, shatter: 2.5, icicle: 1.3, icicleSpeed: 260, boltSpeed: 300, cd: 0.35, slow: 0.6, stop: 0.03 }
// 操作キャラが自分で投げるブーメラン。戻ってくるまで次は投げられない。ちょん押しは近くの敵の所（+ over）で折り返す、長押しは押した長さで飛ぶ距離が min〜max に伸びる（charge 秒で最大）
// 行きと帰りの両方で、通り道の敵に当たる（攻撃力の mul 倍）。帰りは投げた人を追いかける。狙っている間は歩く速さ slow 倍
// 自分で投げたものは輪を描いて飛ぶ: 奥行きが飛ぶ距離、幅はその wide 倍。行きは向きの左側（右へ投げたら上）、帰りは右側を通り、最後の home の割合は投げた人の今いる所へ曲がる
export const BOOMER = { min: 60, max: 150, over: 4, charge: 0.8, speed: 200, back: 210, mul: 1.4, kb: 80, slow: 0.7, wide: 0.6, home: 0.3 }
// 操作キャラが自分で使う雷術師。ちょん押しは近くの敵へ雷（n 体まで連鎖、跳べるのは hop まで）。長押しは弓と同じ射線で溜め（charge 秒で満タン）、
// 離すと狙った向きの敵へ。溜まるほど連鎖が伸びる（満タンで fullN 体、fullHop まで）。1 体目は攻撃力の mul 倍、連鎖ごとに decay 倍。凍った敵からは 2 倍跳べる
export const CHAIN = { range: 130, n: 4, hop: 52, fullN: 8, fullHop: 80, charge: 0.8, mul: 1.3, decay: 0.85, cd: 0.45, slow: 0.6, stop: 0.03, bigStop: 0.07 }
// 操作キャラが自分で使うハンマー。ちょん押しは wind 秒ためてから振り下ろす（扇 r・half、攻撃力の mul 倍、大きなノックバック kb）。
// 長押しは溜めて（charge 秒で最大）、離すと地面を叩く: まわり（slamR〜slamMax）の敵を全員よろけさせ（stun〜stunMax 秒）、外へ吹き飛ばす。ため・溜めの間は歩く速さ slow 倍
export const SMASH = { wind: 0.2, r: 24, half: 1.0, mul: 1.07, kb: 520, stop: 0.1, cd: 0.7, charge: 1.0, slamR: 30, slamMax: 62, slamMul: 0.8, slamMulMax: 1.47,
  stun: 0.7, stunMax: 1.4, slamKb: 220, slow: 0.4, mass: 2.4 }
// ノックバックの重さ（大きいほど動かない）。ボスは動かない
export const MASS = { blob: 1, bat: 0.7, human: 1.2, beast: 1.4, heavy: 4, big: 3 }

// 仲間の名前（英字だけ。画面の文字が英数字だけなので）。99 人に重ならないように配る（足りなければ番号を付ける）
export const NAMES = [
  'ARDEN', 'KAEL', 'RYU', 'ZEPH', 'LYRA', 'ORION', 'VEX', 'SORA', 'KIRA', 'DANTE', 'NOVA', 'RAVEN', 'ASHE', 'BRAM', 'CYRA', 'DRAKE',
  'ELARA', 'FENRIR', 'GALE', 'HAWK', 'IVOR', 'JADE', 'KANE', 'LEON', 'MIRA', 'NYX', 'ODIN', 'PYRA', 'QUILL', 'REX', 'SAGE', 'TALON',
  'UMBRA', 'VALE', 'WREN', 'XANDER', 'YUKI', 'ZANE', 'AIDEN', 'BLAZE', 'CASSIA', 'DAX', 'EIRA', 'FALK', 'GRIM', 'HELIOS', 'ISOLDE', 'JAX',
  'KESTREL', 'LUNA', 'MAGNUS', 'NERO', 'OPAL', 'PHOENIX', 'RUNE', 'SELENE', 'THORNE', 'ULRIC', 'VESPER', 'WOLFE', 'YARA', 'ZORA', 'ALDRIC', 'BRYN',
  'CORVIN', 'DELPHI', 'EMBER', 'FARIS', 'GIDEON', 'HALE', 'INGRID', 'JORAH', 'KAI', 'LEVI', 'MORRIGAN', 'NIKO', 'ONYX', 'PERCIVAL', 'RIKU', 'SIEGFRIED',
  'TEMPEST', 'URSA', 'VIGO', 'WYATT', 'ZEKE', 'ASTRID', 'BOREAS', 'CAIUS', 'DUSK', 'ECHO', 'FREYA', 'GUNNAR', 'HARUKA', 'IRIS', 'JUNO', 'KOJI',
  'LOKI', 'MAEVE', 'NOAH', 'OBERON', 'PRISM', 'RAGNAR', 'SKADI', 'TYR', 'VOLT', 'WARDEN', 'YORU', 'ZENITH', 'ARIA', 'BALDER', 'CROW', 'DAGNY',
]
