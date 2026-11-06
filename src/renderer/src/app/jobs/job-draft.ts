import type { Job } from '@shared/types'

/** The fields the job page's Save writes: equal means there is nothing unsaved. */
export function sameJobFields(a: Job, b: Job): boolean {
  return (
    a.name === b.name &&
    a.companyInfo === b.companyInfo &&
    a.projectScope === b.projectScope &&
    a.notes === b.notes &&
    a.talkingPoints === b.talkingPoints &&
    a.persona === b.persona &&
    a.summaryEmail === b.summaryEmail
  )
}
