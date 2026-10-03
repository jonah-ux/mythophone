import { z } from 'zod'

export const PresetSchema = z.object({
  schema: z.literal('mythophone/preset/v1'),
  id: z.string().regex(/^[a-z][a-z0-9-]{0,39}$/),
  name: z.string().min(1).max(80),
  oscillator: z.enum(['sine', 'triangle', 'sawtooth', 'square']),
  gain: z.number().finite().min(0).max(0.12),
  cutoff: z.number().finite().min(100).max(8000),
  attack: z.number().finite().min(0.005).max(2),
  release: z.number().finite().min(0.01).max(4),
}).strict()

export const NoteSchema = z.number().int().min(48).max(84)
export type Preset = z.infer<typeof PresetSchema>

export function importPreset(raw: string): Preset {
  if (raw.length > 8192) throw new Error('preset exceeds starter size limit')
  return PresetSchema.parse(JSON.parse(raw))
}

export function exportPreset(value: unknown): string {
  return JSON.stringify(PresetSchema.parse(value), null, 2)
}
