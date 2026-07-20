/**
 * enrichAs24Listing.test.ts
 *
 * Tests unitaires de enrichAs24Listing (C4).
 * Playwright est mocké — aucun navigateur n'est lancé.
 *
 * Flux de décision vérifié :
 *   1. erreur de navigation (timeout, réseau, null)
 *   2. statut HTTP (404/410 → listing_removed, 403/429/5xx → temporary_error)
 *   3. détection challenge
 *   4. parsing
 *   5. success
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Mock playwright-core ──────────────────────────────────────────────────────
// vi.hoisted() permet de créer les variables AVANT le hoisting de vi.mock()

const {
  mockPageGoto,
  mockPageContent,
  mockPageEvaluate,
  mockPageOn,
  mockPageRoute,
  mockPageSetExtraHTTPHeaders,
  mockPageWaitForSelector,
  mockBrowserClose,
  mockBrowserNewPage,
  mockBrowser,
  mockPage,
} = vi.hoisted(() => {
  const mockPageGoto = vi.fn()
  const mockPageContent = vi.fn().mockResolvedValue('<html></html>')
  const mockPageEvaluate = vi.fn().mockResolvedValue({})
  const mockPageOn = vi.fn()
  const mockPageRoute = vi.fn()
  const mockPageSetExtraHTTPHeaders = vi.fn().mockResolvedValue(undefined)
  const mockPageWaitForSelector = vi.fn().mockResolvedValue(undefined)

  const mockPage = {
    goto: (...args: unknown[]) => mockPageGoto(...args),
    content: (...args: unknown[]) => mockPageContent(...args),
    evaluate: (...args: unknown[]) => mockPageEvaluate(...args),
    on: (...args: unknown[]) => mockPageOn(...args),
    route: (...args: unknown[]) => mockPageRoute(...args),
    setExtraHTTPHeaders: (...args: unknown[]) => mockPageSetExtraHTTPHeaders(...args),
    waitForSelector: (...args: unknown[]) => mockPageWaitForSelector(...args),
  }

  const mockBrowserClose = vi.fn().mockResolvedValue(undefined)
  const mockBrowserNewPage = vi.fn().mockResolvedValue(mockPage)

  const mockBrowser = {
    newPage: (...args: unknown[]) => mockBrowserNewPage(...args),
    close: (...args: unknown[]) => mockBrowserClose(...args),
  }

  return {
    mockPageGoto,
    mockPageContent,
    mockPageEvaluate,
    mockPageOn,
    mockPageRoute,
    mockPageSetExtraHTTPHeaders,
    mockPageWaitForSelector,
    mockBrowserClose,
    mockBrowserNewPage,
    mockBrowser,
    mockPage,
  }
})

vi.mock('playwright-core', () => ({
  chromium: {
    launch: vi.fn().mockResolvedValue(mockBrowser),
  },
}))

// Import APRÈS le mock
import { enrichAs24Listing } from '../lib/enrichAs24Listing'

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Crée un objet Response Playwright simulé avec un statut donné */
function mockResponse(status: number) {
  return { status: () => status }
}

/** Réinitialise les mocks à leur état nominal (page 200, contenu neutre, evaluate vide) */
function resetMocks() {
  vi.clearAllMocks()
  mockPageSetExtraHTTPHeaders.mockResolvedValue(undefined)
  mockPageOn.mockReturnValue(undefined)
  mockPageRoute.mockReturnValue(undefined)
  mockPageContent.mockResolvedValue('<html><body><p>Annonce normale</p></body></html>')
  mockPageEvaluate.mockResolvedValue({})
  mockPageWaitForSelector.mockResolvedValue(undefined)
  mockBrowserClose.mockResolvedValue(undefined)
  mockBrowserNewPage.mockResolvedValue(mockPage)
}

const TEST_URL = 'https://www.autoscout24.de/angebote/bmw-320i-id-abc123'

// ── Erreurs de navigation ─────────────────────────────────────────────────────

describe('enrichAs24Listing — erreurs de navigation', () => {
  beforeEach(resetMocks)

  it('timeout → temporary_error / timeout', async () => {
    const timeoutErr = new Error('Timeout 30000ms exceeded')
    timeoutErr.name = 'TimeoutError'
    mockPageGoto.mockRejectedValue(timeoutErr)

    const result = await enrichAs24Listing(TEST_URL)

    expect(result.kind).toBe('temporary_error')
    if (result.kind === 'temporary_error') {
      expect(result.code).toBe('timeout')
      expect(result.message).toContain('30')
    }
  }, 15_000)

  it('erreur réseau → temporary_error / network_error', async () => {
    const netErr = new Error('net::ERR_NAME_NOT_RESOLVED')
    netErr.name = 'Error'
    mockPageGoto.mockRejectedValue(netErr)

    const result = await enrichAs24Listing(TEST_URL)

    expect(result.kind).toBe('temporary_error')
    if (result.kind === 'temporary_error') {
      expect(result.code).toBe('network_error')
    }
  }, 15_000)

  it('page.goto() retourne null → temporary_error / network_error (message spécifique)', async () => {
    mockPageGoto.mockResolvedValue(null)

    const result = await enrichAs24Listing(TEST_URL)

    expect(result.kind).toBe('temporary_error')
    if (result.kind === 'temporary_error') {
      expect(result.code).toBe('network_error')
      expect(result.message).toContain('without a main document response')
    }
  }, 15_000)
})

// ── Statuts HTTP ──────────────────────────────────────────────────────────────

describe('enrichAs24Listing — statuts HTTP', () => {
  beforeEach(resetMocks)

  it('HTTP 404 → listing_removed avec httpStatus 404', async () => {
    mockPageGoto.mockResolvedValue(mockResponse(404))

    const result = await enrichAs24Listing(TEST_URL)

    expect(result.kind).toBe('listing_removed')
    if (result.kind === 'listing_removed') {
      expect(result.httpStatus).toBe(404)
    }
  }, 15_000)

  it('HTTP 410 → listing_removed avec httpStatus 410', async () => {
    mockPageGoto.mockResolvedValue(mockResponse(410))

    const result = await enrichAs24Listing(TEST_URL)

    expect(result.kind).toBe('listing_removed')
    if (result.kind === 'listing_removed') {
      expect(result.httpStatus).toBe(410)
    }
  }, 15_000)

  it('HTTP 403 → temporary_error / http_403 (pas listing_removed)', async () => {
    mockPageGoto.mockResolvedValue(mockResponse(403))

    const result = await enrichAs24Listing(TEST_URL)

    expect(result.kind).toBe('temporary_error')
    if (result.kind === 'temporary_error') {
      expect(result.code).toBe('http_403')
      expect(result.message).toContain('403')
    }
  }, 15_000)

  it('HTTP 429 → temporary_error / http_429', async () => {
    mockPageGoto.mockResolvedValue(mockResponse(429))

    const result = await enrichAs24Listing(TEST_URL)

    expect(result.kind).toBe('temporary_error')
    if (result.kind === 'temporary_error') {
      expect(result.code).toBe('http_429')
      expect(result.message).toContain('429')
    }
  }, 15_000)

  it('HTTP 500 → temporary_error / http_5xx avec statut réel dans le message', async () => {
    mockPageGoto.mockResolvedValue(mockResponse(500))

    const result = await enrichAs24Listing(TEST_URL)

    expect(result.kind).toBe('temporary_error')
    if (result.kind === 'temporary_error') {
      expect(result.code).toBe('http_5xx')
      expect(result.message).toContain('500')
    }
  }, 15_000)

  it('HTTP 503 → temporary_error / http_5xx avec statut 503 dans le message', async () => {
    mockPageGoto.mockResolvedValue(mockResponse(503))

    const result = await enrichAs24Listing(TEST_URL)

    expect(result.kind).toBe('temporary_error')
    if (result.kind === 'temporary_error') {
      expect(result.code).toBe('http_5xx')
      expect(result.message).toContain('503')
    }
  }, 15_000)
})

// ── Détection challenge ───────────────────────────────────────────────────────

describe('enrichAs24Listing — détection challenge (précède le parsing)', () => {
  beforeEach(resetMocks)

  it('page CAPTCHA Cloudflare (HTTP 200) → temporary_error / challenge', async () => {
    mockPageGoto.mockResolvedValue(mockResponse(200))
    mockPageContent.mockResolvedValue(`
      <html>
        <head><title>Just a moment...</title></head>
        <body>
          <div class="cf-challenge-running"></div>
        </body>
      </html>
    `)

    const result = await enrichAs24Listing(TEST_URL)

    expect(result.kind).toBe('temporary_error')
    if (result.kind === 'temporary_error') {
      expect(result.code).toBe('challenge')
    }
  }, 15_000)

  it('challenge détecté avant parsing — classify challenge même si evaluate échouerait', async () => {
    mockPageGoto.mockResolvedValue(mockResponse(200))
    mockPageContent.mockResolvedValue('<html><body id="challenge-form"></body></html>')
    // evaluate lèverait parsing_error si appelé — mais challenge doit être détecté avant
    mockPageEvaluate.mockRejectedValue(new Error('Ne devrait pas produire parsing_error'))

    const result = await enrichAs24Listing(TEST_URL)

    expect(result.kind).toBe('temporary_error')
    if (result.kind === 'temporary_error') {
      expect(result.code).toBe('challenge')
    }
  }, 15_000)
})

// ── Success ───────────────────────────────────────────────────────────────────

describe('enrichAs24Listing — success', () => {
  beforeEach(resetMocks)

  it('HTTP 200 sans données extraites → success (pas de déactivation)', async () => {
    mockPageGoto.mockResolvedValue(mockResponse(200))
    // page.evaluate() est appelé 3 fois successivement :
    //   1. __NEXT_DATA__ → {} (NextDataExtracted vide)
    //   2. JSON-LD       → null (pas de structured data)
    //   3. DOM           → { features: [], specMap: {} }
    //   4. fallback img  → [] (si aucune image trouvée)
    mockPageEvaluate
      .mockResolvedValueOnce({})                            // __NEXT_DATA__
      .mockResolvedValueOnce(null)                          // JSON-LD
      .mockResolvedValueOnce({ features: [], specMap: {} }) // DOM
      .mockResolvedValueOnce([])                            // fallback img

    const result = await enrichAs24Listing(TEST_URL)

    expect(result.kind).toBe('success')
    if (result.kind === 'success') {
      expect(result.imageUrls).toEqual([])
      expect((result as Record<string, unknown>).sourceInactiveAt).toBeUndefined()
      expect((result as Record<string, unknown>).sourceInactiveReason).toBeUndefined()
    }
  }, 15_000)

  it('HTTP 200 sans dealer → success (dealer absent ≠ inactivation)', async () => {
    mockPageGoto.mockResolvedValue(mockResponse(200))
    mockPageEvaluate
      .mockResolvedValueOnce({ price: 45000, mileage: 32000 }) // __NEXT_DATA__ (sans dealer)
      .mockResolvedValueOnce(null)                              // JSON-LD
      .mockResolvedValueOnce({ features: [], specMap: {} })     // DOM
      .mockResolvedValueOnce([])                                // fallback img

    const result = await enrichAs24Listing(TEST_URL)

    expect(result.kind).toBe('success')
    if (result.kind === 'success') {
      expect(result.extractedData.dealer).toBeUndefined()
      expect((result as Record<string, unknown>).sourceInactiveAt).toBeUndefined()
    }
  }, 15_000)
})
