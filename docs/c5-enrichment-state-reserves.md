# C5 — État persistant enrichissement : réserves et limites

> Document de complément au commit `b61fcfd` (feat(C5)).
> À lire avant d'implémenter les retries automatiques ou le mode multi-workers.

---

## Ce qui est implémenté

- **5 champs persistants** par véhicule : `enrichmentStatus`, `enrichmentAttempts`, `enrichmentLastError`, `enrichmentStartedAt`, `enrichmentCompletedAt`.
- **Mode `resume`** (défaut) : skip les `completed` et `in_progress` au prochain lancement.
- **Mode `all`** : retraite tous les véhicules éligibles (ignore le statut précédent).
- **Reset des `in_progress` bloqués** : au démarrage d'un job, tout `in_progress` dont `enrichmentStartedAt < now − 10 min` est repassé en `failed`.

---

## Réserves

### 1. `mode: all` ne prévient pas deux exécutions simultanées

`mode: all` ignore délibérément le statut `in_progress`. Si deux requêtes `POST /api/bulk-enrich?mode=all` sont lancées en parallèle, elles traiteront les mêmes véhicules en même temps.

**Cause** : la mise à jour `in_progress` en début de boucle est un verrou optimiste, pas un verrou exclusif. Payload CMS ne propose pas de `findAndModify` atomique.

**Mitigation actuelle** : `mode: resume` (défaut) — le deuxième job verra les véhicules `in_progress` et les ignorera.

**À implémenter si besoin** : un identifiant de job unique stocké dans le véhicule (`enrichmentJobId`) permettrait de détecter et rejeter les runs concurrents.

---

### 2. Comment distinguer une exécution active d'un ancien `in_progress`

La seule distinction est temporelle : `enrichmentStartedAt < now − 10 min` → considéré bloqué.

- Un véhicule passé en `in_progress` il y a 9 min 59 s est considéré actif, même si le serveur a planté.
- Un véhicule en cours de traitement réel depuis 10 min 01 s serait resetté à `failed` par un deuxième job démarré en parallèle.

**Ce que cela implique** : le délai de 10 min est un seuil arbitraire. Il doit rester supérieur au temps de traitement maximum d'un véhicule (Playwright + extraction + mise à jour ≈ 30–90 s en pratique).

**À surveiller** : si `enrichAs24Listing()` peut dépasser 10 min (réseau lent, site lent), augmenter `STALE_IN_PROGRESS_MS` ou ajouter un heartbeat.

---

### 3. Le délai fixe de 10 min peut réinitialiser un traitement encore vivant

Scénario : un serveur lent traite un véhicule depuis 11 min. Un second job démarre. Le second job voit `enrichmentStartedAt` vieux de 11 min et reset le véhicule à `failed`. Le premier job termine ensuite et passe le véhicule à `completed`. Résultat : statut final `completed`, mais `enrichmentLastError` contient l'erreur du reset.

**Mitigation** : ne démarrer qu'un seul job à la fois (supervision externe, ou endpoint de statut retournant `jobRunning: true`).

---

### 4. Raisons de `skip` non distinguées

Actuellement, `status: 'skipped'` dans l'événement SSE regroupe deux cas différents :

| Cas | Cause réelle | Traitement actuel |
|-----|-------------|-------------------|
| Données déjà complètes | `appliedFields.length === 0` | `skipped` + `enrichmentStatus: completed` |
| URL absente | `resolveListingUrl()` retourne `null` | filtré avant la boucle, invisible dans les stats |

Cas non encore couverts à ce stade :
- Annonce supprimée (404/410) → prévu en **C4**
- Erreur temporaire réseau (5xx, timeout) → actuellement classé `failed`, indiscernable d'une erreur permanente

**À implémenter** : des valeurs distinctes dans `enrichmentLastError` (ex. `"http_404"`, `"timeout"`, `"no_fields"`) permettront un filtrage fin pour les retries.

---

### 5. La déconnexion SSE n'arrête pas la boucle d'enrichissement

La boucle `for (const { v } of toEnrich)` s'exécute dans le `ReadableStream.start()`. Elle ne s'arrête pas si le client SSE se déconnecte.

**Comportement** : après une coupure réseau, la boucle continue, les véhicules sont mis à jour en base, les événements SSE sont enqueueés mais perdus. Au prochain rechargement de la page, `mode: resume` reprend là où les `pending`/`failed` s'arrêtent.

**À surveiller** : si le client se déconnecte et se reconnecte, il ne reçoit pas les événements passés (SSE n'a pas de replay). Il faut requêter la base (`GET /api/vehicles?enrichmentStatus=in_progress`) pour connaître l'état courant.

---

### 6. Retries automatiques, backoff et identifiant de job : non implémentés

Ce qui reste à faire si on veut des retries automatiques robustes :

| Fonctionnalité | Statut |
|----------------|--------|
| `enrichmentNextRetryAt` (date calculée avec backoff exponentiel) | Non implémenté |
| Backoff : `1 min → 5 min → 15 min → 1 h → abandon` | Non implémenté |
| `enrichmentJobId` : identifiant unique par run (UUID) | Non implémenté |
| Endpoint `GET /api/enrich-status` : état global du job en cours | Non implémenté |
| Webhook ou notification en fin de job | Non implémenté |

La version C5 actuelle est suffisante pour une reprise manuelle (relancer `bulk-enrich` après un crash). Elle n'est pas conçue pour des retries automatiques planifiés.

---

## Résumé des risques

| Risque | Probabilité | Impact | Mitigation |
|--------|-------------|--------|------------|
| Deux jobs simultanés en `mode: all` | Faible (usage humain) | Moyen (doublons d'écriture) | N'utiliser `mode: all` qu'en maintenance |
| Reset d'un traitement encore vivant | Très faible | Faible (statut incorrect, traitement continue) | `STALE_IN_PROGRESS_MS` > max scraping time |
| Perte d'événements SSE à la reconnexion | Certain si coupure réseau | Faible (base est à jour) | Requêter la base à la reconnexion |
| `failed` = erreur temporaire ou permanente | Certain | Moyen (retries inutiles ou manquants) | Codes d'erreur structurés (C4) |
