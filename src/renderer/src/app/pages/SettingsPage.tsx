import { useEffect, useState } from 'react'
import type { SettingsView } from '@shared/types'

export function SettingsPage(): React.JSX.Element {
  const [view, setView] = useState<SettingsView | null>(null)
  const [deepgramKey, setDeepgramKey] = useState('')
  const [anthropicKey, setAnthropicKey] = useState('')
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([])
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    window.sanas.settings.get().then(setView)
    navigator.mediaDevices
      .enumerateDevices()
      .then((all) => setDevices(all.filter((d) => d.kind === 'audioinput')))
      .catch(() => setDevices([]))
  }, [])

  if (!view) return <p>Loading…</p>

  const save = async (): Promise<void> => {
    const patch: Record<string, string> = {
      overlayHotkey: view.overlayHotkey,
      audioDeviceId: view.audioDeviceId
    }
    // Only send keys the user actually typed — empty means "keep existing".
    if (deepgramKey) patch.deepgramApiKey = deepgramKey
    if (anthropicKey) patch.anthropicApiKey = anthropicKey
    const next = await window.sanas.settings.set(patch)
    setView(next)
    setDeepgramKey('')
    setAnthropicKey('')
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="settings">
      <h2>Settings</h2>

      <label>
        Deepgram API key {view.deepgramKeySet ? <span className="ok">✓ set</span> : <span className="warn">not set</span>}
        <input
          type="password"
          placeholder={view.deepgramKeySet ? '•••••••• (leave blank to keep)' : 'dg_…'}
          value={deepgramKey}
          onChange={(e) => setDeepgramKey(e.target.value)}
        />
      </label>

      <label>
        Anthropic API key {view.anthropicKeySet ? <span className="ok">✓ set</span> : <span className="warn">not set</span>}
        <input
          type="password"
          placeholder={view.anthropicKeySet ? '•••••••• (leave blank to keep)' : 'sk-ant-…'}
          value={anthropicKey}
          onChange={(e) => setAnthropicKey(e.target.value)}
        />
      </label>

      <label>
        Overlay hotkey
        <input
          type="text"
          value={view.overlayHotkey}
          onChange={(e) => setView({ ...view, overlayHotkey: e.target.value })}
        />
        <small>Electron accelerator format, e.g. CommandOrControl+Shift+Space. Takes effect on restart.</small>
      </label>

      <label>
        Microphone
        <select
          value={view.audioDeviceId}
          onChange={(e) => setView({ ...view, audioDeviceId: e.target.value })}
        >
          <option value="">System default</option>
          {devices.map((d) => (
            <option key={d.deviceId} value={d.deviceId}>
              {d.label || `Mic ${d.deviceId.slice(0, 6)}`}
            </option>
          ))}
        </select>
      </label>

      <button onClick={save}>Save</button>
      {saved && <span className="ok"> Saved ✓</span>}
    </div>
  )
}
