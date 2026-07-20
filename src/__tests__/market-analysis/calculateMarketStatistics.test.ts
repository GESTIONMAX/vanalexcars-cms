/**
 * calculateMarketStatistics.test.ts
 *
 * Tests des fonctions statistiques pures.
 */

import { describe, it, expect } from 'vitest'
import {
  median,
  percentile,
  mean,
  stddev,
  removeOutliers,
  calculateMarketStatistics,
} from '../../services/market-analysis/calculateMarketStatistics'
import type { NormalizedListing } from '../../services/market-analysis/types'

// ── median ────────────────────────────────────────────────────────────────────

describe('median', () => {
  it('retourne 0 pour un tableau vide', () => {
    expect(median([])).toBe(0)
  })

  it('retourne la valeur unique pour un tableau d\'un élément', () => {
    expect(median([42])).toBe(42)
  })

  it('retourne la médiane d\'un nombre pair d\'éléments', () => {
    expect(median([1, 2, 3, 4])).toBe(2.5)
  })

  it('retourne la médiane d\'un nombre impair d\'éléments', () => {
    expect(median([1, 3, 5])).toBe(3)
  })

  it('trie correctement avant de calculer la médiane', () => {
    expect(median([5, 1, 3, 2, 4])).toBe(3)
  })

  it('fonctionne avec des prix réels', () => {
    const prices = [25000, 27000, 23000, 28000, 24000]
    expect(median(prices)).toBe(25000)
  })
})

// ── percentile ────────────────────────────────────────────────────────────────

describe('percentile', () => {
  it('retourne 0 pour un tableau vide', () => {
    expect(percentile([], 25)).toBe(0)
  })

  it('retourne le minimum pour p=0', () => {
    expect(percentile([10, 20, 30], 0)).toBe(10)
  })

  it('retourne le maximum pour p=100', () => {
    expect(percentile([10, 20, 30], 100)).toBe(30)
  })

  it('calcule le P25 correctement', () => {
    const values = [1, 2, 3, 4, 5, 6, 7, 8]
    const p25 = percentile(values, 25)
    expect(p25).toBeGreaterThanOrEqual(2)
    expect(p25).toBeLessThanOrEqual(3)
  })

  it('calcule le P75 correctement', () => {
    const values = [1, 2, 3, 4, 5, 6, 7, 8]
    const p75 = percentile(values, 75)
    expect(p75).toBeGreaterThanOrEqual(5)
    expect(p75).toBeLessThanOrEqual(7)
  })

  it('P50 ≈ médiane', () => {
    const values = [10, 20, 30, 40, 50]
    expect(percentile(values, 50)).toBe(median(values))
  })
})

// ── mean ──────────────────────────────────────────────────────────────────────

describe('mean', () => {
  it('retourne 0 pour un tableau vide', () => {
    expect(mean([])).toBe(0)
  })

  it('calcule la moyenne correctement', () => {
    expect(mean([2, 4, 6])).toBe(4)
  })

  it('fonctionne avec un seul élément', () => {
    expect(mean([42])).toBe(42)
  })
})

// ── stddev ────────────────────────────────────────────────────────────────────

describe('stddev', () => {
  it('retourne 0 pour un tableau vide', () => {
    expect(stddev([])).toBe(0)
  })

  it('retourne 0 pour un seul élément', () => {
    expect(stddev([42])).toBe(0)
  })

  it('calcule l\'écart-type correctement', () => {
    // Valeurs identiques → stddev = 0
    expect(stddev([5, 5, 5, 5])).toBe(0)
  })

  it('retourne une valeur positive pour données dispersées', () => {
    expect(stddev([1, 2, 3, 4, 5])).toBeGreaterThan(0)
  })
})

// ── removeOutliers ────────────────────────────────────────────────────────────

describe('removeOutliers (IQR)', () => {
  it('retourne les données inchangées si < 4 éléments', () => {
    const values = [1, 2, 3]
    const { filtered, removed } = removeOutliers(values, 'iqr')
    expect(filtered).toEqual(values)
    expect(removed).toEqual([])
  })

  it('supprime les outliers évidents', () => {
    const values = [100, 102, 98, 101, 99, 1000] // 1000 est un outlier
    const { filtered, removed } = removeOutliers(values, 'iqr')
    expect(removed).toContain(1000)
    expect(filtered).not.toContain(1000)
  })

  it('ne supprime pas les valeurs normales', () => {
    const values = [20000, 22000, 21000, 23000, 19000, 24000]
    const { removed } = removeOutliers(values, 'iqr')
    expect(removed.length).toBe(0)
  })

  it('le tableau filtré + supprimé = tableau original', () => {
    const values = [100, 102, 98, 101, 99, 1000, 50]
    const { filtered, removed } = removeOutliers(values, 'iqr')
    expect(filtered.length + removed.length).toBe(values.length)
  })
})

// ── calculateMarketStatistics ─────────────────────────────────────────────────

function makeListings(prices: Array<number | undefined>): NormalizedListing[] {
  return prices.map((price, i) => ({
    sourceId: `id-${i}`,
    sourceUrl: `https://example.com/${i}`,
    price,
    normalizationConfidence: 80,
  }))
}

describe('calculateMarketStatistics', () => {
  it('retourne des zéros pour une liste vide', () => {
    const stats = calculateMarketStatistics([])
    expect(stats.count).toBe(0)
    expect(stats.median).toBe(0)
    expect(stats.mean).toBe(0)
  })

  it('retourne des zéros si tous les prix sont undefined', () => {
    const listings = makeListings([undefined, undefined])
    const stats = calculateMarketStatistics(listings)
    expect(stats.count).toBe(2)
    expect(stats.median).toBe(0)
  })

  it('calcule les statistiques correctement', () => {
    const listings = makeListings([20000, 22000, 21000, 23000, 19000])
    const stats = calculateMarketStatistics(listings)
    expect(stats.count).toBe(5)
    expect(stats.median).toBe(21000)
    expect(stats.min).toBe(19000)
    expect(stats.max).toBe(23000)
    expect(stats.mean).toBe(21000)
  })

  it('countDE=0 → stats vides (opportunityScore bas)', () => {
    const stats = calculateMarketStatistics([])
    expect(stats.count).toBe(0)
    expect(stats.median).toBe(0)
  })

  it('countFR=0 → stats FR vides', () => {
    const stats = calculateMarketStatistics([])
    expect(stats.count).toBe(0)
  })

  it('un seul listing → stats cohérentes', () => {
    const listings = makeListings([25000])
    const stats = calculateMarketStatistics(listings)
    expect(stats.count).toBe(1)
    expect(stats.median).toBe(25000)
    expect(stats.mean).toBe(25000)
    expect(stats.min).toBe(25000)
    expect(stats.max).toBe(25000)
  })
})
