import { describe, expect, it } from 'vitest'
import {
  TOLD_STORIES,
  rememberStory,
  storyOf,
  tellsStory,
  toldStoriesBlock,
  type ToldStory,
} from './told-stories'

describe('told stories', () => {
  it('keeps the headline and the first supporting prose line, skipping code', () => {
    expect(
      storyOf(
        '**At ⟨Acme⟩ I ran the federation.**\n```ts\nconst a = 1\n```\n- **Invoicing** subgraph was mine.\nMore.',
      ),
    ).toEqual({ headline: 'At Acme I ran the federation.', detail: 'Invoicing subgraph was mine.' })
    expect(storyOf('**Just a headline.**')).toEqual({ headline: 'Just a headline.', detail: '' })
  })

  it(`keeps the last ${TOLD_STORIES}`, () => {
    const told: ToldStory[] = []
    for (let i = 0; i < 8; i++) rememberStory(told, `**Story ${i}**\nline ${i}`)
    expect(told).toHaveLength(TOLD_STORIES)
    expect(told[0]).toEqual({ headline: 'Story 2', detail: 'line 2' })
    rememberStory(told, '   ')
    expect(told).toHaveLength(TOLD_STORIES)
  })

  it('says do not re-tell, and offers the no-op only to automatic answers', () => {
    const told = [{ headline: 'At Acme I ran the federation.', detail: 'Invoicing was mine.' }]
    const auto = toldStoriesBlock(told, true)
    expect(auto).toContain('- At Acme I ran the federation. / Invoicing was mine.')
    expect(auto).toContain('Do not re-tell these stories')
    expect(auto).toContain('refer\nback to it in one short clause')
    expect(auto).toContain('output exactly <none>')
    const requested = toldStoriesBlock(told, false)
    expect(requested).not.toContain('<none>')
    expect(requested).toContain('You must still answer the current question.')
    expect(toldStoriesBlock([], true)).toContain('(none yet)')
  })

  it('remembers answers from automatic, Answer now, More detail and typed lanes only', () => {
    expect(tellsStory('answer')).toBe(true) // automatic and Answer now carry no manual kind
    expect(tellsStory('answer', null)).toBe(true)
    expect(tellsStory('answer', 'detail')).toBe(true)
    expect(tellsStory('answer', 'typed')).toBe(true)
    expect(tellsStory('answer', 'audience')).toBe(false)
    expect(tellsStory('answer', 'capture')).toBe(false)
    expect(tellsStory('next-point')).toBe(false)
  })
})
