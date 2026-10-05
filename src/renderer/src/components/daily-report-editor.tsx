import { useMemo, useRef, useSyncExternalStore, type ReactNode } from 'react'
import CodeMirror, { EditorView, keymap, type ReactCodeMirrorRef } from '@uiw/react-codemirror'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import {
  Bold,
  Italic,
  Heading2,
  List,
  ListOrdered,
  ListTodo,
  Link,
  Quote,
  Code
} from 'lucide-react'
import type { Locale } from '../../../shared/model'
import { translator } from '../lib/i18n'
import { Button } from './ui/button'

export type DailyReportEditorProps = {
  content: string
  locale: Locale
  disabled?: boolean
  dirty: boolean
  onSave: () => void
  error?: 'read' | 'save' | null
  actions?: ReactNode
  onChange: (content: string) => void
  onRetry?: () => void
}

const formats = [
  { key: 'mdHeading', icon: Heading2, prefix: '## ' },
  { key: 'mdBold', icon: Bold, before: '**', after: '**' },
  { key: 'mdItalic', icon: Italic, before: '*', after: '*' },
  { key: 'mdList', icon: List, prefix: '- ' },
  { key: 'mdOrderedList', icon: ListOrdered, prefix: '1. ' },
  { key: 'mdTaskList', icon: ListTodo, prefix: '- [ ] ' },
  { key: 'mdLink', icon: Link, before: '[', after: '](https://)' },
  { key: 'mdQuote', icon: Quote, prefix: '> ' },
  { key: 'mdCode', icon: Code, before: '```\n', after: '\n```' }
] as const

type Format = (typeof formats)[number]

function subscribeTheme(onChange: () => void): () => void {
  const observer = new MutationObserver(onChange)
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
  return () => observer.disconnect()
}
function isDark(): boolean {
  return document.documentElement.classList.contains('dark')
}

const editorTheme = EditorView.theme({
  '&': { backgroundColor: 'var(--background)', color: 'var(--foreground)', height: '100%' },
  '&.cm-focused': { outline: 'none' },
  '.cm-scroller': { overflow: 'auto', fontFamily: 'inherit', lineHeight: '1.8' },
  '.cm-content': { padding: '12px 0', minHeight: '100%', caretColor: 'var(--foreground)' },
  '.cm-line': { padding: '0 16px' },
  '.cm-placeholder': { color: 'var(--muted-foreground)' },
  '.cm-cursor': { borderLeftColor: 'var(--foreground)' },
  '.cm-selectionBackground, &.cm-focused .cm-selectionBackground': {
    backgroundColor: 'color-mix(in srgb, var(--ring) 25%, transparent)'
  },
  '.cm-activeLine': { backgroundColor: 'var(--muted)' }
})

function applyFormat(view: EditorView, format: Format, locale: Locale): boolean {
  const { from, to } = view.state.selection.main
  const doc = view.state.doc
  if ('prefix' in format) {
    const first = doc.lineAt(from)
    const last = doc.lineAt(to > from ? to - 1 : to)
    const lines = doc.sliceString(first.from, last.to).split('\n')
    const text = lines
      .map(
        (line, index) =>
          `${format.key === 'mdOrderedList' ? `${index + 1}. ` : format.prefix}${line}`
      )
      .join('\n')
    view.dispatch({
      changes: { from: first.from, to: last.to, insert: text },
      selection: { anchor: first.from + format.prefix.length, head: first.from + text.length },
      scrollIntoView: true,
      userEvent: 'input'
    })
  } else {
    const text = doc.sliceString(from, to) || translator(locale)(format.key)
    const before =
      format.key === 'mdCode' && from > 0 && doc.sliceString(from - 1, from) !== '\n'
        ? `\n${format.before}`
        : format.before
    const after =
      format.key === 'mdCode' && to < doc.length && doc.sliceString(to, to + 1) !== '\n'
        ? `${format.after}\n`
        : format.after
    view.dispatch({
      changes: { from, to, insert: `${before}${text}${after}` },
      selection: { anchor: from + before.length, head: from + before.length + text.length },
      scrollIntoView: true,
      userEvent: 'input'
    })
  }
  view.focus()
  return true
}

export function DailyReportEditor({
  content,
  locale,
  disabled,
  dirty,
  onSave,
  error,
  actions,
  onChange,
  onRetry
}: DailyReportEditorProps): React.JSX.Element {
  const t = translator(locale)
  const editor = useRef<ReactCodeMirrorRef>(null)
  const dark = useSyncExternalStore(subscribeTheme, isDark)
  const locked = !!disabled || error === 'read'

  const extensions = useMemo(
    () => [
      markdown({ base: markdownLanguage }),
      EditorView.lineWrapping,
      editorTheme,
      EditorView.contentAttributes.of({ 'aria-label': translator(locale)('reportEdit') }),
      keymap.of([
        { key: 'Mod-b', run: (view) => !locked && applyFormat(view, formats[1], locale) },
        { key: 'Mod-i', run: (view) => !locked && applyFormat(view, formats[2], locale) }
      ])
    ],
    [locale, locked]
  )

  return (
    <section className="report-editor" aria-label={t('reportEdit')}>
      <div className="report-toolbar">
        <span className="font-medium">{t('report')}</span>
        <div className="report-actions">
          <span className="report-save-status" role="status">
            {t(dirty ? 'reportUnsaved' : 'reportSaved')}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={locked || !dirty}
            title={t('reportSaveShortcut')}
            onClick={onSave}
          >
            {t('save')}
          </Button>
          {actions}
        </div>
      </div>
      {error && (
        <div className="report-error" role="alert">
          <span>{t(error === 'read' ? 'reportReadError' : 'operationError')}</span>
          <Button variant="outline" size="sm" onClick={onRetry}>
            {t('retry')}
          </Button>
        </div>
      )}
      <div className="report-markdown-editor" data-disabled={locked || undefined}>
        <div className="report-format-toolbar" role="group" aria-label={t('mdFormatting')}>
          {formats.map((format) => (
            <Button
              key={format.key}
              variant="ghost"
              size="icon-sm"
              title={t(format.key)}
              aria-label={t(format.key)}
              disabled={locked}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                const view = editor.current?.view
                if (view && !locked) applyFormat(view, format, locale)
              }}
            >
              <format.icon />
            </Button>
          ))}
        </div>
        <CodeMirror
          ref={editor}
          value={content}
          className="report-code-editor"
          height="100%"
          theme={dark ? 'dark' : 'light'}
          editable={!locked}
          readOnly={locked}
          indentWithTab={false}
          placeholder={t('reportPlaceholder')}
          extensions={extensions}
          basicSetup={{ lineNumbers: false, foldGutter: false, highlightActiveLineGutter: false }}
          onChange={onChange}
        />
      </div>
    </section>
  )
}
