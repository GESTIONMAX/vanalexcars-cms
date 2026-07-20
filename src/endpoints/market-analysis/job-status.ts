/**
 * endpoints/market-analysis/job-status.ts
 *
 * GET /api/market-analysis/jobs/:jobId
 *
 * Auth : session utilisateur OU Bearer SCRAPER_SECRET
 */

import type { PayloadHandler } from 'payload'
import { asUntypedPayload } from '@/services/market-analysis/payloadAdapter'

export const marketAnalysisJobStatusHandler: PayloadHandler = async (req): Promise<Response> => {
  const { payload } = req
  const db = asUntypedPayload(payload)

  const scraperSecret = process.env.SCRAPER_SECRET
  const isAuthenticated = Boolean(req.user)
  const providedSecret =
    req.headers.get('x-secret') ??
    req.headers.get('authorization')?.replace('Bearer ', '') ??
    null
  const hasValidSecret = scraperSecret ? providedSecret === scraperSecret : false

  if (!isAuthenticated && !hasValidSecret) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const url = new URL(req.url ?? '', 'http://localhost')
  const pathParts = url.pathname.split('/')
  const jobId = pathParts[pathParts.length - 1]

  if (!jobId) {
    return Response.json({ error: '`jobId` is required in path' }, { status: 400 })
  }

  try {
    const jobResult = await db.find({
      collection: 'payload-jobs',
      where: { id: { equals: jobId } },
      limit: 1,
    })

    if (jobResult.docs.length === 0) {
      return Response.json({ error: `Job ${jobId} not found` }, { status: 404 })
    }

    const job = jobResult.docs[0] as Record<string, unknown>
    const taskInput = job.input as Record<string, unknown> | undefined
    const studyId = taskInput?.studyId as string | undefined

    let snapshotId: string | undefined
    if (studyId && job.completedAt) {
      const snapshotResult = await db.find({
        collection: 'market-snapshots',
        where: { study: { equals: studyId } },
        sort: '-createdAt',
        limit: 1,
      })
      if (snapshotResult.docs.length > 0) {
        snapshotId = snapshotResult.docs[0].id as string
      }
    }

    return Response.json({
      jobId,
      studyId,
      status: job.completedAt ? 'completed' : job.hasError ? 'failed' : 'running',
      completedAt: job.completedAt,
      snapshotId,
      error: job.error,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    payload.logger.error(`[market-analysis/job-status] Error: ${message}`)
    return Response.json({ error: message }, { status: 500 })
  }
}
