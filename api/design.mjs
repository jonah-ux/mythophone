import { handleDesignRequest, normalizeWebOrigin } from '../server/design-adapter.mjs'

const MAX_BODY_BYTES = 16 * 1024
const DEFAULT_RATE_LIMIT_MAX = 30
const RATE_LIMIT_WINDOW_MS = 60_000
const requestsByClient = new Map()

function sendJson(res, status, body) {
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(body))
}

function setCors(res, webOrigin) {
  res.setHeader('access-control-allow-origin', webOrigin)
  res.setHeader('access-control-allow-methods', 'POST, OPTIONS')
  res.setHeader('access-control-allow-headers', 'content-type')
  res.setHeader('cache-control', 'no-store')
}

function rateLimitKey(req) {
  return String(req.headers?.['x-forwarded-for'] || req.headers?.['x-real-ip'] || req.socket?.remoteAddress || 'unknown').split(',')[0].trim() || 'unknown'
}

function rateLimitExceeded(req) {
  const max = Math.max(1, Number(process.env.MYTHOPHONE_RATE_LIMIT_MAX || DEFAULT_RATE_LIMIT_MAX))
  const now = Date.now()
  const key = rateLimitKey(req)
  const existing = requestsByClient.get(key)
  const window = existing && now - existing.startedAt < RATE_LIMIT_WINDOW_MS ? existing : { startedAt: now, count: 0 }
  window.count += 1
  requestsByClient.set(key, window)
  return window.count > max ? Math.ceil((window.startedAt + RATE_LIMIT_WINDOW_MS - now) / 1000) : 0
}

function assertBodySize(value) {
  const bytes = Buffer.isBuffer(value)
    ? value.byteLength
    : Buffer.byteLength(typeof value === 'string' ? value : JSON.stringify(value), 'utf8')
  if (bytes > MAX_BODY_BYTES) throw Object.assign(new Error('request exceeds 16 KiB'), { code: 'request_too_large' })
  return value
}

async function requestBody(req) {
  if (req.body !== undefined) {
    assertBodySize(req.body)
    if (typeof req.body !== 'string') return req.body
    try {
      return JSON.parse(req.body)
    } catch {
      return req.body
    }
  }
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > MAX_BODY_BYTES) throw Object.assign(new Error('request exceeds 16 KiB'), { code: 'request_too_large' })
    chunks.push(Buffer.from(chunk))
  }
  if (chunks.length === 0) return undefined
  const raw = Buffer.concat(chunks).toString('utf8')
  try {
    return JSON.parse(raw)
  } catch {
    return Buffer.concat(chunks).toString('utf8')
  }
}

export async function handleVercelDesignRequest(req, res) {
  const webOrigin = normalizeWebOrigin(process.env.MYTHOPHONE_WEB_ORIGIN || 'https://jonah-ux.github.io')
  setCors(res, webOrigin)
  if (req.method === 'OPTIONS') {
    res.statusCode = 204
    res.end()
    return
  }
  if (req.method !== 'POST') {
    sendJson(res, 404, { schema: 'mythophone/design-error/v1', code: 'unknown', message: 'route not found' })
    return
  }
  const retryAfter = rateLimitExceeded(req)
  if (retryAfter > 0) {
    res.setHeader('retry-after', String(retryAfter))
    sendJson(res, 429, { schema: 'mythophone/design-error/v1', code: 'rate_limited', message: 'sound-designer request rate limit exceeded' })
    return
  }
  try {
    const result = await handleDesignRequest(await requestBody(req))
    sendJson(res, result.status, result.body)
  } catch (error) {
    sendJson(res, error?.code === 'request_too_large' ? 413 : 400, {
      schema: 'mythophone/design-error/v1',
      code: error?.code === 'request_too_large' ? 'request_too_large' : 'request_invalid',
      message: error instanceof Error ? error.message : 'request failed',
    })
  }
}

export default handleVercelDesignRequest
