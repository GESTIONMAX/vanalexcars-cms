/**
 * createMarketSnapshot.ts
 *
 * Crée un MarketSnapshot immutable et ses MarketSnapshotItems associés.
 * Copie toutes les données point-in-time (les snapshots sont figés).
 */

import type { BasePayload } from 'payload'
import type { NormalizedListing, MarketStatistics, ImportCosts, OpportunityScoreResult, TrendResult } from './types'
import { asUntypedPayload } from './payloadAdapter'

interface SnapshotInput {
  payload: BasePayload
  studyId: string
  runId: string
  listingsDE: Array<NormalizedListing & { listingId?: string; matchingScore: number; included: boolean; exclusionReason?: string }>
  listingsFR: Array<NormalizedListing & { listingId?: string; matchingScore: number; included: boolean; exclusionReason?: string }>
  statsDE: MarketStatistics
  statsFR: MarketStatistics
  importCosts: ImportCosts
  opportunity: OpportunityScoreResult
  trend: TrendResult
  medianLandedCostFrance: number
  estimatedCustomerSaving: number
  liquidityFR: {
    averageDaysOnMarket?: number
    medianDaysOnMarket?: number
    removedSincePreviousRun?: number
    turnoverRate30d?: number
    priceDropRate?: number
  }
  matchingQualityScore: number
  durationMs: number
}

const CALCULATION_VERSION = '1.0.0'

/**
 * Crée un snapshot immutable + ses items.
 * Retourne l'ID du snapshot créé.
 */
export async function createMarketSnapshot(input: SnapshotInput): Promise<string> {
  const {
    payload,
    studyId,
    runId,
    listingsDE,
    listingsFR,
    statsDE,
    statsFR,
    importCosts,
    opportunity,
    trend,
    medianLandedCostFrance,
    estimatedCustomerSaving,
    liquidityFR,
    durationMs,
  } = input

  const db = asUntypedPayload(payload)
  const now = new Date().toISOString()

  // ── Créer le snapshot ─────────────────────────────────────────────────────
  const snapshot = await db.create({
    collection: 'market-snapshots',
    data: {
      study: studyId,
      runId,
      createdAt: now,

      // Comptages
      countDE: statsDE.count,
      countFR: statsFR.count,

      // Stats DE
      medianAdvertisedPriceDE: statsDE.median,
      averageAdvertisedPriceDE: statsDE.mean,
      minAdvertisedPriceDE: statsDE.min,
      percentile25PriceDE: statsDE.percentile25,
      percentile75PriceDE: statsDE.percentile75,

      // Stats FR
      medianAdvertisedPriceFR: statsFR.median,
      averageAdvertisedPriceFR: statsFR.mean,
      minAdvertisedPriceFR: statsFR.min,
      percentile25PriceFR: statsFR.percentile25,
      percentile75PriceFR: statsFR.percentile75,

      // Écart
      priceGapAbsolute: statsFR.median - statsDE.median,
      priceGapPercentage:
        statsDE.median > 0
          ? Math.round(((statsFR.median - statsDE.median) / statsDE.median) * 100 * 100) / 100
          : 0,

      // Coûts d'import
      transportEstimate: importCosts.transportEstimate,
      exportPlateEstimate: importCosts.exportPlateEstimate,
      registrationTaxEstimate: importCosts.registrationTaxEstimate,
      residualMalusEstimate: importCosts.residualMalusEstimate,
      administrativeCostEstimate: importCosts.administrativeCostEstimate,
      serviceFeeEstimate: importCosts.serviceFeeEstimate,
      totalImportCostEstimate: importCosts.totalImportCostEstimate,

      // Opportunité
      medianLandedCostFrance,
      estimatedCustomerSaving,
      opportunityScore: opportunity.score,
      opportunityLabel: opportunity.label,
      trend: trend.trend,

      // Liquidité FR
      averageDaysOnMarketFR: liquidityFR.averageDaysOnMarket,
      medianDaysOnMarketFR: liquidityFR.medianDaysOnMarket,
      removedSincePreviousRunFR: liquidityFR.removedSincePreviousRun,
      turnoverRate30dFR: liquidityFR.turnoverRate30d,
      priceDropRateFR: liquidityFR.priceDropRate,

      // Qualité
      matchingQualityScore: input.matchingQualityScore,

      // Métadonnées
      rawStats: {
        de: statsDE,
        fr: statsFR,
        opportunity: opportunity.breakdown,
      },
      calculationVersion: CALCULATION_VERSION,
      durationMs,
    },
  })

  const snapshotId = snapshot.id as string

  // ── Créer les snapshot items ───────────────────────────────────────────────
  const itemsToCreate = [
    ...listingsDE.map((l) => ({ ...l, side: 'germany' as const })),
    ...listingsFR.map((l) => ({ ...l, side: 'france' as const })),
  ]

  for (const item of itemsToCreate) {
    try {
      await db.create({
        collection: 'market-snapshot-items',
        data: {
          snapshot: snapshotId,
          listing: item.listingId ?? '',
          side: item.side,
          included: item.included,
          exclusionReason: item.exclusionReason,
          matchingScore: item.matchingScore,
          // Données figées au moment du snapshot
          source: item.rawData ? String((item.rawData as Record<string, unknown>)?.source ?? '') : '',
          sourceId: item.sourceId,
          sourceUrl: item.sourceUrl,
          titleAtSnapshot: item.title,
          priceAtSnapshot: item.price,
          mileageAtSnapshot: item.mileage,
          yearAtSnapshot: item.year,
          bodyTypeAtSnapshot: item.normalizedBodyType ?? item.bodyType,
          transmissionAtSnapshot: item.normalizedTransmission ?? item.transmission,
          powerHpAtSnapshot: item.powerHpNormalized ?? item.powerHp,
          sellerTypeAtSnapshot: item.normalizedSellerType ?? item.sellerType,
          statusAtSnapshot: 'active',
          rawDataAtSnapshot: item.rawData,
        },
      })
    } catch (err: unknown) {
      // Log mais ne pas faire échouer tout le snapshot
      payload.logger?.error(
        `[createMarketSnapshot] Failed to create snapshot item for ${item.sourceId}: ${err instanceof Error ? err.message : String(err)}`,
      )
    }
  }

  return snapshotId
}
