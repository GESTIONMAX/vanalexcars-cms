/**
 * normalizeDealer.ts
 *
 * Évalue si le nom de concessionnaire entrant est fiable,
 * détecte les vendeurs particuliers et les valeurs placeholder,
 * décide si la valeur peut remplacer l'existante.
 *
 * ─── DEUX LISTES DISTINCTES — ne pas confondre ────────────────────────────────
 *
 * 1. PRIVATE_SELLER_PATTERNS
 *    Indications explicites de vente entre particuliers ("Privat", "Particulier"…).
 *    → eligibility: 'private_seller_not_eligible' — motif de rejet à l'import.
 *
 * 2. DEALER_PLACEHOLDERS
 *    Valeurs de remplissage génériques vides de sens ("N/A", "À renseigner"…).
 *    → skipReason: 'placeholder' — ne pas persister, sans jugement sur le vendeur.
 *
 * Note historique :
 *    ImporteMoi était une ancienne source scrapée dont certains véhicules
 *    avaient dealer = "ImporteMoi". Cette anomalie de modélisation a été
 *    corrigée par la migration migrate-importemoi-dealer.ts (2026-07-20).
 *    Aucun traitement spécifique n'est nécessaire ici.
 *
 * @see docs/architecture-normalisation.md
 */

import type {
  DataQuality,
  DataSource,
  NormalizedField,
  VehicleEligibilityReason,
} from './types.js'

// ─── 1. Vendeurs particuliers ────────────────────────────────────────────────
// Indications explicites de vente entre particuliers → inéligibles à l'import.

const PRIVATE_SELLER_PATTERNS: RegExp[] = [
  /^particulier$/i,
  /^privat(verkauf)?$/i,      // "Privat" ou "Privatverkauf" (allemand)
  /^privé$/i,
  /^private(\s+seller)?$/i,
  /^vendeur\s+particulier$/i,
  /^privatperson$/i,
  /^privado$/i,               // espagnol
  /^privato$/i,               // italien
]

// ─── 2. Placeholders génériques ──────────────────────────────────────────────
// Valeurs vides de sens — pas d'information sur le vendeur.

const DEALER_PLACEHOLDERS: RegExp[] = [
  /^n\/a$/i,
  /^na$/i,
  /^à renseigner$/i,
  /^inconnu$/i,
  /^unknown$/i,
  /^-+$/,
  /^\.+$/,
]

// ─── Helpers ─────────────────────────────────────────────────────────────────

function sourceConfidence(source: DataSource): number {
  switch (source) {
    case 'admin':                    return 1.0
    case 'autoscout24.nextdata':     return 0.9
    case 'autoscout24.jsonld':       return 0.85
    case 'autoscout24.xhr':          return 0.85
    case 'autoscout24.import':       return 0.7
    case 'autoscout24.dom':          return 0.5
    default:                         return 0.4
  }
}

function isPrivateSeller(name: string): boolean {
  return PRIVATE_SELLER_PATTERNS.some((p) => p.test(name))
}

function isPlaceholder(name: string): boolean {
  return DEALER_PLACEHOLDERS.some((p) => p.test(name))
}

/**
 * Retourne true si le nom de dealer existant est "protégé" (ne pas écraser).
 * N'est PAS protégé : placeholder générique, valeur vide, nom de particulier.
 */
function isExistingProtected(
  existing: ExistingDealerData | undefined,
  confidence: number,
): boolean {
  if (!existing) return false
  if (existing.quality === 'manual') return true
  const name = existing.name?.trim() ?? ''
  if (name === '') return false
  if (isPrivateSeller(name) || isPlaceholder(name)) return false
  // Vrai dealer existant — protégé si la confiance entrante est insuffisante
  return confidence < 0.85
}

// ─── Types publics ────────────────────────────────────────────────────────────

export interface ExistingDealerData {
  /** Nom de concessionnaire actuellement stocké */
  name?: string | null
  /** Ville actuellement stockée */
  city?: string | null
  /** Qualité connue ('manual' si saisi via admin) */
  quality?: DataQuality
}

export interface NormalizeDealerResult {
  name: NormalizedField<string>
  city: NormalizedField<string>
  /** Éligibilité à l'import basée sur le nom de dealer entrant */
  eligibility: VehicleEligibilityReason
}

// ─── Fonction principale ──────────────────────────────────────────────────────

export function normalizeDealer(
  incoming: { name?: string; city?: string; source: DataSource },
  existing?: ExistingDealerData,
): NormalizeDealerResult {
  const rawName = incoming.name?.trim() ?? ''
  const rawCity = incoming.city?.trim() ?? ''
  const conf = sourceConfidence(incoming.source)

  // ── Classifier le nom entrant ─────────────────────────────────────────────
  const nameEmpty = rawName === ''
  const nameIsPrivate = !nameEmpty && isPrivateSeller(rawName)
  const nameIsPlaceholder = !nameEmpty && !nameIsPrivate && isPlaceholder(rawName)
  const nameIsReal = !nameEmpty && !nameIsPrivate && !nameIsPlaceholder

  // ── Éligibilité ───────────────────────────────────────────────────────────
  let eligibility: VehicleEligibilityReason
  if (nameIsPrivate) {
    eligibility = 'private_seller_not_eligible'
  } else if (nameIsReal) {
    eligibility = 'eligible_professional_seller'
  } else {
    eligibility = 'seller_unknown'
  }

  // ── Normaliser le nom ─────────────────────────────────────────────────────
  let name: NormalizedField<string>

  if (nameEmpty) {
    name = {
      value: null, quality: 'missing', source: incoming.source,
      confidence: 0, skipReason: 'source_empty', raw: incoming.name,
    }
  } else if (nameIsPrivate) {
    name = {
      value: null, quality: 'placeholder', source: incoming.source,
      confidence: conf, skipReason: 'private_seller', raw: rawName,
    }
  } else if (nameIsPlaceholder) {
    name = {
      value: null, quality: 'placeholder', source: incoming.source,
      confidence: conf, skipReason: 'placeholder', raw: rawName,
    }
  } else {
    // Vrai nom de dealer
    if (existing?.quality === 'manual') {
      name = {
        value: null, quality: 'verified', source: incoming.source,
        confidence: conf, skipReason: 'already_set', raw: rawName,
      }
    } else if (isExistingProtected(existing, conf)) {
      name = {
        value: null, quality: conf >= 0.85 ? 'verified' : 'inferred',
        source: incoming.source, confidence: conf, skipReason: 'quality_too_low', raw: rawName,
      }
    } else {
      const quality: DataQuality = conf >= 0.85 ? 'verified' : 'inferred'
      name = { value: rawName, quality, source: incoming.source, confidence: conf, raw: rawName }
    }
  }

  // ── Normaliser la ville ───────────────────────────────────────────────────
  let city: NormalizedField<string>

  if (rawCity === '') {
    city = {
      value: null, quality: 'missing', source: incoming.source,
      confidence: 0, skipReason: 'source_empty', raw: incoming.city,
    }
  } else if (existing?.quality === 'manual') {
    city = {
      value: null, quality: 'manual', source: incoming.source,
      confidence: conf, skipReason: 'already_set', raw: rawCity,
    }
  } else if (existing?.city && existing.city.trim() !== '') {
    city = {
      value: null, quality: conf >= 0.85 ? 'verified' : 'inferred',
      source: incoming.source, confidence: conf, skipReason: 'already_set', raw: rawCity,
    }
  } else {
    const quality: DataQuality = conf >= 0.85 ? 'verified' : 'inferred'
    city = { value: rawCity, quality, source: incoming.source, confidence: conf, raw: rawCity }
  }

  return { name, city, eligibility }
}
