import type { CollectionConfig, AccessArgs, CollectionSlug } from 'payload'
import type { User } from '@/payload-types'

type AdminAccess = (args: AccessArgs<User>) => boolean

const isAuthenticated: AdminAccess = ({ req: { user } }) => Boolean(user)

export const MarketSnapshots: CollectionConfig = {
  slug: 'market-snapshots',
  admin: {
    useAsTitle: 'runId',
    description: 'Snapshots immutables des analyses de marché',
    defaultColumns: ['study', 'runId', 'createdAt', 'countDE', 'countFR', 'opportunityScore', 'opportunityLabel'],
  },
  access: {
    read: isAuthenticated,
    create: isAuthenticated,
    // Snapshots are immutable — no updates or deletes allowed
    update: () => false,
    delete: () => false,
  },
  fields: [
    // ── Identification ──────────────────────────────────────────────────────
    {
      name: 'study',
      type: 'relationship',
      relationTo: 'market-studies' as CollectionSlug,
      required: true,
      index: true,
      admin: { description: 'Étude de marché associée' },
    },
    {
      name: 'runId',
      type: 'text',
      required: true,
      unique: true,
      admin: { description: 'Identifiant unique du run (UUID)' },
    },
    {
      name: 'createdAt',
      type: 'date',
      required: true,
      admin: { readOnly: true, description: 'Date de création du snapshot' },
    },

    // ── Comptages ───────────────────────────────────────────────────────────
    {
      name: 'countDE',
      type: 'number',
      required: true,
      admin: { description: 'Nombre d\'annonces côté Allemagne' },
    },
    {
      name: 'countFR',
      type: 'number',
      required: true,
      admin: { description: 'Nombre d\'annonces côté France' },
    },

    // ── Statistiques DE ─────────────────────────────────────────────────────
    {
      name: 'medianAdvertisedPriceDE',
      type: 'number',
      admin: { description: 'Prix médian annoncé DE (€)' },
    },
    {
      name: 'averageAdvertisedPriceDE',
      type: 'number',
      admin: { description: 'Prix moyen annoncé DE (€)' },
    },
    {
      name: 'minAdvertisedPriceDE',
      type: 'number',
      admin: { description: 'Prix minimum annoncé DE (€)' },
    },
    {
      name: 'percentile25PriceDE',
      type: 'number',
      admin: { description: 'Percentile 25 prix DE (€)' },
    },
    {
      name: 'percentile75PriceDE',
      type: 'number',
      admin: { description: 'Percentile 75 prix DE (€)' },
    },

    // ── Statistiques FR ─────────────────────────────────────────────────────
    {
      name: 'medianAdvertisedPriceFR',
      type: 'number',
      admin: { description: 'Prix médian annoncé FR (€)' },
    },
    {
      name: 'averageAdvertisedPriceFR',
      type: 'number',
      admin: { description: 'Prix moyen annoncé FR (€)' },
    },
    {
      name: 'minAdvertisedPriceFR',
      type: 'number',
      admin: { description: 'Prix minimum annoncé FR (€)' },
    },
    {
      name: 'percentile25PriceFR',
      type: 'number',
      admin: { description: 'Percentile 25 prix FR (€)' },
    },
    {
      name: 'percentile75PriceFR',
      type: 'number',
      admin: { description: 'Percentile 75 prix FR (€)' },
    },

    // ── Écart DE/FR ─────────────────────────────────────────────────────────
    {
      name: 'priceGapAbsolute',
      type: 'number',
      admin: { description: 'Écart de prix absolu FR-DE (€)' },
    },
    {
      name: 'priceGapPercentage',
      type: 'number',
      admin: { description: 'Écart de prix en % (FR vs DE)' },
    },

    // ── Coûts d'import ──────────────────────────────────────────────────────
    {
      name: 'transportEstimate',
      type: 'number',
      admin: { description: 'Estimation transport (€)' },
    },
    {
      name: 'exportPlateEstimate',
      type: 'number',
      admin: { description: 'Plaques export (€)' },
    },
    {
      name: 'registrationTaxEstimate',
      type: 'number',
      admin: { description: 'Taxe d\'immatriculation / contrôle (€)' },
    },
    {
      name: 'residualMalusEstimate',
      type: 'number',
      admin: { description: 'Malus résiduel estimé (€)' },
    },
    {
      name: 'administrativeCostEstimate',
      type: 'number',
      admin: { description: 'Frais administratifs (COC, formalités, €)' },
    },
    {
      name: 'serviceFeeEstimate',
      type: 'number',
      admin: { description: 'Honoraires service mandataire (€)' },
    },
    {
      name: 'totalImportCostEstimate',
      type: 'number',
      admin: { description: 'Total coûts d\'import estimés (€)' },
    },

    // ── Opportunité ─────────────────────────────────────────────────────────
    {
      name: 'medianLandedCostFrance',
      type: 'number',
      admin: { description: 'Coût d\'atterrissage médian France (prix DE + import, €)' },
    },
    {
      name: 'estimatedCustomerSaving',
      type: 'number',
      admin: { description: 'Économie estimée client (€)' },
    },
    {
      name: 'opportunityScore',
      type: 'number',
      min: 0,
      max: 100,
      admin: { description: 'Score d\'opportunité (0-100)' },
    },
    {
      name: 'opportunityLabel',
      type: 'select',
      options: [
        { label: 'Forte opportunité', value: 'strong_opportunity' },
        { label: 'Profitable', value: 'profitable' },
        { label: 'Marginale', value: 'marginal' },
        { label: 'Non profitable', value: 'not_profitable' },
      ],
      admin: { description: 'Qualification de l\'opportunité' },
    },
    {
      name: 'trend',
      type: 'select',
      options: [
        { label: 'Premier run', value: 'first_run' },
        { label: 'En amélioration', value: 'improving' },
        { label: 'Stable', value: 'stable' },
        { label: 'En dégradation', value: 'degrading' },
      ],
      admin: { description: 'Tendance par rapport aux snapshots précédents' },
    },

    // ── Liquidité FR ────────────────────────────────────────────────────────
    {
      name: 'averageDaysOnMarketFR',
      type: 'number',
      admin: { description: 'Durée moyenne sur le marché FR (jours)' },
    },
    {
      name: 'medianDaysOnMarketFR',
      type: 'number',
      admin: { description: 'Durée médiane sur le marché FR (jours)' },
    },
    {
      name: 'removedSincePreviousRunFR',
      type: 'number',
      admin: { description: 'Nombre d\'annonces FR supprimées depuis le run précédent' },
    },
    {
      name: 'turnoverRate30dFR',
      type: 'number',
      admin: { description: 'Taux de rotation FR sur 30 jours (%)' },
    },
    {
      name: 'priceDropRateFR',
      type: 'number',
      admin: { description: 'Taux de baisses de prix FR (%)' },
    },

    // ── Qualité ─────────────────────────────────────────────────────────────
    {
      name: 'matchingQualityScore',
      type: 'number',
      min: 0,
      max: 100,
      admin: { description: 'Score moyen de matching des annonces (0-100)' },
    },

    // ── Métadonnées ─────────────────────────────────────────────────────────
    {
      name: 'rawStats',
      type: 'json',
      admin: { description: 'Statistiques brutes complètes (JSON)' },
    },
    {
      name: 'calculationVersion',
      type: 'text',
      required: true,
      admin: { description: 'Version de l\'algorithme de calcul' },
    },
    {
      name: 'durationMs',
      type: 'number',
      admin: { description: 'Durée d\'exécution du run (ms)' },
    },
  ],
}
