# Endpoint : Recherche AutoScout24

## Vue d'ensemble

`POST /api/search-as24`

Scrape une page de résultats AutoScout24 via Playwright (Chromium headless) et retourne la liste des véhicules trouvés en JSON. C'est la **première étape** du flux d'import catalogue.

---

## Prérequis

### Variables d'environnement

| Variable | Obligatoire | Description |
|----------|-------------|-------------|
| `SCRAPER_SECRET` | Non | Secret partagé pour authentifier les appels (si absent, aucune auth requise) |
| `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` | Non | Chemin vers Chromium (défaut : `/usr/bin/chromium`) |

---

## Requête

```
POST /api/search-as24
Content-Type: application/json
x-secret: <SCRAPER_SECRET>
```

### Corps (JSON)

| Champ | Type | Obligatoire | Description |
|-------|------|-------------|-------------|
| `searchUrl` | string | Oui | URL de la page de résultats AutoScout24 |
| `secret` | string | Non | Alternative au header `x-secret` |

**Exemple :**

```json
{
  "searchUrl": "https://www.autoscout24.de/lst/volkswagen/golf?sort=age&desc=1&fregfrom=2020&kmto=80000"
}
```

---

## Réponses

### Succès `200`

```json
{
  "success": true,
  "total": 20,
  "vehicles": [
    {
      "title": "Volkswagen Golf",
      "brand": "volkswagen",
      "model": "Golf",
      "price": 22900,
      "year": 2021,
      "mileage": 45000,
      "fuel": "Benzin",
      "transmission": "Automatik",
      "power": "110 kW",
      "bodyType": "Limousine",
      "exteriorColor": "Weiß",
      "doors": 5,
      "seats": 5,
      "dealerName": "Auto Müller GmbH",
      "dealerCity": "München",
      "dealerCountry": "Deutschland",
      "listingUrl": "https://www.autoscout24.de/angebote/vw-golf-...",
      "imageUrl": "https://prod.pictures.autoscout24.net/...",
      "imageUrls": ["https://prod.pictures.autoscout24.net/..."],
      "description": "",
      "equipment": []
    }
  ]
}
```

### Erreurs

| Code | Cause |
|------|-------|
| `400` | `searchUrl` manquant ou body JSON invalide |
| `401` | Header `x-secret` absent ou incorrect |
| `502` | Timeout Playwright (35s), bot-detection AS24, ou échec de navigation |

---

## Exemples cURL

```bash
# Recherche sans auth (SCRAPER_SECRET non défini)
curl -X POST http://localhost:4200/api/search-as24 \
  -H "Content-Type: application/json" \
  -d '{"searchUrl": "https://www.autoscout24.de/lst/bmw?sort=age&desc=1"}'

# Recherche avec auth
curl -X POST https://api.import-voiture-allemagne.fr/api/search-as24 \
  -H "Content-Type: application/json" \
  -H "x-secret: $SCRAPER_SECRET" \
  -d '{"searchUrl": "https://www.autoscout24.de/lst/bmw?sort=age&desc=1"}'
```

---

## Comportement interne

### Stratégies d'extraction (4 passes en cascade)

**Passe 1 — `__NEXT_DATA__` (prioritaire)**

AutoScout24 est une app Next.js. Le HTML contient un bloc `<script id="__NEXT_DATA__">` avec toutes les données SSR. C'est la source la plus fiable et la plus complète.

**Passe 2 — Interception réseau**

Playwright intercepte les réponses JSON des appels XHR internes d'AS24 pendant la navigation. Utilisé si `__NEXT_DATA__` n'a pas de listings.

**Passe 3 — JSON-LD**

Extraction depuis les balises `<script type="application/ld+json">` (schema.org `ItemList`/`Car`).

**Passe 4 — DOM brut**

Fallback de dernier recours : extraction depuis les balises `<article>` de la page, regex sur les prix en €.

### Enrichissement DOM complémentaire

Après chaque passe, un scan DOM est systématiquement effectué sur les `<article>` pour compléter les champs manquants : `listingUrl`, `dealerName`, `dealerCity`, `imageUrl`.

### Flags Chromium

```
--no-sandbox
--disable-setuid-sandbox
--disable-dev-shm-usage
--disable-gpu
--headless=new
```

### Optimisations réseau

- Fonts, stylesheets, media et images sont bloqués (Playwright route abort) pour accélérer le chargement
- User-Agent Windows Chrome 120 + locale `de-DE` pour réduire la détection bot
- Attente de 7 secondes après `domcontentloaded` pour laisser les XHR se charger

---

## Flux d'utilisation recommandé

```
1. POST /api/search-as24 → récupérer la liste (listingUrl par véhicule)
2. Importer les véhicules en base via Payload Admin ou script
3. POST /api/enrich-vehicle (par véhicule) ou POST /api/bulk-enrich (en masse)
```

---

## Points de vigilance

**Bot-detection AS24**
AutoScout24 utilise Cloudflare. En cas de blocage, le scraper retourne `502`. Mitigation : espacer les appels, éviter les recherches en masse répétées.

**Timeout**
La navigation est limitée à 35 secondes. Les pages avec Cloudflare challenge ou connexion lente peuvent dépasser ce délai.

**Pagination**
L'endpoint scrape une seule page de résultats. Pour plusieurs pages, il faut appeler l'endpoint avec chaque URL de pagination (`&page=2`, `&page=3`…).

**Changements AS24**
Si AS24 modifie sa structure `__NEXT_DATA__`, les passes 2-4 prennent le relai. Vérifier les clés dans [src/endpoints/searchAs24.ts](../src/endpoints/searchAs24.ts) (`findListings`, `parseVehicle`).
