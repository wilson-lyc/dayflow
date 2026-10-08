import type { DatabaseSync } from 'node:sqlite'
import {
  localDate,
  validDate,
  type TaskWrite,
  type TaskOccurrence,
  type TaskStatus
} from '../shared/model'
import { ServiceError } from './data-directory'

type Row = Record<string, unknown>
function nullableNumber(value: unknown): number | null {
  return value === null ? null : Number(value)
}
function nullableText(value: unknown): string | null {
  return value === null ? null : String(value)
}
function definition(row: Row): TaskWrite {
  return {
    id: String(row.id),
    type: row.type as TaskWrite['type'],
    name: String(row.name),
    isAllDay: row.is_all_day === 1,
    startAt: nullableNumber(row.start_at),
    endAt: nullableNumber(row.end_at),
    startDate: nullableText(row.start_date),
    endDateExclusive: nullableText(row.end_date_exclusive),
    timeZone: String(row.time_zone),
    location: nullableText(row.location),
    link: nullableText(row.link),
    repeatRule: row.frequency
      ? {
          frequency: row.frequency as NonNullable<TaskWrite['repeatRule']>['frequency'],
          interval: Number(row.interval),
          untilDate: nullableText(row.until_date)
        }
      : null
  }
}
function validate(input: TaskWrite): TaskWrite {
  if (
    !input ||
    typeof input.id !== 'string' ||
    !/^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i.test(input.id) ||
    !['todo', 'schedule'].includes(input.type) ||
    typeof input.isAllDay !== 'boolean'
  )
    throw new ServiceError('state')
  if (typeof input.name !== 'string' || !input.name.trim()) throw new ServiceError('empty')
  if (Array.from(input.name.trim()).length > 200) throw new ServiceError('too-long')
  try {
    if (typeof input.timeZone !== 'string') throw new Error()
    localDate(Date.now(), input.timeZone)
  } catch {
    throw new ServiceError('time')
  }
  if (input.isAllDay) {
    if (
      input.startAt !== null ||
      input.endAt !== null ||
      !validDate(input.startDate!) ||
      !validDate(input.endDateExclusive!) ||
      input.endDateExclusive! <= input.startDate!
    )
      throw new ServiceError('time')
  } else {
    if (
      input.startDate !== null ||
      input.endDateExclusive !== null ||
      (input.startAt !== null &&
        (!Number.isSafeInteger(input.startAt) ||
          !Number.isFinite(new Date(input.startAt).getTime()))) ||
      (input.endAt !== null &&
        (!Number.isSafeInteger(input.endAt) ||
          input.startAt === null ||
          input.endAt <= input.startAt ||
          !Number.isFinite(new Date(input.endAt).getTime()))) ||
      (input.type === 'schedule' && (input.startAt === null || input.endAt === null))
    )
      throw new ServiceError('time')
  }
  const text = (value: string | null, max: number): string | null => {
    if (value !== null && typeof value !== 'string') throw new ServiceError('state')
    if (value && Array.from(value).length > max) throw new ServiceError('too-long')
    return value?.trim() || null
  }
  const link = text(input.link, 2048)
  if (link) {
    try {
      if (!['http:', 'https:'].includes(new URL(link).protocol)) throw new Error()
    } catch {
      throw new ServiceError('state')
    }
  }
  const rule = input.repeatRule
  if (rule) {
    if (
      !['daily', 'weekly', 'monthly', 'yearly'].includes(rule.frequency) ||
      !Number.isSafeInteger(rule.interval) ||
      rule.interval < 1 ||
      rule.interval > 1000
    )
      throw new ServiceError('state')
    if (!input.isAllDay && (input.startAt === null || input.endAt === null))
      throw new ServiceError('time')
    const start = input.startDate ?? localDate(input.startAt!, input.timeZone)
    if (rule.untilDate !== null && (!validDate(rule.untilDate) || rule.untilDate < start))
      throw new ServiceError('time')
  } else if (rule !== null) throw new ServiceError('state')
  return { ...input, name: input.name.trim(), location: text(input.location, 500), link }
}
function transaction<T>(db: DatabaseSync, operation: () => T): T {
  db.exec('BEGIN IMMEDIATE')
  try {
    const result = operation()
    db.exec('COMMIT')
    return result
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
}
function persist(db: DatabaseSync, task: TaskOccurrence, now: number): void {
  db.prepare('INSERT INTO task_occurrences VALUES(?,?,?,?,?,?,?,?,0,?,?)').run(
    task.id,
    task.taskId,
    task.recurrenceKey,
    Number(task.isAllDay),
    task.startAt,
    task.endAt,
    task.startDate,
    task.endDateExclusive,
    now,
    now
  )
  if (task.type === 'todo')
    db.prepare('INSERT INTO todo_occurrence_states VALUES(?,?,NULL)').run(task.id, 'pending')
}
export function create(db: DatabaseSync, raw: TaskWrite): TaskOccurrence[] {
  const input = validate(raw)
  transaction(db, () => {
    const existing = db
      .prepare(
        `SELECT t.*,r.frequency,r.interval,r.until_date FROM tasks t LEFT JOIN task_repeat_rules r ON r.task_id=t.id WHERE t.id=?`
      )
      .get(input.id)
    if (existing) {
      if (
        Object.entries(definition(existing)).some(
          ([key, value]) => JSON.stringify(value) !== JSON.stringify(input[key as keyof TaskWrite])
        )
      )
        throw new ServiceError('conflict')
      return
    }
    const now = Date.now()
    db.prepare('INSERT INTO tasks VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,NULL)').run(
      input.id,
      input.type,
      input.name,
      Number(input.isAllDay),
      input.startAt,
      input.endAt,
      input.startDate,
      input.endDateExclusive,
      input.timeZone,
      input.location,
      input.link,
      now,
      now
    )
    if (input.repeatRule)
      db.prepare('INSERT INTO task_repeat_rules VALUES(?,?,?,?)').run(
        input.id,
        input.repeatRule.frequency,
        input.repeatRule.interval,
        input.repeatRule.untilDate
      )
    else
      persist(
        db,
        {
          ...input,
          id: `${input.id}:single`,
          taskId: input.id,
          recurrenceKey: 'single',
          status: 'pending',
          updatedAt: now,
          completedAt: null
        },
        now
      )
  })
  return list(db)
}
// Convert a local wall clock to UTC, preserving the earlier instant on a repeated clock.
function zonedTime(date: string, clock: string, zone: string): number {
  const target = Date.parse(`${date}T${clock}Z`)
  let instant = target
  const formatter = new Intl.DateTimeFormat('sv-SE', {
    timeZone: zone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23'
  })
  for (let i = 0; i < 4; i++) {
    const shown = Date.parse(formatter.format(instant).replace(' ', 'T') + 'Z')
    const next = instant + target - shown
    if (next === instant) return instant
    if (i === 3) return Math.max(instant, next)
    instant = next
  }
  return instant
}
function advance(date: string, frequency: string, amount: number): string | null {
  const d = new Date(`${date}T12:00:00Z`),
    day = d.getUTCDate(),
    month = d.getUTCMonth()
  if (frequency === 'daily' || frequency === 'weekly')
    d.setUTCDate(day + amount * (frequency === 'weekly' ? 7 : 1))
  else if (frequency === 'monthly') {
    d.setUTCDate(1)
    d.setUTCMonth(month + amount)
    d.setUTCDate(day)
    if (d.getUTCDate() !== day || d.getUTCMonth() !== (month + amount) % 12) return null
  } else {
    d.setUTCFullYear(d.getUTCFullYear() + amount)
    if (d.getUTCMonth() !== month || d.getUTCDate() !== day) return null
  }
  return Number.isFinite(d.getTime()) ? d.toISOString().slice(0, 10) : null
}
export function list(db: DatabaseSync, now = Date.now()): TaskOccurrence[] {
  const saved = new Map(
    db
      .prepare(
        `SELECT o.*,s.manual_status,s.completed_at FROM task_occurrences o LEFT JOIN todo_occurrence_states s ON s.occurrence_id=o.id`
      )
      .all()
      .map((row) => [String(row.id), row])
  )
  const result: TaskOccurrence[] = []
  for (const row of db
    .prepare(
      `SELECT t.*,r.frequency,r.interval,r.until_date FROM tasks t LEFT JOIN task_repeat_rules r ON r.task_id=t.id WHERE t.deleted_at IS NULL ORDER BY t.created_at DESC,t.id`
    )
    .all()) {
    const task = definition(row)
    const anchor =
      task.startDate ?? (task.startAt === null ? null : localDate(task.startAt, task.timeZone))
    const clock =
      task.startAt === null
        ? ''
        : new Intl.DateTimeFormat('sv-SE', {
            timeZone: task.timeZone,
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hourCycle: 'h23'
          }).format(task.startAt)
    for (let index = 0; index < 10000; index++) {
      const date = task.repeatRule
        ? advance(anchor!, task.repeatRule.frequency, index * task.repeatRule.interval)
        : anchor
      if (task.repeatRule && !date) continue
      if (task.repeatRule?.untilDate && date! > task.repeatRule.untilDate) break
      const startAt =
        task.isAllDay || task.startAt === null
          ? null
          : index === 0
            ? task.startAt
            : zonedTime(date!, clock, task.timeZone)
      const days = task.isAllDay
        ? (Date.parse(task.endDateExclusive!) - Date.parse(task.startDate!)) / 86400000
        : 0
      const endAt = task.endAt === null ? null : startAt! + task.endAt - task.startAt!
      const startDate = task.isAllDay ? date : null
      const endDateExclusive = task.isAllDay ? advance(date!, 'daily', days) : null
      const key = task.repeatRule ? (task.isAllDay ? date! : String(startAt)) : 'single'
      const id = `${task.id}:${key}`,
        record = saved.get(id)
      const future = task.isAllDay
        ? date! > localDate(now, task.timeZone)
        : startAt !== null && startAt > now
      if (!record?.is_cancelled) {
        const occurrence: TaskOccurrence = {
          ...task,
          id,
          taskId: task.id,
          recurrenceKey: key,
          startAt,
          endAt,
          startDate,
          endDateExclusive,
          status:
            task.type === 'todo'
              ? ((record?.manual_status as TaskStatus) ?? 'pending')
              : task.isAllDay
                ? localDate(now, task.timeZone) < startDate!
                  ? 'pending'
                  : localDate(now, task.timeZone) >= endDateExclusive!
                    ? 'completed'
                    : 'in_progress'
                : now < startAt!
                  ? 'pending'
                  : now >= endAt!
                    ? 'completed'
                    : 'in_progress',
          updatedAt: Number(record?.updated_at ?? row.updated_at),
          completedAt: record?.completed_at == null ? null : Number(record.completed_at)
        }
        result.push(occurrence)
      }
      if (!task.repeatRule || future) break
      if (index === 9999) throw new ServiceError('state')
    }
  }
  const orderRow = db
    .prepare("SELECT value_json FROM app_settings WHERE key='taskBoardOrder'")
    .get()
  if (orderRow) {
    const order: string[] = JSON.parse(String(orderRow.value_json))
    const ranks = new Map(order.map((id, index) => [id, index]))
    result.sort((a, b) => (ranks.get(a.id) ?? -1) - (ranks.get(b.id) ?? -1))
  }
  return result
}
export function setStatus(
  db: DatabaseSync,
  id: string,
  status: TaskStatus,
  updatedAt: number,
  beforeId?: string | null
): TaskOccurrence[] {
  if (
    typeof id !== 'string' ||
    !['pending', 'in_progress', 'completed'].includes(status) ||
    !Number.isSafeInteger(updatedAt)
  )
    throw new ServiceError('state')
  transaction(db, () => {
    const task = list(db).find((task) => task.id === id)
    if (!task || task.type !== 'todo') throw new ServiceError('state')
    if (task.updatedAt !== updatedAt) throw new ServiceError('conflict')
    if (
      beforeId !== undefined &&
      beforeId !== null &&
      (typeof beforeId !== 'string' ||
        beforeId === id ||
        !list(db).some((item) => item.id === beforeId && item.status === status))
    )
      throw new ServiceError('state')
    if (task.status === status && beforeId === undefined) return
    const now = Math.max(Date.now(), task.updatedAt + 1)
    if (task.status !== status) {
      if (!db.prepare('SELECT id FROM task_occurrences WHERE id=?').get(id))
        persist(db, task, task.updatedAt)
      db.prepare(
        'UPDATE todo_occurrence_states SET manual_status=?,completed_at=? WHERE occurrence_id=?'
      ).run(status, status === 'completed' ? now : null, id)
      db.prepare('UPDATE task_occurrences SET updated_at=? WHERE id=?').run(now, id)
    }
    if (beforeId !== undefined) {
      const remaining = list(db).filter((item) => item.id !== id)
      const before = beforeId === null ? -1 : remaining.findIndex((item) => item.id === beforeId)
      const last = remaining.reduce(
        (index, item, current) => (item.status === status ? current : index),
        -1
      )
      const order = remaining.map((item) => item.id)
      order.splice(before >= 0 ? before : last + 1, 0, id)
      db.prepare(
        "INSERT INTO app_settings VALUES('taskBoardOrder',?,?) ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json,updated_at=excluded.updated_at"
      ).run(JSON.stringify(order), now)
    }
  })
  return list(db)
}
