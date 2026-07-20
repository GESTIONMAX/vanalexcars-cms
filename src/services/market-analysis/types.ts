/**
 * types.ts
 *
 * Types partagés du module d'analyse de marché.
 * Aucun effet de bord — types purs.
 */

// ── Annonce brute (sortie des providers) ─────────────────────────────────────

export interface RawMarketListing {
  sourceId: string
  sourceUrl: string
  title?: string
  price?: number
  mileage?: number
  year?: number
  fuel?: string
  transmission?: string
  bodyType?: string
  powerHp?: number
  location?: string
  dealer?: string
  imageUrl?: string
  sellerType?: string
  rawData?: unknown
}

// ── Annonce normalisée ────────────────────────────────────────────────────────

export interface NormalizedListing extends RawMarketListing {
  normalizedMake?: string
  normalizedModel?: string
  normalizedTrim?: string
  normalizedGeneration?: string
  normalizedFuel?: string
  normalizedTransmission?: string
  normalizedBodyType?: string
  normalizedSellerType?: 'professional' | 'private' | 'unknown'
  normalizedVatType?: 'deductible' | 'margin' | 'private' | 'unknown'
  powerHpNormalized?: number
  normalizationConfidence: number
  // Internal vehicle link
  vehicleId?: string
}

// ── Provider ─────────────────────────────────────────────────────────────────

export interface MarketListingProvider {
  source: string
  fetchListings(params: { study: MarketStudy; signal?: AbortSignal }): Promise<RawMarketListing[]>
}

// ── Statistiques de marché ────────────────────────────────────────────────────

export interface MarketStatistics {
  count: number
  median: number
  mean: number
  min: number
  max: number
  percentile25: number
  percentile75: number
  stddev: number
  outliersRemoved: number
  prices: number[]
}

// ── Coûts d'import ───────────────────────────────────────────────────────────

export interface ImportCosts {
  transportEstimate: number
  exportPlateEstimate: number
  registrationTaxEstimate: number
  residualMalusEstimate: number
  administrativeCostEstimate: number
  serviceFeeEstimate: number
  totalImportCostEstimate: number
}

// ── Score d'opportunité ───────────────────────────────────────────────────────

export type OpportunityLabel =
  | 'strong_opportunity'
  | 'profitable'
  | 'marginal'
  | 'not_profitable'

export interface OpportunityScoreResult {
  score: number
  label: OpportunityLabel
  breakdown: {
    customerSavingScore: number
    sampleReliabilityScore: number
    frenchLiquidityScore: number
    germanAvailabilityScore: number
    trendScore: number
    matchingQualityScore: number
  }
}

// ── Tendance ─────────────────────────────────────────────────────────────────

export type TrendValue = 'first_run' | 'improving' | 'stable' | 'degrading'

export interface TrendResult {
  trend: TrendValue
}

// ── Étude de marché (type de collection) ─────────────────────────────────────

export interface MarketStudy {
  id: string
  name: string
  brand: string
  model: string
  generation?: string | null
  bodyTypes?: string[] | null
  yearMin?: number | null
  yearMax?: number | null
  mileageMax?: number | null
  fuel?: string | null
  transmission?: string | null
  powerMinHp?: number | null
  powerMaxHp?: number | null
  sellerTypes?: string[] | null
  vatTypes?: string[] | null
  accidentFreeOnly?: boolean | null
  warrantyRequired?: boolean | null
  sourcesFR?: string[] | null
  sourcesDE?: string[] | null
  searchUrlDE?: string | null
  searchUrlFR?: string | null
  status?: string | null
  schedule?: string | null
  lastRunStatus?: string | null
  importCostOverride?: number | null
}

// ── Paramètres SimulatorConfig ────────────────────────────────────────────────

export interface SimulatorConfigParams {
  honoraires?: number | null
  fraisDossier?: number | null
  cpiWw?: number | null
  plaquesExport?: number | null
  coc?: number | null
  formalitesAdmin?: number | null
  margeSecurity?: number | null
}

// ── Contexte de liquidité FR ──────────────────────────────────────────────────

export interface FrenchLiquidityContext {
  medianDaysOnMarket?: number
  turnoverRate?: number
  removedSincePrevious?: number
  totalFR?: number
}

// ── Contexte trend ────────────────────────────────────────────────────────────

export interface SnapshotTrendContext {
  estimatedCustomerSaving: number
  opportunityScore: number
}
