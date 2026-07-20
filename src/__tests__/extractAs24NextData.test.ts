/**
 * extractAs24NextData.test.ts
 *
 * Tests unitaires de extractAs24NextData.
 * Les fixtures JSON anonymisées sont chargées depuis __tests__/fixtures/.
 * Aucune dépendance réseau ni Playwright.
 *
 * Couvre :
 *   - Format /angebote/ : chemin listingDetails.seller
 *   - Format /smyle/    : chemin properData.carDetails.ocsInfo.seller
 *   - Détection du format (pageFormat)
 *   - Champ originalSellerCompanyName = "smyle" ignoré côté Smyle
 *   - Entrées invalides / inconnues
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { extractAs24NextData } from '../lib/extractAs24NextData'

// ── Chargement des fixtures ───────────────────────────────────────────────────

const FIXTURES_DIR = join(import.meta.dirname, 'fixtures')

function loadFixture(name: string): unknown {
  const raw = readFileSync(join(FIXTURES_DIR, name), 'utf-8')
  return JSON.parse(raw)
}

const fixtureAngebote = loadFixture('as24_angebote_nextdata.json')
const fixtureSmyle    = loadFixture('as24_smyle_nextdata.json')

// ── Format /angebote/ ─────────────────────────────────────────────────────────

describe('extractAs24NextData — format /angebote/', () => {
  const result = extractAs24NextData(fixtureAngebote)

  it('détecte le format angebote', () => {
    expect(result.pageFormat).toBe('angebote')
  })

  it('extrait dealerName depuis listingDetails.seller.companyName', () => {
    expect(result.dealerName).toBe('Autohaus Muster GmbH')
  })

  it('extrait dealerCity depuis listingDetails.location.city', () => {
    expect(result.dealerCity).toBe('Berlin')
  })

  it('dealerContact est extrait', () => {
    expect(result.dealerContact).toBe('Max Mustermann')
  })

  it('isDealer est true (professionnel confirmé par AS24)', () => {
    expect(result.isDealer).toBe(true)
  })

  it('extrait le prix', () => {
    expect(result.price).toBe(25900)
  })

  it('extrait le kilométrage', () => {
    expect(result.mileage).toBe(42000)
  })
})

// ── Format /smyle/ ────────────────────────────────────────────────────────────

describe('extractAs24NextData — format /smyle/', () => {
  const result = extractAs24NextData(fixtureSmyle)

  it('détecte le format smyle', () => {
    expect(result.pageFormat).toBe('smyle')
  })

  it('extrait dealerName depuis ocsInfo.seller.companyName (pas originalSellerCompanyName)', () => {
    expect(result.dealerName).toBe('Musterhändler Automobile GmbH')
    // La valeur "smyle" (marketplace) ne doit PAS apparaître comme dealer
    expect(result.dealerName).not.toBe('smyle')
  })

  it('extrait dealerCity depuis ocsInfo.location.city', () => {
    expect(result.dealerCity).toBe('Hamburg')
  })

  it('isDealer est true (Smyle = toujours professionnel)', () => {
    expect(result.isDealer).toBe(true)
  })

  it('extrait le prix depuis carDetails.price.gross', () => {
    expect(result.price).toBe(28900)
  })
})

// ── Cas limites ───────────────────────────────────────────────────────────────

describe('extractAs24NextData — cas limites', () => {
  it('retourne pageFormat=unknown pour null', () => {
    const r = extractAs24NextData(null)
    expect(r.pageFormat).toBe('unknown')
    expect(r.dealerName).toBeNull()
  })

  it('retourne pageFormat=unknown pour un objet vide', () => {
    const r = extractAs24NextData({})
    expect(r.pageFormat).toBe('unknown')
  })

  it('retourne pageFormat=unknown pour une structure JSON inconnue', () => {
    const r = extractAs24NextData({ props: { pageProps: { someOtherKey: {} } } })
    expect(r.pageFormat).toBe('unknown')
    expect(r.dealerName).toBeNull()
    expect(r.dealerCity).toBeNull()
  })

  it('retourne dealerName=null quand companyName est absent du bloc seller', () => {
    const data = {
      props: { pageProps: { listingDetails: {
        seller: { isDealer: true },
        location: { city: 'Berlin' },
      }}}
    }
    const r = extractAs24NextData(data)
    expect(r.pageFormat).toBe('angebote')
    expect(r.dealerName).toBeNull()
    expect(r.dealerCity).toBe('Berlin')
  })

  it('angebote : isDealer=false quand le vendeur est un particulier', () => {
    const data = {
      props: { pageProps: { listingDetails: {
        seller: { isDealer: false, companyName: 'Hans Müller', type: 'Private' },
        location: { city: 'München' },
      }}}
    }
    const r = extractAs24NextData(data)
    expect(r.isDealer).toBe(false)
    expect(r.dealerName).toBe('Hans Müller')
  })

  it('smyle : ignore originalSellerCompanyName="smyle" — dealerName null si ocsInfo absent', () => {
    const data = {
      props: { pageProps: { properData: { carDetails: {
        originalSellerCompanyName: 'smyle',
        // ocsInfo absent
      }}}}
    }
    const r = extractAs24NextData(data)
    expect(r.pageFormat).toBe('smyle')
    expect(r.dealerName).toBeNull()
  })
})
