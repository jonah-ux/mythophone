import { describe, expect, it } from 'vitest'
import source from './presets.json'
import { analyzeRenderedAudio, AUDIO_LIMITS, compilePatch } from './audio'
import { parsePatch } from './domain'

describe('audio engine contracts', () => {
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
