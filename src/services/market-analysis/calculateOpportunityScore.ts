/**
 * calculateOpportunityScore.ts
 *
 * Calcule le score d'opportunité (0-100) et son label.
 *
 * Décomposition :
 *   customerSaving score   (40 pts) — économie réelle estimée pour le client
 *   sampleReliability      (15 pts) — taille des échantillons DE et FR
 *   frenchLiquidity        (15 pts) — liquidité du marché FR
 *   germanAvailability     (10 pts) — disponibilité côté Allemagne
 *   trend                  (10 pts) — tendance vs snapshots précédents
 *   matchingQuality        (10 pts) — qualité du matching des annonces
 *
 * Labels :
 *   80-100: strong_opportunity
 *   50-79:  profitable
 *   25-49:  marginal
 *   0-24:   not_profitable
 */

import type {
  OpportunityScoreResult,
  OpportunityLabel,
  FrenchLiquidityContext,
  SnapshotTrendContext,
} from './types'

interface OpportunityScoreInput {
  /** Économie estimée pour le client (médianFR - (médianDE + coûtsImport)) */
  estimatedCustomerSaving: number
  /** Nombre d'annonces côté Allemagne */
  countDE: number
  /** Nombre d'annonces côté France */
  countFR: number
  /** Score moyen de matching des annonces */
  averageMatchingScore: number
  /** Contexte de liquidité FR */
  frenchLiquidity: FrenchLiquidityContext
  /** 3 derniers snapshots pour le calcul de tendance */
  previousSnapshots: SnapshotTrendContext[]
}

// ── Helpers de scoring ────────────────────────────────────────────────────────

/**
 * Score basé sur l'économie client (40 pts max)
 * ≤ 0     → 0 pts
 * 1-1499  → 8 pts
 * 1500-2999 → 18 pts
 * 3000-4999 → 30 pts
 * ≥ 5000  → 40 pts
 */
function customerSavingScore(saving: number): number {
  if (saving <= 0) return 0
  if (saving < 1500) return 8
  if (saving < 3000) return 18
  if (saving < 5000) return 30
  return 40
}

/**
 * Score de fiabilité de l'échantillon (15 pts max)
 * DE≥20 && FR≥20 → 15 pts
 * DE≥10 && FR≥10 → 10 pts
 * DE≥5  && FR≥5  → 5 pts
 * sinon          → 0 pts
 */
function sampleReliabilityScore(countDE: number, countFR: number): number {
  if (countDE >= 20 && countFR >= 20) return 15
  if (countDE >= 10 && countFR >= 10) return 10
  if (countDE >= 5 && countFR >= 5) return 5
  return 0
}

/**
 * Score de liquidité FR (15 pts max)
 * Basé sur : medianDaysOnMarket, turnoverRate, removedSincePrevious
 *
 * medianDaysOnMarket ≤ 30 → 5 pts, 31-60 → 3 pts, > 60 → 0 pts
 * turnoverRate ≥ 30%      → 5 pts, 15-29% → 3 pts, < 15% → 0 pts
 * removedSincePrevious ≥ 5 → 5 pts, 2-4 → 3 pts, 0-1 → 0 pts
 */
function frenchLiquidityScore(ctx: FrenchLiquidityContext): number {
  let score = 0

  // Temps médian sur le marché
  const days = ctx.medianDaysOnMarket
  if (days !== undefined) {
    if (days <= 30) score += 5
    else if (days <= 60) score += 3
    // > 60 jours → 0 pts
  }

  // Taux de rotation
  const rate = ctx.turnoverRate
  if (rate !== undefined) {
    if (rate >= 30) score += 5
    else if (rate >= 15) score += 3
    // < 15% → 0 pts
  }

  // Annonces retirées depuis le run précédent (signal d'achat)
  const removed = ctx.removedSincePrevious
  if (removed !== undefined) {
    if (removed >= 5) score += 5
    else if (removed >= 2) score += 3
    // 0-1 → 0 pts
  }

  return Math.min(score, 15)
}

/**
 * Score de disponibilité côté Allemagne (10 pts max)
 * ≥ 20 annonces → 10 pts
 * 10-19         → 7 pts
 * 5-9           → 4 pts
 * 1-4           → 2 pts
 * 0             → 0 pts
 */
function germanAvailabilityScore(countDE: number): number {
  if (countDE >= 20) return 10
  if (countDE >= 10) return 7
  if (countDE >= 5) return 4
  if (countDE >= 1) return 2
  return 0
}

/**
 * Score de tendance basé sur les snapshots précédents (10 pts max)
 * Amélioration de l'opportunité ou saving → 10 pts
 * Stable → 5 pts
 * Dégradation → 0 pts
 * Pas de données précédentes (first_run) → 5 pts (neutre)
 */
function trendScore(
  currentSaving: number,
  currentOpportunityScore: number,
  previousSnapshots: SnapshotTrendContext[],
): number {
  if (previousSnapshots.length === 0) return 5 // first_run: neutre

  const lastSnapshot = previousSnapshots[previousSnapshots.length - 1]!
  const savingDiff = currentSaving - lastSnapshot.estimatedCustomerSaving
  const scoreDiff = currentOpportunityScore - lastSnapshot.opportunityScore

  const TOLERANCE = 0.05

  if (
    savingDiff > Math.abs(lastSnapshot.estimatedCustomerSaving) * TOLERANCE ||
    scoreDiff >= 5
  ) {
    return 10 // improving
  }
  if (
    savingDiff < -Math.abs(lastSnapshot.estimatedCustomerSaving) * TOLERANCE ||
    scoreDiff <= -5
  ) {
    return 0 // degrading
  }
  return 5 // stable
}

/**
 * Score de qualité du matching (10 pts max)
 * ≥ 80% → 10 pts
 * 60-79% → 7 pts
 * 40-59% → 4 pts
 * < 40%  → 1 pt
 */
function matchingQualityScore(avgMatchingScore: number): number {
  if (avgMatchingScore >= 80) return 10
  if (avgMatchingScore >= 60) return 7
  if (avgMatchingScore >= 40) return 4
  return 1
}

/**
 * Détermine le label depuis le score total
 */
function scoreToLabel(score: number): OpportunityLabel {
  if (score >= 80) return 'strong_opportunity'
  if (score >= 50) return 'profitable'
  if (score >= 25) return 'marginal'
  return 'not_profitable'
}

// ── Fonction principale ───────────────────────────────────────────────────────

export function calculateOpportunityScore(input: OpportunityScoreInput): OpportunityScoreResult {
  const {
    estimatedCustomerSaving,
    countDE,
    countFR,
    averageMatchingScore,
    frenchLiquidity,
    previousSnapshots,
  } = input

  const savingScore = customerSavingScore(estimatedCustomerSaving)
  const reliabilityScore = sampleReliabilityScore(countDE, countFR)
  const liquidityScore = frenchLiquidityScore(frenchLiquidity)
  const availabilityScore = germanAvailabilityScore(countDE)

  // Pour le trendScore, on calcule un score provisoire sans le trend
  const provisionalScore =
    savingScore + reliabilityScore + liquidityScore + availabilityScore + matchingQualityScore(averageMatchingScore)

  const computedTrendScore = trendScore(estimatedCustomerSaving, provisionalScore, previousSnapshots)
  const matchingScore = matchingQualityScore(averageMatchingScore)

  const total = Math.min(
    100,
    savingScore + reliabilityScore + liquidityScore + availabilityScore + computedTrendScore + matchingScore,
  )

  return {
    score: total,
    label: scoreToLabel(total),
    breakdown: {
      customerSavingScore: savingScore,
      sampleReliabilityScore: reliabilityScore,
      frenchLiquidityScore: liquidityScore,
      germanAvailabilityScore: availabilityScore,
      trendScore: computedTrendScore,
      matchingQualityScore: matchingScore,
    },
  }
}
