import { useEffect, useRef, useState } from 'react'
import type { Job } from '@shared/types'
import type {
  MockPlanId,
  MockSetup,
  MockState,
  PracticeSession,
} from '@shared/mock-interview/types'
import type { CaptureSession } from '../../audio/mic'
import { startCapturedMeeting } from '../../lib/meeting/start/start-captured-meeting'
import { useMeetingState } from '../../lib/meeting/useMeetingState'
import { errorText } from '../../lib/ipc-error'

/**
 * Session state for the Mock interview page: setup, job choice, the main-process mock
 * state, past sessions and the mic capture. The hook owns the capture: it stops it on
 * unmount, when the meeting leaves 'live', and when the session ends.
 */
export function useMockInterview(visible: boolean) {
  const meeting = useMeetingState()
  const [setup, setSetup] = useState<MockSetup | null>(null)
  const [jobs, setJobs] = useState<Job[]>([])
  const [jobId, setJobId] = useState<number | ''>('')
  const [plan, setPlan] = useState<MockPlanId>('interview')
  const [state, setState] = useState<MockState | null>(null)
  const [past, setPast] = useState<PracticeSession[]>([])
  const [selected, setSelected] = useState<PracticeSession | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const mic = useRef<CaptureSession | null>(null)
  const mounted = useRef(true)
  const active = !!state && !['idle', 'ended'].includes(state.status)
  const refresh = (): void => {
    window.sanas.mockInterview
      .history()
      .then(setPast)
      .catch((e) => setError(errorText(e)))
  }
  useEffect(() => {
    mounted.current = true
    const receive = (s: MockState): void => {
      setState(s)
      if (s.status === 'ended' || s.status === 'ending') {
        void mic.current?.stop()
        mic.current = null
        refresh()
      }
    }
    const off = window.sanas.mockInterview.onChanged(receive)
    window.sanas.mockInterview
      .getState()
      .then(receive)
      .catch((e) => setError(errorText(e)))
    return () => {
      mounted.current = false
      off()
      void mic.current?.stop()
      mic.current = null
    }
  }, [])
  useEffect(() => {
    if (!visible) return
    window.sanas.mockInterview
      .setup()
      .then(setSetup)
      .catch((e) => setError(errorText(e)))
    window.sanas.jobs
      .list()
      .then((all) => {
        setJobs(all)
        setJobId((id) => (all.some((j) => j.id === id) ? id : (all[0]?.id ?? '')))
      })
      .catch((e) => setError(errorText(e)))
    refresh()
  }, [visible])
  useEffect(() => {
    if (meeting.status !== 'live') {
      void mic.current?.stop()
      mic.current = null
    }
  }, [meeting.status])
  const start = async (): Promise<void> => {
    if (jobId === '' || busy) return
    setBusy(true)
    setError('')
    setSelected(null)
    try {
      const opened = await startCapturedMeeting(
        'this-pc',
        (channels) => window.sanas.mockInterview.start(plan, jobId, channels),
        (s) => !['idle', 'ending', 'ended'].includes(s.status),
        true,
      )
      if (!mounted.current) {
        await opened.capture.stop()
        await window.sanas.mockInterview.end()
        return
      }
      mic.current = opened.capture
      setState(opened.result)
    } catch (e) {
      setError(errorText(e))
    } finally {
      setBusy(false)
    }
  }
  return {
    meetingOpen: meeting.meetingId !== null,
    setup,
    jobs,
    jobId,
    setJobId,
    plan,
    setPlan,
    state,
    past,
    selected,
    setSelected,
    busy,
    error,
    setError,
    active,
    refresh,
    start,
  }
}
