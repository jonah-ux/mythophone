import { exportPatch, importPatch } from './domain'
import type { Patch } from './domain'

const SHARE_PREFIX = '#patch='
const MAX_SHARE_LENGTH = 12_000

export type SharedPatchRead = {
  patch: Patch | null
  error: string | null
}

export function encodePatchShareHash(value: unknown) {
  const encoded = SHARE_PREFIX + encodeURIComponent(exportPatch(value))
  if (encoded.length > MAX_SHARE_LENGTH) throw new Error('share link exceeds 12 KiB')
  return encoded
}

export function readSharedPatch(hash: string): SharedPatchRead {
  if (!hash || !hash.startsWith(SHARE_PREFIX)) return { patch: null, error: null }
  if (hash.length > MAX_SHARE_LENGTH) return { patch: null, error: 'share link exceeds 12 KiB' }
  try {
    return { patch: importPatch(decodeURIComponent(hash.slice(SHARE_PREFIX.length))), error: null }
  } catch (error) {
    return { patch: null, error: error instanceof Error ? error.message : 'share link is invalid' }
  }
}

export function createPatchShareUrl(value: unknown, locationLike: Pick<Location, 'origin' | 'pathname' | 'search'>) {
  return locationLike.origin + locationLike.pathname + locationLike.search + encodePatchShareHash(value)
}

export const SHARE_LIMITS = { maxLength: MAX_SHARE_LENGTH }
