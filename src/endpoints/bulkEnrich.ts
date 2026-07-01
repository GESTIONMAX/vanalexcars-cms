/**
 * POST /api/bulk-enrich
 * SSE streaming — enrichit en masse les véhicules AS24 via Playwright.
 * Remplace l'appel Netlify Function (timeout 26s) par un endpoint backend long-lived.
 *
 * Corps : { minScore?, limit?, brand?, category? }
 * Auth  : x-secret ou Authorization: Bearer {SCRAPER_SECRET}
 */

import type { PayloadHandler, Where } from 'payload'
import type { Vehicle } from '@/payload-types'
import { enrichAs24Listing } from '@/lib/enrichAs24Listing'

const ALLOWED_HOST =
  /^https?:\/\/(www\.)?autoscout24\.(de|com|fr|it|es|nl|be|at|ch|lu|pl)/

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

// Calcul du score de complétude (miroir du frontend)
function calcScore(v: Vehicle): number {
  const weights: Record<string, number> = {
    price: 10, title: 10, year: 10, mileage: 10, fuel: 10,
    transmission: 10, images: 10, dealer: 10, power: 5,
    exteriorColor: 5, doors: 5, seats: 5, features: 2,
    description: 2, interiorColor: 2, dealerCity: 2, originalListingUrl: 2,
  }
  const MAX = Object.values(weights).reduce((s, w) => s + w, 0)
  let earned = 0
  const specs = v.specifications as Record<string, unknown> | undefined
  if ((v.price ?? 0) > 0) earned += weights.price
  if (v.title && v.title.length > 3) earned += weights.title
  if (v.year && v.year > 1990) earned += weights.year
  if (v.mileage != null && v.mileage >= 0) earned += weights.mileage
  if (v.fuel) earned += weights.fuel
  if (v.transmission) earned += weights.transmission
  if (v.imageUrls && v.imageUrls.length > 0) earned += weights.images
  if (v.dealer && !/importemoi/i.test(v.dealer)) earned += weights.dealer
  if (specs?.power) earned += weights.power
  if (v.exteriorColor) earned += weights.exteriorColor
  if (v.doors) earned += weights.doors
  if (v.seats) earned += weights.seats
  if (v.features && v.features.length > 0) earned += weights.features
  if (v.description && v.description.length > 20) earned += weights.description
  if (v.interiorColor) earned += weights.interiorColor
  if (v.dealerCity) earned += weights.dealerCity
  if (v.originalListingUrl) earned += weights.originalListingUrl
  return Math.round((earned / MAX) * 100)
}

function resolveListingUrl(v: Vehicle): string | null {
  if (v.originalListingUrl) return v.originalListingUrl
  if (v.sourceUrl?.includes('/angebote/')) {
    return v.sourceUrl.startsWith('/')
      ? `https://www.autoscout24.de${v.sourceUrl}`
      : v.sourceUrl
  }
  return null
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, x-secret, Authorization',
}

export const bulkEnrichHandler: PayloadHandler = async (req): Promise<Response> => {
  // ── CORS preflight ──────────────────────────────────────────────────────────
  if (req.method === 'GET' && req.headers.get('access-control-request-method')) {
    return new Response(null, { status: 204, headers: CORS_HEADERS })
  }

  // ── Auth ────────────────────────────────────────────────────────────────────
  const scraperSecret = process.env.SCRAPER_SECRET
  let body: { minScore?: number; limit?: number; brand?: string; category?: string; secret?: string }
  try {
    body = await (req as unknown as Request).json()
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  if (scraperSecret) {
    const provided =
      req.headers.get('x-secret') ??
      req.headers.get('authorization')?.replace('Bearer ', '').trim() ??
      body.secret ??
      null
    if (provided !== scraperSecret) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  const { minScore = 80, limit = 20, brand, category } = body
  const { payload } = req

  // ── SSE stream ───────────────────────────────────────────────────────────────
  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      function send(event: object) {
        controller.enqueue(encoder.encode('data: ' + JSON.stringify(event) + '\n\n'))
      }

      try {
        send({ type: 'log', message: `Démarrage enrichissement backend — score cible: <${minScore}% | limite: ${limit}` })
        if (brand) send({ type: 'log', message: `Filtre marque: ${brand}` })

        // Récupérer les véhicules AS24
        const where: Where = {
          sourcePlatform: { equals: 'autoscout24.de' },
        }
        if (brand) where['brand'] = { equals: brand }
        if (category) where['category'] = { equals: category }

        const { docs: vehicles } = await payload.find({
          collection: 'vehicles',
          where,
          limit: 500,
          depth: 0,
        })

        send({ type: 'log', message: `${vehicles.length} véhicules AS24 récupérés` })

        // Filtrer et trier par score croissant
        const toEnrich = (vehicles as Vehicle[])
          .filter((v) => resolveListingUrl(v))
          .map((v) => ({ v, score: calcScore(v) }))
          .filter(({ score }) => score < minScore)
          .sort((a, b) => a.score - b.score)
          .slice(0, limit)

        send({ type: 'log', message: `${toEnrich.length} véhicules à enrichir (score < ${minScore}%)` })

        const stats = { total: toEnrich.length, enriched: 0, skipped: 0, errors: 0 }

        for (const { v: vehicle, score: scoreBefore } of toEnrich) {
          send({
            type: 'log',
            message: `Traitement: ${vehicle.title} (score: ${scoreBefore}%)`,
          })

          // Normaliser l'URL
          let listingUrl = resolveListingUrl(vehicle)!
          if (listingUrl.startsWith('/')) {
            listingUrl = `https://www.autoscout24.de${listingUrl}`
          }

          // Patch originalListingUrl si absent
          if (!vehicle.originalListingUrl) {
            await payload.update({
              collection: 'vehicles',
              id: vehicle.id,
              data: { originalListingUrl: listingUrl },
            }).catch(() => null)
          }

          if (!ALLOWED_HOST.test(listingUrl)) {
            stats.errors++
            send({ type: 'vehicle', title: vehicle.title, scoreBefore, scoreAfter: scoreBefore, status: 'error', message: 'URL non autorisée' })
            continue
          }

          try {
            const { imageUrls, extractedData } = await enrichAs24Listing(listingUrl)

            const patch: Record<string, unknown> = {}
            const currentImageCount = vehicle.imageUrls?.length ?? 0
            if (imageUrls.length > currentImageCount) patch.imageUrls = imageUrls.map((url) => ({ url }))
            if (extractedData.description && !vehicle.description) patch.description = extractedData.description
            if (extractedData.features?.length && !vehicle.features?.length) patch.features = extractedData.features.map((f) => ({ feature: f }))
            if (extractedData.specifications?.power && !(vehicle.specifications as Record<string,unknown>)?.power) {
              patch.specifications = { ...(vehicle.specifications ?? {}), ...extractedData.specifications }
            }
            if (extractedData.exteriorColor && !vehicle.exteriorColor) patch.exteriorColor = extractedData.exteriorColor
            if (extractedData.interiorColor && !vehicle.interiorColor) patch.interiorColor = extractedData.interiorColor
            if (extractedData.doors && !vehicle.doors) patch.doors = extractedData.doors
            if (extractedData.seats && !vehicle.seats) patch.seats = extractedData.seats
            if (extractedData.dealer && (!vehicle.dealer || /importemoi/i.test(vehicle.dealer))) patch.dealer = extractedData.dealer
            if (extractedData.dealerCity && !vehicle.dealerCity) patch.dealerCity = extractedData.dealerCity
            if (extractedData.price && extractedData.price > 0 && !(vehicle.price && vehicle.price > 0)) patch.price = extractedData.price
            if (extractedData.mileage != null && !(vehicle.mileage != null && vehicle.mileage > 0)) patch.mileage = extractedData.mileage
            patch.lastScrapedAt = new Date().toISOString()

            const appliedFields = Object.keys(patch).filter((k) => k !== 'lastScrapedAt')

            if (appliedFields.length === 0) {
              stats.skipped++
              send({ type: 'vehicle', title: vehicle.title, scoreBefore, scoreAfter: scoreBefore, status: 'skipped', message: 'Rien à enrichir' })
            } else {
              await payload.update({ collection: 'vehicles', id: vehicle.id, data: patch })
              const updated = await payload.findByID({ collection: 'vehicles', id: vehicle.id, depth: 0 }) as Vehicle
              const scoreAfter = calcScore(updated)
              stats.enriched++
              send({ type: 'vehicle', title: vehicle.title, scoreBefore, scoreAfter, status: 'enriched' })
            }
          } catch (err: unknown) {
            stats.errors++
            const msg = err instanceof Error ? err.message : 'Erreur inconnue'
            send({ type: 'vehicle', title: vehicle.title, scoreBefore, scoreAfter: scoreBefore, status: 'error', message: msg })
          }

          await sleep(1500)
        }

        send({ type: 'done', stats })
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Erreur fatale'
        controller.enqueue(encoder.encode('data: ' + JSON.stringify({ type: 'log', message: `Erreur fatale: ${msg}` }) + '\n\n'))
        controller.enqueue(encoder.encode('data: ' + JSON.stringify({ type: 'done', stats: { total: 0, enriched: 0, skipped: 0, errors: 1 } }) + '\n\n'))
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
      ...CORS_HEADERS,
    },
  })
}
