import type { SettingsView } from '@shared/types'
import { FieldRow } from '../../controls/FieldRow'
import { SettingsSection } from '../frame/SettingsSection'
import { problemFor, type SettingsProblem } from '../frame/settings-draft'

export function ApplicationsSection({
  view,
  problems,
  onChange,
}: {
  view: SettingsView
  problems: readonly SettingsProblem[]
  onChange: (patch: Partial<SettingsView>) => void
}): React.JSX.Element {
  const rootError = problemFor(problems, 'resumesRoot')
  const nodeError = problemFor(problems, 'resumesNodeExecutable')
  return (
    <SettingsSection
      id="applications"
      description="Create and refresh jobs from interview packs produced by your resumes project."
    >
      <FieldRow
        label="Resumes folder"
        help="Sanas only reads interview packs from job-hunt\sanas inside this folder, and runs its _hunt\cli\sanas-packs.js to refresh them. It never writes there."
        error={rootError}
      >
        <input
          type="text"
          className="mono"
          value={view.resumesRoot}
          aria-invalid={rootError ? true : undefined}
          onChange={(e) => onChange({ resumesRoot: e.target.value })}
        />
      </FieldRow>
      <FieldRow
        label="Node executable"
        help="node.exe on your PATH, or the full path to node.exe."
        error={nodeError}
      >
        <input
          type="text"
          className="mono"
          value={view.resumesNodeExecutable}
          aria-invalid={nodeError ? true : undefined}
          onChange={(e) => onChange({ resumesNodeExecutable: e.target.value })}
        />
      </FieldRow>
    </SettingsSection>
  )
}
