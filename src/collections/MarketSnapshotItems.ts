import type { CollectionConfig, AccessArgs, CollectionSlug } from 'payload'
import type { User } from '@/payload-types'

type AdminAccess = (args: AccessArgs<User>) => boolean

const isAuthenticated: AdminAccess = ({ req: { user } }) => Boolean(user)

export const MarketSnapshotItems: CollectionConfig = {
  slug: 'market-snapshot-items',
  admin: {
    useAsTitle: 'titleAtSnapshot',
    description: 'Items individuels d\'un snapshot de marché (données figées)',
    defaultColumns: ['snapshot', 'side', 'source', 'titleAtSnapshot', 'priceAtSnapshot', 'included'],
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
      name: 'snapshot',
      type: 'relationship',
      relationTo: 'market-snapshots' as CollectionSlug,
      required: true,
      index: true,
      admin: { description: 'Snapshot associé' },
    },
    {
      name: 'listing',
      type: 'relationship',
      relationTo: 'market-listings' as CollectionSlug,
      required: true,
      index: true,
      admin: { description: 'Annonce source' },
    },
    {
      name: 'side',
      type: 'select',
      required: true,
      options: [
        { label: 'Allemagne', value: 'germany' },
        { label: 'France', value: 'france' },
      ],
      admin: { description: 'Côté du marché' },
    },

    // ── Inclusion / exclusion ───────────────────────────────────────────────
    {
      name: 'included',
      type: 'checkbox',
      defaultValue: true,
      admin: { description: 'Incluse dans les calculs statistiques' },
    },
    {
      name: 'exclusionReason',
      type: 'text',
      admin: { description: 'Raison d\'exclusion (si non incluse)' },
    },
    {
      name: 'matchingScore',
      type: 'number',
      min: 0,
      max: 100,
      admin: { description: 'Score de matching avec les critères de l\'étude (0-100)' },
    },

    // ── Données figées au moment du snapshot ────────────────────────────────
    {
      name: 'source',
      type: 'text',
      admin: { description: 'Source au moment du snapshot' },
    },
    {
      name: 'sourceId',
      type: 'text',
      admin: { description: 'ID source au moment du snapshot' },
    },
    {
      name: 'sourceUrl',
      type: 'text',
      admin: { description: 'URL source au moment du snapshot' },
    },
    {
      name: 'titleAtSnapshot',
      type: 'text',
      admin: { description: 'Titre de l\'annonce au moment du snapshot' },
    },
    {
      name: 'priceAtSnapshot',
      type: 'number',
      admin: { description: 'Prix au moment du snapshot (€)' },
    },
    {
      name: 'mileageAtSnapshot',
      type: 'number',
      admin: { description: 'Kilométrage au moment du snapshot' },
    },
    {
      name: 'yearAtSnapshot',
      type: 'number',
      admin: { description: 'Année au moment du snapshot' },
    },
    {
      name: 'registrationDateAtSnapshot',
      type: 'date',
      admin: { description: 'Date d\'immatriculation au moment du snapshot' },
    },
    {
      name: 'bodyTypeAtSnapshot',
      type: 'text',
      admin: { description: 'Type de carrosserie au moment du snapshot' },
    },
    {
      name: 'transmissionAtSnapshot',
      type: 'text',
      admin: { description: 'Transmission au moment du snapshot' },
    },
    {
      name: 'powerHpAtSnapshot',
      type: 'number',
      admin: { description: 'Puissance (HP) au moment du snapshot' },
    },
    {
      name: 'sellerTypeAtSnapshot',
      type: 'text',
      admin: { description: 'Type de vendeur au moment du snapshot' },
    },
    {
      name: 'vatTypeAtSnapshot',
      type: 'text',
      admin: { description: 'Type de TVA au moment du snapshot' },
    },
    {
      name: 'statusAtSnapshot',
      type: 'text',
      admin: { description: 'Statut de l\'annonce au moment du snapshot' },
    },

    // ── Données brutes figées ───────────────────────────────────────────────
    {
      name: 'rawDataAtSnapshot',
      type: 'json',
      admin: { description: 'Données brutes figées au moment du snapshot' },
    },
  ],
}
