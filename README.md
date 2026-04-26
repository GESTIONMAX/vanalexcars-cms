# VanalexCars Backend API

Backend headless API-only pour la marketplace VanalexCars, construit avec Payload CMS v3.

## Stack

- **Framework** : Next.js 15 + Payload CMS 3.59.1
- **Langage** : TypeScript 5.7
- **Base de donnees** : MongoDB Atlas
- **Runtime** : Node.js 20+
- **Package manager** : pnpm

## Architecture

Ce backend fonctionne en mode **API-only** :

- REST API sur `/api/[collection]`
- GraphQL sur `/api/graphql`
- Portail technique sur `/`
- Panel admin Payload desactive (404)
- Frontend separe (Netlify)

## Collections

| Collection | Description |
|------------|-------------|
| Vehicles | Inventaire vehicules |
| Posts | Articles / blog |
| Pages | Pages de contenu |
| Media | Images et fichiers |
| Categories | Taxonomie |
| Users | Utilisateurs et auth |
| Comments | Commentaires |

## Setup local

```bash
# 1. Copier les variables d'environnement
cp .env.example .env

# 2. Installer les dependances
pnpm install

# 3. Lancer en mode dev (port 4200)
pnpm dev

# 4. Build production
pnpm build
pnpm start
```

## Variables d'environnement

| Variable | Description |
|----------|-------------|
| `DATABASE_URI` | URI MongoDB Atlas |
| `PAYLOAD_SECRET` | Secret Payload (generer avec `openssl rand -base64 32`) |
| `PAYLOAD_PUBLIC_SERVER_URL` | URL publique du backend |

## Scripts

```bash
pnpm dev              # Serveur dev (port 4200)
pnpm build            # Build production
pnpm start            # Lancer le build
pnpm generate:types   # Generer les types TypeScript
pnpm lint             # Linter
```

## Deploiement

- **Backend** : Hetzner VPS via Coolify
- **Frontend** : Netlify (repo separe)
- **Base de donnees** : MongoDB Atlas
