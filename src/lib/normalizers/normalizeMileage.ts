/**
 * normalizeMileage.ts
 *
 * Valide le kilométrage et applique la règle métier de non-régression :
 * un kilométrage ne peut pas diminuer d'une mise à jour à l'autre.
 */

import type { DataSource, DataQuality, NormalizedField } from './types.js'

const MAX_PLAUSIBLE_MILEAGE = 1_500_000 // > 1.5M km → suspect

export function normalizeMileage(
  incoming: { value?: number; source: DataSource },
  existing?: { value?: number | null; quality?: DataQuality },
): NormalizedField<number> {
  const { value, source } = incoming

  // ── Valeur absente ────────────────────────────────────────────────────────
  if (value == null || isNaN(value)) {
    return { value: null, quality: 'missing', source, confidence: 0, skipReason: 'source_empty', raw: value }
  }

  // ── Validation plage ──────────────────────────────────────────────────────
  if (value < 0) {
    return { value: null, quality: 'missing', source, confidence: 0, skipReason: 'validation_failed', raw: value }
  }
  if (value > MAX_PLAUSIBLE_MILEAGE) {
    return { value: null, quality: 'inferred', source, confidence: 0.1, skipReason: 'validation_failed', raw: value }
  }

  // ── Protection saisie manuelle ────────────────────────────────────────────
  if (existing?.quality === 'manual' && existing?.value != null) {
    return { value: null, quality: 'inferred', source, confidence: 0.3, skipReason: 'already_set', raw: value }
  }

  // ── Règle de non-régression ───────────────────────────────────────────────
  const existingValue = existing?.value
  if (existingValue != null) {
    if (value < existingValue) {
      // Kilométrage ne peut pas diminuer — valeur entrante rejetée
      return {
        value: null,
        quality: 'inferred',
        source,
        confidence: 0.2,
        skipReason: 'quality_too_low',
        raw: value,
      }
    }
    if (value === existingValue) {
      return { value: null, quality: 'inferred', source, confidence: 0.9, skipReason: 'already_set', raw: value }
    }
  }

  // ── Confiance selon source ────────────────────────────────────────────────
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

  return { value, quality, source, confidence, raw: value }
}
