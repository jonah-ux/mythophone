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
  const previousOperator = process.env.MYTHOPHONE_OPERATOR_BEARER_TOKEN
  let operatorToken = 'c'.repeat(48)
  process.env.MYTHOPHONE_OPERATOR_BEARER_TOKEN = operatorToken
  try {
  const optionsResponse = response()
  await handleVercelDesignRequest({ method: 'OPTIONS' }, optionsResponse)
  assert.equal(optionsResponse.statusCode, 204)
  assert.equal(optionsResponse.headers.get('access-control-allow-origin'), 'https://jonah-ux.github.io')
  assert.equal(optionsResponse.headers.get('access-control-allow-methods'), 'POST, OPTIONS')

  const postResponse = response()
  await handleVercelDesignRequest({
    method: 'POST',
    headers: { authorization: 'Bearer ' + operatorToken },
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
  await handleVercelDesignRequest({ method: 'POST', headers: { authorization: 'Bearer ' + operatorToken }, body: { padding: 'x'.repeat(20_000) } }, oversizedResponse)
  assert.equal(oversizedResponse.statusCode, 413)
  assert.equal(JSON.parse(oversizedResponse.body).code, 'request_too_large')

  const oversizedStringResponse = response()
  await handleVercelDesignRequest({ method: 'POST', headers: { authorization: 'Bearer ' + operatorToken }, body: 'x'.repeat(20_000) }, oversizedStringResponse)
  assert.equal(oversizedStringResponse.statusCode, 413)
  assert.equal(JSON.parse(oversizedStringResponse.body).code, 'request_too_large')

  const oversizedBufferResponse = response()
  await handleVercelDesignRequest({ method: 'POST', headers: { authorization: 'Bearer ' + operatorToken }, body: Buffer.from('x'.repeat(20_000)) }, oversizedBufferResponse)
  assert.equal(oversizedBufferResponse.statusCode, 413)
  assert.equal(JSON.parse(oversizedBufferResponse.body).code, 'request_too_large')

  const oversizedStreamResponse = response()
  await handleVercelDesignRequest({
    method: 'POST',
    headers: { authorization: 'Bearer ' + operatorToken },
    async *[Symbol.asyncIterator]() {
      yield Buffer.from('x'.repeat(20_000))
    },
  }, oversizedStreamResponse)
  assert.equal(oversizedStreamResponse.statusCode, 413)
  assert.equal(JSON.parse(oversizedStreamResponse.body).code, 'request_too_large')

  operatorToken = 'd'.repeat(48)
  process.env.MYTHOPHONE_OPERATOR_BEARER_TOKEN = operatorToken
  const previousLimit = process.env.MYTHOPHONE_RATE_LIMIT_MAX
  process.env.MYTHOPHONE_RATE_LIMIT_MAX = '1'
  try {
    const firstRateResponse = response()
    await handleVercelDesignRequest({ method: 'POST', headers: { authorization: 'Bearer ' + operatorToken, 'x-forwarded-for': 'rate-test' }, body: { ping: true } }, firstRateResponse)
    assert.equal(firstRateResponse.statusCode, 400)
    const secondRateResponse = response()
    await handleVercelDesignRequest({ method: 'POST', headers: { authorization: 'Bearer ' + operatorToken, 'x-forwarded-for': 'rate-test' }, body: { ping: true } }, secondRateResponse)
    assert.equal(secondRateResponse.statusCode, 429)
    assert.equal(JSON.parse(secondRateResponse.body).code, 'rate_limited')
    assert.equal(secondRateResponse.headers.get('retry-after'), '60')
  } finally {
    if (previousLimit === undefined) delete process.env.MYTHOPHONE_RATE_LIMIT_MAX
    else process.env.MYTHOPHONE_RATE_LIMIT_MAX = previousLimit
  }
  } finally {
    if (previousOperator === undefined) delete process.env.MYTHOPHONE_OPERATOR_BEARER_TOKEN
    else process.env.MYTHOPHONE_OPERATOR_BEARER_TOKEN = previousOperator
  }
})

test('configured provider requires an operator token before any upstream dispatch', async () => {
  const keys = ['MYTHOPHONE_AI_API_KEY', 'MYTHOPHONE_AI_MODEL', 'MYTHOPHONE_OPERATOR_BEARER_TOKEN', 'MYTHOPHONE_RATE_LIMIT_MAX']
  const previous = Object.fromEntries(keys.map(key => [key, process.env[key]]))
  const originalFetch = globalThis.fetch
  const token = 'a'.repeat(48)
  let providerCalls = 0
  globalThis.fetch = async () => {
    providerCalls += 1
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({
      schema: 'mythophone/design-response/v1', patch: source[0], explanation: 'Kept the patch.', changedPaths: [],
    }) } }] }), { status: 200 })
  }
  process.env.MYTHOPHONE_AI_API_KEY = 'synthetic-provider-key'
  process.env.MYTHOPHONE_AI_MODEL = 'synthetic-model'
  process.env.MYTHOPHONE_OPERATOR_BEARER_TOKEN = token
  process.env.MYTHOPHONE_RATE_LIMIT_MAX = '30'
  const body = { schema: 'mythophone/design-request/v1', mode: 'edit', prompt: 'make the attack softer', currentPatch: source[0] }
  try {
    for (const headers of [{}, { authorization: 'Bearer wrong-token' }]) {
      const result = response()
      await handleVercelDesignRequest({ method: 'POST', headers, body }, result)
      assert.equal(result.statusCode, 401)
      assert.equal(JSON.parse(result.body).code, 'operator_unauthorized')
      assert.equal(providerCalls, 0)
    }
    const allowed = response()
    await handleVercelDesignRequest({ method: 'POST', headers: { authorization: 'Bearer ' + token }, body }, allowed)
    assert.equal(allowed.statusCode, 200)
    assert.equal(providerCalls, 1)
  } finally {
    globalThis.fetch = originalFetch
    for (const key of keys) {
      if (previous[key] === undefined) delete process.env[key]
      else process.env[key] = previous[key]
    }
  }
})

test('an authorized caller cannot reset the limiter by changing forwarded IP headers', async () => {
  const keys = ['MYTHOPHONE_AI_API_KEY', 'MYTHOPHONE_AI_MODEL', 'MYTHOPHONE_OPERATOR_BEARER_TOKEN', 'MYTHOPHONE_RATE_LIMIT_MAX']
  const previous = Object.fromEntries(keys.map(key => [key, process.env[key]]))
  const originalFetch = globalThis.fetch
  const token = 'b'.repeat(48)
  let providerCalls = 0
  globalThis.fetch = async () => {
    providerCalls += 1
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({
      schema: 'mythophone/design-response/v1', patch: source[0], explanation: 'Kept the patch.', changedPaths: [],
    }) } }] }), { status: 200 })
  }
  process.env.MYTHOPHONE_AI_API_KEY = 'synthetic-provider-key'
  process.env.MYTHOPHONE_AI_MODEL = 'synthetic-model'
  process.env.MYTHOPHONE_OPERATOR_BEARER_TOKEN = token
  process.env.MYTHOPHONE_RATE_LIMIT_MAX = '1'
  const body = { schema: 'mythophone/design-request/v1', mode: 'edit', prompt: 'make the attack softer', currentPatch: source[0] }
  try {
    const first = response()
    await handleVercelDesignRequest({ method: 'POST', headers: { authorization: 'Bearer ' + token, 'x-forwarded-for': '198.51.100.1' }, body }, first)
    assert.equal(first.statusCode, 200)
    const second = response()
    await handleVercelDesignRequest({ method: 'POST', headers: { authorization: 'Bearer ' + token, 'x-forwarded-for': '198.51.100.2' }, body }, second)
    assert.equal(second.statusCode, 429)
    assert.equal(providerCalls, 1)
  } finally {
    globalThis.fetch = originalFetch
    for (const key of keys) {
      if (previous[key] === undefined) delete process.env[key]
      else process.env[key] = previous[key]
    }
  }
})
