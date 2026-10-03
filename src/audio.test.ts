import { describe, expect, it } from 'vitest'
import source from './presets.json'
import { analyzeRenderedAudio, AUDIO_LIMITS, compilePatch, createInstrument } from './audio'
import { parsePatch } from './domain'

function schedulingContext() {
  const parameter = (value: number) => ({
    value,
    calls: [] as Array<{ kind: string; value: number; at: number }>,
    cancelScheduledValues(at: number) { this.calls.push({ kind: 'cancel', value: 0, at }) },
    setValueAtTime(value: number, at: number) { this.calls.push({ kind: 'set', value, at }) },
    linearRampToValueAtTime(value: number, at: number) { this.calls.push({ kind: 'ramp', value, at }) },
  })
  const filters: Array<{ frequency: ReturnType<typeof parameter> }> = []
  const oscillators: Array<{ onended: (() => void) | null }> = []
  const node = () => ({ connect(next: unknown) { return next }, disconnect() {}, start() {}, stop() {}, onended: null })
  const context = {
    currentTime: 0, sampleRate: 100, destination: {},
    createBuffer: (_channels: number, length: number) => ({ getChannelData: () => new Float32Array(length) }),
    createGain: () => ({ ...node(), gain: parameter(1) }),
    createOscillator: () => { const oscillator = { ...node(), onended: null as (() => void) | null, frequency: parameter(440), detune: parameter(0) }; oscillators.push(oscillator); return oscillator },
    createBufferSource: node,
    createBiquadFilter: () => { const filter = { ...node(), frequency: parameter(350), Q: parameter(1) }; filters.push(filter); return filter },
  }
  return { context: context as unknown as BaseAudioContext, filters, oscillators }
}

describe('audio engine contracts', () => {
  it('notifies the activity consumer when an asynchronous voice end drains the graph', () => {
    const { context, oscillators } = schedulingContext()
    let ended = 0
    const instrument = createInstrument(context, source[0], () => { ended += 1 })
    instrument.noteOn(60).release()
    expect(instrument.activeVoiceCount()).toBe(1)
    oscillators[0].onended?.()
    expect(instrument.activeVoiceCount()).toBe(0)
    expect(ended).toBe(1)
    instrument.dispose()
  })

  it('bounds rapid voice stealing even while released oscillators have not ended', () => {
    const { context } = schedulingContext()
    const instrument = createInstrument(context, { ...source[0], voiceLimit: 2 })
    for (let index = 0; index < 20; index++) {
      instrument.noteOn(60 + index % 12)
      expect(instrument.activeVoiceCount()).toBeLessThanOrEqual(2)
    }
    instrument.dispose()
  })

  it('continues future macro ramps from the scheduled value, not a stale render quantum', () => {
    const { context, filters } = schedulingContext()
    const patch = compilePatch(source[0])
    const instrument = createInstrument(context, patch)
    instrument.noteOnAt(60, 0)
    instrument.setMacro('brightness', 1, 1)
    instrument.setMacro('brightness', 0, 2)
    const start = filters[0].frequency.calls.find(call => call.kind === 'set' && call.at === 2)
    expect(start?.value).toBeCloseTo(Math.min(patch.filter.cutoff * 2, 12000))
    instrument.dispose()
  })

  it('compiles only the bounded patch schema and exposes resource limits', () => {
    const patch = compilePatch(source[0])
    expect(patch.schema).toBe('mythophone/patch/v1')
    expect(patch.voiceLimit).toBeLessThanOrEqual(AUDIO_LIMITS.maxVoices)
    expect(() => compilePatch({ ...patch, oscillator: { ...patch.oscillator, type: 'audio-worklet' } })).toThrow()
  })

  it('measures finite signal energy and tail behavior from an AudioBuffer-shaped render', () => {
    const sampleRate = 1000
    const samples = Float32Array.from({ length: 1000 }, (_, index) => index < 700 ? Math.sin(index / 8) * 0.2 : 0)
    const buffer = { sampleRate, duration: 1, getChannelData: () => samples } as unknown as AudioBuffer
    const result = analyzeRenderedAudio(buffer)
    expect(result.finite).toBe(true)
    expect(result.peak).toBeGreaterThan(0.1)
    expect(result.rms).toBeGreaterThan(0)
    expect(result.tailRms).toBe(0)
    expect(result.nonSilentSamples).toBeGreaterThan(500)
  })

  it('keeps prepared patches distinct at the compiler boundary', () => {
    const patches = source.map(parsePatch)
    expect(new Set(patches.map(patch => patch.oscillator.type + ':' + patch.noise.mix + ':' + patch.filter.type)).size).toBe(3)
  })
})
