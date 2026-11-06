// Pure checks for the resumes integration settings. Main's settings schema drops a value
// these reject, the Settings page shows the problem beside the field, and main checks again
// when it uses the value (persisted settings are not trusted).

export const RESUMES_ROOT_DEFAULT = 'C:\\Users\\dirty\\projects\\resumes'
export const RESUMES_NODE_DEFAULT = 'node.exe'
export const SOURCE_PATH_MAX_CHARS = 260

// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001f\u007f]/
const WINDOWS_ABSOLUTE = /^[A-Za-z]:[\\/]/
const RESERVED = /[<>"|?*]/
const DEVICE_NAME = /(^|[\\/])(con|prn|aux|nul|com\d|lpt\d)(\.[^\\/]*)?([\\/]|$)/i
const PARENT = /(^|[\\/])\.\.([\\/]|$)/

/** Why a value is not an absolute local path, or null when it is. Network shares, device
 *  namespaces (\\?\, \\.\), alternate data streams, ".." and control characters are refused. */
export function localPathProblem(value: string): string | null {
  if (!value.trim()) return 'Enter a path.'
  if (value !== value.trim()) return 'Remove the spaces around the path.'
  if (value.length > SOURCE_PATH_MAX_CHARS)
    return `Use a path of ${SOURCE_PATH_MAX_CHARS} characters or fewer.`
  if (CONTROL.test(value)) return 'The path contains control characters.'
  if (value.startsWith('\\\\') || value.startsWith('//'))
    return 'Use a local path; network shares and device paths are not allowed.'
  const windows = WINDOWS_ABSOLUTE.test(value)
  if (!windows && !value.startsWith('/')) return 'Use an absolute path (for example C:\\...).'
  const rest = windows ? value.slice(2) : value
  if (rest.includes(':') || RESERVED.test(rest))
    return 'The path contains characters Windows does not allow.'
  if (DEVICE_NAME.test(rest)) return 'The path names a Windows device.'
  if (PARENT.test(rest)) return 'Use a path without "..".'
  return null
}

/** The resumes project folder: an absolute local directory. */
export function resumesRootProblem(value: string): string | null {
  return localPathProblem(value)
}

/** `node`/`node.exe` (found on PATH) or an absolute path to the executable. */
export function nodeExecutableProblem(value: string): string | null {
  if (/^node(\.exe)?$/i.test(value)) return null
  if (!value.trim()) return 'Enter node.exe or the full path to it.'
  return localPathProblem(value)
}
