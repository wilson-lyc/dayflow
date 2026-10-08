import { useRef, useState } from 'react'
import type { Locale, TaskOccurrence, TaskWrite } from '../../../shared/model'
import { translator, errorKey } from '../lib/i18n'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from './ui/dialog'
import { Field, FieldGroup, FieldLabel } from './ui/field'
import { Input } from './ui/input'
import { Button } from './ui/button'
import { ToggleGroup, ToggleGroupItem } from './ui/toggle-group'
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectGroup,
  SelectItem
} from './ui/select'
import { Alert, AlertDescription } from './ui/alert'
import { ScrollArea } from './ui/scroll-area'

type Frequency = NonNullable<TaskWrite['repeatRule']>['frequency']
export function TaskCreateDialog({
  locale,
  open,
  onOpenChange,
  onCreated
}: {
  locale: Locale
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: (tasks: TaskOccurrence[], id: string) => void
}): React.JSX.Element {
  const t = translator(locale)
  const [type, setType] = useState<TaskWrite['type']>('todo')
  const [name, setName] = useState('')
  const [allDay, setAllDay] = useState(false)
  const [start, setStart] = useState(''),
    [end, setEnd] = useState('')
  const [location, setLocation] = useState(''),
    [link, setLink] = useState('')
  const [frequency, setFrequency] = useState<Frequency | 'none'>('none')
  const [interval, setInterval] = useState('1'),
    [until, setUntil] = useState('')
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('')
  const id = useRef(crypto.randomUUID()),
    nameInput = useRef<HTMLInputElement>(null)
  function close(value: boolean): void {
    if (busy) return
    onOpenChange(value)
    if (!value) {
      setName('')
      setType('todo')
      setAllDay(false)
      setStart('')
      setEnd('')
      setLocation('')
      setLink('')
      setFrequency('none')
      setInterval('1')
      setUntil('')
      setError('')
      id.current = crypto.randomUUID()
    }
  }
  const validRange =
    !start || !end || (allDay ? end >= start : new Date(end).getTime() > new Date(start).getTime())
  const invalidRepeat =
    frequency !== 'none' &&
    (!start ||
      !end ||
      !Number.isInteger(Number(interval)) ||
      Number(interval) < 1 ||
      (until && until < start.slice(0, 10)))
  async function submit(event: React.FormEvent): Promise<void> {
    event.preventDefault()
    if (busy || !validRange || invalidRepeat) return
    const exclusive =
      allDay && end
        ? new Date(Date.parse(`${end}T12:00:00Z`) + 86400000).toISOString().slice(0, 10)
        : null
    const input: TaskWrite = {
      id: id.current,
      type,
      name,
      isAllDay: allDay,
      startAt: !allDay && start ? new Date(start).getTime() : null,
      endAt: !allDay && end ? new Date(end).getTime() : null,
      startDate: allDay ? start : null,
      endDateExclusive: exclusive,
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      location: location || null,
      link: link || null,
      repeatRule:
        frequency === 'none'
          ? null
          : { frequency, interval: Number(interval), untilDate: until || null }
    }
    setBusy(true)
    setError('')
    try {
      const result = await window.api.createTask(input)
      if (result.ok) {
        onCreated(result.value, id.current)
        setBusy(false)
        onOpenChange(false)
        setName('')
        setType('todo')
        setAllDay(false)
        setStart('')
        setEnd('')
        setLocation('')
        setLink('')
        setFrequency('none')
        setInterval('1')
        setUntil('')
        id.current = crypto.randomUUID()
      } else setError(t(errorKey(result.error)))
    } catch {
      setError(t('operationError'))
    } finally {
      setBusy(false)
    }
  }
  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent
        initialFocus={nameInput}
        finalFocus={() => document.getElementById('task-create-entry')}
        showCloseButton={false}
        className="flex h-[min(640px,calc(100dvh-3rem))] flex-col overflow-hidden sm:max-w-xl"
      >
        <DialogHeader className="shrink-0">
          <DialogTitle>{t('taskCreate')}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col gap-4">
          <ScrollArea className="min-h-0 flex-1">
            <div className="flex flex-col gap-4 py-1 pr-3 pl-1">
              <FieldGroup>
                <Field>
                  <FieldLabel>{t('taskType')}</FieldLabel>
                  <ToggleGroup
                    value={[type]}
                    onValueChange={(values) => {
                      if (values[0]) setType(values[0] as TaskWrite['type'])
                    }}
                    variant="outline"
                    disabled={busy}
                    aria-label={t('taskType')}
                  >
                    <ToggleGroupItem value="todo">{t('taskTodo')}</ToggleGroupItem>
                    <ToggleGroupItem value="schedule">{t('taskSchedule')}</ToggleGroupItem>
                  </ToggleGroup>
                </Field>
                <Field>
                  <FieldLabel htmlFor="task-name">{t('taskName')}</FieldLabel>
                  <Input
                    ref={nameInput}
                    id="task-name"
                    value={name}
                    maxLength={200}
                    required
                    disabled={busy}
                    onChange={(e) => setName(e.target.value)}
                  />
                </Field>
                <Field>
                  <FieldLabel>{t('taskTimeMode')}</FieldLabel>
                  <ToggleGroup
                    value={[allDay ? 'allDay' : 'timed']}
                    onValueChange={(values) => {
                      if (!values[0]) return
                      setAllDay(values[0] === 'allDay')
                      setStart('')
                      setEnd('')
                    }}
                    variant="outline"
                    disabled={busy}
                    aria-label={t('taskTimeMode')}
                  >
                    <ToggleGroupItem value="timed">{t('taskTimed')}</ToggleGroupItem>
                    <ToggleGroupItem value="allDay">{t('taskAllDay')}</ToggleGroupItem>
                  </ToggleGroup>
                </Field>
                <FieldGroup className="grid grid-cols-2 gap-3">
                  <Field>
                    <FieldLabel htmlFor="task-start">{t('taskStart')}</FieldLabel>
                    <Input
                      id="task-start"
                      type={allDay ? 'date' : 'datetime-local'}
                      value={start}
                      required={allDay || type === 'schedule' || frequency !== 'none'}
                      disabled={busy}
                      onChange={(e) => setStart(e.target.value)}
                    />
                  </Field>
                  <Field data-invalid={!validRange}>
                    <FieldLabel htmlFor="task-end">{t('taskEnd')}</FieldLabel>
                    <Input
                      id="task-end"
                      type={allDay ? 'date' : 'datetime-local'}
                      value={end}
                      min={start || undefined}
                      required={allDay || type === 'schedule' || frequency !== 'none'}
                      disabled={busy}
                      aria-invalid={!validRange}
                      onChange={(e) => setEnd(e.target.value)}
                    />
                  </Field>
                </FieldGroup>
                {!validRange && (
                  <Alert variant="destructive">
                    <AlertDescription>{t('taskRangeError')}</AlertDescription>
                  </Alert>
                )}
                <Field>
                  <FieldLabel htmlFor="task-repeat">{t('taskRepeat')}</FieldLabel>
                  <Select
                    value={frequency}
                    onValueChange={(value) => setFrequency(value as typeof frequency)}
                    disabled={busy}
                    items={Object.fromEntries(
                      ['none', 'daily', 'weekly', 'monthly', 'yearly'].map((value) => [
                        value,
                        t(`taskRepeat${value}` as 'taskRepeatnone')
                      ])
                    )}
                  >
                    <SelectTrigger id="task-repeat">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {(['none', 'daily', 'weekly', 'monthly', 'yearly'] as const).map(
                          (value) => (
                            <SelectItem key={value} value={value}>
                              {t(`taskRepeat${value}`)}
                            </SelectItem>
                          )
                        )}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </Field>
                {frequency !== 'none' && (
                  <FieldGroup className="grid grid-cols-2 gap-3">
                    <Field>
                      <FieldLabel htmlFor="task-interval">{t('taskRepeatInterval')}</FieldLabel>
                      <Input
                        id="task-interval"
                        type="number"
                        min={1}
                        max={1000}
                        required
                        value={interval}
                        disabled={busy}
                        onChange={(e) => setInterval(e.target.value)}
                      />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="task-until">{t('taskRepeatUntil')}</FieldLabel>
                      <Input
                        id="task-until"
                        type="date"
                        min={start.slice(0, 10) || undefined}
                        value={until}
                        disabled={busy}
                        onChange={(e) => setUntil(e.target.value)}
                      />
                    </Field>
                  </FieldGroup>
                )}
                {invalidRepeat && (
                  <Alert variant="destructive">
                    <AlertDescription>{t('taskRepeatError')}</AlertDescription>
                  </Alert>
                )}
                <Field>
                  <FieldLabel htmlFor="task-location">{t('taskLocation')}</FieldLabel>
                  <Input
                    id="task-location"
                    value={location}
                    maxLength={500}
                    disabled={busy}
                    onChange={(e) => setLocation(e.target.value)}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="task-link">{t('taskLink')}</FieldLabel>
                  <Input
                    id="task-link"
                    type="url"
                    pattern="https?://.*"
                    value={link}
                    maxLength={2048}
                    disabled={busy}
                    onChange={(e) => setLink(e.target.value)}
                  />
                </Field>
              </FieldGroup>
              {error && (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
            </div>
          </ScrollArea>
          <DialogFooter className="shrink-0">
            <Button type="button" variant="outline" disabled={busy} onClick={() => close(false)}>
              {t('cancel')}
            </Button>
            <Button
              type="submit"
              disabled={busy || !name.trim() || !validRange || Boolean(invalidRepeat)}
            >
              {t(busy ? 'taskSaving' : 'taskCreateAction')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
