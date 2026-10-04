import type { ReactNode, Ref } from 'react'
import { ResponsiveSplit, notesMinWidth, reportMinWidth } from './responsive-split'

export function HomePage({
  notes,
  composer,
  children,
  listRef,
  loading = false,
  report,
  resizeLabel = 'Resize panels'
}: {
  notes: ReactNode
  composer?: ReactNode
  children?: ReactNode
  listRef?: Ref<HTMLDivElement>
  loading?: boolean
  report?: ReactNode
  resizeLabel?: string
}): React.JSX.Element {
  const quickNotes = (
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
  return report ? (
    <ResponsiveSplit
      primaryMinWidth={notesMinWidth}
      secondaryMinWidth={reportMinWidth}
      resizeLabel={resizeLabel}
      primary={() => quickNotes}
      secondary={report}
    />
  ) : (
    quickNotes
  )
}
