/**
 * calculateMatchingScore.ts
 *
 * Calcule un score de matching déterministe (0-100) entre une annonce normalisée
 * et les critères d'une étude de marché.
 *
 * Décomposition des points :
 *   brand + model match     → 30 pts  (brand seule = 15, brand+model = 30)
 *   generation match        → 15 pts  (seulement si l'étude spécifie une génération)
 *   year in range           → 10 pts
 *   mileage within limit    → 10 pts
 *   fuel match              → 10 pts  (seulement si l'étude spécifie un carburant)
 *   body type match         → 10 pts  (seulement si l'étude spécifie des carrosseries)
 *   transmission match      →  5 pts  (seulement si l'étude spécifie une transmission)
 *   seller type match       →  5 pts  (seulement si l'étude spécifie des types vendeurs)
 *   power range match       →  5 pts  (seulement si l'étude spécifie une plage de puissance)
 *
 * Total maximal : 100 pts (réajusté selon les critères actifs)
 *
 * Pénalités pour mismatch sur champs requis :
 *   - brand mismatch: 0 pts (bloquant — aucun point pour brand)
 *   - year hors plage: 0 pts pour year
 *   - mileage au-delà: 0 pts pour mileage
 */

import type { NormalizedListing, MarketStudy } from './types'

interface MatchingScoreBreakdown {
  brandModelScore: number
  generationScore: number
  yearScore: number
  mileageScore: number
  fuelScore: number
  bodyTypeScore: number
  transmissionScore: number
  sellerTypeScore: number
  powerRangeScore: number
  total: number
  maxPossible: number
  normalizedScore: number
}

/**
 * Compare deux chaînes de manière insensible à la casse et aux tirets/espaces
 */
function looseMatcher(a: string | undefined | null, b: string | undefined | null): boolean {
  if (!a || !b) return false
  const normalize = (s: string) => s.toLowerCase().replace(/[-\s_]+/g, '')
  return normalize(a) === normalize(b)
}

/**
 * Calcule le score de matching d'une annonce vs les critères d'une étude.
 * Retourne un score normalisé sur 100.
 */
export function calculateMatchingScore(
  listing: NormalizedListing,
  study: MarketStudy,
): MatchingScoreBreakdown {
  let score = 0
  let maxPossible = 0

  // ── Brand + model match (30 pts) ─────────────────────────────────────────
  // Brand seule vaut 15 pts, brand + model vaut 30 pts
  {
    const maxBrandModel = 30
    maxPossible += maxBrandModel

    const brandMatch =
      looseMatcher(listing.normalizedMake, study.brand) ||
      looseMatcher(listing.normalizedMake?.toLowerCase(), study.brand?.toLowerCase())

    if (brandMatch) {
      const modelMatch = looseMatcher(listing.normalizedModel, study.model)
      if (modelMatch) {
        score += maxBrandModel
      } else {
        score += 15 // brand seule
      }
    }
    // Pas de points si brand ne correspond pas
  }
  const brandModelScore = score

  // ── Generation match (15 pts) — uniquement si étude spécifie une génération ──
  let generationScore = 0
  if (study.generation) {
    const maxGen = 15
    maxPossible += maxGen
    if (looseMatcher(listing.normalizedGeneration, study.generation)) {
      generationScore = maxGen
      score += maxGen
    }
  }

  // ── Year in range (10 pts) ───────────────────────────────────────────────
  let yearScore = 0
  if (study.yearMin !== undefined || study.yearMax !== undefined) {
    const maxYear = 10
    maxPossible += maxYear
    const year = listing.year
    if (year) {
      const minOk = study.yearMin == null || year >= study.yearMin
      const maxOk = study.yearMax == null || year <= study.yearMax
      if (minOk && maxOk) {
        yearScore = maxYear
        score += maxYear
      }
    }
  }

  // ── Mileage within limit (10 pts) ────────────────────────────────────────
  let mileageScore = 0
  if (study.mileageMax != null) {
    const maxMileage = 10
    maxPossible += maxMileage
    const km = listing.mileage
    if (km !== undefined && km <= study.mileageMax) {
      mileageScore = maxMileage
      score += maxMileage
    }
    // Pénalité: 0 pts si km > mileageMax
  }

  // ── Fuel match (10 pts) — uniquement si étude spécifie un carburant ─────
  let fuelScore = 0
  if (study.fuel) {
    const maxFuel = 10
    maxPossible += maxFuel
    const listingFuel = listing.normalizedFuel ?? listing.fuel
    if (listingFuel && looseMatcher(listingFuel, study.fuel)) {
      fuelScore = maxFuel
      score += maxFuel
    }
  }

  // ── Body type match (10 pts) — uniquement si étude spécifie des carrosseries ──
  let bodyTypeScore = 0
  if (study.bodyTypes && study.bodyTypes.length > 0) {
    const maxBody = 10
    maxPossible += maxBody
    const listingBody = listing.normalizedBodyType ?? listing.bodyType
    if (listingBody) {
      const matches = study.bodyTypes.some((bt) => looseMatcher(bt, listingBody))
      if (matches) {
        bodyTypeScore = maxBody
        score += maxBody
      }
    }
  }

  // ── Transmission match (5 pts) — uniquement si étude spécifie une transmission ──
  let transmissionScore = 0
  if (study.transmission) {
    const maxTrans = 5
    maxPossible += maxTrans
    const listingTrans = listing.normalizedTransmission ?? listing.transmission
    if (listingTrans && looseMatcher(listingTrans, study.transmission)) {
      transmissionScore = maxTrans
      score += maxTrans
    }
  }

  // ── Seller type match (5 pts) — uniquement si étude spécifie des types vendeurs ──
  let sellerTypeScore = 0
  if (study.sellerTypes && study.sellerTypes.length > 0) {
    const maxSeller = 5
    maxPossible += maxSeller
    const listingSeller = listing.normalizedSellerType ?? listing.sellerType
    if (listingSeller) {
      const matches = study.sellerTypes.some((st) => looseMatcher(st, listingSeller))
      if (matches) {
        sellerTypeScore = maxSeller
        score += maxSeller
      }
    }
  }

  // ── Power range match (5 pts) — uniquement si étude spécifie une plage de puissance ──
  let powerRangeScore = 0
  if (study.powerMinHp != null || study.powerMaxHp != null) {
    const maxPower = 5
    maxPossible += maxPower
    const hp = listing.powerHpNormalized ?? listing.powerHp
    if (hp !== undefined) {
      const minOk = study.powerMinHp == null || hp >= study.powerMinHp
      const maxOk = study.powerMaxHp == null || hp <= study.powerMaxHp
      if (minOk && maxOk) {
        powerRangeScore = maxPower
        score += maxPower
      }
    }
  }

  // ── Score normalisé (ramené sur 100) ─────────────────────────────────────
  // Si maxPossible = 0, retourner 0 (pas de critères actifs)
  const normalizedScore = maxPossible > 0 ? Math.round((score / maxPossible) * 100) : 0

  return {
    brandModelScore: brandModelScore,
    generationScore,
    yearScore,
    mileageScore,
    fuelScore,
    bodyTypeScore,
    transmissionScore,
    sellerTypeScore,
    powerRangeScore,
    total: score,
    maxPossible,
    normalizedScore,
  }
}
