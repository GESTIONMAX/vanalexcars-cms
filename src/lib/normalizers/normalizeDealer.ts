/**
 * normalizeDealer.ts
 *
 * Évalue si le nom de concessionnaire entrant est fiable,
 * détecte les particuliers et les placeholders,
 * décide si la valeur peut remplacer l'existante.
 *
 * IMPORTANT — deux listes distinctes :
 *  - PRIVATE_SELLER_PATTERNS : annonces de particuliers → inéligibles à l'import
 *  - DEALER_PLACEHOLDERS     : valeurs de remplissage héritées (ex: ImporteMoi)
 *                               → qualité 'placeholder', origine inconnue, pas de rejet
 */

import type {
  DataQuality,
  DataSource,
  NormalizedField,
  VehicleEligibilityReason,
} from './types.js'

// ─── Patterns particuliers ────────────────────────────────────────────────────
// Indications explicites de vente entre particuliers → motif d'inéligibilité.

const PRIVATE_SELLER_PATTERNS: RegExp[] = [
  /^particulier$/i,
  /^privat(verkauf)?$/i,   // "Privat" ou "Privatverkauf" (allemand)
  /^privé$/i,
  /^private(\s+seller)?$/i,
  /^vendeur\s+particulier$/i,
  /^privatperson$/i,
  /^privado$/i,            // espagnol
  /^privato$/i,            // italien
]

// ─── Patterns placeholder ─────────────────────────────────────────────────────
// Valeurs de remplissage héritées d'intermédiaires historiques ou de systèmes tiers.
// Ne pas confondre avec une annonce de particulier — l'origine réelle est inconnue.

const DEALER_PLACEHOLDERS: RegExp[] = [
  /importemoi/i,       // ImporteMoi (intermédiaire historique)
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
 * Un dealer est protégé si :
 *   - il est marqué 'manual' (saisi via admin)
 *   - il est non-vide ET n'est pas lui-même un placeholder
 *
 * Un placeholder existant (ex: "ImporteMoi") n'est PAS protégé.
 */
function isExistingProtected(
  existing: ExistingDealerData | undefined,
  confidence: number,
): boolean {
  if (!existing) return false
  if (existing.quality === 'manual') return true
  const name = existing.name?.trim() ?? ''
  if (name === '') return false
  if (isPlaceholder(name) || isPrivateSeller(name)) return false
  // Existing is a real dealer name — protect if incoming confidence is lower
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

  // ── Classify incoming name ────────────────────────────────────────────────
  const nameEmpty = rawName === ''
  const nameIsPrivate = !nameEmpty && isPrivateSeller(rawName)
  const nameIsPlaceholder = !nameEmpty && !nameIsPrivate && isPlaceholder(rawName)
  const nameIsReal = !nameEmpty && !nameIsPrivate && !nameIsPlaceholder

  // ── Eligibility ───────────────────────────────────────────────────────────
  let eligibility: VehicleEligibilityReason
  if (nameIsPrivate) {
    eligibility = 'private_seller_not_eligible'
  } else if (nameIsReal) {
    eligibility = 'eligible_professional_seller'
  } else {
    eligibility = 'seller_unknown' // empty or placeholder
  }

  // ── Normalize name ────────────────────────────────────────────────────────
  let name: NormalizedField<string>

  if (nameEmpty) {
    name = { value: null, quality: 'missing', source: incoming.source, confidence: 0, skipReason: 'source_empty', raw: incoming.name }
  } else if (nameIsPrivate) {
    // Do NOT write "Particulier" / "Privat" as a dealer name
    name = { value: null, quality: 'placeholder', source: incoming.source, confidence: conf, skipReason: 'private_seller', raw: rawName }
  } else if (nameIsPlaceholder) {
    // Do NOT persist the placeholder as-is
    name = { value: null, quality: 'placeholder', source: incoming.source, confidence: conf, skipReason: 'placeholder', raw: rawName }
  } else {
    // Real dealer name
    if (existing?.quality === 'manual') {
      name = { value: null, quality: 'verified', source: incoming.source, confidence: conf, skipReason: 'already_set', raw: rawName }
    } else if (isExistingProtected(existing, conf)) {
      name = { value: null, quality: conf >= 0.85 ? 'verified' : 'inferred', source: incoming.source, confidence: conf, skipReason: 'quality_too_low', raw: rawName }
    } else {
      const quality: DataQuality = conf >= 0.85 ? 'verified' : 'inferred'
      name = { value: rawName, quality, source: incoming.source, confidence: conf, raw: rawName }
    }
  }

  // ── Normalize city ────────────────────────────────────────────────────────
  let city: NormalizedField<string>

  if (rawCity === '') {
    city = { value: null, quality: 'missing', source: incoming.source, confidence: 0, skipReason: 'source_empty', raw: incoming.city }
  } else if (existing?.quality === 'manual') {
    city = { value: null, quality: 'manual', source: incoming.source, confidence: conf, skipReason: 'already_set', raw: rawCity }
  } else if (existing?.city && existing.city.trim() !== '') {
    // City already set — only overwrite with a more confident source
    city = { value: null, quality: conf >= 0.85 ? 'verified' : 'inferred', source: incoming.source, confidence: conf, skipReason: 'already_set', raw: rawCity }
  } else {
    const quality: DataQuality = conf >= 0.85 ? 'verified' : 'inferred'
    city = { value: rawCity, quality, source: incoming.source, confidence: conf, raw: rawCity }
  }

  return { name, city, eligibility }
}
