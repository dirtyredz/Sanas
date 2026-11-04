type SelectionStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>
export function rememberedJob(
  storage: SelectionStorage,
  jobs: readonly { id: number }[],
  newerChoice?: number | '',
): number | '' {
  if (newerChoice !== undefined) return newerChoice
  const id = Number(storage.getItem('sanas.lastJobId'))
  return jobs.some((job) => job.id === id) ? id : ''
}
export function rememberJob(storage: SelectionStorage, value: string): void {
  if (value) storage.setItem('sanas.lastJobId', value)
  else storage.removeItem('sanas.lastJobId')
}

/** The Interview checkbox: the user's explicit choice when there is one, else on when the
 *  selected job has a saved resume (Unsorted never has one). Start sends only the override,
 *  so an untouched box lets main decide from what is saved at that moment. */
export function interviewChecked(override: boolean | undefined, jobHasResume: boolean): boolean {
  return override ?? jobHasResume
}
