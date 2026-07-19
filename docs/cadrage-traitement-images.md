# Cadrage : Traitement automatique des images véhicules

## Contexte

Les images brutes scrapées depuis AutoScout24 (`imageUrls`) sont des photos de concessionnaires allemands, prises dans des conditions variables (parkings, showrooms encombrés, fonds non homogènes). Pour le site import-voiture-allemagne.fr, ces images doivent être :

1. **Détourées** — suppression de l'arrière-plan (Remove.bg)
2. **Normalisées** — fond studio blanc/gris + 4 formats adaptés aux usages frontend
3. **Marquées** — filigrane discret VanalexCars pour protéger les visuels

La collection `Vehicles` possède déjà le champ `processedImages` (hero, card, thumbnail, social) et le hook `afterRead` qui donne la priorité aux images traitées sur les images brutes.

---

## Périmètre

### Ce qui est inclus

- Endpoint `POST /api/process-images` — traitement à la demande pour un véhicule
- Intégration dans `POST /api/bulk-enrich` — traitement automatique après enrichissement
- Stockage des 4 variantes dans `processedImages` en base
- Watermark appliqué à toutes les variantes

### Ce qui est exclu

- Upload vers un CDN externe (S3, Cloudinary) — les images sont servies directement
- Traitement des images `Media` Payload (hors scope)
- Interface frontend de validation des images (hors scope backend)

---

## Feature 1 — Suppression d'arrière-plan (Remove.bg)

### Principe

L'API Remove.bg reçoit une image (URL ou fichier) et retourne la même image avec l'arrière-plan supprimé (PNG avec transparence).

**API utilisée :** `https://api.remove.bg/v1.0/removebg`
**Authentification :** header `X-Api-Key: <REMOVE_BG_API_KEY>`
**Coût :** 1 crédit par image (50 crédits gratuits/mois, ~0,20€/image ensuite)

### Flux technique

```
imageUrls[0]  (image principale brute AS24)
      │
      │  POST https://api.remove.bg/v1.0/removebg
      │  { image_url, size: "auto", format: "png" }
      ▼
image PNG avec transparence (fond supprimé)
      │
      │  sharp — composition sur fond blanc/gris studio
      ▼
image JPEG fond studio
      │
      │  Génération 4 variantes (sharp resize)
      ▼
 hero 1600×900 · card 600×400 · thumbnail 400×300 · social 1200×630
      │
      │  Payload update → processedImages.*
      ▼
  Véhicule mis à jour en base
```

### Variables d'environnement

| Variable | Obligatoire | Description |
|----------|-------------|-------------|
| `REMOVE_BG_API_KEY` | Oui | Clé API Remove.bg |
| `REMOVE_BG_CREDITS_ALERT` | Non | Seuil d'alerte crédits restants (défaut : 10) |

### Stratégie de sélection d'image

Remove.bg est facturé par image — on ne traite que **l'image principale** (la première de `imageUrls`). Les autres images brutes restent disponibles dans la galerie via `imageUrls`.

Si Remove.bg retourne une erreur (crédits épuisés, image invalide) :
- Log warning
- Le véhicule conserve ses `imageUrls` brutes
- `processedImages` n'est pas mis à jour

### Fond studio

Après détourage, le PNG transparent est composé sur un fond :
- **Couleur :** blanc pur `#FFFFFF` ou gris clair `#F5F5F5` (configurable)
- **Padding :** 5% de marge autour du véhicule pour éviter les coupures

---

## Feature 2 — Watermark (filigrane)

### Principe

Après composition sur fond studio, un filigrane semi-transparent est appliqué sur chaque variante via Sharp (`composite`).

### Spécifications du watermark

| Paramètre | Valeur recommandée |
|-----------|-------------------|
| Contenu | Logo VanalexCars SVG ou texte `import-voiture-allemagne.fr` |
| Position | Coin bas droit |
| Opacité | 30% (discret, non intrusif) |
| Taille | ~15% de la largeur de l'image |
| Format | PNG transparent (superposé via Sharp composite) |

### Application

Le watermark est appliqué **sur les 4 variantes** après redimensionnement, pas avant (pour conserver les proportions correctes selon la taille cible).

---

## Endpoint : `POST /api/process-images`

### Requête

```
POST /api/process-images
Content-Type: application/json
x-secret: <SCRAPER_SECRET>
```

| Champ | Type | Défaut | Description |
|-------|------|--------|-------------|
| `vehicleId` | string | — | ID du véhicule à traiter |
| `dryRun` | boolean | `false` | Retourne les URLs sans écriture en base |
| `force` | boolean | `false` | Retraite même si `processedImages` est déjà renseigné |
| `skipRemoveBg` | boolean | `false` | Saute l'étape Remove.bg (fond studio seulement) |

### Réponse succès `200`

```json
{
  "success": true,
  "vehicleId": "683a1f2c...",
  "processedImages": {
    "hero": "https://api.import-voiture-allemagne.fr/media/hero_abc123.jpg",
    "card": "https://api.import-voiture-allemagne.fr/media/card_abc123.jpg",
    "thumbnail": "https://api.import-voiture-allemagne.fr/media/thumb_abc123.jpg",
    "social": "https://api.import-voiture-allemagne.fr/media/social_abc123.jpg"
  },
  "creditsRemaining": 42
}
```

### Erreurs

| Code | Cause |
|------|-------|
| `400` | `vehicleId` manquant, pas d'images brutes sur le véhicule |
| `401` | `x-secret` absent ou incorrect |
| `404` | Véhicule introuvable |
| `402` | Crédits Remove.bg épuisés |
| `502` | Erreur Remove.bg ou Sharp |

---

## Intégration dans `bulk-enrich`

Option `processImages: true` dans le body du bulk-enrich :

```json
{
  "minScore": 80,
  "limit": 20,
  "processImages": true
}
```

Séquence par véhicule :
```
1. enrichAs24Listing() → imageUrls, extractedData
2. payload.update() → sauvegarde imageUrls
3. processImages() → Remove.bg + watermark + 4 variantes
4. payload.update() → sauvegarde processedImages
5. SSE event { status: "enriched", processedImages: true }
```

---

## Stockage des images traitées

Les images générées sont sauvegardées dans le dossier `media/` de Payload CMS via l'API locale (`payload.create({ collection: 'media', ... })`). Les URLs résultantes sont stockées dans `processedImages.hero/card/thumbnail/social`.

Avantage : les images sont servies par le backend existant, pas besoin de CDN externe.

---

## Champs déjà en place (aucune migration nécessaire)

Le schéma `Vehicles.ts` est déjà prêt :

```ts
// processedImages existe déjà avec les 4 variantes
processedImages.hero       // 1600×900
processedImages.card       // 600×400
processedImages.thumbnail  // 400×300
processedImages.social     // 1200×630

// afterRead donne déjà la priorité à processedImages
doc.mainImage  → processedImages.card  (si renseigné)
doc.heroImage  → processedImages.hero  (si renseigné)
doc.galleryImages → processedImages.*  (si renseigné)
```

---

## Dépendances à ajouter

```bash
pnpm add sharp          # Redimensionnement + composition + watermark
# remove.bg → appel fetch natif, pas de SDK nécessaire
```

`sharp` est déjà présent dans `payload.config.ts` — vérifier qu'il est bien dans `dependencies` et pas seulement `devDependencies`.

---

## Variables d'environnement à ajouter

Dans `.env` et secrets Coolify :

```env
REMOVE_BG_API_KEY=your-api-key-here
STUDIO_BACKGROUND_COLOR=#FFFFFF
WATERMARK_OPACITY=30
```

---

## Estimation de coût Remove.bg

| Volume | Coût estimé |
|--------|-------------|
| 50 images/mois | Gratuit |
| 100 images/mois | ~10€ |
| 500 images/mois | ~45€ |
| 1000 images/mois | ~80€ |

Un crédit = 1 image. Les crédits ne sont consommés que si Remove.bg réussit le détourage.

---

## Plan d'implémentation

| Étape | Fichier | Description |
|-------|---------|-------------|
| 1 | `src/lib/removeBg.ts` | Appel API Remove.bg, retourne buffer PNG |
| 2 | `src/lib/processVehicleImage.ts` | Orchestration : removeBg → fond studio → watermark → 4 variantes |
| 3 | `src/endpoints/processImages.ts` | Handler HTTP `POST /api/process-images` |
| 4 | `src/payload.config.ts` | Enregistrement du nouvel endpoint |
| 5 | `src/endpoints/bulkEnrich.ts` | Option `processImages` dans le bulk |
| 6 | `.env` + `.env.example` | Variables `REMOVE_BG_API_KEY`, etc. |

---

## Points de vigilance

**Crédits Remove.bg**
Surveiller la consommation. Ajouter un check avant traitement : si crédits < seuil d'alerte, log warning et skip Remove.bg (fond studio seulement).

**Images non détourables**
Remove.bg peut échouer sur des images de mauvaise qualité ou trop petites. Toujours prévoir un fallback sur l'image brute originale.

**Temps de traitement**
Remove.bg : ~3-5s par image. Sharp : ~0.5s. Total par véhicule : ~6-8s. À prendre en compte dans le timeout du bulk-enrich.

**Watermark et RGPD**
Les images AS24 appartiennent aux concessionnaires. Le watermark VanalexCars doit rester discret et ne pas masquer les informations du véhicule.
