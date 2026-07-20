/**
 * src/lib/normalizers/index.ts
 *
 * Point d'entrée public de la couche de normalisation.
 * Les endpoints et scripts importent depuis ici.
 *
 * @example
 *   import { normalizeVehicle, normalizeDealer } from '@/lib/normalizers'
 */

export type {
  DataQuality,
  DataSource,
  SkipReason,
  VehicleEligibilityReason,
  NormalizedField,
  MergeDecision,
  IncomingVehicleData,
  ExistingVehicleData,
  NormalizationResult,
} from './types.js'

export { normalizeVehicle } from './normalizeVehicle.js'
export { normalizeDealer } from './normalizeDealer.js'
export type { NormalizeDealerResult, ExistingDealerData } from './normalizeDealer.js'
export { normalizePrice } from './normalizePrice.js'
export { normalizeMileage } from './normalizeMileage.js'
export { normalizeImages } from './normalizeImages.js'
export { normalizeTextField, normalizeStringArray } from './normalizeTextField.js'
export { normalizeNumericField } from './normalizeNumericField.js'
export { normalizeSpecifications } from './normalizeSpecifications.js'
