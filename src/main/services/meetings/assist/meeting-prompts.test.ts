import { expect, it, vi } from 'vitest'
const data = vi.hoisted(() => ({ notes: '' }))
vi.mock('../../../db/repos/jobs', () => ({
  getJob: () => ({
    name: 'Interview',
    companyInfo: '',
    projectScope: '',
    notes: data.notes,
    talkingPoints: 'OPTIONAL_PRIORITY',
    persona: '',
  }),
}))
vi.mock('../../../db/repos/job/glossary', () => ({ listGlossary: () => [] }))
vi.mock('../../../db/repos/suggestion-grounding', () => ({ saveGrounding: () => 1 }))
vi.mock('../../../db/repos/meeting/meeting-grounding', () => ({
  getMeetingGrounding: () => ({ resume: null, interviewProfile: '', hasBiography: false }),
}))
import { MeetingPrompts } from './meeting-prompts'
it.each(['', 'Agenda: platform review'])(
  'keeps biography and job talking points with initial context %j; missing facts get marked filler',
  (text) => {
    const context = { meetingId: 1, revision: 0, text }
    data.notes = 'Synthetic candidate: personally operated about five subgraphs at ExampleCo.'
    const prompts = new MeetingPrompts()
    prompts.begin(1, context)
    expect(prompts.snapshot().system).toContain(data.notes)
    expect(prompts.snapshot().system).toContain('OPTIONAL_PRIORITY')
    expect(prompts.snapshot()).toMatchObject({ contextRevision: 0, meetingText: text })
    // context edits never change the frozen system prompt
    const system = prompts.snapshot().system
    prompts.applyContext({ ...context, revision: 1, text: 'Changed' })
    expect(prompts.snapshot()).toMatchObject({ system, contextRevision: 1, meetingText: 'Changed' })
    data.notes = ''
    prompts.begin(1, context)
    expect(prompts.snapshot().system).not.toContain('ExampleCo')
    expect(prompts.snapshot().system).toContain('Wrap every phrase that is NOT supported')
    expect(prompts.snapshot().system).toContain('Which technology did you mean?')
    expect(prompts.snapshot().system.replace(/\s+/g, ' ')).toContain(
      'Do not affirm an unresolved specific',
    )
  },
)
