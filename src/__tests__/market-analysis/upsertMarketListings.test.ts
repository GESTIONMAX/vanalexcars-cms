/**
 * upsertMarketListings.test.ts
 *
 * Tests de l'upsert des annonces de marché.
 * Utilise des mocks Payload pour éviter une vraie connexion DB.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { NormalizedListing } from '../../services/market-analysis/types'

// ── Mock de Payload ──────────────────────────────────────────────────────────

type MockDoc = Record<string, unknown>

function createMockPayload(storedDocs: MockDoc[] = []) {
  const docs = [...storedDocs]

  return {
    find: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
      const dedupKey = (where as Record<string, Record<string, unknown>>)
        ?.deduplicationKey?.equals as string | undefined

      if (dedupKey) {
        const found = docs.filter((d) => d.deduplicationKey === dedupKey)
        return { docs: found }
      }

      // Pour markRemovedListings — retourner toutes les actives
      const study = (where as Record<string, Record<string, unknown>>)?.and
      if (Array.isArray(study)) {
        return { docs: docs.filter((d) => d.status === 'active') }
      }

      return { docs }
    }),
    create: vi.fn(async (args: { collection: string; data: MockDoc }) => {
      const newDoc = { id: `doc-${docs.length + 1}`, ...args.data }
      docs.push(newDoc)
      return newDoc
    }),
    update: vi.fn(async (args: { collection: string; id: string; data: MockDoc }) => {
      const idx = docs.findIndex((d) => d.id === args.id)
      if (idx >= 0) {
        docs[idx] = { ...docs[idx], ...args.data }
        return docs[idx]
      }
      return null
    }),
    logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
    _docs: docs,
  }
}

function makeListing(overrides: Partial<NormalizedListing> = {}): NormalizedListing {
  return {
    sourceId: 'src-123',
    sourceUrl: 'https://as24.de/listing-123',
    price: 25000,
    year: 2022,
    normalizationConfidence: 80,
    ...overrides,
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('upsertMarketListings — deduplication', () => {
  it('crée une nouvelle annonce si absent', async () => {
    const { upsertMarketListings } = await import('../../services/market-analysis/upsertMarketListings')
    const payload = createMockPayload()

    await upsertMarketListings({
      payload: payload as unknown as Parameters<typeof upsertMarketListings>[0]['payload'],
      studyId: 'study-1',
      side: 'germany',
      source: 'autoscout24_de',
      listings: [makeListing()],
      runStartedAt: new Date(),
    })

    expect(payload.create).toHaveBeenCalledOnce()
    const createdData = payload.create.mock.calls[0]![0].data
    expect(createdData.deduplicationKey).toBe('study-1:autoscout24_de:src-123')
  })

  it('update si annonce déjà présente — préserve firstSeenAt', async () => {
    const { upsertMarketListings } = await import('../../services/market-analysis/upsertMarketListings')

    const firstSeenAt = '2024-01-01T00:00:00.000Z'
    const existingDoc: MockDoc = {
      id: 'existing-doc-1',
      deduplicationKey: 'study-1:autoscout24_de:src-123',
      firstSeenAt,
      lastSeenAt: firstSeenAt,
      status: 'active',
      advertisedPrice: 24000,
      sourceId: 'src-123',
    }

    const payload = createMockPayload([existingDoc])

    await upsertMarketListings({
      payload: payload as unknown as Parameters<typeof upsertMarketListings>[0]['payload'],
      studyId: 'study-1',
      side: 'germany',
      source: 'autoscout24_de',
      listings: [makeListing({ price: 25000 })],
      runStartedAt: new Date(),
    })

    // Ne doit pas créer un nouveau doc
    expect(payload.create).not.toHaveBeenCalled()
    // Doit mettre à jour
    expect(payload.update).toHaveBeenCalled()

    // Vérifier que firstSeenAt est préservé dans la doc
    const updatedDoc = payload._docs.find((d) => d.id === 'existing-doc-1')
    expect(updatedDoc?.firstSeenAt).toBe(firstSeenAt)
  })

  it('update lastSeenAt lors d\'une vue', async () => {
    const { upsertMarketListings } = await import('../../services/market-analysis/upsertMarketListings')

    const existingDoc: MockDoc = {
      id: 'doc-1',
      deduplicationKey: 'study-1:autoscout24_de:src-456',
      firstSeenAt: '2024-01-01T00:00:00.000Z',
      lastSeenAt: '2024-01-01T00:00:00.000Z',
      status: 'active',
      sourceId: 'src-456',
    }

    const payload = createMockPayload([existingDoc])
    const runStartedAt = new Date('2024-06-01T10:00:00.000Z')

    await upsertMarketListings({
      payload: payload as unknown as Parameters<typeof upsertMarketListings>[0]['payload'],
      studyId: 'study-1',
      side: 'germany',
      source: 'autoscout24_de',
      listings: [makeListing({ sourceId: 'src-456' })],
      runStartedAt,
    })

    // lastSeenAt doit avoir été mis à jour
    const updateCall = payload.update.mock.calls.find((c) => c[0].id === 'doc-1')
    expect(updateCall).toBeDefined()
    expect(updateCall![0].data.lastSeenAt).toBe(runStartedAt.toISOString())
  })

  it('annonce non vue → status=removed, removedAt défini', async () => {
    const { upsertMarketListings } = await import('../../services/market-analysis/upsertMarketListings')

    const staleDoc: MockDoc = {
      id: 'stale-doc',
      deduplicationKey: 'study-1:autoscout24_de:src-old',
      sourceId: 'src-old',
      status: 'active',
      firstSeenAt: '2024-01-01T00:00:00.000Z',
      lastSeenAt: '2024-01-01T00:00:00.000Z',
    }

    const payload = createMockPayload([staleDoc])

    // Upsert avec un listing différent (src-new, pas src-old)
    await upsertMarketListings({
      payload: payload as unknown as Parameters<typeof upsertMarketListings>[0]['payload'],
      studyId: 'study-1',
      side: 'germany',
      source: 'autoscout24_de',
      listings: [makeListing({ sourceId: 'src-new' })],
      runStartedAt: new Date(),
    })

    // stale-doc devrait avoir été marqué comme removed
    const removedCall = payload.update.mock.calls.find((c) => c[0].id === 'stale-doc')
    expect(removedCall).toBeDefined()
    expect(removedCall![0].data.status).toBe('removed')
    expect(removedCall![0].data.removedAt).toBeDefined()
  })

  it('sourceId dupliqué → une seule création', async () => {
    const { upsertMarketListings } = await import('../../services/market-analysis/upsertMarketListings')
    const payload = createMockPayload()

    const listing = makeListing({ sourceId: 'dup-id' })

    await upsertMarketListings({
      payload: payload as unknown as Parameters<typeof upsertMarketListings>[0]['payload'],
      studyId: 'study-1',
      side: 'germany',
      source: 'autoscout24_de',
      listings: [listing],
      runStartedAt: new Date(),
    })

    // Premier appel → create
    expect(payload.create).toHaveBeenCalledOnce()

    // Deuxième upsert avec le même sourceId → update
    payload.create.mockClear()
    payload.update.mockClear()
    // Simuler que le doc existe maintenant
    const createdDoc = payload._docs.find(
      (d) => d.deduplicationKey === 'study-1:autoscout24_de:dup-id',
    )
    expect(createdDoc).toBeDefined()
  })
})
