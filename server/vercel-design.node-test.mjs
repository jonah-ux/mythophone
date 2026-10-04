import test from 'node:test'
import assert from 'node:assert/strict'
import source from '../src/presets.json' with { type: 'json' }
import { handleVercelDesignRequest } from '../api/design.mjs'

function response() {
  const headers = new Map()
  return {
    headers,
    statusCode: 200,
    body: '',
    setHeader(name, value) { headers.set(name.toLowerCase(), value) },
    end(value = '') { this.body = value },
  }
}

test('Vercel adapter exposes CORS preflight and explicit provider-unconfigured state', async () => {
  const optionsResponse = response()
  await handleVercelDesignRequest({ method: 'OPTIONS' }, optionsResponse)
  assert.equal(optionsResponse.statusCode, 204)
  assert.equal(optionsResponse.headers.get('access-control-allow-origin'), 'https://jonah-ux.github.io')
  assert.equal(optionsResponse.headers.get('access-control-allow-methods'), 'POST, OPTIONS')

  const postResponse = response()
  await handleVercelDesignRequest({
    method: 'POST',
    body: {
      schema: 'mythophone/design-request/v1',
      mode: 'edit',
      prompt: 'make the attack softer',
      currentPatch: source[0],
    },
  }, postResponse)
  assert.equal(postResponse.statusCode, 503)
  assert.equal(JSON.parse(postResponse.body).code, 'provider_unconfigured')

  const oversizedResponse = response()
  await handleVercelDesignRequest({ method: 'POST', body: { padding: 'x'.repeat(20_000) } }, oversizedResponse)
  assert.equal(oversizedResponse.statusCode, 413)
  assert.equal(JSON.parse(oversizedResponse.body).code, 'request_too_large')
})
