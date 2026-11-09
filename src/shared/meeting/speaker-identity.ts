/** Meeting-local IDs; provider speaker indices never cross this boundary in mono. */
export interface SpeakerIdentityStatus {
  identityNeedsConfirmation: boolean
  currentSpeakerIds: number[]
  selectedSpeakerIds: number[]
}
