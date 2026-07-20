import { describe, it, expect } from 'vitest'
import { normalizeImages } from '../../lib/normalizers/normalizeImages'

const AS24_URL = 'https://prod.pictures.autoscout24.net/listing-images/abc123_def456.jpg'
const AS24_URL_2 = 'https://prod.pictures.autoscout24.net/listing-images/abc123_def789.jpg'
const AS24_URL_3 = 'https://prod.pictures.autoscout24.net/listing-images/abc123_xyz000.jpg'
const EXTERNAL_URL = 'https://cdn.other-site.com/car.jpg'

describe('normalizeImages', () => {
  it('URLs vides → source_empty', () => {
    const r = normalizeImages({ urls: [], source: 'autoscout24.xhr' })
    expect(r.value).toBeNull()
    expect(r.skipReason).toBe('source_empty')
  })

  it('URL hors CDN AS24 → validation_failed (filtrée)', () => {
    const r = normalizeImages({ urls: [EXTERNAL_URL], source: 'autoscout24.xhr' })
    expect(r.value).toBeNull()
    expect(r.skipReason).toBe('validation_failed')
  })

  it('URLs valides, pas d\'existant → écriture', () => {
    const r = normalizeImages(
      { urls: [AS24_URL, AS24_URL_2], source: 'autoscout24.xhr' },
    )
    expect(r.value).toEqual([AS24_URL, AS24_URL_2])
    expect(r.quality).toBe('verified')
  })

  it('plus d\'images que l\'existant → écriture', () => {
    const r = normalizeImages(
      { urls: [AS24_URL, AS24_URL_2, AS24_URL_3], source: 'autoscout24.xhr' },
      { urls: [{ url: AS24_URL }] },
    )
    expect(r.value).toHaveLength(3)
  })

  it('même nombre ou moins → already_set', () => {
    const r = normalizeImages(
      { urls: [AS24_URL], source: 'autoscout24.xhr' },
      { urls: [{ url: AS24_URL }, { url: AS24_URL_2 }] },
    )
    expect(r.value).toBeNull()
    expect(r.skipReason).toBe('already_set')
  })

  it('images manuelles existantes → already_set (protection)', () => {
    const r = normalizeImages(
      { urls: [AS24_URL, AS24_URL_2, AS24_URL_3], source: 'autoscout24.xhr' },
      { urls: [{ url: AS24_URL }], quality: 'manual' },
    )
    expect(r.value).toBeNull()
    expect(r.skipReason).toBe('already_set')
  })

  it('déduplication des URLs identiques', () => {
    const r = normalizeImages(
      { urls: [AS24_URL, AS24_URL, AS24_URL_2], source: 'autoscout24.xhr' },
    )
    expect(r.value).toHaveLength(2)
  })
})
