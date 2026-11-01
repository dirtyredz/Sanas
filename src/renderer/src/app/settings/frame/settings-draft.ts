import type { Settings, SettingsView } from '@shared/types'
import type { SettingsSectionId } from './settings-sections'

/** Keys of Settings the renderer never sees in the clear; typed into fields, sent once. */
export type SecretKey = 'deepgramApiKey' | 'anthropicApiKey' | 'smtpPass'

export const NO_SECRETS: Readonly<Record<SecretKey, string>> = {
  deepgramApiKey: '',
  anthropicApiKey: '',
  smtpPass: '',
}

/** What Save sends: every setting the page edits (strings trimmed where the schema expects a
 *  clean value), plus only the secrets the user actually typed — blank means "keep". */
export function settingsPatch(
  view: SettingsView,
  secrets: Readonly<Record<SecretKey, string>>,
): Partial<Settings> {
  const patch: Partial<Settings> = {
    overlayHotkey: view.overlayHotkey,
    assistHotkey: view.assistHotkey,
    captureHotkey: view.captureHotkey,
    composeHotkey: view.composeHotkey,
    presentationPrevHotkey: view.presentationPrevHotkey,
    presentationNextHotkey: view.presentationNextHotkey,
    anthropicWorkspaceId: view.anthropicWorkspaceId.trim(),
    nudgeModel: view.nudgeModel.trim(),
    answerModel: view.answerModel.trim(),
    classifierModel: view.classifierModel.trim(),
    coachWhileTalking: view.coachWhileTalking,
    answerEveryQuestion: view.answerEveryQuestion,
    nudgeCooldownSec: view.nudgeCooldownSec,
    whisperMode: view.whisperMode,
    audioDeviceId: view.audioDeviceId,
    recordAudio: view.recordAudio,
    overlayOpacity: view.overlayOpacity,
    summaryEmailAuto: view.summaryEmailAuto,
    smtpHost: view.smtpHost.trim(),
    smtpPort: view.smtpPort,
    smtpUser: view.smtpUser.trim(),
    audioRetentionDays: view.audioRetentionDays,
    meetingRetentionDays: view.meetingRetentionDays,
  }
  for (const key of Object.keys(secrets) as SecretKey[]) {
    if (secrets[key]) patch[key] = secrets[key]
  }
  return patch
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
    }
  }
  const cooldown = view.nudgeCooldownSec
  if (!Number.isFinite(cooldown) || cooldown < 0 || cooldown > 60) {
    problems.push({
      key: 'nudgeCooldownSec',
      section: 'assistant',
      message: 'Use a number of seconds from 0 to 60.',
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
