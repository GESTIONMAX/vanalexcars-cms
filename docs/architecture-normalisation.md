# Architecture — Couche de normalisation des données véhicule

> Proposition d'architecture — lecture seule, aucune modification de code.
> Contexte : supprimer la logique métier dispersée dans les endpoints et scripts,
> préparer l'ajout futur de nouvelles sources (Mobile.de, XML flux, API directe).

---

## 1. Problème actuel

### 1a. Logique métier fragmentée

La même règle de merge peut exister en 3 endroits distincts :

```
src/endpoints/bulkEnrich.ts      ligne 272  → override dealer si /importemoi/i
src/endpoints/enrichVehicle.ts   ligne 128  → même règle
src/scripts/bulk-enrich.ts       ligne 134  → même règle (copie)
```

Toute modification de cette règle exige 3 éditions synchronisées. Un oubli crée une divergence silencieuse.

### 1b. Décisions métier couplées aux sources

La condition `if (v.dealer && !/importemoi/i.test(v.dealer))` mélange deux préoccupations :
- **Connaissance source** : « importemoi » est un intermédiaire qui produit des données incomplètes
- **Règle métier** : un dealer placeholder ne doit pas bloquer le remplacement par une meilleure valeur

Ces deux niveaux doivent être séparés.

### 1c. Opacité des décisions

Quand un champ n'est pas mis à jour, la raison n'est pas tracée. On ne sait pas si c'est parce que la valeur était déjà correcte, parce que la source n'a rien retourné, ou parce qu'une règle l'a exclu.

### 1d. Extension impossible sans refactoring

Ajouter Mobile.de comme source imposerait de dupliquer toute la logique de merge dans chaque endpoint, ou d'ajouter des branchements `if (source === 'mobile.de')` dans le code existant.

---

## 2. Objectif de la couche de normalisation

Créer un module `src/lib/normalizers/` qui concentre **toutes les décisions de qualité de données** :

- Évaluer la qualité d'une valeur (vérifiée, placeholder, absente, saisie manuellement)
- Calculer la provenance (quelle source, quelle passe d'extraction)
- Décider si une valeur entrante peut remplacer une valeur existante (règle de merge)
- Retourner une structure riche permettant la traçabilité

Les endpoints et scripts ne font plus que :
1. Récupérer les données brutes depuis une source
2. Appeler les normaliseurs
3. Appliquer le patch retourné

---

## 3. Structures de données

### 3a. `DataQuality` — qualité d'une valeur

```typescript
type DataQuality =
  | 'verified'     // Vérifiée sur une source primaire fiable (AS24 __NEXT_DATA__, JSON-LD)
  | 'inferred'     // Déduite par heuristique (DOM scraping, regex)
  | 'placeholder'  // Valeur de remplissage reconnue comme non fiable (ex: ImporteMoi)
  | 'missing'      // Champ absent ou vide dans la source
  | 'manual'       // Saisie manuellement dans l'admin CMS
```

### 3b. `DataSource` — provenance

```typescript
type DataSource =
  | 'autoscout24.nextdata'   // __NEXT_DATA__ JSON SSR
  | 'autoscout24.jsonld'     // JSON-LD schema.org
  | 'autoscout24.dom'        // Extraction DOM (heuristique)
  | 'autoscout24.xhr'        // Interception XHR réseau
  | 'autoscout24.import'     // Données issues de la page de résultats (1re passe)
  | 'mobile.de'              // Future source
  | 'xml.feed'               // Future source flux XML
  | 'api.direct'             // Future source API constructeur/distributeur
  | 'admin'                  // Saisie CMS
  | 'unknown'
```

### 3b-bis. `VehicleEligibilityReason` — éligibilité à l'import

Le catalogue VanalexCars est strictement réservé aux véhicules de **concessionnaires ou vendeurs professionnels**. Les annonces de particuliers ne doivent pas être importées.

```typescript
type VehicleEligibilityReason =
  | 'eligible_professional_seller'    // Concessionnaire ou vendeur pro identifié
  | 'private_seller_not_eligible'     // Annonce explicitement d'un particulier → rejet
  | 'seller_unknown'                  // Dealer absent, placeholder, ou non identifiable
                                      // → NE PAS rejeter automatiquement (pas de preuve)
```

**Distinctions critiques :**

| Valeur dealer | Classification | Motif | Action import |
|---------------|---------------|-------|---------------|
| `"BMW München GmbH"` | `eligible_professional_seller` | Nom de concessionnaire reconnu | Autorisé |
| `"AutoHaus Berlin"` | `eligible_professional_seller` | Vendeur professionnel | Autorisé |
| `"Particulier"`, `"Privat"`, `"Privé"` | `private_seller_not_eligible` | Indication explicite de vente entre particuliers | **Rejeté** |
| `"ImporteMoi"`, `"N/A"`, `"À renseigner"` | `seller_unknown` | Placeholder hérité — origine inconnue | Autorisé (neutre) |
| vide / absent | `seller_unknown` | Aucune information | Autorisé (neutre) |

**Règle pour les véhicules existants :** si un véhicule déjà importé est identifié comme particulier pendant un enrichissement (ex. AS24 affiche "Privat"), ne pas le désactiver automatiquement. Retourner `eligibility: 'private_seller_not_eligible'` dans la `NormalizationResult` pour que la logique métier aval décide.

### 3c. `NormalizedField<T>` — résultat d'un normaliseur

```typescript
interface NormalizedField<T> {
  /** Valeur normalisée prête à l'écriture en base. null = ne pas écrire. */
  value: T | null

  /** Qualité de la valeur normalisée */
  quality: DataQuality

  /** Source ayant produit cette valeur */
  source: DataSource

  /**
   * Score de confiance 0–1.
   * 1.0 = certitude absolue (extrait d'un JSON structuré signé par la plateforme)
   * 0.5 = heuristique DOM
   * 0.0 = valeur absente ou non fiable
   */
  confidence: number

  /**
   * Raison de l'exclusion si value === null.
   * undefined si value est fourni.
   */
  skipReason?:
    | 'already_set'        // Champ existant de qualité supérieure ou égale
    | 'source_empty'       // Source n'a pas fourni cette valeur
    | 'quality_too_low'    // Qualité de la valeur entrante inférieure à l'existant
    | 'validation_failed'  // Valeur hors plage, format invalide, etc.
    | 'placeholder'        // Valeur reconnue comme placeholder à ne pas persister
    | 'private_seller'     // Annonce de particulier — ne pas écrire comme dealer

  /** Valeur brute avant normalisation (pour debugging) */
  raw?: unknown
}
```

### 3d. `MergeDecision` — résultat du merge champ par champ

```typescript
interface MergeDecision {
  field: string
  action: 'write' | 'skip'
  incoming: NormalizedField<unknown>
  /** Qualité de la valeur existante en base (si connue) */
  existingQuality?: DataQuality
  reason: string
}
```

---

## 4. Modules proposés

### 4a. `normalizeDealer(incoming, existing?)`

**Responsabilité** : évaluer si le nom de concessionnaire entrant est fiable et peut remplacer l'existant.

```typescript
function normalizeDealer(
  incoming: { name?: string; city?: string; source: DataSource },
  existing?: { name?: string | null; city?: string | null; quality?: DataQuality }
): {
  name: NormalizedField<string>
  city: NormalizedField<string>
  eligibility: VehicleEligibilityReason
}
```

**Trois listes distinctes — ne pas confondre :**

```typescript
// 1. Annonces de particuliers → inéligibles à l'import (rejet explicite)
const PRIVATE_SELLER_PATTERNS = [
  /^particulier$/i,
  /^privat(verkauf)?$/i,   // allemand
  /^privé$/i,
  /^private(\s+seller)?$/i,
  /^vendeur\s+particulier$/i,
  /^privatperson$/i,
]

// 2. Placeholders génériques → vendeur inconnu, ne pas persister
const DEALER_PLACEHOLDERS = [
  /^n\/a$/i,
  /^à renseigner$/i,
  /^inconnu$/i,
  /^unknown$/i,
  /^-+$/,
]

// 3. @legacy — Artefacts de provenance historique (à supprimer après migration)
// Ne désignent ni un dealer ni un particulier — désignent une ancienne source scrapée.
const LEGACY_PROVENANCE_ARTIFACTS = [
  /importemoi/i,   // Erreur de modélisation : scraping d'un site concurrent
]
```

**Règles internes :**

| Condition | Qualité | Eligibilité | SkipReason | Action |
|-----------|---------|-------------|------------|--------|
| Nom vide | `missing` | `seller_unknown` | `source_empty` | ne pas écrire |
| ∈ LEGACY_PROVENANCE_ARTIFACTS | `placeholder` | `seller_unknown` | `legacy_provenance_artifact` | ne pas écrire |
| ∈ PRIVATE_SELLER_PATTERNS | `placeholder` | `private_seller_not_eligible` | `private_seller` | ne pas écrire |
| ∈ DEALER_PLACEHOLDERS | `placeholder` | `seller_unknown` | `placeholder` | ne pas écrire |
| Existing `manual` | — | — | `already_set` | ne pas écrire |
| Existing real dealer + confiance < 0.85 | — | — | `quality_too_low` | ne pas écrire |
| Sinon | `verified`/`inferred` | `eligible_professional_seller` | — | écriture |

**Propriété `isLegacyProvenance`** : retournée par `normalizeDealer` pour identifier les véhicules à traiter par le script de migration.

### ImporteMoi — anomalie de modélisation, pas une règle métier

ImporteMoi était une source concurrente dont le site était scrapé. Avoir `dealer = "ImporteMoi"` est une **erreur de modélisation historique** : ce nom ne désigne pas un vendeur.

```
ImporteMoi ≠ concessionnaire
ImporteMoi ≠ particulier
ImporteMoi = anomalie legacy de provenance
```

**Plan de migration :**

```
1. Script de détection :
   db.vehicles.find({ dealer: /importemoi/i })

2. Migration :
   - dealer = null  (le champ ne doit pas mentir)
   - sourcePlatform = 'importemoi.fr'  (conserver la provenance)
   → Lors du prochain enrichissement AS24, le vrai dealer sera écrit

3. Après migration : supprimer LEGACY_PROVENANCE_ARTIFACTS, le skipReason
   'legacy_provenance_artifact', et tous les tests @legacy
```

Pour ajouter un pattern d'une nouvelle source, l'ajouter dans la liste correspondante sans toucher aux endpoints.

---

### 4b. `normalizePrice(incoming, existing?)`

**Responsabilité** : valider et qualifier un prix, décider si la mise à jour est justifiée.

```typescript
function normalizePrice(
  incoming: { value?: number; source: DataSource; currency?: string },
  existing?: { value?: number; quality?: DataQuality }
): NormalizedField<number>
```

**Règles internes :**

| Condition | Action |
|-----------|--------|
| `value <= 0` ou `NaN` | `skipReason: 'validation_failed'` |
| `value > 500_000` | qualité `inferred`, confidence 0.5 (prix exceptionnel — à vérifier) |
| `value < 500` | qualité `inferred`, confidence 0.3 (probablement une erreur d'extraction) |
| `existing.quality === 'manual'` | `skipReason: 'already_set'` |
| `Math.abs(incoming - existing) / existing > 0.30` | qualité `inferred`, confidence 0.4 (variation >30% — suspect) |
| Sinon | `verified`, confidence 0.9 si `nextdata`, 0.6 si DOM |

**Ce que ce module centralise** : aujourd'hui, la règle "log si variation >5%" est dans `importVehicles.ts`. Le seuil de log, la validation, et la décision de merge seraient ici.

---

### 4c. `normalizeMileage(incoming, existing?)`

**Responsabilité** : valider le kilométrage et appliquer la règle métier de non-régression.

```typescript
function normalizeMileage(
  incoming: { value?: number; source: DataSource },
  existing?: { value?: number; quality?: DataQuality }
): NormalizedField<number>
```

**Règles internes :**

| Condition | Action |
|-----------|--------|
| `value < 0` | `skipReason: 'validation_failed'` |
| `value > 1_500_000` | `skipReason: 'validation_failed'` (vraisemblance) |
| `incoming < existing` | `skipReason: 'quality_too_low'` + log (kilométrage ne peut pas baisser) |
| `incoming === existing` | `skipReason: 'already_set'` |
| Sinon | `write` |

**Ce que ce module centralise** : la règle "mileage only if higher" est aujourd'hui dans `importVehicles.ts` mais absente de `enrichVehicle.ts` (incohérence actuelle).

---

### 4d. `normalizeImages(incoming, existing?)`

**Responsabilité** : décider si un ensemble d'images entrant doit remplacer l'existant.

```typescript
function normalizeImages(
  incoming: { urls: string[]; source: DataSource },
  existing?: { urls?: string[]; quality?: DataQuality }
): NormalizedField<string[]>
```

**Règles internes :**

| Condition | Action |
|-----------|--------|
| `incoming.urls.length === 0` | `skipReason: 'source_empty'` |
| `incoming.urls.length <= existing.urls.length` | `skipReason: 'already_set'` |
| URL ne correspond pas au CDN attendu pour la source | URL filtrée (validation par source) |
| `existing.quality === 'manual'` (images uploadées manuellement) | `skipReason: 'already_set'` |
| Sinon | `write` avec déduplication |

**Extension future** : Mobile.de utilise un CDN différent. La validation d'URL devient `validateImageUrl(url, source)` sans changer la logique de merge.

---

### 4e. `normalizeVehicle(incoming, existing?)` — orchestrateur

**Responsabilité** : appliquer tous les normaliseurs et retourner un patch complet prêt à l'écriture.

```typescript
interface IncomingVehicleData {
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
  specifications?: { power?: string; powerKw?: number; powerHp?: number }
}

interface NormalizationResult {
  /** Patch prêt à passer à payload.update() */
  patch: Record<string, unknown>
  /** Détail champ par champ pour logging/audit */
  decisions: MergeDecision[]
  /** Champs effectivement modifiés (hors métadonnées) */
  appliedFields: string[]
  /** true si le patch est vide (rien à écrire) */
  noop: boolean
  /**
   * Éligibilité du vendeur — à vérifier par l'appelant avant tout import.
   * 'private_seller_not_eligible' → ne pas créer le véhicule en base.
   * 'seller_unknown' → neutre, ne pas rejeter sans preuve.
   */
  eligibility: VehicleEligibilityReason
}

function normalizeVehicle(
  incoming: IncomingVehicleData,
  existing: Vehicle
): NormalizationResult
```

**Flux interne :**

```
normalizeVehicle(incoming, existing)
  ├── normalizePrice(incoming.price, existing.price)
  ├── normalizeMileage(incoming.mileage, existing.mileage)
  ├── normalizeDealer(incoming.dealer, existing.dealer)
  ├── normalizeImages(incoming.imageUrls, existing.imageUrls)
  ├── normalizeTextField('description', ...)
  ├── normalizeTextField('exteriorColor', ...)
  ├── normalizeTextField('interiorColor', ...)
  ├── normalizeNumericField('doors', ...)
  ├── normalizeNumericField('seats', ...)
  └── normalizeSpecifications(incoming.specifications, existing.specifications)
    → construit patch, decisions, appliedFields
```

Les helpers `normalizeTextField` et `normalizeNumericField` sont des génériques simples couvrant la règle « écrire si vide, ne pas écraser » pour les champs sans logique spéciale.

---

## 5. Structure de fichiers

```
src/lib/normalizers/
├── index.ts                    ← exports publics (normalizeVehicle + types)
├── types.ts                    ← DataQuality, DataSource, NormalizedField, MergeDecision
├── normalizeDealer.ts
├── normalizePrice.ts
├── normalizeMileage.ts
├── normalizeImages.ts
├── normalizeSpecifications.ts
├── normalizeTextField.ts       ← générique pour champs texte simples
├── normalizeNumericField.ts    ← générique pour champs numériques simples
└── normalizeVehicle.ts         ← orchestrateur
```

Un seul point d'import pour les consommateurs :

```typescript
import { normalizeVehicle } from '@/lib/normalizers'
```

---

## 6. Avantages pour les nouvelles sources

### Scénario : ajout de Mobile.de

Aujourd'hui, ajouter Mobile.de imposerait d'ajouter dans chaque endpoint des conditions du type :
```typescript
if (source === 'mobile.de') {
  // logique spécifique dealer Mobile.de
  if (extractedData.dealer && /placeholder_mobile/i.test(...)) { ... }
}
```

Avec la couche de normalisation :

1. Ajouter `'mobile.de'` à `DataSource`
2. Ajouter les patterns placeholder Mobile.de dans `DEALER_PLACEHOLDERS` ou `PRIVATE_SELLER_PATTERNS` selon le cas dans `normalizeDealer.ts`
3. Ajouter la validation d'URL CDN Mobile.de dans `normalizeImages.ts`
4. Créer un adaptateur `src/lib/adapters/mobile-de.ts` qui convertit les données brutes Mobile.de en `IncomingVehicleData`

Les endpoints ne changent pas. La logique de merge ne change pas.

```
Adaptateur Mobile.de → IncomingVehicleData → normalizeVehicle() → patch
                                                     ↑
                               Même orchestrateur que pour AS24
```

### Comparaison avant / après

| Critère | Aujourd'hui | Avec normalisation |
|---------|-------------|-------------------|
| Règle dealer placeholder | 3 fichiers | 1 fichier (`normalizeDealer.ts`) |
| Ajout d'une nouvelle source | Refactoring de chaque endpoint | Nouvel adaptateur + extension des listes |
| Raison d'un skip loggée | Non | Oui (`MergeDecision.reason`) |
| Test unitaire de la logique de merge | Difficile (couplée au runtime Payload) | Trivial (fonctions pures) |
| Score de confiance par champ | Non | Oui |
| Distinction placeholder / missing / manual | Non (regex ad hoc) | Oui (enum `DataQuality`) |

---

## 7. Interaction avec C4 (détection 404/410)

C4 devra détecter qu'une URL retourne 404 ou 410 pendant l'enrichissement. Avec la couche de normalisation, ce cas se traduit ainsi :

```typescript
// Dans normalizeVehicle, si la source est http_error :
incoming = {
  source: 'autoscout24.nextdata',
  httpStatus: 404,
  // tous les champs sont undefined
}
```

`normalizeVehicle` retourne `noop: true` avec un `decision` spécial :
```typescript
{ field: '_listing_status', action: 'skip', reason: 'http_404_listing_removed' }
```

L'endpoint ou le script consomme cette décision et appelle séparément la logique C4 (transition `status → inactive`). La normalisation ne gère pas le statut du véhicule — elle se limite aux données.

---

## 8. Plan de migration

La migration peut être faite **sans rupture** en quatre phases, chacune testable indépendamment.

### Phase 1 — Créer le module (sans l'utiliser)

- Créer `src/lib/normalizers/` avec les types et les fonctions
- Écrire les tests unitaires (vitest) pour chaque normaliseur
- Aucun changement dans les endpoints

**Critère de sortie** : `pnpm test` passe, toutes les fonctions sont couvertes.

### Phase 2 — Brancher sur `enrichVehicle.ts`

- Remplacer le bloc de merge de `enrichVehicle.ts` (lignes 89–144) par :
  ```typescript
  const { patch, appliedFields, noop } = normalizeVehicle(extractedData, vehicle)
  ```
- Vérifier en dry-run que les décisions produites correspondent à l'ancienne logique

**Critère de sortie** : comportement observable identique, plus aucun `/importemoi/i` dans `enrichVehicle.ts`.

### Phase 3 — Brancher sur `bulkEnrich.ts`

- Remplacer le bloc de merge de `bulkEnrich.ts` (lignes 166–184)
- Utiliser `decisions` pour le logging SSE (`Rien à enrichir` → détail par champ)
- Adapter `calcScore()` pour ne plus tester `/importemoi/i` — utiliser `quality !== 'placeholder'`

**Critère de sortie** : les événements SSE incluent la raison du skip par champ.

### Phase 4 — Brancher sur `importVehicles.ts` et `bulk-enrich.ts` (script)

- Remplacer la logique de mise à jour dans `importVehicles.ts` (lignes 188–219)
- Remplacer la logique dans `src/scripts/bulk-enrich.ts` (lignes 110–141)

**Critère de sortie** : les 3 occurrences actives de `/importemoi/i` sont supprimées.

### Phase 5 (optionnelle) — Nettoyage schema

- Supprimer `externalId` et `externalReference` après vérification en base (cf. audit vestiges)
- Mettre à jour les descriptions de champs (cf. R4 de l'audit)

---

## 9. Ce que la couche de normalisation ne fait PAS

Pour rester cohérente avec le principe de responsabilité unique :

- **Elle ne scrape pas** : l'extraction des données reste dans `enrichAs24Listing.ts` et les futurs adaptateurs
- **Elle ne lit pas la base** : elle reçoit les données existantes en paramètre, ne fait pas de requête Payload
- **Elle ne gère pas le statut du véhicule** (`active / inactive / sold`) — c'est C4
- **Elle ne gère pas l'état d'enrichissement** (`enrichmentStatus`) — c'est C5
- **Elle ne calcule pas le score de complétude** — `calcScore()` reste dans les endpoints qui en ont besoin, mais pourra utiliser `DataQuality` pour remplacer les regex

---

## 10. Résumé des décisions d'architecture

| Décision | Justification |
|----------|--------------|
| Fonctions pures (pas d'effets de bord) | Testabilité maximale, pas de dépendance à Payload ou Playwright |
| `NormalizedField<T>` retourne `null` plutôt qu'`undefined` | Clarté : `null` = décision explicite de ne pas écrire |
| `DataQuality` comme enum string | Lisible dans les logs, sérialisable en JSON, extensible |
| `skipReason` dans `NormalizedField` plutôt que dans un champ séparé | Colocation : la raison suit la valeur |
| Orchestrateur `normalizeVehicle` retourne un `patch` complet | Les endpoints restent sans logique ; ils font `payload.update(patch)` |
| Trois listes séparées (private / placeholder / legacy) | Chaque liste a une sémantique précise, pas de mélange entre particuliers, placeholders et anomalies historiques |
| Adaptateur par source (futur) | Découplage source → normalisation → persistence |
