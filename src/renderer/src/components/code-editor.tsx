import { useLayoutEffect, useRef } from 'react'
import { basicSetup } from 'codemirror'
import { Compartment, EditorState, type Extension } from '@codemirror/state'
import { EditorView, keymap, placeholder } from '@codemirror/view'
import { indentWithTab } from '@codemirror/commands'
import { HighlightStyle, indentUnit, syntaxHighlighting } from '@codemirror/language'
import { javascript } from '@codemirror/lang-javascript'
import { json } from '@codemirror/lang-json'
import { css } from '@codemirror/lang-css'
import { html } from '@codemirror/lang-html'
import { python } from '@codemirror/lang-python'
import { sql } from '@codemirror/lang-sql'
import { tags } from '@lezer/highlight'
import type { Locale } from '../../../shared/model'

function languageExtension(language: string): Extension {
  switch (language.toLowerCase()) {
    case 'js':
    case 'javascript':
      return javascript()
    case 'ts':
    case 'typescript':
      return javascript({ typescript: true })
    case 'jsx':
      return javascript({ jsx: true })
    case 'tsx':
      return javascript({ typescript: true, jsx: true })
    case 'python':
    case 'py':
      return python()
    case 'sql':
      return sql()
    case 'json':
      return json()
    case 'html':
      return html()
    case 'css':
      return css()
    default:
      return []
  }
}

const highlighting = HighlightStyle.define([
  { tag: [tags.keyword, tags.modifier, tags.operatorKeyword], color: 'var(--primary)' },
  { tag: [tags.string, tags.regexp], color: 'var(--code-string)' },
  { tag: [tags.number, tags.bool, tags.null], color: 'var(--code-number)' },
  {
    tag: [tags.function(tags.variableName), tags.typeName, tags.className],
    color: 'var(--code-function)'
  },
  { tag: tags.comment, color: 'var(--muted-foreground)', fontStyle: 'italic' },
  { tag: [tags.tagName, tags.attributeName], color: 'var(--code-function)' }
])

export function CodeEditor({
  id,
  value,
  language,
  label,
  hint,
  locale,
  invalid,
  describedBy,
  onChange,
  readOnly = false
}: {
  id: string
  value: string
  language: string
  label: string
  hint: string
  locale: Locale
  invalid: boolean
  describedBy?: string
  readOnly?: boolean
  onChange: (value: string) => void
}): React.JSX.Element {
  const host = useRef<HTMLDivElement>(null)
  const editor = useRef<EditorView | null>(null)
  const initial = useRef({ value, language, hint })
  const onChangeRef = useRef(onChange)
  const languageConfig = useRef(new Compartment())
  const attributesConfig = useRef(new Compartment())
  const phrasesConfig = useRef(new Compartment())

  useLayoutEffect(() => {
    onChangeRef.current = onChange
  }, [onChange])
  useLayoutEffect(() => {
    if (!host.current) return
    const view = new EditorView({
      parent: host.current,
      state: EditorState.create({
        doc: initial.current.value,
        extensions: [
          basicSetup,
          EditorState.readOnly.of(readOnly),
          EditorView.editable.of(!readOnly),
          keymap.of([indentWithTab]),
          indentUnit.of('  '),
          languageConfig.current.of(languageExtension(initial.current.language)),
          attributesConfig.current.of([]),
          phrasesConfig.current.of([]),
          placeholder(initial.current.hint),
          syntaxHighlighting(highlighting),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) onChangeRef.current(update.state.doc.toString())
          })
        ]
      })
    })
    editor.current = view
    return () => {
      editor.current = null
      view.destroy()
    }
  }, [id, readOnly])
  useLayoutEffect(() => {
    const view = editor.current
    if (view && view.state.doc.toString() !== value)
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: value } })
  }, [value])
  useLayoutEffect(() => {
    editor.current?.dispatch({
      effects: languageConfig.current.reconfigure(languageExtension(language))
    })
  }, [language])
  useLayoutEffect(() => {
    editor.current?.dispatch({
      effects: phrasesConfig.current.reconfigure(
        EditorState.phrases.of(
          locale === 'zh-CN'
            ? {
                Find: '查找',
                Replace: '替换',
                next: '下一个',
                previous: '上一个',
                all: '全选',
                'match case': '区分大小写',
                regexp: '正则',
                'by word': '全词匹配',
                replace: '替换',
                'replace all': '全部替换',
                close: '关闭',
                'Go to line': '跳转到行',
                go: '跳转',
                'Fold line': '折叠行',
                'Unfold line': '展开行'
              }
            : {}
        )
      )
    })
  }, [locale])
  useLayoutEffect(() => {
    editor.current?.dispatch({
      effects: attributesConfig.current.reconfigure(
        EditorView.contentAttributes.of({
          id,
          role: 'textbox',
          'aria-label': label,
          'aria-multiline': 'true',
          'aria-readonly': String(readOnly),
          'aria-invalid': String(invalid),
          ...(describedBy ? { 'aria-describedby': describedBy } : {})
        })
      )
    })
  }, [id, label, invalid, describedBy, readOnly])

  return <div ref={host} className="code-editor" data-invalid={invalid || undefined} />
}
