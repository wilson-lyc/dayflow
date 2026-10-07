import { useId, type ReactNode } from 'react'
import {
  reportAutoSaveIntervals,
  type ReportAutoSaveInterval,
  type Locale,
  type Preferences
} from '../../../shared/model'
import { translator, languages, type MessageKey } from '../lib/i18n'
import { Alert, AlertDescription } from './ui/alert'
import { Button } from './ui/button'
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldTitle
} from './ui/field'
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
  onRetry,
  dataDirectory,
  migrating,
  storageError,
  onChangeDirectory,
  onOpenDirectory,
  children
}: {
  module: 'general' | 'report' | 'note'
  locale: Locale
  preferences: Preferences
  busy: boolean
  error: boolean
  onChange: (key: keyof Preferences, value: string) => void
  onRetry: () => void
  dataDirectory: string
  migrating: boolean
  storageError: MessageKey | null
  onChangeDirectory: () => void
  onOpenDirectory: () => void
  children?: ReactNode
}): React.JSX.Element {
  const id = useId()
  const t = translator(locale)
  return (
    <section className="settings-section">
      <FieldGroup className="settings-fields">
        {module === 'general' ? (
          <>
            <Field orientation="horizontal" className="settings-row" data-disabled={busy}>
              <FieldLabel htmlFor={`${id}-theme`}>{t('theme')}</FieldLabel>
              <Select
                value={preferences.themeMode}
                disabled={busy}
                onValueChange={(value) => {
                  if (value) onChange('themeMode', value)
                }}
              >
                <SelectTrigger id={`${id}-theme`} className="settings-control">
                  <SelectValue>{t(preferences.themeMode)}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {(['light', 'dark', 'system'] as const).map((mode) => (
                      <SelectItem key={mode} value={mode}>
                        {t(mode)}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
            <Field orientation="horizontal" className="settings-row" data-disabled={busy}>
              <FieldLabel htmlFor={`${id}-language`}>{t('language')}</FieldLabel>
              <Select
                value={locale}
                disabled={busy}
                onValueChange={(value) => {
                  if (value) onChange('localePreference', value)
                }}
              >
                <SelectTrigger id={`${id}-language`} className="settings-control">
                  <SelectValue>
                    {languages.find((language) => language.code === locale)?.name}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {languages.map((language) => (
                      <SelectItem key={language.code} value={language.code}>
                        {language.name}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
            <Field orientation="horizontal" className="settings-row" data-disabled={busy}>
              <FieldContent>
                <FieldTitle>{t('dataDirectory')}</FieldTitle>
                <FieldDescription className="break-all">{dataDirectory}</FieldDescription>
              </FieldContent>
              <div className="flex shrink-0 flex-wrap gap-2">
                <Button variant="ghost" disabled={busy} onClick={onOpenDirectory}>
                  {t('openFolder')}
                </Button>
                <Button variant="outline" disabled={busy} onClick={onChangeDirectory}>
                  {t(migrating ? 'migratingData' : 'changeFolder')}
                </Button>
              </div>
            </Field>
          </>
        ) : module === 'note' ? (
          <Field orientation="horizontal" className="settings-row" data-disabled={busy}>
            <FieldLabel htmlFor={`${id}-enter`}>{t('noteEnterAction')}</FieldLabel>
            <Select
              value={preferences.noteEnterAction}
              disabled={busy}
              onValueChange={(value) => {
                if (value) onChange('noteEnterAction', value)
              }}
            >
              <SelectTrigger id={`${id}-enter`} className="settings-control">
                <SelectValue>
                  {t(preferences.noteEnterAction === 'send' ? 'enterSend' : 'enterNewline')}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="send">{t('enterSend')}</SelectItem>
                  <SelectItem value="newline">{t('enterNewline')}</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
        ) : (
          <Field orientation="horizontal" className="settings-row" data-disabled={busy}>
            <FieldLabel htmlFor={`${id}-autosave`}>{t('reportAutoSave')}</FieldLabel>
            <Select
              value={preferences.reportAutoSaveInterval}
              disabled={busy}
              onValueChange={(value) => {
                if (value) onChange('reportAutoSaveInterval', value)
              }}
            >
              <SelectTrigger id={`${id}-autosave`} className="settings-control">
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
        )}
        {children}
      </FieldGroup>
      {module === 'general' && storageError && (
        <Alert variant="destructive">
          <AlertDescription>{t(storageError)}</AlertDescription>
        </Alert>
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
