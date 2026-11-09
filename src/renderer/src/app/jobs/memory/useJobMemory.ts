import { useCallback, useEffect, useRef, useState } from 'react'
import type { JobMemoryView } from '@shared/jobs/memory'
import { errorText } from '../../../lib/ipc-error'

export function useJobMemory(jobId: number) {
  const [view, setView] = useState<JobMemoryView | null>(null)
  const [draft, setDraft] = useState('')
  const [proposal, setProposal] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const edited = useRef({ saved: false, proposal: false })
  const identity = useRef(0)
  const sequence = useRef(0)
  const running = useRef(false)
  const [draftRevision, setDraftRevision] = useState(0)
  const [proposalIdentity, setProposalIdentity] = useState<{
    meetingId: number
    generation: string
    revision: number
  } | null>(null)
  const accept = useCallback((next: JobMemoryView, reset = false) => {
    if (reset || !edited.current.saved) {
      setDraft(next.approved.text)
      setDraftRevision(next.approved.revision)
    }
    if (reset || !edited.current.proposal) {
      const p = next.proposals[0]
      setProposal(p?.text ?? '')
      setProposalIdentity(
        p ? { meetingId: p.meetingId, generation: p.generation, revision: p.baseRevision } : null,
      )
    }
    if (reset) edited.current = { saved: false, proposal: false }
    setView(next)
  }, [])
  useEffect(() => {
    const epoch = ++identity.current
    edited.current = { saved: false, proposal: false }
    running.current = false
    setBusy(false)
    setView(null)
    setError('')
    const refresh = (): void => {
      if (running.current) return
      const seq = ++sequence.current
      void window.sanas.memory
        .get(jobId)
        .then((next) => {
          if (identity.current === epoch && sequence.current === seq) accept(next)
        })
        .catch((e) => {
          if (identity.current === epoch) setError(errorText(e))
        })
    }
    refresh()
    const timer = window.setInterval(refresh, 2500)
    window.addEventListener('focus', refresh)
    return () => {
      identity.current++
      window.clearInterval(timer)
      window.removeEventListener('focus', refresh)
    }
  }, [jobId, accept])
  const run = async (work: () => Promise<JobMemoryView>, reset = true): Promise<void> => {
    const epoch = identity.current
    sequence.current++
    running.current = true
    setBusy(true)
    setError('')
    try {
      const next = await work()
      if (identity.current === epoch) accept(next, reset)
    } catch (e) {
      if (identity.current === epoch) setError(errorText(e))
    } finally {
      if (identity.current === epoch) {
        running.current = false
        setBusy(false)
      }
    }
  }
  return {
    view,
    draft,
    proposal,
    error,
    busy,
    draftRevision,
    proposalIdentity,
    dirty: edited.current.saved || edited.current.proposal,
    editDraft: (text: string) => {
      edited.current.saved = true
      setDraft(text)
    },
    editProposal: (text: string) => {
      edited.current.proposal = true
      setProposal(text)
    },
    run,
  }
}
