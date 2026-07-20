/**
 * calculateImportCosts.test.ts
 *
 * Tests du calcul des coûts d'import.
 */

import { describe, it, expect } from 'vitest'
import { calculateImportCosts } from '../../services/market-analysis/calculateImportCosts'
import type { SimulatorConfigParams } from '../../services/market-analysis/types'

const defaultConfig: SimulatorConfigParams = {
  honoraires: 1490,
  fraisDossier: 0,
  cpiWw: 150,
  plaquesExport: 200,
  coc: 150,
  formalitesAdmin: 200,
  margeSecurity: 300,
}

describe('calculateImportCosts', () => {
  it('calcule les coûts avec la config par défaut', () => {
    const result = calculateImportCosts({
      simulatorConfig: defaultConfig,
      medianPriceDE: 25000,
    })

    expect(result.serviceFeeEstimate).toBe(1490)
    expect(result.exportPlateEstimate).toBe(350) // cpiWw(150) + plaquesExport(200)
    expect(result.administrativeCostEstimate).toBe(350) // coc(150) + formalitesAdmin(200)
    expect(result.residualMalusEstimate).toBe(0)
    expect(result.transportEstimate).toBe(300)
    expect(result.totalImportCostEstimate).toBeGreaterThan(0)
  })

  it('le total = somme des composantes + margeSecurity', () => {
    const result = calculateImportCosts({
      simulatorConfig: defaultConfig,
      medianPriceDE: 25000,
    })

    const expectedTotal =
      result.transportEstimate +
      result.exportPlateEstimate +
      result.registrationTaxEstimate +
      result.residualMalusEstimate +
      result.administrativeCostEstimate +
      result.serviceFeeEstimate +
      300 // margeSecurity

    expect(result.totalImportCostEstimate).toBe(expectedTotal)
  })

  it('utilise importCostOverride quand défini', () => {
    const result = calculateImportCosts({
      simulatorConfig: defaultConfig,
      medianPriceDE: 25000,
      importCostOverride: 3500,
    })

    expect(result.totalImportCostEstimate).toBe(3500)
    // Les composantes individuelles restent inchangées
    expect(result.serviceFeeEstimate).toBe(1490)
  })

  it('ignore importCostOverride = 0', () => {
    const result = calculateImportCosts({
      simulatorConfig: defaultConfig,
      medianPriceDE: 25000,
      importCostOverride: 0,
    })

    // 0 est falsy → utiliser le calcul automatique
    expect(result.totalImportCostEstimate).toBeGreaterThan(0)
  })

  it('ignore importCostOverride = null', () => {
    const result = calculateImportCosts({
      simulatorConfig: defaultConfig,
      medianPriceDE: 25000,
      importCostOverride: null,
    })

    expect(result.totalImportCostEstimate).toBeGreaterThan(0)
  })

  it('fonctionne avec une config vide (valeurs par défaut)', () => {
    const result = calculateImportCosts({
      simulatorConfig: {},
      medianPriceDE: 20000,
    })

    expect(result.totalImportCostEstimate).toBeGreaterThan(0)
    expect(result.serviceFeeEstimate).toBe(1490) // defaultValue
  })

  it('tous les champs retournés sont des nombres', () => {
    const result = calculateImportCosts({
      simulatorConfig: defaultConfig,
      medianPriceDE: 25000,
    })

    expect(typeof result.transportEstimate).toBe('number')
    expect(typeof result.exportPlateEstimate).toBe('number')
    expect(typeof result.registrationTaxEstimate).toBe('number')
    expect(typeof result.residualMalusEstimate).toBe('number')
    expect(typeof result.administrativeCostEstimate).toBe('number')
    expect(typeof result.serviceFeeEstimate).toBe('number')
    expect(typeof result.totalImportCostEstimate).toBe('number')
  })
})
