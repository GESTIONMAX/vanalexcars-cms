/**
 * extractListingId
 *
 * Extrait l'identifiant d'une annonce depuis une URL, selon plusieurs stratégies.
 */

export type ListingIdMethod = 'json' | 'uuid_explicit' | 'uuid_path' | 'numeric_path'

export interface ExtractedListingId {
  id: string
  method: ListingIdMethod
}

const UUID_EXPLICIT = /-id-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i
const UUID_PATH = /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:\/|$|\?|#)/i
const NUMERIC_PATH = /-(\d{6,})(?:\/|$|\?|#)/

export function extractListingId(url: string, jsonId?: string): ExtractedListingId | null {
  // 1. jsonId fourni et non vide
  if (jsonId && jsonId.trim() !== '') {
    return { id: jsonId.trim(), method: 'json' }
  }

  // 2. UUID après -id- dans le path
  const explicitMatch = url.match(UUID_EXPLICIT)
  if (explicitMatch) {
    return { id: explicitMatch[1].toLowerCase(), method: 'uuid_explicit' }
  }

  // 3. UUID en fin de path (sans -id-)
  const pathMatch = url.match(UUID_PATH)
  if (pathMatch) {
    return { id: pathMatch[1].toLowerCase(), method: 'uuid_path' }
  }

  // 4. ID numérique ≥ 6 chiffres en fin de segment
  const numericMatch = url.match(NUMERIC_PATH)
  if (numericMatch) {
    return { id: numericMatch[1], method: 'numeric_path' }
  }

  return null
}
