import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import type { Slide } from '../../../shared/presentation/types'
import { rubrics, type Rubric } from './semantics'

export type Fault =
  | 'socket-drop'
  | 'silent-them'
  | 'assistant-slow'
  | 'assistant-fail'
  | 'capture-timeout'
  | 'missing-display'
  | 'oversize-image'
export type Step = { id: string; atMs: number } & (
  | { kind: 'utterance'; channel: 'me' | 'them'; speaker: number; text: string; durationMs: number }
  | { kind: 'screen'; image: string; real?: boolean; displayId?: number; text?: string }
  | { kind: 'ask'; text: string }
  | { kind: 'detail' }
  | { kind: 'answer-mode'; enabled: boolean }
  | { kind: 'slide'; direction: 'prev' | 'next' }
  | { kind: 'fault'; fault: Fault; durationMs: number }
)
export type CheckKind =
  | 'request'
  | 'suggestion'
  | 'screen'
  | 'no-interims'
  | 'summary'
  | 'capture-warning'
  | 'reconnect'
  | 'busy'
  | 'assistant-error'
  | 'capture-error'
  | 'slide'
  | 'recording'
  | 'batch'
  | 'coach'
export interface Expectation {
  id: string
  kind: CheckKind
  after?: string
  withinMs?: number
  contains?: string
  assistant?: 'canned' | 'claude'
  covers?: string[]
  rubric?: Rubric
  fromFinal?: boolean
  responsivenessMs?: number
}
export interface Scenario {
  version: 1
  name: string
  durationMs: number
  steps: Step[]
  expectations: Expectation[]
  slides?: Slide[]
  coach?: boolean
  audio?: string
}

const faults: Fault[] = [
  'socket-drop',
  'silent-them',
  'assistant-slow',
  'assistant-fail',
  'capture-timeout',
  'missing-display',
  'oversize-image',
]
const checks: CheckKind[] = [
  'request',
  'suggestion',
  'screen',
  'no-interims',
  'summary',
  'capture-warning',
  'reconnect',
  'busy',
  'assistant-error',
  'capture-error',
  'slide',
  'recording',
  'batch',
  'coach',
]
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Expected an object')
  return value as Record<string, unknown>
}
function text(value: unknown): asserts value is string {
  if (typeof value !== 'string' || !value.trim() || value.length > 20000)
    throw new Error('Expected nonempty bounded text')
}
function milliseconds(value: unknown): asserts value is number {
  if (!Number.isInteger(value) || (value as number) < 0 || (value as number) > 600000)
    throw new Error('Timing must be integer milliseconds in 0..600000')
}

/** Reject malformed scenarios before opening a DB, provider or desktop window. */
export function parseScenario(value: unknown): Scenario {
  const s = object(value)
  if (s.version !== 1) throw new Error('Unsupported scenario version')
  text(s.name)
  milliseconds(s.durationMs)
  if (
    !s.durationMs ||
    !Array.isArray(s.steps) ||
    !Array.isArray(s.expectations) ||
    !s.expectations.length
  )
    throw new Error('Scenario needs a duration, steps and expectations')
  if (s.coach !== undefined && typeof s.coach !== 'boolean') throw new Error('Invalid coach flag')
  if (s.audio !== undefined) text(s.audio)
  const ids = new Set<string>()
  let previous = -1
  for (const raw of s.steps) {
    const step = object(raw)
    text(step.id)
    milliseconds(step.atMs)
    if (ids.has(step.id) || step.atMs < previous || step.atMs > s.durationMs)
      throw new Error('Steps must have unique IDs and ordered times within duration')
    ids.add(step.id)
    previous = step.atMs
    switch (step.kind) {
      case 'utterance':
        text(step.text)
        milliseconds(step.durationMs)
        if (
          !step.durationMs ||
          step.atMs + step.durationMs > s.durationMs ||
          !['me', 'them'].includes(String(step.channel)) ||
          !Number.isInteger(step.speaker) ||
          Number(step.speaker) < 0
        )
          throw new Error('Invalid utterance')
        break
      case 'screen':
        text(step.image)
        if (step.text !== undefined) text(step.text)
        if (step.real !== undefined && typeof step.real !== 'boolean')
          throw new Error('Invalid real capture flag')
        if (step.displayId !== undefined && !Number.isInteger(step.displayId))
          throw new Error('Invalid display ID')
        break
      case 'ask':
        text(step.text)
        break
      case 'detail':
        break
      case 'answer-mode':
        if (typeof step.enabled !== 'boolean') throw new Error('Invalid answer mode')
        break
      case 'slide':
        if (!['prev', 'next'].includes(String(step.direction)))
          throw new Error('Invalid slide direction')
        break
      case 'fault':
        if (!faults.includes(step.fault as Fault)) throw new Error('Unknown fault')
        milliseconds(step.durationMs)
        if (!step.durationMs) throw new Error('Fault duration must be positive')
        break
      default:
        throw new Error('Unknown step kind')
    }
  }
  const expectationIds = new Set<string>()
  for (const raw of s.expectations) {
    const e = object(raw)
    text(e.id)
    if (expectationIds.has(e.id) || !checks.includes(e.kind as CheckKind))
      throw new Error('Invalid expectation')
    expectationIds.add(e.id)
    if (e.after !== undefined && !ids.has(String(e.after)))
      throw new Error('Unknown expectation step')
    if (e.withinMs !== undefined) milliseconds(e.withinMs)
    if (e.contains !== undefined) text(e.contains)
    if (e.rubric !== undefined && !rubrics.includes(e.rubric as Rubric))
      throw new Error('Invalid rubric')
    if (
      e.covers !== undefined &&
      (!Array.isArray(e.covers) || !e.covers.length || e.covers.some((id) => !ids.has(String(id))))
    )
      throw new Error('Invalid coverage steps')
    if (e.fromFinal !== undefined && typeof e.fromFinal !== 'boolean')
      throw new Error('Invalid final anchor')
    if (e.responsivenessMs !== undefined) milliseconds(e.responsivenessMs)
    if (e.assistant !== undefined && !['canned', 'claude'].includes(String(e.assistant)))
      throw new Error('Invalid expectation assistant')
  }
  if (s.slides !== undefined) {
    if (!Array.isArray(s.slides)) throw new Error('Invalid slides')
    for (const raw of s.slides) {
      const slide = object(raw)
      for (const key of ['title', 'talkingPoint', 'script', 'keyFacts'])
        if (typeof slide[key] !== 'string') throw new Error('Invalid slide field')
    }
  }
  return s as unknown as Scenario
}

export function loadScenario(path: string): Scenario {
  const s = parseScenario(JSON.parse(readFileSync(path, 'utf8').replace(/^\uFEFF/, '')))
  for (const step of s.steps)
    if (step.kind === 'screen') step.image = resolve(dirname(path), step.image)
  if (s.audio) s.audio = resolve(dirname(path), s.audio)
  return s
}
