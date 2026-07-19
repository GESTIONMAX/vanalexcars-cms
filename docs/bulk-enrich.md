# Endpoint : Enrichissement en masse (Bulk Enrich)

## Vue d'ensemble

`POST /api/bulk-enrich`

Enrichit automatiquement **plusieurs véhicules AutoScout24 en base** par ordre de complétude croissante. Streame les résultats en temps réel via **Server-Sent Events (SSE)** pour éviter les timeouts.

C'est la **version automatisée** de `/api/enrich-vehicle`, conçue pour être lancée depuis le frontend ou un script de maintenance.

---

## Prérequis

### Variables d'environnement

| Variable | Obligatoire | Description |
|----------|-------------|-------------|
| `SCRAPER_SECRET` | Non | Secret partagé pour authentifier les appels |
| `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` | Non | Chemin vers Chromium (défaut : `/usr/bin/chromium`) |

---

## Requête

```
POST /api/bulk-enrich
Content-Type: application/json
x-secret: <SCRAPER_SECRET>
```

### Corps (JSON)

| Champ | Type | Défaut | Description |
|-------|------|--------|-------------|
| `minScore` | number | `80` | Score de complétude cible (%). Les véhicules avec score ≥ minScore sont ignorés |
| `limit` | number | `20` | Nombre maximum de véhicules à enrichir par appel |
| `brand` | string | — | Filtrer par marque (ex: `"volkswagen"`, `"bmw"`) |
| `category` | string | — | Filtrer par catégorie Payload |
| `secret` | string | — | Alternative au header `x-secret` |

**Exemple :**

```json
{
  "minScore": 70,
  "limit": 10,
  "brand": "bmw"
}
```

---

## Réponses

### Format SSE (streaming)

La réponse est un flux `text/event-stream`. Chaque ligne est un événement JSON :

```
data: {"type":"log","message":"Démarrage enrichissement backend — score cible: <80% | limite: 20"}

data: {"type":"log","message":"45 véhicules AS24 récupérés"}

data: {"type":"log","message":"12 véhicules à enrichir (score < 80%)"}

data: {"type":"log","message":"Traitement: BMW Série 3 (score: 45%)"}

data: {"type":"vehicle","title":"BMW Série 3","scoreBefore":45,"scoreAfter":78,"status":"enriched"}

data: {"type":"vehicle","title":"Audi A4","scoreBefore":60,"scoreAfter":60,"status":"skipped","message":"Rien à enrichir"}

data: {"type":"vehicle","title":"Mercedes C200","scoreBefore":30,"scoreAfter":30,"status":"error","message":"Timeout"}

data: {"type":"done","stats":{"total":12,"enriched":9,"skipped":2,"errors":1}}
```

### Types d'événements

| `type` | Description |
|--------|-------------|
| `log` | Message de progression (texte libre) |
| `vehicle` | Résultat d'un véhicule traité |
| `done` | Fin du stream avec statistiques globales |

### Statuts véhicule

| `status` | Signification |
|----------|---------------|
| `enriched` | Des champs ont été mis à jour, le score a progressé |
| `skipped` | Tous les champs étaient déjà renseignés, rien à enrichir |
| `error` | Erreur Playwright (timeout, bot-detection, URL invalide) |

### Erreurs HTTP (avant le stream)

| Code | Cause |
|------|-------|
| `400` | Body JSON invalide |
| `401` | Header `x-secret` absent ou incorrect |

---

## Exemples

### cURL (affichage SSE brut)

```bash
curl -X POST https://api.import-voiture-allemagne.fr/api/bulk-enrich \
  -H "Content-Type: application/json" \
  -H "x-secret: $SCRAPER_SECRET" \
  -d '{"minScore": 80, "limit": 20}' \
  --no-buffer
```

### JavaScript (EventSource / fetch streaming)

```js
const response = await fetch('/api/bulk-enrich', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-secret': SCRAPER_SECRET,
  },
  body: JSON.stringify({ minScore: 80, limit: 20, brand: 'bmw' }),
})

const reader = response.body.getReader()
const decoder = new TextDecoder()

while (true) {
  const { done, value } = await reader.read()
  if (done) break
  const lines = decoder.decode(value).split('\n')
  for (const line of lines) {
    if (line.startsWith('data: ')) {
      const event = JSON.parse(line.slice(6))
      console.log(event)
    }
  }
}
```

---

## Comportement interne

### Algorithme de sélection

```
1. Récupérer tous les véhicules avec sourcePlatform = "autoscout24.de"
2. Filtrer : garder uniquement ceux avec originalListingUrl ou sourceUrl /angebote/
3. Calculer le score de complétude de chacun (0-100%)
4. Filtrer : garder ceux avec score < minScore
5. Trier par score croissant (les plus incomplets en premier)
6. Prendre les N premiers (limit)
7. Enrichir un par un avec 1.5s de pause entre chaque
```

### Score de complétude

Le score est calculé sur une base de **98 points** :

| Champ | Points |
|-------|--------|
| `price` | 10 |
| `title` | 10 |
| `year` | 10 |
| `mileage` | 10 |
| `fuel` | 10 |
| `transmission` | 10 |
| `imageUrls` (≥1) | 10 |
| `dealer` (non ImporteMoi) | 10 |
| `specifications.power` | 5 |
| `exteriorColor` | 5 |
| `doors` | 5 |
| `seats` | 5 |
| `features` (≥1) | 2 |
| `description` (>20 chars) | 2 |
| `interiorColor` | 2 |
| `dealerCity` | 2 |
| `originalListingUrl` | 2 |

### Pause anti-bot

1.5 secondes de délai entre chaque véhicule pour éviter la détection par Cloudflare/AS24.

### Logique de merge

Identique à `/api/enrich-vehicle` — aucun champ existant n'est écrasé. Voir [enrich-vehicle.md](./enrich-vehicle.md#logique-de-merge-non-destructif).

---

## Script CLI équivalent

Pour une exécution en dehors du serveur HTTP (cron, CI/CD) :

```bash
pnpm bulk-enrich        # enrichissement réel
pnpm bulk-enrich:dry    # dry run — prévisualisation sans écriture
```

Source : [src/scripts/bulk-enrich.ts](../src/scripts/bulk-enrich.ts)

---

## Points de vigilance

**Durée d'exécution**
Chaque véhicule prend ~10-15 secondes (Playwright + 6s d'attente XHR + 1.5s pause). Pour 20 véhicules : ~4-5 minutes. Utiliser SSE côté client pour afficher la progression.

**Bot-detection AS24**
Si plusieurs enrichissements consécutifs retournent `status: error` avec un message de timeout, AS24 bloque probablement l'IP. Attendre 30-60 minutes avant de relancer.

**Filtre `sourcePlatform`**
Seuls les véhicules avec `sourcePlatform = "autoscout24.de"` sont traités. Les véhicules d'autres sources (ImporteMoi, etc.) sont ignorés.
