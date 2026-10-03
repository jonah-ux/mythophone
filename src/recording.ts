import { z } from 'zod'
import { PatchSchema, PerformanceEventSchema } from './domain'
import type { Patch, PerformanceEvent } from './domain'

type MacroName = 'brightness' | 'texture' | 'motion'

const MAX_EVENTS = 1024
const MAX_SECONDS = 600
const MAX_RECORDING_BYTES = 256 * 1024

const PerformanceRecordingSchema = z.object({
  schema: z.literal('mythophone/performance/v1'),
  events: z.array(PerformanceEventSchema).max(MAX_EVENTS),
  duration: z.number().finite().min(0.4).max(MAX_SECONDS),
}).strict().refine(recording => recording.events.every(event => event.at <= recording.duration), 'performance events exceed the declared duration')

const PerformanceBundleSchema = z.object({
  schema: z.literal('mythophone/performance-bundle/v1'),
  patch: PatchSchema,
  recording: PerformanceRecordingSchema,
}).strict()

export type PerformanceRecording = {
  schema: 'mythophone/performance/v1'
  events: PerformanceEvent[]
  duration: number
}

export type PerformanceBundle = {
  schema: 'mythophone/performance-bundle/v1'
  patch: Patch
  recording: PerformanceRecording
}

export type PerformanceEventInput =
  | { type: 'note-on'; note: number; velocity: number; at?: number }
  | { type: 'note-off'; note: number; at?: number }
  | { type: 'sustain'; value: boolean; at?: number }
  | { type: 'macro'; name: MacroName; value: number; at?: number }

export function createPerformanceRecorder(clock: () => number = () => performance.now() / 1000) {
  let startedAt: number | null = null
  let events: PerformanceEvent[] = []
  let stoppedAt = 0

  function start(at = clock()) {
    startedAt = at
    stoppedAt = 0
    events = []
  }

  function elapsed(at = clock()) {
    return startedAt === null ? 0 : Math.min(Math.max(at - startedAt, 0), MAX_SECONDS)
  }

  function push(event: PerformanceEventInput, at?: number) {
    if (startedAt === null || events.length >= MAX_EVENTS) return false
    const next = PerformanceEventSchema.parse({ ...event, at: event.at ?? elapsed(at) })
    events.push(next)
    stoppedAt = Math.max(stoppedAt, next.at)
    return true
  }

  function stop(at = clock()) {
    if (startedAt === null) return getRecording()
    stoppedAt = Math.max(stoppedAt, elapsed(at))
    startedAt = null
    return getRecording()
  }

  function getRecording(): PerformanceRecording {
    return {
      schema: 'mythophone/performance/v1',
      events: [...events],
      duration: Math.min(Math.max(stoppedAt, 0.4), MAX_SECONDS),
    }
  }

  return {
    start,
    stop,
    push,
    getRecording,
    isRecording: () => startedAt !== null,
    eventCount: () => events.length,
    elapsed,
  }
}

export function parseRecording(value: unknown): PerformanceRecording {
  const parsed = PerformanceRecordingSchema.parse(value)
  return { schema: parsed.schema, events: [...parsed.events].sort((left, right) => left.at - right.at), duration: parsed.duration }
}

export function exportRecording(value: unknown) {
  return JSON.stringify(parseRecording(value), null, 2)
}

export function importRecording(raw: string) {
  if (new TextEncoder().encode(raw).byteLength > MAX_RECORDING_BYTES) throw new Error('performance recording exceeds 256 KiB size limit')
  try {
    return parseRecording(JSON.parse(raw))
  } catch (error) {
    if (error instanceof SyntaxError) throw new Error('performance recording was not JSON')
    throw error
  }
}

export function parsePerformanceBundle(value: unknown): PerformanceBundle {
  const parsed = PerformanceBundleSchema.parse(value)
  return {
    schema: parsed.schema,
    patch: parsed.patch,
    recording: { schema: parsed.recording.schema, events: [...parsed.recording.events].sort((left, right) => left.at - right.at), duration: parsed.recording.duration },
  }
}

export function exportPerformanceBundle(patch: unknown, recording: unknown) {
  return JSON.stringify(parsePerformanceBundle({ schema: 'mythophone/performance-bundle/v1', patch, recording }), null, 2)
}

export function importPerformanceBundle(raw: string) {
  if (new TextEncoder().encode(raw).byteLength > MAX_RECORDING_BYTES) throw new Error('performance bundle exceeds 256 KiB size limit')
  try {
    return parsePerformanceBundle(JSON.parse(raw))
  } catch (error) {
    if (error instanceof SyntaxError) throw new Error('performance bundle was not JSON')
    throw error
  }
}

export const RECORDING_LIMITS = { maxEvents: MAX_EVENTS, maxSeconds: MAX_SECONDS, maxBytes: MAX_RECORDING_BYTES }
