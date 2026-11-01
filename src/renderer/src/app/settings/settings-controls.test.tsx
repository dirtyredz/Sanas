import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { sampleSettings } from '../../dev/mock-fixtures'
import { AppHeader } from '../shell/AppHeader'
import { NO_SECRETS } from './frame/settings-draft'
import { SettingsNav } from './frame/SettingsNav'
import { SettingsSaveBar } from './frame/SettingsSaveBar'
import { SETTINGS_SECTIONS } from './frame/settings-sections'
import { SettingsSections } from './SettingsSections'

const noop = (): void => {}
const view = { ...sampleSettings, deepgramKeySet: false }

/** Every part of the Settings page and the app header, rendered once. */
function renderAll(): string {
  return renderToStaticMarkup(
    <div className="app">
      <AppHeader
        page="settings"
        onNavigate={noop}
        meeting={{ status: 'live' }}
        overlayHotkey="Ctrl+Shift+Space"
        onToggleOverlay={noop}
      />
      <SettingsNav active="assistant" attention={new Set(['api-keys'])} onJump={noop} />
      <SettingsSections
        view={{ ...view, nudgeModel: 'my-model' }}
        secrets={NO_SECRETS}
        problems={[]}
        savedAt={0}
        onChange={noop}
        onSecret={noop}
      />
      <SettingsSaveBar
        dirty
        problemCount={0}
        save={{ kind: 'idle' }}
        onSave={noop}
        onDiscard={noop}
      />
    </div>,
  )
}

function tags(html: string, name: string): string[] {
  return html.match(new RegExp(`<${name}\\b[^>]*>`, 'g')) ?? []
}

describe('Settings and the app header use the library controls', () => {
  const html = renderAll()

  it('draws every on/off setting as a switch, never a bare checkbox', () => {
    const checkboxes = tags(html, 'input').filter((t) => t.includes('type="checkbox"'))
    expect(checkboxes.length).toBe(4)
    for (const box of checkboxes) expect(box).toContain('role="switch"')
  })

  it('gives every button a styled vocabulary', () => {
    const styled = /class="[^"]*\b(btn|app-nav-item|meeting-pill|settings-nav-item)\b/
    for (const button of tags(html, 'button')) expect(button).toMatch(styled)
  })

  it('labels every field through a FieldRow (or an explicit aria-label)', () => {
    const controls = [...tags(html, 'input'), ...tags(html, 'select')]
    expect(controls.length).toBeGreaterThan(15)
    for (const control of controls) {
      const id = control.match(/\bid="([^"]+)"/)?.[1]
      const labelled =
        control.includes('aria-label=') || (id !== undefined && html.includes(`for="${id}"`))
      expect(labelled, control).toBe(true)
    }
  })

  it('renders one card per indexed section, in index order (as SettingsSections renders them)', () => {
    const anchors = [...html.matchAll(/<section id="settings-([a-z-]+)"/g)].map((m) => m[1])
    expect(anchors).toEqual(SETTINGS_SECTIONS.map((s) => s.id))
  })

  it('flags a missing key in the index and on the field', () => {
    expect(html).toContain('aria-label="needs attention"')
    expect(html).toContain('Not set')
  })
})
