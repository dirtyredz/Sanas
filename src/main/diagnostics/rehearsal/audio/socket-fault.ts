/** Scoped to rehearsal startup. The real provider still owns reconnect/backoff/offsets. */
export function installSocketFaults(): { drop(): void; close(): void; opened(): number } {
  const Original = globalThis.WebSocket
  const sockets = new Set<WebSocket>()
  let opened = 0
  globalThis.WebSocket = class extends Original {
    constructor(url: string | URL, protocols?: string | string[]) {
      super(url, protocols)
      sockets.add(this)
      this.addEventListener('open', () => opened++)
      this.addEventListener('close', () => sockets.delete(this))
    }
  }
  return {
    drop: () => {
      for (const socket of sockets)
        if (socket.readyState === Original.OPEN) socket.close(4000, 'Rehearsal fault')
    },
    opened: () => opened,
    close: () => {
      globalThis.WebSocket = Original
      for (const socket of sockets) socket.close()
      sockets.clear()
    },
  }
}
