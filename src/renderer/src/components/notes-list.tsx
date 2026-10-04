import { MoreHorizontal } from 'lucide-react'
import type { Log, Locale } from '../../../shared/model'
import { timeText } from '../lib/dates'
import { translator, type MessageKey } from '../lib/i18n'
import { NoteBody } from './note-body'
import { Button } from './ui/button'
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription } from './ui/empty'
import { Skeleton } from './ui/skeleton'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger
} from './ui/dropdown-menu'

export type ListState = 'loading' | 'ready' | 'error'
export type NotesListProps = {
  logs: Log[]
  state: ListState
  locale: Locale
  busy: boolean
  mode?: 'daily' | 'trash'
  emptyTitle?: MessageKey
  emptyHint?: boolean
  onRetry: () => void
  onEdit?: (log: Log) => void
  onTrash?: (log: Log) => void
  onRestore?: (log: Log) => void
  onDelete?: (log: Log) => void
}

export function NotesList({
  logs,
  state,
  locale,
  busy,
  mode = 'daily',
  emptyTitle = 'emptyDay',
  emptyHint = false,
  onRetry,
  onEdit,
  onTrash,
  onRestore,
  onDelete
}: NotesListProps): React.JSX.Element {
  const t = translator(locale)
  if (state === 'loading')
    return (
      <div className="loading-notes">
        <Skeleton className="h-16" />
        <Skeleton className="h-16" />
        <Skeleton className="h-16" />
      </div>
    )
  if (state === 'error')
    return (
      <Empty>
        <EmptyHeader>
          <EmptyTitle>{t(mode === 'trash' ? 'trashError' : 'readError')}</EmptyTitle>
        </EmptyHeader>
        <Button onClick={onRetry}>{t('retry')}</Button>
      </Empty>
    )
  if (!logs.length)
    return (
      <Empty>
        <EmptyHeader>
          <EmptyTitle>{t(mode === 'trash' ? 'emptyTrash' : emptyTitle)}</EmptyTitle>
          {emptyHint && <EmptyDescription>{t('emptyHint')}</EmptyDescription>}
        </EmptyHeader>
      </Empty>
    )
  return (
    <div className="notes-list">
      {logs.map((log) => (
        <article className="note-row" id={`note-${log.id}`} key={log.id}>
          <div className="note-content">
            <div className="note-meta">
              <div className="note-meta-info">
                <time className="note-time" dateTime={new Date(log.recordedAt).toISOString()}>
                  {mode === 'trash' && `${log.localDate} · `}
                  {timeText(log.recordedAt, log.timeZone)}
                </time>
                {log.type !== 'manual' && (
                  <span>
                    {t(
                      log.type === 'todo' ? 'todo' : log.type === 'schedule' ? 'schedule' : 'other'
                    )}
                  </span>
                )}
              </div>
              {mode === 'daily' && (onEdit || onTrash) && (
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
                      {log.type === 'manual' && onEdit && (
                        <DropdownMenuItem onClick={() => onEdit(log)}>{t('edit')}</DropdownMenuItem>
                      )}
                      {onTrash && (
                        <DropdownMenuItem variant="destructive" onClick={() => onTrash(log)}>
                          {t('moveTrash')}
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuGroup>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
            <NoteBody content={log.content} locale={locale} />
            {mode === 'trash' && (
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
                {onRestore && (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={busy}
                    onClick={() => onRestore(log)}
                  >
                    {t('restore')}
                  </Button>
                )}
                {onDelete && (
                  <Button
                    variant="destructive"
                    size="sm"
                    disabled={busy}
                    onClick={() => onDelete(log)}
                  >
                    {t('delete')}
                  </Button>
                )}
              </div>
            )}
          </div>
        </article>
      ))}
    </div>
  )
}
