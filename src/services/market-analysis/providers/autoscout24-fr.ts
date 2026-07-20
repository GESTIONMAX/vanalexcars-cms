/**
 * providers/autoscout24-fr.ts
 *
 * Provider pour AutoScout24 France via Playwright.
 * Utilise le même pattern que autoscout24-de.ts mais sur le domaine .fr.
 * Locale : fr-FR.
 * Source : 'autoscout24_fr'
 *
 * Rate limiting : 2s de délai entre les navigations de page.
 */

import { chromium } from 'playwright-core'
import { findListings, parseVehicle } from '@/lib/searchAs24Vehicles'
import type { MarketStudy } from '../types'
import type { RawMarketListing } from './types'

/**
 * Construit une URL de recherche AutoScout24 FR à partir des critères de l'étude.
 */
function buildAs24FrSearchUrl(study: MarketStudy): string {
  const brandSlug = study.brand.toLowerCase().replace(/\s+/g, '-')
  const modelSlug = study.model.toLowerCase().replace(/\s+/g, '-')

  let url = `https://www.autoscout24.fr/lst/${brandSlug}/${modelSlug}`

  const params = new URLSearchParams()

  if (study.yearMin != null) params.set('fregfrom', String(study.yearMin))
  if (study.yearMax != null) params.set('fregto', String(study.yearMax))
  if (study.mileageMax != null) params.set('kmto', String(study.mileageMax))

  if (study.fuel) {
    const fuelMap: Record<string, string> = {
      petrol: 'B',
      diesel: 'D',
      electric: 'E',
      hybrid: 'H',
      'plugin-hybrid': 'M',
    }
    const fuelCode = fuelMap[study.fuel]
    if (fuelCode) params.set('fuel', fuelCode)
  }

  if (study.transmission) {
    const transMap: Record<string, string> = {
      manual: 'M',
      automatic: 'A',
    }
    const transCode = transMap[study.transmission]
    if (transCode) params.set('gear', transCode)
  }

  if (study.powerMinHp != null) params.set('powerfrom', String(Math.round(study.powerMinHp * 0.7355)))
  if (study.powerMaxHp != null) params.set('powerto', String(Math.round(study.powerMaxHp * 0.7355)))

  params.set('sort', 'age')
  params.set('desc', '0')

  const queryString = params.toString()
  return queryString ? `${url}?${queryString}` : url
}

/**
 * Récupère les annonces AutoScout24 FR pour l'étude donnée.
 * Utilise Playwright directement pour définir la locale fr-FR.
 */
export async function fetchAs24FrListings(
  study: MarketStudy,
  signal?: AbortSignal,
): Promise<RawMarketListing[]> {
  const searchUrl = study.searchUrlFR ?? buildAs24FrSearchUrl(study)

  if (signal?.aborted) return []

  const executablePath =
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ?? '/usr/bin/chromium'

  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined

  try {
    // Délai de rate limiting (2s comme spécifié)
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(resolve, 2000)
      signal?.addEventListener('abort', () => {
        clearTimeout(timer)
        reject(new Error('Aborted'))
      })
    })

    if (signal?.aborted) return []

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
      locale: 'fr-FR',
      extraHTTPHeaders: {
        'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.8',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
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

    // Bloquer les ressources lourdes
    await page.route('**/*', (route) => {
      const rt = route.request().resourceType()
      if (['font', 'stylesheet', 'media', 'image'].includes(rt)) {
        route.abort()
      } else {
        route.continue()
      }
    })

    await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 35_000 })
    // Rate limiting : attendre que les XHR soient chargés
    await new Promise((r) => setTimeout(r, 7_000))

    if (signal?.aborted) {
      await browser.close()
      return []
    }

    // Extraire via __NEXT_DATA__
    const nextData = await page.evaluate((): unknown => {
      const el = document.querySelector('#__NEXT_DATA__')
      if (el?.textContent) {
        try {
          return JSON.parse(el.textContent)
        } catch {
          return null
        }
      }
      return null
    })

    type AS24Vehicle = {
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
      dealerName?: string
      dealerCity?: string
      listingUrl?: string
      listingId?: string
      imageUrl?: string
    }

    let vehicles: AS24Vehicle[] = []

    if (nextData) {
      const rawList = findListings(nextData)
      vehicles = rawList
        .map((r) => parseVehicle(r as Record<string, unknown>))
        .filter((v): v is AS24Vehicle => v !== null)
    }

    // Fallback sur les JSONs interceptés
    if (!vehicles.length && interceptedJsons.length) {
      for (const json of interceptedJsons) {
        const rawList = findListings(json)
        const parsed = rawList
          .map((r) => parseVehicle(r as Record<string, unknown>))
          .filter((v): v is AS24Vehicle => v !== null)
        vehicles.push(...parsed)
        if (vehicles.length) break
      }
    }

    await browser.close()
    browser = undefined

    // Mapper vers RawMarketListing
    return vehicles.map((v) => {
      const sourceId =
        v.listingId ??
        v.listingUrl?.match(/([a-f0-9-]{36})/)?.[1] ??
        v.listingUrl?.replace(/[^a-zA-Z0-9]/g, '-') ??
        ''

      let powerHp: number | undefined
      if (v.power) {
        const psMatch = v.power.match(/(\d+)\s*(?:ps|ch|hp|cv)/i)
        const kwMatch = v.power.match(/(\d+)\s*kw/i)
        if (psMatch) powerHp = Math.round(parseInt(psMatch[1]!) * 0.9863)
        else if (kwMatch) powerHp = Math.round(parseInt(kwMatch[1]!) * 1.36)
      }

      return {
        sourceId,
        sourceUrl: v.listingUrl ?? searchUrl,
        title: v.title,
        price: v.price && v.price > 0 ? v.price : undefined,
        mileage: v.mileage && v.mileage > 0 ? v.mileage : undefined,
        year: v.year,
        fuel: v.fuel,
        transmission: v.transmission,
        bodyType: v.bodyType,
        powerHp,
        location: v.dealerCity,
        dealer: v.dealerName,
        imageUrl: v.imageUrl,
        sellerType: 'professional',
        rawData: {
          source: 'autoscout24_fr',
          ...v,
        },
      } satisfies RawMarketListing
    }).filter((l) => l.sourceId && l.price !== undefined)
  } catch (err: unknown) {
    if (err instanceof Error && err.message === 'Aborted') return []
    throw new Error(
      `AS24 FR scraping failed: ${err instanceof Error ? err.message : String(err)}`,
    )
  } finally {
    await browser?.close()
  }
}
