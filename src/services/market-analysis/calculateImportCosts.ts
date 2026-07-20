/**
 * calculateImportCosts.ts
 *
 * Calcule les coûts d'import à partir des paramètres SimulatorConfig
 * et d'un prix médian DE.
 *
 * Mapping SimulatorConfig → ImportCosts :
 *   honoraires         → serviceFeeEstimate
 *   fraisDossier       → administrativeCostEstimate (cumulé)
 *   cpiWw              → exportPlateEstimate (cumulé avec plaquesExport)
 *   plaquesExport      → exportPlateEstimate (cumulé avec cpiWw)
 *   coc                → administrativeCostEstimate (cumulé)
 *   formalitesAdmin    → administrativeCostEstimate (cumulé)
 *   malus              → residualMalusEstimate
 *   margeSecurity      → inclus dans totalImportCostEstimate
 *
 * Si importCostOverride est défini, il remplace le totalImportCostEstimate.
 */

import type { ImportCosts, SimulatorConfigParams } from './types'

interface CalculateImportCostsInput {
  simulatorConfig: SimulatorConfigParams
  medianPriceDE: number
  importCostOverride?: number | null
}

/**
 * Calcule le détail des coûts d'import.
 *
 * Note : Le transport n'est pas dans SimulatorConfig, c'est estimé
 * à partir du prix ou d'une valeur fixe par défaut.
 */
export function calculateImportCosts({
  simulatorConfig,
  medianPriceDE,
  importCostOverride,
}: CalculateImportCostsInput): ImportCosts {
  const {
    honoraires = 1490,
    fraisDossier = 0,
    cpiWw = 150,
    plaquesExport = 200,
    coc = 150,
    formalitesAdmin = 200,
    margeSecurity = 300,
  } = simulatorConfig

  // Coûts individuels
  const serviceFeeEstimate = honoraires ?? 0
  const exportPlateEstimate = (cpiWw ?? 0) + (plaquesExport ?? 0)
  const administrativeCostEstimate = (fraisDossier ?? 0) + (coc ?? 0) + (formalitesAdmin ?? 0)

  // Le malus est estimé à 0 dans la config de base (absent de SimulatorConfig actuel)
  const residualMalusEstimate = 0

  // Transport : non présent dans SimulatorConfig — valeur fixe standard (rapatriement Allemagne)
  // Estimé à 300€ en moyenne pour un transfert depuis l'Allemagne
  const transportEstimate = 300

  // Taxe d'immatriculation / contrôle : incluse dans cpiWw (contrôle technique import)
  const registrationTaxEstimate = 0

  // Calcul total (sans override)
  const computedTotal =
    transportEstimate +
    exportPlateEstimate +
    registrationTaxEstimate +
    residualMalusEstimate +
    administrativeCostEstimate +
    serviceFeeEstimate +
    (margeSecurity ?? 0)

  // Si importCostOverride est défini, l'utiliser comme total
  const totalImportCostEstimate =
    importCostOverride != null && importCostOverride > 0 ? importCostOverride : computedTotal

  return {
    transportEstimate,
    exportPlateEstimate,
    registrationTaxEstimate,
    residualMalusEstimate,
    administrativeCostEstimate,
    serviceFeeEstimate,
    totalImportCostEstimate,
  }
}
