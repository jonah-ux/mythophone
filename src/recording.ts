import { PerformanceEventSchema } from './domain'
import type { PerformanceEvent } from './domain'

type MacroName = 'brightness' | 'texture' | 'motion'

const MAX_EVENTS = 1024
const MAX_SECONDS = 600

export type PerformanceRecording = {
  schema: 'mythophone/performance/v1'
  events: PerformanceEvent[]
  duration: number
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

  function start() {
    startedAt = clock()
    stoppedAt = 0
    events = []
  }

  function elapsed() {
    return startedAt === null ? 0 : Math.min(Math.max(clock() - startedAt, 0), MAX_SECONDS)
  }

  function push(event: PerformanceEventInput) {
    if (startedAt === null || events.length >= MAX_EVENTS) return false
    const next = PerformanceEventSchema.parse({ ...event, at: event.at ?? elapsed() })
    events.push(next)
    stoppedAt = Math.max(stoppedAt, next.at)
    return true
  }

  function stop() {
    if (startedAt === null) return getRecording()
    stoppedAt = Math.max(stoppedAt, elapsed())
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
  if (!value || typeof value !== 'object') throw new Error('performance recording must be an object')
  const candidate = value as Record<string, unknown>
  if (candidate.schema !== 'mythophone/performance/v1') throw new Error('unsupported performance recording version')
  if (!Array.isArray(candidate.events) || candidate.events.length > MAX_EVENTS) throw new Error('performance event limit exceeded')
  const events = candidate.events.map(event => PerformanceEventSchema.parse(event)).sort((left, right) => left.at - right.at)
  const duration = Number(candidate.duration)
  if (!Number.isFinite(duration) || duration < 0.4 || duration > MAX_SECONDS) throw new Error('invalid performance duration')
  return { schema: 'mythophone/performance/v1', events, duration }
}

export function exportRecording(value: unknown) {
  return JSON.stringify(parseRecording(value), null, 2)
}

export const RECORDING_LIMITS = { maxEvents: MAX_EVENTS, maxSeconds: MAX_SECONDS }
