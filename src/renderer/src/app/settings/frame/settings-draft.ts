import { SETTINGS_LIMITS } from '@shared/settings-limits'
import type { Settings, SettingsView } from '@shared/types'
import type { SettingsSectionId } from './settings-sections'

/** Keys of Settings the renderer never sees in the clear; typed into fields, sent once. */
export type SecretKey = 'deepgramApiKey' | 'anthropicApiKey' | 'smtpPass'

export const NO_SECRETS: Readonly<Record<SecretKey, string>> = {
  deepgramApiKey: '',
  anthropicApiKey: '',
  smtpPass: '',
}

/** Settings the Settings page edits and Save sends. */
export const PAGE_OWNED = [
  'overlayHotkey',
  'assistHotkey',
  'captureHotkey',
  'composeHotkey',
  'presentationPrevHotkey',
  'presentationNextHotkey',
  'anthropicWorkspaceId',
  'nudgeModel',
  'answerModel',
  'classifierModel',
  'coachWhileTalking',
  'answerEveryQuestion',
  'nudgeCooldownSec',
  'whisperMode',
  'audioDeviceId',
  'recordAudio',
  'overlayOpacity',
  'summaryEmailAuto',
  'smtpHost',
  'smtpPort',
  'smtpUser',
  'audioRetentionDays',
  'meetingRetentionDays',
] as const satisfies readonly (keyof SettingsView & keyof Settings)[]

/** Settings other surfaces write (the overlay's window state, the Live page's source) or that
 *  travel as typed secrets; Save must never send a stale copy of them. */
export const NOT_PAGE_OWNED = [
  'overlayBounds',
  'overlayWhisperRatio',
  'meetingSource',
  'deepgramApiKey',
  'anthropicApiKey',
  'smtpPass',
] as const satisfies readonly (keyof Settings)[]

// Compile-time: together the two lists cover every Settings key, so a new setting must be
// classified here before the project builds (and so cannot be silently left out of Save).
type Unclassified = Exclude<
  keyof Settings,
  (typeof PAGE_OWNED)[number] | (typeof NOT_PAGE_OWNED)[number]
>
const everyKeyClassified: [Unclassified] extends [never] ? true : never = true
void everyKeyClassified

/** Free-text settings the schema expects clean; trimmed on the way out. */
const TRIMMED = new Set<string>([
  'anthropicWorkspaceId',
  'nudgeModel',
  'answerModel',
  'classifierModel',
  'smtpHost',
  'smtpUser',
])

/** What Save sends: every page-owned setting (see TRIMMED), plus only the secrets the user
 *  actually typed — blank means "keep". */
export function settingsPatch(
  view: SettingsView,
  secrets: Readonly<Record<SecretKey, string>>,
): Partial<Settings> {
  const patch: Record<string, unknown> = {}
  for (const key of PAGE_OWNED) {
    const value = view[key]
    patch[key] = TRIMMED.has(key) && typeof value === 'string' ? value.trim() : value
  }
  for (const key of Object.keys(secrets) as SecretKey[]) {
    if (secrets[key]) patch[key] = secrets[key]
  }
  return patch as Partial<Settings>
}

/** True when Save would change something: an edited setting or a typed secret. */
export function hasUnsavedChanges(
  view: SettingsView,
  saved: SettingsView,
  secrets: Readonly<Record<SecretKey, string>>,
): boolean {
  if (Object.values(secrets).some(Boolean)) return true
  const draft = settingsPatch(view, NO_SECRETS)
  const stored = settingsPatch(saved, NO_SECRETS)
  return (Object.keys(draft) as (keyof Settings)[]).some((key) => draft[key] !== stored[key])
}

export interface SettingsProblem {
  key: keyof Settings
  section: SettingsSectionId
  message: string
}

/** Values the main process would silently drop (see config/settings-schema.ts). Shown beside
 *  the field, and Save waits until they are fixed rather than half-saving the page. */
export function settingsProblems(view: SettingsView): SettingsProblem[] {
  const problems: SettingsProblem[] = []
  const models = [
    ['nudgeModel', view.nudgeModel],
    ['answerModel', view.answerModel],
    ['classifierModel', view.classifierModel],
  ] as const
  for (const [key, model] of models) {
    if (model.trim() === '') {
      problems.push({ key, section: 'assistant', message: 'Enter a Claude model ID.' })
    } else if (model.trim().length > SETTINGS_LIMITS.modelId.maxLength) {
      problems.push({
        key,
        section: 'assistant',
        message: `Use a model ID of ${SETTINGS_LIMITS.modelId.maxLength} characters or fewer.`,
      })
    }
  }
  const cooldown = view.nudgeCooldownSec
  const limit = SETTINGS_LIMITS.nudgeCooldownSec
  if (!Number.isFinite(cooldown) || cooldown < limit.min || cooldown > limit.max) {
    problems.push({
      key: 'nudgeCooldownSec',
      section: 'assistant',
      message: `Use a number of seconds from ${limit.min} to ${limit.max}.`,
    })
  }
  return problems
}

export function problemFor(
  problems: readonly SettingsProblem[],
  key: keyof Settings,
): string | undefined {
  return problems.find((p) => p.key === key)?.message
}
