/**
 * calculateMarketStatistics.ts
 *
 * Fonctions statistiques pures pour l'analyse de marché.
 * Toutes les fonctions sont sans effet de bord et bien typées.
 */

import type { NormalizedListing, MarketStatistics } from './types'

// ── Fonctions statistiques de base ──────────────────────────────────────────

/**
 * Calcule la médiane d'un tableau de nombres.
 * Retourne 0 si le tableau est vide.
 */
export function median(values: number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 1) {
    return sorted[mid]!
  }
  return (sorted[mid - 1]! + sorted[mid]!) / 2
}

/**
 * Calcule le percentile p (0-100) d'un tableau de nombres.
 * Utilise l'interpolation linéaire (méthode inclusive).
 * Retourne 0 si le tableau est vide.
 */
export function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0
  if (p <= 0) return Math.min(...values)
  if (p >= 100) return Math.max(...values)

  const sorted = [...values].sort((a, b) => a - b)
  const index = (p / 100) * (sorted.length - 1)
  const lower = Math.floor(index)
  const upper = Math.ceil(index)

  if (lower === upper) {
    return sorted[lower]!
  }

  const fraction = index - lower
  return sorted[lower]! * (1 - fraction) + sorted[upper]! * fraction
}

/**
 * Calcule la moyenne arithmétique d'un tableau de nombres.
 * Retourne 0 si le tableau est vide.
 */
export function mean(values: number[]): number {
  if (values.length === 0) return 0
  return values.reduce((sum, v) => sum + v, 0) / values.length
}

/**
 * Calcule l'écart-type (standard deviation) d'un tableau de nombres.
 * Retourne 0 si le tableau a moins de 2 éléments.
 */
export function stddev(values: number[]): number {
  if (values.length < 2) return 0
  const avg = mean(values)
  const variance = values.reduce((sum, v) => sum + Math.pow(v - avg, 2), 0) / values.length
  return Math.sqrt(variance)
}

/**
 * Supprime les valeurs aberrantes (outliers) en utilisant la méthode IQR.
 * Seuil : Q1 - 1.5*IQR à Q3 + 1.5*IQR
 */
export function removeOutliers(
  values: number[],
  method: 'iqr',
): { filtered: number[]; removed: number[] } {
  if (values.length < 4) {
    // Pas assez de données pour calculer des outliers fiables
    return { filtered: values, removed: [] }
  }

  const q1 = percentile(values, 25)
  const q3 = percentile(values, 75)
  const iqr = q3 - q1
  const lowerBound = q1 - 1.5 * iqr
  const upperBound = q3 + 1.5 * iqr

  const filtered: number[] = []
  const removed: number[] = []

  for (const v of values) {
    if (v >= lowerBound && v <= upperBound) {
      filtered.push(v)
    } else {
      removed.push(v)
    }
  }

  return { filtered, removed }
}

// ── Statistiques complètes d'un ensemble d'annonces ─────────────────────────

/**
 * Calcule les statistiques complètes pour un ensemble d'annonces normalisées.
 * Utilise la suppression d'outliers par IQR avant les calculs statistiques.
 */
export function calculateMarketStatistics(listings: NormalizedListing[]): MarketStatistics {
  const allPrices = listings
    .map((l) => l.price)
    .filter((p): p is number => typeof p === 'number' && p > 0)

  if (allPrices.length === 0) {
    return {
      count: listings.length,
      median: 0,
      mean: 0,
      min: 0,
      max: 0,
      percentile25: 0,
      percentile75: 0,
      stddev: 0,
      outliersRemoved: 0,
      prices: [],
    }
  }

  const { filtered, removed } = removeOutliers(allPrices, 'iqr')
  const prices = filtered.length > 0 ? filtered : allPrices

  return {
    count: listings.length,
    median: median(prices),
    mean: mean(prices),
    min: Math.min(...prices),
    max: Math.max(...prices),
    percentile25: percentile(prices, 25),
    percentile75: percentile(prices, 75),
    stddev: stddev(prices),
    outliersRemoved: removed.length,
    prices,
  }
}
