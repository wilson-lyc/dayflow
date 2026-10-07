import type { ReactNode } from 'react'
import { ResponsiveSplit, notesMinWidth, reportMinWidth } from './responsive-split'

export function HomePage({
  notes,
  report,
  resizeLabel = 'Resize panels'
}: {
  notes: ReactNode
  report?: ReactNode
  resizeLabel?: string
}): React.JSX.Element {
  return report ? (
    <ResponsiveSplit
      primaryMinWidth={notesMinWidth}
      secondaryMinWidth={reportMinWidth}
      resizeLabel={resizeLabel}
      primary={() => <div className="home-block">{notes}</div>}
      className="home-layout"
      secondary={<div className="home-block home-report">{report}</div>}
    />
  ) : (
    <div className="home-layout">
      <div className="home-block">{notes}</div>
    </div>
  )
}
