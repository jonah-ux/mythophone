import { z } from 'zod'
import { PatchSchema } from './domain'
import type { Patch } from './domain'

const DESIGN_ENDPOINT = import.meta.env.VITE_MYTHOPHONE_API_URL?.trim() || '/api/design'
const DESIGN_TIMEOUT_MS = 15_000
const MAX_RESPONSE_BYTES = 32 * 1024

export const DesignRequestSchema = z.object({
  schema: z.literal('mythophone/design-request/v1'),
  mode: z.enum(['generate', 'edit']),
  prompt: z.string().trim().min(3).max(240),
  currentPatch: PatchSchema,
}).strict()

export const DesignResponseSchema = z.object({
  schema: z.literal('mythophone/design-response/v1'),
  patch: PatchSchema,
  explanation: z.string().min(1).max(600),
  changedPaths: z.array(z.string().regex(/^[a-z][a-zA-Z0-9]*(?:\.[a-z][a-zA-Z0-9]*)?$/)).max(24),
}).strict()

export const DesignErrorSchema = z.object({
  schema: z.literal('mythophone/design-error/v1'),
  code: z.enum(['provider_unconfigured', 'provider_timeout', 'provider_refused', 'invalid_provider_output', 'request_invalid', 'request_too_large', 'unknown']),
  message: z.string().min(1).max(400),
}).strict()

export type DesignRequest = z.infer<typeof DesignRequestSchema>
export type DesignResponse = z.infer<typeof DesignResponseSchema>
export type DesignErrorPayload = z.infer<typeof DesignErrorSchema>

export class DesignError extends Error {
  readonly code: DesignErrorPayload['code']
  constructor(code: DesignErrorPayload['code'], message: string) {
    super(message)
    this.name = 'DesignError'
    this.code = code
  }
}

const PATCH_LEAF_PATHS = [
  'id', 'name', 'description',
  'oscillator.type', 'oscillator.mix', 'oscillator.detune', 'oscillator.octave',
  'subOscillator.type', 'subOscillator.mix', 'subOscillator.detune', 'subOscillator.octave',
  'noise.mix', 'noise.color',
  'envelope.level', 'envelope.attack', 'envelope.decay', 'envelope.sustain', 'envelope.release',
  'filter.type', 'filter.cutoff', 'filter.resonance',
  'masterGain', 'voiceLimit',
  'macros.brightness', 'macros.texture', 'macros.motion',
] as const

function valueAtPath(value: Patch, path: string) {
  return path.split('.').reduce<unknown>((current, key) => {
    if (current && typeof current === 'object' && key in current) return (current as Record<string, unknown>)[key]
    return undefined
  }, value)
}

function differs(left: unknown, right: unknown) {
  return JSON.stringify(left) !== JSON.stringify(right)
}

/**
 * A provider edit may only change a declared leaf path or one of its ancestors.
 * The active patch is never replaced when the provider quietly changes another
 * parameter, even if its JSON is otherwise valid.
 */
export function assertScopedRevision(previous: Patch, next: Patch, changedPaths: string[]) {
  const allowed = new Set(changedPaths)
  for (const path of changedPaths) {
    if (!PATCH_LEAF_PATHS.includes(path as typeof PATCH_LEAF_PATHS[number]) && !PATCH_LEAF_PATHS.some(leaf => leaf.startsWith(path + '.'))) {
      throw new DesignError('invalid_provider_output', 'provider declared unsupported change path: ' + path)
    }
  }
  const actualChanges = PATCH_LEAF_PATHS.filter(path => differs(valueAtPath(previous, path), valueAtPath(next, path)))
  for (const path of actualChanges) {
    if (!changedPaths.some(declared => path === declared || path.startsWith(declared + '.'))) {
      throw new DesignError('invalid_provider_output', 'provider changed undeclared patch path: ' + path)
    }
  }
  for (const path of allowed) {
    if (!PATCH_LEAF_PATHS.some(leaf => leaf === path || leaf.startsWith(path + '.'))) {
      throw new DesignError('invalid_provider_output', 'provider declared unsupported change path: ' + path)
    }
  }
}

function errorFromStatus(status: number, payload: unknown) {
  const parsed = DesignErrorSchema.safeParse(payload)
  if (parsed.success) return new DesignError(parsed.data.code, parsed.data.message)
  if (status === 413) return new DesignError('request_too_large', 'sound-design request is too large')
  if (status === 408 || status === 504) return new DesignError('provider_timeout', 'sound designer timed out')
  if (status === 404) return new DesignError('provider_refused', 'sound-designer endpoint was not found')
  if (status >= 400 && status < 500) return new DesignError('request_invalid', 'sound-design request was refused')
  return new DesignError('provider_refused', 'sound designer is unavailable')
}

async function readJson(response: Response) {
  const contentType = response.headers.get('content-type')?.toLowerCase() ?? ''
  const text = await response.text()
  if (new TextEncoder().encode(text).byteLength > MAX_RESPONSE_BYTES) {
    if (!response.ok) return null
    throw new DesignError('invalid_provider_output', 'sound-designer response exceeds the response limit')
  }
  try {
    return JSON.parse(text) as unknown
  } catch {
    if (!response.ok || !contentType.includes('json')) return null
    throw new DesignError('invalid_provider_output', 'sound-designer response was not JSON')
  }
}

export async function requestDesign(
  mode: DesignRequest['mode'],
  prompt: string,
  currentPatch: Patch,
  options?: { endpoint?: string; signal?: AbortSignal },
): Promise<DesignResponse> {
  const controller = new AbortController()
  if (options?.signal?.aborted) {
    throw new DesignError('provider_refused', 'sound-design request cancelled')
  }
  let request: DesignRequest
  try {
    request = DesignRequestSchema.parse({ schema: 'mythophone/design-request/v1', mode, prompt, currentPatch })
  } catch {
    throw new DesignError('request_invalid', 'sound-design request failed the bounded design schema')
  }
  const timeout = setTimeout(() => controller.abort('timeout'), DESIGN_TIMEOUT_MS)
  const relayAbort = () => controller.abort(options?.signal?.reason ?? 'cancelled')
  options?.signal?.addEventListener('abort', relayAbort, { once: true })
  try {
    const response = await fetch(options?.endpoint ?? DESIGN_ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(request),
      signal: controller.signal,
    })
    const payload = await readJson(response)
    if (!response.ok) throw errorFromStatus(response.status, payload)
    if (payload === null) throw new DesignError('provider_refused', 'sound-designer endpoint returned a non-JSON response')
    const result = DesignResponseSchema.safeParse(payload)
    if (!result.success) throw new DesignError('invalid_provider_output', 'sound-designer response failed the patch schema')
    assertScopedRevision(currentPatch, result.data.patch, result.data.changedPaths)
    return result.data
  } catch (error) {
    if (error instanceof DesignError) throw error
    if (controller.signal.aborted) {
      throw new DesignError(controller.signal.reason === 'timeout' ? 'provider_timeout' : 'provider_refused', controller.signal.reason === 'timeout' ? 'sound designer timed out' : 'sound-design request cancelled')
    }
    throw new DesignError('provider_refused', error instanceof Error ? error.message : 'sound designer is unavailable')
  } finally {
    clearTimeout(timeout)
    options?.signal?.removeEventListener('abort', relayAbort)
  }
}
