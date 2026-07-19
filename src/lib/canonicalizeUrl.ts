/**
 * canonicalizeUrl
 *
 * Normalise une URL pour la déduplication :
 * - Force HTTPS
 * - Lowercase sur le hostname uniquement
 * - Supprime les paramètres de tracking
 * - Supprime le slash final du pathname
 * - Supprime le fragment
 * - Retourne null si URL invalide
 */

const TRACKING_PARAMS = new Set([
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'ref',
  'source',
  'gclid',
  'fbclid',
  'msclkid',
  '_ga',
  '_gl',
])

export function canonicalizeUrl(url: string): string | null {
  if (!url || typeof url !== 'string') return null

  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return null
  }

  // Forcer HTTPS
  parsed.protocol = 'https:'

  // Lowercase sur le hostname uniquement
  parsed.hostname = parsed.hostname.toLowerCase()

  // Supprimer les paramètres de tracking
  const keysToDelete: string[] = []
  for (const key of parsed.searchParams.keys()) {
    if (TRACKING_PARAMS.has(key.toLowerCase()) || key.toLowerCase().startsWith('utm_')) {
      keysToDelete.push(key)
    }
  }
  for (const key of keysToDelete) {
    parsed.searchParams.delete(key)
  }

  // Supprimer le slash final du pathname
  if (parsed.pathname.endsWith('/') && parsed.pathname.length > 1) {
    parsed.pathname = parsed.pathname.replace(/\/+$/, '')
  }

  // Supprimer le fragment
  parsed.hash = ''

  // Construire la chaîne finale
  // Si query string vide, supprimer le ?
  let result = `${parsed.protocol}//${parsed.hostname}${parsed.pathname}`
  const qs = parsed.searchParams.toString()
  if (qs) {
    result += `?${qs}`
  }

  return result
}
