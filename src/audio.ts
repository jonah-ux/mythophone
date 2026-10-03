import { MacroNameSchema, NoteSchema, PatchSchema, PerformanceEventSchema } from './domain'
import type { Patch, PerformanceEvent } from './domain'
import { z } from 'zod'

export type MacroName = z.infer<typeof MacroNameSchema>

export type VoiceHandle = {
  id: number
  note: number
  release: (at?: number) => void
}

export type AudioActivity = {
  activeVoices: number
  sustain: boolean
  macroValues: Record<MacroName, number>
  lastNote: number | null
}

export type RenderedAudioAnalysis = {
  duration: number
  peak: number
  rms: number
  tailRms: number
  estimatedFrequency: number | null
  finite: boolean
  nonSilentSamples: number
}

const MAX_PERFORMANCE_EVENTS = 1024
const MAX_RENDER_SECONDS = 600
const MAX_PEAK = 0.98
const scheduledRamps = new WeakMap<AudioParam, { start: number; end: number; from: number; to: number }>()

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function noteFrequency(note: number) {
  return 440 * 2 ** ((note - 69) / 12)
}

function scheduleRamp(param: AudioParam, value: number, at: number, duration = 0.025) {
  const start = Math.max(at, 0)
  const prior = scheduledRamps.get(param)
  const current = prior
    ? prior.end <= start ? prior.to : prior.start >= start ? prior.from : prior.from + (prior.to - prior.from) * (start - prior.start) / (prior.end - prior.start)
    : Number.isFinite(param.value) ? param.value : value
  param.cancelScheduledValues(start)
  // Preserve the part of an interrupted ramp before this event. Offline
  // scheduling cannot use AudioParam.value to read a future render quantum.
  if (prior && start > prior.start && start < prior.end) param.linearRampToValueAtTime(current, start)
  param.setValueAtTime(current, start)
  if (duration <= 0) param.setValueAtTime(value, start)
  else param.linearRampToValueAtTime(value, start + duration)
  scheduledRamps.set(param, { start, end: start + Math.max(0, duration), from: duration <= 0 ? value : current, to: value })
}

function levelAt(patch: Patch, elapsed: number, velocity: number) {
  const { attack, decay, sustain, level } = patch.envelope
  if (elapsed <= 0) return 0
  if (elapsed < attack) return level * velocity * elapsed / attack
  if (elapsed < attack + decay) {
    const progress = decay === 0 ? 1 : (elapsed - attack) / decay
    return level * velocity * (1 - (1 - sustain) * progress)
  }
  return level * velocity * sustain
}

function createNoiseBuffer(context: BaseAudioContext) {
  const length = Math.max(1, Math.floor(context.sampleRate * 2))
  const buffer = context.createBuffer(1, length, context.sampleRate)
  const samples = buffer.getChannelData(0)
  let state = 0x6d2b79f5
  for (let index = 0; index < samples.length; index += 1) {
    state = Math.imul(state ^ (state >>> 15), state | 1)
    state ^= state + Math.imul(state ^ (state >>> 7), state | 61)
    samples[index] = ((state ^ (state >>> 14)) >>> 0) / 4294967295 * 2 - 1
  }
  return buffer
}

function macroFilterCutoff(patch: Patch, brightness: number) {
  return clamp(patch.filter.cutoff * (0.55 + brightness * 1.45), 100, 12000)
}

function macroNoiseGain(patch: Patch, texture: number) {
  return clamp(patch.noise.mix * (0.35 + texture * 1.65), 0, 1)
}

export function compilePatch(value: unknown): Patch {
  return PatchSchema.parse(value)
}

export function createInstrument(context: BaseAudioContext, value: unknown, onVoiceEnded?: () => void) {
  const patch = compilePatch(value)
  const master = context.createGain()
  master.gain.setValueAtTime(clamp(patch.masterGain, 0.1, 1), context.currentTime)
  master.connect(context.destination)
  const noiseBuffer = createNoiseBuffer(context)
  const voices = new Map<number, InternalVoice>()
  const macros: Record<MacroName, number> = { ...patch.macros }
  let nextVoiceId = 1
  let disposed = false
  let sustain = false
  let lastNote: number | null = null

  type InternalVoice = VoiceHandle & {
    start: number
    velocity: number
    released: boolean
    keyUpPending: boolean
    oscillator: OscillatorNode
    subOscillator: OscillatorNode | null
    noiseSource: AudioBufferSourceNode
    oscillatorGain: GainNode
    subGain: GainNode | null
    noiseGain: GainNode
    filter: BiquadFilterNode
    envelope: GainNode
    lfo: OscillatorNode
    lfoGain: GainNode
    releaseAt: (at: number, force: boolean) => void
  }

  function updateVoiceMacros(voice: InternalVoice, at: number) {
    scheduleRamp(voice.filter.frequency, macroFilterCutoff(patch, macros.brightness), at)
    scheduleRamp(voice.noiseGain.gain, macroNoiseGain(patch, macros.texture), at)
    scheduleRamp(voice.lfoGain.gain, macros.motion * 26, at)
    scheduleRamp(voice.lfo.frequency, 2.5 + macros.motion * 8, at)
  }

  function removeVoice(voice: InternalVoice) {
    voices.delete(voice.id)
    voice.oscillator.disconnect()
    voice.subOscillator?.disconnect()
    voice.noiseSource.disconnect()
    voice.oscillatorGain.disconnect()
    voice.subGain?.disconnect()
    voice.noiseGain.disconnect()
    voice.filter.disconnect()
    voice.envelope.disconnect()
    voice.lfo.disconnect()
    voice.lfoGain.disconnect()
    onVoiceEnded?.()
  }

  function releaseVoice(voice: InternalVoice, at: number, force: boolean) {
    if (voice.released) return
    if (sustain && !force) {
      voice.keyUpPending = true
      return
    }
    voice.released = true
    voice.keyUpPending = false
    const when = Math.max(at, voice.start, context.currentTime)
    const currentLevel = levelAt(patch, when - voice.start, voice.velocity)
    voice.envelope.gain.cancelScheduledValues(when)
    voice.envelope.gain.setValueAtTime(currentLevel, when)
    voice.envelope.gain.linearRampToValueAtTime(0, when + patch.envelope.release)
    voice.oscillator.stop(when + patch.envelope.release + 0.04)
    voice.subOscillator?.stop(when + patch.envelope.release + 0.04)
    voice.noiseSource.stop(when + patch.envelope.release + 0.04)
    voice.lfo.stop(when + patch.envelope.release + 0.04)
  }

  function noteOnAt(value: unknown, at = context.currentTime, velocity = 1): VoiceHandle {
    if (disposed) throw new Error('instrument disposed')
    const note = NoteSchema.parse(value)
    const now = context.currentTime
    if (!Number.isFinite(at) || at < now - 0.05 || at > now + MAX_RENDER_SECONDS) {
      throw new Error('invalid note start time')
    }
    const startAt = Math.max(at, now)
    if (!Number.isFinite(velocity) || velocity < 0.01 || velocity > 1) throw new Error('invalid note velocity')
    if (voices.size >= patch.voiceLimit) {
      const oldest = voices.values().next().value as InternalVoice | undefined
      if (oldest) {
        // Stealing cuts at the new note's audio time; disconnecting now would
        // erase the earlier part of a voice scheduled in an offline render.
        oldest.released = true
        oldest.oscillator.stop(startAt)
        oldest.subOscillator?.stop(startAt)
        oldest.noiseSource.stop(startAt)
        oldest.lfo.stop(startAt)
        voices.delete(oldest.id)
      }
    }

    const oscillator = context.createOscillator()
    const subOscillator = patch.subOscillator ? context.createOscillator() : null
    const noiseSource = context.createBufferSource()
    const oscillatorGain = context.createGain()
    const subGain = subOscillator ? context.createGain() : null
    const noiseGain = context.createGain()
    const filter = context.createBiquadFilter()
    const envelope = context.createGain()
    const lfo = context.createOscillator()
    const lfoGain = context.createGain()
    const frequency = noteFrequency(note)
    const id = nextVoiceId++

    oscillator.type = patch.oscillator.type
    oscillator.frequency.setValueAtTime(frequency * 2 ** patch.oscillator.octave, startAt)
    oscillator.detune.setValueAtTime(patch.oscillator.detune, startAt)
    oscillatorGain.gain.setValueAtTime(patch.oscillator.mix, startAt)
    oscillator.connect(oscillatorGain).connect(filter)

    if (subOscillator && subGain && patch.subOscillator) {
      subOscillator.type = patch.subOscillator.type
      subOscillator.frequency.setValueAtTime(frequency * 2 ** patch.subOscillator.octave, startAt)
      subOscillator.detune.setValueAtTime(patch.subOscillator.detune, startAt)
      subGain.gain.setValueAtTime(patch.subOscillator.mix, startAt)
      subOscillator.connect(subGain).connect(filter)
    }

    noiseSource.buffer = noiseBuffer
    noiseSource.loop = true
    scheduleRamp(noiseGain.gain, macroNoiseGain(patch, macros.texture), startAt, 0)
    noiseSource.connect(noiseGain).connect(filter)
    filter.type = patch.filter.type
    scheduleRamp(filter.frequency, macroFilterCutoff(patch, macros.brightness), startAt, 0)
    filter.Q.setValueAtTime(patch.filter.resonance, startAt)

    envelope.gain.setValueAtTime(0, startAt)
    envelope.gain.linearRampToValueAtTime(patch.envelope.level * velocity, startAt + patch.envelope.attack)
    envelope.gain.linearRampToValueAtTime(patch.envelope.level * velocity * patch.envelope.sustain, startAt + patch.envelope.attack + patch.envelope.decay)
    filter.connect(envelope).connect(master)

    lfo.type = 'sine'
    scheduleRamp(lfo.frequency, 2.5 + macros.motion * 8, startAt, 0)
    scheduleRamp(lfoGain.gain, macros.motion * 26, startAt, 0)
    lfo.connect(lfoGain).connect(oscillator.detune)
    if (subOscillator) lfoGain.connect(subOscillator.detune)

    const voice: InternalVoice = {
      id,
      note,
      start: startAt,
      velocity,
      released: false,
      keyUpPending: false,
      oscillator,
      subOscillator,
      noiseSource,
      oscillatorGain,
      subGain,
      noiseGain,
      filter,
      envelope,
      lfo,
      lfoGain,
      release: (releaseAt?: number) => releaseVoice(voice, releaseAt ?? context.currentTime, false),
      releaseAt: (releaseAt: number, force: boolean) => releaseVoice(voice, releaseAt, force),
    }
    voices.set(id, voice)
    lastNote = note
    oscillator.onended = () => removeVoice(voice)
    oscillator.start(startAt)
    subOscillator?.start(startAt)
    noiseSource.start(startAt)
    lfo.start(startAt)
    return voice
  }

  function releaseNoteAt(note: number, at: number) {
    const candidates = [...voices.values()].filter(voice => voice.note === note && !voice.released).reverse()
    candidates[0]?.releaseAt(at, false)
  }

  function setMacroAt(name: MacroName, value: number, at = context.currentTime) {
    if (!Number.isFinite(value) || value < 0 || value > 1) throw new Error('invalid macro value')
    macros[name] = value
    for (const voice of voices.values()) updateVoiceMacros(voice, at)
  }

  function setSustainAt(value: boolean, at = context.currentTime) {
    sustain = value
    if (!sustain) {
      for (const voice of voices.values()) {
        if (voice.keyUpPending) voice.releaseAt(at, true)
      }
    }
  }

  function allNotesOff() {
    const now = context.currentTime
    for (const voice of voices.values()) voice.releaseAt(now, true)
  }

  return {
    patch,
    noteOn: (value: unknown, velocity = 1) => noteOnAt(value, context.currentTime, velocity),
    noteOnAt,
    noteOffAt: releaseNoteAt,
    setMacro: setMacroAt,
    setSustain: setSustainAt,
    allNotesOff,
    activeVoiceCount: () => voices.size,
    activity: (): AudioActivity => ({ activeVoices: voices.size, sustain, macroValues: { ...macros }, lastNote }),
    dispose: () => {
      if (disposed) return
      allNotesOff()
      master.disconnect()
      disposed = true
    },
  }
}

export function analyzeRenderedAudio(buffer: AudioBuffer): RenderedAudioAnalysis {
  const samples = buffer.getChannelData(0)
  const sampleRate = buffer.sampleRate
  let peak = 0
  let sumSquares = 0
  let finite = true
  let nonSilentSamples = 0
  let zeroCrossings = 0
  let previous = 0
  const analysisSamples = Math.min(samples.length, Math.floor(sampleRate * 0.25))
  for (let index = 0; index < samples.length; index += 1) {
    const sample = samples[index]
    if (!Number.isFinite(sample)) finite = false
    const magnitude = Math.abs(sample)
    peak = Math.max(peak, magnitude)
    sumSquares += Number.isFinite(sample) ? sample * sample : 0
    if (magnitude > 0.0005) nonSilentSamples += 1
    if (index < analysisSamples && previous < 0 && sample >= 0) zeroCrossings += 1
    previous = sample
  }
  const tailStart = Math.max(0, samples.length - Math.floor(sampleRate * 0.08))
  let tailSquares = 0
  for (let index = tailStart; index < samples.length; index += 1) tailSquares += samples[index] ** 2
  const estimatedFrequency = analysisSamples > 0 && zeroCrossings > 0
    ? zeroCrossings / (2 * (analysisSamples / sampleRate))
    : null
  return {
    duration: buffer.duration,
    peak,
    rms: Math.sqrt(sumSquares / Math.max(samples.length, 1)),
    tailRms: Math.sqrt(tailSquares / Math.max(samples.length - tailStart, 1)),
    estimatedFrequency,
    finite,
    nonSilentSamples,
  }
}

export async function renderPerformance(value: unknown, events: PerformanceEvent[], options?: { sampleRate?: number; duration?: number }) {
  const patch = compilePatch(value)
  if (events.length > MAX_PERFORMANCE_EVENTS) throw new Error('performance exceeds event limit')
  const parsedEvents = events.map(event => PerformanceEventSchema.parse(event)).sort((left, right) => left.at - right.at)
  if (typeof OfflineAudioContext === 'undefined') throw new Error('OfflineAudioContext is unavailable in this browser')
  const sampleRate = clamp(options?.sampleRate ?? 44100, 22050, 96000)
  const lastEvent = parsedEvents.at(-1)?.at ?? 0.3
  const duration = clamp(options?.duration ?? lastEvent + patch.envelope.release + 0.18, 0.4, MAX_RENDER_SECONDS)
  const context = new OfflineAudioContext(1, Math.ceil(sampleRate * duration), sampleRate)
  const instrument = createInstrument(context, patch)
  const active = new Map<number, VoiceHandle[]>()
  for (const event of parsedEvents) {
    if (event.type === 'note-on') {
      const voice = instrument.noteOnAt(event.note, event.at, event.velocity)
      active.set(event.note, [...(active.get(event.note) ?? []), voice])
    } else if (event.type === 'note-off') {
      const voicesForNote = active.get(event.note) ?? []
      voicesForNote.at(-1)?.release(event.at)
      active.set(event.note, voicesForNote.slice(0, -1))
    } else if (event.type === 'sustain') {
      instrument.setSustain(event.value, event.at)
    } else {
      instrument.setMacro(event.name, event.value, event.at)
    }
  }
  const buffer = await context.startRendering()
  instrument.dispose()
  return { buffer, patch, analysis: analyzeRenderedAudio(buffer) }
}

export const AUDIO_LIMITS = { maxVoices: 12, maxPerformanceEvents: MAX_PERFORMANCE_EVENTS, maxRenderSeconds: MAX_RENDER_SECONDS, maxPeak: MAX_PEAK }
