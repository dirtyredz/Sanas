import { describe, expect, it } from 'vitest'
import {
  localPathProblem,
  nodeExecutableProblem,
  resumesRootProblem,
  RESUMES_NODE_DEFAULT,
  RESUMES_ROOT_DEFAULT,
  SOURCE_PATH_MAX_CHARS,
} from './source-settings'

describe('localPathProblem', () => {
  it.each(['C:\\Users\\dirty\\resumes', 'D:/resumes', '/home/me/resumes'])('accepts %s', (v) => {
    expect(localPathProblem(v)).toBeNull()
  })

  it.each([
    ['a UNC share', '\\\\server\\share'],
    ['a device namespace path', '\\\\?\\C:\\x'],
    ['a relative path', 'resumes\\x'],
    ['a control character', 'C:\\a\u0007b'],
    ['a parent segment', 'C:\\a\\..\\b'],
    ['an alternate data stream', 'C:\\x:stream'],
    ['a device name', 'C:\\con\\x'],
    ['surrounding spaces', ' C:\\x'],
    ['an empty value', ''],
    ['an over-long path', `C:\\${'a'.repeat(SOURCE_PATH_MAX_CHARS)}`],
  ])('refuses %s', (_name, v) => {
    expect(localPathProblem(v)).not.toBeNull()
  })
})

describe('resumesRootProblem', () => {
  it('accepts the default and refuses a share', () => {
    expect(resumesRootProblem(RESUMES_ROOT_DEFAULT)).toBeNull()
    expect(resumesRootProblem('\\\\server\\share')).not.toBeNull()
  })
})

describe('nodeExecutableProblem', () => {
  it.each([RESUMES_NODE_DEFAULT, 'node', 'NODE.EXE', 'C:\\Program Files\\nodejs\\node.exe'])(
    'accepts %s',
    (v) => {
      expect(nodeExecutableProblem(v)).toBeNull()
    },
  )

  it.each(['', '   ', 'tools\\node.exe', '\\\\server\\share\\node.exe'])('refuses %j', (v) => {
    expect(nodeExecutableProblem(v)).not.toBeNull()
  })
})
