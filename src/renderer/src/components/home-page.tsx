import type { ReactNode } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { ResponsiveSplit, notesMinWidth, reportMinWidth } from './responsive-split'

export function HomePage({
  notes,
  report,
  onReportVisibleChange,
  activeCard = 'notes',
  resizeLabel = 'Resize panels'
}: {
  notes: ReactNode
  report?: ReactNode
  onReportVisibleChange?: (visible: boolean) => void
  activeCard?: 'notes' | 'report'
  resizeLabel?: string
}): React.JSX.Element {
  const reducedMotion = useReducedMotion()
  return report ? (
    <ResponsiveSplit
      primaryMinWidth={notesMinWidth}
      secondaryMinWidth={reportMinWidth}
      resizeLabel={resizeLabel}
      onSecondaryVisibleChange={onReportVisibleChange}
      primary={(split) =>
        split ? (
          <div className="home-block">{notes}</div>
        ) : (
          <div className="home-card-viewport">
            <motion.div
              className="home-card-track"
              initial={false}
              animate={{ x: activeCard === 'report' ? '-100%' : '0%' }}
              transition={{ duration: reducedMotion ? 0 : 0.3, ease: [0.22, 1, 0.36, 1] }}
            >
              <div className="home-block" inert={activeCard !== 'notes'}>
                {notes}
              </div>
              <div className="home-block home-report" inert={activeCard !== 'report'}>
                {report}
              </div>
            </motion.div>
          </div>
        )
      }
      className="home-layout"
      secondary={<div className="home-block home-report">{report}</div>}
    />
  ) : (
    <div className="home-layout">
      <div className="home-block">{notes}</div>
    </div>
  )
}
