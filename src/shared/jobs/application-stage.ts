import type { ApplicationStage } from './applications'

// What each application stage allows. The one place the closed rules live: listing, preview,
// apply and the dev mock all ask here instead of comparing `stage === 'closed'`.

export interface StageCapabilities {
  /** Shown in the picker at all. A closed application with no linked job is hidden. */
  visible: boolean
  /** May start a new job. */
  create: boolean
  /** May be offered a field refresh. */
  refresh: boolean
  /** May archive the linked job (closed, and not archived yet). */
  archive: boolean
}

export const CLOSED_CREATE_MESSAGE = 'This application is closed, so it cannot create a new job.'

/** `link` is the linked job's state, or null when no job is linked to the application. */
export function stageCapabilities(
  stage: ApplicationStage,
  link: { archived: boolean } | null,
): StageCapabilities {
  const closed = stage === 'closed'
  return {
    visible: !closed || link !== null,
    create: !closed && link === null,
    refresh: !closed && link !== null,
    archive: closed && link !== null && !link.archived,
  }
}
