/**
 * dispatchMarketAnalyses.ts
 *
 * Tâche Payload CMS : dispatch-market-analyses
 *
 * Logique :
 *   1. Trouver toutes les études actives où :
 *      - nextRunAt <= now
 *      - schedule !== 'manual'
 *      - lastRunStatus !== 'running'
 *   2. Mettre en file une tâche run-market-analysis pour chacune
 *   3. Mettre à jour lastRunStatus → queued
 */

import type { TaskConfig } from 'payload'
import { asUntypedPayload } from '@/services/market-analysis/payloadAdapter'

type TaskInputOutput = { input: object; output: object }

type DispatchMarketAnalysesIO = TaskInputOutput & {
  input: Record<string, never>
  output: {
    dispatched: number
    studyIds: string
  }
}

export const dispatchMarketAnalysesTask: TaskConfig<DispatchMarketAnalysesIO> = {
  slug: 'dispatch-market-analyses',
  label: 'Dispatch Market Analyses',
  inputSchema: [],
  outputSchema: [
    { name: 'dispatched', type: 'number' },
    { name: 'studyIds', type: 'text' },
  ],
  handler: async ({ req }) => {
    const { payload } = req
    const db = asUntypedPayload(payload)
    const now = new Date().toISOString()

    // Trouver les études éligibles
    const eligibleStudies = await db.find({
      collection: 'market-studies',
      where: {
        and: [
          { status: { equals: 'active' } },
          { schedule: { not_equals: 'manual' } },
          { lastRunStatus: { not_equals: 'running' } },
          {
            or: [
              { nextRunAt: { less_than_equal: now } },
              { nextRunAt: { exists: false } },
            ],
          },
        ],
      },
      limit: 100,
    })

    const dispatchedIds: string[] = []

    for (const study of eligibleStudies.docs) {
      const studyId = study.id as string
      try {
        // Mettre en file la tâche
        await payload.jobs.queue({
          task: 'run-market-analysis' as never,
          input: { studyId } as never,
        })

        // Marquer comme queued
        await db.update({
          collection: 'market-studies',
          id: studyId,
          data: { lastRunStatus: 'queued' },
        })

        dispatchedIds.push(studyId)
        payload.logger.info(`[dispatchMarketAnalyses] Queued study ${studyId}`)
      } catch (err: unknown) {
        payload.logger.error(
          `[dispatchMarketAnalyses] Failed to queue study ${studyId}: ${err instanceof Error ? err.message : String(err)}`,
        )
      }
    }

    payload.logger.info(`[dispatchMarketAnalyses] Dispatched ${dispatchedIds.length} studies`)

    return {
      output: {
        dispatched: dispatchedIds.length,
        studyIds: dispatchedIds.join(','),
      },
    }
  },
}
