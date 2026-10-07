import { useId, type Ref } from 'react'
import type { ErrorCode, Locale, NoteEnterAction } from '../../../shared/model'
import { localDate } from '../../../shared/model'
import { systemZone, type Draft } from '../lib/dates'
import { translator, errorKey } from '../lib/i18n'
import { validateQuickNote } from '../lib/quick-note'
import { DateTimePicker } from './date-time-picker'
import { NoteComposer } from './note-composer'

export type QuickNoteModuleProps = {
  enterAction: NoteEnterAction
  value: Draft
  locale: Locale
  now: number
  ready: boolean
  busy: boolean
  blocked?: boolean
  pendingEditable: boolean
  error: ErrorCode | null
  inputRef?: Ref<HTMLTextAreaElement>
  onChange: (patch: Partial<Draft>) => void
  onSubmit: () => void
}

export function QuickNoteModule({
  enterAction,
  value,
  locale,
  now,
  ready,
  busy,
  blocked = false,
  pendingEditable,
  error,
  inputRef,
  onChange,
  onSubmit
}: QuickNoteModuleProps): React.JSX.Element {
  const t = translator(locale)
  const inputId = useId()
  const wordCount = Array.from(value.content).length
  const invalid = validateQuickNote(value, now)
  const inputDisabled =
    busy || blocked || !ready || (value.pendingSubmission !== null && !pendingEditable)
  const sendDisabled = !ready || busy || blocked || !!invalid
  const errorText = error
    ? t(errorKey(error))
    : value.content && invalid && invalid !== 'empty' && invalid !== 'specifyTime'
      ? t(invalid)
      : null
  return (
    <NoteComposer
      resizeLabel={t('resizeComposer')}
      context={
        <DateTimePicker
          value={value}
          locale={locale}
          now={now}
          disabled={inputDisabled}
          onChange={onChange}
        />
      }
      status={
        wordCount >= 9000 ? (
          <span className="composer-length">{t('length', { n: wordCount })}</span>
        ) : null
      }
      error={errorText}
      errorId={`${inputId}-error`}
      actionLabel={t(
        busy
          ? 'saving'
          : error
            ? 'retry'
            : value.targetDate === localDate(now, systemZone())
              ? 'record'
              : 'backfill'
      )}
      busy={busy}
      disabled={sendDisabled}
      onSubmit={onSubmit}
    >
      <label htmlFor={inputId} className="sr-only">
        {t('content')}
      </label>
      <textarea
        ref={inputRef}
        id={inputId}
        value={value.content}
        placeholder={t('placeholder')}
        disabled={inputDisabled}
        aria-invalid={wordCount > 10000}
        aria-describedby={errorText ? `${inputId}-error` : undefined}
        onChange={(event) => onChange({ content: event.target.value })}
        onKeyDown={(event) => {
          if (
            event.key !== 'Enter' ||
            event.nativeEvent.isComposing ||
            event.nativeEvent.keyCode === 229 ||
            event.altKey ||
            event.shiftKey
          )
            return
          const modified = event.metaKey || event.ctrlKey
          const shouldSend = enterAction === 'send' ? !modified : modified
          if (shouldSend) {
            event.preventDefault()
            if (!sendDisabled && !event.repeat) onSubmit()
          } else if (modified) {
            event.preventDefault()
            const input = event.currentTarget
            const start = input.selectionStart
            const end = input.selectionEnd
            onChange({ content: value.content.slice(0, start) + '\n' + value.content.slice(end) })
            requestAnimationFrame(() => input.setSelectionRange(start + 1, start + 1))
          }
        }}
        className="composer-textarea"
      />
    </NoteComposer>
  )
}
