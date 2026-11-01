import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { sampleSettings } from '../../../dev/mock-fixtures'
import { AppHeader } from '../../shell/AppHeader'
import { ApiKeysSection } from '../sections/ApiKeysSection'
import { AssistantSection } from '../sections/AssistantSection'
import { EmailSection } from '../sections/EmailSection'
import { HotkeysSection } from '../sections/HotkeysSection'
import { MicrophoneSection } from '../sections/MicrophoneSection'
import { OverlaySection } from '../sections/OverlaySection'
import { RetentionSection } from '../sections/RetentionSection'
import { UpdatesSection } from '../sections/UpdatesSection'
import { NO_SECRETS } from './settings-draft'
import { SettingsNav } from './SettingsNav'
import { SettingsSaveBar } from './SettingsSaveBar'
import { SETTINGS_SECTIONS } from './settings-sections'

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
      <ApiKeysSection view={view} secrets={NO_SECRETS} onChange={noop} onSecret={noop} />
      <AssistantSection view={{ ...view, nudgeModel: 'my-model' }} problems={[]} onChange={noop} />
      <HotkeysSection view={view} onChange={noop} />
      <MicrophoneSection view={view} onChange={noop} />
      <OverlaySection view={view} onChange={noop} />
      <EmailSection view={view} secrets={NO_SECRETS} onChange={noop} onSecret={noop} />
      <RetentionSection view={view} savedAt={0} onChange={noop} />
      <UpdatesSection />
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

  it('renders one card per indexed section, in index order', () => {
    const anchors = [...html.matchAll(/<section id="settings-([a-z-]+)"/g)].map((m) => m[1])
    expect(anchors).toEqual(SETTINGS_SECTIONS.map((s) => s.id))
  })

  it('flags a missing key in the index and on the field', () => {
    expect(html).toContain('aria-label="needs attention"')
    expect(html).toContain('Not set')
  })
})
