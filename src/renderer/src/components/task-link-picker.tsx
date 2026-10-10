import { useRef, useState } from 'react'
import { ChevronDown, ListTodo } from 'lucide-react'
import type { Locale } from '../../../shared/model'
import { translator, errorKey } from '../lib/i18n'
import { Button } from './ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from './ui/dropdown-menu'

export type LinkedTask = { id: string; name: string }

export function TaskLinkPicker({
  value,
  locale,
  disabled,
  onChange
}: {
  value: LinkedTask | null
  locale: Locale
  disabled: boolean
  onChange: (task: LinkedTask | null) => void
}): React.JSX.Element {
  const t = translator(locale)
  const [open, setOpen] = useState(false)
  const [tasks, setTasks] = useState<LinkedTask[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const request = useRef(0)

  async function load(): Promise<void> {
    const token = ++request.current
    setLoading(true)
    setError('')
    try {
      const result = await window.api.tasks()
      if (token !== request.current) return
      if (!result.ok) {
        setError(t(errorKey(result.error)))
        return
      }
      const unique = new Map<string, LinkedTask>()
      for (const task of result.value) {
        if (!unique.has(task.taskId)) unique.set(task.taskId, { id: task.taskId, name: task.name })
      }
      setTasks([...unique.values()])
    } catch {
      if (token === request.current) setError(t('operationError'))
    } finally {
      if (token === request.current) setLoading(false)
    }
  }

  return (
    <DropdownMenu
      open={open && !disabled}
      onOpenChange={(next) => {
        setOpen(next)
        if (next) void load()
        else request.current++
      }}
    >
      <DropdownMenuTrigger
        render={
          <Button variant="ghost" size="sm" className="max-w-56 rounded-full" disabled={disabled} />
        }
        aria-label={`${t('linkedTask')}: ${value?.name ?? t('noLinkedTask')}`}
        title={value?.name ?? t('noLinkedTask')}
      >
        <ListTodo data-icon="inline-start" />
        <span className="truncate">{value?.name ?? t('noLinkedTask')}</span>
        <ChevronDown data-icon="inline-end" />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        side="top"
        align="start"
        sideOffset={8}
        className="w-72 max-w-[calc(100vw-24px)]"
      >
        <DropdownMenuGroup>
          <DropdownMenuLabel>{t('linkedTask')}</DropdownMenuLabel>
          <DropdownMenuRadioGroup
            value={value?.id ?? ''}
            onValueChange={(id) => {
              onChange(tasks.find((task) => task.id === id) ?? null)
              setOpen(false)
            }}
          >
            <DropdownMenuRadioItem value="" className="min-h-9">
              {t('noLinkedTask')}
            </DropdownMenuRadioItem>
            <DropdownMenuSeparator />
            <div className="max-h-64 overflow-y-auto">
              {!loading &&
                !error &&
                tasks.map((task) => (
                  <DropdownMenuRadioItem
                    key={task.id}
                    value={task.id}
                    className="min-h-9"
                    title={task.name}
                  >
                    <span className="truncate">{task.name}</span>
                  </DropdownMenuRadioItem>
                ))}
            </div>
          </DropdownMenuRadioGroup>
          {loading && <DropdownMenuItem disabled>{t('loadingTasks')}</DropdownMenuItem>}
          {error && (
            <>
              <DropdownMenuItem disabled>{error}</DropdownMenuItem>
              <DropdownMenuItem onClick={() => void load()} closeOnClick={false}>
                {t('retry')}
              </DropdownMenuItem>
            </>
          )}
          {!loading && !error && !tasks.length && (
            <DropdownMenuItem disabled>{t('noTasksToLink')}</DropdownMenuItem>
          )}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
