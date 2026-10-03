import { describe, expect, it } from 'vitest'
import { createPerformanceRecorder, exportRecording, parseRecording } from './recording'

describe('portable performance recording', () => {
  it('records validated note, sustain, and macro events with bounded elapsed time', () => {
    let now = 10
    const recorder = createPerformanceRecorder(() => now)
    recorder.start()
    now += 0.05
    recorder.push({ type: 'note-on', note: 60, velocity: 0.8 })
    now += 0.3
    recorder.push({ type: 'macro', name: 'brightness', value: 0.75 })
    recorder.push({ type: 'sustain', value: true })
    now += 0.4
    recorder.push({ type: 'note-off', note: 60 })
    const result = recorder.stop()
    expect(result.schema).toBe('mythophone/performance/v1')
    expect(result.events).toHaveLength(4)
    expect(result.duration).toBeGreaterThan(0.7)
    expect(parseRecording(JSON.parse(exportRecording(result)))).toEqual(result)
  })

  it('refuses unsupported versions, invalid events, and excess data', () => {
    expect(() => parseRecording({ schema: 'mythophone/performance/v2', events: [], duration: 0.4 })).toThrow()
    expect(() => parseRecording({ schema: 'mythophone/performance/v1', events: [{ type: 'shell', at: 0 }], duration: 0.4 })).toThrow()
    expect(() => parseRecording({ schema: 'mythophone/performance/v1', events: [], duration: 0 })).toThrow()
  })
})
