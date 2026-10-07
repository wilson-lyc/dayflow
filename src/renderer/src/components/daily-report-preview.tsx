import type { ReactNode } from 'react'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { Locale } from '../../../shared/model'
import { translator } from '../lib/i18n'

export function DailyReportPreview({
  content,
  locale,
  actions
}: {
  content: string
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
        <div className="report-markdown-content">
          <Markdown remarkPlugins={[remarkGfm]} skipHtml>
            {content}
          </Markdown>
        </div>
      </article>
    </section>
  )
}
