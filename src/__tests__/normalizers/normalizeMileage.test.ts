import { describe, it, expect } from 'vitest'
import { normalizeMileage } from '../../lib/normalizers/normalizeMileage'

describe('normalizeMileage', () => {
  it('kilométrage valide → écriture', () => {
    const r = normalizeMileage({ value: 80000, source: 'autoscout24.nextdata' })
    expect(r.value).toBe(80000)
    expect(r.quality).toBe('verified')
  })

  it('kilométrage absent → source_empty', () => {
    const r = normalizeMileage({ value: undefined, source: 'autoscout24.nextdata' })
    expect(r.value).toBeNull()
    expect(r.skipReason).toBe('source_empty')
  })

  it('kilométrage négatif → validation_failed', () => {
    const r = normalizeMileage({ value: -100, source: 'autoscout24.nextdata' })
    expect(r.value).toBeNull()
    expect(r.skipReason).toBe('validation_failed')
  })

  it('kilométrage > 1.5M → validation_failed', () => {
    const r = normalizeMileage({ value: 2_000_000, source: 'autoscout24.nextdata' })
    expect(r.value).toBeNull()
    expect(r.skipReason).toBe('validation_failed')
  })

  it('kilométrage inférieur à existant → quality_too_low (règle non-régression)', () => {
    const r = normalizeMileage(
      { value: 50000, source: 'autoscout24.nextdata' },
      { value: 80000 },
    )
    expect(r.value).toBeNull()
    expect(r.skipReason).toBe('quality_too_low')
  })

  it('kilométrage identique → already_set', () => {
    const r = normalizeMileage(
      { value: 80000, source: 'autoscout24.nextdata' },
      { value: 80000 },
    )
    expect(r.value).toBeNull()
    expect(r.skipReason).toBe('already_set')
  })

  it('kilométrage supérieur → écriture (mise à jour correcte)', () => {
    const r = normalizeMileage(
      { value: 95000, source: 'autoscout24.nextdata' },
      { value: 80000 },
    )
    expect(r.value).toBe(95000)
  })

  it('kilométrage manuel existant → already_set', () => {
    const r = normalizeMileage(
      { value: 95000, source: 'autoscout24.nextdata' },
      { value: 80000, quality: 'manual' },
    )
    expect(r.value).toBeNull()
    expect(r.skipReason).toBe('already_set')
  })

  it('kilométrage 0 (neuf) → valide', () => {
    const r = normalizeMileage({ value: 0, source: 'autoscout24.nextdata' })
    expect(r.value).toBe(0)
  })
})
