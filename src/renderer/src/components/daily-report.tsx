import { useState } from 'react'
import { Code } from 'lucide-react'
import { DailyReportEditor, type DailyReportEditorProps } from './daily-report-editor'
import { DailyReportPreview } from './daily-report-preview'
import { Button } from './ui/button'
import { translator } from '../lib/i18n'

type DailyReportProps = Omit<DailyReportEditorProps, 'onPreview'>

export function DailyReport(editorProps: DailyReportProps): React.JSX.Element {
  const [preview, setPreview] = useState(false)
  const t = translator(editorProps.locale)

  return (
    <div className="h-full min-h-0 min-w-0">
      <div hidden={preview} className="h-full min-h-0">
        <DailyReportEditor {...editorProps} onPreview={() => setPreview(true)} />
      </div>
      {preview && (
        <DailyReportPreview
          content={editorProps.content}
          locale={editorProps.locale}
          actions={
            <Button
              variant="ghost"
              size="icon-sm"
              title={t('reportReturnEdit')}
              aria-label={t('reportReturnEdit')}
              onClick={() => setPreview(false)}
            >
              <Code data-icon="inline-start" />
            </Button>
          }
        />
      )}
    </div>
  )
}
