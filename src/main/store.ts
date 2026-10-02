import { DatabaseSync } from 'node:sqlite'
import {
  mkdirSync,
  readFileSync,
  writeFileSync,
  renameSync,
  unlinkSync,
  existsSync,
  watch
} from 'node:fs'
import { dirname, join } from 'node:path'
import { app, nativeTheme, BrowserWindow } from 'electron'
import {
  localDate,
  validDate,
  type Draft,
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
let epoch = 0
let cacheExisted = false
let cacheWatching = false
const cacheFile = (): string =>
  process.platform === 'darwin'
    ? join(app.getPath('home'), 'Library', 'Caches', 'Dayflow', 'draft.json')
    : join(app.getPath('userData'), 'cache', 'draft.json')
function resetIfMissing(): void {
  if (cacheExisted && !existsSync(cacheFile())) {
    cacheExisted = false
    epoch++
    BrowserWindow.getAllWindows().forEach((w) => w.webContents.send('dayflow:cache-reset', epoch))
  }
}
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
function validateDraft(draft: Draft): void {
  if (
    draft.version !== 1 ||
    typeof draft.content !== 'string' ||
    !validDate(draft.targetDate) ||
    !['current-time', 'custom'].includes(draft.timeMode) ||
    !Number.isFinite(draft.cachedAt)
  )
    throw new ServiceError('cache')
  try {
    localDate(Date.now(), draft.timeZone)
  } catch {
    throw new ServiceError('cache')
  }
  if (draft.recordedAt !== null && !Number.isSafeInteger(draft.recordedAt))
    throw new ServiceError('cache')
  if (
    draft.pendingSubmission &&
    (!/^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i.test(
      draft.pendingSubmission.id
    ) ||
      !Number.isSafeInteger(draft.pendingSubmission.recordedAt))
  )
    throw new ServiceError('cache')
}
export function cache(draft: Draft | null, expectedEpoch: number): number {
  resetIfMissing()
  if (epoch !== expectedEpoch) throw new ServiceError('cache-reset')
  try {
    mkdirSync(dirname(cacheFile()), { recursive: true })
    if (!draft) {
      if (existsSync(cacheFile())) unlinkSync(cacheFile())
      cacheExisted = false
      epoch++
    } else {
      validateDraft(draft)
      const temp = `${cacheFile()}.tmp`
      writeFileSync(temp, JSON.stringify(draft), { encoding: 'utf8', mode: 0o600, flush: true })
      renameSync(temp, cacheFile())
      cacheExisted = true
    }
    return epoch
  } catch (error) {
    if (error instanceof ServiceError) throw error
    throw new ServiceError('cache')
  }
}
export function create(
  draft: Draft,
  expectedEpoch: number
): { log: Log; cacheCleared: boolean; cacheEpoch: number } {
  database()
  validateDraft(draft)
  const pending = draft.pendingSubmission
  if (!pending) throw new ServiceError('state')
  const existing = find(pending.id)
  if (!existing) {
    const date = validate(draft.content, pending.recordedAt, pending.timeZone)
    if (date !== draft.targetDate) throw new ServiceError('time')
    cache(draft, expectedEpoch)
    const now = Date.now()
    database()
      .prepare('INSERT INTO logs VALUES(?,?,?,?,?,?,?,?,0)')
      .run(
        pending.id,
        'manual',
        draft.content,
        pending.recordedAt,
        pending.timeZone,
        date,
        now,
        now
      )
  }
  const log = find(pending.id)!
  let cacheCleared = true
  try {
    cache(null, expectedEpoch)
  } catch {
    cacheCleared = false
  }
  return { log, cacheCleared, cacheEpoch: epoch }
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
  let draft: Draft | null = null
  try {
    resetIfMissing()
    const parsed = JSON.parse(readFileSync(cacheFile(), 'utf8')) as Draft
    validateDraft(parsed)
    draft = parsed
    cacheExisted = true
    if (draft.pendingSubmission && find(draft.pendingSubmission.id)) {
      try {
        cache(null, epoch)
      } catch {
        /* keep deduplication token on disk */
      }
      draft = null
    }
  } catch {
    draft = null
  }
  try {
    if (!cacheWatching) {
      mkdirSync(dirname(cacheFile()), { recursive: true })
      watch(dirname(cacheFile()), { persistent: false }, () => {
        setTimeout(resetIfMissing, 100)
      }).on('error', () => {
        cacheWatching = false
      })
      cacheWatching = true
    }
  } catch {
    /* An unavailable draft cache must not block formal logs. */
  }
  return {
    preferences: prefs,
    locale: resolveLocale(prefs.localePreference, app.getPreferredSystemLanguages()),
    dark: nativeTheme.shouldUseDarkColors,
    draft,
    cacheEpoch: epoch,
    preferenceError,
    platform: process.platform
  }
}
