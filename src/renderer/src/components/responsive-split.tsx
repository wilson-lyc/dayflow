import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from './ui/resizable'

// Include the handle so neither panel falls below its minimum at the breakpoint.
const handleWidth = 8
export const reportMinWidth = 360
export const notesMinWidth = 400
export const previewMinWidth = 320

export function ResponsiveSplit({
  primary,
  secondary,
  primaryMinWidth,
  secondaryMinWidth,
  resizeLabel,
  className,
  onSecondaryVisibleChange,
  secondaryVisible = null
}: {
  primary: (secondaryShown: boolean) => ReactNode
  secondary: ReactNode
  primaryMinWidth: number
  secondaryMinWidth: number
  resizeLabel: string
  className?: string
  onSecondaryVisibleChange?: (visible: boolean) => void
  secondaryVisible?: boolean | null
}): React.JSX.Element {
  const container = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  const [layout, setLayout] = useState<Record<string, number> | undefined>()
  const minimum = primaryMinWidth + secondaryMinWidth + handleWidth
  const shown = secondaryVisible ?? width >= minimum
  useLayoutEffect(() => {
    onSecondaryVisibleChange?.(shown)
  }, [shown, onSecondaryVisibleChange])
  useLayoutEffect(() => {
    const element = container.current
    if (!element) return
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width))
    observer.observe(element)
    return () => observer.disconnect()
  }, [])
  useLayoutEffect(() => {
    // Opening preview on a narrow window brings it into view without shrinking the editor.
    if (shown && width > 0 && width < minimum) {
      container.current?.scrollTo({ left: minimum - width })
    } else container.current?.scrollTo({ left: 0 })
  }, [shown, width, minimum])
  return (
    <div ref={container} className={['responsive-split', className].filter(Boolean).join(' ')}>
      {shown ? (
        <ResizablePanelGroup
          orientation="horizontal"
          style={{ minWidth: minimum }}
          defaultLayout={layout}
          onLayoutChanged={setLayout}
        >
          <ResizablePanel id="primary" minSize={primaryMinWidth} defaultSize="50%">
            {primary(shown)}
          </ResizablePanel>
          <ResizableHandle aria-label={resizeLabel} />
          <ResizablePanel id="secondary" minSize={secondaryMinWidth} defaultSize="50%">
            {secondary}
          </ResizablePanel>
        </ResizablePanelGroup>
      ) : (
        <div className="split-single">{primary(shown)}</div>
      )}
    </div>
  )
}
