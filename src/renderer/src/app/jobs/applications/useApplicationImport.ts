import { useEffect, useRef, useState } from 'react'
import type { ApplicationListing } from '@shared/jobs/applications'
import { errorText } from '../../../lib/ipc-error'

/** The picker's listing: refreshes on open and on Refresh/Retry and keeps only the newest
 *  reply. The Refresh button is disabled while `refreshing`; main also coalesces concurrent
 *  refreshes of the same configuration into one run of the resumes command. */
export function useApplicationListing(): {
  listing: ApplicationListing | null
  refreshing: boolean
  error: string
  refresh: () => void
} {
  const [listing, setListing] = useState<ApplicationListing | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const latest = useRef(0)

  const refresh = (): void => {
    const request = ++latest.current
    setRefreshing(true)
    setError('')
    window.sanas.jobApplications
      .list()
      .then((next) => request === latest.current && setListing(next))
      .catch((e) => request === latest.current && setError(errorText(e)))
      .finally(() => request === latest.current && setRefreshing(false))
  }

  useEffect(() => {
    refresh()
    return () => {
      latest.current++ // unmounted: drop any reply still in flight
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return { listing, refreshing, error, refresh }
}
