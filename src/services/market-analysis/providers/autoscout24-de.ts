/**
 * providers/autoscout24-de.ts
 *
 * Provider pour AutoScout24 Allemagne via Playwright.
 * Utilise searchAs24Vehicles pour le scraping.
 * Source : 'autoscout24_de'
 *
 * Rate limiting : 2s de délai entre les navigations de page.
 */

import { searchAs24Vehicles } from '@/lib/searchAs24Vehicles'
import type { MarketStudy } from '../types'
import type { RawMarketListing } from './types'

/**
 * Construit une URL de recherche AutoScout24 DE à partir des critères de l'étude.
 */
function buildAs24DeSearchUrl(study: MarketStudy): string {
  const params = new URLSearchParams()

  // Marque et modèle : AS24 utilise des slugs dans l'URL
  const brandSlug = study.brand.toLowerCase().replace(/\s+/g, '-')
  const modelSlug = study.model.toLowerCase().replace(/\s+/g, '-')

  let url = `https://www.autoscout24.de/lst/${brandSlug}/${modelSlug}`

  // Paramètres de recherche
  if (study.yearMin != null) params.set('fregfrom', String(study.yearMin))
  if (study.yearMax != null) params.set('fregto', String(study.yearMax))
  if (study.mileageMax != null) params.set('kmto', String(study.mileageMax))

  // Carburant
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

  // Transmission
  if (study.transmission) {
    const transMap: Record<string, string> = {
      manual: 'M',
      automatic: 'A',
    }
    const transCode = transMap[study.transmission]
    if (transCode) params.set('gear', transCode)
  }

  // Puissance
  if (study.powerMinHp != null) params.set('powerfrom', String(Math.round(study.powerMinHp * 0.7355)))
  if (study.powerMaxHp != null) params.set('powerto', String(Math.round(study.powerMaxHp * 0.7355)))

  // Tri par date de mise en ligne (annonces récentes en premier)
  params.set('sort', 'age')
  params.set('desc', '0')

  const queryString = params.toString()
  return queryString ? `${url}?${queryString}` : url
}

/**
 * Récupère les annonces AutoScout24 DE pour l'étude donnée.
 * Utilise l'URL fournie dans study.searchUrlDE ou la génère.
 * Rate limiting : 2s entre les navigations.
 */
export async function fetchAs24DeListings(
  study: MarketStudy,
  signal?: AbortSignal,
): Promise<RawMarketListing[]> {
  const searchUrl = study.searchUrlDE ?? buildAs24DeSearchUrl(study)

  // Vérifier l'annulation
  if (signal?.aborted) return []

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

    const vehicles = await searchAs24Vehicles(searchUrl)

    // Mapper AS24ScrapedVehicle → RawMarketListing
    return vehicles.map((v) => {
      const sourceId =
        v.listingId ??
        v.listingUrl?.match(/([a-f0-9-]{36})/)?.[1] ??
        v.listingUrl?.replace(/[^a-zA-Z0-9]/g, '-') ??
        ''

      // Extraire la puissance en HP depuis le champ power (ex: "200 PS", "147 kW")
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
        location: v.dealerCity ?? v.dealerCountry,
        dealer: v.dealerName,
        imageUrl: v.imageUrl,
        sellerType: 'professional', // AS24 DE : principalement des pros
        rawData: {
          source: 'autoscout24_de',
          ...v,
        },
      } satisfies RawMarketListing
    }).filter((l) => l.sourceId && l.price !== undefined)
  } catch (err: unknown) {
    if (err instanceof Error && err.message === 'Aborted') return []
    throw new Error(
      `AS24 DE scraping failed: ${err instanceof Error ? err.message : String(err)}`,
    )
  }
}
