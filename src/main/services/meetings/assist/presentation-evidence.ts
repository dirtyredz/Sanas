import type { TurnFinal } from '../../turns/types'

export class PresentationEvidence {
  private start = 0
  private lines: string[] = []
  private incomplete = false

  reset(atMs: number): void {
    this.start = atMs
    this.lines = []
    this.incomplete = false
  }

  final(turn: TurnFinal): void {
    if (turn.role !== 'user') return
    if (turn.tStartMs < this.start) {
      if (turn.tEndMs > this.start) this.incomplete = true
      return
    }
    this.lines.push(`Me: ${turn.text}`)
    while (this.lines.join('\n').length > 12000) {
      this.lines.shift()
      this.incomplete = true
    }
  }

  snapshot(): { text: string; incomplete: boolean } {
    return { text: this.lines.join('\n'), incomplete: this.incomplete }
  }

  identityChanged(atMs: number): void {
    this.reset(atMs)
    this.incomplete = true
  }
}
