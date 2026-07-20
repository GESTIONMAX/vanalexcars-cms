/**
 * buildEnrichmentPatch.test.ts
 *
 * Tests des fonctions de construction de patch Payload (C4).
 * Couvre les assertions de persistance pour les 3 kinds d'EnrichmentResult :
 *   - listing_removed → véhicule inactif, enrichissement terminé, aucune erreur
 *   - temporary_error → statut métier inchangé, enrichissement échoué, pas de sourceInactive*
 *   - success         → enrichissement terminé, champs sélectifs
 */

import { describe, it, expect } from 'vitest'
import {
  buildListingRemovedPatch,
  buildTemporaryErrorPatch,
  buildEnrichmentSuccessPatch,
} from '../lib/buildEnrichmentPatch'
import type { EnrichmentResult } from '../lib/enrichAs24Listing'

// ─── buildListingRemovedPatch ─────────────────────────────────────────────────

describe('buildListingRemovedPatch — HTTP 404', () => {
  const result: Extract<EnrichmentResult, { kind: 'listing_removed' }> = {
    kind: 'listing_removed',
    httpStatus: 404,
  }
  const patch = buildListingRemovedPatch(result)

  it('met le véhicule en statut inactive', () => {
    expect(patch.status).toBe('inactive')
  })

  it('renseigne sourceInactiveAt (timestamp ISO)', () => {
    expect(patch.sourceInactiveAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it('renseigne sourceInactiveReason = source_404', () => {
    expect(patch.sourceInactiveReason).toBe('source_404')
  })

  it('enrichmentStatus = completed (résultat définitif, pas un échec)', () => {
    expect(patch.enrichmentStatus).toBe('completed')
  })

  it('enrichmentCompletedAt est renseigné', () => {
    expect(patch.enrichmentCompletedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it('enrichmentLastError est null (aucune erreur)', () => {
    expect(patch.enrichmentLastError).toBeNull()
  })
})

describe('buildListingRemovedPatch — HTTP 410', () => {
  const result: Extract<EnrichmentResult, { kind: 'listing_removed' }> = {
    kind: 'listing_removed',
    httpStatus: 410,
  }
  const patch = buildListingRemovedPatch(result)

  it('met le véhicule en statut inactive', () => {
    expect(patch.status).toBe('inactive')
  })

  it('renseigne sourceInactiveReason = source_410', () => {
    expect(patch.sourceInactiveReason).toBe('source_410')
  })

  it('enrichmentStatus = completed', () => {
    expect(patch.enrichmentStatus).toBe('completed')
  })

  it('enrichmentLastError est null', () => {
    expect(patch.enrichmentLastError).toBeNull()
  })
})

// ─── buildTemporaryErrorPatch ────────────────────────────────────────────────

describe('buildTemporaryErrorPatch — erreurs temporaires', () => {
  const cases: Array<{
    code: Extract<EnrichmentResult, { kind: 'temporary_error' }>['code']
    label: string
  }> = [
    { code: 'timeout', label: 'timeout' },
    { code: 'network_error', label: 'network_error (goto null)' },
    { code: 'http_403', label: 'HTTP 403' },
    { code: 'http_429', label: 'HTTP 429' },
    { code: 'http_5xx', label: 'HTTP 5xx' },
    { code: 'challenge', label: 'CAPTCHA/challenge' },
    { code: 'parsing_error', label: 'parsing_error' },
  ]

  for (const { code, label } of cases) {
    describe(`cas : ${label}`, () => {
      const result: Extract<EnrichmentResult, { kind: 'temporary_error' }> = {
        kind: 'temporary_error',
        code,
        message: `Détail de l'erreur : ${label}`,
      }
      const patch = buildTemporaryErrorPatch(result)

      it('enrichmentStatus = failed', () => {
        expect(patch.enrichmentStatus).toBe('failed')
      })

      it('enrichmentLastError contient le code et le message', () => {
        expect(patch.enrichmentLastError).toContain(code)
        expect(patch.enrichmentLastError).toContain(label)
      })

      it('ne renseigne PAS sourceInactiveAt', () => {
        expect((patch as Record<string, unknown>).sourceInactiveAt).toBeUndefined()
      })

      it('ne renseigne PAS sourceInactiveReason', () => {
        expect((patch as Record<string, unknown>).sourceInactiveReason).toBeUndefined()
      })

      it('ne modifie PAS le statut métier (pas de champ status)', () => {
        expect((patch as Record<string, unknown>).status).toBeUndefined()
      })
    })
  }

  it('enrichmentLastError est tronqué à 500 caractères', () => {
    const longMessage = 'x'.repeat(600)
    const result: Extract<EnrichmentResult, { kind: 'temporary_error' }> = {
      kind: 'temporary_error',
      code: 'parsing_error',
      message: longMessage,
    }
    const patch = buildTemporaryErrorPatch(result)
    expect(patch.enrichmentLastError.length).toBeLessThanOrEqual(500)
  })
})

// ─── buildEnrichmentSuccessPatch ─────────────────────────────────────────────

describe('buildEnrichmentSuccessPatch — success', () => {
  const emptyVehicle = {
    imageUrls: [],
    description: null,
    features: null,
    specifications: null,
    exteriorColor: null,
    interiorColor: null,
    doors: null,
    seats: null,
    dealer: null,
    dealerCity: null,
    price: null,
    mileage: null,
  }

  it('remplit tous les champs vides — patch non noop', () => {
    const result: Extract<EnrichmentResult, { kind: 'success' }> = {
      kind: 'success',
      imageUrls: [
        'https://prod.pictures.autoscout24.net/listing-images/abc_1.jpg',
        'https://prod.pictures.autoscout24.net/listing-images/abc_2.jpg',
      ],
      extractedData: {
        description: 'Très belle voiture',
        features: ['GPS', 'Toit ouvrant'],
        specifications: { power: '150 PS', powerHp: 150 },
        exteriorColor: 'Noir',
        interiorColor: 'Cuir beige',
        doors: 4,
        seats: 5,
        dealer: 'BMW München GmbH',
        dealerCity: 'München',
        price: 45000,
        mileage: 32000,
      },
    }
    const { patch, appliedFields, noop } = buildEnrichmentSuccessPatch(result, emptyVehicle)

    expect(noop).toBe(false)
    expect(appliedFields).toContain('imageUrls')
    expect(appliedFields).toContain('description')
    expect(appliedFields).toContain('dealer')
    expect(appliedFields).toContain('price')
    expect(appliedFields).toContain('mileage')
    expect(patch.lastScrapedAt).toBeDefined()
    // lastScrapedAt n'est PAS dans appliedFields
    expect(appliedFields).not.toContain('lastScrapedAt')
  })

  it('noop si le véhicule est déjà complet', () => {
    const fullVehicle = {
      imageUrls: [
        { url: 'https://prod.pictures.autoscout24.net/listing-images/abc_1.jpg' },
        { url: 'https://prod.pictures.autoscout24.net/listing-images/abc_2.jpg' },
        { url: 'https://prod.pictures.autoscout24.net/listing-images/abc_3.jpg' },
      ],
      description: 'Déjà renseigné',
      features: [{ feature: 'GPS' }],
      specifications: { power: '200 PS', powerHp: 200, powerKw: 147 },
      exteriorColor: 'Blanc',
      interiorColor: 'Noir',
      doors: 4,
      seats: 5,
      dealer: 'Porsche Zentrum Berlin',
      dealerCity: 'Berlin',
      price: 85000,
      mileage: 15000,
    }
    const result: Extract<EnrichmentResult, { kind: 'success' }> = {
      kind: 'success',
      imageUrls: [
        'https://prod.pictures.autoscout24.net/listing-images/abc_1.jpg',
        'https://prod.pictures.autoscout24.net/listing-images/abc_2.jpg',
      ],
      extractedData: {
        dealer: 'Autre concessionnaire',
        price: 90000,
        mileage: 20000,
      },
    }
    const { noop } = buildEnrichmentSuccessPatch(result, fullVehicle)
    expect(noop).toBe(true)
  })

  it('enrichit les images si le nombre trouvé est supérieur', () => {
    const vehicle = {
      ...emptyVehicle,
      imageUrls: [{ url: 'https://prod.pictures.autoscout24.net/listing-images/old.jpg' }],
    }
    const result: Extract<EnrichmentResult, { kind: 'success' }> = {
      kind: 'success',
      imageUrls: [
        'https://prod.pictures.autoscout24.net/listing-images/new_1.jpg',
        'https://prod.pictures.autoscout24.net/listing-images/new_2.jpg',
        'https://prod.pictures.autoscout24.net/listing-images/new_3.jpg',
      ],
      extractedData: {},
    }
    const { patch, appliedFields } = buildEnrichmentSuccessPatch(result, vehicle)
    expect(appliedFields).toContain('imageUrls')
    expect((patch.imageUrls as Array<{ url: string }>).length).toBe(3)
  })

  it("n'écrase pas les images si le nombre trouvé est inférieur ou égal", () => {
    const vehicle = {
      ...emptyVehicle,
      imageUrls: [
        { url: 'https://prod.pictures.autoscout24.net/listing-images/a.jpg' },
        { url: 'https://prod.pictures.autoscout24.net/listing-images/b.jpg' },
        { url: 'https://prod.pictures.autoscout24.net/listing-images/c.jpg' },
      ],
    }
    const result: Extract<EnrichmentResult, { kind: 'success' }> = {
      kind: 'success',
      imageUrls: [
        'https://prod.pictures.autoscout24.net/listing-images/new.jpg',
      ],
      extractedData: {},
    }
    const { appliedFields } = buildEnrichmentSuccessPatch(result, vehicle)
    expect(appliedFields).not.toContain('imageUrls')
  })

  it('success ne renseigne PAS sourceInactiveAt', () => {
    const result: Extract<EnrichmentResult, { kind: 'success' }> = {
      kind: 'success',
      imageUrls: [],
      extractedData: {},
    }
    const { patch } = buildEnrichmentSuccessPatch(result, emptyVehicle)
    expect((patch as Record<string, unknown>).sourceInactiveAt).toBeUndefined()
    expect((patch as Record<string, unknown>).sourceInactiveReason).toBeUndefined()
  })
})
