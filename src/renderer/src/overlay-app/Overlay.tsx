export function Overlay(): React.JSX.Element {
  return (
    <div className="overlay-panel">
      <header className="overlay-header">
        <span className="dot" />
        <span className="title">Sanas</span>
        <span className="hint">idle</span>
      </header>
      <section className="overlay-transcript">
        <p className="muted">Live transcript appears here (Phase 1).</p>
      </section>
      <section className="overlay-suggestion">
        <p className="muted">Whispered suggestions land here (Phase 3).</p>
      </section>
    </div>
  )
}
