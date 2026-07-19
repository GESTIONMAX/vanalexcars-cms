# Audit fonctionnel — Pipeline d'import catalogue

> **Date :** 2026-07-19
> **Périmètre :** Pipeline AutoScout24 → MongoDB → Frontend
> **Statut :** Lecture seule — aucune modification de code

---

## 1. Analyse du pipeline étape par étape

### Étape A — `POST /api/search-as24`

**Fichier :** `src/endpoints/searchAs24.ts`

| | Détail |
|-|--------|
| **Entrées** | `{ searchUrl: string, secret?: string }` + header `x-secret` |
| **Sorties** | `{ success, vehicles[], total }` — liste brute, non persistée |
| **Dépendances** | Playwright/Chromium, réseau AS24, variable `SCRAPER_SECRET` |

**Points de défaillance :**
- Pas de validation du domaine de `searchUrl` — n'importe quelle URL est acceptée
- Appariement JSON ↔ DOM par **index de position** (ligne 344) : si AS24 retourne N listings JSON et M articles DOM avec N ≠ M, les données sont mélangées entre véhicules
- L'attente XHR est fixe (7 s) — si la connexion est lente, les données sont incomplètes sans que le code le détecte
- Pas de timeout sur `chromium.launch()` — peut bloquer indéfiniment en cas de Chromium corrompu
- Aucun log produit — impossible de savoir quelle stratégie a fonctionné

**Hypothèses implicites :**
- L'ordre des listings dans `__NEXT_DATA__` correspond à l'ordre des `<article>` dans le DOM
- AS24 continue à injecter `__NEXT_DATA__` (hypothèse valide tant qu'ils restent sur Next.js)

---

### Étape B — Import dans Payload (manuelle)

**Fichier :** aucun — opération manuelle via `/admin` ou script externe

| | Détail |
|-|--------|
| **Entrées** | Données brutes issues de l'étape A |
| **Sorties** | Documents `Vehicle` en base MongoDB |
| **Dépendances** | Payload Admin, opérateur humain |

**Points de défaillance :**
- **Étape entièrement manuelle** — pas d'endpoint dédié pour importer en masse la liste de l'étape A
- Pas de détection de doublon automatique à la création (`externalId`/`externalReference` sont uniques mais seulement si renseignés)
- `sourcePlatform` doit être manuellement fixé à `autoscout24.de` — oubli = véhicule ignoré par bulk-enrich
- Le champ `originalListingUrl` doit être copié manuellement depuis `listingUrl` de l'étape A

**Hypothèses implicites :**
- L'opérateur mappe correctement les champs de l'étape A vers la collection Vehicles
- `sourcePlatform` est toujours renseigné correctement

---

### Étape C — `POST /api/bulk-enrich`

**Fichier :** `src/endpoints/bulkEnrich.ts` + `src/lib/enrichAs24Listing.ts`

| | Détail |
|-|--------|
| **Entrées** | `{ minScore?, limit?, brand?, category? }` |
| **Sorties** | SSE stream d'événements + mise à jour en base |
| **Dépendances** | Playwright/Chromium, réseau AS24, Payload ORM, MongoDB |

**Points de défaillance :**
- Pas de timeout global sur le stream SSE — peut rester ouvert indéfiniment
- `resolveListingUrl()` accepte `sourceUrl` contenant `/angebote/` sans vérifier le domaine — une URL d'un autre site passant `/angebote/` est acceptée
- La regex CDN (`prod.pictures.autoscout24.net`) ne capture que les `.jpg` — les `.png` et `.webp` sont ignorés
- `response.text()` peut planter si la réponse a déjà été consommée par un autre handler concurrent
- Pas de reprise après interruption : si le stream est coupé à mi-chemin, les véhicules déjà traités le sont, mais aucun état n'est persisté pour reprendre

**Hypothèses implicites :**
- Score bas = véhicule enrichissable (faux si les champs manquants ne sont pas disponibles sur AS24)
- `dealer` contenant "importemoi" = donnée non fiable (hard-codé, ne couvre pas d'autres intermédiaires)
- 1,5 s de pause est suffisant pour contourner la détection bot (variable selon l'activité AS24)

---

### Étape D — Catalogue MongoDB

**Fichier :** `src/collections/Vehicles.ts`

| | Détail |
|-|--------|
| **Entrées** | Documents Vehicle complets |
| **Sorties** | API REST + GraphQL Payload |
| **Dépendances** | MongoDB Coolify/Hetzner |

**Points de défaillance :**
- `mainImage`, `heroImage`, `galleryImages` sont des **champs virtuels** générés par le hook `afterRead` — ils n'existent pas en base, ce qui peut surprendre les consommateurs de l'API
- Si `processedImages.card` est partiellement renseigné (card OK, hero KO), le hook retourne `heroImage: null` sans fallback sur `imageUrls`
- Le select `brand` est une liste figée — une marque non listée ne peut pas être créée proprement

---

### Étape E — Frontend Next.js

Non auditée (hors périmètre backend), mais dépend de :
- `mainImage` (virtuel) — cassé si hook afterRead change
- `galleryImages` (virtuel) — idem
- Statut `active` du véhicule pour la publication

---

## 2. Cas fonctionnels non couverts

| Cas | Comportement actuel | Comportement souhaitable |
|-----|---------------------|--------------------------|
| **Annonce supprimée entre recherche et enrichissement** | `enrichAs24Listing` reçoit un 404 → erreur 502, véhicule non enrichi mais reste en base avec status `active` | Détecter le 404, passer automatiquement `status → inactive` |
| **Véhicule déjà importé (doublon)** | Si `externalId` renseigné → contrainte unique bloque. Si non renseigné → doublon créé silencieusement | Vérifier `originalListingUrl` à la création pour détecter les doublons même sans `externalId` |
| **Changement de prix** | Nouveau prix ignoré si `vehicle.price > 0` (condition stricte ligne 182) | Permettre une mise à jour si l'écart dépasse un seuil (ex: > 5%) ou horodater la dernière valeur |
| **Changement de kilométrage** | Même logique — ignoré si `vehicle.mileage > 0` | Idem, le kilométrage augmente toujours → une valeur plus élevée devrait remplacer l'ancienne |
| **Changement de concessionnaire** | Ignoré si dealer déjà renseigné (sauf si contient "importemoi") | Détecter les changements de concessionnaire (vente entre pros) |
| **Véhicule vendu** | `sync-as24-status` détecte le 404/410 après 3 erreurs × 3 jours → `to_review` | Un 410 devrait déclencher `inactive` immédiatement sans délai de 3 jours |
| **Annonce temporairement indisponible (5xx AS24)** | Incrémente `syncErrorCount` comme une erreur définitive | Distinguer 5xx (retry) de 404/410 (définitif) |
| **Redirection de l'URL (301/302)** | Playwright suit les redirections automatiquement — transparent | OK, mais `originalListingUrl` n'est pas mis à jour avec l'URL finale |
| **Erreur Cloudflare (challenge 403)** | Playwright reçoit la page de challenge, aucune donnée extraite, retourne erreur 502 | Détecter le challenge Cloudflare spécifiquement et loguer `cloudflare_blocked` |
| **Timeout Playwright** | Erreur 502 générique — pas de distinction entre timeout navigation et timeout XHR | Logger `playwright_timeout` distinctement pour diagnostic |
| **Enrichissement interrompu (SSE coupé)** | Les véhicules déjà traités le restent. Les suivants ne sont pas traités. Aucun état persisté | Persister un champ `enrichmentQueuedAt` pour pouvoir reprendre |
| **Doublons** | Pas de détection à l'enrichissement — deux véhicules avec la même `originalListingUrl` sont tous les deux enrichis | Déduplication sur `originalListingUrl` avant enrichissement |
| **Pagination incomplète** | `search-as24` scrape une seule page, l'utilisateur doit appeler N fois | Ajouter un paramètre `maxPages` pour paginer automatiquement |
| **Données partielles (timeout avant fin XHR)** | Extraction partielle sans avertissement — retourne ce qui a été capturé | Ajouter `dataCompleteness: 'partial'|'full'` dans la réponse |

---

## 3. Robustesse des données

### Champs obligatoires (schéma Payload)

| Champ | Obligatoire | Source |
|-------|-------------|--------|
| `title` | Oui | Étape A |
| `price` | Oui | Étape A |
| `year` | Oui | Étape A |
| `mileage` | Oui | Étape A |
| `brand` | Oui (select) | Étape A |

### Champs pouvant rester vides

`description`, `features`, `specifications`, `exteriorColor`, `interiorColor`, `doors`, `seats`, `dealerContact`, `processedImages`, `imageUrls`

### Champs jamais écrasés lors d'un enrichissement

Tous les champs déjà renseignés — sauf :
- `dealer` si contient "importemoi"
- `imageUrls` si le scraping trouve **plus** d'images qu'en base
- `lastScrapedAt` — toujours mis à jour

### Champs qui **devraient** être mis à jour mais ne le sont pas

| Champ | Problème |
|-------|---------|
| `price` | Figé à la valeur initiale — un concessionnaire peut baisser le prix |
| `mileage` | Figé — or le km augmente toujours, l'ancienne valeur est parfois incorrecte |
| `originalListingUrl` | Pas mis à jour si 301 redirige vers une nouvelle URL |

### Stratégie de priorité recommandée

```
Priorité 1 — Données saisies manuellement par l'administrateur
  → Champs avec un flag `manuallyEdited: true` → jamais écrasés

Priorité 2 — Données enrichies (enrichAs24Listing)
  → Écrasent les données importées uniquement si le champ était vide

Priorité 3 — Données importées (search-as24)
  → Valeur initiale, overridable par l'enrichissement
```

**Implémentation suggérée :** ajouter un champ `_lockedFields: string[]` sur chaque véhicule. Les champs listés dedans ne sont jamais mis à jour par les scripts automatiques.

---

## 4. Cycle de vie d'un véhicule

### Étapes actuelles

| Étape | Implémentée | Comment |
|-------|-------------|---------|
| **Découverte** | ✅ Partielle | `POST /api/search-as24` — retourne une liste mais ne persiste pas |
| **Création** | ✅ Partielle | Manuelle via Payload Admin |
| **Enrichissement** | ✅ | `bulk-enrich` ou `enrich-vehicle` |
| **Mise à jour** | ⚠️ Partielle | Ré-enrichissement possible mais prix/km ne se mettent pas à jour |
| **Publication** | ⚠️ Manuelle | Champ `status` à passer `active` manuellement |
| **Archivage** | ⚠️ Partielle | `sync-as24-status` peut passer `to_review`, mais pas `archived` |
| **Suppression** | ❌ Absente | Pas de workflow de suppression automatique |

### Étapes manquantes

1. **Import automatique** — aucun endpoint pour persister directement les résultats de `search-as24`
2. **Vérification de unicité** — pas de détection de doublon à la création
3. **Publication automatique** — un véhicule enrichi complet devrait pouvoir passer `active` automatiquement
4. **Archivage** — distinguer `inactive` (annonce expirée) de `archived` (retiré volontairement)
5. **Audit trail** — aucun historique des modifications (qui a changé quoi, quand)

---

## 5. Performance

### Capacité maximale

| Opération | Durée estimée | Volume max recommandé |
|-----------|--------------|----------------------|
| `search-as24` (1 page) | ~12 s | 20-25 véhicules/page |
| `enrich-vehicle` (1 véhicule) | ~8-10 s | 1 |
| `bulk-enrich` (20 véhicules) | ~4-5 min | 20/appel |
| `sync-as24-status` (100 véhicules) | ~2.5 min | illimité |

### Mémoire

Chaque instance Playwright charge Chromium (~150-200 Mo RAM). En cas d'appels concurrents, la mémoire peut saturer.

**Risque :** pas de limite de concurrence — 5 appels simultanés à `bulk-enrich` = ~1 Go RAM + 5 navigateurs Chromium.

### Parallélisation

Actuellement **séquentielle** — un véhicule à la fois, 1,5 s de pause. La parallélisation est techniquement possible (Promise.all) mais risquée vis-à-vis de la détection bot AS24.

### Reprise après interruption

**Aucune.** Si le process est tué à mi-enrichissement :
- Les véhicules traités avant le crash sont enrichis
- Les suivants ne le sont pas
- `lastScrapedAt` permet de savoir quels véhicules ont été traités, mais il n'y a pas de queue persistée

**Solution suggérée :** champ `enrichmentStatus: 'pending'|'in_progress'|'done'|'failed'` pour permettre la reprise.

---

## 6. Observabilité

### État actuel

| Métrique | Disponible ? | Où |
|---------|-------------|-----|
| Véhicules trouvés (search) | ✅ | Réponse JSON `total` |
| Véhicules créés | ❌ | Pas de log à la création |
| Véhicules enrichis | ✅ Partiel | SSE event `done.stats.enriched` |
| Véhicules échoués | ✅ Partiel | SSE event `done.stats.errors` |
| Raison d'un échec | ⚠️ | Message générique (pas de code d'erreur) |
| Durée par étape | ❌ | Aucun timing |
| Quelle stratégie AS24 a fonctionné | ❌ | Aucun log dans `enrichAs24Listing` |
| Crédits Remove.bg restants | ❌ | Non implémenté |

### Métriques et logs à ajouter

```
[search-as24]   strategy=__NEXT_DATA__ found=20
[search-as24]   duration=11.2s url=https://...
[enrich]        vehicle=BMW_Serie3 strategy=xhr images=14 duration=8.4s
[enrich]        vehicle=Audi_A4 cloudflare_blocked=true
[bulk-enrich]   started vehicles=45 target=<80% limit=20
[bulk-enrich]   done enriched=15 skipped=3 errors=2 duration=4m12s
[sync-status]   checked=100 active=87 inactive=8 to_review=5
```

---

## 7. Évolutivité

### Parties trop spécifiques à AutoScout24

| Composant | Spécificité AS24 | Impact si autre source |
|-----------|-----------------|----------------------|
| `ALLOWED_HOST` regex | Domaines `.de/.com/.fr...` AS24 | Bloque toute autre URL |
| `CDN_PATTERN` regex | `prod.pictures.autoscout24.net` | Aucune image d'une autre source |
| `findListings()` | Clés JSON AS24 (`listingId`, `make`, `vehicleModel`) | Aucune donnée extraite |
| `sourcePlatform = 'autoscout24.de'` | Hard-codé dans `bulk-enrich` where clause | Les autres sources ne sont pas enrichies |
| `resolveListingUrl()` | Cherche `/angebote/` (termin allemand) | Faux négatifs pour d'autres marketplaces |
| Score dealer : `/importemoi/i` | Nom d'un intermédiaire spécifique | Hard-codé |

### Ajout d'autres sources

L'architecture actuelle **ne permet pas facilement** d'ajouter une autre source sans modifier le code core. Il faudrait :

1. Une interface `SourceAdapter` abstraite avec `search()`, `enrich()`, `normalizeVehicle()`
2. Chaque source implémente son adaptateur (`As24Adapter`, `MobileDeAdapter`, etc.)
3. `bulk-enrich` utilise l'adaptateur correspondant au `sourcePlatform` du véhicule

---

## 8. Recommandations

### Critiques

| # | Problème | Solution |
|---|---------|---------|
| C1 | Pas de validation du domaine de `searchUrl` | Whitelist de domaines autorisés avant lancement Playwright |
| C2 | Appariement JSON ↔ DOM par index | Utiliser `listingUrl` comme clé de rapprochement, pas l'index |
| C3 | Pas d'endpoint pour persister les résultats de `search-as24` | Créer `POST /api/import-vehicles` qui appelle search-as24 puis persiste en base avec détection doublon |
| C4 | Véhicule vendu (404) reste `active` | Détecter 404/410 dans `enrichVehicle` et passer `status → inactive` |
| C5 | Pas de reprise après interruption du bulk-enrich | Ajouter champ `enrichmentStatus` + endpoint `POST /api/bulk-enrich/resume` |

### Importantes

| # | Problème | Solution |
|---|---------|---------|
| I1 | `price` et `mileage` jamais mis à jour | Autoriser la mise à jour si l'écart est significatif ou si `lastScrapedAt` > 30 jours |
| I2 | Aucun log dans `enrichAs24Listing` | Logger stratégie utilisée, nb images trouvées, durée |
| I3 | Pas de timeout global sur le stream SSE | Implémenter un AbortController avec timeout de 10 min |
| I4 | Regex CDN ne capture que `.jpg` | Étendre à `.png`, `.webp`, `.jpeg` |
| I5 | Score < minScore ≠ enrichissable | Ajouter champ `enrichable: boolean` ou exclure les véhicules avec `enrichmentStatus: 'failed'` en boucle |
| I6 | Publication manuelle après enrichissement | Auto-publier si score > 80% après enrichissement |

### Confort

| # | Problème | Solution |
|---|---------|---------|
| F1 | Import manuel étape A → base | UI ou endpoint pour importer un tableau de véhicules depuis `search-as24` |
| F2 | Pas d'historique des modifications | Ajouter un champ `changelog[]` sur Vehicle |
| F3 | Pagination non automatisée | Paramètre `maxPages` dans `search-as24` |
| F4 | Pas de rate limiting sur les endpoints | Ajouter rate limiting (ex: 10 req/min par IP) |
| F5 | `_lockedFields` pour protéger les données saisies manuellement | Champ `string[]` sur Vehicle, respecté par tous les scripts |
| F6 | Architecture mono-source | Refactorer vers interface `SourceAdapter` pour supporter d'autres marketplaces |
