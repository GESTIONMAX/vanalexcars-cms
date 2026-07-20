/**
 * calculateTrend.ts
 *
 * Calcule la tendance d'une étude de marché en comparant le snapshot courant
 * avec les snapshots précédents.
 *
 * Seuil de tolérance : 5% (TREND_TOLERANCE = 0.05)
 *
 * Règles :
 *   first_run  — pas de snapshot précédent
 *   improving  — estimatedCustomerSaving amélioré de > 5% OU opportunityScore +≥5
 *   degrading  — estimatedCustomerSaving dégradé de > 5% OU opportunityScore -≥5
 *   stable     — dans la tolérance
 */

import type { TrendResult, TrendValue, SnapshotTrendContext } from './types'

/** Seuil de tolérance pour la détection de tendance (5%) */
const TREND_TOLERANCE = 0.05

interface TrendInput {
  currentSaving: number
  currentOpportunityScore: number
  previousSnapshots: SnapshotTrendContext[]
}

/**
 * Calcule la tendance par rapport aux snapshots précédents.
 * Utilise le dernier snapshot disponible pour la comparaison.
 */
export function calculateTrend({
  currentSaving,
  currentOpportunityScore,
  previousSnapshots,
}: TrendInput): TrendResult {
  // Pas de snapshot précédent → first_run
  if (previousSnapshots.length === 0) {
    return { trend: 'first_run' }
  }

  const previous = previousSnapshots[previousSnapshots.length - 1]!

  let trend: TrendValue = 'stable'

  // Comparaison du saving
  const prevSaving = previous.estimatedCustomerSaving
  const savingRef = Math.abs(prevSaving)

  if (savingRef > 0) {
    const savingDiff = currentSaving - prevSaving
    const savingRatio = savingDiff / savingRef

    if (savingRatio > TREND_TOLERANCE) {
      trend = 'improving'
    } else if (savingRatio < -TREND_TOLERANCE) {
      trend = 'degrading'
    }
  }

  // Comparaison du score d'opportunité (prime sur le saving si >5 pts de diff)
  const scoreDiff = currentOpportunityScore - previous.opportunityScore

  if (scoreDiff >= 5) {
    trend = 'improving'
  } else if (scoreDiff <= -5) {
    trend = 'degrading'
  }

  return { trend }
}
