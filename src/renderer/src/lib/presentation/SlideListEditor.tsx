import type { Slide } from '@shared/presentation/types'
import { PresentationImport } from './PresentationImport'
export function SlideListEditor({
  slides,
  setSlides,
}: {
  slides: Slide[]
  setSlides: (slides: Slide[]) => void
}): React.JSX.Element {
  const move = (i: number, delta: number): void => {
    const next = [...slides]
    ;[next[i], next[i + delta]] = [next[i + delta], next[i]]
    setSlides(next)
  }

  return (
    <>
      {' '}
      {slides.map((slide, i) => (
        <div className="card" key={i}>
          <h3>Slide {i + 1}</h3>
          {(['title', 'talkingPoint', 'script', 'keyFacts'] as const).map((key) => (
            <label className="field" key={key}>
              <span>
                {
                  {
                    title: 'Title',
                    talkingPoint: 'Talking point',
                    script: 'Script',
                    keyFacts: 'Key facts',
                  }[key]
                }
              </span>
              <textarea
                rows={key === 'script' ? 5 : 2}
                value={slide[key]}
                onChange={(e) =>
                  setSlides(slides.map((s, n) => (n === i ? { ...s, [key]: e.target.value } : s)))
                }
              />
            </label>
          ))}
          <button className="btn" disabled={i === 0} onClick={() => move(i, -1)}>
            Move up
          </button>
          <button className="btn" disabled={i === slides.length - 1} onClick={() => move(i, 1)}>
            Move down
          </button>
          <button className="btn" onClick={() => setSlides(slides.filter((_, n) => n !== i))}>
            Remove
          </button>
        </div>
      ))}
      <button
        className="btn"
        onClick={() =>
          setSlides([...slides, { title: '', talkingPoint: '', script: '', keyFacts: '' }])
        }
      >
        Add slide
      </button>
      <PresentationImport
        apply={(incoming, replace) => setSlides(replace ? incoming : [...slides, ...incoming])}
      />
    </>
  )
}
