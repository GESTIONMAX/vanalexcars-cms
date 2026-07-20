/**
 * calculateMatchingScore.test.ts
 *
 * Tests du score de matching annonce/étude.
 */

import { describe, it, expect } from 'vitest'
import { calculateMatchingScore } from '../../services/market-analysis/calculateMatchingScore'
import type { NormalizedListing, MarketStudy } from '../../services/market-analysis/types'

const baseStudy: MarketStudy = {
  id: 'study-1',
  name: 'MINI JCW Test',
  brand: 'MINI',
  model: 'John Cooper Works',
  generation: 'F56',
  yearMin: 2020,
  yearMax: 2024,
  mileageMax: 80000,
  fuel: 'petrol',
  transmission: 'automatic',
  powerMinHp: 220,
  powerMaxHp: 320,
  sellerTypes: ['professional'],
  bodyTypes: ['coupe', 'convertible'],
}

const perfectListing: NormalizedListing = {
  sourceId: 'listing-1',
  sourceUrl: 'https://as24.de/listing-1',
  price: 25000,
  year: 2022,
  mileage: 30000,
  normalizedMake: 'MINI',
  normalizedModel: 'John Cooper Works',
  normalizedGeneration: 'F56',
  normalizedFuel: 'petrol',
  normalizedTransmission: 'automatic',
  normalizedBodyType: 'coupe',
  normalizedSellerType: 'professional',
  powerHpNormalized: 260,
  normalizationConfidence: 90,
}

describe('calculateMatchingScore', () => {
  it('annonce parfaite → score 100', () => {
    const { normalizedScore } = calculateMatchingScore(perfectListing, baseStudy)
    expect(normalizedScore).toBe(100)
  })

  it('marque seule correcte → 15 pts brand', () => {
    const listing: NormalizedListing = {
      ...perfectListing,
      normalizedModel: 'Unknown Model',
    }
    const { brandModelScore } = calculateMatchingScore(listing, baseStudy)
    expect(brandModelScore).toBe(15)
  })

  it('marque + modèle corrects → 30 pts', () => {
    const { brandModelScore } = calculateMatchingScore(perfectListing, baseStudy)
    expect(brandModelScore).toBe(30)
  })

  it('marque incorrecte → 0 pts brand', () => {
    const listing: NormalizedListing = {
      ...perfectListing,
      normalizedMake: 'BMW',
    }
    const { brandModelScore } = calculateMatchingScore(listing, baseStudy)
    expect(brandModelScore).toBe(0)
  })

  it('génération correcte → 15 pts generation', () => {
    const { generationScore } = calculateMatchingScore(perfectListing, baseStudy)
    expect(generationScore).toBe(15)
  })

  it('génération incorrecte → 0 pts generation', () => {
    const listing: NormalizedListing = {
      ...perfectListing,
      normalizedGeneration: 'F54',
    }
    const { generationScore } = calculateMatchingScore(listing, baseStudy)
    expect(generationScore).toBe(0)
  })

  it('année dans la plage → 10 pts year', () => {
    const { yearScore } = calculateMatchingScore(perfectListing, baseStudy)
    expect(yearScore).toBe(10)
  })

  it('année hors plage → 0 pts year', () => {
    const listing: NormalizedListing = { ...perfectListing, year: 2019 }
    const { yearScore } = calculateMatchingScore(listing, baseStudy)
    expect(yearScore).toBe(0)
  })

  it('kilométrage dans la limite → 10 pts mileage', () => {
    const { mileageScore } = calculateMatchingScore(perfectListing, baseStudy)
    expect(mileageScore).toBe(10)
  })

  it('kilométrage au-delà → 0 pts mileage', () => {
    const listing: NormalizedListing = { ...perfectListing, mileage: 100000 }
    const { mileageScore } = calculateMatchingScore(listing, baseStudy)
    expect(mileageScore).toBe(0)
  })

  it('carburant correct → 10 pts fuel', () => {
    const { fuelScore } = calculateMatchingScore(perfectListing, baseStudy)
    expect(fuelScore).toBe(10)
  })

  it('carburant incorrect → 0 pts fuel', () => {
    const listing: NormalizedListing = { ...perfectListing, normalizedFuel: 'diesel' }
    const { fuelScore } = calculateMatchingScore(listing, baseStudy)
    expect(fuelScore).toBe(0)
  })

  it('transmission correcte → 5 pts', () => {
    const { transmissionScore } = calculateMatchingScore(perfectListing, baseStudy)
    expect(transmissionScore).toBe(5)
  })

  it('carrosserie correcte → 10 pts', () => {
    const { bodyTypeScore } = calculateMatchingScore(perfectListing, baseStudy)
    expect(bodyTypeScore).toBe(10)
  })

  it('type vendeur correct → 5 pts', () => {
    const { sellerTypeScore } = calculateMatchingScore(perfectListing, baseStudy)
    expect(sellerTypeScore).toBe(5)
  })

  it('puissance dans la plage → 5 pts', () => {
    const { powerRangeScore } = calculateMatchingScore(perfectListing, baseStudy)
    expect(powerRangeScore).toBe(5)
  })

  it('puissance hors plage → 0 pts', () => {
    const listing: NormalizedListing = { ...perfectListing, powerHpNormalized: 150 }
    const { powerRangeScore } = calculateMatchingScore(listing, baseStudy)
    expect(powerRangeScore).toBe(0)
  })

  it('étude sans critères → score 0 (maxPossible=0)', () => {
    const minimalStudy: MarketStudy = {
      id: 'minimal',
      name: 'Minimal',
      brand: '',
      model: '',
    }
    const { normalizedScore } = calculateMatchingScore(perfectListing, minimalStudy)
    expect(normalizedScore).toBe(0)
  })

  it('listing sans marque vs étude avec marque → score réduit', () => {
    const noMakeListing: NormalizedListing = {
      ...perfectListing,
      normalizedMake: undefined,
    }
    const { normalizedScore } = calculateMatchingScore(noMakeListing, baseStudy)
    expect(normalizedScore).toBeLessThan(100)
  })
})
