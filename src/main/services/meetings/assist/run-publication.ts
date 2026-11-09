import { couldBeNoSuggestion } from '@shared/live-controls/readable-suggestion'

// What one suggestion run has made visible so far, and what it is still holding back. Owned
// per run by SuggestionRunner (which keeps lane, deadline and persistence).
//
// Two reasons text is held rather than shown:
//   - a streamed answer that may decline (`allowNoop`) stays hidden until its text visibly
//     cannot be the no-op `<none>`;
//   - an unpublished speculation shows nothing at all until `publish()`.
// `decision` settles when a speculation is promoted (true) or discarded / out of time
// (false); an ordinary run is born published and never waits on it.

export class RunPublication {
  private _shown = false
  private _published: boolean
  private _ended = false
  private held = ''
  private decide: (promoted: boolean) => void = () => undefined
  /** Resolves true when promoted, false when discarded or past its deadline. */
  readonly decision = new Promise<boolean>((resolve) => (this.decide = resolve))

  constructor(
    published: boolean,
    private allowNoop: boolean | undefined,
    private show: { start(): void; delta(text: string): void },
  ) {
    this._published = published
  }

  /** Whether the start event (and any held text) has been emitted. */
  get shown(): boolean {
    return this._shown
  }

  get published(): boolean {
    return this._published
  }

  /** Shows the held text once published and it cannot still be the no-op. */
  reveal(): void {
    if (this._shown || !this._published || (this.allowNoop && couldBeNoSuggestion(this.held)))
      return
    this._shown = true
    this.show.start()
    if (this.held) this.show.delta(this.held)
  }

  /** Streamed provider text: passed straight through once shown, otherwise held. */
  push(delta: string): void {
    if (this._shown) return this.show.delta(delta)
    this.held += delta
    this.reveal()
  }

  /** Marks the run published and releases the provider call waiting on `decision`. False
   *  when the run already ended unpublished. The caller reveals once it has recorded it. */
  publish(): boolean {
    if (this._ended) return false
    this._published = true
    this.decide(true)
    return true
  }

  /** The speculation is discarded, cancelled or past its deadline. */
  reject(): void {
    this.decide(false)
  }

  /** The run has settled; a late promotion has nothing left to publish. */
  end(): void {
    this._ended = true
  }
}
