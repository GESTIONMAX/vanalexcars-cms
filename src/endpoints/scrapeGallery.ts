import type { PayloadHandler } from 'payload'
import { chromium } from 'playwright-core'
import type { Vehicle } from '@/payload-types'

const ALLOWED_HOST = /^https?:\/\/(www\.)?autoscout24\.(de|com|fr|it|es|nl|be|at|ch|lu|pl)/
const SCRAPE_SECRET = process.env.SCRAPE_SECRET

function authorized(req: Parameters<PayloadHandler>[0]): boolean {
  if (!SCRAPE_SECRET) return false
  return req.headers.get('x-scrape-secret') === SCRAPE_SECRET
}

export const scrapeGalleryHandler: PayloadHandler = async (req): Promise<Response> => {
  const { payload } = req

  if (!authorized(req)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: { vehicleId?: string; dryRun?: boolean }
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
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

    // Bloquer fonts/styles pour accélérer le chargement
    await page.route('**/*', (route) => {
      if (['font', 'stylesheet', 'media'].includes(route.request().resourceType())) {
        route.abort()
      } else {
        route.continue()
      }
    })

    await page.goto(listingUrl, { waitUntil: 'networkidle', timeout: 30_000 })

    // Passe 1 : JSON-LD (robuste, indépendant des class CSS)
    let imageUrls: string[] | null = await page.evaluate(() => {
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
        } catch {
          /* skip parse errors */
        }
      }
      return null
    })

    // Passe 2 : DOM fallback sur les <img> avec domaine autoscout24
    if (!imageUrls?.length) {
      try {
        await page.waitForSelector('img[src*="autoscout24"]', { timeout: 8_000 })
      } catch {
        /* ignore si le sélecteur n'est pas trouvé */
      }
      imageUrls = await page.evaluate(() =>
        [
          ...new Set(
            Array.from(document.querySelectorAll('img'))
              .map(
                (img) =>
                  (img as HTMLImageElement).src || img.getAttribute('data-src') || '',
              )
              .filter(
                (src) =>
                  src.includes('autoscout24') &&
                  src.match(/\.(jpg|jpeg|webp|png)/i) &&
                  !src.includes('logo'),
              ),
          ),
        ],
      )
    }

    // Filtrer les thumbnails (URLs terminant par _100.jpg, _200.jpg, etc.)
    const fullSize = (imageUrls ?? []).filter(
      (u) => !u.match(/_\d{1,3}\.(jpg|jpeg|webp)$/i),
    )
    const finalUrls = fullSize.length ? fullSize : (imageUrls ?? [])

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
