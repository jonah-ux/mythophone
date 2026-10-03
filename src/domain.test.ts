import { describe, expect, it } from 'vitest'
import source from './presets.json'
import { exportPreset, importPreset, NoteSchema, PresetSchema } from './domain'

describe('prepared instrument boundary', () => {
  it('validates three distinct shipped presets', () => {
    const presets = source.map(value => PresetSchema.parse(value))
    expect(new Set(presets.map(preset => preset.oscillator)).size).toBe(3)
  })
  it('round-trips a playable preset without an AI request', () => {
    expect(importPreset(exportPreset(source[0]))).toEqual(source[0])
  })
  it('refuses invalid versions, unsupported oscillators, and excessive gain', () => {
    expect(() => PresetSchema.parse({ ...source[0], schema: 'mythophone/preset/v2' })).toThrow()
    expect(() => PresetSchema.parse({ ...source[0], oscillator: 'generated-code' })).toThrow()
    expect(() => PresetSchema.parse({ ...source[0], gain: 1 })).toThrow()
  })
  it('refuses non-finite values and malformed or oversized imports', () => {
    expect(() => PresetSchema.parse({ ...source[0], cutoff: NaN })).toThrow()
    expect(() => importPreset('{')).toThrow()
    expect(() => importPreset(' '.repeat(8193))).toThrow()
  })
  it('refuses fractional or out-of-range performance notes', () => {
    expect(NoteSchema.parse(60)).toBe(60)
    expect(() => NoteSchema.parse(60.5)).toThrow()
    expect(() => NoteSchema.parse(100)).toThrow()
  })
})
