import { useId, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { ArrowUp, LoaderCircle } from 'lucide-react'
import { Button } from './ui/button'

type NoteComposerProps = {
  context: ReactNode
  children: ReactNode
  status?: ReactNode
  error?: string | null
  errorId?: string
  actionLabel: string
  resizeLabel: string
  busy: boolean
  disabled: boolean
  onSubmit: () => void
}

export function NoteComposer({
  context,
  children,
  status,
  error,
  errorId,
  actionLabel,
  resizeLabel,
  busy,
  disabled,
  onSubmit
}: NoteComposerProps): React.JSX.Element {
  const generatedErrorId = useId()
  const surfaceRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ y: number; height: number } | null>(null)
  const [height, setHeight] = useState<number | null>(null)
  const [dragging, setDragging] = useState(false)

  function resize(next: number): void {
    setHeight(Math.max(40, Math.min(next, Math.min(420, window.innerHeight * 0.6 - 120))))
  }

  return (
    <footer className="composer">
      <div className="composer-inner">
        <div
          ref={surfaceRef}
          className="composer-surface"
          data-invalid={error ? true : undefined}
          data-resizing={dragging ? true : undefined}
          data-resized={height !== null ? true : undefined}
          style={
            height === null ? undefined : ({ '--composer-height': `${height}px` } as CSSProperties)
          }
        >
          <Button
            variant="ghost"
            size="icon-xs"
            className="composer-resize"
            aria-label={resizeLabel}
            title={resizeLabel}
            onPointerDown={(event) => {
              if (event.button !== 0) return
              const textarea = surfaceRef.current?.querySelector('textarea')
              if (!textarea) return
              event.preventDefault()
              dragRef.current = {
                y: event.clientY,
                height: textarea.getBoundingClientRect().height
              }
              event.currentTarget.setPointerCapture(event.pointerId)
              setDragging(true)
            }}
            onPointerMove={(event) => {
              const start = dragRef.current
              if (start) resize(start.height + start.y - event.clientY)
            }}
            onPointerUp={(event) => {
              if (event.currentTarget.hasPointerCapture(event.pointerId))
                event.currentTarget.releasePointerCapture(event.pointerId)
              dragRef.current = null
              setDragging(false)
            }}
            onLostPointerCapture={() => {
              dragRef.current = null
              setDragging(false)
            }}
            onPointerCancel={() => {
              dragRef.current = null
              setDragging(false)
            }}
            onKeyDown={(event) => {
              if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return
              event.preventDefault()
              const current = surfaceRef.current
                ?.querySelector('textarea')
                ?.getBoundingClientRect().height
              if (current !== undefined) resize(current + (event.key === 'ArrowUp' ? 20 : -20))
            }}
          />
          {children}
          {error && (
            <p id={errorId ?? generatedErrorId} className="composer-error" role="alert">
              {error}
            </p>
          )}
          <div className="composer-bottom">
            {context}
            {status}
            <button
              type="button"
              className="composer-send"
              aria-label={actionLabel}
              title={actionLabel}
              aria-busy={busy}
              disabled={disabled}
              onClick={onSubmit}
            >
              {busy ? <LoaderCircle className="animate-spin" /> : <ArrowUp />}
            </button>
          </div>
        </div>
      </div>
    </footer>
  )
}
