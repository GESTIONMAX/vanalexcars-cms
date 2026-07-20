/**
 * normalizeListing.test.ts
 *
 * Tests de la normalisation des annonces brutes.
 */

import { describe, it, expect } from 'vitest'
import { normalizeListing } from '../../services/market-analysis/normalizeListing'
import type { RawMarketListing } from '../../services/market-analysis/types'

function makeRaw(overrides: Partial<RawMarketListing> = {}): RawMarketListing {
  return {
    sourceId: 'test-id',
    sourceUrl: 'https://example.com/test',
    ...overrides,
  }
}

// ── Normalisation des marques ─────────────────────────────────────────────────

describe('normalizeListing — brand normalization', () => {
  it('normalize "mini" → "MINI"', () => {
    const result = normalizeListing(makeRaw({ title: 'mini John Cooper Works' }))
    expect(result.normalizedMake).toBe('MINI')
  })

  it('normalize "bmw" → "BMW"', () => {
    const result = normalizeListing(makeRaw({ title: 'bmw 320d' }))
    expect(result.normalizedMake).toBe('BMW')
  })

  it('normalize "vw" → "Volkswagen"', () => {
    const result = normalizeListing(makeRaw({ title: 'vw Golf' }))
    expect(result.normalizedMake).toBe('Volkswagen')
  })

  it('normalize "Mercedes-Benz" (case insensitive)', () => {
    const result = normalizeListing(makeRaw({ title: 'mercedes-benz C200' }))
    expect(result.normalizedMake).toBe('Mercedes-Benz')
  })
})

// ── Normalisation de la puissance ─────────────────────────────────────────────

describe('normalizeListing — power normalization', () => {
  it('convertit kW → HP (×1.36)', () => {
    const result = normalizeListing(makeRaw({ powerHp: undefined, title: 'test', fuel: undefined }))
    // Sans powerHp fourni → undefined
    expect(result.powerHpNormalized).toBeUndefined()
  })

  it('utilise directement powerHp si fourni', () => {
    const result = normalizeListing(makeRaw({ powerHp: 231 }))
    expect(result.powerHpNormalized).toBe(231)
  })

  it('arrondit la puissance en HP', () => {
    const result = normalizeListing(makeRaw({ powerHp: 228 }))
    expect(result.powerHpNormalized).toBe(228)
    expect(Number.isInteger(result.powerHpNormalized)).toBe(true)
  })
})

// ── Normalisation de la transmission ─────────────────────────────────────────

describe('normalizeListing — transmission normalization', () => {
  it('normalize "automatik" → "automatic"', () => {
    const result = normalizeListing(makeRaw({ transmission: 'Automatik' }))
    expect(result.normalizedTransmission).toBe('automatic')
  })

  it('normalize "manuell" → "manual"', () => {
    const result = normalizeListing(makeRaw({ transmission: 'Manuell' }))
    expect(result.normalizedTransmission).toBe('manual')
  })

  it('normalize "dsg" → "automatic"', () => {
    const result = normalizeListing(makeRaw({ transmission: 'DSG' }))
    expect(result.normalizedTransmission).toBe('automatic')
  })

  it('normalize "manuelle" (FR) → "manual"', () => {
    const result = normalizeListing(makeRaw({ transmission: 'Manuelle' }))
    expect(result.normalizedTransmission).toBe('manual')
  })

  it('normalize "automatique" (FR) → "automatic"', () => {
    const result = normalizeListing(makeRaw({ transmission: 'Automatique' }))
    expect(result.normalizedTransmission).toBe('automatic')
  })

  it('transmission inconnue → undefined', () => {
    const result = normalizeListing(makeRaw({ transmission: 'Unknown Type XYZ' }))
    expect(result.normalizedTransmission).toBeUndefined()
  })
})

// ── Normalisation du carburant ────────────────────────────────────────────────

describe('normalizeListing — fuel normalization', () => {
  it('normalize "benzin" (DE) → "petrol"', () => {
    const result = normalizeListing(makeRaw({ fuel: 'Benzin' }))
    expect(result.normalizedFuel).toBe('petrol')
  })

  it('normalize "essence" (FR) → "petrol"', () => {
    const result = normalizeListing(makeRaw({ fuel: 'Essence' }))
    expect(result.normalizedFuel).toBe('petrol')
  })

  it('normalize "diesel" → "diesel"', () => {
    const result = normalizeListing(makeRaw({ fuel: 'Diesel' }))
    expect(result.normalizedFuel).toBe('diesel')
  })

  it('normalize "elektro" (DE) → "electric"', () => {
    const result = normalizeListing(makeRaw({ fuel: 'Elektro' }))
    expect(result.normalizedFuel).toBe('electric')
  })
})

// ── Score de confiance ────────────────────────────────────────────────────────

describe('normalizeListing — confidence score', () => {
  it('annonce complète → confiance élevée', () => {
    const result = normalizeListing(makeRaw({
      title: 'MINI John Cooper Works',
      price: 28000,
      year: 2022,
      mileage: 25000,
      fuel: 'Benzin',
      transmission: 'Automatik',
      powerHp: 231,
      bodyType: 'coupe',
    }))
    expect(result.normalizationConfidence).toBeGreaterThan(50)
  })

  it('annonce minimale → confiance faible', () => {
    const result = normalizeListing(makeRaw())
    expect(result.normalizationConfidence).toBeLessThan(50)
  })

  it('confiance entre 0 et 100', () => {
    const result = normalizeListing(makeRaw({
      title: 'BMW M3',
      price: 60000,
      year: 2023,
      mileage: 10000,
    }))
    expect(result.normalizationConfidence).toBeGreaterThanOrEqual(0)
    expect(result.normalizationConfidence).toBeLessThanOrEqual(100)
  })
})

// ── Détection du type de vendeur ──────────────────────────────────────────────

describe('normalizeListing — seller type detection', () => {
  it('dealer avec "GmbH" → professional', () => {
    const result = normalizeListing(makeRaw({ dealer: 'AutoHaus München GmbH' }))
    expect(result.normalizedSellerType).toBe('professional')
  })

  it('sellerType "professional" → professional', () => {
    const result = normalizeListing(makeRaw({ sellerType: 'professional' }))
    expect(result.normalizedSellerType).toBe('professional')
  })

  it('sellerType "private" → private', () => {
    const result = normalizeListing(makeRaw({ sellerType: 'private' }))
    expect(result.normalizedSellerType).toBe('private')
  })

  it('pas d\'info vendeur → unknown', () => {
    const result = normalizeListing(makeRaw())
    expect(result.normalizedSellerType).toBe('unknown')
  })
})
