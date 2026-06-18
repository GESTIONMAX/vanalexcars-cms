# Endpoint : Scraping galerie de véhicule

## Vue d'ensemble

`POST /api/scrape-gallery`

Scrape automatiquement la galerie d'images d'une fiche AutoScout24 via Playwright (Chromium headless), puis met à jour les champs `imageUrls` et `lastScrapedAt` du véhicule en base.

---

## Prérequis

### Variables d'environnement

| Variable | Obligatoire | Description |
|----------|-------------|-------------|
| `SCRAPE_SECRET` | Oui | Secret partagé pour authentifier les appels |
| `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` | Non | Chemin vers Chromium (défaut : `/usr/bin/chromium`) |
| `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD` | Non | Déjà défini dans le Dockerfile (`1`) |

Ajouter dans `.env` et dans les secrets Coolify :

```env
SCRAPE_SECRET=un-secret-long-et-aleatoire
```

### Champ requis sur le véhicule

Le véhicule doit avoir le champ `originalListingUrl` rempli avec une URL AutoScout24 valide (domaines acceptés : `.de`, `.com`, `.fr`, `.it`, `.es`, `.nl`, `.be`, `.at`, `.ch`, `.lu`, `.pl`).

---

## Requête

```
POST /api/scrape-gallery
Content-Type: application/json
X-Scrape-Secret: <SCRAPE_SECRET>
```

### Corps (JSON)

| Champ | Type | Obligatoire | Description |
|-------|------|-------------|-------------|
| `vehicleId` | string | Oui | ID MongoDB du véhicule dans Payload |
| `dryRun` | boolean | Non | Si `true`, retourne les URLs sans écriture en base |

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
  "scrapedCount": 12,
  "imageUrls": [
    "https://prod.pictures.autoscout24.net/listing-images/.../photo1.jpg",
    "https://prod.pictures.autoscout24.net/listing-images/.../photo2.jpg"
  ]
}
```

### Dry run `200`

```json
{
  "dryRun": true,
  "vehicleId": "683a1f2c4e8b9d001234abcd",
  "scrapedCount": 12,
  "imageUrls": [ "..." ]
}
```

### Erreurs

| Code | Cause |
|------|-------|
| `401` | Header `X-Scrape-Secret` absent ou incorrect |
| `400` | Body JSON invalide, `vehicleId` manquant, `originalListingUrl` absent ou hors domaine autorisé |
| `404` | Véhicule introuvable en base |
| `502` | Timeout Playwright (30s), bot-detection AutoScout24, ou aucune image trouvée |

---

## Exemples cURL

```bash
# Dry run — prévisualiser sans modifier la base
curl -X POST https://api.vanalexcars.fr/api/scrape-gallery \
  -H "Content-Type: application/json" \
  -H "X-Scrape-Secret: $SCRAPE_SECRET" \
  -d '{"vehicleId": "683a1f2c4e8b9d001234abcd", "dryRun": true}'

# Scrape complet — écrit dans la base
curl -X POST https://api.vanalexcars.fr/api/scrape-gallery \
  -H "Content-Type: application/json" \
  -H "X-Scrape-Secret: $SCRAPE_SECRET" \
  -d '{"vehicleId": "683a1f2c4e8b9d001234abcd"}'
```

---

## Comportement interne

### Stratégie de scraping (double passe)

**Passe 1 — JSON-LD (prioritaire)**

AutoScout24 injecte un bloc `<script type="application/ld+json">` avec `@type: Vehicle` contenant un tableau `image`. Cette méthode est robuste car elle ne dépend pas des class CSS de l'interface.

**Passe 2 — DOM fallback**

Si le JSON-LD est absent ou vide, le scraper collecte toutes les balises `<img>` dont l'URL contient `autoscout24`, filtre les logos, et déduplique.

**Filtrage thumbnails**

Les URLs terminant par un suffixe de petite dimension (`_100.jpg`, `_200.jpg`…) sont exclues. Les images pleine taille sont conservées en priorité.

### Flags Chromium

Le navigateur est lancé avec les flags adaptés à l'environnement Docker :

```
--no-sandbox
--disable-setuid-sandbox
--disable-dev-shm-usage   ← évite les crashs liés à /dev/shm en container
--disable-gpu
--headless=new
```

### Effets en base (si pas dryRun)

- `imageUrls` : remplacé par le tableau des URLs scrapées, format `[{ url: string }]`
- `lastScrapedAt` : mis à jour à l'horodatage de la requête

---

## Infrastructure Docker

Le `Dockerfile` utilise `node:20-slim` comme image de base afin d'installer le paquet système `chromium` (Debian). Playwright utilise ce binaire via `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium` — aucun navigateur n'est téléchargé lors du `pnpm install`.

### Vérifier que Chromium est disponible dans l'image

```bash
docker run --rm --entrypoint /usr/bin/chromium vanalexcars-backend --version
# Chromium 120.x.x.x
```

### Vérifier l'endpoint en local

```bash
# 1. Démarrer le dev server
SCRAPE_SECRET=dev-secret pnpm dev

# 2. Récupérer un vehicleId depuis l'admin Payload (http://localhost:4200/admin)

# 3. Tester
curl -X POST http://localhost:4200/api/scrape-gallery \
  -H "Content-Type: application/json" \
  -H "X-Scrape-Secret: dev-secret" \
  -d '{"vehicleId": "<id>", "dryRun": true}'
```

> **Note locale :** Playwright a besoin de Chromium installé localement pour le dev.
> ```bash
> pnpm add -D @playwright/test && npx playwright install chromium
> ```
> Puis surcharger la variable :
> ```bash
> PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=$(node -e "const {chromium}=require('playwright');chromium.executablePath().then(console.log)") pnpm dev
> ```

---

## Points de vigilance

**Bot-detection AutoScout24**
AutoScout24 utilise Cloudflare. En cas de blocage répété, le scraper retourne un `502`. Mitigation : espacer les appels, éviter de scraper en masse.

**Timeout**
La navigation est limitée à 30 secondes. Les fiches avec de nombreuses images ou une connexion lente peuvent dépasser ce délai.

**Changements de DOM AutoScout24**
Si AutoScout24 modifie sa structure JSON-LD, la passe 2 (DOM fallback) prend le relai. Si les deux passes échouent, vérifier les sélecteurs dans [src/endpoints/scrapeGallery.ts](../src/endpoints/scrapeGallery.ts).

**Compatibilité playwright-core / Chromium**
La version de `playwright-core` doit être compatible avec la version de Chromium disponible dans Debian Bookworm. En cas d'erreur de protocole CDP, fixer la version de `playwright-core` dans `package.json`.
