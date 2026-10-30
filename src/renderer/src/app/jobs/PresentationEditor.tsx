import { useEffect, useState } from 'react'
import { validateSlides, type Slide } from '@shared/presentation/types'
import { PresentationImport } from './PresentationImport'

export function PresentationEditor({ jobId }: { jobId: number }): React.JSX.Element {
  const [slides, setSlides] = useState<Slide[]>([])
  const [loaded, setLoaded] = useState(false)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  useEffect(() => {
    let active = true
    setLoaded(false)
    window.sanas.presentation
      .getJobSlides(jobId)
      .then((s) => {
        if (active) {
          setSlides(s)
          setLoaded(true)
        }
      })
      .catch((e) => {
        if (active) setNotice(String(e))
      })
    return () => {
      active = false
    }
  }, [jobId])
  let invalid = ''
  try {
    validateSlides(slides)
  } catch (e) {
    invalid = (e as Error).message
  }
  const move = (i: number, delta: number): void => {
    const next = [...slides]
    ;[next[i], next[i + delta]] = [next[i + delta], next[i]]
    setSlides(next)
  }
  const save = async (): Promise<void> => {
    setBusy(true)
    try {
      await window.sanas.presentation.replaceJobSlides(jobId, slides)
      setNotice('Saved. Changes apply to the next meeting.')
    } catch (e) {
      setNotice(String(e))
    } finally {
      setBusy(false)
    }
  }
  return (
    <section className="card presentation-editor">
      <h2>Presentation</h2>
      <p>
        Slide talking points replace the flat talking-points field for presentation meetings. The
        flat field remains available for ordinary meetings.
      </p>
      <fieldset disabled={!loaded || busy}>
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
        {invalid && <p role="alert">{invalid}</p>}
        <button className="btn" disabled={!!invalid} onClick={() => void save()}>
          Save presentation
        </button>
      </fieldset>
      <p role="status">{notice}</p>
    </section>
  )
}
