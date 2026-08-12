let ctx: AudioContext | null = null
let masterGain: GainNode | null = null
let sfxGain: GainNode | null = null
let ambientGain: GainNode | null = null
let isMuted = false
let initialized = false

/** Zainicjuj AudioContext (musi być wywołane z event handlera, np. click). */
export function initAudio() {
  if (initialized) return
  initialized = true
  ctx = new AudioContext()
  masterGain = ctx.createGain()
  masterGain.gain.value = 0.3
  masterGain.connect(ctx.destination)

  sfxGain = ctx.createGain()
  sfxGain.gain.value = 0.8
  sfxGain.connect(masterGain)

  ambientGain = ctx.createGain()
  ambientGain.gain.value = 0.08
  ambientGain.connect(masterGain)
}

function getCtx(): AudioContext {
  if (!ctx) initAudio()
  if (ctx!.state === 'suspended') ctx!.resume()
  return ctx!
}

function noiseBuffer(ctx: AudioContext, duration: number): AudioBuffer {
  const sr = ctx.sampleRate
  const len = sr * duration
  const buf = ctx.createBuffer(1, len, sr)
  const data = buf.getChannelData(0)
  for (let i = 0; i < len; i++) {
    data[i] = Math.random() * 2 - 1
  }
  return buf
}


export function playMineSound() {
  const c = getCtx()
  if (!c || isMuted || !sfxGain) return

  const osc = c.createOscillator()
  const gain = c.createGain()
  const noise = c.createBufferSource()
  noise.buffer = noiseBuffer(c, 0.08)

  osc.type = 'triangle'
  osc.frequency.setValueAtTime(200 + Math.random() * 150, c.currentTime)
  osc.frequency.exponentialRampToValueAtTime(80, c.currentTime + 0.1)

  gain.gain.setValueAtTime(0.3, c.currentTime)
  gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.12)

  const noiseGain = c.createGain()
  noiseGain.gain.setValueAtTime(0.15, c.currentTime)
  noiseGain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.08)

  osc.connect(gain)
  gain.connect(sfxGain)
  noise.connect(noiseGain)
  noiseGain.connect(sfxGain)

  osc.start(c.currentTime)
  osc.stop(c.currentTime + 0.12)
  noise.start(c.currentTime)
  noise.stop(c.currentTime + 0.08)
}

export function playBuildSound() {
  const c = getCtx()
  if (!c || isMuted || !sfxGain) return

  const osc = c.createOscillator()
  const gain = c.createGain()
  osc.type = 'square'
  osc.frequency.setValueAtTime(300, c.currentTime)
  osc.frequency.exponentialRampToValueAtTime(600, c.currentTime + 0.08)
  osc.frequency.exponentialRampToValueAtTime(400, c.currentTime + 0.15)

  gain.gain.setValueAtTime(0.2, c.currentTime)
  gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.2)

  osc.connect(gain)
  gain.connect(sfxGain)
  osc.start(c.currentTime)
  osc.stop(c.currentTime + 0.2)
}

export function playCraftSound() {
  const c = getCtx()
  if (!c || isMuted || !sfxGain) return

  const osc = c.createOscillator()
  const gain = c.createGain()
  osc.type = 'sine'
  osc.frequency.setValueAtTime(400, c.currentTime)
  osc.frequency.exponentialRampToValueAtTime(800, c.currentTime + 0.1)
  osc.frequency.exponentialRampToValueAtTime(600, c.currentTime + 0.2)

  gain.gain.setValueAtTime(0.15, c.currentTime)
  gain.gain.linearRampToValueAtTime(0.1, c.currentTime + 0.1)
  gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.3)

  const osc2 = c.createOscillator() as OscillatorNode
  osc2.type = 'triangle'
  osc2.frequency.setValueAtTime(600, c.currentTime)
  osc2.frequency.exponentialRampToValueAtTime(1200, c.currentTime + 0.15)

  const gain2 = c.createGain()
  gain2.gain.setValueAtTime(0.08, c.currentTime)
  gain2.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.25)

  osc.connect(gain)
  gain.connect(sfxGain)
  osc2.connect(gain2)
  gain2.connect(sfxGain)

  osc.start(c.currentTime)
  osc.stop(c.currentTime + 0.3)
  osc2.start(c.currentTime + 0.05)
  osc2.stop(c.currentTime + 0.3)
}

export function playEnemyHitSound() {
  const c = getCtx()
  if (!c || isMuted || !sfxGain) return

  const osc = c.createOscillator()
  const gain = c.createGain()
  osc.type = 'sawtooth'
  osc.frequency.setValueAtTime(150, c.currentTime)
  osc.frequency.exponentialRampToValueAtTime(40, c.currentTime + 0.15)

  gain.gain.setValueAtTime(0.25, c.currentTime)
  gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.15)

  const noise = c.createBufferSource() as AudioBufferSourceNode
  noise.buffer = noiseBuffer(c, 0.1)
  const noiseGn = c.createGain()
  noiseGn.gain.setValueAtTime(0.2, c.currentTime)
  noiseGn.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.1)

  osc.connect(gain)
  gain.connect(sfxGain)
  noise.connect(noiseGn)
  noiseGn.connect(sfxGain)

  osc.start(c.currentTime)
  osc.stop(c.currentTime + 0.15)
  noise.start(c.currentTime)
  noise.stop(c.currentTime + 0.1)
}

export function playEnemyDeathSound() {
  const c = getCtx()
  if (!c || isMuted || !sfxGain) return

  const osc = c.createOscillator()
  const gain = c.createGain()
  osc.type = 'sawtooth'
  osc.frequency.setValueAtTime(400, c.currentTime)
  osc.frequency.exponentialRampToValueAtTime(60, c.currentTime + 0.3)

  gain.gain.setValueAtTime(0.2, c.currentTime)
  gain.gain.linearRampToValueAtTime(0.15, c.currentTime + 0.05)
  gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.35)

  const noise = c.createBufferSource()
  noise.buffer = noiseBuffer(c, 0.25)
  const noiseGn = c.createGain()
  noiseGn.gain.setValueAtTime(0.3, c.currentTime)
  noiseGn.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.25)

  osc.connect(gain)
  gain.connect(sfxGain)
  noise.connect(noiseGn)
  noiseGn.connect(sfxGain)

  osc.start(c.currentTime)
  osc.stop(c.currentTime + 0.35)
  noise.start(c.currentTime)
  noise.stop(c.currentTime + 0.25)
}

export function playResearchSound() {
  const c = getCtx()
  if (!c || isMuted || !sfxGain) return

  const notes = [523, 659, 784, 1047]
  notes.forEach((freq, i) => {
    const osc = c.createOscillator()
    const gain = c.createGain()
    const t = c.currentTime + i * 0.12
    osc.type = 'sine'
    osc.frequency.setValueAtTime(freq, t)
    gain.gain.setValueAtTime(0, t)
    gain.gain.linearRampToValueAtTime(0.12, t + 0.04)
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.25)
    osc.connect(gain)
    gain.connect(sfxGain!)
    osc.start(t)
    osc.stop(t + 0.25)
  })
}

export function playUISound() {
  const c = getCtx()
  if (!c || isMuted || !sfxGain) return

  const osc = c.createOscillator()
  const gain = c.createGain()
  osc.type = 'sine'
  osc.frequency.setValueAtTime(600, c.currentTime)
  osc.frequency.exponentialRampToValueAtTime(900, c.currentTime + 0.06)

  gain.gain.setValueAtTime(0.08, c.currentTime)
  gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.1)

  osc.connect(gain)
  gain.connect(sfxGain)
  osc.start(c.currentTime)
  osc.stop(c.currentTime + 0.1)
}

export function playLevelUpSound() {
  const c = getCtx()
  if (!c || isMuted || !sfxGain) return

  const notes = [523, 659, 784, 1047, 1319]
  notes.forEach((freq, i) => {
    const osc = c.createOscillator()
    const gain = c.createGain()
    const t = c.currentTime + i * 0.1
    osc.type = 'triangle'
    osc.frequency.setValueAtTime(freq, t)
    gain.gain.setValueAtTime(0, t)
    gain.gain.linearRampToValueAtTime(0.15, t + 0.03)
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.3)
    osc.connect(gain)
    gain.connect(sfxGain!)
    osc.start(t)
    osc.stop(t + 0.3)
  })
}

export function playAchievementSound() {
  const c = getCtx()
  if (!c || isMuted || !sfxGain) return

  const notes = [440, 554, 659, 880, 1109, 1319]
  notes.forEach((freq, i) => {
    const osc = c.createOscillator()
    const gain = c.createGain()
    const t = c.currentTime + i * 0.08
    osc.type = 'sine'
    osc.frequency.setValueAtTime(freq, t)
    gain.gain.setValueAtTime(0, t)
    gain.gain.linearRampToValueAtTime(0.12, t + 0.03)
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.35)
    osc.connect(gain)
    gain.connect(sfxGain!)
    osc.start(t)
    osc.stop(t + 0.35)
  })
}

let humInterval: ReturnType<typeof setInterval> | null = null

export function startAmbientHum() {
  if (humInterval) return
  const playHum = () => {
    const c = getCtx()
    if (!c || isMuted || !ambientGain) return

    const osc = c.createOscillator()
    const gain = c.createGain()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(50 + Math.random() * 20, c.currentTime)
    gain.gain.setValueAtTime(0.3 + Math.random() * 0.2, c.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 2 + Math.random() * 2)

    const osc2 = c.createOscillator()
    const gain2 = c.createGain()
    osc2.type = 'sine'
    osc2.frequency.setValueAtTime(70 + Math.random() * 30, c.currentTime)
    gain2.gain.setValueAtTime(0.15 + Math.random() * 0.1, c.currentTime)
    gain2.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 3 + Math.random() * 3)

    osc.connect(gain)
    gain.connect(ambientGain!)
    osc2.connect(gain2)
    gain2.connect(ambientGain!)
    osc.start(c.currentTime)
    osc.stop(c.currentTime + 4)
    osc2.start(c.currentTime)
    osc2.stop(c.currentTime + 5)
  }
  playHum()
  humInterval = setInterval(playHum, 3000)
}

export function stopAmbientHum() {
  if (humInterval) {
    clearInterval(humInterval)
    humInterval = null
  }
}

export function toggleMute() {
  isMuted = !isMuted
  if (masterGain) {
    masterGain.gain.value = isMuted ? 0 : 0.3
  }
  return isMuted
}

export function getIsMuted() { return isMuted }
