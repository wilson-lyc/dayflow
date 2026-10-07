import { useRef, useState } from 'react'
import { Trash2 } from 'lucide-react'
import type { Locale } from '../../../shared/model'
import { DailyReportEditor } from './daily-report-editor'
import { Button } from './ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip'
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from './ui/empty'
import { translator } from '../lib/i18n'
import { Alert, AlertDescription } from './ui/alert'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter
} from './ui/alert-dialog'

export type DailyReportModuleProps = {
  content: string
  locale: Locale
  disabled?: boolean
  dirty: boolean
  error: 'read' | 'save' | 'conflict' | null
  onSave: () => void
  onChange: (content: string) => void
  onRetry: () => void
  exists: boolean
  loading: boolean
  creating: boolean
  createError: boolean
  onCreate: () => void
  deleting: boolean
  onDelete: () => Promise<boolean>
}

export function DailyReportModule({
  exists,
  loading,
  creating,
  createError,
  onCreate,
  deleting,
  onDelete,
  ...editorProps
}: DailyReportModuleProps): React.JSX.Element {
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleteFailed, setDeleteFailed] = useState(false)
  const cancelRef = useRef<HTMLButtonElement>(null)
  const t = translator(editorProps.locale)

  if (loading || editorProps.error === 'read' || !exists) {
    const readError = editorProps.error === 'read'
    return (
      <Empty className="h-full" aria-busy={loading || creating}>
        <EmptyHeader>
          <EmptyTitle>
            {t(loading ? 'loading' : readError ? 'reportReadError' : 'reportNotCreated')}
          </EmptyTitle>
          {!loading && !readError && createError && (
            <EmptyDescription role="alert">{t('reportCreateError')}</EmptyDescription>
          )}
        </EmptyHeader>
        {!loading && (
          <EmptyContent>
            {readError ? (
              <Button
                variant="outline"
                disabled={editorProps.disabled}
                onClick={editorProps.onRetry}
              >
                {t('retry')}
              </Button>
            ) : (
              <Button disabled={editorProps.disabled || creating} onClick={onCreate}>
                {t(creating ? 'reportCreating' : 'reportCreate')}
              </Button>
            )}
          </EmptyContent>
        )}
      </Empty>
    )
  }

  const deleteAction = (
    <Tooltip>
      <TooltipTrigger render={<span className="inline-flex" />}>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={t('reportDelete')}
          disabled={editorProps.disabled || deleting}
          onClick={() => {
            setDeleteFailed(false)
            setDeleteOpen(true)
          }}
        >
          <Trash2 data-icon="inline-start" />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{t('reportDelete')}</TooltipContent>
    </Tooltip>
  )

  return (
    <div className="h-full min-h-0 min-w-0">
      <DailyReportEditor
        {...editorProps}
        disabled={editorProps.disabled || deleteOpen}
        showTitle={false}
        statusActions={deleteAction}
      />
      <AlertDialog
        open={deleteOpen}
        onOpenChange={(open) => {
          if (!deleting) setDeleteOpen(open)
        }}
      >
        <AlertDialogContent initialFocus={cancelRef}>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('reportDeleteConfirm')}</AlertDialogTitle>
            <AlertDialogDescription>{t('reportDeleteHint')}</AlertDialogDescription>
          </AlertDialogHeader>
          {deleteFailed && (
            <Alert variant="destructive">
              <AlertDescription>
                {t(editorProps.error === 'conflict' ? 'reportConflict' : 'reportDeleteError')}
              </AlertDescription>
            </Alert>
          )}
          <AlertDialogFooter>
            <Button
              ref={cancelRef}
              variant="outline"
              disabled={deleting}
              onClick={() => setDeleteOpen(false)}
            >
              {t('cancel')}
            </Button>
            <Button
              variant="destructive"
              disabled={deleting || editorProps.disabled}
              onClick={async () => {
                setDeleteFailed(false)
                try {
                  if (await onDelete()) {
                    setDeleteOpen(false)
                  } else setDeleteFailed(true)
                } catch {
                  setDeleteFailed(true)
                }
              }}
            >
              {t(deleting ? 'reportDeleting' : 'reportDelete')}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
