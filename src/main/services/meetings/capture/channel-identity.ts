// The one place channel semantics become identity: in stereo capture,
// channel 0 is the mic (the user) and channel 1 is system loopback (others).
// Both the live path and batch re-diarization consume this — never re-derive it.

/** How sure the identity is. 'unknown' never initiates coaching, and in stereo it is what a
 *  provider message without a usable channel becomes, instead of implicit user speech. */
export type IdentityRole = 'user' | 'other' | 'unknown'

export interface SpeakerIdentity {
  /** Diarized speaker index; -1 for the user (no diarization needed on their channel). */
  speaker: number
  isUser: boolean
  role: IdentityRole
}

export function resolveSpeakerIdentity(
  channel: number,
  speaker: number,
  stereo: boolean,
  /** mono fallback: the set of diarized indices the user has pinned as "me" */
  pinnedUserSpeakers?: ReadonlySet<number>,
): SpeakerIdentity {
  if (stereo) {
    if (channel === 0) return { speaker: -1, isUser: true, role: 'user' }
    if (channel === 1) return { speaker, isUser: false, role: 'other' }
    return { speaker: -1, isUser: false, role: 'unknown' }
  }
  if (pinnedUserSpeakers?.has(speaker)) return { speaker, isUser: true, role: 'user' }
  return { speaker, isUser: false, role: speaker >= 0 ? 'other' : 'unknown' }
}
