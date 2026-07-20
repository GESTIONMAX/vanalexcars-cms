/**
 * enrichVehicle.ts
 *
 * POST /api/enrich-vehicle
 *
 * Wrapper HTTP autour de enrichAs24Listing (lib/enrichAs24Listing.ts).
 * Récupère les images + données texte d'une fiche AutoScout24 via Playwright,
 * puis met à jour le véhicule en base selon le résultat :
 *
 *   listing_removed → status=inactive, sourceInactiveAt, sourceInactiveReason
 *   temporary_error → enrichmentStatus=failed, enrichmentLastError (statut métier inchangé)
 *   success         → patch partiel sans écrasement des champs déjà renseignés
 *
 * Corps : { vehicleId: string, dryRun?: boolean, secret?: string }
 * Réponse : { imageUrls, scrapedCount, extractedData, appliedFields }
 */

import type { PayloadHandler } from 'payload'
import type { Vehicle } from '@/payload-types'
import { enrichAs24Listing } from '@/lib/enrichAs24Listing'
import {
  buildEnrichmentSuccessPatch,
  buildListingRemovedPatch,
  buildTemporaryErrorPatch,
} from '@/lib/buildEnrichmentPatch'

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

  let listingUrl =
    vehicle.originalListingUrl ||
    (vehicle.sourceUrl?.includes('/angebote/') ? vehicle.sourceUrl : null)
  if (!listingUrl)
    return Response.json(
      { error: 'Vehicle has no `originalListingUrl` or valid `sourceUrl`' },
      { status: 400 },
    )
  // Normaliser les URLs relatives → absolues
  if (listingUrl.startsWith('/')) {
    listingUrl = `https://www.autoscout24.de${listingUrl}`
  }
  if (!ALLOWED_HOST.test(listingUrl))
    return Response.json(
      { error: 'URL not allowed (must be an AutoScout24 domain)' },
      { status: 400 },
    )

  // ── Scraping + switch sur le résultat ────────────────────────────────────
  try {
    const result = await enrichAs24Listing(listingUrl)

    // ── listing_removed : annonce définitivement supprimée ─────────────────
    if (result.kind === 'listing_removed') {
      const removedPatch = buildListingRemovedPatch(result)
      if (!dryRun) {
        await payload.update({ collection: 'vehicles', id: vehicleId, data: removedPatch })
      }
      return Response.json({
        listingRemoved: true,
        dryRun,
        vehicleId,
        httpStatus: result.httpStatus,
        patch: removedPatch,
      })
    }

    // ── temporary_error : erreur transitoire, statut métier inchangé ───────
    if (result.kind === 'temporary_error') {
      const errorPatch = buildTemporaryErrorPatch(result)
      if (!dryRun) {
        await payload.update({ collection: 'vehicles', id: vehicleId, data: errorPatch })
      }
      return Response.json(
        {
          temporaryError: true,
          dryRun,
          vehicleId,
          code: result.code,
          message: result.message,
        },
        { status: 502 },
      )
    }

    // ── success : enrichissement normal ────────────────────────────────────
    if (dryRun) {
      return Response.json({
        dryRun: true,
        vehicleId,
        scrapedCount: result.imageUrls.length,
        imageUrls: result.imageUrls,
        extractedData: result.extractedData,
      })
    }

    const { patch, appliedFields, noop } = buildEnrichmentSuccessPatch(result, vehicle)

    if (!noop) {
      patch.enrichmentStatus = 'completed'
      patch.enrichmentCompletedAt = new Date().toISOString()
    }

    await payload.update({ collection: 'vehicles', id: vehicleId, data: patch })

    return Response.json({
      success: true,
      vehicleId,
      scrapedCount: result.imageUrls.length,
      imageUrls: result.imageUrls,
      extractedData: result.extractedData,
      appliedFields,
      noop,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Enrichment failed'
    payload.logger.error(`[enrichVehicle] ${message}`)
    return Response.json({ error: message }, { status: 502 })
  }
}
