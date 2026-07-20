/**
 * snapshotImmutability.test.ts
 *
 * Vérifie que les snapshots de marché sont immutables (access control).
 */

import { describe, it, expect } from 'vitest'
import { MarketSnapshots } from '../../collections/MarketSnapshots'

describe('MarketSnapshots — immutability (access control)', () => {
  it('access.update retourne false (snapshots immutables)', () => {
    const updateAccess = MarketSnapshots.access?.update
    expect(updateAccess).toBeDefined()

    if (typeof updateAccess === 'function') {
      // La fonction doit retourner false quelles que soient les args
      const result = updateAccess({} as Parameters<typeof updateAccess>[0])
      expect(result).toBe(false)
    } else {
      // Si c'est une valeur statique false
      expect(updateAccess).toBe(false)
    }
  })

  it('access.delete retourne false (snapshots immutables)', () => {
    const deleteAccess = MarketSnapshots.access?.delete
    expect(deleteAccess).toBeDefined()

    if (typeof deleteAccess === 'function') {
      const result = deleteAccess({} as Parameters<typeof deleteAccess>[0])
      expect(result).toBe(false)
    } else {
      expect(deleteAccess).toBe(false)
    }
  })

  it('access.read permet la lecture aux authentifiés', () => {
    const readAccess = MarketSnapshots.access?.read
    expect(readAccess).toBeDefined()

    if (typeof readAccess === 'function') {
      // Utilisateur authentifié → true
      const authenticatedResult = readAccess({
        req: { user: { id: 'user-1', email: 'test@example.com' } },
      } as Parameters<typeof readAccess>[0])
      expect(authenticatedResult).toBe(true)

      // Utilisateur non authentifié → false
      const unauthResult = readAccess({
        req: { user: null },
      } as Parameters<typeof readAccess>[0])
      expect(unauthResult).toBe(false)
    }
  })

  it('MarketSnapshots a un slug correct', () => {
    expect(MarketSnapshots.slug).toBe('market-snapshots')
  })

  it('MarketSnapshots a les champs requis', () => {
    const fieldNames = MarketSnapshots.fields?.map((f) =>
      'name' in f ? f.name : undefined,
    ).filter(Boolean)

    expect(fieldNames).toContain('study')
    expect(fieldNames).toContain('runId')
    expect(fieldNames).toContain('countDE')
    expect(fieldNames).toContain('countFR')
    expect(fieldNames).toContain('opportunityScore')
    expect(fieldNames).toContain('calculationVersion')
  })
})

// ── MarketStudies access control ──────────────────────────────────────────────

describe('MarketStudies — access control', () => {
  it('importe correctement', async () => {
    const { MarketStudies } = await import('../../collections/MarketStudies')
    expect(MarketStudies.slug).toBe('market-studies')
  })

  it('read: accessible aux authentifiés', async () => {
    const { MarketStudies } = await import('../../collections/MarketStudies')
    const readAccess = MarketStudies.access?.read

    if (typeof readAccess === 'function') {
      const result = readAccess({
        req: { user: { id: 'user-1' } },
      } as Parameters<typeof readAccess>[0])
      expect(result).toBe(true)
    }
  })

  it('create: réservé aux admins', async () => {
    const { MarketStudies } = await import('../../collections/MarketStudies')
    const createAccess = MarketStudies.access?.create

    if (typeof createAccess === 'function') {
      // Admin → true
      const adminResult = createAccess({
        req: { user: { id: 'admin-1', role: 'admin' } },
      } as unknown as Parameters<typeof createAccess>[0])
      expect(adminResult).toBe(true)

      // Viewer → false
      const viewerResult = createAccess({
        req: { user: { id: 'viewer-1', role: 'viewer' } },
      } as unknown as Parameters<typeof createAccess>[0])
      expect(viewerResult).toBe(false)

      // Non authentifié → false
      const unauthResult = createAccess({
        req: { user: null },
      } as unknown as Parameters<typeof createAccess>[0])
      expect(unauthResult).toBe(false)
    }
  })
})
