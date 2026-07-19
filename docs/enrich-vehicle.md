# Endpoint : Enrichissement individuel d'un véhicule

## Vue d'ensemble

`POST /api/enrich-vehicle`

Enrichit un **véhicule existant en base** en scrapant sa fiche individuelle AutoScout24 via Playwright. Récupère les images HD, la description, les équipements, les specs techniques et les infos concessionnaire.

**Règle fondamentale :** les champs déjà renseignés en base ne sont **jamais écrasés** — l'enrichissement est strictement additif.

C'est la **deuxième étape** du flux d'import catalogue (après `/api/search-as24`), utilisée véhicule par véhicule.

---

## Prérequis

### Variables d'environnement

| Variable | Obligatoire | Description |
|----------|-------------|-------------|
| `SCRAPER_SECRET` | Non | Secret partagé pour authentifier les appels |
| `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` | Non | Chemin vers Chromium (défaut : `/usr/bin/chromium`) |

### Champ requis sur le véhicule

Le véhicule doit avoir **au moins un** de ces champs renseigné :
- `originalListingUrl` — URL complète de la fiche AS24 (prioritaire)
- `sourceUrl` — URL relative `/angebote/...` (normalisée automatiquement en `https://www.autoscout24.de/angebote/...`)

Domaines acceptés : `.de`, `.com`, `.fr`, `.it`, `.es`, `.nl`, `.be`, `.at`, `.ch`, `.lu`, `.pl`

---

## Requête

```
POST /api/enrich-vehicle
Content-Type: application/json
x-secret: <SCRAPER_SECRET>
```

### Corps (JSON)

| Champ | Type | Obligatoire | Description |
|-------|------|-------------|-------------|
| `vehicleId` | string | Oui | ID MongoDB du véhicule dans Payload |
| `dryRun` | boolean | Non | Si `true`, retourne les données sans écriture en base |
| `secret` | string | Non | Alternative au header `x-secret` |

**Exemple :**

```json
{
  "vehicleId": "683a1f2c4e8b9d001234abcd",
  "dryRun": false
}
```

---

## Réponses

### Succès `200`

```json
{
  "success": true,
  "vehicleId": "683a1f2c4e8b9d001234abcd",
  "scrapedCount": 14,
  "imageUrls": [
    "https://prod.pictures.autoscout24.net/listing-images/.../photo1.jpg",
    "https://prod.pictures.autoscout24.net/listing-images/.../photo2.jpg"
  ],
  "extractedData": {
    "description": "Fahrzeug in sehr gutem Zustand...",
    "features": ["Klimaanlage", "Navigationssystem", "Einparkhilfe hinten"],
    "specifications": {
      "power": "110 kW / 150 PS",
      "powerKw": 110,
      "powerHp": 150
    },
    "exteriorColor": "Weiß",
    "interiorColor": "Schwarz",
    "doors": 5,
    "seats": 5,
    "dealer": "Auto Müller GmbH",
    "dealerCity": "München",
    "price": 22900,
    "mileage": 45000
  },
  "appliedFields": ["imageUrls", "description", "features", "specifications", "exteriorColor"]
}
```

### Dry run `200`

```json
{
  "dryRun": true,
  "vehicleId": "683a1f2c4e8b9d001234abcd",
  "scrapedCount": 14,
  "imageUrls": ["..."],
  "extractedData": { "..." : "..." }
}
```

### Erreurs

| Code | Cause |
|------|-------|
| `400` | `vehicleId` manquant, `originalListingUrl` absent, URL hors domaine autorisé |
| `401` | Header `x-secret` absent ou incorrect |
| `404` | Véhicule introuvable en base |
| `502` | Timeout Playwright (30s), bot-detection AS24 |

---

## Exemples cURL

```bash
# Dry run — prévisualiser sans modifier la base
curl -X POST http://localhost:4200/api/enrich-vehicle \
  -H "Content-Type: application/json" \
  -H "x-secret: $SCRAPER_SECRET" \
  -d '{"vehicleId": "683a1f2c4e8b9d001234abcd", "dryRun": true}'

# Enrichissement complet — écrit dans la base
curl -X POST https://api.import-voiture-allemagne.fr/api/enrich-vehicle \
  -H "Content-Type: application/json" \
  -H "x-secret: $SCRAPER_SECRET" \
  -d '{"vehicleId": "683a1f2c4e8b9d001234abcd"}'
```

---

## Comportement interne

### Logique de merge (non-destructif)

| Champ | Condition d'application |
|-------|------------------------|
| `imageUrls` | Seulement si le scraping trouve **plus** d'images qu'en base |
| `description` | Seulement si le champ est vide en base |
| `features` | Seulement si le tableau est vide en base |
| `specifications.power` | Seulement si `power` est absent en base |
| `exteriorColor` | Seulement si vide en base |
| `interiorColor` | Seulement si vide en base |
| `doors` / `seats` | Seulement si absent en base |
| `dealer` | Seulement si vide ou contient "importemoi" |
| `dealerCity` | Seulement si vide en base |
| `price` | Seulement si `price` est 0 ou absent en base |
| `mileage` | Seulement si `mileage` est null en base |
| `lastScrapedAt` | **Toujours mis à jour** |

### Stratégies de scraping (lib partagée)

Délégué à `src/lib/enrichAs24Listing.ts` — 3 passes :

**Passe 0 — Interception XHR (images)**
Intercept des réponses réseau JSON/JS contenant des URLs CDN AS24 (`prod.pictures.autoscout24.net`). Méthode la plus complète pour les galeries.

**Passe 0b — `__NEXT_DATA__`**
Extraction des données structurées SSR : prix, km, puissance, dealer, couleurs, portes/places.

**Passe 1 — JSON-LD**
Fallback images + description depuis `<script type="application/ld+json">` (`@type: Car`).

**Passe 2 — DOM**
Extraction des équipements (listes `<ul>` ≥5 items), specs (`<dl>`, `<table>`), concessionnaire (`data-testid="vendor-contact-info"`).

### Normalisation des URLs images

Les URLs CDN AS24 contiennent un suffixe de taille (`/1920x1080.jpg`). Ce suffixe est supprimé pour obtenir l'URL de l'image originale pleine résolution.

---

## Points de vigilance

Voir [scrape-gallery.md](./scrape-gallery.md#points-de-vigilance) pour les points communs (bot-detection, timeout, compatibilité Playwright/Chromium).

**`appliedFields` vide**
Si aucun champ n'a été appliqué (tout est déjà renseigné), le véhicule est considéré comme complet. Aucune mise à jour n'est effectuée sauf `lastScrapedAt`.
