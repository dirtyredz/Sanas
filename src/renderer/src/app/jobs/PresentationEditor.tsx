import { useEffect, useState } from 'react'
import { validateSlides, type Slide } from '@shared/presentation/types'
import { SlideListEditor } from '../../lib/presentation/SlideListEditor'

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
        <SlideListEditor slides={slides} setSlides={setSlides} />
        {invalid && <p role="alert">{invalid}</p>}
        <button className="btn" disabled={!!invalid} onClick={() => void save()}>
          Save presentation
        </button>
      </fieldset>
      <p role="status">{notice}</p>
    </section>
  )
}
