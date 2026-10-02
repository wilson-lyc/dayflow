import { DatabaseSync } from 'node:sqlite'
import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { app, nativeTheme } from 'electron'
import {
  localDate,
  validDate,
  type CreateLog,
  type Log,
  type Preferences,
  type Bootstrap,
  type ErrorCode
} from '../shared/model'

import { isLocale, resolveLocale } from '../shared/languages'

export class ServiceError extends Error {
  constructor(public code: ErrorCode) {
    super(code)
  }
}
let db: DatabaseSync | undefined
function database(): DatabaseSync {
  if (db) return db
  const path = join(app.getPath('userData'), 'data', 'dayflow.sqlite')
  mkdirSync(dirname(path), { recursive: true })
  const candidate = new DatabaseSync(path)
  try {
    const hasMigrations = candidate
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='schema_migrations'")
      .get()
    const version = hasMigrations
      ? Number(
          candidate
            .prepare('SELECT COALESCE(MAX(version),0) AS version FROM schema_migrations')
            .get()!.version
        )
      : 0
    if (version > 1) throw new ServiceError('version')
    candidate.exec(
      'PRAGMA journal_mode = WAL; PRAGMA synchronous = FULL; PRAGMA busy_timeout = 3000;'
    )
    if (version === 0) {
      // This project has no earlier business schema. Never overwrite an unknown existing logs table.
      if (
        candidate.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='logs'").get()
      )
        throw new ServiceError('version')
      candidate.exec(`BEGIN IMMEDIATE;
        CREATE TABLE logs (id TEXT NOT NULL PRIMARY KEY, type TEXT NOT NULL CHECK(length(type)>0), content TEXT NOT NULL,
          recorded_at INTEGER NOT NULL, time_zone TEXT NOT NULL, local_date TEXT NOT NULL, created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL, is_deleted INTEGER NOT NULL DEFAULT 0 CHECK(is_deleted IN (0,1)));
        CREATE INDEX idx_logs_active_date_recorded ON logs(local_date,recorded_at,created_at,id) WHERE is_deleted=0;
        CREATE INDEX idx_logs_trash_updated ON logs(updated_at DESC,id ASC) WHERE is_deleted=1;
        CREATE TABLE app_settings (key TEXT PRIMARY KEY, value_json TEXT NOT NULL, updated_at INTEGER NOT NULL);
        CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY CHECK(version>0), applied_at INTEGER NOT NULL);`)
      candidate.prepare('INSERT INTO schema_migrations VALUES(1,?)').run(Date.now())
      candidate.exec('COMMIT')
    }
    candidate
      .prepare(
        'SELECT id,type,content,recorded_at,time_zone,local_date,created_at,updated_at,is_deleted FROM logs LIMIT 0'
      )
      .all()
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
    type: String(row.type),
    content: String(row.content),
    recordedAt: Number(row.recorded_at),
    timeZone: String(row.time_zone),
    localDate: String(row.local_date),
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
    isDeleted: row.is_deleted === 1
  }
}
export function find(id: string): Log | null {
  const row = database().prepare('SELECT * FROM logs WHERE id=?').get(id)
  return row ? map(row) : null
}
export function list(date: string | null): Log[] {
  if (date !== null && !validDate(date)) throw new ServiceError('time')
  return (
    date === null
      ? database()
          .prepare('SELECT * FROM logs WHERE is_deleted=1 ORDER BY updated_at DESC,id ASC')
          .all()
      : database()
          .prepare(
            'SELECT * FROM logs WHERE local_date=? AND is_deleted=0 ORDER BY recorded_at,created_at,id'
          )
          .all(date)
  ).map(map)
}
function validate(content: string, at: number, zone: string): string {
  if (typeof content !== 'string' || !content.trim()) throw new ServiceError('empty')
  if (Array.from(content).length > 10000) throw new ServiceError('too-long')
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
  const now = Date.now()
  database()
    .prepare('INSERT INTO logs VALUES(?,?,?,?,?,?,?,?,0)')
    .run(input.id, 'manual', input.content, input.recordedAt, input.timeZone, date, now, now)
  return find(input.id)!
}
export function edit(id: string, content: string, at: number | null, zone: string): Log {
  const log = find(id)
  if (!log || log.isDeleted || log.type !== 'manual') throw new ServiceError('state')
  const recordedAt = at === null ? Date.now() : at
  const date = validate(content, recordedAt, zone)
  if (log.content !== content || log.recordedAt !== recordedAt || log.timeZone !== zone) {
    database()
      .prepare(
        'UPDATE logs SET content=?,recorded_at=?,time_zone=?,local_date=?,updated_at=? WHERE id=? AND is_deleted=0 AND type=?'
      )
      .run(content, recordedAt, zone, date, Date.now(), id, 'manual')
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
    themeMode: ['light', 'dark', 'system'].includes(String(values.themeMode))
      ? (values.themeMode as Preferences['themeMode'])
      : 'system',
    localePreference: typeof values.localePreference === 'string' ? values.localePreference : null
  }
}
export function preference(key: keyof Preferences, value: string): Preferences {
  if (
    !(key === 'themeMode' && ['light', 'dark', 'system'].includes(value)) &&
    !(key === 'localePreference' && isLocale(value))
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
  let prefs: Preferences = { themeMode: 'system', localePreference: null }
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
    platform: process.platform
  }
}
