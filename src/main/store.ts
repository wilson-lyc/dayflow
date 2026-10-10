import * as taskService from './task-service'
import { DatabaseSync } from 'node:sqlite'
import { existsSync, rmSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { app, nativeTheme, safeStorage } from 'electron'
import {
  localDate,
  isReportAutoSaveInterval,
  defaultModelParameters,
  validDate,
  type CreateLog,
  type Log,
  type NoteContent,
  type Preferences,
  type Bootstrap,
  type ReportWrite,
  type ProviderWrite,
  type ModelWrite,
  type LLMProvider
} from '../shared/model'

import { isLocale, resolveLocale } from '../shared/languages'
import { DataDirectory, ServiceError } from './data-directory'
import { fetchModelIds } from './llm-discovery'
import { initializeDatabase } from './database-schema'
export { ServiceError } from './data-directory'

let data: DataDirectory | undefined
function dataFiles(): DataDirectory {
  if (!data) data = new DataDirectory(app.getPath('home'), app.getPath('userData'))
  data.ensureAvailable()
  return data
}
export function dataDirectory(): string {
  return dataFiles().root
}
let db: DatabaseSync | undefined
function database(): DatabaseSync {
  const storage = dataFiles()
  const path = join(storage.root, 'dayflow.sqlite')
  if (db) {
    if (!existsSync(path)) throw new ServiceError('storage')
    return db
  }
  if (storage.configured && !existsSync(path)) throw new ServiceError('storage')
  const candidate = new DatabaseSync(path)
  try {
    initializeDatabase(candidate)
    storage.remember()
    db = candidate
    return db
  } catch (error) {
    try {
      candidate.exec('ROLLBACK')
    } catch {
      /* no transaction */
    }
    candidate.close()
    throw error
  }
}
function map(row: Record<string, unknown>): Log {
  return {
    id: String(row.id),
    taskId: row.task_id === null ? null : String(row.task_id),
    taskName: row.task_name == null ? null : String(row.task_name),
    type: String(row.type),
    content: JSON.parse(String(row.content_json)) as NoteContent,
    recordedAt: Number(row.recorded_at),
    timeZone: String(row.time_zone),
    localDate: String(row.local_date),
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
    isDeleted: row.is_deleted === 1
  }
}
export function find(id: string): Log | null {
  const row = database()
    .prepare(
      'SELECT l.*,t.name AS task_name FROM logs l LEFT JOIN tasks t ON t.id=l.task_id WHERE l.id=?'
    )
    .get(id)
  return row ? map(row) : null
}
export function list(date: string | null): Log[] {
  if (date !== null && !validDate(date)) throw new ServiceError('time')
  return (
    date === null
      ? database()
          .prepare(
            'SELECT l.*,t.name AS task_name FROM logs l LEFT JOIN tasks t ON t.id=l.task_id WHERE l.is_deleted=1 ORDER BY l.updated_at DESC,l.id ASC'
          )
          .all()
      : database()
          .prepare(
            'SELECT l.*,t.name AS task_name FROM logs l LEFT JOIN tasks t ON t.id=l.task_id WHERE l.local_date=? AND l.is_deleted=0 ORDER BY l.recorded_at,l.created_at,l.id'
          )
          .all(date)
  ).map(map)
}
function validate(content: NoteContent, at: number, zone: string): string {
  if (
    !content ||
    typeof content !== 'object' ||
    typeof content.text !== 'string' ||
    !Array.isArray(content.codeCards)
  )
    throw new ServiceError('state')
  const ids = new Set<string>()
  let length = Array.from(content.text).length
  for (const card of content.codeCards) {
    if (
      !card ||
      typeof card.id !== 'string' ||
      !card.id.trim() ||
      ids.has(card.id) ||
      typeof card.name !== 'string' ||
      typeof card.language !== 'string' ||
      typeof card.code !== 'string' ||
      !card.code.trim()
    )
      throw new ServiceError('state')
    ids.add(card.id)
    length += Array.from(card.code).length
  }
  if (!content.text.trim()) throw new ServiceError('empty')
  if (length > 10000) throw new ServiceError('too-long')
  if (!Number.isSafeInteger(at) || at > Date.now()) throw new ServiceError('time')
  try {
    return localDate(at, zone)
  } catch {
    throw new ServiceError('time')
  }
}
export function create(input: CreateLog): Log {
  if (!input || !/^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i.test(input.id))
    throw new ServiceError('state')
  const date = validate(input.content, input.recordedAt, input.timeZone)
  if (!validDate(input.targetDate) || date !== input.targetDate) throw new ServiceError('time')
  const existing = find(input.id)
  if (existing) return existing
  const taskId = input.taskId ?? null
  if (
    taskId !== null &&
    (typeof taskId !== 'string' ||
      !database().prepare('SELECT id FROM tasks WHERE id=? AND deleted_at IS NULL').get(taskId))
  )
    throw new ServiceError('state')
  const now = Date.now()
  database()
    .prepare(
      'INSERT INTO logs (id,type,content_json,recorded_at,time_zone,local_date,created_at,updated_at,task_id,is_deleted) VALUES(?,?,?,?,?,?,?,?,?,0)'
    )
    .run(
      input.id,
      'manual',
      JSON.stringify(input.content),
      input.recordedAt,
      input.timeZone,
      date,
      now,
      now,
      taskId
    )
  return find(input.id)!
}
export function edit(
  id: string,
  content: NoteContent,
  at: number | null,
  zone: string,
  taskId?: string | null
): Log {
  const log = find(id)
  if (!log || log.isDeleted || log.type !== 'manual') throw new ServiceError('state')
  const nextTaskId = taskId === undefined ? log.taskId : taskId
  if (
    nextTaskId !== null &&
    nextTaskId !== log.taskId &&
    (typeof nextTaskId !== 'string' ||
      !database().prepare('SELECT id FROM tasks WHERE id=? AND deleted_at IS NULL').get(nextTaskId))
  )
    throw new ServiceError('state')
  const recordedAt = at === null ? Date.now() : at
  const date = validate(content, recordedAt, zone)
  const serialized = JSON.stringify(content)
  if (
    JSON.stringify(log.content) !== serialized ||
    log.recordedAt !== recordedAt ||
    log.timeZone !== zone ||
    log.taskId !== nextTaskId
  ) {
    database()
      .prepare(
        'UPDATE logs SET content_json=?,recorded_at=?,time_zone=?,local_date=?,updated_at=?,task_id=? WHERE id=? AND is_deleted=0 AND type=?'
      )
      .run(serialized, recordedAt, zone, date, Date.now(), nextTaskId, id, 'manual')
  }
  return find(id)!
}
export function change(id: string, action: 'trash' | 'restore' | 'delete'): Log | null {
  const log = find(id)
  if (!log || (action === 'trash' ? log.isDeleted : !log.isDeleted)) throw new ServiceError('state')
  if (action === 'delete')
    database().prepare('DELETE FROM logs WHERE id=? AND is_deleted=1').run(id)
  else if (action === 'trash' || action === 'restore')
    database()
      .prepare('UPDATE logs SET is_deleted=?,updated_at=? WHERE id=?')
      .run(action === 'trash' ? 1 : 0, Date.now(), id)
  else throw new ServiceError('state')
  return find(id)
}
export function preferences(): Preferences {
  const rows = database().prepare('SELECT key,value_json FROM app_settings').all()
  const values: Record<string, unknown> = {}
  for (const row of rows) values[String(row.key)] = JSON.parse(String(row.value_json))
  return {
    noteEnterAction: values.noteEnterAction === 'send' ? 'send' : 'newline',
    themeMode: ['light', 'dark', 'system'].includes(String(values.themeMode))
      ? (values.themeMode as Preferences['themeMode'])
      : 'system',
    localePreference: typeof values.localePreference === 'string' ? values.localePreference : null,
    reportAutoSaveInterval: isReportAutoSaveInterval(values.reportAutoSaveInterval)
      ? values.reportAutoSaveInterval
      : 'off'
  }
}
export function preference(key: keyof Preferences, value: string): Preferences {
  if (
    !(key === 'noteEnterAction' && ['send', 'newline'].includes(value)) &&
    !(key === 'themeMode' && ['light', 'dark', 'system'].includes(value)) &&
    !(key === 'localePreference' && isLocale(value)) &&
    !(key === 'reportAutoSaveInterval' && isReportAutoSaveInterval(value))
  )
    throw new ServiceError('state')
  const previous = preferences()
  database()
    .prepare(
      'INSERT INTO app_settings VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json,updated_at=excluded.updated_at'
    )
    .run(key, JSON.stringify(value), Date.now())
  if (key === 'themeMode') nativeTheme.themeSource = value as Preferences['themeMode']
  return { ...previous, [key]: value } as Preferences
}
export function bootstrap(): Bootstrap {
  database()
  let prefs: Preferences = {
    noteEnterAction: 'newline',
    themeMode: 'system',
    localePreference: null,
    reportAutoSaveInterval: 'off'
  }
  let preferenceError = false
  try {
    prefs = preferences()
  } catch {
    preferenceError = true
  }
  nativeTheme.themeSource = prefs.themeMode
  return {
    preferences: prefs,
    locale: resolveLocale(prefs.localePreference, app.getPreferredSystemLanguages()),
    dark: nativeTheme.shouldUseDarkColors,
    preferenceError,
    platform: process.platform,
    dataDirectory: dataDirectory()
  }
}

export function reports(): Record<string, string> {
  database()
  return dataFiles().reports()
}
export function saveReports(writes: ReportWrite[]): Record<string, string> {
  database()
  return dataFiles().saveReports(writes)
}
export function createReport(date: string): string {
  database()
  return dataFiles().createReport(date)
}
export function deleteReport(date: string, previous: string): null {
  database()
  return dataFiles().deleteReport(date, previous)
}
export function migrateDataDirectory(path: string): string {
  database()
  return dataFiles().migrate(
    path,
    () => {
      const checkpoint = db!.prepare('PRAGMA wal_checkpoint(TRUNCATE)').get()
      if (Number(checkpoint?.busy) !== 0) throw new ServiceError('storage')
      db!.close()
      db = undefined
    },
    (root) => {
      const check = new DatabaseSync(join(root, 'dayflow.sqlite'), { readOnly: true })
      try {
        if (check.prepare('PRAGMA integrity_check').get()?.integrity_check !== 'ok')
          throw new ServiceError('storage')
        check.prepare('SELECT id FROM logs LIMIT 0').all()
        check.prepare('SELECT key FROM app_settings LIMIT 0').all()
      } finally {
        check.close()
        // A read-only WAL connection may leave fresh shared-memory files.
        rmSync(join(root, 'dayflow.sqlite-shm'), { force: true })
        rmSync(join(root, 'dayflow.sqlite-wal'), { force: true })
      }
    }
  )
}

export function llmProviders(): LLMProvider[] {
  const connection = database()
  const models = connection.prepare('SELECT * FROM llm_models ORDER BY created_at,id').all()
  return connection
    .prepare('SELECT * FROM llm_providers ORDER BY created_at,id')
    .all()
    .map((row) => ({
      id: String(row.id),
      name: String(row.name),
      baseUrl: String(row.base_url),
      hasApiKey: row.api_key !== null,
      models: models
        .filter((model) => model.provider_id === row.id)
        .map((model) => ({
          id: String(model.id),
          providerId: String(model.provider_id),
          name: String(model.name),
          modelId: String(model.model_id),
          parameters: JSON.parse(String(model.parameters_json))
        }))
    }))
}
export async function fetchProviderModels(id: string): Promise<string[]> {
  if (typeof id !== 'string') throw new ServiceError('state')
  const provider = database()
    .prepare('SELECT base_url,api_key FROM llm_providers WHERE id=?')
    .get(id)
  if (!provider) throw new ServiceError('state')
  let apiKey = ''
  if (provider.api_key !== null) {
    try {
      if (!safeStorage.isEncryptionAvailable()) throw new Error()
      apiKey = safeStorage.decryptString(Buffer.from(provider.api_key as Uint8Array))
    } catch {
      throw new ServiceError('llm-key')
    }
  }
  return fetchModelIds(String(provider.base_url), apiKey)
}
function configurationText(value: unknown, max = 200): string {
  if (typeof value !== 'string' || !value.trim() || value.length > max)
    throw new ServiceError('state')
  return value.trim()
}
export function saveProvider(input: ProviderWrite): LLMProvider[] {
  if (!input || (input.id !== null && typeof input.id !== 'string')) throw new ServiceError('state')
  const name = configurationText(input.name)
  const baseUrl = configurationText(input.baseUrl, 2048)
  try {
    const url = new URL(baseUrl)
    if (
      !['https:', 'http:'].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    )
      throw new Error('url')
  } catch {
    throw new ServiceError('state')
  }
  const connection = database()
  const previous =
    input.id === null
      ? null
      : connection.prepare('SELECT * FROM llm_providers WHERE id=?').get(input.id)
  if (input.id !== null && !previous) throw new ServiceError('state')
  let key = previous?.api_key ?? null
  if (input.apiKey !== undefined) {
    if (typeof input.apiKey !== 'string' || input.apiKey.length > 8192)
      throw new ServiceError('state')
    if (input.apiKey.trim()) {
      if (!safeStorage.isEncryptionAvailable()) throw new ServiceError('storage')
      key = new Uint8Array(safeStorage.encryptString(input.apiKey.trim()))
    } else key = null
  }
  const now = Date.now()
  connection
    .prepare(
      `INSERT INTO llm_providers VALUES(?,?,?,?,?,?)
    ON CONFLICT(id) DO UPDATE SET name=excluded.name,base_url=excluded.base_url,api_key=excluded.api_key,updated_at=excluded.updated_at`
    )
    .run(
      input.id ?? randomUUID(),
      name,
      baseUrl,
      key,
      previous ? Number(previous.created_at) : now,
      now
    )
  return llmProviders()
}
export function deleteProvider(id: string): LLMProvider[] {
  if (
    typeof id !== 'string' ||
    database().prepare('DELETE FROM llm_providers WHERE id=?').run(id).changes !== 1
  )
    throw new ServiceError('state')
  return llmProviders()
}
export function saveModel(input: ModelWrite): LLMProvider[] {
  if (
    !input ||
    typeof input.providerId !== 'string' ||
    (input.id !== null && typeof input.id !== 'string')
  )
    throw new ServiceError('state')
  const modelId = configurationText(input.modelId)
  const name = configurationText(input.name || modelId)
  if (!input.parameters || typeof input.parameters !== 'object' || Array.isArray(input.parameters))
    throw new ServiceError('state')
  const parameters = JSON.stringify({ ...defaultModelParameters, ...input.parameters })
  if (parameters.length > 20000) throw new ServiceError('too-long')
  const { temperature, max_tokens: maxTokens } = input.parameters
  if (
    (temperature !== undefined &&
      (typeof temperature !== 'number' ||
        !Number.isFinite(temperature) ||
        temperature < 0 ||
        temperature > 2)) ||
    (maxTokens !== undefined &&
      (typeof maxTokens !== 'number' || !Number.isSafeInteger(maxTokens) || maxTokens < 1))
  )
    throw new ServiceError('state')
  const connection = database()
  if (!connection.prepare('SELECT id FROM llm_providers WHERE id=?').get(input.providerId))
    throw new ServiceError('state')
  const previous =
    input.id === null
      ? null
      : connection
          .prepare('SELECT * FROM llm_models WHERE id=? AND provider_id=?')
          .get(input.id, input.providerId)
  if (input.id !== null && !previous) throw new ServiceError('state')
  const duplicate = connection
    .prepare('SELECT id FROM llm_models WHERE provider_id=? AND model_id=?')
    .get(input.providerId, modelId)
  if (duplicate && duplicate.id !== input.id) throw new ServiceError('conflict')
  const now = Date.now()
  connection
    .prepare(
      `INSERT INTO llm_models VALUES(?,?,?,?,?,?,?)
    ON CONFLICT(id) DO UPDATE SET name=excluded.name,model_id=excluded.model_id,parameters_json=excluded.parameters_json,updated_at=excluded.updated_at`
    )
    .run(
      input.id ?? randomUUID(),
      input.providerId,
      name,
      modelId,
      parameters,
      previous ? Number(previous.created_at) : now,
      now
    )
  return llmProviders()
}
export function deleteModel(id: string): LLMProvider[] {
  if (
    typeof id !== 'string' ||
    database().prepare('DELETE FROM llm_models WHERE id=?').run(id).changes !== 1
  )
    throw new ServiceError('state')
  return llmProviders()
}

export function tasks(): import('../shared/model').TaskOccurrence[] {
  return taskService.list(database())
}
export function createTask(
  input: import('../shared/model').TaskWrite
): import('../shared/model').TaskOccurrence[] {
  return taskService.create(database(), input)
}
export function setTaskStatus(
  id: string,
  status: import('../shared/model').TaskStatus,
  updatedAt: number,
  beforeId?: string | null
): import('../shared/model').TaskOccurrence[] {
  return taskService.setStatus(database(), id, status, updatedAt, beforeId)
}
