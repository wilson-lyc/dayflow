import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  MoreHorizontal,
  Settings,
  Trash2
} from 'lucide-react'
import { Button } from './components/ui/button'
import { Textarea } from './components/ui/textarea'
import { Input } from './components/ui/input'
import { Field, FieldGroup, FieldLabel, FieldError } from './components/ui/field'
import { Alert, AlertDescription } from './components/ui/alert'
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription } from './components/ui/empty'
import { Skeleton } from './components/ui/skeleton'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue
} from './components/ui/select'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger
} from './components/ui/dropdown-menu'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter
} from './components/ui/alert-dialog'
import { DatePicker } from './components/date-picker'
import { DateTimePicker } from './components/date-time-picker'
import { NoteComposer } from './components/note-composer'
import { NoteBody } from './components/note-body'
import {
  blankDraft,
  today,
  shiftDay,
  parseDay,
  timeText,
  wallTime,
  systemZone,
  hasDraft,
  type Draft
} from './lib/dates'
import { translator, errorKey, languages, type MessageKey } from './lib/i18n'
import { cn } from './lib/utils'
import { resolveLocale } from '../../shared/languages'
import { localDate } from '../../shared/model'
import type { Log, Locale, Preferences, ErrorCode } from '../../shared/model'

type View = 'daily' | 'trash' | 'settings'
type Editor = {
  log: Log
  content: string
  date: string
  time: string
  current: boolean
  touchedTime: boolean
  error: ErrorCode | null
}
type Notice = { key: MessageKey; date?: string; trash?: boolean; warning?: boolean; id?: string }
type Confirmation = { kind: 'trash' | 'delete'; log: Log } | { kind: 'leave' }
const api = window.api

function App(): React.JSX.Element {
  const [locale, setLocale] = useState<Locale>(() => resolveLocale(null, navigator.languages))
  const t = translator(locale)
  const [prefs, setPrefs] = useState<Preferences>({ themeMode: 'system', localePreference: null })
  const [platform, setPlatform] = useState('darwin')
  const [ready, setReady] = useState(false)
  const [bootError, setBootError] = useState<ErrorCode | null>(null)
  const [view, setView] = useState<View>('daily')
  const viewRef = useRef<View>('daily')
  const [returnView, setReturnView] = useState<'daily' | 'trash'>('daily')
  const [settingsModule, setSettingsModule] = useState<'general' | 'appearance'>('general')
  const [date, setDate] = useState(today)
  const dateRef = useRef(date)
  const [clockTimestamp, setClockTimestamp] = useState(Date.now)
  const clockDate = localDate(clockTimestamp, systemZone())
  const [logs, setLogs] = useState<Log[]>([])
  const [listState, setListState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [draft, setDraft] = useState<Draft>(() => blankDraft())
  const draftRef = useRef(draft)
  const [saveError, setSaveError] = useState<ErrorCode | null>(null)
  const [busy, setBusy] = useState(false)
  const busyRef = useRef(false)
  const editablePending = useRef(true)
  const [pendingEditable, setPendingEditable] = useState(true)
  const [editor, setEditor] = useState<Editor | null>(null)
  const editorRef = useRef(editor)
  const [notice, setNotice] = useState<Notice | null>(null)
  const [preferenceError, setPreferenceError] = useState(false)
  const [preferenceBusy, setPreferenceBusy] = useState(false)
  const [failedPreference, setFailedPreference] = useState<{
    key: keyof Preferences
    value: string
  } | null>(null)
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null)
  const [confirmError, setConfirmError] = useState<ErrorCode | null>(null)
  const leaveAction = useRef<(() => void) | null>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)
  const loadId = useRef(0)
  const scrollTarget = useRef<string | 'bottom' | null>('bottom')
  const mounted = useRef(true)
  const deferredClose = useRef(false)
  const trashScroll = useRef(0)
  const restoreTrashScroll = useRef(false)
  const focusSettings = useRef(false)
  const settingsContentRef = useRef<HTMLElement>(null)

  const assignDraft = useCallback((next: Draft): void => {
    draftRef.current = next
    setDraft(next)
  }, [])
  const assignEditor = (next: Editor | null): void => {
    editorRef.current = next
    setEditor(next)
  }
  const setLocked = (value: boolean): void => {
    busyRef.current = value
    setBusy(value)
    if (!value && deferredClose.current) {
      deferredClose.current = false
      queueMicrotask(() => closeHandler.current())
    }
  }
  function resetDraft(next = blankDraft(dateRef.current)): void {
    assignDraft(next)
    setSaveError(null)
    editablePending.current = true
    setPendingEditable(true)
  }

  function updateDraft(patch: Partial<Draft>): void {
    if (busyRef.current || editorRef.current) return
    if (draftRef.current.pendingSubmission && !editablePending.current) {
      setSaveError('state')
      return
    }
    setClockTimestamp(Date.now())
    const next = { ...draftRef.current, ...patch, pendingSubmission: null }
    assignDraft(next)
    setSaveError(null)
  }
  const load = useCallback(
    async (
      selected: string,
      page: View,
      target: string | 'bottom' | null = null
    ): Promise<void> => {
      if (page === 'settings') return
      const request = ++loadId.current
      setListState('loading')
      setLogs([])
      const result = await api.list(page === 'trash' ? null : selected)
      if (!mounted.current || request !== loadId.current) return
      if (!result.ok) {
        setListState('error')
        return
      }
      scrollTarget.current = target
      setLogs(result.value)
      setListState('ready')
    },
    []
  )
  function navigate(
    page: View,
    selected = dateRef.current,
    target: string | 'bottom' = 'bottom'
  ): void {
    if (page === 'settings') {
      if (viewRef.current === 'trash') trashScroll.current = listRef.current?.scrollTop ?? 0
      setReturnView(viewRef.current === 'trash' ? 'trash' : 'daily')
      loadId.current++
    }
    if (viewRef.current === 'settings' && page !== 'settings') {
      focusSettings.current = true
      restoreTrashScroll.current = page === 'trash'
    }
    if (!hasDraft(draftRef.current) && selected !== dateRef.current)
      resetDraft(blankDraft(selected))
    dateRef.current = selected
    setDate(selected)
    viewRef.current = page
    setView(page)
    if (page !== 'settings') void load(selected, page, target)
  }
  useLayoutEffect(() => {
    if (listState !== 'ready' || !scrollTarget.current) return
    const target = scrollTarget.current
    scrollTarget.current = null
    if (restoreTrashScroll.current) {
      restoreTrashScroll.current = false
      listRef.current?.scrollTo({ top: trashScroll.current })
    } else if (target === 'bottom') listRef.current?.scrollTo({ top: listRef.current.scrollHeight })
    else document.getElementById(`note-${target}`)?.scrollIntoView({ block: 'nearest' })
    if (focusSettings.current) {
      focusSettings.current = false
      document.getElementById('settings-entry')?.focus()
    }
  }, [logs, listState])

  async function boot(): Promise<void> {
    setBootError(null)
    setReady(false)
    const result = await api.bootstrap()
    if (!mounted.current) return
    if (!result.ok) {
      setBootError(result.error)
      api.ready()
      return
    }
    const value = result.value
    setLocale(value.locale)
    setPrefs(value.preferences)
    setPlatform(value.platform)
    document.documentElement.classList.toggle('dark', value.dark)
    setPreferenceError(value.preferenceError)
    if (value.preferenceError) setNotice({ key: 'preferencesError', warning: true })
    setReady(true)
    requestAnimationFrame(() => api.ready())
    await load(dateRef.current, viewRef.current, 'bottom')
    requestAnimationFrame(() => inputRef.current?.focus())
  }
  useEffect(() => {
    mounted.current = true
    queueMicrotask(() => {
      if (mounted.current) void boot()
    })
    const removeTheme = api.onSystemTheme((dark) =>
      document.documentElement.classList.toggle('dark', dark)
    )
    const timer = setInterval(() => setClockTimestamp(Date.now()), 1000)
    return () => {
      mounted.current = false
      removeTheme()
      clearInterval(timer)
    }
    // Bootstrap and listeners run once; event handlers use refs for current data.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  useEffect(() => {
    document.documentElement.lang = locale
  }, [locale])
  useEffect(() => {
    if (!notice || notice.warning || notice.date || notice.trash) return
    const timer = setTimeout(() => setNotice(null), 5000)
    return () => clearTimeout(timer)
  }, [notice])

  function dirty(): boolean {
    const edit = editorRef.current
    return (
      !!edit &&
      (edit.content !== edit.log.content ||
        edit.current ||
        (edit.touchedTime &&
          wallTime(edit.date, edit.time, edit.log.timeZone) !== edit.log.recordedAt))
    )
  }
  function protect(action: () => void): void {
    if (busyRef.current) return
    if (dirty()) {
      leaveAction.current = action
      setConfirmError(null)
      setConfirmation({ kind: 'leave' })
    } else {
      assignEditor(null)
      action()
    }
  }
  const closeHandler = useRef<() => void>(() => {})
  useLayoutEffect(() => {
    closeHandler.current = () => {
      if (busyRef.current) {
        deferredClose.current = true
        return
      }
      protect(() => api.finishClose())
    }
  })
  useEffect(() => api.onClose(() => closeHandler.current()), [])

  function draftValidation(): MessageKey | null {
    if (!draft.content.trim()) return 'empty'
    if (Array.from(draft.content).length > 10000) return 'tooLong'
    if (draft.pendingSubmission) {
      return draft.pendingSubmission.recordedAt > clockTimestamp ? 'invalidTime' : null
    }
    if (draft.targetDate > clockDate) return 'invalidTime'
    if (draft.timeMode === 'current-time' && draft.targetDate !== clockDate) return 'specifyTime'
    if (
      draft.timeMode === 'custom' &&
      (draft.recordedAt === null || draft.recordedAt > clockTimestamp)
    )
      return 'invalidTime'
    return null
  }
  async function submit(submittedAt: number): Promise<void> {
    if (!ready || busyRef.current || editorRef.current || draftValidation()) return
    setLocked(true)
    setSaveError(null)
    const original = draftRef.current
    const pending = original.pendingSubmission ?? {
      id: crypto.randomUUID(),
      recordedAt: original.timeMode === 'current-time' ? submittedAt : original.recordedAt!,
      timeZone: original.timeZone
    }
    const submission = { ...original, pendingSubmission: pending }
    assignDraft(submission)
    editablePending.current = false
    setPendingEditable(false)
    const result = await api.create({
      ...pending,
      content: original.content,
      targetDate: original.targetDate
    })
    if (!result.ok) {
      const existing = await api.find(pending.id)
      if (existing.ok && existing.value) {
        await finishSubmission(existing.value)
        setLocked(false)
        return
      }
      editablePending.current = existing.ok && !existing.value
      setPendingEditable(existing.ok && !existing.value)
      setSaveError(result.error)
      setLocked(false)
      return
    }
    await finishSubmission(result.value)
    setLocked(false)
  }
  async function finishSubmission(log: Log): Promise<void> {
    resetDraft(blankDraft(log.localDate))
    setNotice({ key: 'recorded' })
    navigate('daily', log.localDate, log.id)
    requestAnimationFrame(() => inputRef.current?.focus())
  }
  function beginEdit(log: Log): void {
    protect(() =>
      assignEditor({
        log,
        content: log.content,
        date: log.localDate,
        time: timeText(log.recordedAt, log.timeZone),
        current: false,
        touchedTime: false,
        error: null
      })
    )
  }
  function modifyEditor(patch: Partial<Editor>): void {
    if (editorRef.current) assignEditor({ ...editorRef.current, ...patch, error: null })
  }
  async function saveEdit(): Promise<boolean> {
    const edit = editorRef.current
    if (!edit || busyRef.current) return false
    const at = edit.current
      ? null
      : edit.touchedTime
        ? wallTime(edit.date, edit.time, edit.log.timeZone)
        : edit.log.recordedAt
    if (!edit.current && at === null) {
      modifyEditor({ error: 'time' })
      return false
    }
    setLocked(true)
    const result = await api.edit(edit.log.id, edit.content, at, edit.log.timeZone)
    setLocked(false)
    if (!result.ok) {
      modifyEditor({ error: result.error })
      setConfirmError(result.error)
      return false
    }
    assignEditor(null)
    if (result.value.localDate !== dateRef.current)
      setNotice({ key: 'moved', date: result.value.localDate, id: result.value.id })
    else scrollTarget.current = result.value.id
    setLogs((previous) =>
      previous
        .map((log) => (log.id === result.value.id ? result.value : log))
        .filter((log) => log.localDate === dateRef.current)
        .sort(
          (a, b) =>
            a.recordedAt - b.recordedAt || a.createdAt - b.createdAt || a.id.localeCompare(b.id)
        )
    )
    return true
  }
  async function operate(log: Log, action: 'trash' | 'restore' | 'delete'): Promise<void> {
    if (busyRef.current) return
    setLocked(true)
    setConfirmError(null)
    const result = await api.change(log.id, action)
    setLocked(false)
    if (!result.ok) {
      if (action === 'restore') setNotice({ key: errorKey(result.error), warning: true })
      else setConfirmError(result.error)
      return
    }
    setConfirmation(null)
    setLogs((previous) => previous.filter((item) => item.id !== log.id))
    if (action === 'restore') setNotice({ key: 'restored', date: log.localDate, id: log.id })
    else setNotice({ key: action === 'trash' ? 'trashed' : 'deleted', trash: action === 'trash' })
  }
  async function changePreference(key: keyof Preferences, value: string): Promise<void> {
    if (preferenceBusy) return
    setPreferenceBusy(true)
    setPreferenceError(false)
    const result = await api.preference(key, value)
    setPreferenceBusy(false)
    if (!result.ok) {
      setPreferenceError(true)
      setFailedPreference({ key, value })
      return
    }
    setFailedPreference(null)
    setPrefs(result.value)
    if (key === 'localePreference') setLocale(value as Locale)
  }
  async function confirm(): Promise<void> {
    if (!confirmation || busyRef.current) return
    if (confirmation.kind === 'trash' || confirmation.kind === 'delete') {
      await operate(confirmation.log, confirmation.kind)
      return
    }
    if (confirmation.kind === 'leave') {
      if (await saveEdit()) {
        setConfirmation(null)
        const next = leaveAction.current
        leaveAction.current = null
        next?.()
      }
    }
  }
  const wordCount = Array.from(draft.content).length
  const invalid = draftValidation()
  const selectedLabel = new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'short'
  }).format(parseDay(date))
  const count =
    listState === 'loading'
      ? '—'
      : listState === 'error'
        ? t('countUnavailable')
        : t('count', { n: logs.length })
  const confirmKind = confirmation?.kind
  const confirmTitle: MessageKey =
    confirmKind === 'trash'
      ? 'trashConfirm'
      : confirmKind === 'delete'
        ? 'deleteConfirm'
        : 'unsaved'
  const confirmHint: MessageKey =
    confirmKind === 'trash' ? 'trashHint' : confirmKind === 'delete' ? 'deleteHint' : 'unsavedHint'
  const dateChange = (selected: string): void => protect(() => navigate('daily', selected))

  return (
    <div className={cn('window-shell', platform !== 'darwin' && 'other-platform')}>
      <header className="window-top">
        {view === 'daily' ? (
          <>
            <div className="date-navigation">
              <Button
                variant="ghost"
                size="icon"
                aria-label={t('previous')}
                disabled={busy}
                onClick={() => dateChange(shiftDay(date, -1))}
              >
                <ChevronLeft />
              </Button>
              <DatePicker
                date={date}
                locale={locale}
                label={selectedLabel}
                disabled={busy}
                onChange={dateChange}
              />
              <Button
                variant="ghost"
                size="icon"
                aria-label={t('next')}
                disabled={busy}
                onClick={() => dateChange(shiftDay(date, 1))}
              >
                <ChevronRight />
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={date === clockDate || busy}
                onClick={() => dateChange(today())}
              >
                {t('today')}
              </Button>
              <span className="note-count">{count}</span>
            </div>
            <div className="top-spacer" />
            <nav className="top-actions">
              <Button
                variant="ghost"
                disabled={busy}
                onClick={() => protect(() => navigate('trash'))}
              >
                <Trash2 data-icon="inline-start" />
                {t('trash')}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                id="settings-entry"
                aria-label={t('settings')}
                disabled={busy}
                onClick={() => protect(() => navigate('settings'))}
              >
                <Settings />
              </Button>
            </nav>
          </>
        ) : (
          <>
            <Button
              variant="ghost"
              disabled={busy}
              onClick={() => protect(() => navigate(view === 'settings' ? returnView : 'daily'))}
            >
              <ArrowLeft data-icon="inline-start" />
              {t('back')}
            </Button>
            <span className="top-title">{t(view === 'settings' ? 'settings' : 'trash')}</span>
            {view === 'trash' && (
              <>
                <span className="note-count">{count}</span>
                <div className="top-spacer" />
                <Button
                  variant="ghost"
                  size="icon"
                  id="settings-entry"
                  aria-label={t('settings')}
                  onClick={() => navigate('settings')}
                  disabled={busy}
                >
                  <Settings />
                </Button>
              </>
            )}
          </>
        )}
      </header>
      {notice && (
        <div className="feedback-area" role="status">
          <Alert variant={notice.warning ? 'destructive' : 'default'}>
            <AlertDescription className="flex flex-wrap items-center gap-2">
              <span>{t(notice.key, { date: notice.date ?? '' })}</span>
              {notice.date && (
                <Button
                  variant="link"
                  size="sm"
                  onClick={() =>
                    protect(() => navigate('daily', notice.date!, notice.id ?? 'bottom'))
                  }
                >
                  {t('viewDay')}
                </Button>
              )}
              {notice.trash && (
                <Button variant="link" size="sm" onClick={() => protect(() => navigate('trash'))}>
                  {t('trash')}
                </Button>
              )}
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setNotice(null)}
                aria-label={t('close')}
              >
                ×
              </Button>
            </AlertDescription>
          </Alert>
        </div>
      )}
      {bootError ? (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>{t('openError')}</EmptyTitle>
            <EmptyDescription>{t(errorKey(bootError))}</EmptyDescription>
          </EmptyHeader>
          <Button onClick={() => void boot()}>{t('retry')}</Button>
        </Empty>
      ) : !ready ? (
        <div className="loading-notes">
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
        </div>
      ) : view === 'settings' ? (
        <div className="settings-layout">
          <aside className="settings-menu">
            <span className="menu-group">{t('application')}</span>
            {(['general', 'appearance'] as const).map((module) => (
              <Button
                key={module}
                variant={settingsModule === module ? 'secondary' : 'ghost'}
                className="justify-start"
                aria-current={settingsModule === module ? 'page' : undefined}
                onClick={() => {
                  setSettingsModule(module)
                  settingsContentRef.current?.scrollTo({ top: 0 })
                }}
              >
                {t(module)}
              </Button>
            ))}
          </aside>
          <main ref={settingsContentRef} className="settings-content">
            <h1>{t(settingsModule)}</h1>
            <section className="settings-section">
              <h2>{t(settingsModule === 'general' ? 'interface' : 'appearance')}</h2>
              <div className="settings-row">
                <Field orientation="horizontal">
                  <FieldLabel htmlFor="preference">
                    {t(settingsModule === 'general' ? 'language' : 'theme')}
                  </FieldLabel>
                  <Select
                    value={settingsModule === 'general' ? locale : prefs.themeMode}
                    disabled={preferenceBusy}
                    onValueChange={(value) => {
                      if (value)
                        void changePreference(
                          settingsModule === 'general' ? 'localePreference' : 'themeMode',
                          value
                        )
                    }}
                  >
                    <SelectTrigger id="preference" className="min-w-36">
                      <SelectValue>
                        {settingsModule === 'general'
                          ? languages.find((l) => l.code === locale)?.name
                          : t(prefs.themeMode)}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {settingsModule === 'general'
                          ? languages.map((language) => (
                              <SelectItem key={language.code} value={language.code}>
                                {language.name}
                              </SelectItem>
                            ))
                          : (['light', 'dark', 'system'] as const).map((mode) => (
                              <SelectItem key={mode} value={mode}>
                                {t(mode)}
                              </SelectItem>
                            ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </Field>
              </div>
              {preferenceError && (
                <Alert variant="destructive">
                  <AlertDescription>
                    {t('preferenceError')}
                    <Button
                      variant="link"
                      onClick={() => {
                        if (failedPreference)
                          void changePreference(failedPreference.key, failedPreference.value)
                      }}
                    >
                      {t('retry')}
                    </Button>
                  </AlertDescription>
                </Alert>
              )}
            </section>
          </main>
        </div>
      ) : (
        <>
          <main ref={listRef} className="notes-scroll" aria-busy={listState === 'loading'}>
            <div className="notes-content">
              {listState === 'loading' ? (
                <div className="loading-notes">
                  <Skeleton className="h-16" />
                  <Skeleton className="h-16" />
                  <Skeleton className="h-16" />
                </div>
              ) : listState === 'error' ? (
                <Empty>
                  <EmptyHeader>
                    <EmptyTitle>{t(view === 'trash' ? 'trashError' : 'readError')}</EmptyTitle>
                  </EmptyHeader>
                  <Button onClick={() => void load(date, view, 'bottom')}>{t('retry')}</Button>
                </Empty>
              ) : logs.length === 0 ? (
                <Empty>
                  <EmptyHeader>
                    <EmptyTitle>
                      {t(
                        view === 'trash'
                          ? 'emptyTrash'
                          : date > clockDate
                            ? 'future'
                            : date === clockDate
                              ? 'emptyToday'
                              : 'emptyDay'
                      )}
                    </EmptyTitle>
                    {view === 'daily' && date <= clockDate && (
                      <EmptyDescription>{t('emptyHint')}</EmptyDescription>
                    )}
                  </EmptyHeader>
                </Empty>
              ) : (
                logs.map((log) => (
                  <article className="note-row" id={`note-${log.id}`} key={log.id}>
                    <div className="note-time">
                      <time>{timeText(log.recordedAt, log.timeZone)}</time>
                      {view === 'trash' && <span>{log.localDate}</span>}
                    </div>
                    <div className="note-content">
                      <div className="note-meta">
                        <span>
                          {t(
                            log.type === 'manual'
                              ? 'note'
                              : log.type === 'todo'
                                ? 'todo'
                                : log.type === 'schedule'
                                  ? 'schedule'
                                  : 'other'
                          )}
                        </span>
                        {view === 'daily' && (
                          <DropdownMenu>
                            <DropdownMenuTrigger
                              render={
                                <Button
                                  variant="ghost"
                                  size="icon-sm"
                                  aria-label={t('more')}
                                  id={`more-${log.id}`}
                                  disabled={busy}
                                />
                              }
                            >
                              <MoreHorizontal />
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuGroup>
                                {log.type === 'manual' && (
                                  <DropdownMenuItem onClick={() => beginEdit(log)}>
                                    {t('edit')}
                                  </DropdownMenuItem>
                                )}
                                <DropdownMenuItem
                                  variant="destructive"
                                  onClick={() =>
                                    protect(() => {
                                      setConfirmError(null)
                                      setConfirmation({ kind: 'trash', log })
                                    })
                                  }
                                >
                                  {t('moveTrash')}
                                </DropdownMenuItem>
                              </DropdownMenuGroup>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                      </div>
                      {editor?.log.id === log.id ? (
                        <FieldGroup className="inline-editor">
                          <Field
                            data-invalid={editor.error === 'empty' || editor.error === 'too-long'}
                          >
                            <FieldLabel htmlFor="edit-content" className="sr-only">
                              {t('content')}
                            </FieldLabel>
                            <Textarea
                              id="edit-content"
                              autoFocus
                              value={editor.content}
                              disabled={busy}
                              onChange={(event) => modifyEditor({ content: event.target.value })}
                              aria-invalid={editor.error === 'empty' || editor.error === 'too-long'}
                              rows={5}
                            />
                          </Field>
                          <div className="time-controls">
                            <Field className="w-auto">
                              <FieldLabel>{t('date')}</FieldLabel>
                              <DatePicker
                                date={editor.date}
                                locale={locale}
                                label={editor.date}
                                disabled={busy}
                                max={clockDate}
                                onChange={(value) =>
                                  modifyEditor({ date: value, current: false, touchedTime: true })
                                }
                              />
                            </Field>
                            <Field className="w-auto">
                              <FieldLabel htmlFor="edit-time">{t('time')}</FieldLabel>
                              <Input
                                id="edit-time"
                                type="time"
                                value={editor.time}
                                className="w-32"
                                disabled={busy || editor.current}
                                onChange={(event) =>
                                  modifyEditor({
                                    time: event.target.value,
                                    current: false,
                                    touchedTime: true
                                  })
                                }
                              />
                            </Field>
                            <Button
                              variant="outline"
                              disabled={busy}
                              onClick={() => modifyEditor({ current: !editor.current })}
                              aria-pressed={editor.current}
                            >
                              {t('useCurrent')}
                            </Button>
                            <span className="text-xs text-muted-foreground">
                              {editor.log.timeZone}
                            </span>
                          </div>
                          {editor.error && <FieldError>{t(errorKey(editor.error))}</FieldError>}
                          <div className="flex gap-2">
                            <Button
                              disabled={
                                busy ||
                                !editor.content.trim() ||
                                Array.from(editor.content).length > 10000
                              }
                              onClick={() => void saveEdit()}
                            >
                              {t(busy ? 'saving' : 'saveChanges')}
                            </Button>
                            <Button
                              variant="ghost"
                              disabled={busy}
                              onClick={() =>
                                protect(() => {
                                  assignEditor(null)
                                  requestAnimationFrame(() =>
                                    document.getElementById(`more-${log.id}`)?.focus()
                                  )
                                })
                              }
                            >
                              {t('cancel')}
                            </Button>
                          </div>
                        </FieldGroup>
                      ) : (
                        <NoteBody content={log.content} locale={locale} />
                      )}
                      {view === 'trash' && (
                        <div className="trash-actions">
                          <span>
                            {t('trashedAt')} ·{' '}
                            {new Intl.DateTimeFormat(locale, {
                              dateStyle: 'short',
                              timeStyle: 'short',
                              hourCycle: 'h23',
                              timeZone: log.timeZone
                            }).format(log.updatedAt)}
                          </span>
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={busy}
                            onClick={() => void operate(log, 'restore')}
                          >
                            {t('restore')}
                          </Button>
                          <Button
                            variant="destructive"
                            size="sm"
                            disabled={busy}
                            onClick={() => {
                              setConfirmError(null)
                              setConfirmation({ kind: 'delete', log })
                            }}
                          >
                            {t('delete')}
                          </Button>
                        </div>
                      )}
                    </div>
                  </article>
                ))
              )}
            </div>
          </main>
          {view === 'daily' && (date <= clockDate || draft.content) && (
            <NoteComposer
              context={
                <DateTimePicker
                  value={draft}
                  locale={locale}
                  now={clockTimestamp}
                  disabled={
                    busy ||
                    !!editor ||
                    !ready ||
                    (draft.pendingSubmission !== null && !pendingEditable)
                  }
                  onChange={updateDraft}
                />
              }
              status={
                wordCount >= 9000 ? (
                  <span className="composer-length">{t('length', { n: wordCount })}</span>
                ) : null
              }
              error={
                saveError || (draft.content && invalid && invalid !== 'empty')
                  ? t(saveError ? errorKey(saveError) : invalid!)
                  : null
              }
              actionLabel={t(
                busy
                  ? 'saving'
                  : saveError
                    ? 'retry'
                    : draft.targetDate === clockDate
                      ? 'record'
                      : 'backfill'
              )}
              busy={busy}
              disabled={busy || !!editor || !!invalid}
              onSubmit={() => void submit(Date.now())}
            >
              <label htmlFor="new-content" className="sr-only">
                {t('content')}
              </label>
              <textarea
                ref={inputRef}
                id="new-content"
                value={draft.content}
                placeholder={t('placeholder')}
                disabled={
                  busy ||
                  !!editor ||
                  !ready ||
                  (draft.pendingSubmission !== null && !pendingEditable)
                }
                aria-invalid={wordCount > 10000}
                onChange={(event) => updateDraft({ content: event.target.value })}
                onKeyDown={(event) => {
                  if (
                    event.key === 'Enter' &&
                    (event.metaKey || event.ctrlKey) &&
                    !event.nativeEvent.isComposing &&
                    event.nativeEvent.keyCode !== 229
                  ) {
                    event.preventDefault()
                    void submit(Date.now())
                  }
                }}
                className="composer-textarea"
                aria-describedby={
                  saveError || (draft.content && invalid && invalid !== 'empty')
                    ? 'composer-error'
                    : undefined
                }
              />
            </NoteComposer>
          )}
        </>
      )}
      <AlertDialog
        open={!!confirmation}
        onOpenChange={(open) => {
          if (!open && !busy) {
            setConfirmation(null)
            leaveAction.current = null
            api.cancelClose()
          }
        }}
      >
        <AlertDialogContent initialFocus={cancelRef}>
          <AlertDialogHeader>
            <AlertDialogTitle>{t(confirmTitle)}</AlertDialogTitle>
            <AlertDialogDescription>{t(confirmHint)}</AlertDialogDescription>
          </AlertDialogHeader>
          {confirmation && 'log' in confirmation && (
            <div className="confirmation-preview">
              <p>
                {confirmation.log.localDate} ·{' '}
                {timeText(confirmation.log.recordedAt, confirmation.log.timeZone)}
              </p>
              <p className="line-clamp-3 whitespace-pre-wrap break-all">
                {confirmation.log.content}
              </p>
            </div>
          )}
          {confirmError && (
            <Alert variant="destructive">
              <AlertDescription>{t(errorKey(confirmError))}</AlertDescription>
            </Alert>
          )}
          <AlertDialogFooter>
            <Button
              ref={cancelRef}
              variant="outline"
              disabled={busy}
              onClick={() => {
                setConfirmation(null)
                leaveAction.current = null
                api.cancelClose()
              }}
            >
              {t(confirmKind === 'leave' ? 'continueEditing' : 'cancel')}
            </Button>
            {confirmKind === 'leave' && (
              <Button
                variant="ghost"
                disabled={busy}
                onClick={() => {
                  assignEditor(null)
                  setConfirmation(null)
                  const action = leaveAction.current
                  leaveAction.current = null
                  action?.()
                }}
              >
                {t('discard')}
              </Button>
            )}
            <Button
              variant={confirmKind === 'delete' ? 'destructive' : 'default'}
              disabled={busy}
              onClick={() => void confirm()}
            >
              {t(
                busy
                  ? 'saving'
                  : confirmKind === 'trash'
                    ? 'moveTrash'
                    : confirmKind === 'delete'
                      ? 'delete'
                      : 'saveChanges'
              )}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
export default App
