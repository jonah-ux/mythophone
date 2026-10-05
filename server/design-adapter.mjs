import { createServer } from 'node:http'
import { z } from 'zod'

const MAX_BODY_BYTES = 16 * 1024
const MAX_PROVIDER_BYTES = 32 * 1024
const REQUEST_TIMEOUT_MS = 15_000
const DEFAULT_WEB_ORIGIN = 'http://127.0.0.1:5175'

export function normalizeWebOrigin(value = DEFAULT_WEB_ORIGIN) {
  if (value.trim() === '*') throw new Error('MYTHOPHONE_WEB_ORIGIN cannot be a wildcard')
  let parsed
  try {
    parsed = new URL(value)
  } catch {
    throw new Error('MYTHOPHONE_WEB_ORIGIN must be a valid http(s) origin')
  }
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) {
    throw new Error('MYTHOPHONE_WEB_ORIGIN must be a valid http(s) origin')
  }
  return parsed.origin
}

const bounded = (min, max) => z.number().finite().min(min).max(max)
const OscillatorSchema = z.object({
  type: z.enum(['sine', 'triangle', 'sawtooth', 'square']),
  mix: bounded(0, 1),
  detune: bounded(-24, 24),
  octave: z.number().int().min(-2).max(2),
}).strict()
const PatchSchema = z.object({
  schema: z.literal('mythophone/patch/v1'),
  id: z.string().regex(/^[a-z][a-z0-9-]{0,39}$/),
  name: z.string().min(1).max(80),
  description: z.string().min(1).max(240),
  oscillator: OscillatorSchema,
  subOscillator: OscillatorSchema.nullable(),
  noise: z.object({ mix: bounded(0, 1), color: z.literal('white') }).strict(),
  envelope: z.object({
    level: bounded(0.005, 0.12),
    attack: bounded(0.005, 2),
    decay: bounded(0, 2),
    sustain: bounded(0, 1),
    release: bounded(0.01, 4),
  }).strict(),
  filter: z.object({ type: z.enum(['lowpass', 'bandpass']), cutoff: bounded(100, 12000), resonance: bounded(0, 18) }).strict(),
  masterGain: bounded(0.1, 1),
  voiceLimit: z.number().int().min(1).max(12),
  macros: z.object({ brightness: bounded(0, 1), texture: bounded(0, 1), motion: bounded(0, 1) }).strict(),
}).strict()

const RequestSchema = z.object({
  schema: z.literal('mythophone/design-request/v1'),
  mode: z.enum(['generate', 'edit']),
  prompt: z.string().trim().min(3).max(240),
  currentPatch: PatchSchema,
}).strict()

const ResponseSchema = z.object({
  schema: z.literal('mythophone/design-response/v1'),
  patch: PatchSchema,
  explanation: z.string().min(1).max(600),
  changedPaths: z.array(z.string().regex(/^[a-z][a-zA-Z0-9]*(?:\.[a-z][a-zA-Z0-9]*)?$/)).max(24),
}).strict()

const LEAF_PATHS = [
  'id', 'name', 'description',
  'oscillator.type', 'oscillator.mix', 'oscillator.detune', 'oscillator.octave',
  'subOscillator.type', 'subOscillator.mix', 'subOscillator.detune', 'subOscillator.octave',
  'noise.mix', 'noise.color',
  'envelope.level', 'envelope.attack', 'envelope.decay', 'envelope.sustain', 'envelope.release',
  'filter.type', 'filter.cutoff', 'filter.resonance',
  'masterGain', 'voiceLimit',
  'macros.brightness', 'macros.texture', 'macros.motion',
]

const valueAtPath = (value, path) => path.split('.').reduce((current, key) => current && typeof current === 'object' ? current[key] : undefined, value)
const differs = (left, right) => JSON.stringify(left) !== JSON.stringify(right)

function assertScopedRevision(previous, next, changedPaths) {
  for (const declared of changedPaths) {
    if (!LEAF_PATHS.some(leaf => leaf === declared || leaf.startsWith(declared + '.'))) {
      throw new Error('provider declared unsupported change path: ' + declared)
    }
  }
  for (const actual of LEAF_PATHS.filter(path => differs(valueAtPath(previous, path), valueAtPath(next, path)))) {
    if (!changedPaths.some(declared => actual === declared || actual.startsWith(declared + '.'))) {
      throw new Error('provider changed undeclared patch path: ' + actual)
    }
  }
}

function jsonResponse(res, status, body, webOrigin) {
  const payload = JSON.stringify(body)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'access-control-allow-origin': webOrigin,
    'access-control-allow-headers': 'content-type',
  })
  res.end(payload)
}

function errorBody(code, message) {
  return { schema: 'mythophone/design-error/v1', code, message }
}

async function readBody(req) {
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > MAX_BODY_BYTES) throw Object.assign(new Error('request exceeds 16 KiB'), { code: 'request_too_large' })
    chunks.push(chunk)
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    throw Object.assign(new Error('request body was not JSON'), { code: 'request_invalid' })
  }
}

function providerPrompt(request) {
  return [
    'You are Mythophone sound designer. Return JSON only, matching the requested response schema.',
    'Use only the bounded patch fields in the current patch. Never return code, URLs, tools, audio worklets, samples, credentials, or arbitrary graph nodes.',
    'For mode edit, preserve every field outside the requested change and list changed leaf paths in changedPaths.',
    'For mode generate, you may shape all creative fields but keep the same schema, id format, finite ranges, and voice/resource limits.',
    'The names are artistic interpretations, not claims of physically recreating an imaginary object.',
    'Requested mode: ' + request.mode,
    'User direction: ' + request.prompt,
    'Current patch JSON: ' + JSON.stringify(request.currentPatch),
  ].join('\n')
}

function extractProviderJson(content) {
  const text = typeof content === 'string' ? content.trim() : ''
  if (!text) throw new Error('provider returned empty content')
  try {
    return JSON.parse(text)
  } catch {
    const fence = String.fromCharCode(96).repeat(3)
    const withoutFence = text.replace(new RegExp('^\\s*' + fence + '(?:json)?\\s*', 'i'), '').replace(new RegExp('\\s*' + fence + '\\s*$'), '')
    return JSON.parse(withoutFence)
  }
}

async function callProvider(request, config) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    const response = await fetch(config.baseUrl + '/chat/completions', {
      method: 'POST',
      headers: { authorization: 'Bearer ' + config.apiKey, 'content-type': 'application/json' },
      body: JSON.stringify({
        model: config.model,
        temperature: 0.2,
        max_tokens: 1400,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: providerPrompt(request) },
          { role: 'user', content: 'Return one validated design response object now.' },
        ],
      }),
      signal: controller.signal,
    })
    const text = await response.text()
    if (Buffer.byteLength(text, 'utf8') > MAX_PROVIDER_BYTES) throw new Error('provider response exceeds 32 KiB')
    if (!response.ok) throw Object.assign(new Error('provider returned HTTP ' + response.status), { code: 'provider_refused' })
    const envelope = JSON.parse(text)
    return extractProviderJson(envelope?.choices?.[0]?.message?.content)
  } catch (error) {
    if (error?.name === 'AbortError') throw Object.assign(new Error('provider request timed out'), { code: 'provider_timeout' })
    throw error
  } finally {
    clearTimeout(timeout)
  }
}

export async function handleDesignRequest(raw, config = {
  apiKey: process.env.MYTHOPHONE_AI_API_KEY,
  baseUrl: (process.env.MYTHOPHONE_AI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, ''),
  model: process.env.MYTHOPHONE_AI_MODEL,
}) {
  let request
  try {
    request = RequestSchema.parse(raw)
  } catch {
    return { status: 400, body: errorBody('request_invalid', 'request failed the bounded design schema') }
  }
  if (!config.apiKey || !config.model) return { status: 503, body: errorBody('provider_unconfigured', 'set MYTHOPHONE_AI_API_KEY and MYTHOPHONE_AI_MODEL on the server to enable configured AI mode') }
  try {
    const candidate = await callProvider(request, config)
    const result = ResponseSchema.parse(candidate)
    assertScopedRevision(request.currentPatch, result.patch, result.changedPaths)
    return { status: 200, body: result }
  } catch (error) {
    const code = error?.code === 'provider_timeout' ? 'provider_timeout' : error?.code === 'provider_refused' ? 'provider_refused' : 'invalid_provider_output'
    return { status: code === 'provider_timeout' ? 504 : 502, body: errorBody(code, error instanceof Error ? error.message : 'provider response was invalid') }
  }
}

export function startServer(port = Number(process.env.MYTHOPHONE_API_PORT || 8787), options = {}) {
  const webOrigin = normalizeWebOrigin(options.webOrigin || process.env.MYTHOPHONE_WEB_ORIGIN || DEFAULT_WEB_ORIGIN)
  const server = createServer(async (req, res) => {
    const requestOrigin = req.headers.origin
    if (requestOrigin && requestOrigin !== webOrigin) {
      jsonResponse(res, 403, errorBody('origin_not_allowed', 'request origin is not allowed'), webOrigin)
      return
    }
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'access-control-allow-origin': webOrigin,
        'access-control-allow-headers': 'content-type',
        'access-control-allow-methods': 'POST, OPTIONS',
      })
      res.end()
      return
    }
    if (req.method !== 'POST' || req.url !== '/api/design') {
      jsonResponse(res, 404, errorBody('unknown', 'route not found'), webOrigin)
      return
    }
    const contentType = req.headers['content-type']
    if (typeof contentType !== 'string' || !/^application\/json(?:\s*;|$)/i.test(contentType)) {
      jsonResponse(res, 415, errorBody('content_type_invalid', 'content-type must be application/json'), webOrigin)
      return
    }
    try {
      const result = await handleDesignRequest(await readBody(req))
      jsonResponse(res, result.status, result.body, webOrigin)
    } catch (error) {
      jsonResponse(res, error?.code === 'request_too_large' ? 413 : 400, errorBody(error?.code === 'request_too_large' ? 'request_too_large' : 'request_invalid', error instanceof Error ? error.message : 'request failed'), webOrigin)
    }
  })
  server.listen(port, '127.0.0.1', () => {
    const address = server.address()
    const actualPort = address && typeof address === 'object' ? address.port : port
    console.log('Mythophone sound designer API listening on http://127.0.0.1:' + actualPort)
  })
  return server
}

if (process.argv[1]?.endsWith('/design-adapter.mjs')) startServer()
