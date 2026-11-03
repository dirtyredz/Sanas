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
