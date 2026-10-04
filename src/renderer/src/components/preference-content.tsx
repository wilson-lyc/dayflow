import { useId } from 'react'
import {
  reportAutoSaveIntervals,
  type ReportAutoSaveInterval,
  type Locale,
  type Preferences
} from '../../../shared/model'
import { translator, languages, type MessageKey } from '../lib/i18n'
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

const autoSaveLabels: Record<ReportAutoSaveInterval, MessageKey> = {
  off: 'autoSaveOff',
  '10': 'autoSave10',
  '30': 'autoSave30',
  '60': 'autoSave60',
  '300': 'autoSave300'
}

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
      {module === 'general' && (
        <>
          <h2>{t('report')}</h2>
          <div className="settings-row">
            <Field orientation="horizontal">
              <FieldLabel htmlFor={`${id}-autosave`}>{t('reportAutoSave')}</FieldLabel>
              <Select
                value={preferences.reportAutoSaveInterval}
                disabled={busy}
                onValueChange={(value) => {
                  if (value) onChange('reportAutoSaveInterval', value)
                }}
              >
                <SelectTrigger id={`${id}-autosave`} className="min-w-36">
                  <SelectValue>{t(autoSaveLabels[preferences.reportAutoSaveInterval])}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {reportAutoSaveIntervals.map((interval) => (
                      <SelectItem key={interval} value={interval}>
                        {t(autoSaveLabels[interval])}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
          </div>
        </>
      )}
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
