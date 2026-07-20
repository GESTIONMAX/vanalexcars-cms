import type { CollectionConfig, AccessArgs, CollectionSlug } from 'payload'
import type { User } from '@/payload-types'

type AdminAccess = (args: AccessArgs<User>) => boolean

const isAuthenticated: AdminAccess = ({ req: { user } }) => Boolean(user)

export const MarketListings: CollectionConfig = {
  slug: 'market-listings',
  admin: {
    useAsTitle: 'title',
    description: 'Annonces de marché collectées (DE et FR)',
    defaultColumns: ['title', 'study', 'side', 'source', 'advertisedPrice', 'status', 'lastSeenAt'],
  },
  access: {
    read: isAuthenticated,
    create: isAuthenticated,
    update: isAuthenticated,
    delete: isAuthenticated,
  },
  fields: [
    // ── Références ──────────────────────────────────────────────────────────
    {
      name: 'study',
      type: 'relationship',
      relationTo: 'market-studies' as CollectionSlug,
      required: true,
      index: true,
      admin: { description: 'Étude de marché associée' },
    },
    {
      name: 'side',
      type: 'select',
      required: true,
      index: true,
      options: [
        { label: 'Allemagne', value: 'germany' },
        { label: 'France', value: 'france' },
      ],
      admin: { description: 'Côté du marché' },
    },
    {
      name: 'source',
      type: 'select',
      required: true,
      index: true,
      options: [
        { label: 'Véhicule interne', value: 'internal_vehicle' },
        { label: 'AutoScout24 DE', value: 'autoscout24_de' },
        { label: 'AutoScout24 FR', value: 'autoscout24_fr' },
        { label: 'La Centrale', value: 'lacentrale' },
        { label: 'Leboncoin', value: 'leboncoin' },
        { label: 'Manuel', value: 'manual' },
      ],
      admin: { description: 'Source de l\'annonce' },
    },
    {
      name: 'vehicle',
      type: 'relationship',
      relationTo: 'vehicles',
      admin: { description: 'Lien vers le véhicule interne (si source=internal_vehicle)' },
    },

    // ── Identification de l'annonce ─────────────────────────────────────────
    {
      name: 'sourceUrl',
      type: 'text',
      required: true,
      admin: { description: 'URL de l\'annonce source' },
    },
    {
      name: 'sourceId',
      type: 'text',
      required: true,
      admin: { description: 'Identifiant unique dans la source' },
    },
    {
      name: 'deduplicationKey',
      type: 'text',
      required: true,
      unique: true,
      index: true,
      admin: {
        readOnly: true,
        hidden: true,
        description: 'Clé de déduplication : studyId:source:sourceId',
      },
    },

    // ── Données de l'annonce ────────────────────────────────────────────────
    {
      name: 'title',
      type: 'text',
      admin: { description: 'Titre de l\'annonce' },
    },
    {
      name: 'advertisedPrice',
      type: 'number',
      required: true,
      admin: { description: 'Prix affiché dans l\'annonce' },
    },
    {
      name: 'currency',
      type: 'select',
      defaultValue: 'EUR',
      options: [
        { label: 'Euro', value: 'EUR' },
      ],
      admin: { description: 'Devise' },
    },
    {
      name: 'mileage',
      type: 'number',
      admin: { description: 'Kilométrage (km)' },
    },
    {
      name: 'year',
      type: 'number',
      admin: { description: 'Année du véhicule' },
    },
    {
      name: 'registrationDate',
      type: 'date',
      admin: { description: 'Date de première immatriculation' },
    },
    {
      name: 'fuel',
      type: 'text',
      admin: { description: 'Carburant normalisé' },
    },
    {
      name: 'transmission',
      type: 'text',
      admin: { description: 'Transmission normalisée' },
    },
    {
      name: 'bodyType',
      type: 'text',
      admin: { description: 'Type de carrosserie normalisé' },
    },
    {
      name: 'powerHp',
      type: 'number',
      admin: { description: 'Puissance en chevaux (HP)' },
    },
    {
      name: 'engineCapacity',
      type: 'number',
      admin: { description: 'Cylindrée (cm³)' },
    },
    {
      name: 'doors',
      type: 'number',
      admin: { description: 'Nombre de portes' },
    },
    {
      name: 'sellerType',
      type: 'select',
      options: [
        { label: 'Professionnel', value: 'professional' },
        { label: 'Particulier', value: 'private' },
        { label: 'Inconnu', value: 'unknown' },
      ],
      admin: { description: 'Type de vendeur' },
    },
    {
      name: 'vatType',
      type: 'select',
      options: [
        { label: 'TVA déductible', value: 'deductible' },
        { label: 'TVA sur marge', value: 'margin' },
        { label: 'Particulier (sans TVA)', value: 'private' },
        { label: 'Inconnu', value: 'unknown' },
      ],
      admin: { description: 'Type de TVA' },
    },
    {
      name: 'accidentStatus',
      type: 'select',
      options: [
        { label: 'Sans accident', value: 'accident_free' },
        { label: 'Endommagé', value: 'damaged' },
        { label: 'Réparé', value: 'repaired' },
        { label: 'Inconnu', value: 'unknown' },
      ],
      admin: { description: 'Historique d\'accidents' },
    },
    {
      name: 'warrantyMonths',
      type: 'number',
      admin: { description: 'Durée de garantie restante (mois)' },
    },
    {
      name: 'location',
      type: 'text',
      admin: { description: 'Localisation du véhicule' },
    },
    {
      name: 'dealer',
      type: 'text',
      admin: { description: 'Nom du vendeur / concession' },
    },
    {
      name: 'imageUrl',
      type: 'text',
      admin: { description: 'URL de l\'image principale' },
    },

    // ── Données normalisées ─────────────────────────────────────────────────
    {
      name: 'normalizedMake',
      type: 'text',
      admin: { description: 'Marque normalisée' },
    },
    {
      name: 'normalizedModel',
      type: 'text',
      admin: { description: 'Modèle normalisé' },
    },
    {
      name: 'normalizedTrim',
      type: 'text',
      admin: { description: 'Version/trim normalisée' },
    },
    {
      name: 'normalizedGeneration',
      type: 'text',
      admin: { description: 'Génération normalisée (ex: F56)' },
    },
    {
      name: 'normalizationConfidence',
      type: 'number',
      min: 0,
      max: 100,
      admin: { description: 'Score de confiance de normalisation (0-100)' },
    },

    // ── Suivi temporel ──────────────────────────────────────────────────────
    {
      name: 'firstSeenAt',
      type: 'date',
      required: true,
      admin: { readOnly: true, description: 'Première détection de l\'annonce' },
    },
    {
      name: 'lastSeenAt',
      type: 'date',
      required: true,
      admin: { readOnly: true, description: 'Dernière détection de l\'annonce' },
    },
    {
      name: 'removedAt',
      type: 'date',
      admin: { readOnly: true, description: 'Date de suppression de l\'annonce' },
    },
    {
      name: 'status',
      type: 'select',
      defaultValue: 'active',
      index: true,
      options: [
        { label: 'Active', value: 'active' },
        { label: 'Supprimée', value: 'removed' },
      ],
      admin: { description: 'Statut de l\'annonce' },
    },

    // ── Données brutes ──────────────────────────────────────────────────────
    {
      name: 'rawData',
      type: 'json',
      admin: { description: 'Données brutes de la source (JSON)' },
    },
  ],
}
