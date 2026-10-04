import { describe, expect, it } from 'vitest'
import source from './presets.json'
import { parsePatch } from './domain'
import {
  assertScopedRevision,
  DesignError,
  DesignRequestSchema,
  DesignResponseSchema,
  requestDesign,
} from './designer'

const patch = parsePatch(source[0])

describe('sound designer boundary', () => {
  it('validates bounded requests and responses without exposing provider secrets', () => {
    const request = DesignRequestSchema.parse({
      schema: 'mythophone/design-request/v1',
      mode: 'edit',
      prompt: 'make the attack softer',
      currentPatch: patch,
    })
    expect(request.currentPatch.schema).toBe('mythophone/patch/v1')
    const response = DesignResponseSchema.parse({
      schema: 'mythophone/design-response/v1',
      patch,
      explanation: 'Kept the prepared patch unchanged.',
      changedPaths: [],
    })
    expect(response.schema).toBe('mythophone/design-response/v1')
    expect(JSON.stringify(response)).not.toContain('API_KEY')
  })

  it('allows only declared scoped edits and preserves other fields', () => {
    const edited = { ...patch, envelope: { ...patch.envelope, attack: 0.42 } }
    expect(() => assertScopedRevision(patch, edited, ['envelope.attack'])).not.toThrow()
    expect(() => assertScopedRevision(patch, edited, [])).toThrow(DesignError)
    expect(() => assertScopedRevision(patch, edited, ['filter.cutoff'])).toThrow(DesignError)
    expect(() => assertScopedRevision(patch, patch, ['arbitrary.code'])).toThrow(DesignError)
  })

  it('rejects arbitrary code, oversized directions, and unsupported versions', () => {
    expect(() => DesignRequestSchema.parse({
      schema: 'mythophone/design-request/v1',
      mode: 'generate',
      prompt: 'rm -rf /',
      currentPatch: patch,
      tool: 'shell',
    })).toThrow()
    expect(() => DesignRequestSchema.parse({
      schema: 'mythophone/design-request/v2',
      mode: 'generate',
      prompt: 'a bell',
      currentPatch: patch,
    })).toThrow()
    expect(() => DesignRequestSchema.parse({
      schema: 'mythophone/design-request/v1',
      mode: 'generate',
      prompt: 'x'.repeat(241),
      currentPatch: patch,
    })).toThrow()
  })

  it('turns caller cancellation into a safe provider failure', async () => {
    const previousFetch = globalThis.fetch
    const caller = new AbortController()
    globalThis.fetch = async (_input, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })), { once: true })
    })
    try {
      const pending = requestDesign('edit', 'make the attack softer', patch, { signal: caller.signal })
      caller.abort()
      await expect(pending).rejects.toMatchObject({ name: 'DesignError', code: 'provider_refused' })
    } finally {
      globalThis.fetch = previousFetch
    }
  })

  it('turns a missing or HTML adapter route into an explicit provider failure', async () => {
    const previousFetch = globalThis.fetch
    globalThis.fetch = async () => new Response('<!doctype html><h1>Not Found</h1>', { status: 404, headers: { 'content-type': 'text/html' } })
    try {
      await expect(requestDesign('edit', 'make the attack softer', patch)).rejects.toMatchObject({
        name: 'DesignError',
        code: 'provider_refused',
        message: 'sound-designer endpoint was not found',
      })
    } finally {
      globalThis.fetch = previousFetch
    }
  })
})
