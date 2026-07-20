/**
 * providers/types.ts
 *
 * Types partagés des providers de données de marché.
 */

import type { MarketStudy } from '../types'

export interface RawMarketListing {
  sourceId: string
  sourceUrl: string
  title?: string
  price?: number
  mileage?: number
  year?: number
  fuel?: string
  transmission?: string
  bodyType?: string
  powerHp?: number
  location?: string
  dealer?: string
  imageUrl?: string
  sellerType?: string
  rawData?: unknown
}

export interface MarketListingProvider {
  source: string
  fetchListings(params: { study: MarketStudy; signal?: AbortSignal }): Promise<RawMarketListing[]>
}
