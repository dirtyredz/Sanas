import { useEffect, useState } from 'react'

type GetResume = (jobId: number) => Promise<unknown>
interface Known {
  jobId: number
  has: boolean
}

/**
 * Whether the selected job has a saved resume, for Live's Interview default. Re-read whenever
 * the job changes or the (always-mounted) page is shown again, so a resume saved on the Jobs
 * page counts on return. Only availability is kept; the text stays in main. An answer only
 * counts for the job it was read for, and a late reply after a newer selection or unmount is
 * discarded.
 */
export function useJobHasResume(jobId: number | '', visible: boolean): boolean {
  const [known, setKnown] = useState<Known | null>(null)
  useEffect(
    () => loadJobHasResume(jobId, visible, window.sanas.jobs.getResume, setKnown),
    [jobId, visible],
  )
  return jobHasResume(known, jobId)
}

export function jobHasResume(known: Known | null, jobId: number | ''): boolean {
  return jobId !== '' && known?.jobId === jobId && known.has
}

/** The effect body, exported for tests; returns the cleanup that discards a stale reply. */
export function loadJobHasResume(
  jobId: number | '',
  visible: boolean,
  getResume: GetResume,
  setKnown: (known: Known) => void,
): (() => void) | undefined {
  // Unsorted never snapshots a resume; hidden keeps the last answer until the next show
  if (jobId === '' || !visible) return undefined
  let current = true
  getResume(jobId)
    .then((resume) => current && setKnown({ jobId, has: resume !== null }))
    .catch(() => current && setKnown({ jobId, has: false }))
  return () => {
    current = false
  }
}
