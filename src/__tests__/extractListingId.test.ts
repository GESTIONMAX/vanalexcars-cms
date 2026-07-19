import { describe, it, expect } from 'vitest'
import { extractListingId } from '../lib/extractListingId'

describe('extractListingId', () => {
  // UUID explicite après -id-
  it('extrait UUID après -id- avec méthode uuid_explicit', () => {
    const url =
      'https://www.autoscout24.de/angebote/bmw-x3-id-a1b2c3d4-e5f6-7890-abcd-ef1234567890'
    const result = extractListingId(url)
    expect(result).toEqual({
      id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
      method: 'uuid_explicit',
    })
  })

  // UUID en fin de path (sans -id-)
  it('extrait UUID en fin de path avec méthode uuid_path', () => {
    const url =
      'https://www.autoscout24.de/angebote/bmw-x3/a1b2c3d4-e5f6-7890-abcd-ef1234567890'
    const result = extractListingId(url)
    expect(result).toEqual({
      id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
      method: 'uuid_path',
    })
  })

  // ID numérique ≥ 6 chiffres
  it('extrait ID numérique ≥ 6 chiffres avec méthode numeric_path', () => {
    const url = 'https://www.autoscout24.de/angebote/bmw-x3-123456789'
    const result = extractListingId(url)
    expect(result).toEqual({
      id: '123456789',
      method: 'numeric_path',
    })
  })

  // ID numérique de exactement 6 chiffres
  it('extrait ID numérique de 6 chiffres exact', () => {
    const url = 'https://www.autoscout24.de/angebote/bmw-x3-100000'
    const result = extractListingId(url)
    expect(result).toEqual({
      id: '100000',
      method: 'numeric_path',
    })
  })

  // ID numérique < 6 chiffres → null
  it('ne retourne pas un ID numérique de moins de 6 chiffres', () => {
    const url = 'https://www.autoscout24.de/angebote/bmw-x3-12345'
    const result = extractListingId(url)
    expect(result).toBeNull()
  })

  // jsonId fourni → priorité 1
  it('retourne jsonId avec méthode json quand jsonId fourni', () => {
    const url =
      'https://www.autoscout24.de/angebote/bmw-x3-id-a1b2c3d4-e5f6-7890-abcd-ef1234567890'
    const result = extractListingId(url, 'json-override-id')
    expect(result).toEqual({
      id: 'json-override-id',
      method: 'json',
    })
  })

  // jsonId vide → ignorer, utiliser URL
  it('ignore jsonId vide et utilise l\'URL', () => {
    const url =
      'https://www.autoscout24.de/angebote/bmw-x3-id-a1b2c3d4-e5f6-7890-abcd-ef1234567890'
    const result = extractListingId(url, '')
    expect(result?.method).toBe('uuid_explicit')
  })

  // URL sans ID → null
  it('retourne null pour une URL sans ID extractible', () => {
    const url = 'https://www.autoscout24.de/angebote/bmw-x3'
    const result = extractListingId(url)
    expect(result).toBeNull()
  })

  // uuid_explicit prioritaire sur uuid_path
  it('prend uuid_explicit en priorité sur uuid_path si les deux sont présents', () => {
    const url =
      'https://www.autoscout24.de/angebote/bmw-id-a1b2c3d4-e5f6-7890-abcd-ef1234567890/autre/b1c2d3e4-f5a6-7890-bcde-f12345678901'
    const result = extractListingId(url)
    expect(result?.method).toBe('uuid_explicit')
    expect(result?.id).toBe('a1b2c3d4-e5f6-7890-abcd-ef1234567890')
  })

  // UUID avec terminaison en fin d'URL (sans slash final)
  it('extrait UUID en fin d\'URL sans slash final', () => {
    const url =
      'https://www.autoscout24.de/angebote/bmw-a1b2c3d4-e5f6-7890-abcd-ef1234567890'
    const result = extractListingId(url)
    expect(result?.method).toBe('uuid_path')
    expect(result?.id).toBe('a1b2c3d4-e5f6-7890-abcd-ef1234567890')
  })

  // UUID insensible à la casse
  it('normalise l\'UUID en lowercase', () => {
    const url =
      'https://www.autoscout24.de/angebote/bmw-x3-id-A1B2C3D4-E5F6-7890-ABCD-EF1234567890'
    const result = extractListingId(url)
    expect(result?.id).toBe('a1b2c3d4-e5f6-7890-abcd-ef1234567890')
  })
})
