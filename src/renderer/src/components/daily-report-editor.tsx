import { useState, type ReactNode } from 'react'
import { Save } from 'lucide-react'
import type { Locale } from '../../../shared/model'
import { translator } from '../lib/i18n'
import { Button } from './ui/button'
import { Alert, AlertDescription } from './ui/alert'
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip'
import { DailyReportRichEditor } from './daily-report-rich-editor'

export type DailyReportEditorProps = {
  content: string
  locale: Locale
  disabled?: boolean
  dirty: boolean
  onSave: () => void
  error?: 'read' | 'save' | 'conflict' | null
  actions?: ReactNode
  statusActions?: ReactNode
  showTitle?: boolean
  onChange: (content: string) => void
  onRetry?: () => void
}

export function DailyReportEditor({
  content,
  locale,
  disabled,
  dirty,
  onSave,
  error,
  actions,
  statusActions,
  showTitle = true,
  onChange,
  onRetry
}: DailyReportEditorProps): React.JSX.Element {
  const t = translator(locale)
  const [failed, setFailed] = useState(false)
  const locked = !!disabled || error === 'read'
  return (
    <section className="report-editor" aria-label={t('reportEdit')}>
      {showTitle && (
        <div className="report-toolbar">
          <span className="font-medium">{t('report')}</span>
          {actions}
        </div>
      )}
      {(error || failed) && (
        <Alert variant="destructive">
          <AlertDescription>
            {t(
              failed
                ? 'reportRichError'
                : error === 'read'
                  ? 'reportReadError'
                  : error === 'conflict'
                    ? 'reportConflict'
                    : 'operationError'
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setFailed(false)
                onRetry?.()
              }}
            >
              {t('retry')}
            </Button>
          </AlertDescription>
        </Alert>
      )}
      <div className="report-document-editor" data-disabled={locked || undefined}>
        {!failed && (
          <DailyReportRichEditor
            content={content}
            locale={locale}
            locked={locked}
            onChange={onChange}
            onSave={onSave}
            onFailure={() => setFailed(true)}
          />
        )}
        <div className="report-status-bar">
          <span role="status">{t(dirty ? 'reportUnsaved' : 'reportSaved')}</span>
          <div className="report-actions ml-auto">
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={t('save')}
                    disabled={locked || !dirty || failed}
                    onClick={onSave}
                  >
                    <Save data-icon="inline-start" />
                  </Button>
                }
              />
              <TooltipContent>{t('reportSaveShortcut')}</TooltipContent>
            </Tooltip>
            {statusActions}
          </div>
        </div>
      </div>
    </section>
  )
}
