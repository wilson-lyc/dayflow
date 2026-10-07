import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react'
import { Editor, InlineToolbarPlugin, StaticToolbarPlugin } from '@textbus/xnote'
import { History } from '@textbus/core'
import type { Locale } from '../../../shared/model'
import { translator } from '../lib/i18n'

type DocumentState = Exclude<
  NonNullable<ConstructorParameters<typeof Editor>[0]>['content'],
  string | undefined
>

function documentState(content: string): DocumentState | undefined {
  if (!content) return undefined
  const value = JSON.parse(content)
  if (value.name !== 'RootComponent' || !value.state?.content) throw new Error('Invalid document')
  return value.state
}

function subscribeTheme(onChange: () => void): () => void {
  const observer = new MutationObserver(onChange)
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
  return () => observer.disconnect()
}
function isDark(): boolean {
  return document.documentElement.classList.contains('dark')
}

export function DailyReportRichEditor({
  content,
  locale,
  locked,
  onChange,
  onSave,
  onFailure
}: {
  content: string
  locale: Locale
  locked: boolean
  onChange: (content: string) => void
  onSave?: () => void
  onFailure: () => void
}): React.JSX.Element {
  const root = useRef<HTMLDivElement>(null)
  const toolbar = useRef<HTMLDivElement>(null)
  const instance = useRef<Editor | null>(null)
  const latest = useRef({ content, locked, onChange, onSave, onFailure })
  const applied = useRef(content)
  const baseline = useRef('')
  const [ready, setReady] = useState(false)
  const dark = useSyncExternalStore(subscribeTheme, isDark)
  const t = translator(locale)

  useLayoutEffect(() => {
    latest.current = { content, locked, onChange, onSave, onFailure }
  })

  useEffect(() => {
    const host = document.createElement('div')
    root.current!.appendChild(host)
    const theme = dark ? 'dark' : 'light'
    let disposed = false
    let changeSubscription: { unsubscribe: () => void } | undefined
    let saveSubscription: { unsubscribe: () => void } | undefined
    let editor: Editor | undefined
    try {
      editor = new Editor({
        content: documentState(latest.current.content),
        locale,
        readonly: latest.current.locked,
        zenCoding: true,
        viewOptions: { autoFocus: false, minHeight: '100%' },
        plugins: [
          new StaticToolbarPlugin({ host: toolbar.current!, theme }),
          new InlineToolbarPlugin({ theme })
        ]
      })
      const current = editor
      const initial = latest.current.content
      void current
        .mount(host)
        .then(() => {
          if (disposed) {
            current.destroy()
            return
          }
          instance.current = current
          applied.current = initial
          if (latest.current.content !== initial)
            current.setContent(documentState(latest.current.content) ?? '<p></p>')
          applied.current = latest.current.content
          current.readonly = latest.current.locked
          // Compare native documents, so initialization and external updates never
          // mark an untouched report dirty.
          baseline.current = JSON.stringify(current.getJSON())
          changeSubscription = current.onChange.subscribe(() => {
            const value = JSON.stringify(current.getJSON())
            if (value === baseline.current || disposed) return
            baseline.current = value
            applied.current = value
            latest.current.onChange(value)
          })
          saveSubscription = current.onSave.subscribe(() => latest.current.onSave?.())
          setReady(true)
        })
        .catch(() => {
          if (!disposed) latest.current.onFailure()
        })
    } catch {
      latest.current.onFailure()
    }
    return () => {
      disposed = true
      changeSubscription?.unsubscribe()
      saveSubscription?.unsubscribe()
      instance.current = null
      if (editor?.isReady && !editor.destroyed) editor.destroy()
      host.remove()
    }
  }, [locale, dark])

  useLayoutEffect(() => {
    const editor = instance.current
    if (!editor || !ready) return
    editor.readonly = locked
    if (content === applied.current) return
    applied.current = content
    editor.setContent(documentState(content) ?? '<p></p>')
    baseline.current = JSON.stringify(editor.getJSON())
    editor.get(History).clear()
  }, [content, locked, ready])

  return (
    <div className="report-textbus" aria-label={t('reportEdit')} aria-busy={!ready}>
      <div className="report-textbus-toolbar" ref={toolbar} />
      <div className="report-textbus-body" ref={root} />
    </div>
  )
}
