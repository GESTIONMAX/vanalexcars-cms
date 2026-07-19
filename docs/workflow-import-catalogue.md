# Workflow : Import catalogue AutoScout24

## Vue d'ensemble

Le flux d'import catalogue se déroule en 3 étapes successives pour passer des résultats de recherche AutoScout24 à des fiches véhicules complètes publiées sur le frontend.

```
AutoScout24 (page résultats)
        │
        │  POST /api/search-as24
        ▼
   Liste de véhicules bruts
        │
        │  Import → Payload Admin ou script
        ▼
   Véhicules en base (incomplets)
        │
        │  POST /api/bulk-enrich
        ▼
   Véhicules enrichis (complets) ✓
        │
        │  API REST / GraphQL
        ▼
     Frontend
```

---

## Étape 1 — Recherche : `POST /api/search-as24`

**Objectif :** Découvrir les véhicules disponibles sur AutoScout24.

Vous fournissez une URL de page de résultats AS24 (avec vos filtres : marque, prix, année, km…). Le scraper Playwright charge la page et extrait la liste des véhicules.

**Ce que vous obtenez :**
- Titre, marque, modèle
- Prix, année, kilométrage
- Carburant, transmission, carrosserie
- Nom et ville du concessionnaire
- URL de la fiche individuelle (`listingUrl`) ← **clé pour l'étape 3**
- Image principale

**Documentation détaillée :** [search-as24.md](./search-as24.md)

---

## Étape 2 — Import en base (Payload Admin)

**Objectif :** Créer les entrées dans la collection `vehicles` de MongoDB.

Les véhicules récupérés à l'étape 1 sont importés manuellement via le panel Payload Admin (`/admin`) ou via un script. Le champ `originalListingUrl` doit être renseigné avec l'URL AS24 de chaque fiche — c'est ce champ qui permet l'enrichissement à l'étape 3.

**Champs à renseigner à minima :**

| Champ | Source |
|-------|--------|
| `title` | Étape 1 |
| `brand` | Étape 1 |
| `model` | Étape 1 |
| `price` | Étape 1 |
| `year` | Étape 1 |
| `mileage` | Étape 1 |
| `originalListingUrl` | Étape 1 (`listingUrl`) |
| `sourcePlatform` | Fixer à `autoscout24.de` |

**État après l'étape 2 :** les véhicules existent en base mais sont incomplets — pas d'images HD, pas d'équipements, pas de description, puissance manquante.

---

## Étape 3 — Enrichissement : `POST /api/bulk-enrich`

**Objectif :** Compléter automatiquement les fiches véhicules incomplètes.

Le système sélectionne les véhicules AS24 en base dont le **score de complétude** est inférieur au seuil cible (défaut : 80%), les trie du plus incomplet au plus complet, et enrichit chaque fiche en scrapant sa page individuelle AS24.

**Ce qui est ajouté (si absent en base) :**
- Galerie d'images HD complète
- Description du vendeur
- Liste d'équipements (climatisation, GPS, aide au stationnement…)
- Puissance en kW et PS
- Couleur extérieure et intérieure
- Nombre de portes et de places
- Nom et ville du concessionnaire précis
- Prix et kilométrage (confirmation depuis la fiche)

**Règle clé :** un champ déjà renseigné en base n'est **jamais écrasé**.

Les résultats sont streamés en temps réel via SSE — pas de timeout.

**Pour un seul véhicule :** `POST /api/enrich-vehicle`

**Documentation détaillée :** [bulk-enrich.md](./bulk-enrich.md) · [enrich-vehicle.md](./enrich-vehicle.md)

---

## Score de complétude

Chaque véhicule reçoit un score de 0 à 100% calculé sur 17 champs pondérés. L'enrichissement cible en priorité les véhicules avec le score le plus bas.

| Score | Interprétation |
|-------|----------------|
| < 40% | Fiche très incomplète — données de base uniquement |
| 40–70% | Fiche partielle — images ou équipements manquants |
| 70–90% | Fiche correcte — quelques champs secondaires absents |
| ≥ 90% | Fiche complète — prête pour le frontend |

---

## Maintenance : vérification des annonces actives

**Script :** `pnpm sync:as24-status`

Vérifie périodiquement si les annonces AS24 sont toujours en ligne (HTTP HEAD sur `originalListingUrl`). Met à jour le statut des véhicules dont l'annonce a expiré (404/410).

```bash
pnpm sync:as24-status        # vérification réelle
pnpm sync:as24-status:dry    # prévisualisation sans écriture
```

---

## Récapitulatif des endpoints

| Endpoint | Rôle | Étape |
|----------|------|-------|
| `POST /api/search-as24` | Scraper une page de résultats AS24 | 1 |
| `POST /api/enrich-vehicle` | Enrichir un véhicule individuel | 3 |
| `POST /api/bulk-enrich` | Enrichir en masse (SSE streaming) | 3 |
| `POST /api/scrape-gallery` | Rescaper uniquement les images d'un véhicule | 3 (images) |

---

## Authentification

Tous les endpoints de scraping nécessitent le header :

```
x-secret: <SCRAPER_SECRET>
```

La variable `SCRAPER_SECRET` doit être définie dans `.env` et dans les secrets Coolify.
