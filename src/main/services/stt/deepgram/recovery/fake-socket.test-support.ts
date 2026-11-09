// A fake WebSocket: no network. Tests drive open/message/close by hand.
type Listener = (ev: unknown) => void

export class FakeSocket {
  static OPEN = 1
  static CLOSED = 3
  bufferedAmount = 0
  static instances: FakeSocket[] = []
  readyState = 0
  sent: unknown[] = []
  closes: [number | undefined, string | undefined][] = []
  private listeners = new Map<string, Listener[]>()

  constructor(
    public url: string,
    public protocols: string[],
  ) {
    FakeSocket.instances.push(this)
  }

  addEventListener(type: string, fn: Listener, opts?: { once?: boolean }): void {
    const wrapped: Listener = opts?.once
      ? (ev) => {
          this.off(type, wrapped)
          fn(ev)
        }
      : fn
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), wrapped])
  }

  private off(type: string, fn: Listener): void {
    this.listeners.set(
      type,
      (this.listeners.get(type) ?? []).filter((l) => l !== fn),
    )
  }

  emit(type: string, ev: unknown = {}): void {
    for (const l of this.listeners.get(type) ?? []) l(ev)
  }

  open(): void {
    if (this.readyState === 3) return
    this.readyState = 1
    this.emit('open')
  }

  send(data: unknown): void {
    this.sent.push(data)
    // Deepgram answers CloseStream by closing normally
    if (data === JSON.stringify({ type: 'CloseStream' })) {
      queueMicrotask(() => this.emit('close', { code: 1000 }))
    }
  }

  close(code?: number, reason?: string): void {
    this.closes.push([code, reason])
    this.readyState = 3
  }

  message(data: unknown): void {
    this.emit('message', { data: JSON.stringify(data) })
  }
}
