import type { ReactNode } from 'react'
import type { Locale } from '../../../shared/model'
import { translator } from '../lib/i18n'
import { Card } from './ui/card'
import { Button } from './ui/button'

export type SettingsModule = 'general' | 'note' | 'report' | 'trash' | 'llm'

export function SettingsPage({
  locale,
  active,
  onChange,
  contents,
  disabled = false
}: {
  locale: Locale
  active: SettingsModule
  onChange: (module: SettingsModule) => void
  contents: Record<SettingsModule, ReactNode>
  disabled?: boolean
}): React.JSX.Element {
  const t = translator(locale)
  return (
    <div className="settings-page">
      <Card className="settings-layout">
        <nav className="settings-menu" aria-label={t('settings')}>
          <div className="settings-menu-group">
            {(['general', 'note', 'report', 'llm'] as const).map((module) => (
              <Button
                key={module}
                variant={
                  active === module || (module === 'note' && active === 'trash')
                    ? 'secondary'
                    : 'ghost'
                }
                className="justify-start"
                disabled={disabled}
                aria-current={
                  active === module || (module === 'note' && active === 'trash')
                    ? 'page'
                    : undefined
                }
                onClick={() => onChange(module)}
              >
                {t(module)}
              </Button>
            ))}
          </div>
        </nav>
        <section className="settings-content" key={active} aria-labelledby="settings-heading">
          <div className="settings-content-inner">
            {active !== 'llm' && (
              <h1 id="settings-heading">{t(active === 'trash' ? 'note' : active)}</h1>
            )}
            {contents[active]}
          </div>
        </section>
      </Card>
    </div>
  )
}
