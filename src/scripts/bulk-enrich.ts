/**
 * bulk-enrich.ts
 *
 * Enrichissement en masse des fiches véhicules AutoScout24.
 * Pour chaque véhicule actif avec `originalListingUrl`, visite la fiche
 * individuelle AS24 via Playwright et récupère images + données texte.
 *
 * Résultats possibles par véhicule (C4) :
 *   listing_removed → status=inactive, sourceInactiveAt, sourceInactiveReason, enrichmentStatus=completed
 *   temporary_error → enrichmentStatus=failed, statut métier inchangé
 *   success         → patch partiel sans écrasement des champs existants
 *
 * Flags :
 *   --dry-run          Aucune écriture en base, affiche seulement ce qui serait fait
 *   --limit N          Traiter au maximum N véhicules (défaut : 200)
 *   --min-images N     Traiter seulement les véhicules avec < N images (défaut : 5)
 *   --delay-ms N       Délai entre deux véhicules en ms (défaut : 8000)
 *
 * Usage :
 *   node --no-deprecation --import tsx/esm /app/src/scripts/bulk-enrich.ts
 *   node --no-deprecation --import tsx/esm /app/src/scripts/bulk-enrich.ts --dry-run --limit 10
 */

import { getPayload } from 'payload'
import config from '../payload.config.js'
import { enrichAs24Listing } from '../lib/enrichAs24Listing.js'
import {
  buildEnrichmentSuccessPatch,
  buildListingRemovedPatch,
  buildTemporaryErrorPatch,
} from '../lib/buildEnrichmentPatch.js'

// ── Paramètres CLI ────────────────────────────────────────────────────────────

const args = process.argv.slice(2)
const DRY_RUN = args.includes('--dry-run') || args.includes('--dry')
const LIMIT = parseInt(args[args.indexOf('--limit') + 1] ?? '200', 10) || 200
const MIN_IMAGES = parseInt(args[args.indexOf('--min-images') + 1] ?? '5', 10) || 5
const DELAY_MS = parseInt(args[args.indexOf('--delay-ms') + 1] ?? '8000', 10) || 8000

// ── Helpers ───────────────────────────────────────────────────────────────────

function log(msg: string) {
  console.log(`[bulk-enrich] ${msg}`)
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  log(`Mode       : ${DRY_RUN ? 'DRY-RUN (aucune écriture)' : 'LIVE'}`)
  log(`Limite     : ${LIMIT} véhicules`)
  log(`Min images : < ${MIN_IMAGES} images dans la fiche`)
  log(`Délai      : ${DELAY_MS} ms entre chaque`)
  log('─────────────────────────────────────')

  const payload = await getPayload({ config })

  // Récupérer les véhicules actifs avec originalListingUrl
  const { docs: vehicles } = await payload.find({
    collection: 'vehicles',
    where: {
      and: [
        { status: { equals: 'active' } },
        { originalListingUrl: { exists: true } },
        { originalListingUrl: { not_equals: '' } },
      ],
    },
    limit: 500,
    pagination: false,
  })

  // Filtrer ceux qui ont moins de MIN_IMAGES images
  const toEnrich = vehicles
    .filter((v) => (v.imageUrls?.length ?? 0) < MIN_IMAGES)
    .slice(0, LIMIT)

  log(`${vehicles.length} véhicules actifs avec URL AS24`)
  log(`${toEnrich.length} à enrichir (< ${MIN_IMAGES} images) — max ${LIMIT}`)
  log('─────────────────────────────────────\n')

  const stats = {
    enriched: 0,
    skipped: 0,
    errors: 0,
    removed: 0,
    totalNewImages: 0,
  }

  for (let i = 0; i < toEnrich.length; i++) {
    const vehicle = toEnrich[i]
    const prefix = `[${i + 1}/${toEnrich.length}] ${vehicle.title}`

    log(`${prefix}`)
    log(`  URL      : ${vehicle.originalListingUrl}`)
    log(`  Images   : ${vehicle.imageUrls?.length ?? 0} actuellement`)

    try {
      const result = await enrichAs24Listing(vehicle.originalListingUrl as string)

      // ── listing_removed : annonce définitivement supprimée ────────────────
      if (result.kind === 'listing_removed') {
        const removedPatch = buildListingRemovedPatch(result)
        if (!DRY_RUN) {
          await payload.update({ collection: 'vehicles', id: vehicle.id, data: removedPatch })
        }
        log(`  🗑️  ${DRY_RUN ? '[DRY] ' : ''}Annonce supprimée (HTTP ${result.httpStatus}) → véhicule inactivé`)
        stats.removed++
        if (i < toEnrich.length - 1) await sleep(DELAY_MS)
        continue
      }

      // ── temporary_error : erreur transitoire ──────────────────────────────
      if (result.kind === 'temporary_error') {
        const errorPatch = buildTemporaryErrorPatch(result)
        if (!DRY_RUN) {
          await payload.update({ collection: 'vehicles', id: vehicle.id, data: errorPatch })
        }
        log(`  ⚠️  ${DRY_RUN ? '[DRY] ' : ''}Erreur temporaire [${result.code}] : ${result.message}`)
        stats.errors++
        if (i < toEnrich.length - 1) await sleep(DELAY_MS)
        continue
      }

      // ── success ────────────────────────────────────────────────────────────
      log(`  Trouvées : ${result.imageUrls.length} images`)

      const { patch, appliedFields, noop } = buildEnrichmentSuccessPatch(result, vehicle as Parameters<typeof buildEnrichmentSuccessPatch>[1])
      const currentImageCount = vehicle.imageUrls?.length ?? 0
      const newImages = result.imageUrls.length - currentImageCount

      if (noop) {
        log(`  ✅ Rien à enrichir (déjà complet)`)
        stats.skipped++
      } else {
        if (!DRY_RUN) {
          patch.enrichmentStatus = 'completed'
          patch.enrichmentCompletedAt = new Date().toISOString()
          await payload.update({ collection: 'vehicles', id: vehicle.id, data: patch })
        }
        log(`  ✅ ${DRY_RUN ? '[DRY] ' : ''}Enrichi : +${Math.max(0, newImages)} images | ${appliedFields.join(', ')}`)
        stats.enriched++
        stats.totalNewImages += Math.max(0, newImages)
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erreur inconnue'
      log(`  ❌ Erreur : ${msg}`)
      stats.errors++
    }

    log('')
    if (i < toEnrich.length - 1) await sleep(DELAY_MS)
  }

  log('─────────────────────────────────────')
  log(`✅ Enrichis      : ${stats.enriched}`)
  log(`🗑️  Inactivés     : ${stats.removed}`)
  log(`⏭️  Ignorés       : ${stats.skipped}`)
  log(`❌ Erreurs       : ${stats.errors}`)
  log(`📸 Nouvelles images : ${stats.totalNewImages}`)
  log(`Mode : ${DRY_RUN ? "DRY-RUN — rien n'a été modifié" : 'LIVE — base de données mise à jour'}`)

  process.exit(0)
}

main().catch((err) => {
  console.error('[bulk-enrich] Erreur fatale :', err)
  process.exit(1)
})
