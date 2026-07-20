/**
 * normalizeListing.ts
 *
 * Normalise une annonce brute (RawMarketListing) en NormalizedListing.
 * - Normalise les noms de marques et modèles
 * - Extrait la génération (F56, G20, etc.)
 * - Détecte le type de carrosserie
 * - Convertit la puissance (kW → HP, PS/CH/CV → HP)
 * - Normalise la transmission et le carburant
 * - Détecte le type de vendeur et de TVA
 * - Produit un score de confiance (0-100)
 */

import type { RawMarketListing, NormalizedListing } from './types'

// ── Tables de normalisation ───────────────────────────────────────────────────

const BRAND_MAP: Record<string, string> = {
  mini: 'MINI',
  bmw: 'BMW',
  mercedes: 'Mercedes-Benz',
  'mercedes-benz': 'Mercedes-Benz',
  mercedesbenz: 'Mercedes-Benz',
  audi: 'Audi',
  volkswagen: 'Volkswagen',
  vw: 'Volkswagen',
  porsche: 'Porsche',
  'alfa-romeo': 'Alfa Romeo',
  alfaromeo: 'Alfa Romeo',
  ford: 'Ford',
  volvo: 'Volvo',
  toyota: 'Toyota',
  renault: 'Renault',
  opel: 'Opel',
  'land-rover': 'Land Rover',
  landrover: 'Land Rover',
  jaguar: 'Jaguar',
  lexus: 'Lexus',
  maserati: 'Maserati',
  ferrari: 'Ferrari',
  lamborghini: 'Lamborghini',
  mclaren: 'McLaren',
  bentley: 'Bentley',
  rollsroyce: 'Rolls-Royce',
  'rolls-royce': 'Rolls-Royce',
  mazda: 'Mazda',
  mg: 'MG',
}

const FUEL_MAP: Record<string, string> = {
  // German
  benzin: 'petrol',
  super: 'petrol',
  kraftstoff: 'petrol',
  diesel: 'diesel',
  elektro: 'electric',
  elektrisch: 'electric',
  hybrid: 'hybrid',
  'plug-in-hybrid': 'plugin-hybrid',
  'plug-in hybrid': 'plugin-hybrid',
  phev: 'plugin-hybrid',
  // French
  essence: 'petrol',
  electrique: 'electric',
  électrique: 'electric',
  hybride: 'hybrid',
  'hybride rechargeable': 'plugin-hybrid',
  // English
  petrol: 'petrol',
  gasoline: 'petrol',
  electric: 'electric',
  'plug-in': 'plugin-hybrid',
  // Generic
  gas: 'petrol',
  ev: 'electric',
}

const TRANSMISSION_MAP: Record<string, 'manual' | 'automatic'> = {
  // German
  schaltgetriebe: 'manual',
  schaltung: 'manual',
  manuell: 'manual',
  'manuelles getriebe': 'manual',
  automatik: 'automatic',
  automatisch: 'automatic',
  automat: 'automatic',
  dsg: 'automatic',
  'dual-clutch': 'automatic',
  doppelkupplung: 'automatic',
  sequenziell: 'automatic',
  stufenlos: 'automatic',
  cvt: 'automatic',
  // French
  manuelle: 'manual',
  automatique: 'automatic',
  // English
  manual: 'manual',
  automatic: 'automatic',
  auto: 'automatic',
}

const BODY_TYPE_MAP: Record<string, string> = {
  // German
  limousine: 'sedan',
  stufenheck: 'sedan',
  kombi: 'wagon',
  'sport tourer': 'wagon',
  sportwagen: 'coupe',
  coupé: 'coupe',
  coupe: 'coupe',
  kabriolett: 'convertible',
  cabrio: 'convertible',
  cabriolet: 'convertible',
  roadster: 'convertible',
  suv: 'suv',
  geländewagen: 'suv',
  gelände: 'suv',
  van: 'van',
  minivan: 'van',
  kleinwagen: 'hatchback',
  // French
  berline: 'sedan',
  break: 'wagon',
  décapotable: 'convertible',
  // English
  sedan: 'sedan',
  saloon: 'sedan',
  estate: 'wagon',
  touring: 'touring',
  convertible: 'convertible',
  hatchback: 'hatchback',
  crossover: 'suv',
  sportback: 'sportback',
}

// Patterns de génération automobiles connus
const GENERATION_PATTERNS: Array<{ regex: RegExp; generation: string }> = [
  { regex: /\bF56\b/i, generation: 'F56' },
  { regex: /\bF55\b/i, generation: 'F55' },
  { regex: /\bF57\b/i, generation: 'F57' },
  { regex: /\bF54\b/i, generation: 'F54' },
  { regex: /\bF60\b/i, generation: 'F60' },
  { regex: /\bG20\b/i, generation: 'G20' },
  { regex: /\bG21\b/i, generation: 'G21' },
  { regex: /\bG30\b/i, generation: 'G30' },
  { regex: /\bG11\b/i, generation: 'G11' },
  { regex: /\bF10\b/i, generation: 'F10' },
  { regex: /\bF30\b/i, generation: 'F30' },
  { regex: /\bF31\b/i, generation: 'F31' },
  { regex: /\bE90\b/i, generation: 'E90' },
  { regex: /\bE91\b/i, generation: 'E91' },
  { regex: /\bW213\b/i, generation: 'W213' },
  { regex: /\bW205\b/i, generation: 'W205' },
  { regex: /\bB8\b/i, generation: 'B8' },
  { regex: /\bB9\b/i, generation: 'B9' },
]

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Normalise un nom de marque
 */
function normalizeBrand(raw: string): string | undefined {
  const key = raw.toLowerCase().trim().replace(/\s+/g, '-')
  return BRAND_MAP[key] ?? BRAND_MAP[raw.toLowerCase().trim()] ?? (raw.trim() || undefined)
}

/**
 * Normalise un modèle (trim + title-case basique)
 */
function normalizeModel(raw: string): string | undefined {
  if (!raw.trim()) return undefined
  return raw.trim()
}

/**
 * Convertit la puissance vers HP
 * - kW → HP : multiply by 1.36
 * - PS/CH/CV → HP : multiply by 0.9863
 */
function normalizePowerToHp(raw: string | undefined, rawHp: number | undefined): number | undefined {
  // Si on a déjà un nombre HP/CV, utiliser directement
  if (rawHp !== undefined && rawHp > 0) return Math.round(rawHp)

  if (!raw) return undefined

  // Pattern: "147 kW / 200 PS" → extraire PS
  const kwAndPs = raw.match(/(\d+(?:[.,]\d+)?)\s*kW\s*[/\\]\s*(\d+(?:[.,]\d+)?)\s*(?:ps|ch|hp|cv)/i)
  if (kwAndPs) {
    const ps = parseFloat(kwAndPs[2].replace(',', '.'))
    return Math.round(ps * 0.9863)
  }

  // Pattern: "200 PS" ou "200 CH" ou "200 CV" ou "200 HP"
  const psMatch = raw.match(/(\d+(?:[.,]\d+)?)\s*(?:ps|ch|hp|cv)\b/i)
  if (psMatch) {
    const ps = parseFloat(psMatch[1].replace(',', '.'))
    return Math.round(ps * 0.9863)
  }

  // Pattern: "147 kW"
  const kwMatch = raw.match(/(\d+(?:[.,]\d+)?)\s*kw\b/i)
  if (kwMatch) {
    const kw = parseFloat(kwMatch[1].replace(',', '.'))
    return Math.round(kw * 1.36)
  }

  return undefined
}

/**
 * Normalise la transmission
 */
function normalizeTransmission(raw: string | undefined): 'manual' | 'automatic' | undefined {
  if (!raw) return undefined
  const key = raw.toLowerCase().trim()
  // Check direct match first
  if (TRANSMISSION_MAP[key] !== undefined) return TRANSMISSION_MAP[key]
  // Check partial match
  for (const [pattern, normalized] of Object.entries(TRANSMISSION_MAP)) {
    if (key.includes(pattern)) return normalized
  }
  return undefined
}

/**
 * Normalise le carburant
 */
function normalizeFuel(raw: string | undefined): string | undefined {
  if (!raw) return undefined
  const key = raw.toLowerCase().trim()
  if (FUEL_MAP[key] !== undefined) return FUEL_MAP[key]
  for (const [pattern, normalized] of Object.entries(FUEL_MAP)) {
    if (key.includes(pattern)) return normalized
  }
  return undefined
}

/**
 * Normalise le type de carrosserie
 */
function normalizeBodyType(raw: string | undefined): string | undefined {
  if (!raw) return undefined
  const key = raw.toLowerCase().trim()
  if (BODY_TYPE_MAP[key] !== undefined) return BODY_TYPE_MAP[key]
  for (const [pattern, normalized] of Object.entries(BODY_TYPE_MAP)) {
    if (key.includes(pattern)) return normalized
  }
  return undefined
}

/**
 * Extrait la génération depuis titre/modèle
 */
function extractGeneration(title: string | undefined, model: string | undefined): string | undefined {
  const searchStr = `${title ?? ''} ${model ?? ''}`
  for (const { regex, generation } of GENERATION_PATTERNS) {
    if (regex.test(searchStr)) return generation
  }
  return undefined
}

/**
 * Détecte le type de vendeur
 */
function detectSellerType(
  sellerType: string | undefined,
  dealer: string | undefined,
): 'professional' | 'private' | 'unknown' {
  if (sellerType) {
    const low = sellerType.toLowerCase()
    if (
      low.includes('professional') ||
      low.includes('dealer') ||
      low.includes('händler') ||
      low.includes('professionnel') ||
      low.includes('gmbh') ||
      low.includes('ag') ||
      low === 'd' ||
      low === 'pro'
    ) return 'professional'
    if (
      low.includes('private') ||
      low.includes('privat') ||
      low.includes('particulier') ||
      low === 'p'
    ) return 'private'
  }
  // Heuristic: professional dealers often have corporate suffix in name
  if (dealer) {
    const dLow = dealer.toLowerCase()
    if (/\b(gmbh|ag|kg|e\.k\.|sarl|sas|auto|automobil|zentrum|group|motors|garage)\b/.test(dLow)) {
      return 'professional'
    }
  }
  return 'unknown'
}

/**
 * Calcule le score de confiance (0-100)
 * Basé sur le nombre de champs bien normalisés
 */
function calcConfidence(listing: Partial<NormalizedListing>): number {
  let score = 0
  const max = 100

  if (listing.normalizedMake) score += 15
  if (listing.normalizedModel) score += 15
  if (listing.price && listing.price > 0) score += 20
  if (listing.year && listing.year > 1990) score += 10
  if (listing.mileage !== undefined) score += 10
  if (listing.normalizedFuel) score += 10
  if (listing.normalizedTransmission) score += 5
  if (listing.powerHpNormalized) score += 10
  if (listing.normalizedBodyType) score += 5

  return Math.min(score, max)
}

// ── Fonction principale ───────────────────────────────────────────────────────

export function normalizeListing(raw: RawMarketListing): NormalizedListing {
  // Extraire marque/modèle depuis le titre si pas fourni directement
  const titleParts = raw.title?.trim().split(/\s+/) ?? []
  const inferredMake = titleParts[0] ?? ''
  const inferredModel = titleParts.slice(1, 3).join(' ')

  const normalizedMake = normalizeBrand(inferredMake) ?? (raw.dealer ? normalizeBrand(raw.dealer) : undefined)
  const normalizedModel = normalizeModel(inferredModel || raw.title?.split(' ').slice(1).join(' ') || '')

  const normalizedFuel = normalizeFuel(raw.fuel)
  const normalizedTransmission = normalizeTransmission(raw.transmission)
  const normalizedBodyType = normalizeBodyType(raw.bodyType)
  const normalizedGeneration = extractGeneration(raw.title, normalizedModel)
  const powerHpNormalized = normalizePowerToHp(undefined, raw.powerHp)
  const normalizedSellerType = detectSellerType(raw.sellerType, raw.dealer)

  const partial: Partial<NormalizedListing> = {
    ...raw,
    normalizedMake,
    normalizedModel: normalizedModel || undefined,
    normalizedGeneration: normalizedGeneration || undefined,
    normalizedFuel: normalizedFuel || undefined,
    normalizedTransmission: normalizedTransmission || undefined,
    normalizedBodyType: normalizedBodyType || undefined,
    normalizedSellerType,
    powerHpNormalized,
  }

  const normalizationConfidence = calcConfidence(partial)

  return {
    ...raw,
    normalizedMake,
    normalizedModel: normalizedModel || undefined,
    normalizedGeneration: normalizedGeneration || undefined,
    normalizedFuel: normalizedFuel || undefined,
    normalizedTransmission: normalizedTransmission || undefined,
    normalizedBodyType: normalizedBodyType || undefined,
    normalizedSellerType,
    normalizedVatType: 'unknown',
    powerHpNormalized,
    normalizationConfidence,
  }
}
