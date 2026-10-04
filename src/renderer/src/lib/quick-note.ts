import { localDate } from '../../../shared/model'
import { systemZone, type Draft } from './dates'
import type { MessageKey } from './i18n'

export function validateQuickNote(draft: Draft, now: number): MessageKey | null {
  if (!draft.content.trim()) return 'empty'
  if (Array.from(draft.content).length > 10000) return 'tooLong'
  if (draft.pendingSubmission)
    return draft.pendingSubmission.recordedAt > now ? 'invalidTime' : null
  const today = localDate(now, systemZone())
  if (draft.targetDate > today) return 'invalidTime'
  if (draft.timeMode === 'current-time' && draft.targetDate !== today) return 'specifyTime'
  if (draft.timeMode === 'custom') {
    if (draft.recordedAt === null) return 'specifyTime'
    if (draft.recordedAt > now) return 'invalidTime'
  }
  return null
}
