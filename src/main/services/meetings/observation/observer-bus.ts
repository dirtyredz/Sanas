// The one best-effort, main-only observation bus the meeting, run and assistance streams
// share. Observation never changes behaviour: a throwing listener is dropped for that event
// and cannot interrupt capture, a run or an admission decision, or starve other listeners.

export interface ObserverBus<T> {
  subscribe(listener: (event: T) => void): () => void
  publish(event: T): void
}

export function createObserverBus<T>(): ObserverBus<T> {
  const listeners = new Set<(event: T) => void>()
  return {
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    publish(event) {
      for (const listener of listeners) {
        try {
          listener(event)
        } catch {
          /* observation is never policy */
        }
      }
    },
  }
}
