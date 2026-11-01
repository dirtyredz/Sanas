/** Limits both sides enforce on a setting: main's schema drops a value outside them, and the
 *  Settings page refuses to Save one, so the two cannot disagree. */
export const SETTINGS_LIMITS = {
  /** Claude model IDs are required (a blank one is dropped) and at most this long. */
  modelId: { maxLength: 200 },
  nudgeCooldownSec: { min: 0, max: 60 },
} as const
