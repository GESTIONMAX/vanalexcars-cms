import { describe, it, expect } from 'vitest'
import { canonicalizeUrl } from '../lib/canonicalizeUrl'

describe('canonicalizeUrl', () => {
  it('supprime utm_source et utm_medium', () => {
    const result = canonicalizeUrl(
      'https://www.autoscout24.de/angebote/bmw-x3/?utm_source=google&utm_medium=cpc',
    )
    expect(result).toBe('https://www.autoscout24.de/angebote/bmw-x3')
  })

  it('supprime le slash final du pathname', () => {
    const result = canonicalizeUrl('https://www.autoscout24.de/angebote/bmw-x3/')
    expect(result).toBe('https://www.autoscout24.de/angebote/bmw-x3')
  })

  it('convertit HTTP en HTTPS', () => {
    const result = canonicalizeUrl('http://www.autoscout24.de/angebote/bmw-x3')
    expect(result).toBe('https://www.autoscout24.de/angebote/bmw-x3')
  })

  it('met le hostname en lowercase', () => {
    const result = canonicalizeUrl('https://www.AutoScout24.DE/angebote/bmw-x3')
    expect(result).toBe('https://www.autoscout24.de/angebote/bmw-x3')
  })

  it('retourne null pour une URL invalide', () => {
    const result = canonicalizeUrl('not-a-url')
    expect(result).toBeNull()
  })

  it('retourne null pour une chaîne vide', () => {
    const result = canonicalizeUrl('')
    expect(result).toBeNull()
  })

  it('conserve les query params non-tracking', () => {
    const result = canonicalizeUrl(
      'https://www.autoscout24.de/angebote/?make=bmw&model=x3',
    )
    expect(result).toBe('https://www.autoscout24.de/angebote?make=bmw&model=x3')
  })

  it('supprime uniquement les paramètres de tracking (ref, fbclid, gclid)', () => {
    const result = canonicalizeUrl(
      'https://www.autoscout24.de/angebote/bmw-x3?ref=home&fbclid=abc123&make=bmw',
    )
    expect(result).toBe('https://www.autoscout24.de/angebote/bmw-x3?make=bmw')
  })

  it('supprime le ? si query string vide après nettoyage', () => {
    const result = canonicalizeUrl(
      'https://www.autoscout24.de/angebote/bmw-x3?utm_source=google&ref=home',
    )
    expect(result).toBe('https://www.autoscout24.de/angebote/bmw-x3')
  })

  it('supprime le fragment', () => {
    const result = canonicalizeUrl(
      'https://www.autoscout24.de/angebote/bmw-x3#top',
    )
    expect(result).toBe('https://www.autoscout24.de/angebote/bmw-x3')
  })

  it('exemple de la spec', () => {
    const result = canonicalizeUrl(
      'https://www.AutoScout24.de/angebote/bmw-x3/?utm_source=google&ref=home',
    )
    expect(result).toBe('https://www.autoscout24.de/angebote/bmw-x3')
  })

  it('conserve une URL propre sans modification', () => {
    const url = 'https://www.autoscout24.de/angebote/bmw-x3-id-abc123'
    expect(canonicalizeUrl(url)).toBe(url)
  })

  it('supprime _ga et _gl', () => {
    const result = canonicalizeUrl(
      'https://www.autoscout24.de/angebote/bmw?_ga=GA1.2.xxx&_gl=yyy',
    )
    expect(result).toBe('https://www.autoscout24.de/angebote/bmw')
  })
})
