/**
 * normalizeNumericField.ts
 *
 * Générique pour les champs numériques simples (portes, places).
 * Règle : écrire si absent et valeur > 0, ne pas écraser.
 */

import type { DataSource, DataQuality, NormalizedField } from './types.js'

export function normalizeNumericField(
  incoming: { value?: number; source: DataSource; min?: number; max?: number },
  existing?: { value?: number | null; quality?: DataQuality },
): NormalizedField<number> {
  const { value, source, min = 1, max = Infinity } = incoming

  if (value == null || isNaN(value)) {
    return { value: null, quality: 'missing', source, confidence: 0, skipReason: 'source_empty', raw: value }
  }

  if (value < min || value > max) {
    return { value: null, quality: 'missing', source, confidence: 0, skipReason: 'validation_failed', raw: value }
  }

  if (existing?.quality === 'manual') {
    return { value: null, quality: 'manual', source, confidence: 1.0, skipReason: 'already_set', raw: value }
  }

  if (existing?.value != null && existing.value > 0) {
    return { value: null, quality: 'inferred', source, confidence: 0.5, skipReason: 'already_set', raw: value }
  }

  const confidence = source === 'autoscout24.nextdata' ? 0.9 : source === 'autoscout24.dom' ? 0.5 : 0.7
  const quality: DataQuality = confidence >= 0.85 ? 'verified' : 'inferred'

  return { value, quality, source, confidence, raw: value }
}
