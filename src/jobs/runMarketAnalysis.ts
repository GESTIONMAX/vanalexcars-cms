/**
 * runMarketAnalysis.ts
 *
 * Tâche Payload CMS : run-market-analysis
 * Input : { studyId: string }
 *
 * Étapes :
 *   1. Charger l'étude
 *   2. Vérifier absence de run concurrent
 *   3. Mettre à jour statut → running
 *   4. Charger SimulatorConfig
 *   5. Collecter annonces DE (internes + AS24 DE)
 *   6. Collecter annonces FR (AS24 FR)
 *   7. Normaliser toutes les annonces
 *   8. Upsert dans market-listings (avec dédup)
 *   9. Marquer absentes → removed
 *  10. Calculer scores de matching
 *  11. Filtrer pour les statistiques
 *  12. Calculer statistiques DE et FR
 *  13. Calculer coûts d'import depuis SimulatorConfig
 *  14. Calculer score d'opportunité
 *  15. Calculer tendance (3 derniers snapshots)
 *  16. Créer snapshot + items
 *  17. Mettre à jour étude → completed, nextRunAt
 *
 * En cas d'erreur : lastRunStatus=failed, lastRunError=message
 */

import type { TaskConfig } from 'payload'
import { normalizeListing } from '@/services/market-analysis/normalizeListing'
import { calculateMatchingScore } from '@/services/market-analysis/calculateMatchingScore'
import { calculateMarketStatistics } from '@/services/market-analysis/calculateMarketStatistics'
import { calculateImportCosts } from '@/services/market-analysis/calculateImportCosts'
import { calculateOpportunityScore } from '@/services/market-analysis/calculateOpportunityScore'
import { calculateTrend } from '@/services/market-analysis/calculateTrend'
import { upsertMarketListings } from '@/services/market-analysis/upsertMarketListings'
import { createMarketSnapshot } from '@/services/market-analysis/createMarketSnapshot'
import { fetchInternalVehicles } from '@/services/market-analysis/providers/internal-vehicles'
import { fetchAs24DeListings } from '@/services/market-analysis/providers/autoscout24-de'
import { fetchAs24FrListings } from '@/services/market-analysis/providers/autoscout24-fr'
import type { MarketStudy, NormalizedListing, SnapshotTrendContext, SimulatorConfigParams } from '@/services/market-analysis/types'
import { asUntypedPayload } from '@/services/market-analysis/payloadAdapter'

// Identifiant de version de l'algorithme
const CALCULATION_VERSION = '1.0.0'

// ── Type IO de la tâche ───────────────────────────────────────────────────────

type TaskInputOutput = { input: object; output: object }

type RunMarketAnalysisIO = TaskInputOutput & {
  input: { studyId: string }
  output: {
    snapshotId: string
    countDE: number
    countFR: number
    opportunityScore: number
    opportunityLabel: string
    estimatedCustomerSaving: number
    durationMs: number
  }
}

// ── Helpers de planification ──────────────────────────────────────────────────

function calculateNextRunAt(schedule: string, from: Date): Date {
  const next = new Date(from)
  switch (schedule) {
    case 'daily':
      next.setDate(next.getDate() + 1)
      break
    case 'weekly':
      next.setDate(next.getDate() + 7)
      break
    case 'monthly':
      next.setMonth(next.getMonth() + 1)
      break
    default:
      // manual ou inconnu : pas de nextRunAt — mettre très loin
      next.setFullYear(9999)
  }
  return next
}

// ── Tâche principale ──────────────────────────────────────────────────────────

export const runMarketAnalysisTask: TaskConfig<RunMarketAnalysisIO> = {
  slug: 'run-market-analysis',
  label: 'Run Market Analysis',
  inputSchema: [
    { name: 'studyId', type: 'text', required: true },
  ],
  outputSchema: [
    { name: 'snapshotId', type: 'text' },
    { name: 'countDE', type: 'number' },
    { name: 'countFR', type: 'number' },
    { name: 'opportunityScore', type: 'number' },
    { name: 'opportunityLabel', type: 'text' },
    { name: 'estimatedCustomerSaving', type: 'number' },
    { name: 'durationMs', type: 'number' },
  ],
  handler: async ({ input, req }) => {
    const { payload } = req
    const db = asUntypedPayload(payload)
    const { studyId } = input
    const startedAt = new Date()

    // ── 1. Charger l'étude ─────────────────────────────────────────────────
    let studyDoc: Record<string, unknown>
    try {
      studyDoc = await db.findByID({
        collection: 'market-studies',
        id: studyId,
      })
    } catch {
      throw new Error(`Study ${studyId} not found`)
    }

    const study: MarketStudy = studyDoc as unknown as MarketStudy

    // ── 2. Vérifier l'absence de run concurrent ────────────────────────────
    if (study.lastRunStatus === 'running') {
      throw new Error(`Study ${studyId} is already running`)
    }

    // ── 3. Mettre à jour → running ─────────────────────────────────────────
    await db.update({
      collection: 'market-studies',
      id: studyId,
      data: { lastRunStatus: 'running' },
    })

    try {
      // ── 4. Charger SimulatorConfig ────────────────────────────────────────
      const simulatorConfigDoc = await db.findGlobal({ slug: 'simulator-config' })
      const simulatorConfig = simulatorConfigDoc as SimulatorConfigParams

      // ── 5. Collecter annonces DE ──────────────────────────────────────────
      const rawListingsDE: Array<{ listing: ReturnType<typeof normalizeListing> & { vehicleId?: string }; vehicleId?: string }> = []

      // Véhicules internes
      if (!study.sourcesDE || study.sourcesDE.length === 0 || study.sourcesDE.includes('internal_vehicles')) {
        try {
          const { listings: internalListings } = await fetchInternalVehicles(payload, study)
          for (const l of internalListings) {
            const normalized = normalizeListing(l)
            rawListingsDE.push({ listing: { ...normalized, vehicleId: l.vehicleId }, vehicleId: l.vehicleId })
          }
        } catch (err: unknown) {
          payload.logger.warn(`[runMarketAnalysis] Internal vehicles fetch failed: ${err instanceof Error ? err.message : String(err)}`)
        }
      }

      // AS24 DE
      if (study.sourcesDE?.includes('autoscout24_de')) {
        try {
          const as24DeListings = await fetchAs24DeListings(study)
          for (const l of as24DeListings) {
            const normalized = normalizeListing(l)
            rawListingsDE.push({ listing: normalized })
          }
        } catch (err: unknown) {
          payload.logger.warn(`[runMarketAnalysis] AS24 DE fetch failed: ${err instanceof Error ? err.message : String(err)}`)
        }
      }

      // ── 6. Collecter annonces FR ──────────────────────────────────────────
      const rawListingsFR: Array<{ listing: ReturnType<typeof normalizeListing> }> = []

      if (study.sourcesFR?.includes('autoscout24_fr')) {
        try {
          const as24FrListings = await fetchAs24FrListings(study)
          for (const l of as24FrListings) {
            const normalized = normalizeListing(l)
            rawListingsFR.push({ listing: normalized })
          }
        } catch (err: unknown) {
          payload.logger.warn(`[runMarketAnalysis] AS24 FR fetch failed: ${err instanceof Error ? err.message : String(err)}`)
        }
      }

      // ── 7 & 8. Upsert dans market-listings ──────────────────────────────
      const runStartedAt = startedAt

      // Upsert DE — internal_vehicle
      const internalListings = rawListingsDE
        .filter((r) => r.vehicleId)
        .map((r) => r.listing as NormalizedListing)

      if (internalListings.length > 0) {
        await upsertMarketListings({
          payload,
          studyId,
          side: 'germany',
          source: 'internal_vehicle',
          listings: internalListings,
          runStartedAt,
        })
      }

      // Upsert DE — autoscout24_de
      const as24DeNormalized = rawListingsDE
        .filter((r) => !r.vehicleId)
        .map((r) => r.listing as NormalizedListing)

      if (as24DeNormalized.length > 0) {
        await upsertMarketListings({
          payload,
          studyId,
          side: 'germany',
          source: 'autoscout24_de',
          listings: as24DeNormalized,
          runStartedAt,
        })
      }

      // Upsert FR — autoscout24_fr
      const as24FrNormalized = rawListingsFR.map((r) => r.listing as NormalizedListing)
      if (as24FrNormalized.length > 0) {
        await upsertMarketListings({
          payload,
          studyId,
          side: 'france',
          source: 'autoscout24_fr',
          listings: as24FrNormalized,
          runStartedAt,
        })
      }

      // ── 10. Calculer scores de matching ──────────────────────────────────
      type ScoredListing = NormalizedListing & {
        listingId?: string
        matchingScore: number
        included: boolean
        exclusionReason?: string
      }

      const MINIMUM_MATCHING_SCORE = 30

      const scoredDE: ScoredListing[] = rawListingsDE.map((r) => {
        const listing = r.listing as NormalizedListing
        const { normalizedScore } = calculateMatchingScore(listing, study)
        const included = normalizedScore >= MINIMUM_MATCHING_SCORE
        return {
          ...listing,
          vehicleId: r.vehicleId,
          listingId: undefined,
          matchingScore: normalizedScore,
          included,
          exclusionReason: included ? undefined : `Matching score too low: ${normalizedScore}`,
        }
      })

      const scoredFR: ScoredListing[] = rawListingsFR.map((r) => {
        const listing = r.listing as NormalizedListing
        const { normalizedScore } = calculateMatchingScore(listing, study)
        const included = normalizedScore >= MINIMUM_MATCHING_SCORE
        return {
          ...listing,
          listingId: undefined,
          matchingScore: normalizedScore,
          included,
          exclusionReason: included ? undefined : `Matching score too low: ${normalizedScore}`,
        }
      })

      // ── 11. Filtrer pour les statistiques ────────────────────────────────
      const includedDE = scoredDE.filter((l) => l.included)
      const includedFR = scoredFR.filter((l) => l.included)

      // ── 12. Calculer statistiques ─────────────────────────────────────────
      const statsDE = calculateMarketStatistics(includedDE)
      const statsFR = calculateMarketStatistics(includedFR)

      // ── 13. Calculer coûts d'import ───────────────────────────────────────
      const importCosts = calculateImportCosts({
        simulatorConfig,
        medianPriceDE: statsDE.median,
        importCostOverride: study.importCostOverride,
      })

      // ── 14. Calculer score d'opportunité ──────────────────────────────────
      const medianLandedCostFrance = statsDE.median + importCosts.totalImportCostEstimate
      const estimatedCustomerSaving = statsFR.median - medianLandedCostFrance

      // Charger snapshots précédents pour tendance et liquidité
      const previousSnapshotsResult = await db.find({
        collection: 'market-snapshots',
        where: { study: { equals: studyId } },
        sort: '-createdAt',
        limit: 3,
      })
      const previousSnapshots: SnapshotTrendContext[] = previousSnapshotsResult.docs.map((s: Record<string, unknown>) => ({
        estimatedCustomerSaving: (s.estimatedCustomerSaving as number) ?? 0,
        opportunityScore: (s.opportunityScore as number) ?? 0,
      }))

      // Calculer métriques de liquidité FR depuis le snapshot précédent
      const lastSnapshot = previousSnapshotsResult.docs[0] as Record<string, unknown> | undefined
      const removedSincePrevious = lastSnapshot
        ? (lastSnapshot.removedSincePreviousRunFR as number | undefined) ?? 0
        : 0

      const frenchLiquidity = {
        medianDaysOnMarket: lastSnapshot
          ? (lastSnapshot.medianDaysOnMarketFR as number | undefined)
          : undefined,
        turnoverRate: lastSnapshot
          ? (lastSnapshot.turnoverRate30dFR as number | undefined)
          : undefined,
        removedSincePrevious,
        totalFR: statsFR.count,
      }

      // Score moyen de matching
      const allScored = [...scoredDE, ...scoredFR]
      const averageMatchingScore =
        allScored.length > 0
          ? allScored.reduce((sum, l) => sum + l.matchingScore, 0) / allScored.length
          : 0

      const opportunity = calculateOpportunityScore({
        estimatedCustomerSaving,
        countDE: statsDE.count,
        countFR: statsFR.count,
        averageMatchingScore,
        frenchLiquidity,
        previousSnapshots,
      })

      // ── 15. Calculer tendance ─────────────────────────────────────────────
      const trendResult = calculateTrend({
        currentSaving: estimatedCustomerSaving,
        currentOpportunityScore: opportunity.score,
        previousSnapshots,
      })

      // ── 16. Créer snapshot + items ────────────────────────────────────────
      const runId = `${studyId}-${Date.now()}`
      const durationMs = Date.now() - startedAt.getTime()

      const snapshotId = await createMarketSnapshot({
        payload,
        studyId,
        runId,
        listingsDE: scoredDE,
        listingsFR: scoredFR,
        statsDE,
        statsFR,
        importCosts,
        opportunity,
        trend: trendResult,
        medianLandedCostFrance,
        estimatedCustomerSaving,
        liquidityFR: {
          averageDaysOnMarket: undefined,
          medianDaysOnMarket: undefined,
          removedSincePreviousRun: removedSincePrevious,
          turnoverRate30d: frenchLiquidity.turnoverRate,
          priceDropRate: undefined,
        },
        matchingQualityScore: Math.round(averageMatchingScore),
        durationMs,
      })

      // ── 17. Mettre à jour l'étude → completed ────────────────────────────
      const now = new Date()
      const nextRunAt = study.schedule && study.schedule !== 'manual'
        ? calculateNextRunAt(study.schedule, now)
        : undefined

      await db.update({
        collection: 'market-studies',
        id: studyId,
        data: {
          lastRunStatus: 'completed',
          lastRunAt: now.toISOString(),
          lastSuccessfulRunAt: now.toISOString(),
          lastRunError: null,
          ...(nextRunAt ? { nextRunAt: nextRunAt.toISOString() } : {}),
        },
      })

      payload.logger.info(
        `[runMarketAnalysis] Study ${studyId} completed. DE:${statsDE.count} FR:${statsFR.count} score:${opportunity.score} saving:${estimatedCustomerSaving}`,
      )

      return {
        output: {
          snapshotId,
          countDE: statsDE.count,
          countFR: statsFR.count,
          opportunityScore: opportunity.score,
          opportunityLabel: opportunity.label,
          estimatedCustomerSaving,
          durationMs,
        },
      }
    } catch (err: unknown) {
      // ── Gestion d'erreur globale ──────────────────────────────────────────
      const errorMessage = err instanceof Error ? err.message : String(err)
      payload.logger.error(`[runMarketAnalysis] Study ${studyId} failed: ${errorMessage}`)

      try {
        await db.update({
          collection: 'market-studies',
          id: studyId,
          data: {
            lastRunStatus: 'failed',
            lastRunAt: new Date().toISOString(),
            lastRunError: errorMessage,
          },
        })
      } catch {
        // Ignorer les erreurs lors de la mise à jour du statut d'erreur
      }

      throw err
    }
  },
}
