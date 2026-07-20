import type { GlobalConfig } from 'payload'

export const SimulatorConfig: GlobalConfig = {
  slug: 'simulator-config',
  label: 'Paramètres simulateur import',
  access: {
    read: () => true,
    update: ({ req }) => Boolean(req.user),
  },
  fields: [
    {
      name: 'honoraires',
      label: 'Honoraires Vanalexcars TTC (€)',
      type: 'number',
      defaultValue: 1490,
      required: true,
      admin: { description: 'Honoraires forfaitaires de mandataire tout compris' },
    },
    {
      name: 'fraisDossier',
      label: 'Frais de dossier (€)',
      type: 'number',
      defaultValue: 0,
      admin: { description: 'Frais de dossier séparés des honoraires (0 si inclus)' },
    },
    {
      name: 'cpiWw',
      label: "CPI WW — Contrôle à l'importation (€)",
      type: 'number',
      defaultValue: 150,
      admin: { description: "Contrôle technique d'importation (passage aux mines)" },
    },
    {
      name: 'plaquesExport',
      label: "Plaques d'exportation (€)",
      type: 'number',
      defaultValue: 200,
      admin: { description: "Plaques temporaires pour rapatriement depuis l'Allemagne" },
    },
    {
      name: 'coc',
      label: 'Certificat de conformité COC (€)',
      type: 'number',
      defaultValue: 150,
      admin: { description: 'Demande du COC auprès du constructeur' },
    },
    {
      name: 'formalitesAdmin',
      label: 'Formalités administratives (€)',
      type: 'number',
      defaultValue: 200,
      admin: { description: 'Quitus fiscal, dédouanement, déclaration de mise en service' },
    },
    {
      name: 'margeSecurity',
      label: 'Marge de sécurité (€)',
      type: 'number',
      defaultValue: 300,
      admin: {
        description:
          'Provision pour frais imprévus (pneumatiques, petites réparations, etc.)',
      },
    },
    {
      name: 'dureeValiditeEstimation',
      label: "Durée de validité d'une estimation (jours)",
      type: 'number',
      defaultValue: 7,
      admin: { description: "Au-delà, l'estimation doit être recalculée" },
    },
  ],
}
