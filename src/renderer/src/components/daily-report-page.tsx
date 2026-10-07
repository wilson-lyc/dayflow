import { useState } from 'react'
import { translator } from '../lib/i18n'
import { Button } from './ui/button'
import { DailyReportEditor, type DailyReportEditorProps } from './daily-report-editor'
import { DailyReportPreview } from './daily-report-preview'
import { ResponsiveSplit, reportMinWidth, previewMinWidth } from './responsive-split'

export function DailyReportPage({
  date,
  ...editorProps
}: DailyReportEditorProps & {
  date: string
}): React.JSX.Element {
  const t = translator(editorProps.locale)
  const [previewVisible, setPreviewVisible] = useState<boolean | null>(null)
  return (
    <ResponsiveSplit
      className="daily-report-page"
      primaryMinWidth={reportMinWidth}
      secondaryMinWidth={previewMinWidth}
      secondaryVisible={previewVisible}
      resizeLabel={t('resizeReportPreview')}
      primary={(shown) => (
        <DailyReportEditor
          {...editorProps}
          actions={
            <Button
              variant="ghost"
              size="sm"
              aria-pressed={shown}
              onClick={() => setPreviewVisible(!shown)}
            >
              {t(shown ? 'hidePreview' : 'showPreview')}
            </Button>
          }
        />
      )}
      secondary={
        <DailyReportPreview
          content={editorProps.content}
          date={date}
          locale={editorProps.locale}
          actions={
            <Button variant="ghost" size="sm" onClick={() => setPreviewVisible(false)}>
              {t('close')}
            </Button>
          }
        />
      }
    />
  )
}
