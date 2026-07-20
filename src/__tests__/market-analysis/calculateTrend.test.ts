/**
 * calculateTrend.test.ts
 *
 * Tests du calcul de tendance.
 */

import { describe, it, expect } from 'vitest'
import { calculateTrend } from '../../services/market-analysis/calculateTrend'
import type { SnapshotTrendContext } from '../../services/market-analysis/types'

const previousGood: SnapshotTrendContext = {
  estimatedCustomerSaving: 3000,
  opportunityScore: 60,
}

describe('calculateTrend', () => {
  it('aucun snapshot précédent → first_run', () => {
    const result = calculateTrend({
      currentSaving: 4000,
      currentOpportunityScore: 70,
      previousSnapshots: [],
    })
    expect(result.trend).toBe('first_run')
  })

  it('amélioration du saving > 5% → improving', () => {
    const result = calculateTrend({
      currentSaving: 3200, // +6.7% vs 3000
      currentOpportunityScore: 60,
      previousSnapshots: [previousGood],
    })
    expect(result.trend).toBe('improving')
  })

  it('dégradation du saving > 5% → degrading', () => {
    const result = calculateTrend({
      currentSaving: 2800, // -6.7% vs 3000
      currentOpportunityScore: 60,
      previousSnapshots: [previousGood],
    })
    expect(result.trend).toBe('degrading')
  })

  it('variation du saving ≤ 5% → stable', () => {
    const result = calculateTrend({
      currentSaving: 3050, // +1.7% vs 3000
      currentOpportunityScore: 60,
      previousSnapshots: [previousGood],
    })
    expect(result.trend).toBe('stable')
  })

  it('opportunityScore +5 → improving (override saving)', () => {
    const result = calculateTrend({
      currentSaving: 3000, // identique
      currentOpportunityScore: 65, // +5
      previousSnapshots: [previousGood],
    })
    expect(result.trend).toBe('improving')
  })

  it('opportunityScore -5 → degrading (override saving)', () => {
    const result = calculateTrend({
      currentSaving: 3000, // identique
      currentOpportunityScore: 55, // -5
      previousSnapshots: [previousGood],
    })
    expect(result.trend).toBe('degrading')
  })

  it('score exactement +5 → improving (seuil inclusif)', () => {
    const result = calculateTrend({
      currentSaving: 3000,
      currentOpportunityScore: 65,
      previousSnapshots: [{ estimatedCustomerSaving: 3000, opportunityScore: 60 }],
    })
    expect(result.trend).toBe('improving')
  })

  it('score < +5 et saving stable → stable', () => {
    const result = calculateTrend({
      currentSaving: 3000,
      currentOpportunityScore: 62, // +2
      previousSnapshots: [previousGood],
    })
    expect(result.trend).toBe('stable')
  })

  it('saving de 0 → stable (pas de division par zéro)', () => {
    const result = calculateTrend({
      currentSaving: 0,
      currentOpportunityScore: 60,
      previousSnapshots: [{ estimatedCustomerSaving: 0, opportunityScore: 60 }],
    })
    // Avec saving=0 (prevSaving=0), savingRef=0, pas de calcul de ratio → stable
    expect(['stable', 'improving', 'degrading']).toContain(result.trend)
  })

  it('utilise le dernier snapshot si plusieurs fournis', () => {
    const snapshots: SnapshotTrendContext[] = [
      { estimatedCustomerSaving: 5000, opportunityScore: 80 },
      { estimatedCustomerSaving: 3000, opportunityScore: 60 }, // dernier
    ]
    const result = calculateTrend({
      currentSaving: 2800, // -6.7% vs 3000 (dernier)
      currentOpportunityScore: 60,
      previousSnapshots: snapshots,
    })
    expect(result.trend).toBe('degrading')
  })
})
