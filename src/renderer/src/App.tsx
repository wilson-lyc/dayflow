import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ArrowLeft, ChevronLeft, ChevronRight, Settings } from 'lucide-react'
import { Button } from './components/ui/button'
import { Textarea } from './components/ui/textarea'
import { Input } from './components/ui/input'
import { Field, FieldGroup, FieldLabel, FieldError } from './components/ui/field'
import { Alert, AlertDescription } from './components/ui/alert'
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription } from './components/ui/empty'
import { Skeleton } from './components/ui/skeleton'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter
} from './components/ui/dialog'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter
} from './components/ui/alert-dialog'
import { DatePicker } from './components/date-picker'
import { DailyReportEditor } from './components/daily-report-editor'
import { DailyReportPage } from './components/daily-report-page'
import { useDailyReport } from './hooks/use-daily-report'
import { HomePage } from './components/home-page'
import { SettingsPage, type SettingsModule } from './components/settings-page'
import { PreferenceContent } from './components/preference-content'
import { TrashContent } from './components/trash-content'
import { QuickNotesBlock } from './components/quick-notes-block'
import { validateQuickNote } from './lib/quick-note'
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
import { translator, errorKey, type MessageKey } from './lib/i18n'
import { cn } from './lib/utils'
import { resolveLocale } from '../../shared/languages'
import { localDate } from '../../shared/model'
import type { Log, Locale, Preferences, ErrorCode } from '../../shared/model'

type View = 'daily' | 'report' | 'settings'
type ListScope = 'daily' | 'trash'
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
  const [prefs, setPrefs] = useState<Preferences>({
    themeMode: 'system',
    localePreference: null,
    reportAutoSaveInterval: 'off'
  })
  const [platform, setPlatform] = useState('darwin')
  const [ready, setReady] = useState(false)
  const [bootError, setBootError] = useState<ErrorCode | null>(null)
  const [view, setView] = useState<View>('daily')
  const viewRef = useRef<View>('daily')
  const [settingsModule, setSettingsModule] = useState<SettingsModule>('general')
  const settingsModuleRef = useRef<SettingsModule>('general')
  const [date, setDate] = useState(today)
  const dateRef = useRef(date)
  const report = useDailyReport(date, prefs.reportAutoSaveInterval)
  const saveReport = report.save
  const [reportCloseOpen, setReportCloseOpen] = useState(false)
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
  const editInputRef = useRef<HTMLTextAreaElement>(null)
  const editingIdRef = useRef<string | null>(null)
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
      page: ListScope,
      target: string | 'bottom' | null = null
    ): Promise<void> => {
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
    if (page !== 'daily') {
      loadId.current++
    }
    if (viewRef.current === 'settings' && page !== 'settings') {
      if (settingsModuleRef.current === 'trash')
        trashScroll.current = listRef.current?.scrollTop ?? 0
      focusSettings.current = true
    }
    if (!hasDraft(draftRef.current) && selected !== dateRef.current)
      resetDraft(blankDraft(selected))
    dateRef.current = selected
    setDate(selected)
    viewRef.current = page
    setView(page)
    if (page === 'daily') {
      restoreTrashScroll.current = false
      void load(selected, 'daily', target)
    } else if (page === 'settings' && settingsModuleRef.current === 'trash') {
      restoreTrashScroll.current = true
      void load(selected, 'trash', 'bottom')
    }
  }
  function selectSettingsModule(module: SettingsModule): void {
    protect(() => {
      if (viewRef.current === 'settings' && settingsModuleRef.current === 'trash')
        trashScroll.current = listRef.current?.scrollTop ?? 0
      settingsModuleRef.current = module
      setSettingsModule(module)
      if (viewRef.current !== 'settings') navigate('settings')
      else {
        loadId.current++
        if (module === 'trash') {
          restoreTrashScroll.current = true
          void load(dateRef.current, 'trash', 'bottom')
        }
      }
    })
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
    if (viewRef.current === 'daily') await load(dateRef.current, 'daily', 'bottom')
    else if (settingsModuleRef.current === 'trash') await load(dateRef.current, 'trash', 'bottom')
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
      protect(() => {
        if (report.hasUnsaved) setReportCloseOpen(true)
        else api.finishClose()
      })
    }
  })
  useEffect(() => api.onClose(() => closeHandler.current()), [])
  useEffect(() => {
    const saveShortcut = (event: KeyboardEvent): void => {
      if (
        event.key.toLowerCase() !== 's' ||
        !(event.metaKey || event.ctrlKey) ||
        event.altKey ||
        event.isComposing ||
        event.keyCode === 229 ||
        viewRef.current === 'settings'
      )
        return
      event.preventDefault()
      if (!busyRef.current && !editorRef.current && !confirmation && !reportCloseOpen) saveReport()
    }
    window.addEventListener('keydown', saveShortcut)
    return () => window.removeEventListener('keydown', saveShortcut)
  }, [saveReport, confirmation, reportCloseOpen])

  function draftValidation(): MessageKey | null {
    return validateQuickNote(draftRef.current, clockTimestamp)
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
    protect(() => {
      editingIdRef.current = log.id
      assignEditor({
        log,
        content: log.content,
        date: log.localDate,
        time: timeText(log.recordedAt, log.timeZone),
        current: false,
        touchedTime: false,
        error: null
      })
    })
  }
  function modifyEditor(patch: Partial<Editor>): void {
    if (editorRef.current) assignEditor({ ...editorRef.current, ...patch, error: null })
  }
  function closeEditor(): void {
    const id = editorRef.current?.log.id
    protect(() => {
      assignEditor(null)
      requestAnimationFrame(() => document.getElementById(`more-${id}`)?.focus())
    })
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
  const selectedLabel = new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'short'
  }).format(parseDay(date))
  const confirmKind = confirmation?.kind
  const confirmTitle: MessageKey =
    confirmKind === 'trash'
      ? 'trashConfirm'
      : confirmKind === 'delete'
        ? 'deleteConfirm'
        : 'unsaved'
  const confirmHint: MessageKey =
    confirmKind === 'trash' ? 'trashHint' : confirmKind === 'delete' ? 'deleteHint' : 'unsavedHint'
  const dateChange = (selected: string): void =>
    protect(() => navigate(viewRef.current === 'report' ? 'report' : 'daily', selected))
  const reportProps = {
    ...report,
    onRetry: report.retry,
    onSave: report.save,
    locale,
    disabled: busy
  }
  const preferenceProps = {
    locale,
    preferences: prefs,
    busy: preferenceBusy,
    error: preferenceError,
    onChange: (key: keyof Preferences, value: string): void => {
      void changePreference(key, value)
    },
    onRetry: (): void => {
      if (failedPreference) void changePreference(failedPreference.key, failedPreference.value)
    }
  }

  return (
    <div className={cn('window-shell', platform !== 'darwin' && 'other-platform')}>
      <header className="window-top">
        {view !== 'settings' ? (
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
                showToday
                max={clockDate}
                disabled={busy}
                onChange={dateChange}
              />
              <Button
                variant="ghost"
                size="icon"
                aria-label={t('next')}
                disabled={busy || date >= clockDate}
                onClick={() => dateChange(shiftDay(date, 1))}
              >
                <ChevronRight />
              </Button>
            </div>
            <div className="top-spacer" />
            <nav className="top-actions">
              <Button
                variant="ghost"
                size="sm"
                disabled={busy}
                onClick={() => protect(() => navigate(view === 'report' ? 'daily' : 'report'))}
              >
                {t(view === 'report' ? 'home' : 'report')}
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
              onClick={() => protect(() => navigate('daily'))}
            >
              <ArrowLeft data-icon="inline-start" />
              {t('back')}
            </Button>
            <span className="top-title">{t('settings')}</span>
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
                <Button variant="link" size="sm" onClick={() => selectSettingsModule('trash')}>
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
        <SettingsPage
          locale={locale}
          active={settingsModule}
          disabled={busy}
          onChange={selectSettingsModule}
          contents={{
            general: <PreferenceContent module="general" {...preferenceProps} />,
            appearance: <PreferenceContent module="appearance" {...preferenceProps} />,
            trash: (
              <TrashContent
                listRef={listRef}
                logs={logs}
                state={listState}
                locale={locale}
                busy={busy}
                onRetry={() => void load(date, 'trash', 'bottom')}
                onRestore={(log) => void operate(log, 'restore')}
                onDelete={(log) => {
                  setConfirmError(null)
                  setConfirmation({ kind: 'delete', log })
                }}
              />
            )
          }}
        />
      ) : view === 'report' ? (
        <DailyReportPage date={date} {...reportProps} />
      ) : (
        <HomePage
          resizeLabel={t('resizeNotesReport')}
          report={<DailyReportEditor {...reportProps} showTitle={false} />}
          notes={
            <QuickNotesBlock
              listRef={listRef}
              notes={{
                logs,
                state: listState,
                locale,
                busy,
                emptyTitle:
                  date > clockDate ? 'future' : date === clockDate ? 'emptyToday' : 'emptyDay',
                emptyHint: date <= clockDate,
                onRetry: () => void load(date, 'daily', 'bottom'),
                onEdit: beginEdit,
                onTrash: (log) =>
                  protect(() => {
                    setConfirmError(null)
                    setConfirmation({ kind: 'trash', log })
                  })
              }}
              composer={
                date <= clockDate || draft.content
                  ? {
                      value: draft,
                      locale,
                      now: clockTimestamp,
                      ready,
                      busy,
                      blocked: !!editor,
                      pendingEditable,
                      error: saveError,
                      inputRef,
                      onChange: updateDraft,
                      onSubmit: () => void submit(Date.now())
                    }
                  : undefined
              }
            />
          }
        />
      )}
      <Dialog
        open={!!editor}
        disablePointerDismissal={busy || !!confirmation}
        onOpenChange={(open) => {
          if (!open && !confirmation) closeEditor()
        }}
      >
        <DialogContent
          className="note-edit-dialog max-h-[85dvh] overflow-y-auto sm:max-w-xl"
          showCloseButton={false}
          initialFocus={editInputRef}
          finalFocus={() =>
            document.getElementById(`more-${editingIdRef.current}`) ?? inputRef.current
          }
        >
          <DialogHeader>
            <DialogTitle>{t('edit')}</DialogTitle>
          </DialogHeader>
          {editor && (
            <FieldGroup>
              <Field data-invalid={editor.error === 'empty' || editor.error === 'too-long'}>
                <FieldLabel htmlFor="edit-content">{t('content')}</FieldLabel>
                <Textarea
                  ref={editInputRef}
                  id="edit-content"
                  className="note-edit-textarea"
                  value={editor.content}
                  disabled={busy}
                  onChange={(event) => modifyEditor({ content: event.target.value })}
                  aria-invalid={editor.error === 'empty' || editor.error === 'too-long'}
                  rows={8}
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
                      modifyEditor({ time: event.target.value, current: false, touchedTime: true })
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
              </div>
              {editor.error && <FieldError>{t(errorKey(editor.error))}</FieldError>}
            </FieldGroup>
          )}
          <DialogFooter>
            <Button variant="outline" disabled={busy} onClick={closeEditor}>
              {t('cancel')}
            </Button>
            <Button
              disabled={
                busy || !editor?.content.trim() || Array.from(editor?.content ?? '').length > 10000
              }
              onClick={() => void saveEdit()}
            >
              {t(busy ? 'saving' : 'saveChanges')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <AlertDialog
        open={reportCloseOpen}
        onOpenChange={(open) => {
          if (!open) {
            setReportCloseOpen(false)
            api.cancelClose()
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('reportCloseTitle')}</AlertDialogTitle>
            <AlertDialogDescription>{t('reportCloseHint')}</AlertDialogDescription>
          </AlertDialogHeader>
          {report.error === 'save' && (
            <Alert variant="destructive">
              <AlertDescription>{t('operationError')}</AlertDescription>
            </Alert>
          )}
          <AlertDialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setReportCloseOpen(false)
                api.cancelClose()
              }}
            >
              {t('continueEditing')}
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setReportCloseOpen(false)
                api.finishClose()
              }}
            >
              {t('discard')}
            </Button>
            <Button
              onClick={() => {
                if (report.saveAll()) {
                  setReportCloseOpen(false)
                  api.finishClose()
                }
              }}
            >
              {t('reportSaveAndClose')}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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
