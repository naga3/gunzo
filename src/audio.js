// 音：書き出した ogg（public/audio/）を再生するだけ（まだ音がないときは何もしない）
const BASE = import.meta.env?.BASE_URL ?? './'
const SFX = ['rescue', 'lost', 'win', 'over', 'switch', 'levelup', 'swing', 'shot', 'hit']
const MUSIC = ['field', 'boss', 'ending']

function createAudio() {
  let ctx = null
  let enabled = true
  const buffers = {}
  let musicNode = null
  let musicName = null
  let wanted = null
  const ensure = () => {
    if (ctx) return ctx
    const AC = window.AudioContext || window.webkitAudioContext
    if (!AC) return null
    ctx = new AC()
    return ctx
  }
  async function load(name) {
    if (buffers[name] !== undefined) return buffers[name]
    buffers[name] = null
    try {
      const c = ensure()
      const ext = document.createElement('audio').canPlayType('audio/ogg; codecs="vorbis"') ? 'ogg' : 'wav'
      const res = await fetch(`${BASE}audio/${name}.${ext}`)
      if (!res.ok) return null
      buffers[name] = await c.decodeAudioData(await res.arrayBuffer())
    } catch { buffers[name] = null }
    return buffers[name]
  }
  function stopMusic() {
    if (musicNode) { try { musicNode.stop() } catch { /* ignore */ } musicNode = null }
    musicName = null
  }
  async function startMusic(name) {
    const buf = await load(name)
    if (!buf || !enabled || wanted !== name) return
    stopMusic()
    const src = ctx.createBufferSource()
    src.buffer = buf
    src.loop = name !== 'ending'
    const g = ctx.createGain()
    g.gain.value = 0.5
    src.connect(g).connect(ctx.destination)
    src.start()
    musicNode = src
    musicName = name
  }
  return {
    unlock() { const c = ensure(); if (c && c.state === 'suspended') c.resume(); if (wanted && !musicName) startMusic(wanted) },
    setEnabled(v) { enabled = v; if (!v) stopMusic(); else if (wanted) startMusic(wanted) },
    music(name) {
      wanted = name
      if (!name) { stopMusic(); return }
      if (musicName !== name && ctx && enabled) startMusic(name)
    },
    async sfx(name) {
      if (!enabled || !ctx) return
      const buf = await load(name)
      if (!buf) return
      const src = ctx.createBufferSource()
      src.buffer = buf
      const g = ctx.createGain()
      g.gain.value = 0.6
      src.connect(g).connect(ctx.destination)
      src.start()
    },
    names: { SFX, MUSIC },
  }
}
export const audio = createAudio()
