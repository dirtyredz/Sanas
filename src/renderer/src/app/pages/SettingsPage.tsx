import { useEffect, useState } from 'react'
import type { Settings, SettingsView } from '@shared/types'

export function SettingsPage(): React.JSX.Element {
  const [view, setView] = useState<SettingsView | null>(null)
  const [deepgramKey, setDeepgramKey] = useState('')
  const [anthropicKey, setAnthropicKey] = useState('')
  const [smtpPass, setSmtpPass] = useState('')
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
    const patch: Partial<Settings> = {
      overlayHotkey: view.overlayHotkey,
      assistHotkey: view.assistHotkey,
      anthropicWorkspaceId: view.anthropicWorkspaceId.trim(),
      audioDeviceId: view.audioDeviceId,
      recordAudio: view.recordAudio,
      captureSystemAudio: view.captureSystemAudio,
      overlayOpacity: view.overlayOpacity,
      summaryEmailAuto: view.summaryEmailAuto,
      smtpHost: view.smtpHost.trim(),
      smtpPort: view.smtpPort,
      smtpUser: view.smtpUser.trim(),
    }
    // Only send secrets the user actually typed — empty means "keep existing".
    if (deepgramKey) patch.deepgramApiKey = deepgramKey
    if (anthropicKey) patch.anthropicApiKey = anthropicKey
    if (smtpPass) patch.smtpPass = smtpPass
    const next = await window.sanas.settings.set(patch)
    setView(next)
    setDeepgramKey('')
    setAnthropicKey('')
    setSmtpPass('')
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="settings">
      <h2>Settings</h2>

      <label>
        Deepgram API key{' '}
        {view.deepgramKeySet ? (
          <span className="ok">✓ set</span>
        ) : (
          <span className="warn">not set</span>
        )}
        <input
          type="password"
          placeholder={view.deepgramKeySet ? '•••••••• (leave blank to keep)' : 'dg_…'}
          value={deepgramKey}
          onChange={(e) => setDeepgramKey(e.target.value)}
        />
      </label>

      <label>
        Anthropic API key{' '}
        {view.anthropicKeySet ? (
          <span className="ok">✓ set</span>
        ) : (
          <span className="warn">not set</span>
        )}
        <input
          type="password"
          placeholder={view.anthropicKeySet ? '•••••••• (leave blank to keep)' : 'sk-ant-…'}
          value={anthropicKey}
          onChange={(e) => setAnthropicKey(e.target.value)}
        />
      </label>

      <label>
        Anthropic workspace ID (optional)
        <input
          type="text"
          placeholder="wrkspc_…"
          value={view.anthropicWorkspaceId}
          onChange={(e) => setView({ ...view, anthropicWorkspaceId: e.target.value })}
        />
        <small>
          Only for org-level keys ("not scoped to a workspace" error). Leave blank for a key created
          inside a workspace.
        </small>
      </label>

      <label>
        Overlay hotkey
        <input
          type="text"
          value={view.overlayHotkey}
          onChange={(e) => setView({ ...view, overlayHotkey: e.target.value })}
        />
        <small>
          Electron accelerator format, e.g. CommandOrControl+Shift+Space. Takes effect on restart.
        </small>
      </label>

      <label>
        Assist hotkey ("answer now")
        <input
          type="text"
          value={view.assistHotkey}
          onChange={(e) => setView({ ...view, assistHotkey: e.target.value })}
        />
        <small>Pops the overlay and streams a full answer. Takes effect on restart.</small>
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

      <label className="check">
        <input
          type="checkbox"
          checked={view.captureSystemAudio}
          onChange={(e) => setView({ ...view, captureSystemAudio: e.target.checked })}
        />
        Capture system audio (meetings on this PC — hears the other side digitally)
      </label>

      <label className="check">
        <input
          type="checkbox"
          checked={view.recordAudio}
          onChange={(e) => setView({ ...view, recordAudio: e.target.checked })}
        />
        Save meeting audio to disk (WAV, local only)
      </label>

      <label>
        Overlay opacity ({Math.round(view.overlayOpacity * 100)}%)
        <input
          type="range"
          min="0.4"
          max="1"
          step="0.05"
          value={view.overlayOpacity}
          onChange={(e) => setView({ ...view, overlayOpacity: Number(e.target.value) })}
        />
        <small>Applies when you hit Save.</small>
      </label>

      <h3>Summary email</h3>
      <small>
        Each job has its own recipient address (set it on the job page). The SMTP account below is
        what Sanas sends from.
      </small>

      <label className="check">
        <input
          type="checkbox"
          checked={view.summaryEmailAuto}
          onChange={(e) => setView({ ...view, summaryEmailAuto: e.target.checked })}
        />
        Email the summary automatically when a meeting stops (jobs with an address only)
      </label>

      <label>
        SMTP server
        <input
          type="text"
          placeholder="smtp.gmail.com"
          value={view.smtpHost}
          onChange={(e) => setView({ ...view, smtpHost: e.target.value })}
        />
      </label>

      <label>
        SMTP port
        <input
          type="number"
          value={view.smtpPort}
          onChange={(e) => setView({ ...view, smtpPort: Number(e.target.value) || 465 })}
        />
        <small>465 (TLS) or 587 (STARTTLS).</small>
      </label>

      <label>
        SMTP login (also the From address)
        <input
          type="text"
          placeholder="you@gmail.com"
          value={view.smtpUser}
          onChange={(e) => setView({ ...view, smtpUser: e.target.value })}
        />
      </label>

      <label>
        SMTP password{' '}
        {view.smtpPassSet ? (
          <span className="ok">✓ set</span>
        ) : (
          <span className="warn">not set</span>
        )}
        <input
          type="password"
          placeholder={view.smtpPassSet ? '•••••••• (leave blank to keep)' : 'app password'}
          value={smtpPass}
          onChange={(e) => setSmtpPass(e.target.value)}
        />
        <small>For Gmail, use an App Password (needs 2-step verification), not your login.</small>
      </label>

      <button onClick={save}>Save</button>
      {saved && <span className="ok"> Saved ✓</span>}
    </div>
  )
}
