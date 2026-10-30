import { useEffect, useState } from 'react'
import type { SettingsView } from '@shared/types'
import { SettingsSection } from './SettingsSection'

const MODELS = ['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5'] as const

function isListedModel(model: string): boolean {
  return MODELS.some((choice) => choice === model)
}

function ModelField({
  label,
  model,
  onChange,
}: {
  label: string
  model: string
  onChange: (model: string) => void
}): React.JSX.Element {
  const [custom, setCustom] = useState(!isListedModel(model))

  useEffect(() => {
    if (isListedModel(model)) setCustom(false)
  }, [model])

  return (
    <label className="field">
      <span className="label">{label}</span>
      <select
        value={custom ? 'custom' : model}
        onChange={(e) => {
          if (e.target.value === 'custom') {
            setCustom(true)
            onChange('')
          } else {
            setCustom(false)
            onChange(e.target.value)
          }
        }}
      >
        {MODELS.map((choice) => (
          <option key={choice} value={choice}>
            {choice}
          </option>
        ))}
        <option value="custom">Custom…</option>
      </select>
      {custom && (
        <input
          value={model}
          maxLength={200}
          placeholder="Claude model ID"
          aria-label={`${label} custom model ID`}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </label>
  )
}

export function AssistantSection({
  view,
  onChange,
}: {
  view: SettingsView
  onChange: (patch: Partial<SettingsView>) => void
}): React.JSX.Element {
  return (
    <SettingsSection
      title="Assistant"
      description="Use a fast model for ambient nudges, a small fast model to decide which finished turns need an answer, and a deeper model for requested answers and meeting follow-up."
    >
      <ModelField
        label="Ambient nudge model"
        model={view.nudgeModel}
        onChange={(nudgeModel) => onChange({ nudgeModel })}
      />
      <ModelField
        label="Full answer model"
        model={view.answerModel}
        onChange={(answerModel) => onChange({ answerModel })}
      />
      <ModelField
        label="Question detection model"
        model={view.classifierModel}
        onChange={(classifierModel) => onChange({ classifierModel })}
      />
      <label className="field">
        <span className="label">Whisper mode</span>
        <select
          value={view.whisperMode}
          onChange={(e) => onChange({ whisperMode: e.target.value as SettingsView['whisperMode'] })}
        >
          <option value="smart">Smart — answer concrete asks, coach the rest</option>
          <option value="full">Full — answer every key moment</option>
          <option value="points">Points — keep ambient help brief</option>
        </select>
        <small>Answer now always gives the full answer, including code when useful.</small>
      </label>
      <label className="check">
        <input
          type="checkbox"
          checked={view.coachWhileTalking}
          onChange={(e) => onChange({ coachWhileTalking: e.target.checked })}
        />
        <span>
          Next point while I&apos;m talking
          <br />
          <small className="hint">
            While you explain something, suggest one grounded next point. Uses the ambient nudge
            model; at most one every 30 seconds.
          </small>
        </span>
      </label>
      <label className="field">
        <span className="label">Answer cooldown</span>
        <input
          type="number"
          min={0}
          max={60}
          step={1}
          value={view.nudgeCooldownSec}
          onChange={(e) => onChange({ nudgeCooldownSec: Number(e.target.value) })}
        />
        <small>
          Seconds between automatic answers to the room (0–60). Set to 0 for no cooldown.
        </small>
      </label>
      <label className="field">
        <span>
          <input
            type="checkbox"
            checked={view.answerEveryQuestion}
            onChange={(e) => onChange({ answerEveryQuestion: e.target.checked })}
          />{' '}
          Answer every question by default
        </span>
      </label>
    </SettingsSection>
  )
}
