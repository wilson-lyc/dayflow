import { useId } from 'react'
import type { Locale, Preferences } from '../../../shared/model'
import { translator, languages } from '../lib/i18n'
import { Alert, AlertDescription } from './ui/alert'
import { Button } from './ui/button'
import { Field, FieldLabel } from './ui/field'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue
} from './ui/select'

export function PreferenceContent({
  module,
  locale,
  preferences,
  busy,
  error,
  onChange,
  onRetry
}: {
  module: 'general' | 'appearance'
  locale: Locale
  preferences: Preferences
  busy: boolean
  error: boolean
  onChange: (key: keyof Preferences, value: string) => void
  onRetry: () => void
}): React.JSX.Element {
  const id = useId()
  const t = translator(locale)
  return (
    <section className="settings-section">
      <h2>{t(module === 'general' ? 'interface' : 'appearance')}</h2>
      <div className="settings-row">
        <Field orientation="horizontal">
          <FieldLabel htmlFor={id}>{t(module === 'general' ? 'language' : 'theme')}</FieldLabel>
          <Select
            value={module === 'general' ? locale : preferences.themeMode}
            disabled={busy}
            onValueChange={(value) => {
              if (value) onChange(module === 'general' ? 'localePreference' : 'themeMode', value)
            }}
          >
            <SelectTrigger id={id} className="min-w-36">
              <SelectValue>
                {module === 'general'
                  ? languages.find((l) => l.code === locale)?.name
                  : t(preferences.themeMode)}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {module === 'general'
                  ? languages.map((language) => (
                      <SelectItem key={language.code} value={language.code}>
                        {language.name}
                      </SelectItem>
                    ))
                  : (['light', 'dark', 'system'] as const).map((mode) => (
                      <SelectItem key={mode} value={mode}>
                        {t(mode)}
                      </SelectItem>
                    ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>
      </div>
      {error && (
        <Alert variant="destructive">
          <AlertDescription>
            {t('preferenceError')}
            <Button variant="link" onClick={onRetry}>
              {t('retry')}
            </Button>
          </AlertDescription>
        </Alert>
      )}
    </section>
  )
}
