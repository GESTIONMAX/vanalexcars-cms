/**
 * normalizePrice.ts
 *
 * Valide et qualifie un prix, décide si la mise à jour est justifiée.
 */

import type { DataSource, DataQuality, NormalizedField } from './types.js'

const MIN_PLAUSIBLE_PRICE = 500       // < 500 € → suspect
const MAX_PLAUSIBLE_PRICE = 500_000   // > 500k € → exceptionnel
const LARGE_VARIATION_THRESHOLD = 0.30 // > 30% → suspect

export function normalizePrice(
  incoming: { value?: number; source: DataSource },
  existing?: { value?: number | null; quality?: DataQuality },
): NormalizedField<number> {
  const { value, source } = incoming

  // ── Valeur absente ────────────────────────────────────────────────────────
  if (value == null || isNaN(value)) {
    return { value: null, quality: 'missing', source, confidence: 0, skipReason: 'source_empty', raw: value }
  }

  // ── Validation plage ──────────────────────────────────────────────────────
  if (value <= 0) {
    return { value: null, quality: 'missing', source, confidence: 0, skipReason: 'validation_failed', raw: value }
  }

  // ── Protection saisie manuelle ────────────────────────────────────────────
  if (existing?.quality === 'manual' && existing?.value != null && existing.value > 0) {
    return { value: null, quality: 'inferred', source, confidence: 0.3, skipReason: 'already_set', raw: value }
  }

  // ── Calcul de la confiance ────────────────────────────────────────────────
  let confidence: number
  let quality: DataQuality

  switch (source) {
    case 'autoscout24.nextdata':
    case 'autoscout24.jsonld':
    case 'autoscout24.xhr':
      confidence = 0.9
      quality = 'verified'
      break
    case 'autoscout24.import':
      confidence = 0.75
      quality = 'inferred'
      break
    case 'autoscout24.dom':
      confidence = 0.5
      quality = 'inferred'
      break
    default:
      confidence = 0.4
      quality = 'inferred'
  }

  // ── Plausibilité du prix ──────────────────────────────────────────────────
  if (value > MAX_PLAUSIBLE_PRICE) {
    confidence = Math.min(confidence, 0.5)
    quality = 'inferred'
  } else if (value < MIN_PLAUSIBLE_PRICE) {
    confidence = Math.min(confidence, 0.3)
    quality = 'inferred'
  }

  // ── Variation excessive par rapport à l'existant ──────────────────────────
  const existingValue = existing?.value
  if (existingValue != null && existingValue > 0) {
    const variation = Math.abs((value - existingValue) / existingValue)
    if (variation > LARGE_VARIATION_THRESHOLD) {
      confidence = Math.min(confidence, 0.4)
      quality = 'inferred'
    }
  }

  return { value, quality, source, confidence, raw: value }
}
