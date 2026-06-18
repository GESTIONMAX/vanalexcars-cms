/**
 * sync-as24-status.ts
 *
 * Vérifie la disponibilité de chaque annonce AutoScout24 en appelant
 * l'originalListingUrl des véhicules actifs et met à jour leur statut.
 *
 * Règles :
 *   HTTP 200        → reste actif, remet syncErrorCount à 0
 *   HTTP 404 / 410  → inactive immédiatement
 *   Timeout / réseau / 5xx → incrémente syncErrorCount + syncErrorSince
 *   ≥ 3 erreurs ET ≥ 3 jours depuis syncErrorSince → to_review
 *
 * Usage :
 *   pnpm sync:as24-status          # run complet
 *   pnpm sync:as24-status:dry      # dry-run (aucune écriture en base)
 */

import { getPayload } from 'payload'
import config from '../payload.config.js'

const DRY_RUN = process.argv.includes('--dry-run') || process.argv.includes('--dry')
const MAX_ERRORS = 3
const MAX_ERROR_DAYS = 3
const REQUEST_TIMEOUT_MS = 10_000
const DELAY_BETWEEN_REQUESTS_MS = 1_500

// ─── Helpers ────────────────────────────────────────────────────────────────

function log(msg: string) {
  console.log(`[sync-as24] ${msg}`)
}

function daysBetween(dateStr: string, now: Date): number {
  return (now.getTime() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24)
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function checkUrl(url: string): Promise<'ok' | 'gone' | 'error'> {
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

    const res = await fetch(url, {
      method: 'HEAD',
      signal: controller.signal,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (compatible; VanalexCarsBot/1.0; +https://vanalexcars.fr)',
      },
      redirect: 'follow',
    })
    clearTimeout(timeout)

    if (res.status === 200) return 'ok'
    if (res.status === 404 || res.status === 410) return 'gone'
    // 5xx ou autre → erreur transitoire
    return 'error'
  } catch {
    // Timeout, réseau, DNS → erreur transitoire
    return 'error'
  }
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  log(`Mode : ${DRY_RUN ? 'DRY-RUN (aucune écriture)' : 'LIVE'}`)

  const payload = await getPayload({ config })

  // Récupérer tous les véhicules actifs avec une URL AS24
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

  log(`${vehicles.length} véhicule(s) actif(s) à vérifier.`)

  const now = new Date()
  const stats = { ok: 0, gone: 0, toReview: 0, errorIncr: 0, skipped: 0 }

  for (const vehicle of vehicles) {
    const url = vehicle.originalListingUrl
    if (!url) {
      stats.skipped++
      continue
    }

    const result = await checkUrl(url)
    const currentErrorCount = vehicle.syncErrorCount ?? 0
    const currentErrorSince = vehicle.syncErrorSince as string | null | undefined

    if (result === 'ok') {
      log(`✅ [${vehicle.id}] ${vehicle.title} — OK`)
      stats.ok++

      if (!DRY_RUN && (currentErrorCount > 0 || vehicle.status !== 'active')) {
        await payload.update({
          collection: 'vehicles',
          id: vehicle.id,
          data: { syncErrorCount: 0, syncErrorSince: null },
        })
      }
    } else if (result === 'gone') {
      log(`🚫 [${vehicle.id}] ${vehicle.title} — 404/410 → inactive`)
      stats.gone++

      if (!DRY_RUN) {
        await payload.update({
          collection: 'vehicles',
          id: vehicle.id,
          data: { status: 'inactive', syncErrorCount: 0, syncErrorSince: null },
        })
      }
    } else {
      // Erreur transitoire
      const newErrorCount = currentErrorCount + 1
      const newErrorSince = currentErrorSince ?? now.toISOString()
      const daysInError = currentErrorSince ? daysBetween(currentErrorSince, now) : 0

      if (newErrorCount >= MAX_ERRORS && daysInError >= MAX_ERROR_DAYS) {
        log(
          `⚠️  [${vehicle.id}] ${vehicle.title} — ${newErrorCount} erreurs depuis ${Math.round(daysInError)}j → to_review`,
        )
        stats.toReview++

        if (!DRY_RUN) {
          await payload.update({
            collection: 'vehicles',
            id: vehicle.id,
            data: {
              status: 'to_review',
              syncErrorCount: newErrorCount,
              syncErrorSince: newErrorSince,
            },
          })
        }
      } else {
        log(
          `🔄 [${vehicle.id}] ${vehicle.title} — erreur réseau/timeout (${newErrorCount}/${MAX_ERRORS})`,
        )
        stats.errorIncr++

        if (!DRY_RUN) {
          await payload.update({
            collection: 'vehicles',
            id: vehicle.id,
            data: { syncErrorCount: newErrorCount, syncErrorSince: newErrorSince },
          })
        }
      }
    }

    await sleep(DELAY_BETWEEN_REQUESTS_MS)
  }

  log('─────────────────────────────────────')
  log(`✅ OK          : ${stats.ok}`)
  log(`🚫 Inactive    : ${stats.gone}`)
  log(`⚠️  To review   : ${stats.toReview}`)
  log(`🔄 Erreur +1   : ${stats.errorIncr}`)
  log(`⏭️  Ignorés     : ${stats.skipped}`)
  log(`Mode : ${DRY_RUN ? 'DRY-RUN — rien n\'a été modifié' : 'LIVE — base de données mise à jour'}`)

  process.exit(0)
}

main().catch((err) => {
  console.error('[sync-as24] Erreur fatale :', err)
  process.exit(1)
})
