import type { ReactNode } from 'react'
import type { Locale } from '../../../shared/model'
import { translator } from '../lib/i18n'
import { Button } from './ui/button'

export type SettingsModule = 'general' | 'appearance' | 'trash'

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
    <div className="settings-layout">
      <aside className="settings-menu">
        <span className="menu-group">{t('application')}</span>
        {(['general', 'appearance', 'trash'] as const).map((module) => (
          <Button
            key={module}
            variant={active === module ? 'secondary' : 'ghost'}
            className="justify-start"
            disabled={disabled}
            aria-current={active === module ? 'page' : undefined}
            onClick={() => onChange(module)}
          >
            {t(module)}
          </Button>
        ))}
      </aside>
      <section className="settings-content" key={active}>
        <h1>{t(active)}</h1>
        {contents[active]}
      </section>
    </div>
  )
}
