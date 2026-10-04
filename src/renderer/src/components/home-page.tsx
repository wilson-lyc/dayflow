import type { ReactNode, Ref } from 'react'

export function HomePage({
  notes,
  composer,
  children,
  listRef,
  loading = false
}: {
  notes: ReactNode
  composer?: ReactNode
  children?: ReactNode
  listRef?: Ref<HTMLDivElement>
  loading?: boolean
}): React.JSX.Element {
  return (
    <div className="home-page">
      <div ref={listRef} className="notes-scroll" aria-busy={loading}>
        <div className="notes-content">
          {children}
          {notes}
        </div>
      </div>
      {composer}
    </div>
  )
}
