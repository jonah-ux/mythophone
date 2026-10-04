import { handleDesignRequest, normalizeWebOrigin } from '../server/design-adapter.mjs'

const MAX_BODY_BYTES = 16 * 1024

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
