import { useLayoutEffect, useRef, useState } from 'react'
import { Button } from './ui/button'
import { translator } from '../lib/i18n'
import type { Locale } from '../../../shared/model'
import { cn } from '../lib/utils'
export function NoteBody({
  content,
  locale
}: {
  content: string
  locale: Locale
}): React.JSX.Element {
  const [expanded, setExpanded] = useState(false)
  const [long, setLong] = useState(false)
  const ref = useRef<HTMLParagraphElement>(null)
  useLayoutEffect(() => {
    const node = ref.current
    if (!node) return
    const measure = (): void => {
      setLong(node.scrollHeight > parseFloat(getComputedStyle(node).lineHeight) * 6 + 1)
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(node)
    return () => observer.disconnect()
  }, [content])
  const t = translator(locale)
  return (
    <div className="min-w-0">
      <p ref={ref} className={cn('note-text', !expanded && 'line-clamp-6')}>
        {content}
      </p>
      {long && (
        <Button
          size="sm"
          variant="link"
          onClick={() => setExpanded(!expanded)}
          aria-expanded={expanded}
        >
          {t(expanded ? 'collapse' : 'expand')}
        </Button>
      )}
    </div>
  )
}
