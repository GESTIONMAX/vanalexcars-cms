/**
 * payloadAdapter.ts
 *
 * Adapter pour contourner les contraintes de types Payload CMS sur les slugs
 * de collections qui ne sont pas encore dans payload-types.ts (généré).
 *
 * Ces helpers permettent d'utiliser les nouvelles collections sans
 * régénérer les types, en attendant la prochaine génération.
 */

import type { BasePayload } from 'payload'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyPayload = any

/**
 * Version non-typée du payload pour les nouvelles collections
 * qui ne sont pas encore dans payload-types.ts
 */
export function asUntypedPayload(payload: BasePayload): AnyPayload {
  return payload as AnyPayload
}
