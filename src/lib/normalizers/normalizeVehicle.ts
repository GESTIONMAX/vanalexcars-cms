/**
 * normalizeVehicle.ts
 *
 * Orchestrateur — applique tous les normaliseurs et retourne :
 *   - patch    : prêt pour payload.update()
 *   - decisions: détail champ par champ pour logging/audit
 *   - eligibility : éligibilité du vendeur (à vérifier avant payload.create())
 *
 * Cette fonction est pure : pas d'accès à la base, pas de scraping.
 * Elle reçoit les données en paramètre et retourne une structure immuable.
 */

import type {
  IncomingVehicleData,
  ExistingVehicleData,
  NormalizationResult,
  MergeDecision,
  VehicleEligibilityReason,
  NormalizedField,
} from './types.js'
import { normalizeDealer } from './normalizeDealer.js'
import { normalizePrice } from './normalizePrice.js'
import { normalizeMileage } from './normalizeMileage.js'
import { normalizeImages } from './normalizeImages.js'
import { normalizeTextField, normalizeStringArray } from './normalizeTextField.js'
import { normalizeNumericField } from './normalizeNumericField.js'
import { normalizeSpecifications } from './normalizeSpecifications.js'

// ─── Helper pour construire les MergeDecisions ────────────────────────────────

function toDecision(field: string, result: NormalizedField<unknown>): MergeDecision {
  return {
    field,
    action: result.value !== null ? 'write' : 'skip',
    incoming: result,
    reason: result.skipReason ?? (result.value !== null ? 'new_value' : 'unknown'),
  }
}

// ─── Orchestrateur ────────────────────────────────────────────────────────────

export function normalizeVehicle(
  incoming: IncomingVehicleData,
  existing: ExistingVehicleData,
): NormalizationResult {
  const { source } = incoming
  const patch: Record<string, unknown> = {}
  const decisions: MergeDecision[] = []

  // ── Prix ──────────────────────────────────────────────────────────────────
  const priceResult = normalizePrice(
    { value: incoming.price, source },
    { value: existing.price },
  )
  decisions.push(toDecision('price', priceResult))
  if (priceResult.value !== null) patch.price = priceResult.value

  // ── Kilométrage ───────────────────────────────────────────────────────────
  const mileageResult = normalizeMileage(
    { value: incoming.mileage, source },
    { value: existing.mileage },
  )
  decisions.push(toDecision('mileage', mileageResult))
  if (mileageResult.value !== null) patch.mileage = mileageResult.value

  // ── Concessionnaire ───────────────────────────────────────────────────────
  const dealerResult = normalizeDealer(
    { name: incoming.dealer, city: incoming.dealerCity, source },
    { name: existing.dealer, city: existing.dealerCity },
  )
  decisions.push(toDecision('dealer', dealerResult.name))
  decisions.push(toDecision('dealerCity', dealerResult.city))
  if (dealerResult.name.value !== null) patch.dealer = dealerResult.name.value
  if (dealerResult.city.value !== null) patch.dealerCity = dealerResult.city.value

  // ── Images ────────────────────────────────────────────────────────────────
  const imagesResult = normalizeImages(
    { urls: incoming.imageUrls ?? [], source },
    { urls: existing.imageUrls ?? [] },
  )
  decisions.push(toDecision('imageUrls', imagesResult))
  if (imagesResult.value !== null) {
    patch.imageUrls = imagesResult.value.map((url) => ({ url }))
  }

  // ── Description ───────────────────────────────────────────────────────────
  const descResult = normalizeTextField(
    { value: incoming.description, source },
    { value: existing.description },
  )
  decisions.push(toDecision('description', descResult))
  if (descResult.value !== null) patch.description = descResult.value

  // ── Équipements (features) ────────────────────────────────────────────────
  const featuresResult = normalizeStringArray(
    { values: incoming.features, source },
    { values: existing.features ?? [] },
  )
  decisions.push(toDecision('features', featuresResult))
  if (featuresResult.value !== null) {
    patch.features = featuresResult.value.map((f) => ({ feature: f }))
  }

  // ── Couleur extérieure ────────────────────────────────────────────────────
  const extColorResult = normalizeTextField(
    { value: incoming.exteriorColor, source },
    { value: existing.exteriorColor },
  )
  decisions.push(toDecision('exteriorColor', extColorResult))
  if (extColorResult.value !== null) patch.exteriorColor = extColorResult.value

  // ── Couleur intérieure ────────────────────────────────────────────────────
  const intColorResult = normalizeTextField(
    { value: incoming.interiorColor, source },
    { value: existing.interiorColor },
  )
  decisions.push(toDecision('interiorColor', intColorResult))
  if (intColorResult.value !== null) patch.interiorColor = intColorResult.value

  // ── Portes ────────────────────────────────────────────────────────────────
  const doorsResult = normalizeNumericField(
    { value: incoming.doors, source, min: 1, max: 10 },
    { value: existing.doors },
  )
  decisions.push(toDecision('doors', doorsResult))
  if (doorsResult.value !== null) patch.doors = doorsResult.value

  // ── Places ────────────────────────────────────────────────────────────────
  const seatsResult = normalizeNumericField(
    { value: incoming.seats, source, min: 1, max: 20 },
    { value: existing.seats },
  )
  decisions.push(toDecision('seats', seatsResult))
  if (seatsResult.value !== null) patch.seats = seatsResult.value

  // ── Spécifications techniques ─────────────────────────────────────────────
  const specsResult = normalizeSpecifications(
    { value: incoming.specifications, source },
    { value: existing.specifications },
  )
  decisions.push(toDecision('specifications', specsResult))
  if (specsResult.value !== null) patch.specifications = specsResult.value

  // ── Résultat ──────────────────────────────────────────────────────────────
  const appliedFields = Object.keys(patch)
  const eligibility: VehicleEligibilityReason = dealerResult.eligibility

  return {
    patch,
    decisions,
    appliedFields,
    noop: appliedFields.length === 0,
    eligibility,
  }
}
