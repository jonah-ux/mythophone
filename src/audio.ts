import { NoteSchema, PresetSchema } from './domain'

export function createInstrument(context: BaseAudioContext, value: unknown) {
  const preset = PresetSchema.parse(value)
  const master = context.createGain()
  master.gain.value = 0.8
  master.connect(context.destination)
  const voices = new Set<{ release: (at?: number) => void }>()
  let disposed = false

  function noteOn(value: unknown) {
    if (disposed) throw new Error('instrument disposed')
    const note = NoteSchema.parse(value)
    if (voices.size >= 8) throw new Error('starter voice limit reached')
    const oscillator = context.createOscillator()
    const filter = context.createBiquadFilter()
    const envelope = context.createGain()
    const start = context.currentTime
    let planned = Infinity
    oscillator.type = preset.oscillator
    oscillator.frequency.value = 440 * 2 ** ((note - 69) / 12)
    filter.type = 'lowpass'
    filter.frequency.value = preset.cutoff
    envelope.gain.setValueAtTime(0, start)
    envelope.gain.linearRampToValueAtTime(preset.gain, start + preset.attack)
    oscillator.connect(filter).connect(envelope).connect(master)
    const voice = {
      release: (at?: number) => {
        const now = context.currentTime
        const when = at ?? now
        if (!Number.isFinite(when) || when < now || when > now + 10) throw new Error('invalid note release time')
        if (when >= planned) return
        planned = when
        const level = preset.gain * Math.min(Math.max((when - start) / preset.attack, 0), 1)
        envelope.gain.cancelScheduledValues(when)
        envelope.gain.setValueAtTime(level, when)
        envelope.gain.linearRampToValueAtTime(0, when + preset.release)
        oscillator.stop(when + preset.release + 0.02)
      },
    }
    voices.add(voice)
    oscillator.onended = () => {
      oscillator.disconnect(); filter.disconnect(); envelope.disconnect(); voices.delete(voice)
    }
    oscillator.start(start)
    return voice
  }

  function allNotesOff() { for (const voice of voices) voice.release() }
  return {
    preset, noteOn, allNotesOff,
    activeVoiceCount: () => voices.size,
    dispose: () => { if (!disposed) { allNotesOff(); master.disconnect(); disposed = true } },
  }
}
