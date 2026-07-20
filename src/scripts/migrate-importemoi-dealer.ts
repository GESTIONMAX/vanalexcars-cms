/**
 * migrate-importemoi-dealer.ts
 *
 * Migration définitive : supprime l'anomalie de modélisation ImporteMoi
 * dans le champ `dealer` des véhicules.
 *
 * Contexte :
 *   ImporteMoi était une ancienne source scrapée. Certains véhicules ont été
 *   importés avec dealer = "ImporteMoi" ou une valeur dérivée. Ce n'est pas
 *   un nom de concessionnaire — c'est une erreur de modélisation historique.
 *
 * Ce que fait cette migration :
 *   - dealer → null  (le champ ne doit pas mentir)
 *   - sourcePlatform → 'importemoi.fr'  UNIQUEMENT si sourcePlatform est absent
 *     (ne jamais écraser 'autoscout24.de' ou toute autre provenance connue)
 *   - Tous les autres champs sont inchangés
 *
 * Idempotence :
 *   La migration peut être relancée sans effet si elle a déjà été appliquée.
 *   Un véhicule avec dealer = null ne matche pas le filtre.
 *
 * Usage :
 *   pnpm migrate:importemoi-dealer           → dry-run (aucune écriture)
 *   pnpm migrate:importemoi-dealer --apply   → applique les modifications
 *
 * Audit seul :
 *   pnpm migrate:importemoi-dealer --audit   → rapport sans suggestions de patch
 */

import { getPayload } from 'payload'
import config from '../payload.config.js'

// ── CLI args ──────────────────────────────────────────────────────────────────

const args = process.argv.slice(2)
const applyMode = args.includes('--apply')
const auditOnly = args.includes('--audit')

const MODE = auditOnly ? 'AUDIT' : applyMode ? 'APPLY' : 'DRY-RUN'

// ── Pattern de détection (legacy — supprimé du pipeline après cette migration) ─

const IMPORTEMOI_PATTERN = /importemoi/i

// ── Types ─────────────────────────────────────────────────────────────────────

interface VehicleDoc {
  id: string
  dealer?: string | null
  sourcePlatform?: string | null
  sourceListingId?: string | null
  originalListingUrl?: string | null
  sourceUrl?: string | null
  externalId?: string | null
  externalReference?: string | null
}

interface AffectedVehicle {
  id: string
  dealer: string
  sourcePlatform: string | null
  sourceListingId: string | null
  url: string | null
  patch: {
    dealer: null
    sourcePlatform?: string
  }
  platformOverwritten: boolean
}

interface AuditReport {
  mode: string
  totalScanned: number
  affectedByDealer: number
  affectedVehicles: AffectedVehicle[]
  withExternalId: number
  withExternalReference: number
  applied: number
  errors: number
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n[migrate-importemoi-dealer] Mode : ${MODE}`)
  console.log('─────────────────────────────────────────────────────')

  const payload = await getPayload({ config })

  // ── Étape 1 : Récupérer tous les véhicules (pagination) ───────────────────
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

  console.log(`[migrate-importemoi-dealer] ${allDocs.length} véhicule(s) analysé(s)`)

  // ── Étape 2 : Identifier les véhicules concernés ──────────────────────────
  const affected: AffectedVehicle[] = []

  for (const doc of allDocs) {
    if (!doc.dealer || !IMPORTEMOI_PATTERN.test(doc.dealer)) continue

    const hasPlatform = Boolean(doc.sourcePlatform && doc.sourcePlatform.trim() !== '')
    const patch: AffectedVehicle['patch'] = { dealer: null }

    // Ne renseigner sourcePlatform que si absent
    if (!hasPlatform) {
      patch.sourcePlatform = 'importemoi.fr'
    }

    affected.push({
      id: doc.id,
      dealer: doc.dealer,
      sourcePlatform: doc.sourcePlatform ?? null,
      sourceListingId: doc.sourceListingId ?? null,
      url: doc.originalListingUrl ?? doc.sourceUrl ?? null,
      patch,
      platformOverwritten: false, // on ne touche jamais à une plateforme existante
    })
  }

  // ── Étape 3 : Audit externalId / externalReference ───────────────────────
  const withExternalId = allDocs.filter(
    (d) => d.externalId && d.externalId.trim() !== '',
  ).length

  const withExternalReference = allDocs.filter(
    (d) => d.externalReference && d.externalReference.trim() !== '',
  ).length

  // ── Étape 4 : Rapport ─────────────────────────────────────────────────────
  console.log('\n=== AUDIT ===')
  console.log(`Véhicules scannés          : ${allDocs.length}`)
  console.log(`Dealer contenant ImporteMoi : ${affected.length}`)
  console.log(`externalId renseigné        : ${withExternalId}`)
  console.log(`externalReference renseigné : ${withExternalReference}`)

  if (affected.length === 0) {
    console.log('\n✅ Aucun véhicule à migrer. Base déjà propre.')
  } else {
    console.log('\nVéhicules concernés :')
    for (const v of affected) {
      console.log(`  id=${v.id}`)
      console.log(`    dealer actuel    : "${v.dealer}"`)
      console.log(`    sourcePlatform   : ${v.sourcePlatform ?? '(absent)'}`)
      console.log(`    sourceListingId  : ${v.sourceListingId ?? '(absent)'}`)
      console.log(`    url              : ${v.url ?? '(absent)'}`)
      console.log(`    patch prévu      : ${JSON.stringify(v.patch)}`)
      console.log(`    platform écrasée : ${v.platformOverwritten ? 'OUI ⚠️' : 'non'}`)
    }
  }

  if (auditOnly) {
    console.log('\n[migrate-importemoi-dealer] Mode AUDIT : aucune écriture.')
    process.exit(0)
  }

  if (!applyMode) {
    console.log(`\n[migrate-importemoi-dealer] DRY-RUN : ${affected.length} véhicule(s) seraient modifiés.`)
    console.log('Relancer avec --apply pour appliquer.')
    process.exit(0)
  }

  // ── Étape 5 : Application ─────────────────────────────────────────────────
  if (affected.length === 0) {
    console.log('\n[migrate-importemoi-dealer] Rien à appliquer.')
    process.exit(0)
  }

  console.log(`\n[migrate-importemoi-dealer] Application sur ${affected.length} véhicule(s)...`)
  let appliedCount = 0
  let errorCount = 0

  for (const v of affected) {
    try {
      await payload.update({
        collection: 'vehicles',
        id: v.id,
        data: v.patch,
      })
      console.log(`  ✅ ${v.id} — dealer="${v.dealer}" → null${v.patch.sourcePlatform ? ` + sourcePlatform="${v.patch.sourcePlatform}"` : ''}`)
      appliedCount++
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erreur inconnue'
      console.error(`  ❌ ${v.id} — ${msg}`)
      errorCount++
    }
  }

  // ── Étape 6 : Vérification post-migration ─────────────────────────────────
  console.log('\n[migrate-importemoi-dealer] Vérification post-migration...')
  const checkResult = await payload.find({
    collection: 'vehicles',
    where: { dealer: { contains: 'importemoi' } },
    limit: 10,
    depth: 0,
  })

  if (checkResult.docs.length > 0) {
    console.error(
      `  ⚠️  ${checkResult.docs.length} véhicule(s) ont encore dealer contenant "importemoi" — vérifier manuellement`,
    )
  } else {
    console.log('  ✅ Aucun véhicule avec dealer contenant "importemoi"')
  }

  const report: AuditReport = {
    mode: MODE,
    totalScanned: allDocs.length,
    affectedByDealer: affected.length,
    affectedVehicles: affected,
    withExternalId,
    withExternalReference,
    applied: appliedCount,
    errors: errorCount,
  }

  console.log('\n=== RAPPORT FINAL ===')
  console.log(JSON.stringify(report, null, 2))

  process.exit(errorCount > 0 ? 1 : 0)
}

main().catch((err) => {
  console.error('[migrate-importemoi-dealer] Erreur fatale :', err)
  process.exit(1)
})
