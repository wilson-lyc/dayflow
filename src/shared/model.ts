export type ThemeMode = 'light' | 'dark' | 'system'
import type { Locale } from './languages'
export type { Locale } from './languages'
export type LogType = 'manual' | 'todo' | 'schedule' | (string & {})
export interface Log {
  id: string
  type: LogType
  content: string
  recordedAt: number
  timeZone: string
  localDate: string
  createdAt: number
  updatedAt: number
  isDeleted: boolean
}
export interface Submission {
  id: string
  recordedAt: number
  timeZone: string
}
export interface Draft {
  version: 1
  content: string
  targetDate: string
  timeMode: 'current-time' | 'custom'
  recordedAt: number | null
  timeZone: string
  cachedAt: number
  pendingSubmission: Submission | null
}
export interface Preferences {
  themeMode: ThemeMode
  localePreference: string | null
}
export type ErrorCode =
  'storage' | 'cache' | 'empty' | 'too-long' | 'time' | 'state' | 'version' | 'cache-reset'
export type Result<T> = { ok: true; value: T } | { ok: false; error: ErrorCode }
export interface Bootstrap {
  preferences: Preferences
  locale: Locale
  dark: boolean
  draft: Draft | null
  cacheEpoch: number
  preferenceError: boolean
  platform: string
}
export interface DayflowAPI {
  bootstrap(): Promise<Result<Bootstrap>>
  list(date: string | null): Promise<Result<Log[]>>
  find(id: string): Promise<Result<Log | null>>
  create(
    draft: Draft,
    epoch: number
  ): Promise<Result<{ log: Log; cacheCleared: boolean; cacheEpoch: number }>>
  edit(
    id: string,
    content: string,
    recordedAt: number | null,
    timeZone: string
  ): Promise<Result<Log>>
  change(id: string, action: 'trash' | 'restore' | 'delete'): Promise<Result<Log | null>>
  cache(draft: Draft | null, epoch: number): Promise<Result<number>>
  preference(key: keyof Preferences, value: string): Promise<Result<Preferences>>
  finishClose(): void
  cancelClose(): void
  ready(): void
  onClose(callback: () => void): () => void
  onSystemTheme(callback: (dark: boolean) => void): () => void
  onCacheReset(callback: (epoch: number) => void): () => void
}
export function localDate(timestamp: number, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(timestamp)
  const get = (type: string): string => parts.find((p) => p.type === type)!.value
  return `${get('year')}-${get('month')}-${get('day')}`
}
export function validDate(value: string): boolean {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T12:00:00Z`)
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
}
