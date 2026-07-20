import { describe, it, expect } from 'vitest'
import { normalizePrice } from '../../lib/normalizers/normalizePrice'

describe('normalizePrice', () => {
  it('prix valide → écriture', () => {
    const r = normalizePrice({ value: 25000, source: 'autoscout24.nextdata' })
    expect(r.value).toBe(25000)
    expect(r.quality).toBe('verified')
    expect(r.confidence).toBeGreaterThanOrEqual(0.9)
  })

  it('prix nul → validation_failed', () => {
    const r = normalizePrice({ value: 0, source: 'autoscout24.nextdata' })
    expect(r.value).toBeNull()
    expect(r.skipReason).toBe('validation_failed')
  })

  it('prix négatif → validation_failed', () => {
    const r = normalizePrice({ value: -500, source: 'autoscout24.nextdata' })
    expect(r.value).toBeNull()
    expect(r.skipReason).toBe('validation_failed')
  })

  it('prix absent → source_empty', () => {
    const r = normalizePrice({ value: undefined, source: 'autoscout24.nextdata' })
    expect(r.value).toBeNull()
    expect(r.skipReason).toBe('source_empty')
  })

  it('prix > 500k → inferred, confidence réduite', () => {
    const r = normalizePrice({ value: 600000, source: 'autoscout24.nextdata' })
    expect(r.value).toBe(600000)
    expect(r.quality).toBe('inferred')
    expect(r.confidence).toBeLessThanOrEqual(0.5)
  })

  it('prix < 500 → inferred, confidence réduite', () => {
    const r = normalizePrice({ value: 200, source: 'autoscout24.nextdata' })
    expect(r.value).toBe(200)
    expect(r.quality).toBe('inferred')
    expect(r.confidence).toBeLessThanOrEqual(0.3)
  })

  it('variation > 30% par rapport à existant → confidence réduite', () => {
    const r = normalizePrice(
      { value: 35000, source: 'autoscout24.nextdata' },
      { value: 20000 }, // variation = 75%
    )
    expect(r.value).toBe(35000)
    expect(r.confidence).toBeLessThanOrEqual(0.4)
  })

  it('prix manuel existant → already_set', () => {
    const r = normalizePrice(
      { value: 30000, source: 'autoscout24.nextdata' },
      { value: 28000, quality: 'manual' },
    )
    expect(r.value).toBeNull()
    expect(r.skipReason).toBe('already_set')
  })
})
