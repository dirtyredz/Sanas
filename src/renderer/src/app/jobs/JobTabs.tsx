import type { ReactNode } from 'react'
import { nextTabIndex } from '../../lib/navigation/next-tab-index'

function tabIds(name: string): { tab: string; panel: string } {
  return { tab: `job-tab-${name}`, panel: `job-panel-${name}` }
}

/** Selection lives with the page so returning from a meeting restores the selected tab. */
export function JobTabs({
  tabs,
  active,
  onSelect,
}: {
  tabs: readonly { name: string; render: () => ReactNode }[]
  active: number
  onSelect: (index: number) => void
}): React.JSX.Element {
  return (
    <>
      <div className="segmented" role="tablist" aria-label="Job details">
        {tabs.map(({ name }, index) => {
          const ids = tabIds(name)
          return (
            <button
              key={name}
              id={ids.tab}
              role="tab"
              className={active === index ? 'active' : ''}
              aria-selected={active === index}
              aria-controls={ids.panel}
              tabIndex={active === index ? 0 : -1}
              onClick={() => onSelect(index)}
              onKeyDown={(event) => {
                const next = nextTabIndex(event.key, index, tabs.length, 'horizontal')
                if (next === null) return
                event.preventDefault()
                onSelect(next)
                document.getElementById(tabIds(tabs[next].name).tab)?.focus()
              }}
            >
              {name}
            </button>
          )
        })}
      </div>
      {/* Keep local editor/import drafts mounted while another tab is visible. */}
      {tabs.map(({ name, render }, index) => {
        const ids = tabIds(name)
        return (
          <div
            key={name}
            id={ids.panel}
            role="tabpanel"
            aria-labelledby={ids.tab}
            hidden={active !== index}
            tabIndex={0}
            className="job-tab-panel"
          >
            {render()}
          </div>
        )
      })}
    </>
  )
}
