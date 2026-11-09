import type { SpeakerIdentityStatus } from '@shared/meeting/speaker-identity'
import { resolveSpeakerIdentity, type SpeakerIdentity } from './channel-identity'

/** Mono diarization indices are connection-local. Historical IDs and pins are not. */
export class SpeakerSession {
  private readonly pins = new Set<number>()
  private current = new Map<number, number>()
  private next = 0
  private needsConfirmation = false

  map(raw: number): number {
    if (raw < 0) return -1
    let id = this.current.get(raw)
    if (id === undefined) {
      id = this.next++
      this.current.set(raw, id)
    }
    return id
  }
  /** Who a transcript belongs to, given this session's pins and confirmation state. */
  resolve(channel: number, mapped: number, stereo: boolean): SpeakerIdentity {
    return resolveSpeakerIdentity(channel, mapped, stereo, this.pins, this.needsConfirmation)
  }
  resetConnection(): void {
    this.current.clear()
    this.needsConfirmation ||= this.pins.size > 0
  }
  validate(id: number): void {
    if (!Number.isInteger(id) || id < 0 || id >= this.next)
      throw new Error('This voice does not belong to the current meeting.')
  }
  pin(id: number, isUser: boolean): void {
    this.validate(id)
    if (isUser) this.pins.add(id)
    else this.pins.delete(id)
    if (isUser && [...this.current.values()].includes(id)) this.needsConfirmation = false
  }
  status(): SpeakerIdentityStatus {
    return {
      identityNeedsConfirmation: this.needsConfirmation,
      currentSpeakerIds: [...this.current.values()],
      selectedSpeakerIds: [...this.pins],
    }
  }
  clear(): void {
    this.current.clear()
    this.pins.clear()
    this.next = 0
    this.needsConfirmation = false
  }
}
