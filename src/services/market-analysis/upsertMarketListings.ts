/**
 * upsertMarketListings.ts
 *
 * Gère l'upsert des annonces de marché dans la collection market-listings.
 *
 * Logique :
 *   - deduplicationKey = `${studyId}:${source}:${sourceId}`
 *   - Si l'annonce existe : update lastSeenAt, price, status=active, champs modifiés
 *     → préserve firstSeenAt
 *   - Si nouvelle : create avec firstSeenAt = now
 *   - Après run : annonces non vues → status=removed, removedAt=now
 */

import type { BasePayload } from 'payload'
import type { NormalizedListing } from './types'
import { asUntypedPayload } from './payloadAdapter'

interface UpsertListingsInput {
  payload: BasePayload
  studyId: string
  side: 'germany' | 'france'
  source: string
  listings: NormalizedListing[]
  runStartedAt: Date
}

interface UpsertListingsResult {
  created: number
  updated: number
  markedRemoved: number
  errors: string[]
}

/**
 * Upsert une liste d'annonces normalisées dans la collection market-listings.
 * Retourne les statistiques de l'opération.
 */
export async function upsertMarketListings({
  payload,
  studyId,
  side,
  source,
  listings,
  runStartedAt,
}: UpsertListingsInput): Promise<UpsertListingsResult & { seenSourceIds: Set<string> }> {
  const db = asUntypedPayload(payload)
  const now = runStartedAt.toISOString()
  const seenSourceIds = new Set<string>()
  let created = 0
  let updated = 0
  const errors: string[] = []

  for (const listing of listings) {
    const deduplicationKey = `${studyId}:${source}:${listing.sourceId}`
    seenSourceIds.add(listing.sourceId)

    try {
      // Chercher si l'annonce existe déjà
      const existing = await db.find({
        collection: 'market-listings',
        where: { deduplicationKey: { equals: deduplicationKey } },
        limit: 1,
      })

      if (existing.docs.length > 0) {
        // Update : préserver firstSeenAt, mettre à jour les champs changés
        const doc = existing.docs[0]
        await db.update({
          collection: 'market-listings',
          id: doc.id,
          data: {
            lastSeenAt: now,
            advertisedPrice: listing.price ?? doc.advertisedPrice,
            status: 'active',
            removedAt: null,
            // Mise à jour des données si fournies
            ...(listing.title ? { title: listing.title } : {}),
            ...(listing.mileage !== undefined ? { mileage: listing.mileage } : {}),
            ...(listing.year !== undefined ? { year: listing.year } : {}),
            ...(listing.fuel ? { fuel: listing.fuel } : {}),
            ...(listing.transmission ? { transmission: listing.transmission } : {}),
            ...(listing.bodyType ? { bodyType: listing.bodyType } : {}),
            ...(listing.powerHp !== undefined ? { powerHp: listing.powerHp } : {}),
            ...(listing.location ? { location: listing.location } : {}),
            ...(listing.dealer ? { dealer: listing.dealer } : {}),
            ...(listing.imageUrl ? { imageUrl: listing.imageUrl } : {}),
            ...(listing.normalizedMake ? { normalizedMake: listing.normalizedMake } : {}),
            ...(listing.normalizedModel ? { normalizedModel: listing.normalizedModel } : {}),
            ...(listing.normalizedGeneration ? { normalizedGeneration: listing.normalizedGeneration } : {}),
            ...(listing.normalizedFuel ? { normalizedFuel: listing.normalizedFuel } : {}),
            ...(listing.normalizedTransmission ? { transmission: listing.normalizedTransmission } : {}),
            ...(listing.normalizedBodyType ? { bodyType: listing.normalizedBodyType } : {}),
            ...(listing.normalizedSellerType ? { sellerType: listing.normalizedSellerType } : {}),
            ...(listing.powerHpNormalized !== undefined ? { powerHp: listing.powerHpNormalized } : {}),
            normalizationConfidence: listing.normalizationConfidence,
          },
        })
        updated++
      } else {
        // Create : nouvelle annonce
        await db.create({
          collection: 'market-listings',
          data: {
            study: studyId,
            side,
            source,
            ...(listing.vehicleId ? { vehicle: listing.vehicleId } : {}),
            sourceUrl: listing.sourceUrl,
            sourceId: listing.sourceId,
            deduplicationKey,
            title: listing.title,
            advertisedPrice: listing.price ?? 0,
            currency: 'EUR',
            mileage: listing.mileage,
            year: listing.year,
            fuel: listing.normalizedFuel ?? listing.fuel,
            transmission: listing.normalizedTransmission ?? listing.transmission,
            bodyType: listing.normalizedBodyType ?? listing.bodyType,
            powerHp: listing.powerHpNormalized ?? listing.powerHp,
            location: listing.location,
            dealer: listing.dealer,
            imageUrl: listing.imageUrl,
            normalizedMake: listing.normalizedMake,
            normalizedModel: listing.normalizedModel,
            normalizedGeneration: listing.normalizedGeneration,
            normalizedTrim: listing.normalizedTrim,
            sellerType: listing.normalizedSellerType ?? listing.sellerType ?? 'unknown',
            vatType: listing.normalizedVatType ?? 'unknown',
            normalizationConfidence: listing.normalizationConfidence,
            firstSeenAt: now,
            lastSeenAt: now,
            status: 'active',
            rawData: listing.rawData,
          },
        })
        created++
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      errors.push(`${listing.sourceId}: ${message}`)
    }
  }

  // Marquer comme supprimées les annonces non vues ce run
  const markedRemoved = await markRemovedListings({
    db,
    studyId,
    source,
    side,
    seenSourceIds,
    removedAt: now,
  })

  return { created, updated, markedRemoved, errors, seenSourceIds }
}

/**
 * Marque comme supprimées les annonces qui n'ont pas été vues dans ce run.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function markRemovedListings({
  db,
  studyId,
  source,
  side,
  seenSourceIds,
  removedAt,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any
  studyId: string
  source: string
  side: string
  seenSourceIds: Set<string>
  removedAt: string
}): Promise<number> {
  try {
    const activeListings = await db.find({
      collection: 'market-listings',
      where: {
        and: [
          { study: { equals: studyId } },
          { source: { equals: source } },
          { side: { equals: side } },
          { status: { equals: 'active' } },
        ],
      },
      limit: 1000,
    })

    let count = 0
    for (const doc of activeListings.docs) {
      const sourceId = doc.sourceId as string
      if (!seenSourceIds.has(sourceId)) {
        await db.update({
          collection: 'market-listings',
          id: doc.id,
          data: {
            status: 'removed',
            removedAt,
          },
        })
        count++
      }
    }
    return count
  } catch {
    return 0
  }
}
