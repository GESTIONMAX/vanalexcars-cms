/**
 * enrichAs24Listing.ts
 *
 * Logique Playwright partagée pour enrichir une fiche AutoScout24.
 * Utilisée par :
 *   - l'endpoint HTTP  POST /api/enrich-vehicle
 *   - le script batch  src/scripts/bulk-enrich.ts
 *
 * Stratégie en 3 passes (ordre de fiabilité décroissant) :
 *   Passe 0 — Interception XHR  : images (primaire, toujours la plus complète)
 *   Passe 1 — JSON-LD           : images (fallback) + description
 *   Passe 2 — DOM               : équipements, specs techniques, concessionnaire
 */

import { chromium } from 'playwright-core'

// ── Types ────────────────────────────────────────────────────────────────────

export interface As24EnrichedData {
  /** URLs images CDN AS24, normalisées (sans suffixe /NxN.ext) */
  imageUrls: string[]
  /** Données texte extraites de la fiche */
  extractedData: {
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
  }
}

// ── Constantes ───────────────────────────────────────────────────────────────

const CDN_PATTERN =
  /https:\/\/prod\.pictures\.autoscout24\.net\/listing-images\/[a-f0-9-]+_[a-f0-9-]+\.jpg[^\s"']*/gi

/** Supprime le suffixe de taille AS24 (/1920x1080.webp, /120x90.jpg…) */
const normalizeAs24Url = (url: string) =>
  url.replace(/\/\d+x\d+\.(jpg|jpeg|webp|png)$/i, '')

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

export async function enrichAs24Listing(listingUrl: string): Promise<As24EnrichedData> {
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

    // domcontentloaded — AS24 SPA ne déclenche jamais networkidle
    await page.goto(listingUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 })

    // Attendre que les XHR de la fiche soient chargés (~6 s en prod)
    await new Promise((r) => setTimeout(r, 6_000))

    // ── PASSE 1 : JSON-LD ─────────────────────────────────────────────────
    // Fallback images + extraction de la description (champ stable dans le JSON-LD AS24)

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
              ['Vehicle', 'Car'].includes((node as Record<string, unknown>)['@type'] as string)
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

    // ── PASSE 2 : DOM ─────────────────────────────────────────────────────
    // Équipements, specs techniques, concessionnaire

    interface DomExtracted {
      features: string[]
      specMap: Record<string, string>
      dealerName?: string
      dealerCity?: string
    }

    const domData: DomExtracted = await page.evaluate(() => {
      // Équipements — heuristique : listes <ul> avec ≥5 items courts
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

      // Specs — <dl><dt>…</dt><dd>…</dd></dl> et <table><tr><th/td></tr></table>
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

      // Concessionnaire — data-testid prioritaire, sinon heuristiques de classe
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
          // Premier bloc de texte → nom, second → ville approximativement
          const lines = text.split('\n').map((l) => l.trim()).filter(Boolean)
          if (lines.length >= 1) dealerName = lines[0].slice(0, 100)
          if (lines.length >= 2) dealerCity = lines[1].slice(0, 80)
          break
        }
      }

      return { features, specMap, dealerName, dealerCity }
    })

    // ── Construction des URLs d'images finales ─────────────────────────────

    let rawImageUrls: string[] = [...interceptedImages]

    if (!rawImageUrls.length && jsonLdData?.images.length) {
      rawImageUrls = jsonLdData.images
    }

    if (!rawImageUrls.length) {
      // Dernier recours : balises <img> dans le DOM
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

    // ── Construction des données texte ─────────────────────────────────────

    const specMap = domData.specMap

    // Champs de puissance (plusieurs libellés selon la langue AS24)
    const rawPower =
      specMap['leistung'] ??
      specMap['puissance'] ??
      specMap['power'] ??
      specMap['ps'] ??
      undefined

    const specifications = rawPower ? parsePower(rawPower) : undefined

    // Couleurs
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

    // Portes / places
    const doors =
      parseInt(specMap['türen'] ?? specMap['portes'] ?? specMap['doors'] ?? '') || undefined
    const seats =
      parseInt(specMap['sitze'] ?? specMap['places'] ?? specMap['seats'] ?? '') || undefined

    const extractedData: As24EnrichedData['extractedData'] = {}
    if (jsonLdData?.description) extractedData.description = jsonLdData.description
    if (domData.features.length > 0) extractedData.features = domData.features
    if (specifications) extractedData.specifications = specifications
    if (exteriorColor) extractedData.exteriorColor = exteriorColor
    if (interiorColor) extractedData.interiorColor = interiorColor
    if (doors) extractedData.doors = doors
    if (seats) extractedData.seats = seats
    if (domData.dealerName) extractedData.dealer = domData.dealerName
    if (domData.dealerCity) extractedData.dealerCity = domData.dealerCity

    return { imageUrls, extractedData }
  } finally {
    await browser?.close()
  }
}
