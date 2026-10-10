export type ThemeMode = 'light' | 'dark' | 'system'
import type { Locale } from './languages'
export type { Locale } from './languages'
export type LogType = 'manual' | 'todo' | 'schedule' | (string & {})
export interface CodeCard {
  id: string
  name: string
  language: string
  code: string
}
export interface NoteContent {
  text: string
  codeCards: CodeCard[]
}
export interface Log {
  id: string
  taskId: string | null
  taskName: string | null
  type: LogType
  content: NoteContent
  recordedAt: number
  timeZone: string
  localDate: string
  createdAt: number
  updatedAt: number
  isDeleted: boolean
}
export interface Submission {
  id: string
  taskId?: string | null
  recordedAt: number
  timeZone: string
}
export interface CreateLog extends Submission {
  content: NoteContent
  targetDate: string
}
export const reportAutoSaveIntervals = ['off', '10', '30', '60', '300'] as const
export type ReportAutoSaveInterval = (typeof reportAutoSaveIntervals)[number]
export function isReportAutoSaveInterval(value: unknown): value is ReportAutoSaveInterval {
  return reportAutoSaveIntervals.some((interval) => interval === value)
}
export type NoteEnterAction = 'send' | 'newline'
export interface Preferences {
  noteEnterAction: NoteEnterAction
  themeMode: ThemeMode
  localePreference: string | null
  reportAutoSaveInterval: ReportAutoSaveInterval
}
export type ErrorCode =
  | 'llm-auth'
  | 'llm-network'
  | 'llm-timeout'
  | 'llm-unsupported'
  | 'llm-response'
  | 'llm-key'
  | 'storage'
  | 'empty'
  | 'too-long'
  | 'time'
  | 'state'
  | 'version'
  | 'conflict'
  | 'directory-not-empty'
  | 'invalid-directory'
export interface ReportWrite {
  date: string
  content: string
  previous: string
}
export type Result<T> = { ok: true; value: T } | { ok: false; error: ErrorCode }
export interface Bootstrap {
  preferences: Preferences
  locale: Locale
  dark: boolean
  preferenceError: boolean
  platform: string
  dataDirectory: string
}
export type ModelParameters = Record<string, unknown>
export const defaultModelParameters = { temperature: 0.7, max_tokens: 4096 } as const
export interface LLMModel {
  id: string
  providerId: string
  name: string
  modelId: string
  parameters: ModelParameters
}
export interface LLMProvider {
  id: string
  name: string
  baseUrl: string
  hasApiKey: boolean
  models: LLMModel[]
}
export interface ProviderWrite {
  id: string | null
  name: string
  baseUrl: string
  // undefined preserves the saved key; an empty string clears it.
  apiKey?: string
}
export interface ModelWrite {
  id: string | null
  providerId: string
  name: string
  modelId: string
  parameters: ModelParameters
}
export type TaskStatus = 'pending' | 'in_progress' | 'completed'
export interface TaskWrite {
  id: string
  type: 'todo' | 'schedule'
  name: string
  isAllDay: boolean
  startAt: number | null
  endAt: number | null
  startDate: string | null
  endDateExclusive: string | null
  timeZone: string
  location: string | null
  link: string | null
  repeatRule: {
    frequency: 'daily' | 'weekly' | 'monthly' | 'yearly'
    interval: number
    untilDate: string | null
  } | null
}
export interface TaskOccurrence extends TaskWrite {
  taskId: string
  recurrenceKey: string
  status: TaskStatus
  updatedAt: number
  completedAt: number | null
}
export interface DayflowAPI {
  tasks(): Promise<Result<TaskOccurrence[]>>
  createTask(input: TaskWrite): Promise<Result<TaskOccurrence[]>>
  setTaskStatus(
    id: string,
    status: TaskStatus,
    updatedAt: number,
    beforeId?: string | null
  ): Promise<Result<TaskOccurrence[]>>
  fetchProviderModels(id: string): Promise<Result<string[]>>
  llmProviders(): Promise<Result<LLMProvider[]>>
  saveProvider(input: ProviderWrite): Promise<Result<LLMProvider[]>>
  deleteProvider(id: string): Promise<Result<LLMProvider[]>>
  saveModel(input: ModelWrite): Promise<Result<LLMProvider[]>>
  deleteModel(id: string): Promise<Result<LLMProvider[]>>
  bootstrap(): Promise<Result<Bootstrap>>
  list(date: string | null): Promise<Result<Log[]>>
  find(id: string): Promise<Result<Log | null>>
  create(input: CreateLog): Promise<Result<Log>>
  edit(
    id: string,
    content: NoteContent,
    recordedAt: number | null,
    timeZone: string,
    taskId?: string | null
  ): Promise<Result<Log>>
  change(id: string, action: 'trash' | 'restore' | 'delete'): Promise<Result<Log | null>>
  preference(key: keyof Preferences, value: string): Promise<Result<Preferences>>
  reports(): Promise<Result<Record<string, string>>>
  saveReports(writes: ReportWrite[]): Promise<Result<Record<string, string>>>
  createReport(date: string): Promise<Result<string>>
  deleteReport(date: string, previous: string): Promise<Result<null>>
  chooseDataDirectory(): Promise<Result<string | null>>
  migrateDataDirectory(path: string): Promise<Result<string>>
  openDataDirectory(): Promise<Result<null>>
  finishClose(): void
  cancelClose(): void
  ready(): void
  onClose(callback: () => void): () => void
  onSystemTheme(callback: (dark: boolean) => void): () => void
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
