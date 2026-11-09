// The Unsorted bucket: the one job main files meetings under when none was chosen
// (ensureDefaultJob). It is found by this name, so the name is its identity and is reserved:
// no other job may take it and the bucket may not be renamed. Every "is this the bucket?"
// question, in main and in the renderer, goes through isUnsortedJob.

export const UNSORTED_JOB_NAME = 'Unsorted'

/** Why the bucket takes no saved resume (shown in the Resume tab and thrown by main). */
export const UNSORTED_RESUME_MESSAGE =
  'Unsorted holds calls that are not tied to one job, so it cannot have a saved resume. Create or pick a job for the call instead.'

/** True for the Unsorted bucket job. */
export function isUnsortedJob(job: { name: string }): boolean {
  return job.name === UNSORTED_JOB_NAME
}

/** Why `name` cannot be given to this job, or null. `current` is the job being renamed, or
 *  null for a new one. A job keeps or changes its Unsorted-ness only by never changing it. */
export function reservedNameError(name: string, current: { name: string } | null): string | null {
  const wantsBucket = isUnsortedJob({ name: name.trim() })
  const isBucket = !!current && isUnsortedJob(current)
  if (wantsBucket === isBucket) return null
  return wantsBucket
    ? `"${UNSORTED_JOB_NAME}" is reserved for meetings started without a job. Choose another name.`
    : `"${UNSORTED_JOB_NAME}" holds meetings started without a job and cannot be renamed.`
}
