/**
 * backfill-source-keys.ts
 *
 * Backfill des champs de déduplication pour les véhicules existants.
 *
 * Algorithme en 2 passes :
 *   PASSE 1 : Analyse complète (aucune écriture)
 *     - Calcul canonicalUrl, sourceListingId, sourceKey pour chaque véhicule
 *     - Détection de collisions par sourceKey et par canonicalUrl
 *   PASSE 2 : Application (seulement si --apply ET aucune collision)
 *     - payload.update() pour chaque véhicule SANS collision
 *     - Les véhicules en collision restent intacts
 *
 * Usage :
 *   pnpm backfill:source-keys           → dry run
 *   pnpm backfill:source-keys --apply   → applique les mises à jour
 */

import { getPayload } from 'payload'
import config from '../payload.config.js'
import { canonicalizeUrl } from '../lib/canonicalizeUrl.js'
import { extractListingId } from '../lib/extractListingId.js'

// ── CLI args ──────────────────────────────────────────────────────────────────

const args = process.argv.slice(2)
const applyMode = args.includes('--apply')

// ── Types internes ────────────────────────────────────────────────────────────

interface VehicleDoc {
  id: string
  title?: string
  originalListingUrl?: string
  sourceKey?: string
  canonicalSourceUrl?: string
  sourceListingId?: string
  sourceListingIdMethod?: string
}

interface AnalyzedVehicle {
  id: string
  title: string
  originalListingUrl: string
  canonicalUrl: string | null
  sourceListingId: string | null
  sourceListingIdMethod: string | null
  sourceKey: string | null
}

interface CollisionEntry {
  key: string
  documents: Array<{ id: string; title: string; originalListingUrl: string }>
}

interface Report {
  analyzed: number
  collisions: {
    bySourceKey: CollisionEntry[]
    byCanonicalUrl: CollisionEntry[]
  }
  noUrl: number
  noIdExtracted: number
  wouldUpdate: number
  applied: number
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`[backfill-source-keys] Mode : ${applyMode ? 'APPLY' : 'DRY RUN'}`)

  const payload = await getPayload({ config })

  // Récupérer tous les véhicules (pagination par lots de 100)
  const allDocs: VehicleDoc[] = []
  let page = 1
  const pageSize = 100

  while (true) {
    const result = await payload.find({
      collection: 'vehicles',
      limit: pageSize,
      page,
      depth: 0,
    })
    allDocs.push(...(result.docs as unknown as VehicleDoc[]))
    if (!result.hasNextPage) break
    page++
  }

  console.log(`[backfill-source-keys] ${allDocs.length} véhicules récupérés`)

  // ── PASSE 1 : Analyse ────────────────────────────────────────────────────
  let noUrl = 0
  let noIdExtracted = 0
  const analyzed: AnalyzedVehicle[] = []

  for (const doc of allDocs) {
    if (!doc.originalListingUrl) {
      noUrl++
      continue
    }

    const canonicalUrl = canonicalizeUrl(doc.originalListingUrl)
    const extracted = extractListingId(doc.originalListingUrl)

    if (!extracted) {
      noIdExtracted++
    }

    analyzed.push({
      id: doc.id,
      title: doc.title ?? 'Sans titre',
      originalListingUrl: doc.originalListingUrl,
      canonicalUrl,
      sourceListingId: extracted?.id ?? null,
      sourceListingIdMethod: extracted?.method ?? null,
      sourceKey: extracted ? `autoscout24:${extracted.id}` : null,
    })
  }

  // Détecter les collisions par sourceKey
  const bySourceKey = new Map<string, AnalyzedVehicle[]>()
  for (const v of analyzed) {
    if (!v.sourceKey) continue
    const group = bySourceKey.get(v.sourceKey) ?? []
    group.push(v)
    bySourceKey.set(v.sourceKey, group)
  }

  const sourceKeyCollisions: CollisionEntry[] = []
  const collisionSourceKeys = new Set<string>()
  for (const [key, group] of bySourceKey) {
    if (group.length > 1) {
      sourceKeyCollisions.push({
        key,
        documents: group.map((v) => ({
          id: v.id,
          title: v.title,
          originalListingUrl: v.originalListingUrl,
        })),
      })
      collisionSourceKeys.add(key)
    }
  }

  // Détecter les collisions par canonicalUrl
  const byCanonicalUrl = new Map<string, AnalyzedVehicle[]>()
  for (const v of analyzed) {
    if (!v.canonicalUrl) continue
    const group = byCanonicalUrl.get(v.canonicalUrl) ?? []
    group.push(v)
    byCanonicalUrl.set(v.canonicalUrl, group)
  }

  const canonicalUrlCollisions: CollisionEntry[] = []
  const collisionCanonicalUrls = new Set<string>()
  for (const [url, group] of byCanonicalUrl) {
    if (group.length > 1) {
      canonicalUrlCollisions.push({
        key: url,
        documents: group.map((v) => ({
          id: v.id,
          title: v.title,
          originalListingUrl: v.originalListingUrl,
        })),
      })
      collisionCanonicalUrls.add(url)
    }
  }

  // Véhicules sans collision → éligibles à la mise à jour
  const eligible = analyzed.filter((v) => {
    if (v.sourceKey && collisionSourceKeys.has(v.sourceKey)) return false
    if (v.canonicalUrl && collisionCanonicalUrls.has(v.canonicalUrl)) return false
    return true
  })

  const wouldUpdate = eligible.length
  const totalCollisions = sourceKeyCollisions.length + canonicalUrlCollisions.length

  const report: Report = {
    analyzed: allDocs.length,
    collisions: {
      bySourceKey: sourceKeyCollisions,
      byCanonicalUrl: canonicalUrlCollisions,
    },
    noUrl,
    noIdExtracted,
    wouldUpdate,
    applied: 0,
  }

  // ── PASSE 2 : Application ────────────────────────────────────────────────
  if (applyMode) {
    if (totalCollisions > 0) {
      console.warn(
        `[backfill-source-keys] ATTENTION : ${totalCollisions} collision(s) détectée(s). ` +
        `Application bloquée. Résolvez les collisions manuellement avant de relancer avec --apply.`,
      )
    } else {
      console.log(
        `[backfill-source-keys] Aucune collision. Application de ${wouldUpdate} mise(s) à jour...`,
      )
      let appliedCount = 0
      for (const v of eligible) {
        const patch: Record<string, unknown> = {}

        if (v.sourceListingId) patch.sourceListingId = v.sourceListingId
        if (v.sourceListingIdMethod) patch.sourceListingIdMethod = v.sourceListingIdMethod
        if (v.sourceKey) patch.sourceKey = v.sourceKey
        if (v.canonicalUrl) patch.canonicalSourceUrl = v.canonicalUrl

        if (Object.keys(patch).length === 0) continue

        try {
          await payload.update({
            collection: 'vehicles',
            id: v.id,
            data: patch,
          })
          appliedCount++
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : 'Unknown error'
          console.error(
            `[backfill-source-keys] Erreur update véhicule ${v.id}: ${message}`,
          )
        }
      }
      report.applied = appliedCount
      console.log(`[backfill-source-keys] ${appliedCount} véhicule(s) mis à jour.`)
    }
  } else {
    console.log(
      `[backfill-source-keys] DRY RUN : ${wouldUpdate} véhicule(s) seraient mis à jour. ` +
      `Relancer avec --apply pour appliquer.`,
    )
  }

  // ── Rapport ──────────────────────────────────────────────────────────────
  console.log('\n=== RAPPORT BACKFILL SOURCE KEYS ===')
  console.log(JSON.stringify(report, null, 2))

  process.exit(0)
}

main().catch((err) => {
  console.error('[backfill-source-keys] Erreur fatale:', err)
  process.exit(1)
})
