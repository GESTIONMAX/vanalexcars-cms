/**
 * buildEnrichmentPatch.ts
 *
 * Fonctions partagées de construction du patch Payload pour l'enrichissement AS24.
 * Utilisées par :
 *   - src/endpoints/enrichVehicle.ts
 *   - src/endpoints/bulkEnrich.ts
 *   - src/scripts/bulk-enrich.ts
 *
 * Ces fonctions garantissent que les trois voies d'exécution produisent
 * exactement les mêmes effets métier.
 */

import type { Vehicle } from '@/payload-types'
import type { EnrichmentResult } from './enrichAs24Listing'

// ── Types ────────────────────────────────────────────────────────────────────

/** Patch pour payload.update() — résultat de succès */
export interface EnrichmentSuccessPatch {
  patch: Record<string, unknown>
  /** Champs effectivement enrichis (hors lastScrapedAt) */
  appliedFields: string[]
  /** true si aucune donnée nouvelle à écrire */
  noop: boolean
}

/** Patch pour payload.update() — annonce supprimée */
export interface ListingRemovedPatch {
  status: 'inactive'
  sourceInactiveAt: string
  sourceInactiveReason: 'source_404' | 'source_410'
  enrichmentStatus: 'completed'
  enrichmentCompletedAt: string
  enrichmentLastError: null
}

// ── Fonctions ────────────────────────────────────────────────────────────────

/**
 * Construit le patch de mise à jour pour un résultat de type `success`.
 *
 * Règle fondamentale : ne jamais écraser un champ déjà renseigné en base.
 * Exception : images, si le nombre trouvé est supérieur au nombre actuel.
 */
export function buildEnrichmentSuccessPatch(
  result: Extract<EnrichmentResult, { kind: 'success' }>,
  vehicle: Pick<
    Vehicle,
    | 'imageUrls'
    | 'description'
    | 'features'
    | 'specifications'
    | 'exteriorColor'
    | 'interiorColor'
    | 'doors'
    | 'seats'
    | 'dealer'
    | 'dealerCity'
    | 'price'
    | 'mileage'
  >,
): EnrichmentSuccessPatch {
  const { imageUrls, extractedData } = result
  const patch: Record<string, unknown> = {}

  // Images : enrichir seulement si on a trouvé plus que ce qui est en base
  const currentImageCount = vehicle.imageUrls?.length ?? 0
  if (imageUrls.length > currentImageCount) {
    patch.imageUrls = imageUrls.map((url) => ({ url }))
  }

  // Description
  if (extractedData.description && !vehicle.description) {
    patch.description = extractedData.description
  }

  // Équipements
  if (extractedData.features?.length && !vehicle.features?.length) {
    patch.features = extractedData.features.map((f) => ({ feature: f }))
  }

  // Spécifications techniques
  const existingSpecs = vehicle.specifications as Record<string, unknown> | undefined | null
  if (extractedData.specifications?.power && !existingSpecs?.power) {
    patch.specifications = { ...(existingSpecs ?? {}), ...extractedData.specifications }
  }

  // Couleurs
  if (extractedData.exteriorColor && !vehicle.exteriorColor) {
    patch.exteriorColor = extractedData.exteriorColor
  }
  if (extractedData.interiorColor && !vehicle.interiorColor) {
    patch.interiorColor = extractedData.interiorColor
  }

  // Portes / places
  if (extractedData.doors && !vehicle.doors) patch.doors = extractedData.doors
  if (extractedData.seats && !vehicle.seats) patch.seats = extractedData.seats

  // Concessionnaire
  if (extractedData.dealer && !vehicle.dealer) patch.dealer = extractedData.dealer
  if (extractedData.dealerCity && !vehicle.dealerCity) patch.dealerCity = extractedData.dealerCity

  // Prix et kilométrage
  if (extractedData.price && extractedData.price > 0 && !(vehicle.price && vehicle.price > 0)) {
    patch.price = extractedData.price
  }
  if (extractedData.mileage != null && !(vehicle.mileage != null && vehicle.mileage > 0)) {
    patch.mileage = extractedData.mileage
  }

  // Horodatage de passage (toujours)
  patch.lastScrapedAt = new Date().toISOString()

  const appliedFields = Object.keys(patch).filter((k) => k !== 'lastScrapedAt')

  return {
    patch,
    appliedFields,
    noop: appliedFields.length === 0,
  }
}

/**
 * Construit le patch de mise à jour pour un résultat de type `listing_removed`.
 *
 * L'annonce est définitivement supprimée chez AS24 (404 ou 410).
 * Le véhicule passe en statut `inactive` — c'est un résultat business définitif,
 * pas un échec d'enrichissement, d'où enrichmentStatus → 'completed'.
 */
export function buildListingRemovedPatch(
  result: Extract<EnrichmentResult, { kind: 'listing_removed' }>,
): ListingRemovedPatch {
  const now = new Date().toISOString()
  return {
    status: 'inactive',
    sourceInactiveAt: now,
    sourceInactiveReason: result.httpStatus === 404 ? 'source_404' : 'source_410',
    enrichmentStatus: 'completed',
    enrichmentCompletedAt: now,
    enrichmentLastError: null,
  }
}

/**
 * Construit le message d'erreur structuré pour un résultat `temporary_error`.
 * Le statut métier du véhicule n'est pas modifié par ce patch.
 */
export function buildTemporaryErrorPatch(
  result: Extract<EnrichmentResult, { kind: 'temporary_error' }>,
): { enrichmentStatus: 'failed'; enrichmentLastError: string } {
  return {
    enrichmentStatus: 'failed',
    enrichmentLastError: `${result.code}: ${result.message}`.slice(0, 500),
  }
}
