import { z } from 'zod'

const bounded = (min: number, max: number) => z.number().finite().min(min).max(max)

export const OscillatorTypeSchema = z.enum(['sine', 'triangle', 'sawtooth', 'square'])
export const MacroNameSchema = z.enum(['brightness', 'texture', 'motion'])

const OscillatorSchema = z.object({
  type: OscillatorTypeSchema,
  mix: bounded(0, 1),
  detune: bounded(-24, 24),
  octave: z.number().int().min(-2).max(2),
}).strict()

const NoiseSchema = z.object({
  mix: bounded(0, 1),
  color: z.literal('white'),
}).strict()

const EnvelopeSchema = z.object({
  level: bounded(0.005, 0.12),
  attack: bounded(0.005, 2),
  decay: bounded(0, 2),
  sustain: bounded(0, 1),
  release: bounded(0.01, 4),
}).strict()

const FilterSchema = z.object({
  type: z.enum(['lowpass', 'bandpass']),
  cutoff: bounded(100, 12000),
  resonance: bounded(0, 18),
}).strict()

export const PatchSchema = z.object({
  schema: z.literal('mythophone/patch/v1'),
  id: z.string().regex(/^[a-z][a-z0-9-]{0,39}$/),
  name: z.string().min(1).max(80),
  description: z.string().min(1).max(240),
  oscillator: OscillatorSchema,
  subOscillator: OscillatorSchema.nullable(),
  noise: NoiseSchema,
  envelope: EnvelopeSchema,
  filter: FilterSchema,
  masterGain: bounded(0.1, 1),
  voiceLimit: z.number().int().min(1).max(12),
  macros: z.object({
    brightness: bounded(0, 1),
    texture: bounded(0, 1),
    motion: bounded(0, 1),
  }).strict(),
}).strict()

export type Patch = z.infer<typeof PatchSchema>

/**
 * The starter shipped a smaller preset/v1 shape. Keep imports compatible while
 * writing the bounded patch/v1 format from this point forward.
 */
const LegacyPresetSchema = z.object({
  schema: z.literal('mythophone/preset/v1'),
  id: z.string().regex(/^[a-z][a-z0-9-]{0,39}$/),
  name: z.string().min(1).max(80),
  oscillator: OscillatorTypeSchema,
  gain: bounded(0, 0.12),
  cutoff: bounded(100, 8000),
  attack: bounded(0.005, 2),
  release: bounded(0.01, 4),
}).strict()

export const PresetSchema = PatchSchema
export type Preset = Patch

export const NoteSchema = z.number().int().min(48).max(84)

const EventTimeSchema = bounded(0, 600)
const VelocitySchema = bounded(0.01, 1)

export const PerformanceEventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('note-on'), at: EventTimeSchema, note: NoteSchema, velocity: VelocitySchema }).strict(),
  z.object({ type: z.literal('note-off'), at: EventTimeSchema, note: NoteSchema }).strict(),
  z.object({ type: z.literal('sustain'), at: EventTimeSchema, value: z.boolean() }).strict(),
  z.object({ type: z.literal('macro'), at: EventTimeSchema, name: MacroNameSchema, value: bounded(0, 1) }).strict(),
])

export type PerformanceEvent = z.infer<typeof PerformanceEventSchema>

export function upgradeLegacyPreset(value: unknown): Patch {
  const legacy = LegacyPresetSchema.parse(value)
  return {
    schema: 'mythophone/patch/v1',
    id: legacy.id,
    name: legacy.name,
    description: 'Upgraded from the Mythophone starter preset format.',
    oscillator: { type: legacy.oscillator, mix: 1, detune: 0, octave: 0 },
    subOscillator: null,
    noise: { mix: 0, color: 'white' },
    envelope: { level: legacy.gain, attack: legacy.attack, decay: 0.18, sustain: 0.78, release: legacy.release },
    filter: { type: 'lowpass', cutoff: legacy.cutoff, resonance: 0 },
    masterGain: 0.8,
    voiceLimit: 8,
    macros: { brightness: 0.55, texture: 0.1, motion: 0.08 },
  }
}

export function parsePatch(value: unknown): Patch {
  const parsed = PatchSchema.safeParse(value)
  if (parsed.success) return parsed.data
  return upgradeLegacyPreset(value)
}

export function importPatch(raw: string): Patch {
  if (raw.length > 16_384) throw new Error('patch exceeds 16 KiB size limit')
  return parsePatch(JSON.parse(raw))
}

export function exportPatch(value: unknown): string {
  return JSON.stringify(PatchSchema.parse(value), null, 2)
}

// Compatibility names used by the starter UI and downstream examples.
export const importPreset = importPatch
export const exportPreset = exportPatch
