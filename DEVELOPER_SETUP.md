# Developer Setup Guide

## Configuration TypeScript (post TS7 migration)

Ce projet utilise une configuration TypeScript moderne, compatible avec TypeScript 5.0+ et préparée pour TypeScript 7.

### Installation et Build

```bash
pnpm install
pnpm build
```

### Imports simplifiés disponibles

Le projet supporte plusieurs alias d'imports pour simplifier la navigation dans le code:

```typescript
// Alias @/* - Recommandé pour les nouveaux fichiers
import { cn } from '@/utilities/cn'
import { seed } from '@/endpoints/seed'
import config from '@payload-config'

// Alias src/* - Support legacy (fonctionne toujours)
import { cn } from 'src/utilities/cn'
import { seed } from 'src/endpoints/seed'
```

### Structure des Path Mappings

La configuration `tsconfig.json` utilise les mappings suivants:

- `@/*` → `./src/*` - Alias principal (recommandé)
- `src/*` → `./src/*` - Support des imports legacy
- `@payload-config` → `./src/payload.config.ts` - Configuration Payload CMS

### Migration effectuée

La configuration a été migrée pour éliminer `baseUrl` (déprécié) et utiliser des path mappings explicites, conformément aux recommandations TypeScript 5.0+.

## Scripts disponibles

```bash
# Développement
pnpm dev                    # Lance le serveur de développement

# Build et déploiement
pnpm build                  # Build de production (migrations + Next.js)
pnpm start                  # Lance le serveur de production

# Base de données
pnpm payload migrate        # Exécute les migrations Payload CMS
pnpm payload migrate:create # Crée une nouvelle migration
```

## Configuration requise

- Node.js 18+ ou 20+
- pnpm (gestionnaire de paquets)
- MongoDB Atlas (connexion configurée via `.env`)

## Variables d'environnement

Copier `.env.example` vers `.env` et configurer:

```bash
cp .env.example .env
```

Variables essentielles:
- `MONGODB_URI` - URI de connexion MongoDB Atlas
- `PAYLOAD_SECRET` - Secret pour JWT (générer avec `openssl rand -base64 32`)
- `NEXT_PUBLIC_SERVER_URL` - URL publique du serveur
