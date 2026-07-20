/**
 * normalizeTextField.ts
 *
 * Générique pour les champs texte simples : règle "écrire si absent, ne pas écraser".
 * Utilisé pour description, exteriorColor, interiorColor, features, etc.
 */

import type { DataSource, DataQuality, NormalizedField } from './types.js'

export function normalizeTextField(
  incoming: { value?: string; source: DataSource },
  existing?: { value?: string | null; quality?: DataQuality },
): NormalizedField<string> {
  const { source } = incoming
  const value = incoming.value?.trim() ?? ''

  if (value === '') {
    return { value: null, quality: 'missing', source, confidence: 0, skipReason: 'source_empty', raw: incoming.value }
  }

  if (existing?.quality === 'manual') {
    return { value: null, quality: 'manual', source, confidence: 1.0, skipReason: 'already_set', raw: value }
  }

  if (existing?.value && existing.value.trim() !== '') {
    return { value: null, quality: 'inferred', source, confidence: 0.5, skipReason: 'already_set', raw: value }
  }

  const confidence = source === 'autoscout24.nextdata' || source === 'autoscout24.jsonld' ? 0.85 : 0.5
  const quality: DataQuality = confidence >= 0.85 ? 'verified' : 'inferred'

  return { value, quality, source, confidence, raw: value }
}

/**
 * Variante pour les tableaux de strings (équipements, features).
 */
export function normalizeStringArray(
  incoming: { values?: string[]; source: DataSource },
  existing?: { values?: unknown[]; quality?: DataQuality },
): NormalizedField<string[]> {
  const { source } = incoming
  const values = (incoming.values ?? []).map((s) => s.trim()).filter(Boolean)

  if (values.length === 0) {
    return { value: null, quality: 'missing', source, confidence: 0, skipReason: 'source_empty', raw: incoming.values }
  }

  if (existing?.quality === 'manual') {
    return { value: null, quality: 'manual', source, confidence: 1.0, skipReason: 'already_set', raw: values }
  }

  if (existing?.values && existing.values.length > 0) {
    return { value: null, quality: 'inferred', source, confidence: 0.5, skipReason: 'already_set', raw: values }
  }

  const confidence = source === 'autoscout24.nextdata' || source === 'autoscout24.jsonld' ? 0.8 : 0.5
  const quality: DataQuality = confidence >= 0.8 ? 'verified' : 'inferred'

  return { value: values, quality, source, confidence, raw: values }
}
