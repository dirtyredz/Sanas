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
  listGlossary: () => [],
}))
vi.mock('../../../db/repos/suggestion-grounding', () => ({ saveGrounding: () => 1 }))
vi.mock('../../../db/repos/meeting-resume', () => ({ getMeetingResume: () => null }))
import { MeetingPrompts } from './meeting-prompts'
it.each([false, true])(
  'keeps candidate biography when deck active = %s; missing facts get marked filler',
  (deck) => {
    const context = {
      meetingId: 1,
      revision: 0,
      initialSlides: [],
      deckVersion: 0,
      text: '',
      slides: deck ? [{ title: 'Deck', talkingPoint: '', script: '', keyFacts: '' }] : [],
    }
    data.notes = 'Synthetic candidate: personally operated about five subgraphs at ExampleCo.'
    const prompts = new MeetingPrompts()
    prompts.begin(1, context)
    expect(prompts.snapshot().system).toContain(data.notes)
    expect(prompts.snapshot().system.includes('OPTIONAL_PRIORITY')).toBe(!deck)
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
