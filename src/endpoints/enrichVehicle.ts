/**
 * enrichVehicle.ts
 *
 * POST /api/enrich-vehicle
 *
 * Wrapper HTTP autour de enrichAs24Listing (lib/enrichAs24Listing.ts).
 * Récupère les images + données texte d'une fiche AutoScout24 via Playwright,
 * puis met à jour le véhicule en base (sans écraser les champs déjà renseignés).
 *
 * Corps : { vehicleId: string, dryRun?: boolean, secret?: string }
 * Réponse : { imageUrls, scrapedCount, extractedData, appliedFields }
 */

import type { PayloadHandler } from 'payload'
import type { Vehicle } from '@/payload-types'
import { enrichAs24Listing } from '@/lib/enrichAs24Listing'

const ALLOWED_HOST =
  /^https?:\/\/(www\.)?autoscout24\.(de|com|fr|it|es|nl|be|at|ch|lu|pl)/

export const enrichVehicleHandler: PayloadHandler = async (req): Promise<Response> => {
  const { payload } = req

  // ── Parse body ────────────────────────────────────────────────────────────
  let body: { vehicleId?: string; dryRun?: boolean; secret?: string }
  try {
    body = await (req as unknown as Request).json()
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  // ── Auth ──────────────────────────────────────────────────────────────────
  const scraperSecret = process.env.SCRAPER_SECRET
  if (scraperSecret) {
    const provided =
      req.headers.get('x-secret') ??
      req.headers.get('x-scrape-secret') ??
      body.secret ??
      null
    if (provided !== scraperSecret) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  // ── Validation ────────────────────────────────────────────────────────────
  const { vehicleId, dryRun = false } = body
  if (!vehicleId) return Response.json({ error: '`vehicleId` is required' }, { status: 400 })

  let vehicle: Vehicle
  try {
    vehicle = (await payload.findByID({ collection: 'vehicles', id: vehicleId })) as Vehicle
  } catch {
    return Response.json({ error: 'Vehicle not found' }, { status: 404 })
  }

  const listingUrl = vehicle.originalListingUrl
  if (!listingUrl)
    return Response.json({ error: 'Vehicle has no `originalListingUrl`' }, { status: 400 })
  if (!ALLOWED_HOST.test(listingUrl))
    return Response.json(
      { error: 'URL not allowed (must be an AutoScout24 domain)' },
      { status: 400 },
    )

  // ── Scraping ──────────────────────────────────────────────────────────────
  try {
    const { imageUrls, extractedData } = await enrichAs24Listing(listingUrl)

    if (dryRun) {
      return Response.json({
        dryRun: true,
        vehicleId,
        scrapedCount: imageUrls.length,
        imageUrls,
        extractedData,
      })
    }

    // ── Merge : ne jamais écraser un champ déjà renseigné ─────────────────
    const patch: Record<string, unknown> = {}

    // Images : enrichir seulement si on a trouvé plus que ce qui est en base
    const currentImageCount = vehicle.imageUrls?.length ?? 0
    if (imageUrls.length > currentImageCount) {
      patch.imageUrls = imageUrls.map((url) => ({ url }))
    }

    // Description
    if (extractedData.description && !vehicle.description) {
      patch.description = extractedData.description
    }

    // Équipements
    if (extractedData.features?.length && !(vehicle.features?.length)) {
      patch.features = extractedData.features.map((f) => ({ feature: f }))
    }

    // Spécifications techniques
    if (extractedData.specifications?.power && !vehicle.specifications?.power) {
      patch.specifications = {
        ...(vehicle.specifications ?? {}),
        ...extractedData.specifications,
      }
    }

    // Couleurs
    if (extractedData.exteriorColor && !vehicle.exteriorColor) {
      patch.exteriorColor = extractedData.exteriorColor
    }
    if (extractedData.interiorColor && !vehicle.interiorColor) {
      patch.interiorColor = extractedData.interiorColor
    }

    // Portes / places
    if (extractedData.doors && !vehicle.doors) patch.doors = extractedData.doors
    if (extractedData.seats && !vehicle.seats) patch.seats = extractedData.seats

    // Concessionnaire
    if (extractedData.dealer && (!vehicle.dealer || /importemoi/i.test(vehicle.dealer))) {
      patch.dealer = extractedData.dealer
    }
    if (extractedData.dealerCity && !vehicle.dealerCity) {
      patch.dealerCity = extractedData.dealerCity
    }

    // Horodatage de passage
    patch.lastScrapedAt = new Date().toISOString()

    await payload.update({ collection: 'vehicles', id: vehicleId, data: patch })

    const appliedFields = Object.keys(patch).filter((k) => k !== 'lastScrapedAt')

    return Response.json({
      success: true,
      vehicleId,
      scrapedCount: imageUrls.length,
      imageUrls,
      extractedData,
      appliedFields,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Enrichment failed'
    payload.logger.error(`[enrichVehicle] ${message}`)
    return Response.json({ error: message }, { status: 502 })
  }
}
