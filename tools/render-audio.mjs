#!/usr/bin/env node
// 効果音と BGM を、PX-13h の音源（PX-13h Music と同じ engine.wasm）で鳴らして public/audio/*.ogg（と、ogg が使えない端末用の *.wav）に書き出す。
//   node tools/render-audio.mjs            全部
//   node tools/render-audio.mjs field boss  指定したものだけ
// BGM は music/<名前>.song（PX-13h Music で編集）、効果音は tools/sounds.mjs
// PX-13h の場所は環境変数 PX13H（既定は ../px13h）。ffmpeg が要る
import { readFileSync, writeFileSync, copyFileSync, mkdirSync, existsSync } from 'fs'
import { execFileSync } from 'child_process'
import { fileURLToPath } from 'url'
import { dirname, join, resolve } from 'path'
import { ENVELOPES, SE, BGM } from './sounds.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const px = resolve(process.env.PX13H || join(here, '../../px13h'))
const { Engine } = await import(join(px, 'tools/music/web/engine.js'))
const { parseSong, compose, analyze, buildTracks, engineSong } = await import(join(px, 'tools/music/web/song.js'))
const wasm = readFileSync(join(px, 'tools/music/web/engine.wasm'))
const out = join(here, '../public/audio')
mkdirSync(out, { recursive: true })
const RATE = 48000

async function render(tracks, { loop = false, seconds = 0, envelopes = ENVELOPES, instruments = [], samples = [] } = {}) {
  const e = await Engine.load(wasm)
  e.setSong({ mode: 0, tracks, envelopes, instruments, samples })
  e.play()
  const chunks = []
  let n = 0
  const limit = (seconds || 60) * RATE
  while (n < limit && (loop || e.playing())) {
    chunks.push(Int16Array.from(e.render(800)))
    n += 800
  }
  const all = new Int16Array(n)
  let o = 0
  for (const c of chunks) { all.set(c, o); o += c.length }
  return all
}

function trimSilence(s) {
  let end = s.length
  while (end > 0 && Math.abs(s[end - 1]) < 60) end--
  return s.slice(0, Math.min(s.length, end + 480))
}
function normalize(s, peak) {
  let p = 0
  for (const v of s) p = Math.max(p, Math.abs(v))
  const g = p ? (peak * 32767) / p : 1
  return Int16Array.from(s, (v) => Math.round(v * g))
}
function writeOgg(name, s) {
  const data = Buffer.from(s.buffer, s.byteOffset, s.byteLength)
  const h = Buffer.alloc(44)
  h.write('RIFF', 0); h.writeUInt32LE(36 + data.length, 4); h.write('WAVE', 8); h.write('fmt ', 12)
  h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(RATE, 24); h.writeUInt32LE(RATE * 2, 28)
  h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write('data', 36); h.writeUInt32LE(data.length, 40)
  const wav = `/tmp/gunzo-${name}.wav`
  writeFileSync(wav, Buffer.concat([h, data]))
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', wav, '-c:a', 'libvorbis', '-q:a', '4', join(out, `${name}.ogg`)])
  copyFileSync(wav, join(out, `${name}.wav`)) // ogg を再生できない端末（古い Safari など）用
  console.log(`${name}.ogg / .wav  ${(s.length / RATE).toFixed(2)} 秒`)
}

// 曲（music/<名前>.song）を読む。書き間違い・長さのずれがあれば止める。選んだ候補（.picks.json）も当てはめる
const MUSIC_DIR = join(here, '../music')
function loadSong(name) {
  const file = join(MUSIC_DIR, `${name}.song`)
  const song = parseSong(readFileSync(file, 'utf8'))
  const pf = file.replace(/\.song$/, '.picks.json')
  const picks = existsSync(pf) ? JSON.parse(readFileSync(pf, 'utf8')) : {}
  const composed = compose(song, picks)
  const a = analyze(song, composed)
  const errors = [...song.errors, ...a.errors]
  if (errors.length) { console.error(`${name}.song:\n  ${errors.join('\n  ')}`); process.exit(1) }
  const { envelopes, instruments, samples } = engineSong(song, {}, ENVELOPES)   // 書いていない番号は今までのもの。音色（@i）と DPCM のサンプルも
  return { song, composed, a, envelopes, instruments, samples, bars: composed.bars.length, tempo: song.tempo }
}
const tracksOf = (S, loop) => buildTracks(S.song, S.composed, S.a, -Infinity, Infinity, loop).tracks

// 繰り返しの 1 周分を取り出す。2 周目を切り出すので、1 周目の余韻が頭に重なって、つなぎ目が自然になる
async function renderLoop(S) {
  const t = (S.bars * 4 * 60) / S.tempo
  const period = Math.round(t * RATE)
  const two = await render(tracksOf(S, true), { loop: true, seconds: (period * 2 + 2400) / RATE, envelopes: S.envelopes, instruments: S.instruments, samples: S.samples })
  console.log(`1 周: 計算上 ${t.toFixed(3)} 秒`)
  return two.slice(period, period * 2)
}

const want = process.argv.slice(2)
const all = want.length === 0
for (const [name, def] of Object.entries(BGM)) {
  if (!all && !want.includes(name)) continue
  const S = loadSong(name)
  if (def.loop) writeOgg(name, normalize(await renderLoop(S), def.peak))
  else writeOgg(name, normalize(trimSilence(await render(tracksOf(S, false), { envelopes: S.envelopes, instruments: S.instruments, samples: S.samples })), def.peak))
}
for (const [name, def] of Object.entries(SE)) {
  if (!all && !want.includes(name)) continue
  const s = trimSilence(await render(def.tracks))
  writeOgg(name, normalize(s, def.peak))
}
