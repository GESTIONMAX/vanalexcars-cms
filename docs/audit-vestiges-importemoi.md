# Audit vestiges ImporteMoi

> Audit **lecture seule** — aucune modification de code.
> Date : 2026-07-20
> Périmètre : backend complet (src/, scripts, collections, endpoints, lib, docs, .env*)

---

## Contexte

ImporteMoi (importemoi.fr) était un intermédiaire de sourcing automobile utilisé avant la mise en place du pipeline AutoScout24. La plateforme n'est plus utilisée comme source de données. Cet audit recense les références résiduelles et évalue leur impact sur la nouvelle mécanique d'état d'enrichissement (C5).

---

## 1. Synthèse des occurrences

| Fichier | Occurrences | Nature | Vivant ? |
|---------|-------------|--------|----------|
| `src/collections/Vehicles.ts` | 4 | Descriptions de champs admin UI | Non (commentaires) |
| `src/payload-types.ts` | 5 | JSDoc auto-généré | Non (généré) |
| `src/endpoints/bulkEnrich.ts` | 2 | Logique active (regex + scoring) | **Oui** |
| `src/endpoints/enrichVehicle.ts` | 1 | Logique active (regex override dealer) | **Oui** |
| `src/scripts/bulk-enrich.ts` | 1 | Logique active (regex override dealer) | **Oui** |
| `docs/audit-pipeline-import.md` | 4 | Documentation (constat + limitation) | Non (docs) |
| `docs/enrich-vehicle.md` | 1 | Documentation (spec comportement) | Non (docs) |
| `.env` / `.env.example` | 0 | — | — |

**Occurrences de logique active : 4 lignes dans 3 fichiers.**

---

## 2. Logique active — détail

### Pattern commun

La chaîne `importemoi` est utilisée comme **détecteur de nom de concessionnaire placeholder**. L'hypothèse métier : si le champ `dealer` d'un véhicule contient « importemoi », c'est un nom de remplissage hérité de l'import initial, pas le vrai concessionnaire.

```
src/endpoints/bulkEnrich.ts   (lignes 51, 272)
src/endpoints/enrichVehicle.ts (ligne 128)
src/scripts/bulk-enrich.ts    (ligne 134)
```

#### 2a. Scoring — `bulkEnrich.ts` ligne 51

```typescript
if (v.dealer && !/importemoi/i.test(v.dealer)) earned += weights.dealer
```

**Effet** : un véhicule dont le dealer est « importemoi » ne marque pas les 10 points dealer. Son score de complétude est artificiellement bas, ce qui l'envoie en tête de la queue d'enrichissement.

**Impact C5** : le `enrichmentStatus: completed` est attribué quand `appliedFields.length === 0`. Si un véhicule a `dealer = "importemoi"` mais qu'AS24 ne renvoie pas de dealer (annonce sans concession), il sera marqué `completed` mais continuera à scorer bas à l'infini. Ce cas n'est pas distingué aujourd'hui.

#### 2b. Override dealer — `bulkEnrich.ts` ligne 272 / `enrichVehicle.ts` ligne 128 / `bulk-enrich.ts` ligne 134

```typescript
if (extractedData.dealer && (!vehicle.dealer || /importemoi/i.test(vehicle.dealer))) {
  patch.dealer = extractedData.dealer
}
```

**Effet** : si AS24 fournit un vrai dealer, il écrase la valeur placeholder. Sinon, le dealer reste « importemoi » indéfiniment.

**Problème** : le regex est un nom propre hard-codé. Il ne couvre pas d'autres valeurs placeholder possibles (`"N/A"`, `"Particulier"`, `"À renseigner"`, etc.). Il couvre aussi potentiellement un vrai concessionnaire dont le nom contiendrait la chaîne « importemoi » (improbable mais non nul).

---

## 3. Champs schema potentiellement orphelins

### `externalId` (Vehicles.ts ligne 318)

```typescript
{
  name: 'externalId',
  type: 'text',
  unique: true,
  index: true,
  admin: { description: 'ID externe du véhicule (ImporteMoi, AutoScout24, etc.)' }
}
```

**Statut** : défini, indexé (unique sparse), mais **aucun code ne l'écrit ni ne le lit** en dehors de la définition de schéma.

**Hypothèse d'origine** : préparé pour stocker les IDs ImporteMoi (format non connu) ou AS24. Jamais utilisé — la déduplication AS24 passe par `sourceKey` et `canonicalSourceUrl`.

**Impact C5** : aucun. Le champ est invisible dans la logique d'enrichissement.

**Risque** : index unique sparse en MongoDB sur un champ vide ne pose pas de problème de performance significatif. En revanche, il crée une contrainte silencieuse : deux véhicules ne peuvent pas avoir la même valeur non-nulle pour `externalId`.

### `externalReference` (Vehicles.ts ligne 328)

```typescript
{
  name: 'externalReference',
  type: 'text',
  unique: true,
  index: true,
  admin: { description: 'Référence externe (ex: IMP-5474774)' }
}
```

**Statut** : même situation qu'`externalId`. La description mentionne explicitement le format `IMP-XXXXXXX` d'ImporteMoi.

**Impact C5** : aucun direct. Mais si on veut ajouter un vrai identifiant AS24 secondaire, ce champ est trompeur — son nom et sa description suggèrent un usage différent.

---

## 4. Interaction avec l'état d'enrichissement C5

La nouvelle mécanique C5 (`enrichmentStatus`) ne dépend pas directement d'ImporteMoi. Mais les dépendances indirectes créent des cas limites :

| Cas | Comportement actuel | Risque |
|-----|--------------------|----|
| Véhicule avec `dealer = "importemoi"`, AS24 ne renvoie pas de dealer | `enrichmentStatus: completed`, `dealer` reste "importemoi", score dealer reste à 0 | Véhicule bloqué bas score à jamais |
| Véhicule importé depuis AS24 directement (jamais passé par ImporteMoi) | `dealer` = null → regex ne matche pas → override dealer autorisé | OK, comportement correct |
| Véhicule avec `externalId` renseigné (anciens imports ImporteMoi) | `externalId` ignoré par tout le pipeline C5 | OK pour C5, mais `externalId` reste orphelin |
| Score dealer pénalisé par "importemoi" → `completed` avec score < minScore | Incohérence : `completed` mais sort toujours dans la queue si `mode: all` | Résolu par le filtre `mode: resume` |

---

## 5. Variables d'environnement

`.env` et `.env.example` ne contiennent aucune variable liée à ImporteMoi (pas de token API, pas d'URL, pas de credentials). La plateforme est entièrement découplée au niveau configuration.

---

## 6. Documentation

`docs/audit-pipeline-import.md` mentionne le regex ImporteMoi 4 fois, dont une fois explicitement comme dette technique :

> `| Score dealer : /importemoi/i | Nom d'un intermédiaire spécifique | Hard-codé |`

Ce constat est exact et reste valide.

---

## 7. Recommandations

Ces recommandations sont **classées par impact**, non par urgence. Aucune n'est bloquante pour C4.

### R1 — Remplacer le regex hard-codé par un champ explicite (priorité moyenne)

Remplacer `/importemoi/i` par un champ `dealerIsPlaceholder: boolean` ou une valeur de select `dealerSource: 'reliable' | 'placeholder'`.

**Avantage** : la notion de « dealer de remplissage » devient déclarative, indépendante du nom de la plateforme. Couvre les futures sources.

**Effort** : schema change + migration + mise à jour des 4 occurrences de logique.

### R2 — Nettoyer `externalId` et `externalReference` (priorité faible)

Avant de supprimer : vérifier en base que les champs sont effectivement vides pour tous les documents.

```javascript
// À exécuter dans MongoDB shell
db.vehicles.countDocuments({ externalId: { $ne: null } })
db.vehicles.countDocuments({ externalReference: { $ne: null } })
```

Si 0 résultats : supprimer les champs du schema, lancer `pnpm migrate` pour retirer les index.

**Effort** : faible si données vides.

### R3 — Distinguer "completed sans dealer" de "completed complet" (priorité faible)

Ajouter un sous-statut ou une note dans `enrichmentLastError` quand `appliedFields.length === 0` mais que `dealer` reste un placeholder.

**Effet** : permet de cibler ces véhicules pour une revue manuelle sans relancer tout l'enrichissement.

### R4 — Mettre à jour les descriptions de champs (priorité très faible)

Remplacer les mentions « ImporteMoi » dans les descriptions admin UI par les sources actuelles.

Exemples :
- `'ID externe du véhicule (ImporteMoi, AutoScout24, etc.)'` → `'ID externe du véhicule (AutoScout24, etc.)'`
- `'Plateforme source (importemoi.fr, autoscout24.de, etc.)'` → `'Plateforme source (ex: autoscout24.de)'`
- `'URLs des images du véhicule (générées depuis ImporteMoi)'` → `'URLs des images brutes du véhicule'`

**Effort** : 5 lignes, aucune migration.

---

## 8. Conclusion

ImporteMoi n'est pas entièrement mort dans le code. Quatre lignes de logique active utilisent son nom comme marqueur de données incomplètes. Ces lignes fonctionnent correctement pour les données historiques, mais elles sont fragiles (nom hard-codé) et créent un cas limite identifié avec C5 (véhicule marqué `completed` mais dealer toujours « importemoi »).

Aucune action immédiate n'est requise avant C4. Le nettoyage complet est souhaitable avant d'ouvrir le pipeline à d'autres sources que AutoScout24.
