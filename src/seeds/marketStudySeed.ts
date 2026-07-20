/**
 * marketStudySeed.ts
 *
 * Crée l'étude de marché initiale MINI JCW si elle n'existe pas encore.
 * Appelée lors du seed initial du backend.
 */

import type { BasePayload } from 'payload'
import { asUntypedPayload } from '@/services/market-analysis/payloadAdapter'

export async function seedMarketStudy(payload: BasePayload): Promise<void> {
  const db = asUntypedPayload(payload)

  // Vérifier si l'étude existe déjà
  const existing = await db.find({
    collection: 'market-studies',
    where: {
      name: { equals: 'MINI JCW 2020-2024' },
    },
    limit: 1,
  })

  if (existing.docs.length > 0) {
    payload.logger.info('[seedMarketStudy] MINI JCW study already exists, skipping')
    return
  }

  // Créer l'étude MINI JCW
  const study = await db.create({
    collection: 'market-studies',
    data: {
      name: 'MINI JCW 2020-2024',
      brand: 'MINI',
      model: 'John Cooper Works',
      generation: 'F56',
      bodyTypes: ['coupe', 'convertible', 'hatchback'],
      yearMin: 2020,
      yearMax: 2024,
      mileageMax: 80000,
      fuel: 'petrol',
      transmission: 'automatic',
      powerMinHp: 220,
      powerMaxHp: 320,
      sellerTypes: ['professional'],
      vatTypes: ['deductible', 'margin'],
      accidentFreeOnly: true,
      warrantyRequired: false,
      sourcesFR: ['autoscout24_fr'],
      sourcesDE: ['internal_vehicles', 'autoscout24_de'],
      searchUrlDE: 'https://www.autoscout24.de/lst/mini/john-cooper-works?fregfrom=2020&fregto=2024&kmto=80000&fuel=B&gear=A',
      searchUrlFR: 'https://www.autoscout24.fr/lst/mini/john-cooper-works?fregfrom=2020&fregto=2024&kmto=80000&fuel=B&gear=A',
      status: 'active',
      schedule: 'weekly',
      lastRunStatus: 'never_run',
    },
  })

  payload.logger.info(`[seedMarketStudy] Created MINI JCW study: ${study.id}`)
}
