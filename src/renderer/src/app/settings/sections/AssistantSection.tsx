import { useEffect, useId, useState } from 'react'
import type { SettingsView } from '@shared/types'
import { FieldRow } from '../../controls/FieldRow'
import { Switch } from '../../controls/Switch'
import { SettingsSection } from '../frame/SettingsSection'
import { problemFor, type SettingsProblem } from '../frame/settings-draft'

const MODELS = ['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5'] as const

function isListedModel(model: string): boolean {
  return MODELS.some((choice) => choice === model)
}

function ModelField({
  label,
  help,
  model,
  error,
  onChange,
}: {
  label: string
  help: string
  model: string
  error?: string
  onChange: (model: string) => void
}): React.JSX.Element {
  const [custom, setCustom] = useState(!isListedModel(model))
  const id = useId()

  useEffect(() => {
    if (isListedModel(model)) setCustom(false)
  }, [model])

  return (
    <FieldRow label={label} help={help} error={error} controlId={id}>
      <select
        id={id}
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
          className="mono"
          placeholder="Claude model ID"
          aria-label={`${label} custom model ID`}
          aria-invalid={error ? true : undefined}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </FieldRow>
  )
}

export function AssistantSection({
  view,
  problems,
  onChange,
}: {
  view: SettingsView
  problems: readonly SettingsProblem[]
  onChange: (patch: Partial<SettingsView>) => void
}): React.JSX.Element {
  return (
    <SettingsSection
      id="assistant"
      description="A fast model for ambient nudges, a small fast model to decide which finished turns need an answer, and a deeper model for requested answers and meeting follow-up."
    >
      <ModelField
        label="Ambient nudge model"
        help="Short suggestions while the meeting runs."
        model={view.nudgeModel}
        error={problemFor(problems, 'nudgeModel')}
        onChange={(nudgeModel) => onChange({ nudgeModel })}
      />
      <ModelField
        label="Full answer model"
        help="Answer now, summaries and Ask."
        model={view.answerModel}
        error={problemFor(problems, 'answerModel')}
        onChange={(answerModel) => onChange({ answerModel })}
      />
      <ModelField
        label="Question detection model"
        help="Decides which finished turns need an answer."
        model={view.classifierModel}
        error={problemFor(problems, 'classifierModel')}
        onChange={(classifierModel) => onChange({ classifierModel })}
      />
      <FieldRow
        label="Whisper mode"
        help="Answer now always gives the full answer, including code when useful."
      >
        <select
          value={view.whisperMode}
          onChange={(e) => onChange({ whisperMode: e.target.value as SettingsView['whisperMode'] })}
        >
          <option value="smart">Smart — answer concrete asks, coach the rest</option>
          <option value="full">Full — answer every key moment</option>
          <option value="points">Points — keep ambient help brief</option>
        </select>
      </FieldRow>
      <FieldRow
        label="Next point while I'm talking"
        help="While you explain something, suggest one grounded next point. Uses the ambient nudge model; at most one every 30 seconds."
      >
        <Switch
          checked={view.coachWhileTalking}
          onChange={(coachWhileTalking) => onChange({ coachWhileTalking })}
        />
      </FieldRow>
      <FieldRow
        label="Answer every question by default"
        help="New meetings start with the overlay's Answer every question on, including questions put to someone else."
      >
        <Switch
          checked={view.answerEveryQuestion}
          onChange={(answerEveryQuestion) => onChange({ answerEveryQuestion })}
        />
      </FieldRow>
      <FieldRow
        label="Answer cooldown"
        help="Seconds between automatic answers to the room (0–60). 0 means no cooldown."
        error={problemFor(problems, 'nudgeCooldownSec')}
      >
        <input
          type="number"
          className="input-number"
          min={0}
          max={60}
          step={1}
          value={view.nudgeCooldownSec}
          onChange={(e) => onChange({ nudgeCooldownSec: Number(e.target.value) })}
        />
      </FieldRow>
    </SettingsSection>
  )
}
