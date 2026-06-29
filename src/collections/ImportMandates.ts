import type { CollectionConfig } from 'payload'

export const ImportMandates: CollectionConfig = {
  slug: 'import-mandates',
  admin: {
    useAsTitle: 'reference',
    description: 'Mandats de recherche, sélection et accompagnement à l\'importation',
    defaultColumns: ['reference', 'status', 'clientLastName', 'vehicleBrand', 'vehicleModel', 'createdAt'],
  },
  access: {
    read: () => true,
    create: () => true,
    update: () => true,
    delete: () => true,
  },
  fields: [
    // ── Référence interne ─────────────────────────────────────────────────────
    {
      name: 'reference',
      type: 'text',
      required: true,
      admin: { description: 'Ex: VX-2025-001' },
    },
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'draft',
      options: [
        { label: 'Brouillon', value: 'draft' },
        { label: 'Envoyé au client', value: 'sent_to_client' },
        { label: 'Signé', value: 'signed' },
        { label: 'Acompte payé', value: 'deposit_paid' },
        { label: 'Actif', value: 'active' },
        { label: 'Complété', value: 'completed' },
        { label: 'Annulé', value: 'cancelled' },
      ],
    },

    // ── Client ────────────────────────────────────────────────────────────────
    {
      name: 'clientInfo',
      type: 'group',
      label: 'Informations client (Mandant)',
      fields: [
        { name: 'firstName', type: 'text', required: true, label: 'Prénom' },
        { name: 'lastName', type: 'text', required: true, label: 'Nom' },
        { name: 'email', type: 'email', required: true, label: 'Email' },
        { name: 'phone', type: 'text', label: 'Téléphone' },
        { name: 'address', type: 'text', label: 'Adresse' },
        { name: 'postalCode', type: 'text', label: 'Code postal' },
        { name: 'city', type: 'text', label: 'Ville' },
        { name: 'country', type: 'text', defaultValue: 'France', label: 'Pays' },
        {
          name: 'identityDocumentType',
          type: 'select',
          label: 'Type de pièce d\'identité',
          options: [
            { label: 'Carte nationale d\'identité', value: 'cni' },
            { label: 'Passeport', value: 'passport' },
            { label: 'Titre de séjour', value: 'residence_permit' },
          ],
        },
        { name: 'identityDocumentNumber', type: 'text', label: 'Numéro de pièce d\'identité' },
        { name: 'identityDocumentFileUrl', type: 'text', label: 'URL du document (pièce d\'identité)' },
      ],
    },

    // ── Véhicule ──────────────────────────────────────────────────────────────
    {
      name: 'vehicleInfo',
      type: 'group',
      label: 'Véhicule identifié',
      fields: [
        { name: 'brand', type: 'text', required: true, label: 'Marque' },
        { name: 'model', type: 'text', required: true, label: 'Modèle' },
        { name: 'version', type: 'text', label: 'Version / finition' },
        { name: 'vin', type: 'text', label: 'Numéro VIN' },
        { name: 'firstRegistrationDate', type: 'text', label: 'Date de première immatriculation' },
        { name: 'mileage', type: 'number', label: 'Kilométrage (km)' },
        {
          name: 'fuelType',
          type: 'select',
          label: 'Carburant',
          options: [
            { label: 'Essence', value: 'petrol' },
            { label: 'Diesel', value: 'diesel' },
            { label: 'Hybride', value: 'hybrid' },
            { label: 'Électrique', value: 'electric' },
            { label: 'Hybride rechargeable', value: 'phev' },
          ],
        },
        {
          name: 'transmission',
          type: 'select',
          label: 'Boîte de vitesses',
          options: [
            { label: 'Automatique', value: 'automatic' },
            { label: 'Manuelle', value: 'manual' },
          ],
        },
        { name: 'color', type: 'text', label: 'Couleur extérieure' },
        { name: 'power', type: 'text', label: 'Puissance (ex: 450 ch)' },
        { name: 'co2', type: 'number', label: 'CO₂ (g/km)' },
        { name: 'vehiclePrice', type: 'number', required: true, label: 'Prix du véhicule (€)' },
        { name: 'vehicleCurrency', type: 'text', defaultValue: 'EUR', label: 'Devise' },
        { name: 'vehicleVatIncluded', type: 'checkbox', defaultValue: true, label: 'TVA incluse' },
        { name: 'warrantyInfo', type: 'textarea', label: 'Informations garantie' },
      ],
    },

    // ── Concessionnaire ───────────────────────────────────────────────────────
    {
      name: 'dealerInfo',
      type: 'group',
      label: 'Concessionnaire allemand',
      fields: [
        { name: 'dealerName', type: 'text', required: true, label: 'Nom du concessionnaire' },
        { name: 'dealerAddress', type: 'text', label: 'Adresse' },
        { name: 'dealerCountry', type: 'text', defaultValue: 'Allemagne', label: 'Pays' },
        { name: 'dealerContactName', type: 'text', label: 'Nom du contact' },
        { name: 'dealerEmail', type: 'email', label: 'Email' },
        { name: 'dealerPhone', type: 'text', label: 'Téléphone' },
        { name: 'dealerOrderNumber', type: 'text', required: true, label: 'N° de commande / offre' },
        { name: 'dealerOfferDate', type: 'date', label: 'Date de l\'offre' },
        { name: 'dealerOfferFileUrl', type: 'text', label: 'URL du bon de commande (usage interne)' },
      ],
    },

    // ── Prestation VanalexCars ────────────────────────────────────────────────
    {
      name: 'serviceInfo',
      type: 'group',
      label: 'Prestation VanalexCars',
      fields: [
        { name: 'serviceName', type: 'text', defaultValue: 'Forfait Import VanalexCars', label: 'Nom de la prestation' },
        { name: 'serviceDescription', type: 'textarea', label: 'Description de la mission' },
        { name: 'servicePrice', type: 'number', required: true, defaultValue: 1490, label: 'Montant du forfait (€ TTC)' },
        { name: 'depositAmount', type: 'number', required: true, label: 'Montant de l\'acompte (€)' },
        { name: 'remainingBalance', type: 'number', label: 'Solde restant (€)' },
        { name: 'transportIncluded', type: 'checkbox', defaultValue: true, label: 'Transport inclus' },
        { name: 'transportProvider', type: 'text', defaultValue: 'Cars Trans', label: 'Transporteur' },
        { name: 'transportEstimatedCost', type: 'number', label: 'Coût estimé du transport (€)' },
        { name: 'adminSupportIncluded', type: 'checkbox', defaultValue: true, label: 'Démarches administratives incluses' },
        { name: 'cpiIncluded', type: 'checkbox', defaultValue: true, label: 'CPI inclus' },
        { name: 'finalRegistrationSupportIncluded', type: 'checkbox', defaultValue: true, label: 'Suivi carte grise définitive inclus' },
        { name: 'homeDeliveryIncluded', type: 'checkbox', defaultValue: true, label: 'Livraison à domicile incluse' },
      ],
    },

    // ── Frais non inclus ──────────────────────────────────────────────────────
    {
      name: 'taxesInfo',
      type: 'group',
      label: 'Frais non inclus (informatif)',
      fields: [
        { name: 'registrationTaxEstimated', type: 'number', label: 'Carte grise estimée (€)' },
        { name: 'ecologicalMalusEstimated', type: 'number', label: 'Malus écologique estimé (€)' },
        { name: 'registrationTaxIncluded', type: 'checkbox', defaultValue: false, label: 'Carte grise incluse' },
        { name: 'ecologicalMalusIncluded', type: 'checkbox', defaultValue: false, label: 'Malus inclus' },
        { name: 'notesAboutTaxes', type: 'textarea', label: 'Notes sur les taxes / précisions' },
      ],
    },

    // ── Signature / Paiement ──────────────────────────────────────────────────
    {
      name: 'signatureInfo',
      type: 'group',
      label: 'Signature & Paiement',
      fields: [
        { name: 'signatureProvider', type: 'text', label: 'Prestataire signature (ex: YouSign, DocuSign)' },
        { name: 'signatureRequestId', type: 'text', label: 'ID de la demande de signature' },
        { name: 'signedAt', type: 'date', label: 'Date de signature' },
        { name: 'signedDocumentUrl', type: 'text', label: 'URL du document signé' },
        { name: 'stripePaymentLink', type: 'text', label: 'Lien Stripe pour acompte' },
        { name: 'stripePaymentIntentId', type: 'text', label: 'Stripe Payment Intent ID' },
        { name: 'depositPaidAt', type: 'date', label: 'Date de paiement de l\'acompte' },
      ],
    },

    // ── Notes internes ────────────────────────────────────────────────────────
    { name: 'internalNotes', type: 'textarea', label: 'Notes internes (non transmises au client)' },

    // ── Origine (lead source) ─────────────────────────────────────────────────
    {
      name: 'sourceLead',
      type: 'relationship',
      relationTo: 'leads',
      label: 'Lead source',
      hasMany: false,
      admin: {
        description: 'Demande d\'origine ayant généré ce mandat',
        readOnly: true,
      },
    },
  ],
  timestamps: true,
}
