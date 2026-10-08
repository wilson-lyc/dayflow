import type { ReactNode } from 'react'
import { ResponsiveSplit, notesMinWidth, reportMinWidth } from './responsive-split'

export const homeMinimumWidth = notesMinWidth + reportMinWidth + 8 + 12

export function HomePage({
  notes,
  report,
  wide,
  activePage,
  resizeLabel
}: {
  notes: ReactNode
  report: ReactNode
  wide: boolean
  activePage: 'notes' | 'report'
  resizeLabel: string
}): React.JSX.Element {
  return wide ? (
    <ResponsiveSplit
      primaryMinWidth={notesMinWidth}
      secondaryMinWidth={reportMinWidth}
      secondaryVisible
      resizeLabel={resizeLabel}
      primary={() => <div className="home-block">{notes}</div>}
      className="home-layout"
      secondary={<div className="home-block home-report">{report}</div>}
    />
  ) : (
    <div className="home-layout">
      {activePage === 'notes' ? (
        <div className="home-block">{notes}</div>
      ) : (
        <div className="home-block home-report">{report}</div>
      )}
    </div>
  )
}
