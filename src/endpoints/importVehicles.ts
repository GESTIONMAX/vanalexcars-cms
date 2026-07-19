/**
 * Endpoint POST /api/import-vehicles
 *
 * Importe des véhicules AutoScout24 dans Payload CMS.
 * Accepte soit un tableau de véhicules pré-scrapés (vehicles),
 * soit une URL de recherche AS24 à scraper à la volée (searchUrl).
 *
 * Déduplication :
 *   - Clé primaire   : sourceKey       (autoscout24:<listingId>)
 *   - Clé secondaire : canonicalSourceUrl
 *
 * Auth : header x-secret uniquement.
 */

import type { PayloadHandler } from 'payload'
import { canonicalizeUrl } from '@/lib/canonicalizeUrl'
import { extractListingId } from '@/lib/extractListingId'
import { searchAs24Vehicles } from '@/lib/searchAs24Vehicles'
import type { AS24ScrapedVehicle } from '@/lib/searchAs24Vehicles'

// ─── Constantes ───────────────────────────────────────────────────────────────

const MAX_VEHICLES_PER_REQUEST = parseInt(process.env.IMPORT_MAX_VEHICLES ?? '50', 10)

// ─── Types ────────────────────────────────────────────────────────────────────

type ImportBody = {
  vehicles?: AS24ScrapedVehicle[]
  searchUrl?: string
  dryRun?: boolean
  limit?: number
}

type VehicleResult = {
  title: string
  action: 'created' | 'updated' | 'skipped' | 'error'
  id?: string
  reason?: string
  updatedFields?: string[]
  would?: 'create' | 'update' | 'skip'
}

// ─── Validation URL ───────────────────────────────────────────────────────────

function validateSearchUrl(
  raw: string,
): { ok: true; url: URL } | { ok: false; reason: string } {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return { ok: false, reason: 'invalid_url' }
  }
  if (url.protocol !== 'https:') return { ok: false, reason: 'https_only' }
  const ALLOWED = /^(www\.)?autoscout24\.(de|com|fr|it|es|nl|be|at|ch|lu|pl)$/
  if (!ALLOWED.test(url.hostname)) return { ok: false, reason: 'domain_not_allowed' }
  const privateIp =
    /^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|127\.|::1|localhost)/i
  if (privateIp.test(url.hostname)) return { ok: false, reason: 'private_ip_not_allowed' }
  return { ok: true, url }
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export const importVehiclesHandler: PayloadHandler = async (req): Promise<Response> => {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const scraperSecret = process.env.SCRAPER_SECRET
  if (scraperSecret) {
    const provided = req.headers.get('x-secret') ?? null
    if (provided !== scraperSecret) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  // ── Parse body ────────────────────────────────────────────────────────────
  let body: ImportBody
  try {
    body = await (req as unknown as Request).json()
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const dryRun = body.dryRun ?? false
  const rawLimit = body.limit ?? MAX_VEHICLES_PER_REQUEST
  const limit = Math.min(rawLimit, MAX_VEHICLES_PER_REQUEST)

  // ── Résolution des véhicules source ──────────────────────────────────────
  let rawVehicles: AS24ScrapedVehicle[] = []

  if (body.vehicles && Array.isArray(body.vehicles)) {
    rawVehicles = body.vehicles
  } else if (body.searchUrl) {
    const validation = validateSearchUrl(body.searchUrl)
    if (!validation.ok) {
      return Response.json(
        { error: `Invalid searchUrl: ${validation.reason}` },
        { status: 400 },
      )
    }
    try {
      rawVehicles = await searchAs24Vehicles(body.searchUrl)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Scraping failed'
      return Response.json({ error: message }, { status: 502 })
    }
  } else {
    return Response.json(
      { error: 'Either vehicles or searchUrl is required' },
      { status: 400 },
    )
  }

  // Appliquer la limite
  const vehicles = rawVehicles.slice(0, limit)

  const payload = req.payload
  const details: VehicleResult[] = []
  let created = 0
  let updated = 0
  let skipped = 0
  let errors = 0

  // ── Traitement par véhicule ───────────────────────────────────────────────
  for (const v of vehicles) {
    const titleLabel = v.title || `${v.brand} ${v.model}`.trim() || 'Véhicule inconnu'

    // 1. URL obligatoire
    if (!v.listingUrl) {
      details.push({
        title: titleLabel,
        action: 'skipped',
        reason: 'missing_listing_url',
        ...(dryRun ? { would: 'skip' } : {}),
      })
      skipped++
      continue
    }

    // 2. Canonicaliser l'URL
    const canonicalUrl = canonicalizeUrl(v.listingUrl)
    if (!canonicalUrl) {
      details.push({
        title: titleLabel,
        action: 'skipped',
        reason: 'invalid_url',
        ...(dryRun ? { would: 'skip' } : {}),
      })
      skipped++
      continue
    }

    // 3. Extraire l'ID
    const extracted = extractListingId(v.listingUrl, v.listingId)
    const sourceKey = extracted ? `autoscout24:${extracted.id}` : undefined

    try {
      // 4. Lookup existant
      let existing: Record<string, unknown> | null = null

      if (sourceKey) {
        const found = await payload.find({
          collection: 'vehicles',
          where: { sourceKey: { equals: sourceKey } },
          limit: 1,
        })
        if (found.docs.length > 0) {
          existing = found.docs[0] as unknown as Record<string, unknown>
        }
      }

      if (!existing) {
        const found = await payload.find({
          collection: 'vehicles',
          where: { canonicalSourceUrl: { equals: canonicalUrl } },
          limit: 1,
        })
        if (found.docs.length > 0) {
          existing = found.docs[0] as unknown as Record<string, unknown>
        }
      }

      // 5a. Mise à jour si trouvé
      if (existing) {
        const existingId = existing.id as string
        const patch: Record<string, unknown> = {}

        // Prix
        if (v.price && v.price > 0 && v.price !== (existing.price as number)) {
          patch.price = v.price
          const existingPrice = (existing.price as number) ?? 0
          const pct =
            Math.abs((v.price - existingPrice) / (existingPrice || 1)) * 100
          if (pct > 5) {
            console.log(
              `[import-vehicles] price_change vehicle=${existingId} old=${existingPrice} new=${v.price} pct=${pct.toFixed(1)}%`,
            )
          }
        }

        // Kilométrage
        if (v.mileage != null) {
          const existingMileage = (existing.mileage as number) ?? 0
          if (v.mileage > existingMileage) {
            patch.mileage = v.mileage
          } else if (v.mileage < existingMileage) {
            console.log(
              `[import-vehicles] mileage_decrease vehicle=${existingId} stored=${existingMileage} scraped=${v.mileage}`,
            )
          }
        }

        // Images
        const existingImageUrls = existing.imageUrls as Array<{ url: string }> | undefined
        if (
          v.imageUrls?.length &&
          v.imageUrls.length > (existingImageUrls?.length ?? 0)
        ) {
          patch.imageUrls = v.imageUrls.map((url) => ({ url }))
        }

        if (!dryRun) {
          patch.lastScrapedAt = new Date().toISOString()
        }

        const updatedFields = Object.keys(patch).filter((k) => k !== 'lastScrapedAt')

        if (dryRun) {
          details.push({
            title: titleLabel,
            action: 'updated',
            id: existingId,
            updatedFields,
            would: 'update',
          })
        } else {
          await payload.update({
            collection: 'vehicles',
            id: existingId,
            data: patch,
          })
          details.push({
            title: titleLabel,
            action: 'updated',
            id: existingId,
            updatedFields,
          })
        }
        updated++
        continue
      }

      // 5b. Création
      const docRaw: Record<string, unknown> = {
        title: v.title || `${v.brand} ${v.model}`.trim(),
        brand: v.brand,
        model: v.model,
        price: v.price || undefined,
        year: v.year || undefined,
        mileage: v.mileage ?? undefined,
        fuel: v.fuel || undefined,
        transmission: v.transmission || undefined,
        bodyType: v.bodyType || undefined,
        exteriorColor: v.exteriorColor || undefined,
        doors: v.doors || undefined,
        seats: v.seats || undefined,
        dealer: v.dealerName || undefined,
        dealerCity: v.dealerCity || undefined,
        originalListingUrl: canonicalUrl,
        sourceUrl: canonicalUrl,
        sourcePlatform: 'autoscout24.de',
        sourceListingId: extracted?.id,
        sourceListingIdMethod: extracted?.method,
        sourceKey,
        canonicalSourceUrl: canonicalUrl,
        status: 'draft',
        lastScrapedAt: dryRun ? undefined : new Date().toISOString(),
      }

      if (v.imageUrls?.length) {
        docRaw.imageUrls = v.imageUrls.map((url) => ({ url }))
      }

      // Ne jamais écrire undefined/null/'' pour les champs unique
      const doc = Object.fromEntries(
        Object.entries(docRaw).filter(
          ([, val]) => val !== undefined && val !== null && val !== '',
        ),
      )

      if (dryRun) {
        details.push({
          title: titleLabel,
          action: 'created',
          would: 'create',
        })
      } else {
        const newDoc = await payload.create({
          collection: 'vehicles',
          // eslint-disable-next-line
          data: doc as never,
        })
        details.push({
          title: titleLabel,
          action: 'created',
          id: String(newDoc.id),
        })
      }
      created++
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      details.push({
        title: titleLabel,
        action: 'error',
        reason: message,
      })
      errors++
    }
  }

  return Response.json({
    dryRun,
    summary: {
      total: vehicles.length,
      created,
      updated,
      skipped,
      errors,
    },
    details,
  })
}
