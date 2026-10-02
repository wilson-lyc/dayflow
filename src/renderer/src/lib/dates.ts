import { localDate, type Submission } from '../../../shared/model'
export const systemZone = (): string => Intl.DateTimeFormat().resolvedOptions().timeZone
export const today = (): string => localDate(Date.now(), systemZone())
export interface Draft {
  content: string
  targetDate: string
  timeMode: 'current-time' | 'custom'
  recordedAt: number | null
  timeZone: string
  pendingSubmission: Submission | null
}
export function blankDraft(date = today()): Draft {
  return {
    content: '',
    targetDate: date,
    timeMode: date === today() ? 'current-time' : 'custom',
    recordedAt: null,
    timeZone: systemZone(),
    pendingSubmission: null
  }
}
export function parseDay(date: string): Date {
  return new Date(`${date}T12:00:00`)
}
export function shiftDay(date: string, offset: number): string {
  const next = parseDay(date)
  next.setDate(next.getDate() + offset)
  return localDate(next.getTime(), systemZone())
}
export function timeText(at: number, zone: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: zone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  }).format(at)
}
// Resolve wall-clock values in their IANA zone, and reject nonexistent DST times.
export function wallTime(date: string, time: string, zone: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) return null
  const wall = Date.parse(`${date}T${time}:00Z`)
  if (!Number.isFinite(wall)) return null
  let result = wall
  for (let i = 0; i < 4; i++) {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: zone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23'
    }).formatToParts(result)
    const get = (key: string): string => parts.find((p) => p.type === key)!.value
    const represented = Date.parse(
      `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}:${get('second')}Z`
    )
    const delta = wall - represented
    if (!delta) return result
    result += delta
  }
  return null
}

export function hasDraft(draft: Draft): boolean {
  return (
    !!draft.content ||
    !!draft.pendingSubmission ||
    (draft.timeMode === 'custom' && draft.recordedAt !== null)
  )
}
