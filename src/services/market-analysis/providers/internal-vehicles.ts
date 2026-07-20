/**
 * providers/internal-vehicles.ts
 *
 * Provider pour les véhicules internes (collection Payload `vehicles`).
 * Mappe les véhicules existants en RawMarketListing.
 * Source : 'internal_vehicle'
 */

import type { BasePayload } from 'payload'
import type { MarketStudy } from '../types'
import type { RawMarketListing } from './types'

interface InternalVehiclesResult {
  listings: Array<RawMarketListing & { vehicleId: string }>
}

/**
 * Récupère les véhicules internes correspondant aux critères de l'étude.
 * Filtres appliqués : brand, year (min/max), mileage (max), fuel, transmission, status=active
 */
export async function fetchInternalVehicles(
  payload: BasePayload,
  study: MarketStudy,
): Promise<InternalVehiclesResult> {
  // Construire les filtres Payload
  const andConditions: Record<string, unknown>[] = [
    { status: { equals: 'active' } },
  ]

  const where = { and: andConditions }

  // Filtre sur la marque (brand dans Vehicles est un select avec valeurs lowercase)
  if (study.brand) {
    const brandValue = study.brand.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
    andConditions.push({ brand: { equals: brandValue } })
  }

  // Filtre sur l'année
  if (study.yearMin != null) {
    andConditions.push({ year: { greater_than_equal: study.yearMin } })
  }
  if (study.yearMax != null) {
    andConditions.push({ year: { less_than_equal: study.yearMax } })
  }

  // Filtre sur le kilométrage
  if (study.mileageMax != null) {
    andConditions.push({ mileage: { less_than_equal: study.mileageMax } })
  }

  // Filtre sur le carburant
  if (study.fuel) {
    // Mapping entre valeurs étude et valeurs collection véhicules
    const fuelMapping: Record<string, string> = {
      petrol: 'essence',
      diesel: 'diesel',
      electric: 'electric',
      hybrid: 'hybrid',
      'plugin-hybrid': 'plugin-hybrid',
    }
    const vehicleFuel = fuelMapping[study.fuel] ?? study.fuel
    andConditions.push({ fuel: { equals: vehicleFuel } })
  }

  // Filtre sur la transmission
  if (study.transmission) {
    andConditions.push({ transmission: { equals: study.transmission } })
  }

  try {
    const result = await payload.find({
      collection: 'vehicles',
      where: where as unknown as Parameters<typeof payload.find>[0]['where'],
      limit: 500,
      sort: '-createdAt',
    })

    const listings: Array<RawMarketListing & { vehicleId: string }> = result.docs.map((v) => {
      const vehicle = v as unknown as Record<string, unknown>
      const vehicleId = vehicle.id as string

      // Extraire la puissance en HP depuis specifications
      const specs = vehicle.specifications as Record<string, unknown> | undefined
      const powerHp =
        (specs?.powerHp as number | undefined) ??
        (specs?.powerKw ? Math.round((specs.powerKw as number) * 1.36) : undefined)

      // Construire le sourceId depuis les identifiants disponibles
      const sourceId =
        (vehicle.sourceListingId as string | undefined) ??
        (vehicle.externalReference as string | undefined) ??
        (vehicle.externalId as string | undefined) ??
        vehicleId

      // URL source
      const sourceUrl =
        (vehicle.originalListingUrl as string | undefined) ??
        (vehicle.sourceUrl as string | undefined) ??
        `payload://vehicles/${vehicleId}`

      // Image principale
      const imageUrls = vehicle.imageUrls as Array<{ url: string }> | undefined
      const processedImages = vehicle.processedImages as Record<string, string | null> | undefined
      const imageUrl =
        processedImages?.card ??
        processedImages?.hero ??
        imageUrls?.[0]?.url ??
        undefined

      return {
        vehicleId,
        sourceId,
        sourceUrl,
        title: vehicle.title as string | undefined,
        price: vehicle.price as number | undefined,
        mileage: vehicle.mileage as number | undefined,
        year: vehicle.year as number | undefined,
        fuel: vehicle.fuel as string | undefined,
        transmission: vehicle.transmission as string | undefined,
        bodyType: vehicle.bodyType as string | undefined,
        powerHp,
        location: vehicle.location as string | undefined,
        dealer: vehicle.dealer as string | undefined,
        imageUrl: typeof imageUrl === 'string' ? imageUrl : undefined,
        sellerType: 'professional', // Véhicules internes = professionnels
        rawData: {
          source: 'internal_vehicle',
          vehicleId,
          brand: vehicle.brand,
          model: vehicle.model,
          category: vehicle.category,
          exteriorColor: vehicle.exteriorColor,
          interiorColor: vehicle.interiorColor,
          dealerCity: vehicle.dealerCity,
          sourcePlatform: vehicle.sourcePlatform,
        },
      }
    })

    return { listings }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    throw new Error(`Failed to fetch internal vehicles: ${message}`)
  }
}
