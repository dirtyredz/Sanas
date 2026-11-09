import { isUnsortedJob } from '@shared/jobs/unsorted'
import type { Job } from '@shared/types'

// What Live's job picker offers and which job it remembers across sessions.

type SelectionStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

const LAST_JOB_KEY = 'sanas.lastJobId'

/**
 * Jobs a start picker offers as real choices. The Unsorted bucket row is excluded: the
 * picker's own blank "Unsorted" option already means it (main files that meeting into the
 * bucket), so listing the row too showed "Unsorted" twice.
 */
export function startableJobs<T extends Pick<Job, 'name'>>(all: readonly T[]): T[] {
  return all.filter((job) => !isUnsortedJob(job))
}

/** The remembered job when it is still offered, else '' (Unsorted); a newer explicit choice
 *  made while the list was loading wins. */
export function rememberedJob(
  storage: SelectionStorage,
  jobs: readonly { id: number }[],
  newerChoice?: number | '',
): number | '' {
  if (newerChoice !== undefined) return newerChoice
  const id = Number(storage.getItem(LAST_JOB_KEY))
  return jobs.some((job) => job.id === id) ? id : ''
}

export function rememberJob(storage: SelectionStorage, value: string): void {
  if (value) storage.setItem(LAST_JOB_KEY, value)
  else storage.removeItem(LAST_JOB_KEY)
}

/**
 * The selection to keep after a fresh job list (already reduced to `startableJobs`). A
 * remembered or current selection that points at a vanished job resolves to '' (Unsorted).
 */
export function selectionAfterReload(
  storage: SelectionStorage,
  jobs: readonly { id: number }[],
  newerChoice?: number | '',
): number | '' {
  const id = rememberedJob(storage, jobs, newerChoice)
  return id !== '' && !jobs.some((j) => j.id === id) ? '' : id
}
