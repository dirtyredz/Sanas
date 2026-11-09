import { useEffect, useState } from 'react'
import type { GlossaryTerm } from '@shared/types'
import { parseGlossaryInput } from '../../lib/glossary-input'

export interface JobGlossaryModel {
  terms: GlossaryTerm[]
  /** Adds the pasted terms; resolves to the notice to show, or null when there was nothing to add. */
  add: (input: string) => Promise<string | null>
  remove: (id: number) => void
}

/** A job's glossary, persisted immediately (not part of the Overview draft). The terms are
 *  also read by the job memory proposals, hence a hook the Overview owns. */
export function useJobGlossary(jobId: number): JobGlossaryModel {
  const [terms, setTerms] = useState<GlossaryTerm[]>([])

  useEffect(() => {
    window.sanas.glossary.list(jobId).then(setTerms)
  }, [jobId])

  const add = async (input: string): Promise<string | null> => {
    const parsed = parseGlossaryInput(
      input,
      terms.map((term) => term.term),
    )
    if (parsed.terms.length === 0 && parsed.alreadyThere === 0) return null

    const added: GlossaryTerm[] = []
    for (const term of parsed.terms) {
      added.push(await window.sanas.glossary.add(jobId, term, ''))
    }

    setTerms((prev) => [...prev, ...added].sort((a, b) => a.term.localeCompare(b.term)))
    return `Added ${added.length} · ${parsed.alreadyThere} already there`
  }

  const remove = (id: number): void => {
    window.sanas.glossary.remove(id)
    setTerms((prev) => prev.filter((p) => p.id !== id))
  }

  return { terms, add, remove }
}

/** The Glossary side section: add terms (Enter submits), list and remove chips. */
export function JobGlossary({ glossary }: { glossary: JobGlossaryModel }): React.JSX.Element {
  const [newTerm, setNewTerm] = useState('')
  const [notice, setNotice] = useState('')

  useEffect(() => {
    if (!notice) return
    const timeout = window.setTimeout(() => setNotice(''), 3000)
    return () => window.clearTimeout(timeout)
  }, [notice])

  const addTerm = async (): Promise<void> => {
    const result = await glossary.add(newTerm)
    if (result === null) return
    setNewTerm('')
    setNotice(result)
  }

  return (
    <section>
      <span className="eyebrow">Glossary</span>
      <p className="hint">Jargon, product names, acronyms — these also boost transcription.</p>
      <div className="row glossary-add">
        <textarea
          rows={2}
          placeholder="Add term…"
          value={newTerm}
          onChange={(e) => setNewTerm(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              void addTerm()
            }
          }}
        />
        <button className="btn btn-sm" onClick={() => void addTerm()} disabled={!newTerm.trim()}>
          Add
        </button>
      </div>
      {notice && <p className="hint glossary-notice">{notice}</p>}
      <div className="term-list">
        {glossary.terms.map((t) => (
          <span key={t.id} className="chip">
            {t.term}
            <button
              className="x"
              aria-label={`Remove ${t.term}`}
              onClick={() => glossary.remove(t.id)}
            >
              ×
            </button>
          </span>
        ))}
      </div>
    </section>
  )
}
