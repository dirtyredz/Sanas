import type { ApplicationSummary, ValueSource } from '@shared/jobs/applications'

// How each listed application presents in the picker: its action, badge and hint. Pure.

export type RowAction = 'preview' | 'open' | 'none'
export type BadgeTone = 'ok' | 'warn' | 'accent' | 'neutral'

export interface RowView {
  action: RowAction
  label: string
  badges: { label: string; tone: BadgeTone }[]
  hint: string | null
}

export function rowView(row: ApplicationSummary): RowView {
  const badges: RowView['badges'] = []
  if (row.archived) badges.push({ label: 'Archived', tone: 'neutral' })
  switch (row.status) {
    case 'new':
      return { action: 'preview', label: 'Preview and create', badges, hint: null }
    case 'closed-unlinked':
      return {
        action: 'none',
        label: 'Closed',
        badges: [{ label: 'Closed', tone: 'neutral' }],
        hint: 'Closed applications cannot create a new job.',
      }
    case 'imported':
      return {
        action: 'open',
        label: 'Open job',
        badges: [{ label: 'Imported', tone: 'ok' }, ...badges],
        hint: null,
      }
    case 'refresh-available':
      return {
        action: 'preview',
        label: 'Review changes',
        badges: [{ label: 'Refresh available', tone: 'accent' }, ...badges],
        hint: null,
      }
    case 'archive-available':
      return {
        action: 'preview',
        label: 'Review and archive',
        badges: [{ label: 'Closed', tone: 'warn' }, ...badges],
        hint: 'The application is closed. You can archive its job; nothing is deleted.',
      }
    case 'source-mismatch':
      return {
        action: 'open',
        label: 'Open job',
        badges: [{ label: 'Other resumes folder', tone: 'warn' }, ...badges],
        hint: 'Imported from a different resumes folder; switch back to refresh it.',
      }
    case 'invalid':
      return {
        action: 'none',
        label: 'Invalid',
        badges: [{ label: 'Invalid', tone: 'warn' }],
        hint: `${row.error ?? 'Invalid pack.'}${row.retryable ? ' Refresh to try again.' : ''}`,
      }
  }
}

/** The label shown beside a proposed value. */
export function sourceLabel(source: ValueSource | null): string | null {
  if (source === 'drafted') return 'Drafted by Sanas'
  if (source === 'resumes') return 'From resumes'
  return null
}

export function formatUpdated(updatedAt: string | null): string {
  if (!updatedAt) return 'Unknown'
  const at = new Date(updatedAt)
  return Number.isNaN(at.getTime()) ? 'Unknown' : at.toLocaleString()
}
