import type { CollectionConfig } from 'payload'

export const Leads: CollectionConfig = {
  slug: 'leads',
  admin: {
    useAsTitle: 'fullName',
    description: 'Demandes entrantes — à qualifier, enrichir avec les infos concessionnaire, puis convertir en mandat',
    defaultColumns: ['fullName', 'email', 'vehicleSearched', 'budget', 'status', 'createdAt'],
  },
  access: {
    read: () => true,
    create: () => true,
    update: () => true,
    delete: () => true,
  },
  fields: [
    // ── Coordonnées client ────────────────────────────────────────────────────
    {
      name: 'fullName',
      type: 'text',
      label: 'Nom complet',
      required: true,
    },
    {
      name: 'email',
      type: 'email',
      label: 'Email',
      required: true,
    },
    {
      name: 'phone',
      type: 'text',
      label: 'Téléphone',
    },

    // ── Véhicule recherché (formulaire initial) ───────────────────────────────
    {
      name: 'vehicleSearched',
      type: 'text',
      label: 'Véhicule recherché',
      required: true,
    },
    {
      name: 'budget',
      type: 'select',
      label: 'Budget déclaré',
      options: [
        { label: 'Moins de 30 000 €', value: '<30k' },
        { label: '30 000 – 50 000 €', value: '30-50k' },
        { label: '50 000 – 80 000 €', value: '50-80k' },
        { label: '80 000 – 120 000 €', value: '80-120k' },
        { label: 'Plus de 120 000 €', value: '120k+' },
      ],
    },
    {
      name: 'timeline',
      type: 'select',
      label: 'Délai souhaité',
      options: [
        { label: 'Dès que possible (1-2 semaines)', value: 'immediate' },
        { label: 'Sous 1-2 mois', value: 'normale' },
        { label: 'Flexible (3+ mois)', value: 'flexible' },
      ],
    },
    {
      name: 'message',
      type: 'textarea',
      label: 'Critères et précisions (client)',
    },

    // ── Statut du lead ────────────────────────────────────────────────────────
    {
      name: 'status',
      type: 'select',
      label: 'Statut',
      required: true,
      defaultValue: 'new',
      options: [
        { label: 'Nouvelle demande',              value: 'new' },
        { label: 'En qualification',              value: 'qualifying' },
        { label: 'Client contacté',               value: 'contacted' },
        { label: 'Demande envoyée au concess.',   value: 'dealer_request_sent' },
        { label: 'Offre concess. reçue',          value: 'dealer_offer_received' },
        { label: 'Mandat à créer',                value: 'mandate_pending' },
        { label: 'Mandat créé',                   value: 'mandate_created' },
        { label: 'Abandonné',                     value: 'abandoned' },
        { label: 'Refusé',                        value: 'refused' },
      ],
    },

    // ── Informations concessionnaire ──────────────────────────────────────────
    {
      name: 'dealerInfo',
      type: 'group',
      label: 'Concessionnaire',
      admin: {
        description: 'À remplir après identification du véhicule et contact avec le concessionnaire',
      },
      fields: [
        {
          name: 'dealerName',
          type: 'text',
          label: 'Nom du concessionnaire',
        },
        {
          name: 'dealerContact',
          type: 'text',
          label: 'Contact (nom)',
        },
        {
          name: 'dealerCity',
          type: 'text',
          label: 'Ville',
        },
        {
          name: 'dealerCountry',
          type: 'text',
          label: 'Pays',
          defaultValue: 'Allemagne',
        },
      ],
    },

    // ── Offre / Bon de commande concessionnaire ───────────────────────────────
    {
      name: 'dealerOffer',
      type: 'group',
      label: 'Offre concessionnaire',
      admin: {
        description: 'À remplir à réception du bon de commande — débloque la conversion en mandat',
      },
      fields: [
        {
          name: 'dealerOfferReference',
          type: 'text',
          label: 'Référence bon de commande',
        },
        {
          name: 'dealerOfferDate',
          type: 'date',
          label: 'Date de l\'offre',
          admin: { date: { pickerAppearance: 'dayOnly' } },
        },
        {
          name: 'vehicleAvailabilityConfirmed',
          type: 'checkbox',
          label: 'Disponibilité confirmée par le concessionnaire',
          defaultValue: false,
        },
        {
          name: 'confirmedVehiclePrice',
          type: 'number',
          label: 'Prix véhicule confirmé (€ TTC)',
          admin: { description: 'Prix réel négocié avec le concessionnaire' },
        },
        {
          name: 'dealerNotes',
          type: 'textarea',
          label: 'Notes sur l\'offre concessionnaire',
        },
      ],
    },

    // ── Notes internes ────────────────────────────────────────────────────────
    {
      name: 'internalNotes',
      type: 'textarea',
      label: 'Notes internes',
      admin: {
        description: 'Visibles uniquement dans le dashboard — non transmises au client',
      },
    },

    // ── Mandat associé ────────────────────────────────────────────────────────
    {
      name: 'convertedMandate',
      type: 'relationship',
      relationTo: 'import-mandates',
      label: 'Mandat associé',
      hasMany: false,
      admin: {
        description: 'Rempli lors de la conversion en mandat (après réception bon de commande)',
        readOnly: true,
      },
    },
  ],
  timestamps: true,
}
