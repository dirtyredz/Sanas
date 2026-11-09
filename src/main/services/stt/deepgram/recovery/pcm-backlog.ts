interface Entry {
  start: number
  pcm: Buffer
}

/** Owned, bounded unsent PCM. Positions are on the original capture byte clock. */
export class PcmBacklog {
  private entries: (Entry | undefined)[] = []
  private head = 0
  private bytes = 0
  constructor(private readonly limit: number) {}

  push(pcm: Buffer, start: number): boolean {
    if (this.bytes + pcm.length > this.limit) return false
    // Limit each socket handoff as well as total retention. Ignore empty captures.
    for (let offset = 0; offset < pcm.length; offset += 32_000) {
      const part = Buffer.from(pcm.subarray(offset, offset + 32_000))
      this.entries.push({ start: start + offset, pcm: part })
    }
    this.bytes += pcm.length
    return true
  }
  peek(): Entry | undefined {
    return this.entries[this.head]
  }
  shift(): void {
    const entry = this.entries[this.head]
    if (!entry) return
    this.entries[this.head++] = undefined
    this.bytes -= entry.pcm.length
    if (this.head === this.entries.length) this.clear()
    else if (this.head >= 1024 && this.head * 2 >= this.entries.length) {
      this.entries = this.entries.slice(this.head)
      this.head = 0
    }
  }
  clear(): void {
    this.entries = []
    this.head = 0
    this.bytes = 0
  }
}
