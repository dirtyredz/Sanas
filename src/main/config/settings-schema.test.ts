import { describe, expect, it } from 'vitest'
import { RESUMES_NODE_DEFAULT, RESUMES_ROOT_DEFAULT } from '@shared/jobs/source-settings'
import { SETTINGS_SCHEMA } from './settings-schema'

describe('resumes settings schema', () => {
  it('accepts the defaults and a full node path', () => {
    expect(SETTINGS_SCHEMA.resumesRoot(RESUMES_ROOT_DEFAULT)).toBe(RESUMES_ROOT_DEFAULT)
    expect(SETTINGS_SCHEMA.resumesNodeExecutable(RESUMES_NODE_DEFAULT)).toBe('node.exe')
    const node = 'C:\\Program Files\\nodejs\\node.exe'
    expect(SETTINGS_SCHEMA.resumesNodeExecutable(node)).toBe(node)
  })

  it('drops a UNC share, a relative path and a non-string', () => {
    expect(SETTINGS_SCHEMA.resumesRoot('\\\\server\\share')).toBeUndefined()
    expect(SETTINGS_SCHEMA.resumesRoot('resumes')).toBeUndefined()
    expect(SETTINGS_SCHEMA.resumesRoot(42)).toBeUndefined()
    expect(SETTINGS_SCHEMA.resumesNodeExecutable('')).toBeUndefined()
    expect(SETTINGS_SCHEMA.resumesNodeExecutable('\\\\server\\share\\node.exe')).toBeUndefined()
  })
})
