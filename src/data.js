// 職・敵・ボスの定義。数値はシミュレーション（tools/bot.mjs など）で調整する

export const MAX_LV = 15
export const xpNeed = (lv) => 4 + 2.4 * lv
export const lvMul = (lv) => 1 + 0.1 * (lv - 1)

// 職。kind は攻撃の種類（sim.js の attackWith）。pref はこの距離を保つ。band は操作キャラからの好む距離の帯
export const JOB_LIST = ['sword', 'spear', 'shield', 'bow', 'xbow', 'axe', 'boom', 'mage', 'bomb', 'volt', 'heal']
export const JOBS = {
  sword: { label: 'SWORD', hp: 34, speed: 72, atk: 6, range: 20, cd: 0.55, kind: 'melee', pref: 14, band: [26, 64], sight: 150 },
  spear: { label: 'SPEAR', hp: 30, speed: 66, atk: 5, range: 40, cd: 0.8, kind: 'pierce', pref: 32, band: [30, 70], sight: 150 },
  shield: { label: 'SHIELD', hp: 56, speed: 58, atk: 4, range: 18, cd: 0.8, kind: 'melee', taunt: true, pref: 14, band: [16, 44], sight: 130 },
  bow: { label: 'BOW', hp: 20, speed: 70, atk: 4, range: 140, cd: 0.85, kind: 'arrow', pref: 100, band: [70, 120], sight: 170 },
  xbow: { label: 'XBOW', hp: 20, speed: 64, atk: 13, range: 175, cd: 2.2, kind: 'bolt', pref: 125, band: [80, 130], sight: 190 },
  axe: { label: 'AXE', hp: 28, speed: 66, atk: 8, range: 72, cd: 1.1, kind: 'axe', pref: 55, band: [44, 84], sight: 130 },
  boom: { label: 'BOOM', hp: 24, speed: 70, atk: 4, range: 105, cd: 1.4, kind: 'boomerang', pref: 75, band: [56, 100], sight: 140 },
  mage: { label: 'MAGE', hp: 18, speed: 62, atk: 5, range: 110, cd: 1.6, kind: 'magic', pref: 85, band: [64, 112], sight: 150 },
  bomb: { label: 'BOMB', hp: 24, speed: 60, atk: 9, range: 125, cd: 2.2, kind: 'bomb', pref: 95, band: [70, 116], sight: 150 },
  volt: { label: 'VOLT', hp: 20, speed: 62, atk: 5, range: 100, cd: 1.3, kind: 'lightning', pref: 75, band: [60, 106], sight: 140 },
  heal: { label: 'HEAL', hp: 24, speed: 66, atk: 0, range: 0, cd: 1.8, kind: 'heal', pref: 0, band: [60, 110], sight: 120 },
}
// 99 人の配役（合計 99）。最初の地域には、いろいろな職を多めに入れる
export const JOB_COUNTS = { sword: 14, spear: 9, shield: 10, bow: 12, xbow: 8, axe: 8, boom: 8, mage: 10, bomb: 7, volt: 6, heal: 7 }

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
  yeti: E({ name: 'YETI', shape: 'heavy', col: ['gy6', 'bl4', 'white'], hp: 120, speed: 26, dmg: 16, atk: 'slam', reach: 30, wind: 1.05, cd: 2.5, xp: 26, cost: 8, aggro: 110 }),
  frostarcher: E({ name: 'FROST', shape: 'human', col: ['bl2', 'sk3', 'bl4'], weapon: 'bow', hp: 30, speed: 32, dmg: 6, atk: 'fan', range: 150, fan: 3, wind: 0.7, cd: 2.0, xp: 16, cost: 4, aggro: 160 }),
  // 火山（tier 5）
  lavagel: E({ name: 'LAVAGEL', shape: 'blob', col: ['or2', 'rd2', 'ye2'], hp: 80, speed: 32, dmg: 12, atk: 'melee', reach: 13, wind: 0.4, cd: 1.0, xp: 18, cost: 4, aggro: 100 }),
  firebat: E({ name: 'FIREBAT', shape: 'bat', col: ['rd3', 'rd1', 'ye2'], hp: 30, speed: 74, dmg: 10, atk: 'flyer', reach: 11, wind: 0.25, cd: 0.8, xp: 14, cost: 3, aggro: 130 }),
  golem: E({ name: 'GOLEM', shape: 'heavy', col: ['rd1', 'gy2', 'or2'], hp: 180, speed: 24, dmg: 18, atk: 'slam', reach: 34, wind: 1.15, cd: 3.0, xp: 40, cost: 10, aggro: 110 }),
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

export const SYLLABLES = ['KA', 'RO', 'MI', 'TA', 'NE', 'SU', 'HI', 'YO', 'RA', 'KE', 'MU', 'TO', 'NA', 'SA', 'FU', 'LE', 'SHI', 'KO', 'RI', 'DO']
export const CLOTHES = ['bl3', 'rd3', 'ye1', 'pu3', 'tl2', 'pk2', 'or2', 'gy6']
export const HAIRS = ['br1', 'br3', 'ye2', 'ink', 'rd2', 'gy5']
