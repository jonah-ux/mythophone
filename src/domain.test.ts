import { describe, expect, it } from 'vitest'
import source from './presets.json'
import {
  exportPatch,
  importPatch,
  NoteSchema,
  parsePatch,
  PatchSchema,
  PerformanceEventSchema,
  upgradeLegacyPreset,
} from './domain'

describe('bounded patch boundary', () => {
  it('validates three distinct prepared patch graphs', () => {
    const patches = source.map(value => PatchSchema.parse(value))
    expect(new Set(patches.map(patch => patch.oscillator.type)).size).toBe(3)
    expect(patches.every(patch => patch.schema === 'mythophone/patch/v1')).toBe(true)
  })

  it('round-trips a portable patch without an AI request', () => {
    const patch = parsePatch(source[0])
    expect(importPatch(exportPatch(patch))).toEqual(patch)
  })

  it('upgrades the starter preset format into the bounded patch compiler format', () => {
    const patch = upgradeLegacyPreset({
      schema: 'mythophone/preset/v1',
      id: 'legacy',
      name: 'Legacy',
      oscillator: 'triangle',
      gain: 0.08,
      cutoff: 1800,
      attack: 0.12,
      release: 0.4,
    })
    expect(patch.schema).toBe('mythophone/patch/v1')
    expect(patch.envelope.level).toBe(0.08)
    expect(patch.noise.mix).toBe(0)
  })

  it('refuses incompatible versions, unsupported nodes, extreme values, and excess voices', () => {
    expect(() => PatchSchema.parse({ ...source[0], schema: 'mythophone/patch/v2' })).toThrow()
    expect(() => PatchSchema.parse({ ...source[0], oscillator: { ...source[0].oscillator, type: 'generated-code' } })).toThrow()
    expect(() => PatchSchema.parse({ ...source[0], filter: { ...source[0].filter, cutoff: Infinity } })).toThrow()
    expect(() => PatchSchema.parse({ ...source[0], voiceLimit: 13 })).toThrow()
    expect(() => PatchSchema.parse({ ...source[0], graph: { nodes: [] } })).toThrow()
  })

  it('refuses malformed or oversized imports and keeps note ranges musical', () => {
    expect(() => importPatch('{')).toThrow()
    expect(() => importPatch(' '.repeat(16_385))).toThrow()
    expect(NoteSchema.parse(60)).toBe(60)
    expect(() => NoteSchema.parse(60.5)).toThrow()
    expect(() => NoteSchema.parse(100)).toThrow()
  })

  it('bounds compact performance events', () => {
    expect(PerformanceEventSchema.parse({ type: 'note-on', at: 0.1, note: 60, velocity: 0.8 })).toEqual({ type: 'note-on', at: 0.1, note: 60, velocity: 0.8 })
    expect(PerformanceEventSchema.parse({ type: 'macro', at: 0.2, name: 'texture', value: 0.5 })).toEqual({ type: 'macro', at: 0.2, name: 'texture', value: 0.5 })
    expect(() => PerformanceEventSchema.parse({ type: 'note-on', at: -1, note: 60, velocity: 0.8 })).toThrow()
    expect(() => PerformanceEventSchema.parse({ type: 'shell', at: 0, command: 'rm -rf /' })).toThrow()
  })
})
