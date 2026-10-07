import { useState } from 'react'
import { enUS, zhCN } from 'react-day-picker/locale'
import { MonthGridCalendar as Calendar } from './month-grid-calendar'
import { Button } from './ui/button'
import { Popover, PopoverTrigger, PopoverContent } from './ui/popover'
import { parseDay, today } from '../lib/dates'
import { translator } from '../lib/i18n'
import { localDate, type Locale } from '../../../shared/model'
export function DatePicker({
  date,
  locale,
  label,
  onChange,
  disabled = false,
  max,
  showToday = false,
  triggerVariant = 'ghost'
}: {
  date: string
  locale: Locale
  label: string
  onChange: (date: string) => void
  disabled?: boolean
  max?: string
  showToday?: boolean
  triggerVariant?: React.ComponentProps<typeof Button>['variant']
}): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const t = translator(locale)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={<Button variant={triggerVariant} disabled={disabled} aria-label={label} />}
      >
        {label}
      </PopoverTrigger>
      <PopoverContent
        className="w-[280px] max-w-[calc(100vw-24px)] max-h-[85dvh] overflow-y-auto p-2"
        align="start"
      >
        <Calendar
          className="w-full shrink-0 p-0 [--cell-size:2rem]"
          classNames={{
            month: 'flex w-full flex-col gap-2',
            week: 'mt-1 flex w-full'
          }}
          mode="single"
          required
          captionLayout="dropdown"
          selected={parseDay(date)}
          defaultMonth={parseDay(date)}
          endMonth={max ? parseDay(max) : undefined}
          locale={locale === 'zh-CN' ? zhCN : enUS}
          disabled={max ? { after: parseDay(max) } : undefined}
          onSelect={(value) => {
            if (value) {
              onChange(localDate(value.getTime(), Intl.DateTimeFormat().resolvedOptions().timeZone))
              setOpen(false)
            }
          }}
        />
        {showToday && (
          <Button
            variant="outline"
            size="sm"
            disabled={disabled}
            onClick={() => {
              onChange(today())
              setOpen(false)
            }}
          >
            {t('returnToday')}
          </Button>
        )}
      </PopoverContent>
    </Popover>
  )
}
