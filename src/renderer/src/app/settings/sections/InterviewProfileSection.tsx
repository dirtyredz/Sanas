import { INTERVIEW_PROFILE_MAX_CHARS } from '@shared/interview-profile'
import type { SettingsView } from '@shared/types'
import { SettingsSection } from '../frame/SettingsSection'

const guidance = `About me
Your speakable “tell me about yourself” answer.

Go-to stories
For each project: problem / what I did / result. Add as many stories as you want.

Strengths and weaknesses
Examples of strengths, and a weakness you are working on.

Why I'm looking
What you want from your next role.

Rate and availability
Your rate or range, start date, hours and constraints.

Anything else
Employers, technologies and other interview context.`

export function InterviewProfileSection({
  view,
  onChange,
}: {
  view: SettingsView
  onChange: (patch: Partial<SettingsView>) => void
}): React.JSX.Element {
  return (
    <SettingsSection
      id="interview-profile"
      description="Save once for every interview. Mock interview always uses this; Live uses it only when Interview is on at Start."
    >
      <p>
        Write plain text with the headings below. A resume takes precedence. Changes apply to future
        meetings; saved meetings keep their original profile.
      </p>
      <label htmlFor="interview-profile-text">Your interview profile</label>
      <textarea
        id="interview-profile-text"
        rows={22}
        maxLength={INTERVIEW_PROFILE_MAX_CHARS}
        value={view.interviewProfile}
        placeholder={guidance}
        onChange={(e) => onChange({ interviewProfile: e.target.value })}
      />
      <details>
        <summary>Section guidance</summary>
        <pre style={{ whiteSpace: 'pre-wrap' }}>{guidance}</pre>
      </details>
      <p className="muted">
        {view.interviewProfile.length.toLocaleString()} /{' '}
        {INTERVIEW_PROFILE_MAX_CHARS.toLocaleString()} characters. Stored locally; used in interview
        assistance and transcription hints.
      </p>
    </SettingsSection>
  )
}
