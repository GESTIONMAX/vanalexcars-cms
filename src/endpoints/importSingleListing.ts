/**
 * importSingleListing.ts
 *
 * POST /api/import-single
 *
 * Importe un seul véhicule depuis une URL de fiche AutoScout24.
 * Utilise Playwright pour charger la page, intercepter les images XHR,
 * et extraire les données depuis __NEXT_DATA__.
 *
 * Corps : { listingUrl: string, secret?: string }
 * Réponse : { action: 'created'|'updated'|'skipped', id?, title, reason? }
 *
 * Auth : header x-secret ou body.secret
 */

import type { PayloadHandler } from 'payload'
import { chromium } from 'playwright-core'
import { canonicalizeUrl } from '@/lib/canonicalizeUrl'
import { extractListingId } from '@/lib/extractListingId'

const ALLOWED_HOST = /^https?:\/\/(www\.)?autoscout24\.(de|com|fr|it|es|nl|be|at|ch|lu|pl)/

// ─── Normalisation ────────────────────────────────────────────────────────────

function str(v: unknown): string {
  if (v == null) return ''
  return String(v).trim()
}

function num(v: unknown): number {
  const n = Number(v)
  return isFinite(n) && n >= 0 ? n : 0
}

const VALID_BRANDS = new Set([
  'audi', 'bmw', 'mercedes', 'porsche', 'volkswagen', 'mini',
  'alfa-romeo', 'aston-martin', 'bentley', 'ferrari', 'ford',
  'jaguar', 'lamborghini', 'land-rover', 'lexus', 'maserati',
  'mazda', 'mclaren', 'mg', 'opel', 'renault', 'rolls-royce',
  'toyota', 'volvo', 'other',
])

function normalizeBrand(raw: string): string {
  const b = raw.toLowerCase()
    .replace('mercedes-benz', 'mercedes').replace('mercedes amg', 'mercedes')
    .replace('vw', 'volkswagen').replace('alfa romeo', 'alfa-romeo')
    .replace('aston martin', 'aston-martin').replace('land rover', 'land-rover')
    .replace('rolls royce', 'rolls-royce').trim()
  return VALID_BRANDS.has(b) ? b : 'other'
}

function mapFuel(fuel: string): string {
  const f = fuel.toLowerCase()
  if (f.includes('elektro') || f.includes('electric')) return 'electric'
  if (f.includes('plugin') || f.includes('plug-in') || f.includes('phev')) return 'plugin-hybrid'
  if (f.includes('hybrid')) return 'hybrid'
  if (f.includes('diesel')) return 'diesel'
  if (f.includes('benzin') || f.includes('essence') || f.includes('petrol') || f.includes('gasoline')) return 'petrol'
  if (f.includes('gas') || f.includes('gpl') || f.includes('lpg') || f.includes('cng')) return 'gas'
  return 'other'
}

function mapTransmission(t: string): string {
  const s = t.toLowerCase()
  if (s.includes('automat') || s.includes('automa')) return 'automatic'
  if (s.includes('manual') || s.includes('manuell') || s.includes('mécanique')) return 'manual'
  return 'other'
}

function mapBodyType(b: string): string {
  const s = b.toLowerCase()
  if (s.includes('cabrio') || s.includes('roadster') || s.includes('convert')) return 'cabriolet'
  if (s.includes('suv') || s.includes('offroad') || s.includes('4x4')) return 'suv'
  if (s.includes('coup')) return 'coupe'
  if (s.includes('break') || s.includes('kombi') || s.includes('estate') || s.includes('wagon')) return 'break'
  if (s.includes('berline') || s.includes('limousine') || s.includes('sedan')) return 'sedan'
  if (s.includes('van') || s.includes('minivan') || s.includes('monospace')) return 'van'
  return 'other'
}

// ─── Scraping ─────────────────────────────────────────────────────────────────

interface ScrapedVehicle {
  title: string
  brand: string
  model: string
  year: number
  price: number
  mileage: number
  fuel: string
  transmission: string
  bodyType: string
  power: string
  exteriorColor: string
  interiorColor: string
  doors: number
  seats: number
  dealer: string
  dealerCity: string
  description: string
  features: string[]
  imageUrls: string[]
  listingUrl: string
  listingId: string
}

async function scrapeListingPage(url: string): Promise<ScrapedVehicle | null> {
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    locale: 'de-DE',
  })

  const interceptedImages: string[] = []

  context.on('response', async (response) => {
    try {
      const resUrl = response.url()
      if (!resUrl.includes('autoscout24') && !resUrl.includes('cdn') && !resUrl.includes('images')) return
      const ct = response.headers()['content-type'] || ''
      if (ct.startsWith('image/')) {
        interceptedImages.push(resUrl)
        return
      }
      if (!ct.includes('json')) return
      const text = await response.text().catch(() => '')
      if (!text) return
      // Chercher des URLs d'images dans les réponses JSON
      const imgMatches = text.match(/https?:\/\/[^"']+\.(?:jpg|jpeg|png|webp)[^"']*/g) || []
      for (const img of imgMatches) {
        if (img.includes('autoscout') || img.includes('cdn') || img.includes('img')) {
          interceptedImages.push(img)
        }
      }
    } catch { /* ignore */ }
  })

  const page = await context.newPage()

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 35_000 })

    // Extraire __NEXT_DATA__
    const nextData = await page.evaluate((): unknown => {
      const el = document.getElementById('__NEXT_DATA__')
      if (!el?.textContent) return null
      try { return JSON.parse(el.textContent) } catch { return null }
    })

    const nd = nextData as Record<string, unknown> | null
    const pageProps = (nd?.props as Record<string, unknown>)?.pageProps as Record<string, unknown> | undefined
    const ld = pageProps?.listingDetails as Record<string, unknown> | undefined

    if (!ld) return null

    const vehicle = (ld.vehicle ?? {}) as Record<string, unknown>
    const seller = (ld.seller ?? {}) as Record<string, unknown>
    const location = (ld.location ?? {}) as Record<string, unknown>
    const prices = (ld.prices ?? {}) as Record<string, unknown>
    const pricePublic = ((prices.public ?? prices.dealer ?? {}) as Record<string, unknown>)
    const mileageRaw = (ld.mileage ?? {}) as Record<string, unknown>

    // Titre
    const make = str(vehicle.make ?? vehicle.brand ?? '')
    const modelRaw = str(vehicle.model ?? vehicle.modelName ?? '')
    const version = str(vehicle.version ?? vehicle.trim ?? '')
    const title = [make, modelRaw, version].filter(Boolean).join(' ') || str(ld.title ?? '')

    // Année
    const yearRaw = vehicle.firstRegistration ?? vehicle.year ?? vehicle.modelYear
    const year = yearRaw
      ? num(typeof yearRaw === 'string' ? yearRaw.split('/').pop() : yearRaw)
      : 0

    // Carburant / transmission / carrosserie
    const fuelRaw = str(vehicle.fuel ?? vehicle.fuelType ?? vehicle.energy ?? '')
    const transRaw = str(vehicle.gearbox ?? vehicle.transmission ?? '')
    const bodyRaw = str(vehicle.bodyType ?? vehicle.body ?? vehicle.bodyTypeName ?? '')

    // Puissance
    const typedAttrs = (vehicle.typedAttributes ?? vehicle.vehicleAttributes ?? []) as Array<Record<string, unknown>>
    let power = ''
    for (const a of typedAttrs) {
      const key = str(a.key ?? a.id ?? '').toLowerCase()
      if (key.includes('power') || key.includes('leistung') || key === 'ps' || key === 'kw') {
        power = str(a.value ?? a.formattedValue)
        break
      }
    }

    // Images depuis XHR + page JSON-LD
    const jsonLdImages = await page.evaluate((): string[] => {
      const results: string[] = []
      document.querySelectorAll('script[type="application/ld+json"]').forEach(el => {
        try {
          const d = JSON.parse(el.textContent || '')
          const imgs = (d.image ?? d.images ?? [])
          if (Array.isArray(imgs)) imgs.forEach((i: unknown) => typeof i === 'string' && results.push(i))
          else if (typeof imgs === 'string') results.push(imgs)
        } catch { /* ignore */ }
      })
      return results
    })

    const allImages = [...new Set([...interceptedImages, ...jsonLdImages])]
      .filter(u => u.match(/\.(jpg|jpeg|png|webp)/i))
      .slice(0, 20)

    // Equipements (DOM)
    const features = await page.evaluate((): string[] => {
      const items: string[] = []
      document.querySelectorAll('[data-testid*="equipment"] li, .equipment-item, [class*="equipment"] li').forEach(el => {
        const t = el.textContent?.trim()
        if (t) items.push(t)
      })
      return items
    })

    // Description
    const description = await page.evaluate((): string => {
      const el = document.querySelector('[data-testid="description"] p, .description-content, [class*="description"] p')
      return el?.textContent?.trim() || ''
    })

    const listingId = str(ld.id ?? ld.listingId ?? url.split('/').pop()?.split('?')[0] ?? '')

    return {
      title,
      brand: normalizeBrand(make),
      model: modelRaw,
      year,
      price: num(pricePublic.priceRaw ?? pricePublic.price ?? 0),
      mileage: num(mileageRaw.value ?? ld.mileage ?? 0),
      fuel: mapFuel(fuelRaw),
      transmission: mapTransmission(transRaw),
      bodyType: mapBodyType(bodyRaw),
      power,
      exteriorColor: str(vehicle.color ?? vehicle.exteriorColor ?? ''),
      interiorColor: str(vehicle.interiorColor ?? ''),
      doors: num(vehicle.doors ?? 0),
      seats: num(vehicle.seats ?? 0),
      dealer: str(seller.companyName ?? ''),
      dealerCity: str(location.city ?? ''),
      description,
      features,
      imageUrls: allImages,
      listingUrl: url,
      listingId,
    }
  } finally {
    await context.close()
    await browser.close()
  }
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export const importSingleListingHandler: PayloadHandler = async (req): Promise<Response> => {
  // Auth
  const scraperSecret = process.env.SCRAPER_SECRET
  let body: { listingUrl?: string; secret?: string }
  try {
    body = await (req as unknown as Request).json()
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  if (scraperSecret) {
    const provided = req.headers.get('x-secret') ?? body.secret ?? null
    if (provided !== scraperSecret) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  const { listingUrl } = body
  if (!listingUrl) return Response.json({ error: '`listingUrl` is required' }, { status: 400 })

  if (!ALLOWED_HOST.test(listingUrl)) {
    return Response.json({ error: 'URL non autorisée (autoscout24.de requis)' }, { status: 400 })
  }

  // Scraping
  let scraped: ScrapedVehicle | null
  try {
    scraped = await scrapeListingPage(listingUrl)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Scraping failed'
    return Response.json({ error: msg }, { status: 502 })
  }

  if (!scraped) {
    return Response.json({ error: 'Impossible d\'extraire les données de cette fiche' }, { status: 422 })
  }

  const { payload } = req

  // Déduplication par URL
  const canonicalUrl = canonicalizeUrl(listingUrl)
  const extracted = extractListingId(listingUrl, scraped.listingId)
  const sourceKey = extracted ? `autoscout24:${extracted.id}` : undefined

  try {
    // Lookup existant
    const existing = sourceKey
      ? await payload.find({
          collection: 'vehicles',
          where: { sourceKey: { equals: sourceKey } },
          limit: 1,
        }).then(r => r.docs[0] ?? null)
      : null

    const vehicleData = {
      title: scraped.title,
      brand: scraped.brand,
      model: scraped.model,
      year: scraped.year || undefined,
      price: scraped.price || undefined,
      mileage: scraped.mileage || undefined,
      fuel: scraped.fuel || undefined,
      transmission: scraped.transmission || undefined,
      bodyType: scraped.bodyType || undefined,
      power: scraped.power || undefined,
      exteriorColor: scraped.exteriorColor || undefined,
      interiorColor: scraped.interiorColor || undefined,
      doors: scraped.doors || undefined,
      seats: scraped.seats || undefined,
      dealer: scraped.dealer || undefined,
      dealerCity: scraped.dealerCity || undefined,
      description: scraped.description || undefined,
      features: scraped.features.length > 0 ? scraped.features : undefined,
      imageUrls: scraped.imageUrls.map(url => ({ url })),
      sourcePlatform: 'autoscout24',
      sourceKey: sourceKey || undefined,
      originalListingUrl: canonicalUrl || listingUrl,
      sourceUrl: listingUrl,
      status: 'available',
    }

    if (existing) {
      await payload.update({
        collection: 'vehicles',
        id: existing.id,
        data: vehicleData as any,
      })
      return Response.json({ action: 'updated', id: existing.id, title: scraped.title })
    }

    const created = await payload.create({
      collection: 'vehicles',
      data: vehicleData as any,
    })
    return Response.json({ action: 'created', id: created.id, title: scraped.title })

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Database error'
    return Response.json({ error: msg }, { status: 500 })
  }
}
