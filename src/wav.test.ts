import { describe, expect, it } from 'vitest'
import { audioBufferToWav } from './wav'

describe('WAV export', () => {
  it('writes an ordinary PCM RIFF/WAVE file that preserves finite samples', async () => {
    const channels = [Float32Array.from([0, 0.5, -0.5, 1])]
    const buffer = {
      numberOfChannels: 1,
      sampleRate: 8000,
      length: 4,
      getChannelData: (channel: number) => channels[channel],
    } as unknown as AudioBuffer
    const blob = audioBufferToWav(buffer)
    const bytes = new Uint8Array(await blob.arrayBuffer())
    const text = new TextDecoder()
    expect(text.decode(bytes.slice(0, 4))).toBe('RIFF')
    expect(text.decode(bytes.slice(8, 12))).toBe('WAVE')
    expect(text.decode(bytes.slice(36, 40))).toBe('data')
    expect(bytes.length).toBe(52)
    expect(blob.type).toBe('audio/wav')
  })
})
