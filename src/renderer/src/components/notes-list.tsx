import { Code2, ListTodo, MoreHorizontal } from 'lucide-react'
import type { Log, Locale } from '../../../shared/model'
import { timeText } from '../lib/dates'
import { translator, type MessageKey } from '../lib/i18n'
import { CodeEditor } from './code-editor'
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from './ui/accordion'
import { NoteBody } from './note-body'
import { Button } from './ui/button'
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription } from './ui/empty'
import { Skeleton } from './ui/skeleton'
import { Card, CardHeader, CardContent, CardAction, CardDescription } from './ui/card'
import { Badge } from './ui/badge'
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
          <Card className="note-card" size="sm">
            <CardHeader className="note-meta">
              <CardDescription className="note-meta-info">
                <time className="note-time" dateTime={new Date(log.recordedAt).toISOString()}>
                  {mode === 'trash' && `${log.localDate} · `}
                  {timeText(log.recordedAt, log.timeZone)}
                </time>
                {log.type !== 'manual' && (
                  <Badge variant="secondary">
                    {t(
                      log.type === 'todo' ? 'todo' : log.type === 'schedule' ? 'schedule' : 'other'
                    )}
                  </Badge>
                )}
                {log.taskName && (
                  <Badge variant="secondary" className="note-task max-w-full" title={log.taskName}>
                    <ListTodo data-icon="inline-start" />
                    <span className="truncate">{log.taskName}</span>
                  </Badge>
                )}
              </CardDescription>
              {mode === 'daily' && (onEdit || onTrash) && (
                <CardAction className="note-menu">
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
                          <DropdownMenuItem onClick={() => onEdit(log)}>
                            {t('edit')}
                          </DropdownMenuItem>
                        )}
                        {onTrash && (
                          <DropdownMenuItem variant="destructive" onClick={() => onTrash(log)}>
                            {t('moveTrash')}
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuGroup>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </CardAction>
              )}
            </CardHeader>
            <CardContent className="note-content">
              <NoteBody content={log.content.text} locale={locale} />
              {log.content.codeCards.length > 0 && (
                <Accordion multiple className="note-code-cards mt-4 gap-2">
                  {log.content.codeCards.map((card, index) => (
                    <AccordionItem
                      key={card.id}
                      value={card.id}
                      className="overflow-hidden rounded-lg border bg-muted/25 not-last:border-b"
                    >
                      <AccordionTrigger className="items-center gap-3 rounded-none px-3 py-2.5 hover:bg-muted/60">
                        <Code2 className="size-4 shrink-0 text-muted-foreground" />
                        <span className="min-w-0 flex-1 truncate">
                          {card.name.trim() || t('codeSnippet', { n: index + 1 })}
                        </span>
                        <span className="shrink-0 text-xs font-normal text-muted-foreground">
                          {card.language || t('plainCode')}
                        </span>
                      </AccordionTrigger>
                      <AccordionContent className="border-t p-0">
                        <CodeEditor
                          id={`note-${log.id}-code-${card.id}`}
                          value={card.code}
                          language={card.language}
                          label={card.name.trim() || t('codeSnippet', { n: index + 1 })}
                          hint=""
                          locale={locale}
                          invalid={false}
                          readOnly
                          onChange={() => {}}
                        />
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              )}
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
            </CardContent>
          </Card>
        </article>
      ))}
    </div>
  )
}
