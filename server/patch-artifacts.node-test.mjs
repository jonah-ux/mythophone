import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import source from '../src/presets.json' with { type: 'json' }

test('downloadable prepared patch artifacts stay exact', async () => {
  for (const patch of source) {
    const raw = await readFile(new URL(`../public/patches/${patch.id}.mythophone.json`, import.meta.url), 'utf8')
    assert.deepEqual(JSON.parse(raw), patch)
  }
})
