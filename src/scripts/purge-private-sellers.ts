/**
 * purge-private-sellers.ts
 *
 * Supprime (ou audite) les véhicules dont le champ `dealer` identifie
 * un vendeur particulier (Particulier, Privat, Privatverkauf, Privé…).
 *
 * La détection repose sur les mêmes PRIVATE_SELLER_PATTERNS que normalizeDealer.
 * Seul ce critère est appliqué : dealer absent ou placeholder → non touché.
 *
 * Modes :
 *   --audit     (défaut) Affiche les véhicules concernés, aucune modification
 *   --dry-run   Alias de --audit
 *   --apply     Supprime définitivement les véhicules identifiés
 *
 * Usage :
 *   node --no-deprecation --import tsx/esm src/scripts/purge-private-sellers.ts
 *   node --no-deprecation --import tsx/esm src/scripts/purge-private-sellers.ts --apply
 */

import { getPayload } from 'payload'
import config from '../payload.config.js'

// ── Patterns identiques à normalizeDealer.ts ─────────────────────────────────

const PRIVATE_SELLER_PATTERNS: RegExp[] = [
  /^particulier$/i,
  /^privat(verkauf)?$/i,
  /^privé$/i,
  /^private(\s+seller)?$/i,
  /^vendeur\s+particulier$/i,
  /^privatperson$/i,
  /^privado$/i,
  /^privato$/i,
]

function isPrivateSeller(dealer: string): boolean {
  return PRIVATE_SELLER_PATTERNS.some((p) => p.test(dealer.trim()))
}

// ── CLI ───────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2)
const APPLY = args.includes('--apply')
const mode = APPLY ? 'APPLY' : 'AUDIT'

function log(msg: string) {
  console.log(`[purge-private-sellers] ${msg}`)
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  log(`Mode : ${mode}${APPLY ? ' ⚠️  SUPPRESSION DÉFINITIVE' : ' (lecture seule)'}`)
  log('─────────────────────────────────────')

  const payload = await getPayload({ config })

  // Récupérer TOUS les véhicules (avec dealer renseigné pour trier côté JS)
  // On filtre côté JS car Payload ne supporte pas de regex en where clause
  const { docs: allVehicles, totalDocs } = await payload.find({
    collection: 'vehicles',
    where: {
      and: [
        { dealer: { exists: true } },
        { dealer: { not_equals: '' } },
      ],
    },
    limit: 10000,
    pagination: false,
    depth: 0,
  })

  log(`${totalDocs} véhicules avec dealer renseigné`)

  // Classifier
  const toDelete = allVehicles.filter((v) => {
    const dealer = typeof v.dealer === 'string' ? v.dealer : ''
    return dealer !== '' && isPrivateSeller(dealer)
  })

  log(`${toDelete.length} véhicule(s) avec dealer particulier détecté`)
  log('─────────────────────────────────────')

  if (toDelete.length === 0) {
    log('✅ Aucun véhicule à supprimer — base déjà propre.')
    process.exit(0)
  }

  // Grouper par valeur de dealer pour le rapport
  const byDealer = new Map<string, typeof toDelete>()
  for (const v of toDelete) {
    const dealer = String(v.dealer)
    if (!byDealer.has(dealer)) byDealer.set(dealer, [])
    byDealer.get(dealer)!.push(v)
  }

  log('Répartition par valeur de dealer :')
  for (const [dealer, vehicles] of byDealer.entries()) {
    log(`  "${dealer}" → ${vehicles.length} véhicule(s)`)
  }
  log('─────────────────────────────────────')

  log('Détail des véhicules concernés :')
  for (const v of toDelete) {
    log(`  [${v.id}] ${v.title ?? '(sans titre)'}`)
    log(`    dealer       : ${v.dealer}`)
    log(`    status       : ${v.status}`)
    log(`    sourceUrl    : ${v.sourceUrl ?? v.originalListingUrl ?? '—'}`)
  }
  log('─────────────────────────────────────')

  if (!APPLY) {
    log(`ℹ️  Mode AUDIT — aucune modification effectuée.`)
    log(`   Relancez avec --apply pour supprimer ces ${toDelete.length} véhicule(s).`)
    process.exit(0)
  }

  // ── Suppression ───────────────────────────────────────────────────────────
  log(`⚠️  Suppression de ${toDelete.length} véhicule(s)…`)

  let deleted = 0
  let errors = 0

  for (const v of toDelete) {
    try {
      await payload.delete({ collection: 'vehicles', id: v.id })
      log(`  ✅ Supprimé : [${v.id}] ${v.title ?? '(sans titre)'}`)
      deleted++
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      log(`  ❌ Erreur [${v.id}] : ${msg}`)
      errors++
    }
  }

  log('─────────────────────────────────────')
  log(`✅ Supprimés : ${deleted}`)
  log(`❌ Erreurs   : ${errors}`)

  process.exit(errors > 0 ? 1 : 0)
}

main().catch((err) => {
  console.error('[purge-private-sellers] Erreur fatale :', err)
  process.exit(1)
})
