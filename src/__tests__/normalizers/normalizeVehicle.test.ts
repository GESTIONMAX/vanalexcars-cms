import { describe, it, expect } from 'vitest'
import { normalizeVehicle } from '../../lib/normalizers/normalizeVehicle'
import type { IncomingVehicleData, ExistingVehicleData } from '../../lib/normalizers/types'

const AS24_URL = 'https://prod.pictures.autoscout24.net/listing-images/abc_def.jpg'
const AS24_URL_2 = 'https://prod.pictures.autoscout24.net/listing-images/abc_xyz.jpg'

const emptyExisting: ExistingVehicleData = {}

// ─── Éligibilité vendeur ──────────────────────────────────────────────────────

describe('normalizeVehicle — éligibilité vendeur', () => {
  it('dealer concessionnaire → eligible_professional_seller', () => {
    const incoming: IncomingVehicleData = {
      source: 'autoscout24.nextdata',
      dealer: 'Porsche Zentrum Hamburg',
      price: 85000,
    }
    const result = normalizeVehicle(incoming, emptyExisting)
    expect(result.eligibility).toBe('eligible_professional_seller')
  })

  it('"Particulier" → private_seller_not_eligible', () => {
    const incoming: IncomingVehicleData = {
      source: 'autoscout24.nextdata',
      dealer: 'Particulier',
      price: 25000,
      mileage: 50000,
    }
    const result = normalizeVehicle(incoming, emptyExisting)
    expect(result.eligibility).toBe('private_seller_not_eligible')
  })

  it('"Privat" → private_seller_not_eligible', () => {
    const result = normalizeVehicle(
      { source: 'autoscout24.nextdata', dealer: 'Privat' },
      emptyExisting,
    )
    expect(result.eligibility).toBe('private_seller_not_eligible')
  })

  it('"Privé" → private_seller_not_eligible', () => {
    const result = normalizeVehicle(
      { source: 'autoscout24.nextdata', dealer: 'Privé' },
      emptyExisting,
    )
    expect(result.eligibility).toBe('private_seller_not_eligible')
  })

  it('dealer absent → seller_unknown (pas private_seller_not_eligible)', () => {
    const result = normalizeVehicle(
      { source: 'autoscout24.nextdata', price: 30000 },
      emptyExisting,
    )
    expect(result.eligibility).toBe('seller_unknown')
    expect(result.eligibility).not.toBe('private_seller_not_eligible')
  })

  it('"ImporteMoi" → seller_unknown (pas private_seller_not_eligible)', () => {
    const result = normalizeVehicle(
      { source: 'autoscout24.import', dealer: 'ImporteMoi', price: 30000 },
      emptyExisting,
    )
    expect(result.eligibility).toBe('seller_unknown')
    expect(result.eligibility).not.toBe('private_seller_not_eligible')
  })
})

// ─── Annonce particulière → pas de patch éligible à l'import ─────────────────

describe('normalizeVehicle — particulier : aucun patch dealer écrit', () => {
  it('annonce particulière : le dealer ne doit pas figurer dans le patch', () => {
    const incoming: IncomingVehicleData = {
      source: 'autoscout24.nextdata',
      dealer: 'Particulier',
      dealerCity: 'Paris',
      price: 18000,
      mileage: 60000,
    }
    const result = normalizeVehicle(incoming, emptyExisting)
    // L'éligibilité signale le problème
    expect(result.eligibility).toBe('private_seller_not_eligible')
    // Le dealer placeholder n'est pas écrit dans le patch
    expect(result.patch).not.toHaveProperty('dealer')
    // Prix et km peuvent être dans le patch (logique import les utilisera si décision = skip)
    // Mais l'appelant doit vérifier eligibility avant payload.create()
  })

  it('annonce particulière : les décisions contiennent le motif private_seller', () => {
    const result = normalizeVehicle(
      { source: 'autoscout24.nextdata', dealer: 'Privat' },
      emptyExisting,
    )
    const dealerDecision = result.decisions.find((d) => d.field === 'dealer')
    expect(dealerDecision?.action).toBe('skip')
    expect(dealerDecision?.incoming.skipReason).toBe('private_seller')
  })

  it('particulier avec données complètes : patch est vide si pas d\'autres champs', () => {
    const result = normalizeVehicle(
      { source: 'autoscout24.nextdata', dealer: 'Privat' },
      emptyExisting,
    )
    expect(result.patch).not.toHaveProperty('dealer')
  })
})

// ─── Orchestration globale ────────────────────────────────────────────────────

describe('normalizeVehicle — orchestration', () => {
  it('véhicule vide → noop si aucune donnée entrante', () => {
    const result = normalizeVehicle({ source: 'autoscout24.nextdata' }, emptyExisting)
    expect(result.noop).toBe(true)
    expect(result.appliedFields).toHaveLength(0)
  })

  it('nouveau véhicule avec données complètes → patch complet', () => {
    const incoming: IncomingVehicleData = {
      source: 'autoscout24.nextdata',
      price: 45000,
      mileage: 30000,
      dealer: 'Audi Zentrum München',
      dealerCity: 'München',
      imageUrls: [AS24_URL, AS24_URL_2],
      description: 'Excellent état, carnet entretien.',
      exteriorColor: 'Noir',
      doors: 4,
      seats: 5,
    }
    const result = normalizeVehicle(incoming, emptyExisting)
    expect(result.eligibility).toBe('eligible_professional_seller')
    expect(result.patch).toHaveProperty('price', 45000)
    expect(result.patch).toHaveProperty('mileage', 30000)
    expect(result.patch).toHaveProperty('dealer', 'Audi Zentrum München')
    expect(result.patch).toHaveProperty('dealerCity', 'München')
    expect(result.patch).toHaveProperty('description')
    expect(result.patch).toHaveProperty('exteriorColor', 'Noir')
    expect(result.patch).toHaveProperty('doors', 4)
    expect(result.patch).toHaveProperty('seats', 5)
    expect(result.noop).toBe(false)
  })

  it('véhicule existant complet → les champs protégés ne sont pas écrasés', () => {
    const incoming: IncomingVehicleData = {
      source: 'autoscout24.dom',  // faible confiance
      price: 45000,
      mileage: 30000,
      dealer: 'Autre Dealer',
      dealerCity: 'Lyon',
      description: 'Autre description.',
    }
    const existing: ExistingVehicleData = {
      mileage: 30000,  // identique → already_set
      dealer: 'Audi Zentrum München',  // protégé (non-placeholder) + incoming DOM faible
      dealerCity: 'München',  // déjà renseigné
      description: 'Excellent état.',  // déjà renseigné
    }
    const result = normalizeVehicle(incoming, existing)
    // Dealer existant protégé + incoming DOM basse confiance → pas d'écrasement
    expect(result.patch).not.toHaveProperty('dealer')
    // Ville déjà renseignée → pas d'écrasement
    expect(result.patch).not.toHaveProperty('dealerCity')
    // Description déjà renseignée → pas d'écrasement
    expect(result.patch).not.toHaveProperty('description')
    // Km identique → already_set
    expect(result.patch).not.toHaveProperty('mileage')
  })

  it('dealer ImporteMoi existant + nouveau dealer pro → dealer mis à jour', () => {
    const result = normalizeVehicle(
      { source: 'autoscout24.dom', dealer: 'Mercedes Benz Hamburg', dealerCity: 'Hamburg' },
      { dealer: 'ImporteMoi', dealerCity: null },
    )
    expect(result.patch).toHaveProperty('dealer', 'Mercedes Benz Hamburg')
    expect(result.eligibility).toBe('eligible_professional_seller')
  })

  it('decisions contient une entrée par champ normalisé', () => {
    const result = normalizeVehicle({ source: 'autoscout24.nextdata' }, emptyExisting)
    const fields = result.decisions.map((d) => d.field)
    expect(fields).toContain('price')
    expect(fields).toContain('mileage')
    expect(fields).toContain('dealer')
    expect(fields).toContain('dealerCity')
    expect(fields).toContain('imageUrls')
    expect(fields).toContain('description')
    expect(fields).toContain('features')
    expect(fields).toContain('exteriorColor')
    expect(fields).toContain('doors')
    expect(fields).toContain('seats')
    expect(fields).toContain('specifications')
  })
})
