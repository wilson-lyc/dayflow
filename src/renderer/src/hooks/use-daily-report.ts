import { useCallback, useEffect, useRef, useState } from 'react'
import { validDate, type ReportAutoSaveInterval } from '../../../shared/model'

const storageKey = 'dayflow.daily-reports.v1'
const migratedKey = 'dayflow.daily-reports.migrated.v1'
type Reports = Record<string, string>
type ReportError = 'read' | 'save' | 'conflict' | null
type ReportState = {
  reports: Reports
  saved: Reports
  error: ReportError
}

function legacyReports(): Reports {
  if (localStorage.getItem(migratedKey) === 'true') return {}
  const raw = localStorage.getItem(storageKey)
  if (raw === null) return {}
  const value: unknown = JSON.parse(raw)
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Invalid reports')
  if (
    Object.entries(value).some(([date, content]) => !validDate(date) || typeof content !== 'string')
  )
    throw new Error('Invalid report')
  return value as Reports
}

function changedDates(state: ReportState): string[] {
  return Object.keys(state.reports).filter(
    (date) => (state.reports[date] ?? '') !== (state.saved[date] ?? '')
  )
}

export function useDailyReport(
  date: string,
  interval: ReportAutoSaveInterval,
  enabled: boolean
): {
  content: string
  error: ReportError
  loading: boolean
  saving: boolean
  exists: boolean
  creating: boolean
  createError: boolean
  deleting: boolean
  dirty: boolean
  hasUnsaved: boolean
  onChange: (content: string) => void
  save: () => Promise<boolean>
  saveAll: () => Promise<boolean>
  create: () => Promise<boolean>
  remove: () => Promise<boolean>
  retry: () => void
} {
  const [state, setState] = useState<ReportState>({ reports: {}, saved: {}, error: null })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [creating, setCreating] = useState(false)
  const [createErrorDate, setCreateErrorDate] = useState<string | null>(null)
  const creationPending = useRef(false)
  const deletionPending = useRef(false)
  const [deleting, setDeleting] = useState(false)
  const stateRef = useRef(state)
  const loaded = useRef(false)
  const readId = useRef(0)
  const queue = useRef<Promise<boolean>>(Promise.resolve(true))
  const assign = useCallback((next: ReportState): void => {
    stateRef.current = next
    setState(next)
  }, [])

  const read = useCallback(async (): Promise<void> => {
    const request = ++readId.current
    setLoading(true)
    loaded.current = false
    try {
      const result = await window.api.reports(legacyReports())
      if (request !== readId.current) return
      if (!result.ok) throw new Error(result.error)
      assign({ reports: result.value, saved: result.value, error: null })
      loaded.current = true
      // Keep the original localStorage content as a migration backup.
      try {
        localStorage.setItem(migratedKey, 'true')
      } catch {
        /* disk data is already saved */
      }
    } catch {
      if (request === readId.current) assign({ ...stateRef.current, error: 'read' })
    } finally {
      if (request === readId.current) setLoading(false)
    }
  }, [assign])
  useEffect(() => {
    let active = true
    queueMicrotask(() => {
      if (enabled && active) void read()
    })
    return () => {
      active = false
    }
  }, [enabled, read])

  const persist = useCallback(
    (selected?: string): Promise<boolean> => {
      const operation = async (): Promise<boolean> => {
        if (!loaded.current || stateRef.current.error === 'read') return false
        const current = stateRef.current
        const dates = changedDates(current).filter(
          (day) => selected === undefined || day === selected
        )
        if (!dates.length) {
          if (changedDates(current).length === 0) assign({ ...current, error: null })
          return true
        }
        setSaving(true)
        try {
          for (const day of dates) {
            const result = await window.api.saveReports([
              {
                date: day,
                content: current.reports[day],
                previous: current.saved[day] ?? ''
              }
            ])
            if (!result.ok) {
              assign({
                ...stateRef.current,
                error: result.error === 'conflict' ? 'conflict' : 'save'
              })
              return false
            }
            // Track each successful file even if a later date fails to save.
            // Keystrokes made while IPC was pending stay in the draft.
            assign({
              ...stateRef.current,
              saved: { ...stateRef.current.saved, ...result.value },
              error: null
            })
          }
          return true
        } catch {
          assign({ ...stateRef.current, error: 'save' })
          return false
        } finally {
          setSaving(false)
        }
      }
      queue.current = queue.current.then(operation, operation)
      return queue.current
    },
    [assign]
  )

  const save = useCallback(() => persist(date), [date, persist])
  const saveAll = useCallback(() => persist(), [persist])
  const create = useCallback((): Promise<boolean> => {
    if (!loaded.current || creationPending.current || deletionPending.current)
      return Promise.resolve(false)
    creationPending.current = true
    setCreating(true)
    setCreateErrorDate(null)
    const operation = async (): Promise<boolean> => {
      try {
        if (!loaded.current) return false
        if (Object.hasOwn(stateRef.current.reports, date)) return true
        const result = await window.api.createReport(date)
        if (!result.ok) throw new Error(result.error)
        const current = stateRef.current
        assign({
          ...current,
          reports: { ...current.reports, [date]: result.value },
          saved: { ...current.saved, [date]: result.value }
        })
        return true
      } catch {
        setCreateErrorDate(date)
        return false
      } finally {
        creationPending.current = false
        setCreating(false)
      }
    }
    queue.current = queue.current.then(operation, operation)
    return queue.current
  }, [assign, date])
  const remove = useCallback((): Promise<boolean> => {
    if (!loaded.current || creationPending.current || deletionPending.current)
      return Promise.resolve(false)
    deletionPending.current = true
    setDeleting(true)
    const operation = async (): Promise<boolean> => {
      try {
        if (!loaded.current) return false
        const result = await window.api.deleteReport(date, stateRef.current.saved[date] ?? '')
        if (!result.ok) {
          if (result.error === 'conflict') assign({ ...stateRef.current, error: 'conflict' })
          return false
        }
        const current = stateRef.current
        const reports = { ...current.reports }
        const saved = { ...current.saved }
        delete reports[date]
        delete saved[date]
        assign({ reports, saved, error: null })
        return true
      } catch {
        return false
      } finally {
        deletionPending.current = false
        setDeleting(false)
      }
    }
    queue.current = queue.current.then(operation, operation)
    return queue.current
  }, [assign, date])
  useEffect(() => {
    if (!enabled) return
    const refresh = (): void => {
      const operation = async (): Promise<boolean> => {
        // Other editors can change clean reports. Never replace an unsaved draft.
        if (loaded.current && !changedDates(stateRef.current).length) await read()
        return true
      }
      queue.current = queue.current.then(operation, operation)
    }
    window.addEventListener('focus', refresh)
    return () => window.removeEventListener('focus', refresh)
  }, [enabled, read])
  useEffect(() => {
    if (!enabled || interval === 'off') return
    const timer = setInterval(
      () => {
        void saveAll()
      },
      Number(interval) * 1000
    )
    return () => clearInterval(timer)
  }, [enabled, interval, saveAll])

  return {
    content: state.reports[date] ?? '',
    error: state.error,
    loading,
    saving,
    exists: Object.hasOwn(state.reports, date),
    creating,
    createError: createErrorDate === date,
    deleting,
    dirty: (state.reports[date] ?? '') !== (state.saved[date] ?? ''),
    hasUnsaved: changedDates(state).length > 0,
    save,
    saveAll,
    create,
    remove,
    onChange: (content) => {
      const current = stateRef.current
      if (
        !loaded.current ||
        deletionPending.current ||
        !Object.hasOwn(current.reports, date) ||
        current.error === 'read' ||
        content === (current.reports[date] ?? '')
      )
        return
      assign({ ...current, reports: { ...current.reports, [date]: content } })
    },
    retry: () => {
      if (stateRef.current.error === 'read') void read()
      else void saveAll()
    }
  }
}
