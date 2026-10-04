import type { ReactNode } from 'react'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { Locale } from '../../../shared/model'
import { translator } from '../lib/i18n'

export function DailyReportPreview({
  content,
  date,
  locale,
  actions
}: {
  content: string
  date: string
  locale: Locale
  actions?: ReactNode
}): React.JSX.Element {
  const t = translator(locale)
  return (
    <section className="report-preview" aria-label={t('reportPreview')}>
      <div className="report-toolbar">
        <span className="font-medium">{t('reportPreview')}</span>
        {actions}
      </div>
      <article className="report-preview-content">
        <h1 className="report-preview-title">
          {t('report')} · {date}
        </h1>
        {content.trim() ? (
          <div className="report-markdown-content">
            <Markdown remarkPlugins={[remarkGfm]} skipHtml>
              {content}
            </Markdown>
          </div>
        ) : (
          <p className="text-muted-foreground">{t('reportEmpty')}</p>
        )}
      </article>
    </section>
  )
}
