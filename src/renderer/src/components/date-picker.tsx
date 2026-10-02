import { useState } from 'react'
import { enUS, zhCN } from 'react-day-picker/locale'
import { Calendar } from './ui/calendar'
import { Button } from './ui/button'
import { Popover, PopoverTrigger, PopoverContent } from './ui/popover'
import { parseDay } from '../lib/dates'
import { localDate, type Locale } from '../../../shared/model'
export function DatePicker({
  date,
  locale,
  label,
  onChange,
  disabled = false,
  max
}: {
  date: string
  locale: Locale
  label: string
  onChange: (date: string) => void
  disabled?: boolean
  max?: string
}): React.JSX.Element {
  const [open, setOpen] = useState(false)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger render={<Button variant="ghost" disabled={disabled} aria-label={label} />}>
        {label}
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={parseDay(date)}
          defaultMonth={parseDay(date)}
          locale={locale === 'zh-CN' ? zhCN : enUS}
          disabled={max ? { after: parseDay(max) } : undefined}
          onSelect={(value) => {
            if (value) {
              onChange(localDate(value.getTime(), Intl.DateTimeFormat().resolvedOptions().timeZone))
              setOpen(false)
            }
          }}
        />
      </PopoverContent>
    </Popover>
  )
}
