// A minimal "something changed" signal for the status modules next to it. They hold plain
// module state that other parts (the updates service) must react to without polling.

export interface ChangeSignal {
  subscribe(listener: () => void): () => void
  notify(): void
}

export function createChangeSignal(): ChangeSignal {
  const listeners = new Set<() => void>()
  return {
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    notify() {
      for (const listener of [...listeners]) {
        try {
          listener()
        } catch {
          // a subscriber failing must never break the writer's state change
        }
      }
    },
  }
}
