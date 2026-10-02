import type { ReactNode } from 'react'
import { ArrowUp, LoaderCircle } from 'lucide-react'

type NoteComposerProps = {
  context: ReactNode
  children: ReactNode
  status?: ReactNode
  error?: string | null
  actionLabel: string
  busy: boolean
  disabled: boolean
  onSubmit: () => void
}

export function NoteComposer({
  context,
  children,
  status,
  error,
  actionLabel,
  busy,
  disabled,
  onSubmit
}: NoteComposerProps): React.JSX.Element {
  return (
    <footer className="composer">
      <div className="composer-inner">
        <div className="composer-surface" data-invalid={error ? true : undefined}>
          {children}
          {error && (
            <p id="composer-error" className="composer-error" role="alert">
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
