/**
 * types.ts
 *
 * Types partagés de la couche de normalisation des données véhicule.
 * Aucun effet de bord — types purs.
 */

// ─── Qualité de la donnée ─────────────────────────────────────────────────────

export type DataQuality =
  | 'verified'     // Source primaire fiable (__NEXT_DATA__, JSON-LD structuré)
  | 'inferred'     // Heuristique DOM, regex, calcul
  | 'placeholder'  // Valeur de remplissage reconnue (ImporteMoi, N/A, À renseigner…)
  | 'missing'      // Champ absent ou vide dans la source
  | 'manual'       // Saisie manuellement via l'admin CMS (protégé contre l'écrasement)

// ─── Provenance ───────────────────────────────────────────────────────────────

export type DataSource =
  | 'autoscout24.nextdata'   // __NEXT_DATA__ JSON SSR (fiable)
  | 'autoscout24.jsonld'     // JSON-LD schema.org (fiable)
  | 'autoscout24.xhr'        // Interception XHR réseau (fiable)
  | 'autoscout24.import'     // Page de résultats 1re passe (moins fiable)
  | 'autoscout24.dom'        // Extraction DOM heuristique (moins fiable)
  | 'mobile.de'              // Future source
  | 'xml.feed'               // Future source flux XML
  | 'api.direct'             // Future source API constructeur/distributeur
  | 'admin'                  // Saisie CMS (priorité maximale)
  | 'unknown'

// ─── Raisons de skip ─────────────────────────────────────────────────────────

export type SkipReason =
  | 'already_set'        // Valeur existante protégée (qualité ≥ entrante ou manual)
  | 'source_empty'       // Source n'a pas fourni de valeur
  | 'quality_too_low'    // Qualité entrante inférieure à l'existant
  | 'validation_failed'  // Valeur hors plage ou format invalide
  | 'placeholder'        // Valeur reconnue comme placeholder à ne pas persister
  | 'private_seller'     // Annonce de particulier — ne pas écrire comme dealer

// ─── Éligibilité vendeur ──────────────────────────────────────────────────────

/**
 * Indique si le vendeur est un professionnel, un particulier, ou non identifiable.
 * Utilisé pour décider d'importer ou non un véhicule.
 *
 * Règles :
 * - 'private_seller_not_eligible' → ne pas importer (nouveau véhicule)
 * - 'seller_unknown' → neutre, ne pas rejeter automatiquement
 * - 'eligible_professional_seller' → import autorisé
 */
export type VehicleEligibilityReason =
  | 'eligible_professional_seller'
  | 'private_seller_not_eligible'
  | 'seller_unknown'

// ─── Champ normalisé ─────────────────────────────────────────────────────────

export interface NormalizedField<T> {
  /** Valeur normalisée prête à l'écriture. null = ne pas écrire. */
  value: T | null

  /** Qualité de la valeur */
  quality: DataQuality

  /** Source ayant produit cette valeur */
  source: DataSource

  /**
   * Confiance 0–1.
   * 1.0 = certitude absolue | 0.5 = heuristique | 0.0 = absent/non fiable
   */
  confidence: number

  /** Raison de l'exclusion si value === null */
  skipReason?: SkipReason

  /** Valeur brute avant normalisation (debugging) */
  raw?: unknown
}

// ─── Décision de merge ───────────────────────────────────────────────────────

export interface MergeDecision {
  field: string
  action: 'write' | 'skip'
  incoming: NormalizedField<unknown>
  /** Qualité de la valeur existante en base (si connue) */
  existingQuality?: DataQuality
  reason: string
}

// ─── Données entrantes ───────────────────────────────────────────────────────

export interface IncomingVehicleData {
  source: DataSource
  price?: number
  mileage?: number
  dealer?: string
  dealerCity?: string
  imageUrls?: string[]
  description?: string
  features?: string[]
  exteriorColor?: string
  interiorColor?: string
  doors?: number
  seats?: number
  specifications?: {
    power?: string
    powerKw?: number
    powerHp?: number
  }
}

// ─── Données existantes ──────────────────────────────────────────────────────

export interface ExistingVehicleData {
  price?: number | null
  mileage?: number | null
  dealer?: string | null
  dealerCity?: string | null
  imageUrls?: Array<{ url: string }> | null
  description?: string | null
  features?: Array<{ feature: string }> | null
  exteriorColor?: string | null
  interiorColor?: string | null
  doors?: number | null
  seats?: number | null
  specifications?: {
    power?: string | null
    powerKw?: number | null
    powerHp?: number | null
  } | null
}

// ─── Résultat de normalisation ───────────────────────────────────────────────

export interface NormalizationResult {
  /** Patch prêt pour payload.update() */
  patch: Record<string, unknown>
  /** Détail champ par champ pour logging/audit */
  decisions: MergeDecision[]
  /** Champs effectivement modifiés (hors métadonnées lastScrapedAt) */
  appliedFields: string[]
  /** true si patch vide — rien à écrire */
  noop: boolean
  /**
   * Éligibilité du vendeur.
   * L'appelant doit vérifier ceci AVANT d'appeler payload.create().
   * Ne pas rejeter 'seller_unknown' sans preuve supplémentaire.
   */
  eligibility: VehicleEligibilityReason
}
