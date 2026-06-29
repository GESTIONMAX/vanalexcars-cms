import type { CollectionConfig } from 'payload'

export const Leads: CollectionConfig = {
  slug: 'leads',
  admin: {
    useAsTitle: 'fullName',
    description: 'Demandes entrantes depuis le formulaire /demande — à qualifier avant conversion en mandat',
    defaultColumns: ['fullName', 'email', 'vehicleSearched', 'budget', 'status', 'createdAt'],
  },
  access: {
    read: () => true,
    create: () => true,
    update: () => true,
    delete: () => true,
  },
  fields: [
    // Coordonnées client
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
    // Véhicule recherché
    {
      name: 'vehicleSearched',
      type: 'text',
      label: 'Véhicule recherché',
      required: true,
    },
    {
      name: 'budget',
      type: 'select',
      label: 'Budget',
      options: [
        { label: 'Moins de 30 000 €', value: '<30k' },
        { label: '30 000 € – 50 000 €', value: '30-50k' },
        { label: '50 000 € – 80 000 €', value: '50-80k' },
        { label: '80 000 € – 120 000 €', value: '80-120k' },
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
      label: 'Critères et précisions',
    },
    // Qualification
    {
      name: 'status',
      type: 'select',
      label: 'Statut',
      required: true,
      defaultValue: 'new',
      options: [
        { label: 'Nouvelle demande', value: 'new' },
        { label: 'En qualification', value: 'qualifying' },
        { label: 'Client contacté', value: 'contacted' },
        { label: 'Proposition envoyée', value: 'proposal_sent' },
        { label: 'Mandat à créer', value: 'mandate_pending' },
        { label: 'Mandat créé', value: 'mandate_created' },
        { label: 'Abandonné', value: 'abandoned' },
        { label: 'Refusé', value: 'refused' },
      ],
    },
    {
      name: 'internalNotes',
      type: 'textarea',
      label: 'Notes internes',
      admin: {
        description: 'Visibles uniquement dans le dashboard — non transmises au client',
      },
    },
    // Relation vers le mandat créé (remplie lors de la conversion)
    {
      name: 'convertedMandate',
      type: 'relationship',
      relationTo: 'import-mandates',
      label: 'Mandat associé',
      hasMany: false,
      admin: {
        description: 'Rempli automatiquement lors de la conversion en mandat',
        readOnly: true,
      },
    },
  ],
  timestamps: true,
}
