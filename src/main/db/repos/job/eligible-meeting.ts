import { UNSORTED_JOB_NAME } from '@shared/jobs/unsorted'

/** The one SQL spelling of "a meeting that may feed same-job history or job memory": ended, not
 *  practice, and filed under an ordinary (non-Unsorted) job. Callers alias meetings `m` and jobs `j`.
 *  The TS twin is the early exit in live-session `begin` (isUnsortedJob + practice). */
export const ORDINARY_JOB_SQL = `j.name<>'${UNSORTED_JOB_NAME}'`
export const ELIGIBLE_MEETING_SQL = `m.ended_at IS NOT NULL AND m.practice=0 AND ${ORDINARY_JOB_SQL}`
