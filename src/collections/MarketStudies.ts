import type { CollectionConfig, AccessArgs } from 'payload'
import type { User } from '@/payload-types'

type AdminAccess = (args: AccessArgs<User>) => boolean

const isAdmin: AdminAccess = ({ req: { user } }) => {
  return Boolean(user) && (user as User & { role?: string }).role === 'admin'
}

const isAuthenticated: AdminAccess = ({ req: { user } }) => {
  return Boolean(user)
}

export const MarketStudies: CollectionConfig = {
  slug: 'market-studies',
  admin: {
    useAsTitle: 'name',
    description: 'Études de marché comparatif DE/FR',
    defaultColumns: ['name', 'brand', 'model', 'status', 'schedule', 'lastRunStatus', 'lastRunAt'],
  },
  access: {
    read: isAuthenticated,
    create: isAdmin,
    update: isAdmin,
    delete: isAdmin,
  },
  fields: [
    // ── Identification ──────────────────────────────────────────────────────
    {
      name: 'name',
      type: 'text',
      required: true,
      admin: { description: 'Nom de l\'étude (ex: MINI JCW 2020-2023)' },
    },
    {
      name: 'brand',
      type: 'text',
      required: true,
      admin: { description: 'Marque (ex: MINI, BMW)' },
    },
    {
      name: 'model',
      type: 'text',
      required: true,
      admin: { description: 'Modèle (ex: John Cooper Works, M3)' },
    },
    {
      name: 'generation',
      type: 'text',
      admin: { description: 'Génération (ex: F56, G20)' },
    },
    {
      name: 'bodyTypes',
      type: 'select',
      hasMany: true,
      options: [
        { label: 'Berline', value: 'sedan' },
        { label: 'Coupé', value: 'coupe' },
        { label: 'Cabriolet', value: 'convertible' },
        { label: 'Break', value: 'wagon' },
        { label: 'SUV', value: 'suv' },
        { label: 'Monospace', value: 'van' },
        { label: 'Sportback', value: 'sportback' },
        { label: 'Touring', value: 'touring' },
      ],
      admin: { description: 'Types de carrosserie à inclure' },
    },

    // ── Critères de filtrage ────────────────────────────────────────────────
    {
      name: 'yearMin',
      type: 'number',
      admin: { description: 'Année minimum (ex: 2020)' },
    },
    {
      name: 'yearMax',
      type: 'number',
      admin: { description: 'Année maximum (ex: 2024)' },
    },
    {
      name: 'registrationDateMin',
      type: 'date',
      admin: { description: 'Date de première immatriculation minimum' },
    },
    {
      name: 'registrationDateMax',
      type: 'date',
      admin: { description: 'Date de première immatriculation maximum' },
    },
    {
      name: 'mileageMax',
      type: 'number',
      admin: { description: 'Kilométrage maximum (km)' },
    },
    {
      name: 'fuel',
      type: 'select',
      options: [
        { label: 'Essence', value: 'petrol' },
        { label: 'Diesel', value: 'diesel' },
        { label: 'Électrique', value: 'electric' },
        { label: 'Hybride', value: 'hybrid' },
        { label: 'Hybride rechargeable', value: 'plugin-hybrid' },
      ],
      admin: { description: 'Type de carburant' },
    },
    {
      name: 'transmission',
      type: 'select',
      options: [
        { label: 'Manuelle', value: 'manual' },
        { label: 'Automatique', value: 'automatic' },
      ],
      admin: { description: 'Type de transmission' },
    },
    {
      name: 'powerMinHp',
      type: 'number',
      admin: { description: 'Puissance minimale (ch/HP)' },
    },
    {
      name: 'powerMaxHp',
      type: 'number',
      admin: { description: 'Puissance maximale (ch/HP)' },
    },
    {
      name: 'sellerTypes',
      type: 'select',
      hasMany: true,
      options: [
        { label: 'Professionnel', value: 'professional' },
        { label: 'Particulier', value: 'private' },
        { label: 'Inconnu', value: 'unknown' },
      ],
      admin: { description: 'Types de vendeurs acceptés' },
    },
    {
      name: 'vatTypes',
      type: 'select',
      hasMany: true,
      options: [
        { label: 'TVA déductible', value: 'deductible' },
        { label: 'TVA sur marge', value: 'margin' },
        { label: 'Particulier (sans TVA)', value: 'private' },
        { label: 'Inconnu', value: 'unknown' },
      ],
      admin: { description: 'Types de TVA acceptés' },
    },
    {
      name: 'accidentFreeOnly',
      type: 'checkbox',
      defaultValue: true,
      admin: { description: 'Exiger sans accident déclaré' },
    },
    {
      name: 'warrantyRequired',
      type: 'checkbox',
      defaultValue: false,
      admin: { description: 'Exiger une garantie constructeur ou distributeur' },
    },

    // ── Sources ─────────────────────────────────────────────────────────────
    {
      name: 'sourcesFR',
      type: 'select',
      hasMany: true,
      options: [
        { label: 'AutoScout24 France', value: 'autoscout24_fr' },
        { label: 'La Centrale', value: 'lacentrale' },
        { label: 'Leboncoin', value: 'leboncoin' },
        { label: 'Manuel', value: 'manual' },
      ],
      admin: { description: 'Sources d\'annonces côté France' },
    },
    {
      name: 'sourcesDE',
      type: 'select',
      hasMany: true,
      options: [
        { label: 'Véhicules internes', value: 'internal_vehicles' },
        { label: 'AutoScout24 Allemagne', value: 'autoscout24_de' },
      ],
      admin: { description: 'Sources d\'annonces côté Allemagne' },
    },
    {
      name: 'searchUrlDE',
      type: 'text',
      admin: { description: 'URL de recherche AutoScout24 DE (optionnel, généré si absent)' },
    },
    {
      name: 'searchUrlFR',
      type: 'text',
      admin: { description: 'URL de recherche AutoScout24 FR (optionnel)' },
    },

    // ── Planification ───────────────────────────────────────────────────────
    {
      name: 'status',
      type: 'select',
      defaultValue: 'active',
      required: true,
      options: [
        { label: 'Active', value: 'active' },
        { label: 'Pausée', value: 'paused' },
      ],
      admin: { description: 'Statut de l\'étude', position: 'sidebar' },
    },
    {
      name: 'schedule',
      type: 'select',
      defaultValue: 'weekly',
      required: true,
      options: [
        { label: 'Manuel', value: 'manual' },
        { label: 'Quotidien', value: 'daily' },
        { label: 'Hebdomadaire', value: 'weekly' },
        { label: 'Mensuel', value: 'monthly' },
      ],
      admin: { description: 'Fréquence d\'exécution automatique', position: 'sidebar' },
    },

    // ── État d'exécution (readOnly) ─────────────────────────────────────────
    {
      name: 'lastRunAt',
      type: 'date',
      admin: { readOnly: true, position: 'sidebar', description: 'Dernière exécution' },
    },
    {
      name: 'nextRunAt',
      type: 'date',
      admin: { readOnly: true, position: 'sidebar', description: 'Prochaine exécution planifiée' },
    },
    {
      name: 'lastSuccessfulRunAt',
      type: 'date',
      admin: { readOnly: true, position: 'sidebar', description: 'Dernière exécution réussie' },
    },
    {
      name: 'lastRunStatus',
      type: 'select',
      defaultValue: 'never_run',
      options: [
        { label: 'Jamais exécutée', value: 'never_run' },
        { label: 'En file', value: 'queued' },
        { label: 'En cours', value: 'running' },
        { label: 'Terminée', value: 'completed' },
        { label: 'Échec', value: 'failed' },
      ],
      admin: { readOnly: true, position: 'sidebar', description: 'Statut dernière exécution' },
    },
    {
      name: 'lastRunError',
      type: 'textarea',
      admin: { readOnly: true, position: 'sidebar', description: 'Erreur de la dernière exécution' },
    },

    // ── Coûts ───────────────────────────────────────────────────────────────
    {
      name: 'importCostOverride',
      type: 'number',
      admin: {
        description: 'Coût d\'import fixe (€). Si renseigné, remplace le calcul automatique.',
        position: 'sidebar',
      },
    },
  ],
}
