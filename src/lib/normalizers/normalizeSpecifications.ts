/**
 * normalizeSpecifications.ts
 *
 * Normalise le groupe de spécifications techniques (puissance, kW, ch).
 * Stratégie : merger les champs individuels, ne pas écraser ce qui existe déjà.
 */

import type { DataSource, NormalizedField } from './types.js'

type SpecificationsData = {
  power?: string | null
  powerKw?: number | null
  powerHp?: number | null
}

export function normalizeSpecifications(
  incoming: { value?: SpecificationsData; source: DataSource },
  existing?: { value?: SpecificationsData | null },
): NormalizedField<SpecificationsData> {
  const { source } = incoming
  const inc = incoming.value

  if (!inc || (!inc.power && !inc.powerKw && !inc.powerHp)) {
    return { value: null, quality: 'missing', source, confidence: 0, skipReason: 'source_empty', raw: inc }
  }

  const existingSpec = existing?.value

  // Merger champ par champ : ne pas écraser ce qui existe déjà
  const merged: SpecificationsData = { ...existingSpec }

  if (inc.power && !existingSpec?.power) merged.power = inc.power
  if (inc.powerKw && !existingSpec?.powerKw) merged.powerKw = inc.powerKw
  if (inc.powerHp && !existingSpec?.powerHp) merged.powerHp = inc.powerHp

  // Si aucun champ nouveau n'a été ajouté
  const hasNew =
    (inc.power && !existingSpec?.power) ||
    (inc.powerKw && !existingSpec?.powerKw) ||
    (inc.powerHp && !existingSpec?.powerHp)

  if (!hasNew) {
    return { value: null, quality: 'inferred', source, confidence: 0.5, skipReason: 'already_set', raw: inc }
  }

  const confidence = source === 'autoscout24.nextdata' ? 0.9 : source === 'autoscout24.dom' ? 0.5 : 0.7

  return {
    value: merged,
    quality: confidence >= 0.85 ? 'verified' : 'inferred',
    source,
    confidence,
    raw: inc,
  }
}
