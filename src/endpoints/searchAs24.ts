/**
 * Endpoint POST /api/search-as24
 * Scrape une page de résultats AutoScout24 via Playwright (Chromium headless)
 * Retourne la liste des véhicules trouvés en JSON.
 *
 * Stratégies d'extraction (ordre décroissant de fiabilité) :
 *  1. __NEXT_DATA__ — données SSR injectées par Next.js dans le HTML
 *  2. Interception des réponses JSON de l'API interne AS24
 *  3. JSON-LD (schema.org Car/Vehicle/ItemList)
 *  4. DOM — extraction depuis les balises <article>
 */

import type { PayloadHandler } from 'payload'
import { chromium } from 'playwright-core'

// ─── Types ──────────────────────────────────────────────────────────────────

export interface AS24ScrapedVehicle {
  title: string
  brand: string
  model: string
  price: number
  year?: number
  mileage?: number
  fuel?: string
  transmission?: string
  power?: string
  bodyType?: string
  exteriorColor?: string
  interiorColor?: string
  doors?: number
  seats?: number
  dealerName?: string
  dealerCity?: string
  dealerCountry?: string
  dealerPhone?: string
  listingUrl?: string
  imageUrl?: string
  imageUrls?: string[]
  description?: string
  equipment?: string[]
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Parcourt récursivement un objet JSON pour trouver des tableaux
 * qui ressemblent à des listes de véhicules AS24.
 */
function findListings(obj: unknown, depth = 0): unknown[] {
  if (!obj || typeof obj !== 'object' || depth > 10) return []

  // Tableau direct — si les items ont make/price, c'est notre cible
  if (Array.isArray(obj)) {
    if (obj.length > 0 && typeof obj[0] === 'object' && obj[0] !== null) {
      const sample = obj[0] as Record<string, unknown>
      if (sample.make || sample.brand || sample.vehicleModel || sample.listingId) {
        return obj
      }
    }
    // Sinon, chercher en profondeur
    for (const item of obj) {
      const found = findListings(item, depth + 1)
      if (found.length > 0) return found
    }
    return []
  }

  const record = obj as Record<string, unknown>

  // Clés connues de l'API AS24
  for (const key of ['listings', 'results', 'vehicles', 'ads', 'items', 'classifieds']) {
    if (Array.isArray(record[key]) && (record[key] as unknown[]).length > 0) {
      return record[key] as unknown[]
    }
  }

  // Chercher dans les sous-objets (pageProps, data, …)
  for (const key of ['pageProps', 'props', 'data', 'searchResult', 'searchResults', 'payload']) {
    if (record[key] && typeof record[key] === 'object') {
      const found = findListings(record[key], depth + 1)
      if (found.length > 0) return found
    }
  }

  return []
}

function toNumber(v: unknown): number {
  if (typeof v === 'number') return v
  if (typeof v === 'string') return parseInt(v.replace(/\D/g, ''), 10) || 0
  return 0
}

function toString(v: unknown): string {
  return typeof v === 'string' ? v : ''
}

/**
 * Convertit un objet brut AS24 (API interne ou JSON-LD) en AS24ScrapedVehicle.
 */
function parseVehicle(raw: Record<string, unknown>): AS24ScrapedVehicle | null {
  // Tentative multi-format : API interne AS24 / Next.js pageProps / JSON-LD
  const attr = (raw.attributes ?? raw.vehicle ?? raw) as Record<string, unknown>

  const make =
    toString(raw.make) ||
    toString(raw.brand) ||
    toString((attr as Record<string,unknown>).make) ||
    toString((raw.typedAttributes as Record<string,unknown>)?.make)

  const model =
    toString(raw.model) ||
    toString(raw.vehicleModel) ||
    toString((attr as Record<string,unknown>).model) ||
    toString(raw.title)

  const price =
    toNumber((raw.price as Record<string,unknown>)?.value) ||
    toNumber(raw.price) ||
    toNumber((raw.pricing as Record<string,unknown>)?.gross) ||
    toNumber((attr as Record<string,unknown>).price)

  const year =
    toNumber(raw.firstRegistrationYear) ||
    toNumber((raw.firstRegistration as Record<string,unknown>)?.year) ||
    toNumber((attr as Record<string,unknown>).firstRegistrationYear) ||
    undefined

  const mileage =
    toNumber((raw.mileage as Record<string,unknown>)?.value) ||
    toNumber(raw.mileage) ||
    toNumber((attr as Record<string,unknown>).mileage) ||
    0

  if (!make && !price && !model) return null

  const seller = (raw.seller ?? raw.dealer ?? {}) as Record<string, unknown>
  const location = (seller.location ?? seller) as Record<string, unknown>

  const images: string[] = []
  if (Array.isArray(raw.images)) {
    for (const img of raw.images) {
      const url = typeof img === 'string' ? img : toString((img as Record<string,unknown>)?.url)
      if (url) images.push(url)
    }
  }
  if (Array.isArray(raw.imageUrls)) {
    for (const u of raw.imageUrls) images.push(toString(u))
  }

  const listingUrl =
    toString(raw.url) ||
    toString(raw.listingUrl) ||
    toString(raw.absoluteUrl) ||
    toString(raw['@id'])

  return {
    title: `${make} ${model}`.trim() || toString(raw.title),
    brand: make.toLowerCase(),
    model,
    price,
    year: year || undefined,
    mileage,
    fuel: toString(raw.fuel) || toString((attr as Record<string,unknown>).fuel),
    transmission:
      toString(raw.transmission) ||
      toString(raw.gear) ||
      toString((attr as Record<string,unknown>).gear),
    power: toString(raw.power) || toString(raw.powerOutput),
    bodyType:
      toString(raw.bodyType) ||
      toString(raw.carBodyType) ||
      toString((attr as Record<string,unknown>).bodyType),
    exteriorColor:
      toString(raw.color) ||
      toString(raw.exteriorColor) ||
      toString((attr as Record<string,unknown>).color),
    interiorColor: toString(raw.interiorColor),
    doors: toNumber(raw.doors) || undefined,
    seats: toNumber(raw.seats) || undefined,
    dealerName:
      toString(seller.name) ||
      toString((seller.contact as Record<string,unknown>)?.name) ||
      toString(raw.dealerName),
    dealerCity:
      toString(location.city) ||
      toString(seller.city) ||
      toString(raw.dealerCity),
    dealerCountry:
      toString(location.country) ||
      toString(seller.country) ||
      toString(raw.dealerCountry) ||
      'Deutschland',
    dealerPhone:
      toString((seller.contact as Record<string,unknown>)?.phone) ||
      toString(seller.phone) ||
      toString(raw.dealerPhone),
    listingUrl,
    imageUrl: images[0] || '',
    imageUrls: images,
    description: toString(raw.description),
    equipment: Array.isArray(raw.equipment)
      ? (raw.equipment as unknown[]).map(toString).filter(Boolean)
      : [],
  }
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export const searchAs24Handler: PayloadHandler = async (req): Promise<Response> => {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const scraperSecret = process.env.SCRAPER_SECRET
  let body: { searchUrl?: string; secret?: string }
  try {
    body = await (req as unknown as Request).json()
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  if (scraperSecret) {
    const provided =
      req.headers.get('x-secret') ??
      req.headers.get('authorization')?.replace('Bearer ', '') ??
      body.secret ??
      null
    if (provided !== scraperSecret) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  const { searchUrl } = body
  if (!searchUrl) return Response.json({ error: 'searchUrl is required' }, { status: 400 })

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

    const context = await browser.newContext({
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      locale: 'de-DE',
      extraHTTPHeaders: {
        'Accept-Language': 'de-DE,de;q=0.9,fr-FR;q=0.8',
        Accept:
          'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      },
    })

    const page = await context.newPage()
    const interceptedJsons: unknown[] = []

    // Intercepter les réponses JSON de l'API interne AS24
    page.on('response', async (response) => {
      try {
        const ct = response.headers()['content-type'] ?? ''
        if (!ct.includes('application/json')) return
        const url = response.url()
        if (!url.includes('autoscout24')) return
        const json = await response.json().catch(() => null)
        if (json) interceptedJsons.push(json)
      } catch {
        // réponse déjà consommée
      }
    })

    // Bloquer images/fonts pour accélérer
    await page.route('**/*', (route) => {
      const rt = route.request().resourceType()
      if (['font', 'stylesheet', 'media', 'image'].includes(rt)) {
        route.abort()
      } else {
        route.continue()
      }
    })

    await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 35_000 })
    // Attendre que les XHR de la liste soient chargés
    await new Promise((r) => setTimeout(r, 7_000))

    let vehicles: AS24ScrapedVehicle[] = []

    // ── Stratégie 1 : __NEXT_DATA__ ────────────────────────────────────────
    const nextData = await page.evaluate((): unknown => {
      const el = document.querySelector('#__NEXT_DATA__')
      if (el?.textContent) {
        try { return JSON.parse(el.textContent) } catch { /* ignore */ }
      }
      return null
    })

    if (nextData) {
      const rawList = findListings(nextData)
      vehicles = rawList
        .map((r) => parseVehicle(r as Record<string, unknown>))
        .filter((v): v is AS24ScrapedVehicle => v !== null)
    }

    // ── Stratégie 2 : Interception réseau ──────────────────────────────────
    if (!vehicles.length && interceptedJsons.length) {
      for (const json of interceptedJsons) {
        const rawList = findListings(json)
        const parsed = rawList
          .map((r) => parseVehicle(r as Record<string, unknown>))
          .filter((v): v is AS24ScrapedVehicle => v !== null)
        vehicles.push(...parsed)
        if (vehicles.length) break
      }
    }

    // ── Stratégie 3 : JSON-LD ──────────────────────────────────────────────
    if (!vehicles.length) {
      const jsonLd = await page.evaluate((): unknown[] => {
        const results: unknown[] = []
        for (const script of document.querySelectorAll('script[type="application/ld+json"]')) {
          try {
            const data = JSON.parse(script.textContent ?? '')
            const nodes: unknown[] = data['@graph']
              ? data['@graph']
              : data['@type'] === 'ItemList'
              ? [data]
              : [data]
            for (const node of nodes as Record<string,unknown>[]) {
              if (node['@type'] === 'ItemList' && Array.isArray(node.itemListElement)) {
                for (const item of node.itemListElement as Record<string,unknown>[]) {
                  const car = (item.item ?? item) as Record<string,unknown>
                  if (['Car', 'Vehicle', 'Product'].includes(car['@type'] as string)) {
                    results.push({
                      brand: (car.brand as Record<string,unknown>)?.name ?? '',
                      model: car.model ?? '',
                      title: car.name ?? '',
                      price: (car.offers as Record<string,unknown>)?.price ?? 0,
                      year: car.vehicleModelDate
                        ? parseInt(car.vehicleModelDate as string)
                        : undefined,
                      mileage: (car.mileageFromOdometer as Record<string,unknown>)?.value ?? 0,
                      fuel: car.fuelType ?? '',
                      transmission: car.vehicleTransmission ?? '',
                      bodyType: car.bodyType ?? '',
                      listingUrl: car.url ?? car['@id'] ?? '',
                      imageUrl:
                        Array.isArray(car.image)
                          ? (car.image as string[])[0]
                          : (car.image as string) ?? '',
                    })
                  }
                }
              }
            }
          } catch { /* skip malformed */ }
        }
        return results
      })

      vehicles = jsonLd
        .map((r) => parseVehicle(r as Record<string, unknown>))
        .filter((v): v is AS24ScrapedVehicle => v !== null)
    }

    // ── Stratégie 4 : DOM ──────────────────────────────────────────────────
    if (!vehicles.length) {
      const dom = await page.evaluate((): unknown[] => {
        const results: unknown[] = []
        const articles = document.querySelectorAll('article')
        for (const article of Array.from(articles)) {
          const link = article.querySelector('a[href*="/angebote/"]') as HTMLAnchorElement | null
          if (!link?.href) continue

          const priceMatch = article.textContent?.match(/(\d[\d.]+)\s*€/)
          const price = priceMatch ? parseInt(priceMatch[1].replace(/\./g, ''), 10) : 0

          const title =
            (article.querySelector('h2, h3') as HTMLElement | null)?.innerText?.trim() ?? ''
          const img = article.querySelector('img') as HTMLImageElement | null

          if (price || title) {
            results.push({
              title,
              brand: '',
              model: title,
              price,
              listingUrl: link.href,
              imageUrl: img?.src ?? '',
            })
          }
        }
        return results
      })

      vehicles = dom
        .map((r) => parseVehicle(r as Record<string, unknown>))
        .filter((v): v is AS24ScrapedVehicle => v !== null)
    }

    await browser.close()
    browser = undefined

    return Response.json({ success: true, vehicles, total: vehicles.length })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Scraping failed'
    return Response.json({ error: message }, { status: 502 })
  } finally {
    await browser?.close()
  }
}
