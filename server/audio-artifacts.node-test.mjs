import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const examples = [
  ['rain-cello-demo.wav', 107311],
  ['sand-bell-demo.wav', 87701],
  ['mechanical-dragon-demo.wav', 41396],
]

function inspectWav(buffer) {
  assert.equal(buffer.toString('ascii', 0, 4), 'RIFF')
  assert.equal(buffer.toString('ascii', 8, 12), 'WAVE')
  assert.equal(buffer.toString('ascii', 12, 16), 'fmt ')
  assert.equal(buffer.readUInt32LE(16), 16)
  assert.equal(buffer.readUInt16LE(20), 1)
  assert.equal(buffer.readUInt16LE(22), 1)
  assert.equal(buffer.readUInt32LE(24), 44100)
  assert.equal(buffer.readUInt16LE(34), 16)
  assert.equal(buffer.toString('ascii', 36, 40), 'data')
  const dataSize = buffer.readUInt32LE(40)
  assert.equal(buffer.length, 44 + dataSize)
  assert.equal(dataSize % 2, 0)
  const samples = new Int16Array(dataSize / 2)
  let peak = 0
  for (let index = 0; index < samples.length; index += 1) {
    const sample = buffer.readInt16LE(44 + index * 2)
    samples[index] = sample
    peak = Math.max(peak, Math.abs(sample))
  }
  assert.ok(samples.length > 0)
  assert.ok(peak > 0)
  return { frames: samples.length, duration: samples.length / 44100, peak }
}

test('prepared audio artifacts stay valid mono PCM/WAV files', async () => {
  const measurements = []
  for (const [filename, expectedFrames] of examples) {
    const measurement = inspectWav(await readFile(new URL(`../public/audio/${filename}`, import.meta.url)))
    assert.equal(measurement.frames, expectedFrames)
    measurements.push(measurement)
  }
  assert.equal(new Set(measurements.map(measurement => measurement.frames)).size, examples.length)
})
