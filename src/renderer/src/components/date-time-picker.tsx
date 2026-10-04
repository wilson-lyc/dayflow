import { useId, useState } from 'react'
import { CalendarDays, Clock } from 'lucide-react'
import { enUS, zhCN } from 'react-day-picker/locale'
import { Button } from './ui/button'
import { Calendar } from './ui/calendar'
import { Field, FieldError, FieldGroup } from './ui/field'
import { InputGroup, InputGroupAddon, InputGroupInput } from './ui/input-group'
import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from './ui/popover'
import { localDate, type Locale } from '../../../shared/model'
import { parseDay, systemZone, timeText, wallTime, type Draft } from '../lib/dates'
import { translator } from '../lib/i18n'

export function DateTimePicker({
  value,
  locale,
  now,
  disabled,
  onChange
}: {
  value: Draft
  locale: Locale
  now: number
  disabled: boolean
  onChange: (patch: Partial<Draft>) => void
}): React.JSX.Element {
  const t = translator(locale)
  const timeId = useId()
  const [open, setOpen] = useState(false)
  const [date, setDate] = useState(value.targetDate)
  const [time, setTime] = useState('')
  const [attempted, setAttempted] = useState(false)
  const zone = value.timeZone
  const maxDate = localDate(now, zone)
  const selectedAt = wallTime(date, time, zone)
  const invalid = selectedAt === null || selectedAt > now
  const label =
    value.timeMode === 'current-time'
      ? t('now')
      : value.recordedAt === null
        ? t('specifyTime')
        : `${value.targetDate} ${timeText(value.recordedAt, zone)}`

  function changeOpen(next: boolean): void {
    if (next && disabled) return
    if (next) {
      setDate(value.targetDate)
      setTime(timeText(value.recordedAt ?? Date.now(), zone))
      setAttempted(false)
    }
    setOpen(next)
  }

  function apply(): void {
    setAttempted(true)
    if (selectedAt === null || selectedAt > Date.now() || disabled) return
    onChange({ targetDate: date, timeMode: 'custom', recordedAt: selectedAt })
    setOpen(false)
  }

  return (
    <Popover open={open && !disabled} onOpenChange={changeOpen}>
      <PopoverTrigger
        render={<Button variant="ghost" size="sm" className="rounded-full" disabled={disabled} />}
        aria-label={`${t('dateTime')}: ${label}`}
      >
        <CalendarDays data-icon="inline-start" />
        {label}
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="start"
        className="w-[280px] max-w-[calc(100vw-24px)] max-h-[85dvh] gap-3 overflow-y-auto p-2"
      >
        <PopoverTitle className="sr-only">{t('dateTime')}</PopoverTitle>
        <Calendar
          className="w-full shrink-0 p-0 [--cell-size:2rem]"
          classNames={{
            month: 'flex w-full flex-col gap-2',
            week: 'mt-1 flex w-full'
          }}
          mode="single"
          captionLayout="dropdown"
          selected={parseDay(date)}
          defaultMonth={parseDay(date)}
          endMonth={parseDay(maxDate)}
          locale={locale === 'zh-CN' ? zhCN : enUS}
          disabled={{ after: parseDay(maxDate) }}
          onSelect={(selected) => {
            if (selected) setDate(localDate(selected.getTime(), systemZone()))
          }}
        />
        <FieldGroup className="shrink-0 gap-3">
          <Field data-invalid={attempted && invalid}>
            <InputGroup>
              <InputGroupInput
                className="date-time-input appearance-none text-right [&::-webkit-calendar-picker-indicator]:hidden [&::-webkit-calendar-picker-indicator]:appearance-none"
                id={timeId}
                aria-label={t('time')}
                type="time"
                step={60}
                value={time}
                max={date === maxDate ? timeText(now, zone) : undefined}
                aria-invalid={attempted && invalid}
                onChange={(event) => setTime(event.target.value)}
              />
              <InputGroupAddon align="inline-start">
                <Clock aria-hidden="true" />
              </InputGroupAddon>
            </InputGroup>
          </Field>
          {attempted && invalid && <FieldError>{t('invalidTime')}</FieldError>}
          <div className="flex items-center gap-1.5">
            <Button
              size="sm"
              variant="outline"
              disabled={disabled}
              onClick={() => {
                const current = Date.now()
                onChange({
                  targetDate: localDate(current, systemZone()),
                  timeMode: 'current-time',
                  recordedAt: null,
                  timeZone: systemZone()
                })
                setOpen(false)
              }}
            >
              {t('now')}
            </Button>
            <Button size="sm" variant="outline" className="ml-auto" onClick={() => setOpen(false)}>
              {t('cancel')}
            </Button>
            <Button size="sm" disabled={disabled} onClick={apply}>
              {t('confirm')}
            </Button>
          </div>
        </FieldGroup>
      </PopoverContent>
    </Popover>
  )
}
