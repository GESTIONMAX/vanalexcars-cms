/**
 * enrichAs24Listing.ts
 *
 * Logique Playwright partagée pour enrichir une fiche AutoScout24.
 * Utilisée par :
 *   - l'endpoint HTTP  POST /api/enrich-vehicle
 *   - l'endpoint SSE   POST /api/bulk-enrich
 *   - le script batch  src/scripts/bulk-enrich.ts
 *
 * Stratégie en 3 passes (ordre de fiabilité décroissant) :
 *   Passe 0 — Interception XHR  : images (primaire, toujours la plus complète)
 *   Passe 1 — JSON-LD           : images (fallback) + description
 *   Passe 2 — DOM               : équipements, specs techniques, concessionnaire
 *
 * Flux de décision du résultat :
 *   1. erreur de navigation (timeout, réseau, null)
 *   2. statut HTTP (404 → listing_removed, 410 → listing_removed, 403/429/5xx → temporary_error)
 *   3. détection challenge/CAPTCHA
 *   4. parsing
 *   5. success
 */

import { chromium } from 'playwright-core'
import { extractAs24NextData } from './extractAs24NextData'

// ── Types ────────────────────────────────────────────────────────────────────

/** Données texte extraites d'une fiche AS24 */
export interface As24ExtractedData {
  description?: string
  features?: string[]
  specifications?: {
    power?: string
    powerKw?: number
    powerHp?: number
  }
  exteriorColor?: string
  interiorColor?: string
  doors?: number
  seats?: number
  dealer?: string
  dealerCity?: string
  price?: number
  mileage?: number
}

/** @deprecated Utilisez EnrichmentResult à la place */
export interface As24EnrichedData {
  imageUrls: string[]
  extractedData: As24ExtractedData
}

export type TemporaryErrorCode =
  | 'http_403'       // Accès refusé (Cloudflare, robot check)
  | 'http_429'       // Rate-limiting
  | 'http_5xx'       // Erreur serveur AS24
  | 'timeout'        // page.goto() a expiré
  | 'network_error'  // DNS, connexion refusée, ou response === null
  | 'challenge'      // Page CAPTCHA / bot-challenge détectée (HTTP 200)
  | 'parsing_error'  // Erreur interne d'analyse (exception JS côté évaluation)

export type EnrichmentResult =
  | {
      kind: 'success'
      imageUrls: string[]
      extractedData: As24ExtractedData
    }
  | {
      kind: 'listing_removed'
      /** Statut HTTP exact retourné par AS24 */
      httpStatus: 404 | 410
    }
  | {
      kind: 'temporary_error'
      code: TemporaryErrorCode
      /** Message lisible pour enrichmentLastError */
      message: string
    }

// ── Constantes ───────────────────────────────────────────────────────────────

const CDN_PATTERN =
  /https:\/\/prod\.pictures\.autoscout24\.net\/listing-images\/[a-f0-9-]+_[a-f0-9-]+\.jpg[^\s"']*/gi

/** Supprime le suffixe de taille AS24 (/1920x1080.webp, /120x90.jpg…) */
const normalizeAs24Url = (url: string) =>
  url.replace(/\/\d+x\d+\.(jpg|jpeg|webp|png)$/i, '')

/** Marqueurs indiquant une page CAPTCHA / bot-challenge AS24 / Cloudflare */
const CHALLENGE_MARKERS = [
  'cf-challenge-running',
  'cf_chl_opt',
  'challenge-platform',
  'ray-id',
  '#challenge-error-title',
  'id="challenge-form"',
]

// ── Extraction de données depuis le DOM ──────────────────────────────────────

/**
 * Parseur de puissance : "200 PS", "147 kW", "147 kW / 200 PS", "200 ch"
 */
function parsePower(raw: string): { power: string; powerKw?: number; powerHp?: number } {
  const psMatch = raw.match(/(\d+)\s*(?:ps|ch|hp|cv)/i)
  const kwMatch = raw.match(/(\d+)\s*kw/i)
  return {
    power: raw,
    powerHp: psMatch ? parseInt(psMatch[1]) : undefined,
    powerKw: kwMatch ? parseInt(kwMatch[1]) : undefined,
  }
}

// ── Fonction principale ───────────────────────────────────────────────────────

export async function enrichAs24Listing(listingUrl: string): Promise<EnrichmentResult> {
  const executablePath =
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ?? '/usr/bin/chromium'

  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined

  try {
    browser = await chromium.launch({
      executablePath,
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--headless=new',
      ],
    })

    const page = await browser.newPage()

    // UA réaliste — réduit la détection Cloudflare/AS24
    await page.setExtraHTTPHeaders({
      'User-Agent':
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept-Language': 'de-DE,de;q=0.9,fr;q=0.8',
    })

    // ── PASSE 0 : Interception XHR ─────────────────────────────────────────
    // AS24 est une SPA — toutes les images de la galerie arrivent via des
    // requêtes réseau JSON. On intercepte ces réponses avant la navigation.

    const interceptedImages = new Set<string>()

    page.on('response', async (response) => {
      try {
        const ct = response.headers()['content-type'] ?? ''
        if (!ct.includes('application/json') && !ct.includes('text/javascript')) return
        const text = await response.text()
        for (const match of text.matchAll(CDN_PATTERN)) {
          interceptedImages.add(normalizeAs24Url(match[0]))
        }
      } catch {
        /* réponse déjà consommée ou binaire — ignorer */
      }
    })

    // Bloquer fonts/styles/media pour accélérer le chargement
    await page.route('**/*', (route) => {
      const type = route.request().resourceType()
      if (['font', 'stylesheet', 'media'].includes(type)) {
        route.abort()
      } else {
        route.continue()
      }
    })

    // ── ÉTAPE 1 : Navigation + capture du statut HTTP ─────────────────────
    // Flux : erreur de navigation → statut HTTP → challenge → parsing → success

    let mainResponse: Awaited<ReturnType<typeof page.goto>>

    try {
      mainResponse = await page.goto(listingUrl, {
        waitUntil: 'domcontentloaded',
        timeout: 30_000,
      })
    } catch (err) {
      // TimeoutError Playwright
      if (err instanceof Error && err.name === 'TimeoutError') {
        return {
          kind: 'temporary_error',
          code: 'timeout',
          message: `Navigation timeout après 30s : ${err.message}`,
        }
      }
      // Erreur réseau (DNS, connexion refusée…)
      return {
        kind: 'temporary_error',
        code: 'network_error',
        message: `Erreur réseau lors de la navigation : ${String(err)}`,
      }
    }

    // page.goto() peut retourner null (navigation interrompue sans réponse)
    if (mainResponse === null) {
      return {
        kind: 'temporary_error',
        code: 'network_error',
        message: 'Navigation completed without a main document response',
      }
    }

    // ── ÉTAPE 2 : Vérification du statut HTTP ─────────────────────────────
    const httpStatus = mainResponse.status()

    if (httpStatus === 404) {
      return { kind: 'listing_removed', httpStatus: 404 }
    }
    if (httpStatus === 410) {
      return { kind: 'listing_removed', httpStatus: 410 }
    }
    if (httpStatus === 403) {
      return {
        kind: 'temporary_error',
        code: 'http_403',
        message: `HTTP 403 — accès refusé (robot check ou Cloudflare)`,
      }
    }
    if (httpStatus === 429) {
      return {
        kind: 'temporary_error',
        code: 'http_429',
        message: `HTTP 429 — rate-limiting AS24`,
      }
    }
    if (httpStatus >= 500 && httpStatus <= 599) {
      return {
        kind: 'temporary_error',
        code: 'http_5xx',
        message: `HTTP ${httpStatus} — erreur serveur AS24`,
      }
    }

    // Attendre que les XHR de la fiche soient chargés (~6 s en prod)
    await new Promise((r) => setTimeout(r, 6_000))

    // ── ÉTAPE 3 : Détection challenge / CAPTCHA ───────────────────────────
    // Précède le parsing pour qu'un CAPTCHA ne soit pas classé parsing_error
    const pageSource = await page.content()
    const isChallenge = CHALLENGE_MARKERS.some((marker) =>
      pageSource.toLowerCase().includes(marker.toLowerCase()),
    )
    if (isChallenge) {
      return {
        kind: 'temporary_error',
        code: 'challenge',
        message: 'Page CAPTCHA / bot-challenge détectée (HTTP 200 avec blocage Cloudflare)',
      }
    }

    // ── ÉTAPE 4 : Parsing ─────────────────────────────────────────────────

    try {
      // ── PASSE 0b : __NEXT_DATA__ — données SSR structurées ──────────────
      // Extraction via deux chemins explicites selon le format de page :
      //   /angebote/ → listingDetails.seller.companyName
      //   /smyle/    → properData.carDetails.ocsInfo.seller.companyName
      // Voir lib/extractAs24NextData.ts pour la logique complète.

      const nextDataExtracted = await page.evaluate(() => {
        const el = document.querySelector('#__NEXT_DATA__')
        if (!el?.textContent) return null
        try { return JSON.parse(el.textContent) } catch { return null }
      })

      const nd = extractAs24NextData(nextDataExtracted)

      // ── PASSE 1 : JSON-LD ──────────────────────────────────────────────
      interface JsonLdVehicle {
        images: string[]
        description?: string
      }

      const jsonLdData: JsonLdVehicle | null = await page.evaluate(() => {
        for (const script of Array.from(
          document.querySelectorAll('script[type="application/ld+json"]'),
        )) {
          try {
            const data = JSON.parse(script.textContent ?? '')
            const nodes: unknown[] = data['@graph'] ? data['@graph'] : [data]
            for (const node of nodes) {
              if (
                node !== null &&
                typeof node === 'object' &&
                ['Vehicle', 'Car'].includes(
                  (node as Record<string, unknown>)['@type'] as string,
                )
              ) {
                const n = node as Record<string, unknown>
                const imgs = n['image']
                const images: string[] = Array.isArray(imgs)
                  ? (imgs as string[])
                  : typeof imgs === 'string'
                    ? [imgs]
                    : []
                return {
                  images,
                  description:
                    typeof n['description'] === 'string' ? n['description'].trim() : undefined,
                }
              }
            }
          } catch {
            /* skip */
          }
        }
        return null
      })

      // ── PASSE 2 : DOM ──────────────────────────────────────────────────
      interface DomExtracted {
        features: string[]
        specMap: Record<string, string>
        dealerName?: string
        dealerCity?: string
      }

      const domData: DomExtracted = await page.evaluate(() => {
        const features: string[] = []
        for (const ul of Array.from(document.querySelectorAll('ul'))) {
          const items = Array.from(ul.querySelectorAll('li'))
            .map((li) => li.textContent?.trim() ?? '')
            .filter((t) => t.length >= 3 && t.length <= 80 && !/^\d+$/.test(t))
          if (items.length >= 5) {
            for (const item of items) {
              if (!features.includes(item)) features.push(item)
            }
          }
        }

        const specMap: Record<string, string> = {}
        for (const dt of Array.from(document.querySelectorAll('dt'))) {
          const dd = dt.nextElementSibling
          if (dd?.tagName === 'DD') {
            const key = dt.textContent?.trim().toLowerCase() ?? ''
            const val = dd.textContent?.trim() ?? ''
            if (key && val) specMap[key] = val
          }
        }
        for (const row of Array.from(document.querySelectorAll('tr'))) {
          const cells = Array.from(row.querySelectorAll('th, td'))
          if (cells.length === 2) {
            const key = cells[0].textContent?.trim().toLowerCase() ?? ''
            const val = cells[1].textContent?.trim() ?? ''
            if (key && val) specMap[key] = val
          }
        }

        const dealerSelectors = [
          '[data-testid="vendor-contact-info"]',
          '[data-testid="seller-info"]',
          '[class*="DealerInfo"]',
          '[class*="dealer-info"]',
          '[class*="SellerInfo"]',
          '.seller-info',
        ]
        let dealerName: string | undefined
        let dealerCity: string | undefined
        for (const sel of dealerSelectors) {
          const el = document.querySelector(sel)
          if (el) {
            const text = el.textContent?.trim() ?? ''
            const lines = text
              .split('\n')
              .map((l) => l.trim())
              .filter(Boolean)
            if (lines.length >= 1) dealerName = lines[0].slice(0, 100)
            if (lines.length >= 2) dealerCity = lines[1].slice(0, 80)
            break
          }
        }

        return { features, specMap, dealerName, dealerCity }
      })

      // ── Construction des URLs d'images finales ─────────────────────────

      let rawImageUrls: string[] = [...interceptedImages]

      if (!rawImageUrls.length && jsonLdData?.images.length) {
        rawImageUrls = jsonLdData.images
      }

      if (!rawImageUrls.length) {
        try {
          await page.waitForSelector('img[src*="autoscout24"]', { timeout: 8_000 })
        } catch {
          /* pas d'images trouvées — on continue avec tableau vide */
        }
        rawImageUrls = await page.evaluate(() =>
          [
            ...new Set(
              Array.from(document.querySelectorAll('img'))
                .map(
                  (img) =>
                    (img as HTMLImageElement).src || img.getAttribute('data-src') || '',
                )
                .filter(
                  (src) =>
                    src.includes('autoscout24') &&
                    /\.(jpg|jpeg|webp|png)/i.test(src) &&
                    !src.includes('logo'),
                ),
            ),
          ],
        )
      }

      const imageUrls = [
        ...new Set(
          rawImageUrls
            .map(normalizeAs24Url)
            .filter((u) => u.includes('prod.pictures.autoscout24.net/listing-images/')),
        ),
      ]

      // ── Construction des données texte ─────────────────────────────────

      const specMap = domData.specMap

      const rawPower =
        specMap['leistung'] ??
        specMap['puissance'] ??
        specMap['power'] ??
        specMap['ps'] ??
        undefined

      const exteriorColor =
        specMap['außenfarbe'] ??
        specMap['farbe'] ??
        specMap['couleur extérieure'] ??
        specMap['color externo'] ??
        undefined

      const interiorColor =
        specMap['innenausstattung'] ??
        specMap['sellerie'] ??
        specMap['interior color'] ??
        undefined

      const doors =
        parseInt(specMap['türen'] ?? specMap['portes'] ?? specMap['doors'] ?? '') || undefined
      const seats =
        parseInt(specMap['sitze'] ?? specMap['places'] ?? specMap['seats'] ?? '') || undefined

      const extractedData: As24ExtractedData = {}
      if (jsonLdData?.description) extractedData.description = jsonLdData.description
      if (domData.features.length > 0) extractedData.features = domData.features

      // Puissance : DOM prioritaire, fallback __NEXT_DATA__ (chemins explicites)
      const finalPower = rawPower ?? nd.power ?? undefined
      const specifications = finalPower ? parsePower(finalPower) : undefined
      if (specifications) extractedData.specifications = specifications

      // Couleurs : DOM prioritaire, fallback __NEXT_DATA__
      if (exteriorColor ?? nd.exteriorColor)
        extractedData.exteriorColor = (exteriorColor ?? nd.exteriorColor)!
      if (interiorColor ?? nd.interiorColor)
        extractedData.interiorColor = (interiorColor ?? nd.interiorColor)!

      // Portes / places
      if (doors ?? nd.doors) extractedData.doors = (doors ?? nd.doors)!
      if (seats ?? nd.seats) extractedData.seats = (seats ?? nd.seats)!

      // Dealer : __NEXT_DATA__ prioritaire (chemins explicites /angebote/ et /smyle/)
      // fallback DOM si les deux chemins échouent
      if (nd.dealerName ?? domData.dealerName)
        extractedData.dealer = (nd.dealerName ?? domData.dealerName)!
      if (nd.dealerCity ?? domData.dealerCity)
        extractedData.dealerCity = (nd.dealerCity ?? domData.dealerCity)!

      // Prix et km depuis __NEXT_DATA__ (non disponibles dans DOM ou JSON-LD)
      if (nd.price && nd.price > 0) extractedData.price = nd.price
      if (nd.mileage != null) extractedData.mileage = nd.mileage

      // ── ÉTAPE 5 : success ─────────────────────────────────────────────
      return { kind: 'success', imageUrls, extractedData }
    } catch (err) {
      return {
        kind: 'temporary_error',
        code: 'parsing_error',
        message: `Erreur d'analyse de la page : ${err instanceof Error ? err.message : String(err)}`,
      }
    }
  } finally {
    await browser?.close()
  }
}
