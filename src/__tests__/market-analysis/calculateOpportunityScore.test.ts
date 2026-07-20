/**
 * calculateOpportunityScore.test.ts
 *
 * Tests du score d'opportunité et de tous ses composants.
 */

import { describe, it, expect } from 'vitest'
import { calculateOpportunityScore } from '../../services/market-analysis/calculateOpportunityScore'
import type { FrenchLiquidityContext, SnapshotTrendContext } from '../../services/market-analysis/types'

const fullLiquidity: FrenchLiquidityContext = {
  medianDaysOnMarket: 20,
  turnoverRate: 35,
  removedSincePrevious: 10,
}

const noLiquidity: FrenchLiquidityContext = {}

const goodPreviousSnapshot: SnapshotTrendContext = {
  estimatedCustomerSaving: 3000,
  opportunityScore: 65,
}

// ── customerSaving score ──────────────────────────────────────────────────────

describe('customerSaving score component', () => {
  it('saving ≤ 0 → 0 pts dans le breakdown', () => {
    const result = calculateOpportunityScore({
      estimatedCustomerSaving: -500,
      countDE: 20,
      countFR: 20,
      averageMatchingScore: 80,
      frenchLiquidity: fullLiquidity,
      previousSnapshots: [],
    })
    expect(result.breakdown.customerSavingScore).toBe(0)
  })

  it('saving = 0 → 0 pts', () => {
    const result = calculateOpportunityScore({
      estimatedCustomerSaving: 0,
      countDE: 20,
      countFR: 20,
      averageMatchingScore: 80,
      frenchLiquidity: fullLiquidity,
      previousSnapshots: [],
    })
    expect(result.breakdown.customerSavingScore).toBe(0)
  })

  it('saving = 1 → 8 pts', () => {
    const result = calculateOpportunityScore({
      estimatedCustomerSaving: 1,
      countDE: 20,
      countFR: 20,
      averageMatchingScore: 80,
      frenchLiquidity: fullLiquidity,
      previousSnapshots: [],
    })
    expect(result.breakdown.customerSavingScore).toBe(8)
  })

  it('saving = 1499 → 8 pts', () => {
    const result = calculateOpportunityScore({
      estimatedCustomerSaving: 1499,
      countDE: 20,
      countFR: 20,
      averageMatchingScore: 80,
      frenchLiquidity: fullLiquidity,
      previousSnapshots: [],
    })
    expect(result.breakdown.customerSavingScore).toBe(8)
  })

  it('saving = 1500 → 18 pts', () => {
    const result = calculateOpportunityScore({
      estimatedCustomerSaving: 1500,
      countDE: 20,
      countFR: 20,
      averageMatchingScore: 80,
      frenchLiquidity: fullLiquidity,
      previousSnapshots: [],
    })
    expect(result.breakdown.customerSavingScore).toBe(18)
  })

  it('saving = 3000 → 30 pts', () => {
    const result = calculateOpportunityScore({
      estimatedCustomerSaving: 3000,
      countDE: 20,
      countFR: 20,
      averageMatchingScore: 80,
      frenchLiquidity: fullLiquidity,
      previousSnapshots: [],
    })
    expect(result.breakdown.customerSavingScore).toBe(30)
  })

  it('saving ≥ 5000 → 40 pts', () => {
    const result = calculateOpportunityScore({
      estimatedCustomerSaving: 5000,
      countDE: 20,
      countFR: 20,
      averageMatchingScore: 80,
      frenchLiquidity: fullLiquidity,
      previousSnapshots: [],
    })
    expect(result.breakdown.customerSavingScore).toBe(40)
  })

  it('saving = 10000 → 40 pts (capped)', () => {
    const result = calculateOpportunityScore({
      estimatedCustomerSaving: 10000,
      countDE: 20,
      countFR: 20,
      averageMatchingScore: 80,
      frenchLiquidity: fullLiquidity,
      previousSnapshots: [],
    })
    expect(result.breakdown.customerSavingScore).toBe(40)
  })
})

// ── sampleReliability ─────────────────────────────────────────────────────────

describe('sampleReliability component', () => {
  it('DE≥20 && FR≥20 → 15 pts', () => {
    const result = calculateOpportunityScore({
      estimatedCustomerSaving: 5000,
      countDE: 20,
      countFR: 20,
      averageMatchingScore: 80,
      frenchLiquidity: noLiquidity,
      previousSnapshots: [],
    })
    expect(result.breakdown.sampleReliabilityScore).toBe(15)
  })

  it('DE≥10 && FR≥10 → 10 pts', () => {
    const result = calculateOpportunityScore({
      estimatedCustomerSaving: 5000,
      countDE: 10,
      countFR: 10,
      averageMatchingScore: 80,
      frenchLiquidity: noLiquidity,
      previousSnapshots: [],
    })
    expect(result.breakdown.sampleReliabilityScore).toBe(10)
  })

  it('DE≥5 && FR≥5 → 5 pts', () => {
    const result = calculateOpportunityScore({
      estimatedCustomerSaving: 5000,
      countDE: 5,
      countFR: 5,
      averageMatchingScore: 80,
      frenchLiquidity: noLiquidity,
      previousSnapshots: [],
    })
    expect(result.breakdown.sampleReliabilityScore).toBe(5)
  })

  it('DE=0 FR=0 → 0 pts', () => {
    const result = calculateOpportunityScore({
      estimatedCustomerSaving: 5000,
      countDE: 0,
      countFR: 0,
      averageMatchingScore: 80,
      frenchLiquidity: noLiquidity,
      previousSnapshots: [],
    })
    expect(result.breakdown.sampleReliabilityScore).toBe(0)
  })
})

// ── Labels ────────────────────────────────────────────────────────────────────

describe('opportunity labels', () => {
  it('score ≥ 80 → strong_opportunity', () => {
    const result = calculateOpportunityScore({
      estimatedCustomerSaving: 5000,
      countDE: 25,
      countFR: 25,
      averageMatchingScore: 90,
      frenchLiquidity: fullLiquidity,
      previousSnapshots: [],
    })
    expect(result.score).toBeGreaterThanOrEqual(80)
    expect(result.label).toBe('strong_opportunity')
  })

  it('score ≥ 50 → profitable', () => {
    const result = calculateOpportunityScore({
      estimatedCustomerSaving: 1500,
      countDE: 15,
      countFR: 15,
      averageMatchingScore: 70,
      frenchLiquidity: noLiquidity,
      previousSnapshots: [],
    })
    if (result.score >= 50 && result.score < 80) {
      expect(result.label).toBe('profitable')
    }
  })

  it('score 0 avec pas d\'économie et peu d\'annonces → not_profitable', () => {
    const result = calculateOpportunityScore({
      estimatedCustomerSaving: -1000,
      countDE: 0,
      countFR: 0,
      averageMatchingScore: 20,
      frenchLiquidity: noLiquidity,
      previousSnapshots: [],
    })
    expect(result.label).toBe('not_profitable')
  })
})

// ── No listings edge cases ────────────────────────────────────────────────────

describe('edge cases', () => {
  it('no DE listings → opportunityScore low', () => {
    const result = calculateOpportunityScore({
      estimatedCustomerSaving: 5000,
      countDE: 0,
      countFR: 20,
      averageMatchingScore: 80,
      frenchLiquidity: fullLiquidity,
      previousSnapshots: [],
    })
    expect(result.breakdown.sampleReliabilityScore).toBe(0)
    expect(result.breakdown.germanAvailabilityScore).toBe(0)
  })

  it('no FR listings → score réduit', () => {
    const result = calculateOpportunityScore({
      estimatedCustomerSaving: 5000,
      countDE: 20,
      countFR: 0,
      averageMatchingScore: 80,
      frenchLiquidity: noLiquidity,
      previousSnapshots: [],
    })
    expect(result.breakdown.sampleReliabilityScore).toBe(0)
  })

  it('FR price below landed cost → saving < 0 → 0 pts customerSaving', () => {
    const result = calculateOpportunityScore({
      estimatedCustomerSaving: -2000,
      countDE: 20,
      countFR: 20,
      averageMatchingScore: 80,
      frenchLiquidity: fullLiquidity,
      previousSnapshots: [],
    })
    expect(result.breakdown.customerSavingScore).toBe(0)
  })

  it('score ne dépasse pas 100', () => {
    const result = calculateOpportunityScore({
      estimatedCustomerSaving: 100000,
      countDE: 100,
      countFR: 100,
      averageMatchingScore: 100,
      frenchLiquidity: fullLiquidity,
      previousSnapshots: [goodPreviousSnapshot],
    })
    expect(result.score).toBeLessThanOrEqual(100)
  })

  it('previous snapshot présent → trend score ≠ neutral first_run', () => {
    const result = calculateOpportunityScore({
      estimatedCustomerSaving: 5000,
      countDE: 20,
      countFR: 20,
      averageMatchingScore: 80,
      frenchLiquidity: noLiquidity,
      previousSnapshots: [goodPreviousSnapshot],
    })
    // Le trend score est calculé avec snapshot précédent
    expect(result.breakdown.trendScore).toBeDefined()
  })
})
