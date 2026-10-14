// 効果音と BGM の定義（PX-13h の MML）。tools/render-audio.mjs が、PX-13h の音源で鳴らして public/audio/*.ogg に書き出す。
// 実行時のゲームは書き出した ogg を再生するだけ。曲の好みは ~/src/etc/px13h/docs/taste.md
// （長い音はしゃくり上げ、エコー、サビはデチューン、楽器を足していく。前打音・語尾を落とす・分散和音は使わない）

// 音量などの動き（エンベロープ）。lava-house と同じ
export const ENVELOPES = [
  '15 14 13 12 12 11 11 10 | 10 / 8 6 5 4 3 2 1 1 0', '12 12 11 10 | 10 / 8 6 4 2 1 0', '12 8 5 3 1 0',
  '15 12 10 8 6 5 4 3 2 1 0', '15 11 7 4 2 0', '15 11 8 6 5 4 3 2 1 1 0',
  '15 15 14 14 13 13 12 12 11 11 10 10 9 9 8 8 7 7 6 6 6 5 5 5 4 4 4 3 3 3 2 2 2 1 1 1 1 0',
  '13 10 7 4 2 1 0',
  '-10 -6 -3 -1 0', '0 | 0 / 0 -2 -5 -9 -14 -20 -28 -38 -50 -64', '0 -40 -80 -120 -160 -200',
  '2 2 2 1 | 1', '1 1 1 1 1 1 1 1 0 | 0', '| 0 4 7', '| 0 3 7', '| 0 12', '| 0 7 12',
  '15 15 13 12 11 10 10 9 | 9 / 7 5 3 2 1 0', '4 6 8 10 11 12 13 14 | 14 / 11 8 5 3 1 0', '0',
  '16 8 0', '14 13 12 11 10 10 9 9 8 8 7 7 6 6 5 5 5 4 4 4 3 3 3 2 2 2 1 1 1 0',
  '', '1', '-9 -5 -2 0 1', '2', '-8 -4 -1 1 2',
  '0 6 12 18 24 30 36 | 36', // 27 ジャンプ：すばやく上へ
  '0 -8 -16 -24 -32 -40 -48 -56 -64 | -64', // 28 手を離す：下へ滑る
  '0 16 32 48 64 80 72 62 52 46 44 48 56 64 72', // 29 ジャンプ「ぴよーん」：上がって、少し下がって、また上がる（1/8 半音単位）
  '13 13 13 13 13 12 12 12 11 11 | 10 / 8 6 4 2 0', // 30 ジャンプの音量
]

// 効果音：[矩形波1, 矩形波2, 三角波, ノイズ]。peak は書き出すときの音の大きさ（0〜1）
export const SE = {
  rescue: { peak: 0.7, tracks: [
    't210 @1 v13 @v1 q8 o5 c16 e16 g16 >c8', '@2 v9 @v1 q8 o5 r16 c16 e16 g16 >c16', '', '',
  ] },
  lost: { peak: 0.6, tracks: [
    't150 @2 v12 @v1 q8 o4 e8 c8 <a4', '', 'q8 o2 a4 f4', '',
  ] },
  switch: { peak: 0.4, tracks: ['t240 @2 v11 @v7 q8 o5 g16 >c16', '', '', ''] },
  levelup: { peak: 0.55, tracks: [
    't200 @1 v12 @v1 q8 o5 c16 e16 g16 >c16 e8', '@1 v8 @v1 q8 o4 r16 c16 e16 g16 >c8', '', '',
  ] },
  win: { peak: 0.75, tracks: [
    't170 @1 v13 @v0 q7 o5 c8 e8 g8 >c4 <g8 >c2', '@1 v10 @v0 q7 o4 e8 g8 >c8 e4 c8 e2', 'q6 o3 c8 c8 c8 c4 c8 c2', '',
  ] },
  over: { peak: 0.7, tracks: [
    't100 @2 v12 @v1 q8 o4 e4 d4 c4 <b2', '@1 v8 @v1 q8 o4 c4 <b4 a4 g+2', 'q8 o2 a4 g4 f4 e2', '',
  ] },
}

// ---- 曲 ----
const D_hat = 'l8 @v2 o5 f f f f f f f f'
const D_hatk = 'l8 @v4 o4 g @v2 o5 f f f @v4 o4 g @v2 o5 f f f'
const D_snr = 'l8 @v4 o4 g @v2 o5 f @v3 c+ @v2 f @v4 o4 g @v2 o5 f @v3 c+ @v2 f'
const D_drive = 'l8 @v4 o4 g @v2 o5 f @v3 c+ @v4 o4 g @v4 g @v2 o5 f @v3 c+ @v2 f'
const D_run = 'l16 @v4 o4 g @v2 o5 f @v2 f @v2 f @v3 c+ @v2 f @v2 f @v2 f @v4 o4 g @v2 o5 f @v4 o4 g @v2 o5 f @v3 c+ @v2 f @v3 c+ @v3 c+'
const D_cym1 = 'l8 @v21 o5 c @v2 f @v3 c+ @v2 f @v4 o4 g @v2 o5 f @v3 c+ @v2 f'
const D_fill = 'l16 @v3 o5 c+ c+ c+ c+ c+ c+ c+ c+ c+ c+ c+ c+ c+ c+ c+ c+'
const D_end = 'l8 @v21 o5 c r r r r r r r'

// 1 つ目の矩形波の音を、8 分遅れの小さなエコーにする（小節の最後の音を 8 分ぶん短くする）
const shorten = { 4: '8', 2: '4.', '4.': '4' }
const echoBar = (bar) => {
  const m = [...bar.matchAll(/\b([a-g][+-]?)(4\.|4|2)(?![0-9.])/g)].pop()
  if (!m) throw new Error('エコーにできない小節: ' + bar)
  const cut = bar.slice(0, m.index) + m[1] + shorten[m[2]] + bar.slice(m.index + m[0].length)
  return 'r8 ' + cut
}
const det = (bar) => bar.replace(/@p8/g, '@p24').replace(/@p(?![0-9])/g, '@p23')
const bassBar = (r1, r2 = r1) => `o2 l8 ${r1} >${r1} <${r1} >${r1} <${r2} >${r2} <${r2} >${r2}`
const mkSong = ({ tempo, bars, mel, mel2, tri, noi, peak = 0.5, vel = 13, loop = true }) => ({
  bars, tempo, loop,
  tracks: [
    `${loop ? 'L ' : ''}t${tempo} @1 v${vel} @v0 q7 ~10,8,20 ` + mel.join(' '),
    `${loop ? 'L ' : ''}@1 v10 @v0 q7 ` + mel2.join(' '),
    `${loop ? 'L ' : ''}q6 ` + tri.join(' '),
    `${loop ? 'L ' : ''}` + noi.join(' '),
  ],
  perBar: [mel, mel2, tri, noi],
  peak,
})

export const SONGS = {}

// 1. フィールド（ト長調、テンポ 132、16 小節）：A（薄く）→ B（エコー、ドラム）→ サビ（デチューン、シンバル）。冒険の行進
{
  const A = [
    'v11 o5 g4 b4 >d4 <b4', 'o5 a4 f+4 a4 >d4', 'o5 g4 e4 g4 b4', 'o5 e4 g4 >c4 <g4',
  ]
  const Bm = [
    'v12 o5 r8 g8 b4 >d4 g4', 'o5 r8 a8 >d4 f+4 a4', 'o5 r8 g8 >c4 e4 g4', 'o5 a4 >d4 f+4 <a4',
  ]
  const C = [
    'v13 o5 b4. >d8 g4 d4', 'o5 g4. b8 >e4 <b4', 'o5 e4. g8 >c4 e4', 'o5 f+4. a8 >d2',
    'o5 b4. >d8 g4 b4', 'o5 g4. b8 >e4 g4', 'o5 a4. >c8 e4 c4', 'o5 @p8 g1 @p',
  ]
  const mel = [...A, ...Bm, ...C]
  const mel2 = ['r1', 'r1', 'r1', 'r1', ...Bm.map((b) => 'V5 ' + echoBar(b)), ...C.map((b) => 'V11 @p23 ' + det(b))]
  const tri = [
    bassBar('g'), bassBar('d'), bassBar('e'), bassBar('c'),
    bassBar('g'), bassBar('d'), bassBar('c'), bassBar('d'),
    bassBar('g'), bassBar('e'), bassBar('c'), bassBar('d'),
    bassBar('g'), bassBar('e'), bassBar('a'), bassBar('g'),
  ]
  const noi = [
    ...Array(4).fill('v6 ' + D_hat),
    'v8 ' + D_hatk, 'v8 ' + D_snr, 'v8 ' + D_snr, 'v8 ' + D_run,
    'v11 ' + D_cym1, 'v10 ' + D_snr, 'v10 ' + D_snr, 'v10 ' + D_run,
    'v10 ' + D_snr, 'v10 ' + D_snr, 'v10 ' + D_snr, D_end,
  ]
  SONGS.field = mkSong({ tempo: 132, bars: 16, mel, mel2, tri, noi, peak: 0.5 })
}

// 2. ボス戦（ホ短調、テンポ 164、16 小節）：休みなく進む 8 分のベースと、16 分の駆け上がりのドラム
{
  const A = [
    'v12 o5 e8 e8 g8 b8 >e4 <b8 g8', 'o5 c8 c8 e8 g8 >c4 <g8 e8', 'o5 d8 d8 f+8 a8 >d4 <a8 f+8', 'o5 b8 b8 >d+8 f+8 b4 f+8 d+8',
  ]
  const Bm = [
    'v13 o5 e8 g8 b8 >e8 g4 e8 <b8', 'o5 c8 e8 g8 >c8 e4 c8 <g8', 'o5 d8 f+8 a8 >d8 f+4 d8 <a8', 'o5 b8 >d+8 f+8 b8 >d+4 <b8 f+8',
  ]
  const C = [
    'v13 o6 e4 g4 f+4 e4', 'o6 c4 e4 g4 e4', 'o6 d4 f+4 a4 f+4', 'o6 b4. a8 f+2',
    'o6 g4 e4 b4 g4', 'o6 e4 c4 g4 e4', 'o6 f+4 d4 a4 f+4', 'o5 @p8 b2 @p >d+2',
  ]
  const mel = [...A, ...Bm, ...C]
  const mel2 = ['r1', 'r1', 'r1', 'r1', ...Bm.map((b) => 'V5 ' + echoBar(b)), ...C.map((b) => 'V11 @p23 ' + det(b))]
  const pulse = (r) => `o2 l8 ${r} ${r} >${r} ${r} <${r} ${r} >${r} ${r}`
  const tri = [
    pulse('e'), pulse('c'), pulse('d'), pulse('b'),
    pulse('e'), pulse('c'), pulse('d'), pulse('b'),
    pulse('e'), pulse('c'), pulse('d'), pulse('b'),
    pulse('e'), pulse('c'), pulse('d'), pulse('b'),
  ]
  const noi = [
    'v8 ' + D_drive, 'v8 ' + D_drive, 'v8 ' + D_drive, 'v8 ' + D_run,
    'v10 ' + D_drive, 'v10 ' + D_drive, 'v10 ' + D_drive, 'v10 ' + D_run,
    'v12 ' + D_cym1, 'v11 ' + D_drive, 'v11 ' + D_drive, 'v11 ' + D_run,
    'v12 ' + D_cym1, 'v11 ' + D_drive, 'v11 ' + D_drive, 'v12 ' + D_fill,
  ]
  SONGS.boss = mkSong({ tempo: 164, bars: 16, mel, mel2, tri, noi, peak: 0.55, vel: 13 })
}

// 3. エンディング（ハ長調、テンポ 112、12 小節。繰り返さない）：静かに始まり、盛り上がって終わる
{
  const mel = [
    'v10 o5 e2 g2', 'o5 a2 g2', 'o5 f2 e2', 'o5 d2 g2',
    'v12 o5 e4 g4 >c4 <g4', 'o5 a4 >c4 f4 c4', 'o5 g4 >c4 e4 d4', 'o6 c1',
    'v13 o6 e4 g4 >c4 <g4', 'o6 f4 a4 >c4 a4', 'o6 e4 g4 >d4 g4', 'o6 @p8 c1 @p',
  ]
  const mel2 = ['r1', 'r1', 'r1', 'r1', ...mel.slice(4, 7).map((b) => 'V5 ' + echoBar(b)), 'r1', ...mel.slice(8).map((b) => 'V11 @p23 ' + det(b))]
  const tri = [bassBar('c'), bassBar('a'), bassBar('f'), bassBar('g'), bassBar('c'), bassBar('f'), bassBar('g'), bassBar('c'), bassBar('c'), bassBar('f'), bassBar('g'), bassBar('c')]
  const noi = [...Array(4).fill('r1'), ...Array(3).fill('v7 ' + D_hat), 'v8 ' + D_fill, 'v10 ' + D_cym1, 'v10 ' + D_snr, 'v10 ' + D_snr, 'v12 ' + D_end]
  SONGS.ending = mkSong({ tempo: 112, bars: 12, mel, mel2, tri, noi, peak: 0.55, loop: false })
}
