/**
 * endpoints/market-analysis/run.ts
 *
 * POST /api/market-analysis/run
 *
 * Corps : { studyId: string }
 * Auth  : admin_session cookie OU Bearer SCRAPER_SECRET
 */

import type { PayloadHandler } from 'payload'
import { asUntypedPayload } from '@/services/market-analysis/payloadAdapter'

export const marketAnalysisRunHandler: PayloadHandler = async (req): Promise<Response> => {
  const { payload } = req
  const db = asUntypedPayload(payload)

  const scraperSecret = process.env.SCRAPER_SECRET

  let body: { studyId?: string; secret?: string }
  try {
    body = await (req as unknown as Request).json()
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const isAuthenticated = Boolean(req.user)
  const providedSecret =
    req.headers.get('x-secret') ??
    req.headers.get('authorization')?.replace('Bearer ', '') ??
    body.secret ??
    null
  const hasValidSecret = scraperSecret ? providedSecret === scraperSecret : false

  if (!isAuthenticated && !hasValidSecret) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { studyId } = body
  if (!studyId) {
    return Response.json({ error: '`studyId` is required' }, { status: 400 })
  }

  let studyDoc: Record<string, unknown>
  try {
    studyDoc = await db.findByID({
      collection: 'market-studies',
      id: studyId,
    })
  } catch {
    return Response.json({ error: `Study ${studyId} not found` }, { status: 404 })
  }

  if (studyDoc.lastRunStatus === 'running') {
    return Response.json(
      { error: 'Study is already running', studyId, status: 'running' },
      { status: 409 },
    )
  }

  try {
    const job = await payload.jobs.queue({
      task: 'run-market-analysis' as never,
      input: { studyId } as never,
    })

    await db.update({
      collection: 'market-studies',
      id: studyId,
      data: { lastRunStatus: 'queued' },
    })

    const jobId = (job as Record<string, unknown>).id as string | undefined

    return Response.json({
      studyId,
      jobId: jobId ?? null,
      status: 'queued',
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    payload.logger.error(`[market-analysis/run] Queue failed: ${message}`)
    return Response.json({ error: message }, { status: 500 })
  }
}
