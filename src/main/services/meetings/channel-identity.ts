// The one place channel semantics become identity: in stereo capture,
// channel 0 is the mic (the user) and channel 1 is system loopback (others).
// Both the live path and batch re-diarization consume this — never re-derive it.

export interface SpeakerIdentity {
  /** Diarized speaker index; -1 for the user (no diarization needed on their channel). */
  speaker: number
  isUser: boolean
}

export function resolveSpeakerIdentity(
  channel: number,
  speaker: number,
  stereo: boolean,
  /** mono fallback: the set of diarized indices the user has pinned as "me" */
  pinnedUserSpeakers?: ReadonlySet<number>,
): SpeakerIdentity {
  if (stereo) {
    const isUser = channel === 0
    return { speaker: isUser ? -1 : speaker, isUser }
  }
  return { speaker, isUser: pinnedUserSpeakers?.has(speaker) ?? false }
}
