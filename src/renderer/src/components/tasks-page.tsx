import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { localDate, type Locale, type TaskOccurrence, type TaskStatus } from '../../../shared/model'
import { translator, errorKey } from '../lib/i18n'
import { Card, CardHeader, CardTitle, CardContent, CardAction } from './ui/card'

import { TaskCreateDialog } from './task-create-dialog'
import { Alert, AlertDescription } from './ui/alert'
import { Button } from './ui/button'
import { Empty, EmptyTitle } from './ui/empty'
import { Skeleton } from './ui/skeleton'
import { taskStatuses } from '../lib/task-view'
const statusValues: TaskStatus[] = ['pending', 'in_progress', 'completed']
const minimumBoardWidth = 3 * 320 + 2 * 12

export function TasksPage({
  locale,
  active,
  onWideChange,
  onActiveChange,
  createOpen,
  onCreateOpenChange
}: {
  createOpen: boolean
  onCreateOpenChange: (open: boolean) => void
  locale: Locale
  active: number
  onWideChange: (wide: boolean) => void
  onActiveChange: (index: number) => void
}): React.JSX.Element {
  const t = translator(locale)
  const container = useRef<HTMLElement>(null)
  const [wide, setWide] = useState(false)
  const [tasks, setTasks] = useState<TaskOccurrence[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const request = useRef(0)
  const mutating = useRef(false)
  async function load(): Promise<void> {
    if (mutating.current) return
    const version = ++request.current
    try {
      const result = await window.api.tasks()
      if (version !== request.current) return
      if (result.ok) {
        setTasks(result.value)
        setError('')
      } else setError(t(errorKey(result.error)))
    } catch {
      if (version === request.current) setError(t('operationError'))
    } finally {
      if (version === request.current) setLoading(false)
    }
  }
  useEffect(() => {
    queueMicrotask(() => void load())
    const timer = setInterval(() => void load(), 30000)
    const focus = (): void => {
      void load()
    }
    window.addEventListener('focus', focus)
    return () => {
      // This ref is a request counter, not a DOM ref.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      request.current++
      clearInterval(timer)
      window.removeEventListener('focus', focus)
    }
    // Locale only changes error messages; reload on a locale change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locale])
  async function changeStatus(
    id: string,
    target: TaskStatus,
    beforeId?: string | null
  ): Promise<void> {
    const task = tasks.find((task) => task.id === id)
    if (!task || task.type !== 'todo' || saving) return
    setSaving(true)
    mutating.current = true
    ++request.current
    try {
      const result = await window.api.setTaskStatus(id, target, task.updatedAt, beforeId)
      if (result.ok) {
        setTasks(result.value)
        setError('')
      } else {
        setError(t(errorKey(result.error)))
        if (result.error === 'conflict') {
          mutating.current = false
          void load()
        }
      }
    } catch {
      setError(t('operationError'))
    } finally {
      mutating.current = false
      setSaving(false)
    }
  }
  const [draggedId, setDraggedId] = useState<string | null>(null)
  const [dropTarget, setDropTarget] = useState<{
    status: (typeof taskStatuses)[number]
    beforeId: string | null
  } | null>(null)
  const edgeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const edgeTarget = useRef<number | null>(null)
  function clearEdge(): void {
    if (edgeTimer.current) clearTimeout(edgeTimer.current)
    edgeTimer.current = null
    edgeTarget.current = null
  }
  function finishDrag(): void {
    setDraggedId(null)
    setDropTarget(null)
    clearEdge()
  }
  useEffect(() => () => clearEdge(), [])
  const reducedMotion = useReducedMotion()
  useLayoutEffect(() => {
    const element = container.current
    if (!element) return
    const observer = new ResizeObserver(([entry]) => {
      setWide(entry.contentRect.width >= minimumBoardWidth)
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [])
  useLayoutEffect(() => {
    onWideChange(wide)
  }, [wide, onWideChange])
  return (
    <main
      ref={container}
      className="tasks-layout"
      aria-label={t('tasks')}
      onDragOver={(event) => {
        if (!draggedId || wide) return
        const bounds = event.currentTarget.getBoundingClientRect()
        const direction =
          event.clientX < bounds.left + 40 ? -1 : event.clientX > bounds.right - 40 ? 1 : 0
        const target = active + direction
        if (!direction || target < 0 || target >= taskStatuses.length) {
          clearEdge()
          return
        }
        event.preventDefault()
        if (edgeTarget.current === target) return
        clearEdge()
        edgeTarget.current = target
        edgeTimer.current = setTimeout(() => {
          onActiveChange(target)
          setDropTarget(null)
          clearEdge()
        }, 500)
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) clearEdge()
      }}
    >
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
          <Button variant="outline" size="sm" onClick={() => void load()}>
            {t('taskRetry')}
          </Button>
        </Alert>
      )}
      <div className="tasks-viewport">
        <motion.div
          className="tasks-track"
          data-wide={wide}
          initial={false}
          animate={{ x: wide ? '0%' : `${active * -100}%` }}
          transition={{ duration: reducedMotion || wide ? 0 : 0.3, ease: [0.22, 1, 0.36, 1] }}
        >
          {taskStatuses.map((status, index) => (
            <Card
              key={status}
              className="min-w-0"
              aria-labelledby={status}
              inert={!wide && active !== index}
              data-drop-active={dropTarget?.status === status || undefined}
              onDragOver={(event) => {
                if (!draggedId) return
                event.preventDefault()
                event.dataTransfer.dropEffect = 'move'
                const items = Array.from(
                  event.currentTarget.querySelectorAll<HTMLElement>('[data-task-id]')
                )
                const next = items.find((item) => {
                  if (item.dataset.taskId === draggedId) return false
                  const bounds = item.getBoundingClientRect()
                  return event.clientY < bounds.top + bounds.height / 2
                })
                setDropTarget({ status, beforeId: next?.dataset.taskId ?? null })
              }}
              onDrop={(event) => {
                if (!draggedId || !dropTarget || dropTarget.status !== status) return
                event.preventDefault()
                void changeStatus(draggedId, statusValues[index], dropTarget.beforeId)
                finishDrag()
              }}
            >
              <CardHeader>
                <CardTitle id={status}>{t(status)}</CardTitle>
                <CardAction>
                  <span className="text-muted-foreground">
                    {tasks.filter((task) => task.status === statusValues[index]).length}
                  </span>
                </CardAction>
              </CardHeader>
              <CardContent className="min-h-0 flex-1 overflow-y-auto">
                {loading ? (
                  <Skeleton className="h-20" />
                ) : tasks.every((task) => task.status !== statusValues[index]) ? (
                  <Empty>
                    <EmptyTitle>{t('taskNoItems')}</EmptyTitle>
                  </Empty>
                ) : null}
                <ul className="flex flex-col gap-3" aria-label={t(status)}>
                  {tasks
                    .filter((task) => task.status === statusValues[index])
                    .map((task) => (
                      <li
                        key={task.id}
                        className="task-item"
                        data-task-id={task.id}
                        data-dragging={draggedId === task.id || undefined}
                        data-drop-before={
                          (dropTarget?.status === status && dropTarget.beforeId === task.id) ||
                          undefined
                        }
                        draggable={task.type === 'todo' && !saving}
                        onDragStart={(event) => {
                          event.dataTransfer.effectAllowed = 'move'
                          event.dataTransfer.setData('text/plain', task.id)
                          setDraggedId(task.id)
                        }}
                        onDragEnd={finishDrag}
                      >
                        <Card size="sm">
                          <CardHeader>
                            <div className="text-xs text-muted-foreground">
                              {t(task.type === 'todo' ? 'taskTodo' : 'taskSchedule')}
                            </div>
                            <CardTitle>{task.name}</CardTitle>
                          </CardHeader>
                          <CardContent>
                            <div className="flex flex-col gap-1 text-xs text-muted-foreground">
                              <span>
                                {task.isAllDay
                                  ? `${task.startDate}${task.endDateExclusive && Date.parse(task.endDateExclusive) - Date.parse(task.startDate!) > 86400000 ? ` – ${new Date(Date.parse(task.endDateExclusive) - 86400000).toISOString().slice(0, 10)}` : ''} · ${t('taskAllDay')}`
                                  : task.startAt === null
                                    ? t('taskUnscheduled')
                                    : new Intl.DateTimeFormat(locale, {
                                        timeZone: task.timeZone,
                                        dateStyle: 'medium',
                                        timeStyle: 'short'
                                      }).format(task.startAt)}
                                {task.endAt !== null &&
                                  ` – ${new Intl.DateTimeFormat(locale, { timeZone: task.timeZone, dateStyle: 'medium', timeStyle: 'short' }).format(task.endAt)}`}
                              </span>
                              {task.type === 'todo' &&
                                task.status !== 'completed' &&
                                (task.startDate ??
                                  (task.startAt === null
                                    ? null
                                    : localDate(task.startAt, task.timeZone))) &&
                                (task.startDate ?? localDate(task.startAt!, task.timeZone)) <
                                  localDate(Date.now(), task.timeZone) && (
                                  <span>{t('taskCarriedOver')}</span>
                                )}
                              {task.location && <span>{task.location}</span>}
                              {task.link && <span className="break-all">{task.link}</span>}
                              {task.repeatRule && (
                                <span>
                                  {t(`taskRepeat${task.repeatRule.frequency}`)} ·{' '}
                                  {task.repeatRule.interval}
                                </span>
                              )}
                              {task.type === 'todo' && (
                                <div className="flex gap-1">
                                  {statusValues.map((value, statusIndex) => (
                                    <Button
                                      key={value}
                                      size="sm"
                                      variant="ghost"
                                      disabled={saving || task.status === value}
                                      onClick={() => void changeStatus(task.id, value)}
                                    >
                                      {t(taskStatuses[statusIndex])}
                                    </Button>
                                  ))}
                                </div>
                              )}
                            </div>
                          </CardContent>
                        </Card>
                      </li>
                    ))}
                  <li
                    className="task-drop-end"
                    aria-hidden="true"
                    data-drop-before={
                      (dropTarget?.status === status && dropTarget.beforeId === null) || undefined
                    }
                  />
                </ul>
              </CardContent>
            </Card>
          ))}
        </motion.div>
      </div>
      <TaskCreateDialog
        locale={locale}
        open={createOpen}
        onOpenChange={onCreateOpenChange}
        onCreated={(items, id) => {
          ++request.current
          setTasks(items)
          setLoading(false)
          setError('')
          const created = items.find((task) => task.taskId === id)
          onActiveChange(created ? statusValues.indexOf(created.status) : 0)
        }}
      />
    </main>
  )
}
