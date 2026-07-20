import { describe, it, expect } from 'vitest'
import { normalizeDealer } from '../../lib/normalizers/normalizeDealer'

// ─── Éligibilité — cas principaux ─────────────────────────────────────────────

describe('normalizeDealer — éligibilité', () => {
  it('concessionnaire officiel reconnu comme éligible', () => {
    const result = normalizeDealer(
      { name: 'BMW München GmbH', source: 'autoscout24.nextdata' },
    )
    expect(result.eligibility).toBe('eligible_professional_seller')
    expect(result.name.value).toBe('BMW München GmbH')
    expect(result.name.skipReason).toBeUndefined()
  })

  it('vendeur professionnel générique reconnu comme éligible', () => {
    const result = normalizeDealer(
      { name: 'AutoHaus Berlin', source: 'autoscout24.dom' },
    )
    expect(result.eligibility).toBe('eligible_professional_seller')
    expect(result.name.value).toBe('AutoHaus Berlin')
  })

  it('"Particulier" rejeté avec private_seller_not_eligible', () => {
    const result = normalizeDealer(
      { name: 'Particulier', source: 'autoscout24.nextdata' },
    )
    expect(result.eligibility).toBe('private_seller_not_eligible')
    expect(result.name.value).toBeNull()
    expect(result.name.skipReason).toBe('private_seller')
  })

  it('"Privat" rejeté avec private_seller_not_eligible', () => {
    const result = normalizeDealer(
      { name: 'Privat', source: 'autoscout24.nextdata' },
    )
    expect(result.eligibility).toBe('private_seller_not_eligible')
    expect(result.name.value).toBeNull()
    expect(result.name.skipReason).toBe('private_seller')
  })

  it('"Privé" rejeté avec private_seller_not_eligible', () => {
    const result = normalizeDealer(
      { name: 'Privé', source: 'autoscout24.nextdata' },
    )
    expect(result.eligibility).toBe('private_seller_not_eligible')
    expect(result.name.value).toBeNull()
    expect(result.name.skipReason).toBe('private_seller')
  })

  it('"Privatverkauf" (variante allemande) rejeté', () => {
    const result = normalizeDealer(
      { name: 'Privatverkauf', source: 'autoscout24.dom' },
    )
    expect(result.eligibility).toBe('private_seller_not_eligible')
    expect(result.name.skipReason).toBe('private_seller')
  })

  it('"vendeur particulier" (casse mixte) rejeté', () => {
    const result = normalizeDealer(
      { name: 'Vendeur Particulier', source: 'autoscout24.nextdata' },
    )
    expect(result.eligibility).toBe('private_seller_not_eligible')
  })

  it('dealer manquant classé seller_unknown — pas comme particulier', () => {
    const result = normalizeDealer(
      { name: undefined, source: 'autoscout24.nextdata' },
    )
    expect(result.eligibility).toBe('seller_unknown')
    expect(result.name.value).toBeNull()
    expect(result.name.skipReason).toBe('source_empty')
    expect(result.name.skipReason).not.toBe('private_seller')
  })

  it('dealer vide (string vide) classé seller_unknown', () => {
    const result = normalizeDealer(
      { name: '', source: 'autoscout24.dom' },
    )
    expect(result.eligibility).toBe('seller_unknown')
    expect(result.name.skipReason).toBe('source_empty')
  })
})

// ─── Placeholders génériques ──────────────────────────────────────────────────

describe('normalizeDealer — placeholders génériques', () => {
  it('"N/A" classé placeholder + seller_unknown', () => {
    const result = normalizeDealer(
      { name: 'N/A', source: 'autoscout24.dom' },
    )
    expect(result.eligibility).toBe('seller_unknown')
    expect(result.name.skipReason).toBe('placeholder')
  })

  it('"À renseigner" classé placeholder + seller_unknown', () => {
    const result = normalizeDealer(
      { name: 'À renseigner', source: 'autoscout24.dom' },
    )
    expect(result.eligibility).toBe('seller_unknown')
    expect(result.name.skipReason).toBe('placeholder')
  })

  it('"unknown" classé placeholder + seller_unknown', () => {
    const result = normalizeDealer(
      { name: 'unknown', source: 'autoscout24.dom' },
    )
    expect(result.eligibility).toBe('seller_unknown')
    expect(result.name.skipReason).toBe('placeholder')
  })
})

// ─── Règles de merge ──────────────────────────────────────────────────────────

describe('normalizeDealer — règles de merge avec existant', () => {
  it('dealer existant protégé (non-placeholder) + incoming DOM → quality_too_low', () => {
    const result = normalizeDealer(
      { name: 'Nouveau Dealer', source: 'autoscout24.dom' },
      { name: 'Ancien Dealer', quality: undefined },
    )
    expect(result.name.skipReason).toBe('quality_too_low')
    expect(result.name.value).toBeNull()
  })

  it('dealer existant protégé + incoming nextdata haute confiance → écriture', () => {
    const result = normalizeDealer(
      { name: 'Nouveau Dealer GmbH', source: 'autoscout24.nextdata' },
      { name: 'Ancien Dealer', quality: undefined },
    )
    expect(result.name.value).toBe('Nouveau Dealer GmbH')
  })

  it('dealer existant manual → jamais écrasé', () => {
    const result = normalizeDealer(
      { name: 'Nouveau Dealer GmbH', source: 'autoscout24.nextdata' },
      { name: 'Dealer Manuel', quality: 'manual' },
    )
    expect(result.name.skipReason).toBe('already_set')
    expect(result.name.value).toBeNull()
  })

  it('dealer existant particulier + incoming réel → écriture autorisée', () => {
    const result = normalizeDealer(
      { name: 'AutoHaus München', source: 'autoscout24.dom' },
      { name: 'Privat', quality: undefined },
    )
    expect(result.name.value).toBe('AutoHaus München')
  })

  it('ville déjà renseignée → already_set', () => {
    const result = normalizeDealer(
      { name: 'AutoHaus Berlin', city: 'München', source: 'autoscout24.nextdata' },
      { name: 'Dealer', city: 'Berlin' },
    )
    expect(result.city.skipReason).toBe('already_set')
    expect(result.city.value).toBeNull()
  })

  it('ville absente en base → écriture', () => {
    const result = normalizeDealer(
      { name: 'AutoHaus Berlin', city: 'München', source: 'autoscout24.nextdata' },
      { name: 'Dealer', city: null },
    )
    expect(result.city.value).toBe('München')
  })
})

// ─── Qualité assignée ─────────────────────────────────────────────────────────

describe('normalizeDealer — qualité et confiance', () => {
  it('source nextdata → quality verified, confidence ≥ 0.9', () => {
    const result = normalizeDealer(
      { name: 'BMW AG', source: 'autoscout24.nextdata' },
    )
    expect(result.name.quality).toBe('verified')
    expect(result.name.confidence).toBeGreaterThanOrEqual(0.9)
  })

  it('source DOM → quality inferred, confidence 0.5', () => {
    const result = normalizeDealer(
      { name: 'Dealer inconnu', source: 'autoscout24.dom' },
      { name: undefined },
    )
    expect(result.name.quality).toBe('inferred')
    expect(result.name.confidence).toBe(0.5)
  })
})
