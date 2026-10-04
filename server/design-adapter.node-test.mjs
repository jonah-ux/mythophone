import test from 'node:test'
import assert from 'node:assert/strict'
import { once } from 'node:events'
import source from '../src/presets.json' with { type: 'json' }
import { handleDesignRequest, normalizeWebOrigin, startServer } from './design-adapter.mjs'

const request = {
  schema: 'mythophone/design-request/v1',
  mode: 'edit',
  prompt: 'keep the texture but make the decay longer',
  currentPatch: source[0],
}

test('reports explicit provider-unconfigured state without reading browser secrets', async () => {
  const result = await handleDesignRequest(request, { apiKey: '', model: '', baseUrl: 'http://provider' })
  assert.equal(result.status, 503)
  assert.equal(result.body.code, 'provider_unconfigured')
})

test('accepts a provider response only after schema and scoped-change validation', async () => {
  const previousFetch = globalThis.fetch
  globalThis.fetch = async () => new Response(JSON.stringify({
    choices: [{
      message: {
        content: JSON.stringify({
          schema: 'mythophone/design-response/v1',
          patch: source[0],
          explanation: 'Kept the prepared patch unchanged.',
          changedPaths: [],
        }),
      },
    }],
  }), { status: 200, headers: { 'content-type': 'application/json' } })
  try {
    const result = await handleDesignRequest(request, { apiKey: 'test-only', model: 'test-only', baseUrl: 'http://provider' })
    assert.equal(result.status, 200)
    assert.equal(result.body.patch.id, 'rain-cello')
  } finally {
    globalThis.fetch = previousFetch
  }
})

test('refuses a provider response that changes an undeclared field', async () => {
  const previousFetch = globalThis.fetch
  globalThis.fetch = async () => new Response(JSON.stringify({
    choices: [{
      message: {
        content: JSON.stringify({
          schema: 'mythophone/design-response/v1',
          patch: { ...source[0], envelope: { ...source[0].envelope, attack: 0.9 } },
          explanation: 'Changed the attack.',
          changedPaths: [],
        }),
      },
    }],
  }), { status: 200, headers: { 'content-type': 'application/json' } })
  try {
    const result = await handleDesignRequest(request, { apiKey: 'test-only', model: 'test-only', baseUrl: 'http://provider' })
    assert.equal(result.status, 502)
    assert.equal(result.body.code, 'invalid_provider_output')
  } finally {
    globalThis.fetch = previousFetch
  }
})

test('keeps provider refusal and timeout states explicit', async () => {
  const previousFetch = globalThis.fetch
  try {
    globalThis.fetch = async () => new Response('rate limited', { status: 429 })
    const refused = await handleDesignRequest(request, { apiKey: 'test-only', model: 'test-only', baseUrl: 'http://provider' })
    assert.equal(refused.status, 502)
    assert.equal(refused.body.code, 'provider_refused')

    globalThis.fetch = async () => { throw Object.assign(new Error('aborted'), { name: 'AbortError' }) }
    const timedOut = await handleDesignRequest(request, { apiKey: 'test-only', model: 'test-only', baseUrl: 'http://provider' })
    assert.equal(timedOut.status, 504)
    assert.equal(timedOut.body.code, 'provider_timeout')
  } finally {
    globalThis.fetch = previousFetch
  }
})

test('uses the configured browser origin for CORS preflight', async () => {
  const server = startServer(0, { webOrigin: 'https://mythophone.example' })
  await once(server, 'listening')
  try {
    const address = server.address()
    assert.ok(address && typeof address === 'object')
    const response = await fetch(`http://127.0.0.1:${address.port}/api/design`, {
      method: 'OPTIONS',
      headers: { origin: 'https://mythophone.example' },
    })
    assert.equal(response.status, 204)
    assert.equal(response.headers.get('access-control-allow-origin'), 'https://mythophone.example')
  } finally {
    const closed = once(server, 'close')
    server.close()
    await closed
  }
})

test('rejects unsafe or malformed browser origins before serving', () => {
  assert.equal(normalizeWebOrigin('https://mythophone.example/app'), 'https://mythophone.example')
  assert.throws(() => normalizeWebOrigin('*'), /wildcard/)
  assert.throws(() => normalizeWebOrigin('ftp://mythophone.example'), /http\(s\)/)
  assert.throws(() => normalizeWebOrigin('https://user:pass@mythophone.example'), /http\(s\)/)
  assert.throws(() => normalizeWebOrigin('not-an-origin'), /http\(s\)/)
})
