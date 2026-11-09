import { UNSORTED_RESUME_MESSAGE } from '@shared/jobs/unsorted'

/** The Resume tab of the Unsorted bucket: explains why there is nothing to save here. */
export function ResumeUnavailable(): React.JSX.Element {
  return (
    <section className="card job-resume">
      <h2>Resume</h2>
      <p className="muted">{UNSORTED_RESUME_MESSAGE}</p>
    </section>
  )
}
