import { requireId } from './validate'
export { validateSlides as requireSlides } from '../../shared/presentation/types'

export function requireSlideMove(raw: unknown): { meetingId: number; direction: 'prev' | 'next' } {
  if (!raw || typeof raw !== 'object') throw new Error('Invalid navigation request.')
  const value = raw as Record<string, unknown>
  const meetingId = requireId(value.meetingId, 'meeting id')
  if (value.direction !== 'prev' && value.direction !== 'next')
    throw new Error('Invalid slide direction.')
  return { meetingId, direction: value.direction }
}
