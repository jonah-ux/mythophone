import { describe, expect, it } from 'vitest'
import source from './presets.json'
import { parsePatch } from './domain'
import { createPatchShareUrl, encodePatchShareHash, readSharedPatch, SHARE_LIMITS } from './share'

describe('portable patch share links', () => {
  it('round-trips a bounded patch through a URL hash', () => {
    const patch = parsePatch(source[2])
    const hash = encodePatchShareHash(patch)
    expect(readSharedPatch(hash)).toEqual({ patch, error: null })
    expect(createPatchShareUrl(patch, { origin: 'https://mythophone.example', pathname: '/mythophone/', search: '?demo=1' })).toContain('https://mythophone.example/mythophone/?demo=1#patch=')
  })

  it('fails closed for malformed or oversized hashes', () => {
    expect(readSharedPatch('#patch=not-json').patch).toBeNull()
    expect(readSharedPatch('#patch=' + 'x'.repeat(SHARE_LIMITS.maxLength)).error).toContain('12 KiB')
  })
})
