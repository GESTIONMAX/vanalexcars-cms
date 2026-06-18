import type { PayloadHandler } from 'payload'
import { chromium } from 'playwright-core'
import type { Vehicle } from '@/payload-types'

const ALLOWED_HOST = /^https?:\/\/(www\.)?autoscout24\.(de|com|fr|it|es|nl|be|at|ch|lu|pl)/

export const scrapeGalleryHandler: PayloadHandler = async (req): Promise<Response> => {
  const { payload } = req

  // Parser le body en premier pour pouvoir lire le secret dedans
  let body: { vehicleId?: string; dryRun?: boolean; secret?: string }
  try {
    body = await (req as unknown as Request).json()
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  // Auth : si SCRAPER_SECRET est défini, vérifier header ou body
  const scraperSecret = process.env.SCRAPER_SECRET
  if (scraperSecret) {
    const provided =
      req.headers.get('x-secret') ??
      req.headers.get('x-scrape-secret') ??
      body.secret ??
      null
    if (provided !== scraperSecret) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  const { vehicleId, dryRun = false } = body
  if (!vehicleId) return Response.json({ error: '`vehicleId` is required' }, { status: 400 })

  let vehicle: Vehicle
  try {
    vehicle = (await payload.findByID({ collection: 'vehicles', id: vehicleId })) as Vehicle
  } catch {
    return Response.json({ error: 'Vehicle not found' }, { status: 404 })
  }

  const listingUrl = vehicle.originalListingUrl
  if (!listingUrl)
    return Response.json({ error: 'Vehicle has no `originalListingUrl`' }, { status: 400 })
  if (!ALLOWED_HOST.test(listingUrl))
    return Response.json({ error: 'URL not allowed (must be an AutoScout24 domain)' }, { status: 400 })

  const executablePath =
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ?? '/usr/bin/chromium'
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined

  try {
    browser = await chromium.launch({
      executablePath,
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--headless=new',
      ],
    })

    const page = await browser.newPage()

    // User-Agent réaliste pour éviter le blocage Cloudflare/AS24
    await page.setExtraHTTPHeaders({
      'User-Agent':
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept-Language': 'de-DE,de;q=0.9,fr;q=0.8',
    })

    // Regex CDN AS24 — capture toutes les URLs listing-images (avec ou sans suffixe de taille)
    const cdnPattern =
      /https:\/\/prod\.pictures\.autoscout24\.net\/listing-images\/[a-f0-9-]+_[a-f0-9-]+\.jpg[^\s"']*/gi

    // Normalise une URL AS24 vers sa forme de base (sans suffixe /NxN.ext)
    const normalizeAs24Url = (url: string) =>
      url.replace(/\/\d+x\d+\.(jpg|jpeg|webp|png)$/i, '')

    // Passe 0 : intercepter les réponses réseau JSON avant navigation
    // AS24 appelle son API interne pour charger la fiche (toutes les photos incluses)
    const intercepted = new Set<string>()

    page.on('response', async (response) => {
      try {
        const ct = response.headers()['content-type'] ?? ''
        if (!ct.includes('application/json') && !ct.includes('text/javascript')) return
        const text = await response.text()
        for (const match of text.matchAll(cdnPattern)) {
          intercepted.add(normalizeAs24Url(match[0]))
        }
      } catch {
        /* ignore — response déjà consommée ou binaire */
      }
    })

    // Bloquer fonts/styles pour accélérer le chargement
    await page.route('**/*', (route) => {
      if (['font', 'stylesheet', 'media'].includes(route.request().resourceType())) {
        route.abort()
      } else {
        route.continue()
      }
    })

    // domcontentloaded au lieu de networkidle — AS24 est une SPA qui
    // fait des requêtes en continu, networkidle ne se déclenche jamais
    await page.goto(listingUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 })

    // Attendre que les XHR de la fiche soient chargés (images incluses)
    await new Promise((r) => setTimeout(r, 6_000))

    // Si l'interception réseau a trouvé des images → on les utilise directement
    let imageUrls: string[] = [...intercepted]

    // Passe 1 : JSON-LD (si interception vide)
    if (!imageUrls.length) {
      const jsonLd: string[] | null = await page.evaluate(() => {
        for (const script of Array.from(
          document.querySelectorAll('script[type="application/ld+json"]'),
        )) {
          try {
            const data = JSON.parse(script.textContent ?? '')
            const nodes = data['@graph'] ? data['@graph'] : [data]
            for (const node of nodes) {
              if (['Vehicle', 'Car'].includes(node['@type'])) {
                const imgs = node.image
                if (Array.isArray(imgs) && imgs.length) return imgs as string[]
                if (typeof imgs === 'string') return [imgs]
              }
            }
          } catch { /* skip */ }
        }
        return null
      })
      if (jsonLd?.length) imageUrls = jsonLd
    }

    // Passe 2 : DOM fallback (dernier recours)
    if (!imageUrls.length) {
      try {
        await page.waitForSelector('img[src*="autoscout24"]', { timeout: 8_000 })
      } catch { /* ignore */ }
      imageUrls = await page.evaluate(() =>
        [...new Set(
          Array.from(document.querySelectorAll('img'))
            .map((img) => (img as HTMLImageElement).src || img.getAttribute('data-src') || '')
            .filter((src) =>
              src.includes('autoscout24') &&
              src.match(/\.(jpg|jpeg|webp|png)/i) &&
              !src.includes('logo'),
            ),
        )],
      )
    }

    // Normaliser + garder uniquement les URLs CDN listing-images
    const finalUrls = [
      ...new Set(
        imageUrls
          .map(normalizeAs24Url)
          .filter((u) => u.includes('prod.pictures.autoscout24.net/listing-images/')),
      ),
    ]

    if (!finalUrls.length) {
      return Response.json({ error: 'No images found at listing URL' }, { status: 502 })
    }

    if (dryRun) {
      return Response.json({
        dryRun: true,
        vehicleId,
        scrapedCount: finalUrls.length,
        imageUrls: finalUrls,
      })
    }

    await payload.update({
      collection: 'vehicles',
      id: vehicleId,
      data: {
        imageUrls: finalUrls.map((url) => ({ url })),
        lastScrapedAt: new Date().toISOString(),
      },
    })

    return Response.json({
      success: true,
      vehicleId,
      scrapedCount: finalUrls.length,
      imageUrls: finalUrls,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Scraping failed'
    payload.logger.error(`[scrapeGallery] ${message}`)
    return Response.json({ error: message }, { status: 502 })
  } finally {
    await browser?.close()
  }
}
