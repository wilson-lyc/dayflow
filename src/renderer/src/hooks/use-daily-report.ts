import { useCallback, useEffect, useRef, useState } from 'react'
import { validDate, type ReportAutoSaveInterval } from '../../../shared/model'

const storageKey = 'dayflow.daily-reports.v1'
type Reports = Record<string, string>
type ReportState = {
  reports: Reports
  saved: Reports
  error: 'read' | 'save' | null
}

function readReports(): Reports {
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
  interval: ReportAutoSaveInterval
): {
  content: string
  error: 'read' | 'save' | null
  dirty: boolean
  hasUnsaved: boolean
  onChange: (content: string) => void
  save: () => boolean
  saveAll: () => boolean
  retry: () => void
} {
  const [state, setState] = useState<ReportState>(() => {
    try {
      const reports = readReports()
      return { reports, saved: reports, error: null }
    } catch {
      return { reports: {}, saved: {}, error: 'read' }
    }
  })
  // Event handlers and the fixed timer use the latest draft without restarting on each keystroke.
  const stateRef = useRef(state)
  const assign = useCallback((next: ReportState): void => {
    stateRef.current = next
    setState(next)
  }, [])

  const persist = useCallback(
    (selected?: string): boolean => {
      const current = stateRef.current
      if (current.error === 'read') return false
      const dates = changedDates(current).filter(
        (day) => selected === undefined || day === selected
      )
      if (dates.length === 0) {
        if (current.error === 'save' && changedDates(current).length === 0)
          assign({ ...current, error: null })
        return true
      }
      const saved = { ...current.saved }
      for (const day of dates) saved[day] = current.reports[day]
      try {
        localStorage.setItem(storageKey, JSON.stringify(saved))
        assign({ ...current, saved, error: null })
        return true
      } catch {
        assign({ ...current, error: 'save' })
        return false
      }
    },
    [assign]
  )

  const save = useCallback(() => persist(date), [date, persist])
  const saveAll = useCallback(() => persist(), [persist])
  useEffect(() => {
    if (interval === 'off') return
    const timer = setInterval(saveAll, Number(interval) * 1000)
    return () => clearInterval(timer)
  }, [interval, saveAll])

  return {
    content: state.reports[date] ?? '',
    error: state.error,
    dirty: (state.reports[date] ?? '') !== (state.saved[date] ?? ''),
    hasUnsaved: changedDates(state).length > 0,
    save,
    saveAll,
    onChange: (content) => {
      const current = stateRef.current
      if (current.error === 'read' || content === (current.reports[date] ?? '')) return
      assign({ ...current, reports: { ...current.reports, [date]: content } })
    },
    retry: () => {
      if (stateRef.current.error === 'save') saveAll()
      else if (stateRef.current.error === 'read') {
        try {
          const reports = readReports()
          assign({ reports, saved: reports, error: null })
        } catch {
          assign({ ...stateRef.current, error: 'read' })
        }
      }
    }
  }
}
