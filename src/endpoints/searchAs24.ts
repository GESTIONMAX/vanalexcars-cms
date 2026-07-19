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
import { searchAs24Vehicles } from '@/lib/searchAs24Vehicles'

// Re-export du type pour la compatibilité avec les consommateurs existants
export type { AS24ScrapedVehicle } from '@/lib/searchAs24Vehicles'

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

  try {
    const vehicles = await searchAs24Vehicles(searchUrl)
    return Response.json({ success: true, vehicles, total: vehicles.length })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Scraping failed'
    return Response.json({ error: message }, { status: 502 })
  }
}
