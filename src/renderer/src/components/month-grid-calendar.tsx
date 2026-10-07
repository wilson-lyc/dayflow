import { createContext, useContext, useState } from 'react'
import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react'
import {
  MonthCaption,
  MonthGrid,
  Nav,
  useDayPicker,
  type DropdownProps,
  type MonthCaptionProps,
  type MonthGridProps,
  type NavProps
} from 'react-day-picker'
import { Calendar } from './ui/calendar'
import { Button } from './ui/button'

type CalendarView = 'days' | 'months' | 'years'

const MonthSelectionContext = createContext<{
  view: CalendarView
  setView: (view: CalendarView) => void
  decade: number
  setDecade: (decade: number) => void
}>(null!)

function useYearBounds(): { firstYear: number; lastYear: number } {
  const { dayPickerProps } = useDayPicker()
  const currentYear = (dayPickerProps.today ?? new Date()).getFullYear()
  return {
    firstYear: dayPickerProps.startMonth?.getFullYear() ?? currentYear - 100,
    lastYear: dayPickerProps.endMonth?.getFullYear() ?? currentYear
  }
}

function MonthTrigger({ options, value, 'aria-label': label }: DropdownProps): React.JSX.Element {
  const { view, setView } = useContext(MonthSelectionContext)
  return (
    <Button
      variant="ghost"
      size="sm"
      className="relative"
      aria-label={label}
      aria-expanded={view === 'months'}
      onClick={() => setView(view === 'months' ? 'days' : 'months')}
    >
      {options?.find((option) => option.value === Number(value))?.label}
    </Button>
  )
}

function YearTrigger({ value, 'aria-label': label }: DropdownProps): React.JSX.Element {
  const { view, setView, setDecade } = useContext(MonthSelectionContext)
  return (
    <Button
      variant="ghost"
      size="sm"
      className="relative"
      aria-label={label}
      aria-expanded={view === 'years'}
      onClick={() => {
        setDecade(Math.floor(Number(value) / 10) * 10)
        setView('years')
      }}
    >
      {value}年
    </Button>
  )
}

function SelectionCaption({ children, ...props }: MonthCaptionProps): React.JSX.Element {
  const { view, decade, setView } = useContext(MonthSelectionContext)
  return (
    <MonthCaption {...props}>
      {view === 'years' ? (
        <Button variant="ghost" size="sm" className="relative" onClick={() => setView('days')}>
          {decade}–{decade + 9}年
        </Button>
      ) : (
        children
      )}
    </MonthCaption>
  )
}

function SelectionNav(props: NavProps): React.JSX.Element {
  const { view, decade, setDecade } = useContext(MonthSelectionContext)
  const { firstYear, lastYear } = useYearBounds()
  const { dayPickerProps } = useDayPicker()
  if (view !== 'years') return <Nav {...props} />
  const chinese = dayPickerProps.locale?.code === 'zh-CN'
  return (
    <nav className={props.className} style={props.style} aria-label={props['aria-label']}>
      <Button
        variant="ghost"
        size="icon"
        disabled={dayPickerProps.disableNavigation || decade <= firstYear}
        aria-label={chinese ? '前10年' : 'Previous 10 years'}
        onClick={() => setDecade(decade - 10)}
      >
        <ChevronLeftIcon />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        disabled={dayPickerProps.disableNavigation || decade + 10 > lastYear}
        aria-label={chinese ? '后10年' : 'Next 10 years'}
        onClick={() => setDecade(decade + 10)}
      >
        <ChevronRightIcon />
      </Button>
    </nav>
  )
}

function SelectableMonthGrid(props: MonthGridProps): React.JSX.Element {
  const { view, setView, decade } = useContext(MonthSelectionContext)
  const { months, goToMonth, dayPickerProps } = useDayPicker()
  const { firstYear, lastYear } = useYearBounds()
  if (view === 'days') return <MonthGrid {...props} />

  const displayedMonth = months[0].date
  const { startMonth, endMonth, locale } = dayPickerProps
  if (view === 'years') {
    return (
      <div
        className="grid min-h-60 grid-cols-2 grid-rows-5 gap-2"
        aria-label={locale?.code === 'zh-CN' ? '选择年份' : 'Choose year'}
      >
        {Array.from({ length: 10 }, (_, index) => {
          const year = decade + index
          const selected = year === displayedMonth.getFullYear()
          return (
            <Button
              key={year}
              variant={selected ? 'default' : 'ghost'}
              className="h-full w-full"
              disabled={year < firstYear || year > lastYear}
              aria-pressed={selected}
              autoFocus={selected}
              onClick={() => {
                goToMonth(new Date(year, displayedMonth.getMonth(), 1))
                setView('months')
              }}
            >
              {year}年
            </Button>
          )
        })}
      </div>
    )
  }
  return (
    <div
      className="grid min-h-60 grid-cols-3 grid-rows-4 gap-2"
      aria-label={locale?.code === 'zh-CN' ? '选择月份' : 'Choose month'}
    >
      {Array.from({ length: 12 }, (_, index) => {
        const month = new Date(displayedMonth.getFullYear(), index, 1)
        const selected = index === displayedMonth.getMonth()
        const disabled =
          (startMonth !== undefined &&
            month < new Date(startMonth.getFullYear(), startMonth.getMonth(), 1)) ||
          (endMonth !== undefined &&
            month > new Date(endMonth.getFullYear(), endMonth.getMonth(), 1))
        return (
          <Button
            key={index}
            variant={selected ? 'default' : 'ghost'}
            className="h-full w-full"
            disabled={disabled}
            aria-pressed={selected}
            autoFocus={selected}
            onClick={() => {
              goToMonth(month)
              setView('days')
            }}
          >
            {month.toLocaleString(locale?.code, { month: 'short' })}
          </Button>
        )
      })}
    </div>
  )
}

const monthSelectionComponents = {
  MonthsDropdown: MonthTrigger,
  YearsDropdown: YearTrigger,
  MonthCaption: SelectionCaption,
  Nav: SelectionNav,
  MonthGrid: SelectableMonthGrid
}

export function MonthGridCalendar(props: React.ComponentProps<typeof Calendar>): React.JSX.Element {
  const [view, setView] = useState<CalendarView>('days')
  const [decade, setDecade] = useState(0)
  return (
    <MonthSelectionContext.Provider value={{ view, setView, decade, setDecade }}>
      <Calendar {...props} components={{ ...props.components, ...monthSelectionComponents }} />
    </MonthSelectionContext.Provider>
  )
}
