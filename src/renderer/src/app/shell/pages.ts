import { IconAsk, IconJobs, IconLive, IconSearch, IconSettings } from '../../lib/icons'

/** The library window's pages and the header tabs that open them. */
export type Page = 'live' | 'jobs' | 'search' | 'ask' | 'settings'

export const NAV: { page: Page; label: string; icon: () => React.JSX.Element }[] = [
  { page: 'live', label: 'Live', icon: IconLive },
  { page: 'jobs', label: 'Jobs', icon: IconJobs },
  { page: 'search', label: 'Search', icon: IconSearch },
  { page: 'ask', label: 'Ask', icon: IconAsk },
  { page: 'settings', label: 'Settings', icon: IconSettings },
]
