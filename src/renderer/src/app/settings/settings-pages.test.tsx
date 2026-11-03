import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { SettingsView } from '@shared/types'
import { sampleSettings } from '../../dev/mock-fixtures'
import { NO_SECRETS } from './frame/settings-draft'
import { SettingsNav } from './frame/SettingsNav'
import { SettingsPane } from './frame/SettingsPane'
import { SETTINGS_SECTIONS, type SettingsSectionId } from './frame/settings-sections'
import { INITIAL_PAGER, selectPage, type PagerState } from './frame/paging/page-order'
import { SettingsSectionPage } from './sections/SettingsSectionPage'

const noop = (): void => {}

/** What SettingsPage puts on screen for a pager state and a draft: the index and one pane. */
function renderPage(pager: PagerState, view: SettingsView): string {
  return renderToStaticMarkup(
    <>
      <SettingsNav active={pager.active} attention={new Set()} onSelect={noop} />
      <SettingsPane page={pager.active} direction={pager.direction}>
        <SettingsSectionPage
          id={pager.active}
          view={view}
          secrets={NO_SECRETS}
          problems={[]}
          savedAt={0}
          onChange={noop}
          onSecret={noop}
        />
      </SettingsPane>
    </>,
  )
}

const cards = (html: string): string[] =>
  [...html.matchAll(/<section id="settings-([a-z-]+)"/g)].map((m) => m[1])

describe('Settings shows one page at a time', () => {
  it.each(SETTINGS_SECTIONS.map((s) => s.id))('shows only the %s card when selected', (id) => {
    const html = renderPage(selectPage(INITIAL_PAGER, id as SettingsSectionId), sampleSettings)
    expect(cards(html)).toEqual([id])
    expect(html).toContain(`data-page="${id}"`)
  })

  it('marks the shown page in the index and nothing else', () => {
    const html = renderPage(selectPage(INITIAL_PAGER, 'email'), sampleSettings)
    const current = [...html.matchAll(/data-section="([a-z-]+)"[^>]*aria-current="page"/g)]
    expect(current.map((m) => m[1])).toEqual(['email'])
  })

  it('animates the entrance in the direction of travel, and not on first open', () => {
    expect(renderPage(INITIAL_PAGER, sampleSettings)).toContain('settings-pane--none')
    const down = selectPage(INITIAL_PAGER, 'retention')
    expect(renderPage(down, sampleSettings)).toContain('settings-pane--forward')
    expect(renderPage(selectPage(down, 'hotkeys'), sampleSettings)).toContain('settings-pane--back')
  })

  // The draft lives in useSettingsDraft above the pager; a page only reads it. An unsaved edit
  // on Assistant is still there after visiting another page and coming back.
  it('keeps an unsaved edit across a page switch', () => {
    const draft: SettingsView = { ...sampleSettings, nudgeModel: 'unsaved-model-id' }
    let pager = selectPage(INITIAL_PAGER, 'assistant')
    expect(renderPage(pager, draft)).toContain('value="unsaved-model-id"')
    pager = selectPage(pager, 'overlay')
    expect(renderPage(pager, draft)).not.toContain('unsaved-model-id')
    pager = selectPage(pager, 'assistant')
    expect(renderPage(pager, draft)).toContain('value="unsaved-model-id"')
  })
})

it('shows profile guidance and retains the shared draft across Settings pages', () => {
  const draft = { ...sampleSettings, interviewProfile: 'My saved story' }
  const profile = selectPage(INITIAL_PAGER, 'interview-profile')
  const html = renderPage(profile, draft)
  for (const heading of [
    'About me',
    'Go-to stories',
    'Strengths and weaknesses',
    'Why I',
    'Rate and availability',
    'Anything else',
  ])
    expect(html).toContain(heading)
  expect(html).toContain('My saved story')
  expect(renderPage(selectPage(profile, 'assistant'), draft)).not.toContain('My saved story')
  expect(renderPage(profile, draft)).toContain('My saved story')
})
