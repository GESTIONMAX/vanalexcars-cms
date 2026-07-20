/**
 * normalizeImages.ts
 *
 * Décide si un ensemble d'URLs d'images entrant doit remplacer l'existant.
 * Filtre les URLs selon le CDN attendu pour la source.
 */

import type { DataSource, NormalizedField } from './types.js'

const CDN_PATTERNS: Partial<Record<DataSource, RegExp>> = {
  'autoscout24.nextdata': /prod\.pictures\.autoscout24\.net\/listing-images\//,
  'autoscout24.xhr':      /prod\.pictures\.autoscout24\.net\/listing-images\//,
  'autoscout24.jsonld':   /autoscout24/,
  'autoscout24.dom':      /autoscout24/,
  'autoscout24.import':   /autoscout24/,
}

function filterByCdn(urls: string[], source: DataSource): string[] {
  const pattern = CDN_PATTERNS[source]
  if (!pattern) return urls // Pas de restriction CDN pour les sources inconnues
  return urls.filter((u) => pattern.test(u))
}

function dedup(urls: string[]): string[] {
  return [...new Set(urls)]
}

export function normalizeImages(
  incoming: { urls: string[]; source: DataSource },
  existing?: { urls?: Array<{ url: string }> | null; quality?: string },
): NormalizedField<string[]> {
  const { urls, source } = incoming

  // ── Protection images manuelles ────────────────────────────────────────────
  if (existing?.quality === 'manual') {
    return {
      value: null,
      quality: 'manual',
      source,
      confidence: 1.0,
      skipReason: 'already_set',
      raw: urls,
    }
  }

  // ── Filtrage CDN ──────────────────────────────────────────────────────────
  const filtered = dedup(filterByCdn(urls, source))

  if (filtered.length === 0) {
    return {
      value: null,
      quality: 'missing',
      source,
      confidence: 0,
      skipReason: urls.length > 0 ? 'validation_failed' : 'source_empty',
      raw: urls,
    }
  }

  // ── Comparaison avec l'existant ───────────────────────────────────────────
  const existingCount = existing?.urls?.length ?? 0
  if (filtered.length <= existingCount) {
    return {
      value: null,
      quality: 'inferred',
      source,
      confidence: 0.8,
      skipReason: 'already_set',
      raw: urls,
    }
  }

  // ── Confiance selon source ────────────────────────────────────────────────
  let confidence: number
  switch (source) {
    case 'autoscout24.xhr':
    case 'autoscout24.nextdata': confidence = 0.95; break
    case 'autoscout24.jsonld':   confidence = 0.85; break
    case 'autoscout24.import':   confidence = 0.7; break
    case 'autoscout24.dom':      confidence = 0.5; break
    default:                     confidence = 0.4
  }

  return {
    value: filtered,
    quality: confidence >= 0.85 ? 'verified' : 'inferred',
    source,
    confidence,
    raw: urls,
  }
}
