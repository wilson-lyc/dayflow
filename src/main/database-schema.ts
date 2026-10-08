import type { DatabaseSync } from 'node:sqlite'
import { ServiceError } from './data-directory'

export const DATABASE_VERSION = 3

// Development databases are disposable. Keep only the current schema, without migrations.
const schema = `
CREATE TABLE logs (id TEXT NOT NULL PRIMARY KEY, type TEXT NOT NULL CHECK(length(type)>0), content TEXT NOT NULL,
  recorded_at INTEGER NOT NULL, time_zone TEXT NOT NULL, local_date TEXT NOT NULL, created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL, is_deleted INTEGER NOT NULL DEFAULT 0 CHECK(is_deleted IN (0,1)));
CREATE INDEX idx_logs_active_date_recorded ON logs(local_date,recorded_at,created_at,id) WHERE is_deleted=0;
CREATE INDEX idx_logs_trash_updated ON logs(updated_at DESC,id ASC) WHERE is_deleted=1;
CREATE TABLE app_settings (key TEXT PRIMARY KEY, value_json TEXT NOT NULL, updated_at INTEGER NOT NULL);
CREATE TABLE llm_providers (
  id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL, base_url TEXT NOT NULL,
  api_key BLOB, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
CREATE TABLE llm_models (
  id TEXT PRIMARY KEY NOT NULL, provider_id TEXT NOT NULL REFERENCES llm_providers(id) ON DELETE CASCADE,
  name TEXT NOT NULL, model_id TEXT NOT NULL, parameters_json TEXT NOT NULL CHECK(json_valid(parameters_json)),
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
  UNIQUE(provider_id, model_id));
CREATE INDEX idx_llm_models_provider ON llm_models(provider_id);
CREATE TABLE tasks (
  id TEXT NOT NULL PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('todo', 'schedule')),
  name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 200),
  is_all_day INTEGER NOT NULL DEFAULT 0 CHECK (is_all_day IN (0, 1)),
  start_at INTEGER,
  end_at INTEGER,
  start_date TEXT,
  end_date_exclusive TEXT,
  time_zone TEXT NOT NULL,
  location TEXT,
  link TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER,
  CHECK (
    (is_all_day = 1 AND start_at IS NULL AND end_at IS NULL
      AND start_date IS NOT NULL AND end_date_exclusive IS NOT NULL
      AND end_date_exclusive > start_date)
    OR
    (is_all_day = 0 AND start_date IS NULL AND end_date_exclusive IS NULL
      AND (end_at IS NULL OR (start_at IS NOT NULL AND end_at > start_at)))
  ),
  CHECK (type = 'todo' OR is_all_day = 1
    OR (start_at IS NOT NULL AND end_at IS NOT NULL))
);

CREATE TABLE task_repeat_rules (
  task_id TEXT NOT NULL PRIMARY KEY REFERENCES tasks(id) ON DELETE CASCADE,
  frequency TEXT NOT NULL CHECK (frequency IN ('daily', 'weekly', 'monthly', 'yearly')),
  interval INTEGER NOT NULL DEFAULT 1 CHECK (interval > 0),
  until_date TEXT
);

CREATE TABLE task_occurrences (
  id TEXT NOT NULL PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  recurrence_key TEXT NOT NULL,
  is_all_day INTEGER NOT NULL CHECK (is_all_day IN (0, 1)),
  start_at INTEGER,
  end_at INTEGER,
  start_date TEXT,
  end_date_exclusive TEXT,
  is_cancelled INTEGER NOT NULL DEFAULT 0 CHECK (is_cancelled IN (0, 1)),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE (task_id, recurrence_key),
  CHECK (
    (is_all_day = 1 AND start_at IS NULL AND end_at IS NULL
      AND start_date IS NOT NULL AND end_date_exclusive IS NOT NULL
      AND end_date_exclusive > start_date)
    OR
    (is_all_day = 0 AND start_date IS NULL AND end_date_exclusive IS NULL
      AND (end_at IS NULL OR (start_at IS NOT NULL AND end_at > start_at)))
  )
);

CREATE TABLE todo_occurrence_states (
  occurrence_id TEXT NOT NULL PRIMARY KEY
    REFERENCES task_occurrences(id) ON DELETE CASCADE,
  manual_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (manual_status IN ('pending', 'in_progress', 'completed')),
  completed_at INTEGER,
  CHECK (
    (manual_status = 'completed' AND completed_at IS NOT NULL)
    OR (manual_status <> 'completed' AND completed_at IS NULL)
  )
);

CREATE INDEX idx_tasks_active_time ON tasks(start_at, end_at)
  WHERE deleted_at IS NULL AND is_all_day = 0;
CREATE INDEX idx_tasks_active_date ON tasks(start_date, end_date_exclusive)
  WHERE deleted_at IS NULL AND is_all_day = 1;
CREATE INDEX idx_occurrences_time ON task_occurrences(start_at, end_at)
  WHERE is_cancelled = 0 AND is_all_day = 0;
CREATE INDEX idx_occurrences_date ON task_occurrences(start_date, end_date_exclusive)
  WHERE is_cancelled = 0 AND is_all_day = 1;
`

export function initializeDatabase(database: DatabaseSync): void {
  const version = Number(database.prepare('PRAGMA user_version').get()!.user_version)
  if (version > DATABASE_VERSION) throw new ServiceError('version')
  database.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = FULL; PRAGMA busy_timeout = 3000;')
  if (version !== DATABASE_VERSION) {
    database.exec('PRAGMA foreign_keys = OFF; BEGIN IMMEDIATE;')
    try {
      const tables = database
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
        .all()
      for (const { name } of tables) {
        database.exec(`DROP TABLE "${String(name).replaceAll('"', '""')}"`)
      }
      database.exec(schema)
      database.exec(`PRAGMA user_version = ${DATABASE_VERSION}; COMMIT;`)
    } catch (error) {
      database.exec('ROLLBACK')
      throw error
    } finally {
      database.exec('PRAGMA foreign_keys = ON')
    }
  } else {
    database.exec('PRAGMA foreign_keys = ON')
  }
}
