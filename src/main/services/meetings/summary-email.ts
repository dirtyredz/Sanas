import { loadSettings } from '../../config/settings'
import { getMeeting } from '../../db/repos/meetings'
import { getJob } from '../../db/repos/jobs'
import { emailProvider, type OutgoingEmail } from '../email'

// Composes the summary email for one meeting and hands it to the mail seam.
// Body = summary + action items only; the full transcript stays local (export
// covers that deliberately — see DECISIONS.md).

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** Renders a "- item" list as <ul>; any other text as paragraphs. */
function htmlBlock(text: string): string {
  const lines = text.split('\n').filter((l) => l.trim())
  if (lines.length > 0 && lines.every((l) => /^\s*[-*•]\s+/.test(l))) {
    return `<ul>${lines.map((l) => `<li>${escapeHtml(l.replace(/^\s*[-*•]\s+/, ''))}</li>`).join('')}</ul>`
  }
  return lines.map((l) => `<p>${escapeHtml(l)}</p>`).join('')
}

/** Recipient comes from the meeting's job — each client/job has its own address. */
export function composeSummaryEmail(
  meetingId: number,
): { ok: true; mail: OutgoingEmail } | { ok: false; reason: string } {
  const meeting = getMeeting(meetingId)
  if (!meeting) return { ok: false, reason: 'Meeting not found.' }
  if (!meeting.summary) return { ok: false, reason: 'No summary yet — generate one first.' }
  const job = getJob(meeting.jobId)
  const jobName = job?.name ?? 'Unsorted'
  const to = job?.summaryEmail.trim() ?? ''
  if (!to) {
    return { ok: false, reason: `No summary email set for job "${jobName}" — add one on the job.` }
  }
  const actions = meeting.actionItems?.trim() || '- none'

  const subject = `Meeting summary: ${meeting.title} (${jobName})`
  const text = [
    meeting.title,
    `Job: ${jobName}`,
    `Started: ${meeting.startedAt}${meeting.endedAt ? `  Ended: ${meeting.endedAt}` : ''}`,
    '',
    'SUMMARY',
    meeting.summary,
    '',
    'ACTION ITEMS',
    actions,
    '',
    '— Sent by Sanas',
  ].join('\n')
  const html = [
    `<h2>${escapeHtml(meeting.title)}</h2>`,
    `<p><b>Job:</b> ${escapeHtml(jobName)}<br><b>Started:</b> ${escapeHtml(meeting.startedAt)}`,
    meeting.endedAt ? `<br><b>Ended:</b> ${escapeHtml(meeting.endedAt)}</p>` : '</p>',
    '<h3>Summary</h3>',
    htmlBlock(meeting.summary),
    '<h3>Action items</h3>',
    htmlBlock(actions),
    '<p style="color:#888;font-size:12px">Sent by Sanas</p>',
  ].join('')
  return { ok: true, mail: { to, subject, text, html } }
}

/** Emails the stored summary to the job's address. Throws a readable Error
 *  when nothing can be sent (no recipient on the job, no summary, transport failure). */
export async function emailMeetingSummary(meetingId: number): Promise<string> {
  const composed = composeSummaryEmail(meetingId)
  if (!composed.ok) throw new Error(composed.reason)
  const s = loadSettings()
  await emailProvider.send(
    { host: s.smtpHost, port: s.smtpPort, user: s.smtpUser, pass: s.smtpPass },
    composed.mail,
  )
  return composed.mail.to
}

/** Post-stop hook: sends only when auto-email is on and the job has an address.
 *  Never throws — a failed auto-send is logged, not surfaced (nobody is waiting). */
export async function autoEmailSummary(meetingId: number): Promise<void> {
  if (!loadSettings().summaryEmailAuto) return
  const jobId = getMeeting(meetingId)?.jobId
  if (jobId === undefined || !getJob(jobId)?.summaryEmail.trim()) return // job opted out
  try {
    await emailMeetingSummary(meetingId)
  } catch (e) {
    console.warn('[sanas] auto summary email failed:', e)
  }
}
