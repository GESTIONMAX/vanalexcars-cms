/**
 * extractAs24NextData.ts
 *
 * Extraction des données vendeur et véhicule depuis le JSON __NEXT_DATA__
 * embarqué dans le HTML initial des pages AutoScout24.
 *
 * Deux formats de page sont supportés, avec des chemins JSON distincts :
 *
 *   /angebote/<slug>
 *     props.pageProps.listingDetails.seller.companyName
 *     props.pageProps.listingDetails.location.city
 *
 *   /smyle/details/<uuid>/
 *     props.pageProps.properData.carDetails.ocsInfo.seller.companyName
 *     props.pageProps.properData.carDetails.ocsInfo.location.city
 *     ⚠️  originalSellerCompanyName = "smyle" → marketplace, PAS un dealer
 *
 * Ordre de priorité : données structurées stables > état JSON embarqué > XHR > DOM.
 * Cette fonction couvre les deux premiers niveaux sans dépendance réseau.
 *
 * Aucune dépendance Playwright — testable avec de simples fixtures JSON.
 */

// ── Types ────────────────────────────────────────────────────────────────────

export interface As24NextDataResult {
  /** Format de page détecté */
  pageFormat: 'angebote' | 'smyle' | 'unknown'

  /** Nom du concessionnaire (null si particulier ou introuvable) */
  dealerName: string | null

  /** Prénom/nom du contact (informatif) */
  dealerContact: string | null

  /** Ville de la concession */
  dealerCity: string | null

  /** true si AS24 confirme explicitement que c'est un professionnel */
  isDealer: boolean | null

  /** Prix brut en euros (peut être null si non exposé) */
  price: number | null

  /** Kilométrage (peut être null) */
  mileage: number | null

  /** Puissance brute (ex: "150 PS", "110 kW") */
  power: string | null

  /** Couleur extérieure */
  exteriorColor: string | null

  /** Couleur intérieure */
  interiorColor: string | null

  /** Nombre de portes */
  doors: number | null

  /** Nombre de places */
  seats: number | null
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function str(v: unknown): string | null {
  if (v == null) return null
  const s = String(v).trim()
  return s === '' ? null : s
}

function num(v: unknown): number | null {
  if (v == null) return null
  const n = Number(v)
  return isFinite(n) && n > 0 ? n : null
}

function extractPower(typedAttrs: unknown[]): string | null {
  for (const a of typedAttrs) {
    const attr = a as Record<string, unknown>
    const key = String(attr.key ?? attr.id ?? '').toLowerCase()
    if (key.includes('power') || key.includes('leistung') || key === 'ps' || key === 'kw') {
      return str(attr.value ?? attr.formattedValue)
    }
  }
  return null
}

// ── Format /angebote/ ─────────────────────────────────────────────────────────

function extractAngebote(pageProps: Record<string, unknown>): As24NextDataResult {
  const ld = pageProps.listingDetails as Record<string, unknown> | undefined
  if (!ld) {
    return emptyResult('angebote')
  }

  const seller = (ld.seller ?? {}) as Record<string, unknown>
  const location = (ld.location ?? {}) as Record<string, unknown>
  const vehicle = (ld.vehicle ?? {}) as Record<string, unknown>
  const prices = (ld.prices ?? {}) as Record<string, unknown>

  // Prix : prices.public.priceRaw ou prices.dealer.priceRaw
  const pricePublic = (prices.public ?? prices.dealer ?? {}) as Record<string, unknown>
  const price = num(pricePublic.priceRaw ?? pricePublic.price)

  // Kilométrage
  const mileageRaw = (ld.mileage ?? {}) as Record<string, unknown>
  const mileage = num(mileageRaw.value ?? ld.mileage)

  // Puissance
  const typedAttrs = (vehicle.typedAttributes ?? vehicle.vehicleAttributes ?? []) as unknown[]
  const power = extractPower(typedAttrs)
    ?? str(vehicle.power ?? vehicle.leistung)

  // Couleurs / portes / places
  const attrs = (vehicle.attributes ?? vehicle.rawData ?? {}) as Record<string, unknown>
  const exteriorColor = str(vehicle.color ?? vehicle.exteriorColor ?? attrs.color)
  const interiorColor = str(vehicle.interiorColor ?? attrs.interiorColor)
  const doors = num(vehicle.doors ?? attrs.doors)
  const seats = num(vehicle.seats ?? attrs.seats)

  return {
    pageFormat: 'angebote',
    dealerName: str(seller.companyName),
    dealerContact: str(seller.contactName),
    dealerCity: str(location.city),
    isDealer: typeof seller.isDealer === 'boolean' ? seller.isDealer : null,
    price,
    mileage,
    power,
    exteriorColor,
    interiorColor,
    doors,
    seats,
  }
}

// ── Format /smyle/details/ ────────────────────────────────────────────────────

function extractSmyle(pageProps: Record<string, unknown>): As24NextDataResult {
  const properData = pageProps.properData as Record<string, unknown> | undefined
  const carDetails = properData?.carDetails as Record<string, unknown> | undefined
  const ocsInfo = carDetails?.ocsInfo as Record<string, unknown> | undefined

  if (!ocsInfo) {
    return emptyResult('smyle')
  }

  const seller = (ocsInfo.seller ?? {}) as Record<string, unknown>
  const location = (ocsInfo.location ?? {}) as Record<string, unknown>

  // Prix : carDetails.price.gross ou carDetails.price
  const priceRaw = carDetails?.price as Record<string, unknown> | number | undefined
  const price = typeof priceRaw === 'number'
    ? num(priceRaw)
    : num((priceRaw as Record<string, unknown>)?.gross ?? (priceRaw as Record<string, unknown>)?.priceRaw)

  // Kilométrage et puissance depuis carDetails.vehicle si présent
  const vehicle = (carDetails?.vehicle ?? {}) as Record<string, unknown>
  const typedAttrs = (vehicle.typedAttributes ?? []) as unknown[]
  const power = extractPower(typedAttrs) ?? str(vehicle.power)

  const mileage = num((vehicle.mileage as Record<string, unknown>)?.value ?? vehicle.mileage)
  const exteriorColor = str(vehicle.color ?? vehicle.exteriorColor)
  const interiorColor = str(vehicle.interiorColor)
  const doors = num(vehicle.doors)
  const seats = num(vehicle.seats)

  // ⚠️  originalSellerCompanyName = "smyle" → marketplace, ignorer
  // Le vrai concessionnaire est dans ocsInfo.seller.companyName

  return {
    pageFormat: 'smyle',
    dealerName: str(seller.companyName),
    dealerContact: str(seller.contactName),
    dealerCity: str(location.city),
    isDealer: true, // les pages Smyle sont toujours des dealers (financement professionnel)
    price,
    mileage,
    power,
    exteriorColor,
    interiorColor,
    doors,
    seats,
  }
}

// ── Résultat vide ─────────────────────────────────────────────────────────────

function emptyResult(pageFormat: As24NextDataResult['pageFormat']): As24NextDataResult {
  return {
    pageFormat,
    dealerName: null,
    dealerContact: null,
    dealerCity: null,
    isDealer: null,
    price: null,
    mileage: null,
    power: null,
    exteriorColor: null,
    interiorColor: null,
    doors: null,
    seats: null,
  }
}

// ── Fonction principale ───────────────────────────────────────────────────────

/**
 * Extrait les données vendeur + véhicule depuis l'objet `__NEXT_DATA__` parsé.
 *
 * @param nextDataJson — le contenu de `<script id="__NEXT_DATA__">…</script>` parsé
 * @returns As24NextDataResult avec pageFormat détecté
 */
export function extractAs24NextData(nextDataJson: unknown): As24NextDataResult {
  if (!nextDataJson || typeof nextDataJson !== 'object') {
    return emptyResult('unknown')
  }

  const root = nextDataJson as Record<string, unknown>
  const props = (root.props ?? {}) as Record<string, unknown>
  const pageProps = (props.pageProps ?? {}) as Record<string, unknown>

  // ── Détection du format par clé de premier niveau ─────────────────────────

  if (pageProps.listingDetails) {
    return extractAngebote(pageProps)
  }

  if ((pageProps.properData as Record<string, unknown> | undefined)?.carDetails) {
    return extractSmyle(pageProps)
  }

  return emptyResult('unknown')
}
